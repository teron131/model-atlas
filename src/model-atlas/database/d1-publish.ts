/** Direct D1 refresh preserves source evidence, skips unchanged writes, and publishes the derived snapshot atomically. */

import { createHash } from "node:crypto";
import { benchmarkSnapshotCachesFromRows } from "../benchmarks/persistence/runtime";
import {
	BENCHMARK_OBSERVATION_BINDINGS,
	BENCHMARK_OBSERVATION_RAW_TABLE,
} from "../benchmarks/registry";
import { STAGE_CONFIG } from "../config";
import {
	artificialAnalysisEvaluationResourceRawCacheFromRows,
	artificialAnalysisRawCacheFromRows,
	modelsDevRawCacheFromRows,
	rawSourceCacheStatusFromRows,
	readBenchmarkObservationRawCache,
	readOpenRouterRawCache,
} from "../ingest/cache";
import type { CacheDbRow } from "../ingest/cache/rows";
import {
	isBenchmarkObservationRawSource,
	RAW_SOURCE_NAMES,
	RAW_SOURCE_TABLES,
	type RawSourceName,
	SNAPSHOT_TABLES,
} from "../ingest/source-registry";
import {
	refreshSourceSnapshots,
	type SourceSnapshotCaches,
} from "../ingest/source-snapshots/load";
import {
	type OpenRouterRawCache,
	refreshOpenRouterRawPayload,
} from "../ingest/source-snapshots/openrouter";
import { sourceRowStatesFromRows } from "../ingest/source-snapshots/policy";
import type { RawSourceCacheStatus } from "../ingest/types";
import { SnapshotRowCollector } from "../ingest/writers";
import type { CollectedTableRows } from "../ingest/writers/collector";
import type { SqlValue } from "../ingest/writers/database";
import { nowEpochSeconds } from "../runtime";
import { preserveHighSignalSnapshotModels } from "../stats/payload/snapshot-preservation";
import type { LlmStatsPayload } from "../stats/types";
import {
	d1Config,
	ensureD1Schema,
	missingD1Environment,
	queryD1Batch,
	queryD1BatchRows,
	readD1Payload,
} from "./d1";
import {
	buildPayloadFromRows,
	buildPayloadRows,
	PAYLOAD_ROW_GROUPS,
} from "./payload-rows";
import {
	quoteIdentifier,
	type SchemaReconciliationPlan,
} from "./schema-reconciliation";
import {
	deriveDatabaseSnapshot,
	writeDatabaseSnapshotRows,
} from "./snapshot-workflow";

const DERIVED_TABLES = [
	SNAPSHOT_TABLES.source_quarantines,
	SNAPSHOT_TABLES.source_health,
	SNAPSHOT_TABLES.models,
	SNAPSHOT_TABLES.model_evaluations,
	SNAPSHOT_TABLES.model_task_metrics,
	SNAPSHOT_TABLES.model_match_debug,
] as const;
const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;
const MAX_MATERIALIZED_PAYLOAD_BYTES = 1_900_000;

type D1PublishResult = {
	storage: "cloudflare_d1";
	database_id: string;
	model_count: number;
	fetched_at_epoch_seconds: number | null;
	published: boolean;
	changed_sources: RawSourceName[];
	statement_count: number;
	schema_statement_count: number;
	schema_changed_tables: string[];
	schema_removed_tables: string[];
	schema_changed_indexes: string[];
	schema_removed_indexes: string[];
};

type D1RefreshState = {
	rawRows: Record<RawSourceName, CacheDbRow[]>;
	sourceCaches: SourceSnapshotCaches;
	openRouterCache: OpenRouterRawCache;
	statuses: Record<RawSourceName, RawSourceCacheStatus>;
	previousSourceRowStates: ReturnType<typeof sourceRowStatesFromRows>;
	previousPayload: LlmStatsPayload | null;
};

type D1Publication = {
	result: D1PublishResult;
	payload: LlmStatsPayload;
};

/** Refreshes D1 directly and returns both publication diagnostics and the assembled payload. */
export async function publishD1Snapshot(): Promise<D1Publication> {
	const config = d1Config();
	if (config == null) {
		throw new Error(
			`Cloudflare D1 is not configured. Missing ${missingD1Environment().join(", ")}.`,
		);
	}
	const schema = await ensureD1Schema();
	const startedAtEpochSeconds = nowEpochSeconds();
	const replaceSourceRows = process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1";
	const current = await readD1RefreshState(startedAtEpochSeconds);
	const refreshed = await refreshSourceSnapshots(
		current.sourceCaches,
		current.statuses,
		current.previousSourceRowStates,
		startedAtEpochSeconds,
		STAGE_CONFIG.scoring,
		{
			replaceSourceRows,
		},
	);
	const derived = await deriveDatabaseSnapshot(
		startedAtEpochSeconds,
		refreshed.snapshots,
		refreshed.sourceCache,
		(modelIds) =>
			refreshOpenRouterRawPayload(
				current.openRouterCache,
				current.statuses.openrouter,
				modelIds,
				STAGE_CONFIG.openrouter.speedConcurrency,
				{
					replaceSourceRows,
				},
			),
	);
	let collector = collectDatabaseSnapshot(derived.rows);
	const previewPayload = payloadFromCollector(startedAtEpochSeconds, collector);
	const preservedPayload = replaceSourceRows
		? previewPayload
		: preserveHighSignalSnapshotModels(
				previewPayload,
				current.previousPayload,
				STAGE_CONFIG.snapshotPreservation,
				STAGE_CONFIG.scoring,
			);
	if (preservedPayload !== previewPayload) {
		derived.rows.finalModelRows = preservedPayload.models;
		collector = collectDatabaseSnapshot(derived.rows);
	}
	const changedSources = RAW_SOURCE_NAMES.filter(
		(source) =>
			tableContentHash(collectorRowsForSource(collector, source)) !==
			tableContentHash(current.rawRows[source]),
	);
	const nextPayload = payloadFromCollector(startedAtEpochSeconds, collector);
	if (
		schema.statements.length === 0 &&
		changedSources.length === 0 &&
		current.previousPayload != null &&
		publicContentHash(nextPayload) ===
			publicContentHash(current.previousPayload)
	) {
		const payload = {
			...current.previousPayload,
			metadata: {
				...current.previousPayload.metadata,
				source_health: derived.rows.sourceHealth,
			},
		};
		const queries = [
			...sourceHealthStatements(collector).map((sql) => ({ sql })),
			materializedPayloadQuery(payload),
		];
		await queryD1Batch(queries);
		return {
			result: publishResult(
				config.databaseId,
				payload,
				false,
				[],
				queries.length,
				schema,
			),
			payload,
		};
	}
	const completedAtEpochSeconds = nowEpochSeconds();
	const payload = payloadFromCollector(completedAtEpochSeconds, collector);
	const statements = publicationStatements(
		completedAtEpochSeconds,
		collector,
		changedSources,
	);
	const queries = [
		...statements.map((sql) => ({ sql })),
		materializedPayloadQuery(payload),
	];
	await queryD1Batch(queries);
	return {
		result: publishResult(
			config.databaseId,
			payload,
			true,
			changedSources,
			queries.length,
			schema,
		),
		payload,
	};
}

function publishResult(
	databaseId: string,
	payload: LlmStatsPayload,
	published: boolean,
	changedSources: RawSourceName[],
	statementCount: number,
	schema: SchemaReconciliationPlan,
): D1PublishResult {
	return {
		storage: "cloudflare_d1",
		database_id: databaseId,
		model_count: payload.models.length,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		published,
		changed_sources: changedSources,
		statement_count: statementCount,
		schema_statement_count: schema.statements.length,
		schema_changed_tables: schema.changedTables,
		schema_removed_tables: schema.removedTables,
		schema_changed_indexes: schema.changedIndexes,
		schema_removed_indexes: schema.removedIndexes,
	};
}

async function readD1RefreshState(
	nowEpochSeconds: number,
): Promise<D1RefreshState> {
	const rawRows = await readD1RawRows();
	const [previousSourceRows, previousPayload] = await Promise.all([
		queryD1BatchRows([
			{
				sql: "SELECT source, row_key, NULL AS row_label, 'quarantined_missing_from_source' AS status, missing_from_source_since_epoch_seconds FROM source_quarantines ORDER BY source, row_key",
			},
		]).then(([rows]) => rows ?? []),
		readD1Payload(),
	]);
	const previousHealth = previousPayload?.metadata.source_health?.sources;
	return {
		rawRows,
		sourceCaches: sourceCachesFromRows(rawRows),
		openRouterCache: readOpenRouterRawCache(rawRows.openrouter),
		statuses: Object.fromEntries(
			RAW_SOURCE_NAMES.map((source) => [
				source,
				rawSourceCacheStatusFromRows(
					source,
					rawRows[source],
					nowEpochSeconds,
					previousHealth?.[source],
				),
			]),
		) as Record<RawSourceName, RawSourceCacheStatus>,
		previousSourceRowStates: sourceRowStatesFromRows(previousSourceRows),
		previousPayload,
	};
}

async function readD1RawRows(): Promise<Record<RawSourceName, CacheDbRow[]>> {
	const directSources = RAW_SOURCE_NAMES.filter(
		(source) => !isBenchmarkObservationRawSource(source),
	);
	const rowGroups = await queryD1BatchRows([
		...directSources.map((source) => ({
			sql: `SELECT * FROM ${quoteIdentifier(RAW_SOURCE_TABLES[source])} ORDER BY row_index`,
		})),
		{
			sql: `SELECT * FROM ${quoteIdentifier(BENCHMARK_OBSERVATION_RAW_TABLE)} ORDER BY source_key, row_index`,
		},
	]);
	const directRows = new Map(
		directSources.map(
			(source, index) => [source, rowGroups[index] ?? []] as const,
		),
	);
	const sharedRows = rowGroups[directSources.length] ?? [];
	return Object.fromEntries(
		RAW_SOURCE_NAMES.map((source) => [
			source,
			(isBenchmarkObservationRawSource(source)
				? sharedRows.filter((row) => row.source_key === source)
				: (directRows.get(source) ?? [])) as CacheDbRow[],
		]),
	) as Record<RawSourceName, CacheDbRow[]>;
}

function sourceCachesFromRows(
	rows: Record<RawSourceName, CacheDbRow[]>,
): SourceSnapshotCaches {
	const benchmarkObservations = Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
			binding.sourceDataKey,
			readBenchmarkObservationRawCache(rows[binding.rawSourceKey], binding),
		]),
	);
	return {
		...benchmarkSnapshotCachesFromRows(rows),
		artificialAnalysis: artificialAnalysisRawCacheFromRows(
			rows.artificial_analysis,
		),
		artificialAnalysisEvaluationResources:
			artificialAnalysisEvaluationResourceRawCacheFromRows(
				rows.artificial_analysis_evaluation_resources,
			),
		modelsDev: modelsDevRawCacheFromRows(rows.models_dev),
		benchmarkObservations,
	};
}

function collectDatabaseSnapshot(
	rows: Parameters<typeof writeDatabaseSnapshotRows>[1],
): SnapshotRowCollector {
	const collector = new SnapshotRowCollector();
	writeDatabaseSnapshotRows(collector, rows);
	return collector;
}

/** Replaces only refresh metadata when source and derived content are unchanged. */
function sourceHealthStatements(collector: SnapshotRowCollector): string[] {
	const collected = collector.tables.get(SNAPSHOT_TABLES.source_health);
	if (collected == null) {
		return [];
	}
	return [
		`DELETE FROM ${quoteIdentifier(SNAPSHOT_TABLES.source_health)};`,
		...insertStatements(SNAPSHOT_TABLES.source_health, collected),
	];
}

function payloadFromCollector(
	fetchedAtEpochSeconds: number,
	collector: SnapshotRowCollector,
): LlmStatsPayload {
	return buildPayloadFromRows(
		buildPayloadRows(
			fetchedAtEpochSeconds,
			PAYLOAD_ROW_GROUPS.map(({ key, table, sourceKey }) => [
				key,
				collector
					.records(table)
					.filter((row) => sourceKey == null || row.source_key === sourceKey),
			]),
		),
	);
}

/** Store the completed public snapshot in the same atomic batch as its source rows. */
function materializedPayloadQuery(payload: LlmStatsPayload) {
	const payloadJson = JSON.stringify(payload);
	const payloadBytes = Buffer.byteLength(payloadJson);
	if (payloadBytes > MAX_MATERIALIZED_PAYLOAD_BYTES) {
		throw new Error(
			`Materialized D1 payload is ${payloadBytes} bytes; the ${MAX_MATERIALIZED_PAYLOAD_BYTES}-byte safety limit requires a storage redesign`,
		);
	}
	return {
		sql: "INSERT OR REPLACE INTO snapshot_payloads (snapshot_key, payload_json) VALUES ('public', ?)",
		params: [payloadJson],
	};
}

function publicationStatements(
	completedAtEpochSeconds: number,
	collector: SnapshotRowCollector,
	changedSources: RawSourceName[],
): string[] {
	const directChangedSources = changedSources.filter(
		(source) => !isBenchmarkObservationRawSource(source),
	);
	const observationChangedSources = changedSources.filter(
		isBenchmarkObservationRawSource,
	);
	return [
		...directChangedSources.map(
			(source) => `DELETE FROM ${quoteIdentifier(RAW_SOURCE_TABLES[source])};`,
		),
		...observationChangedSources.map(
			(source) =>
				`DELETE FROM ${quoteIdentifier(BENCHMARK_OBSERVATION_RAW_TABLE)} WHERE ${quoteIdentifier("source_key")} = ${sqlLiteral(source)};`,
		),
		...DERIVED_TABLES.map((table) => `DELETE FROM ${quoteIdentifier(table)};`),
		"DELETE FROM snapshot_metadata;",
		...directChangedSources.flatMap((source) =>
			insertStatements(
				RAW_SOURCE_TABLES[source],
				collector.tables.get(RAW_SOURCE_TABLES[source]),
			),
		),
		...observationChangedSources.flatMap((source) =>
			insertStatements(
				BENCHMARK_OBSERVATION_RAW_TABLE,
				collectedRowsForSource(collector, source),
			),
		),
		...DERIVED_TABLES.flatMap((table) =>
			insertStatements(table, collector.tables.get(table)),
		),
		`INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (${completedAtEpochSeconds});`,
	];
}

/** Select one logical source partition from the shared observation table. */
function collectedRowsForSource(
	collector: SnapshotRowCollector,
	source: RawSourceName,
): CollectedTableRows | undefined {
	const table = RAW_SOURCE_TABLES[source];
	const collected = collector.tables.get(table);
	if (collected == null || !isBenchmarkObservationRawSource(source)) {
		return collected;
	}
	const sourceKeyIndex = collected.columns.indexOf("source_key");
	if (sourceKeyIndex < 0) {
		throw new Error(`${table} is missing its source_key partition column`);
	}
	return {
		columns: collected.columns,
		rows: collected.rows.filter((row) => row[sourceKeyIndex] === source),
	};
}

/** Return collected source rows with shared score-table partitions isolated. */
function collectorRowsForSource(
	collector: SnapshotRowCollector,
	source: RawSourceName,
): Record<string, SqlValue>[] {
	const collected = collectedRowsForSource(collector, source);
	if (collected == null) {
		return [];
	}
	return collected.rows.map((values) =>
		Object.fromEntries(
			collected.columns.map((column, index) => [column, values[index] ?? null]),
		),
	);
}

function insertStatements(
	table: string,
	collected: CollectedTableRows | undefined,
): string[] {
	if (collected == null || collected.rows.length === 0) {
		return [];
	}
	const prefix = `INSERT INTO ${quoteIdentifier(table)} (${collected.columns.map(quoteIdentifier).join(", ")}) VALUES `;
	const statements: string[] = [];
	let chunk: string[] = [];
	let chunkLength = prefix.length;
	for (const row of collected.rows) {
		const valueSql = `(${row.map(sqlLiteral).join(", ")})`;
		const nextLength = chunkLength + valueSql.length + 2;
		if (
			chunk.length > 0 &&
			(chunk.length >= INSERT_ROWS_PER_STATEMENT ||
				nextLength > MAX_INSERT_STATEMENT_CHARS)
		) {
			statements.push(`${prefix}${chunk.join(", ")};`);
			chunk = [];
			chunkLength = prefix.length;
		}
		chunk.push(valueSql);
		chunkLength += valueSql.length + 2;
	}
	if (chunk.length > 0) {
		statements.push(`${prefix}${chunk.join(", ")};`);
	}
	return statements;
}

function tableContentHash(rows: readonly Record<string, unknown>[]): string {
	return stableHash(
		rows.map(({ row_index, fetched_at_epoch_seconds, ...row }) => row),
	);
}

function publicContentHash(payload: LlmStatsPayload): string {
	return stableHash({
		models: payload.models,
		deep_swe: payload.deep_swe,
		scoring: payload.metadata.scoring,
	});
}

function stableHash(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex");
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (value != null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)]),
		);
	}
	return value;
}

function sqlLiteral(value: SqlValue): string {
	if (value == null) {
		return "NULL";
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(value) : "NULL";
	}
	return `'${value.replaceAll("'", "''")}'`;
}
