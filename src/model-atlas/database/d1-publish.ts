/** Direct D1 refresh preserves source evidence, skips unchanged writes, and publishes derived runs atomically. */

import { createHash } from "node:crypto";

import { STAGE_CONFIG } from "../constants";
import { preserveHighSignalSnapshotModels } from "../stats/snapshot-preservation";
import type { LlmStatsPayload } from "../stats/types";
import { nowEpochSeconds } from "../utils";
import {
	artificialAnalysisEvaluationResourceRawCacheFromRows,
	artificialAnalysisRawCacheFromRows,
	modelsDevRawCacheFromRows,
	rawSourceCacheStatusFromRows,
	readAgentArenaRawCache,
	readAgentsLastExamRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readCursorBenchRawCache,
	readDeepSWERawCache,
	readGdpPdfRawCache,
	readOpenRouterRawCache,
	readRiemannBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readValsTerminalBenchRawCache,
	readVendingBench2RawCache,
} from "./cache";
import type { CacheDbRow } from "./cache/rows";
import {
	d1Config,
	ensureD1Schema,
	missingD1Environment,
	queryD1Batch,
	queryD1BatchRows,
	queryD1Rows,
	readD1Payload,
} from "./d1";
import { buildPayloadFromRows, type PayloadRows } from "./payload";
import { deriveDatabaseRun, writeDatabaseRunRows } from "./pipeline";
import { sourceRowStatesFromRows } from "./policy";
import type { SchemaReconciliationPlan } from "./schema";
import {
	refreshOpenRouterRawPayload,
	refreshSourceSnapshots,
	type SourceCaches,
} from "./sources";
import {
	DATABASE_PIPELINE_REVISION,
	RAW_SOURCE_CACHE_SECONDS,
	RAW_SOURCE_NAMES,
	RAW_SOURCE_TABLES,
	type RawSourceCacheStatus,
	type RawSourceName,
	SNAPSHOT_TABLES,
} from "./types";
import { SnapshotRowCollector } from "./writers";
import type { CollectedTableRows } from "./writers/collector";
import type { SqlValue } from "./writers/shared";

const DERIVED_TABLES = [
	SNAPSHOT_TABLES.source_row_states,
	SNAPSHOT_TABLES.source_health,
	SNAPSHOT_TABLES.model_stage_rows,
	SNAPSHOT_TABLES.model_match_debug,
] as const;
const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;

export type D1PublishResult = {
	storage: "cloudflare_d1";
	database_id: string;
	run_id: number;
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
	previousRunId: number;
	previousPipelineRevision: number | null;
	rawRows: Record<RawSourceName, CacheDbRow[]>;
	caches: SourceCaches;
	statuses: Record<RawSourceName, RawSourceCacheStatus>;
	previousSourceRowStates: ReturnType<typeof sourceRowStatesFromRows>;
	previousPayload: LlmStatsPayload | null;
};

export type D1Publication = {
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
	const startedAt = nowEpochSeconds();
	const replaceSourceRows = process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1";
	const reusableSnapshot = await readReusableFreshD1Snapshot(
		startedAt,
		schema,
		replaceSourceRows,
	);
	if (reusableSnapshot != null) {
		return {
			result: publishResult(
				config.databaseId,
				reusableSnapshot.payload,
				reusableSnapshot.runId,
				false,
				[],
				0,
				schema,
			),
			payload: reusableSnapshot.payload,
		};
	}
	const current = await readD1RefreshState(startedAt);
	const refreshed = await refreshSourceSnapshots(
		current.caches,
		current.statuses,
		current.previousSourceRowStates,
		startedAt,
		STAGE_CONFIG.scoring,
		{
			replaceSourceRows,
		},
	);
	const derived = await deriveDatabaseRun(
		startedAt,
		refreshed.snapshots,
		refreshed.sourceCache,
		(modelIds) =>
			refreshOpenRouterRawPayload(
				current.caches.openRouter,
				current.statuses.openrouter,
				modelIds,
				STAGE_CONFIG.openrouter.speedConcurrency,
				{
					replaceSourceRows,
				},
			),
	);
	const runId = current.previousRunId + 1;
	let collector = collectDatabaseRun(runId, derived.rows);
	const previewPayload = payloadFromCollector(runId, startedAt, collector);
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
		collector = collectDatabaseRun(runId, derived.rows);
	}
	const changedSources = RAW_SOURCE_NAMES.filter(
		(source) =>
			tableContentHash(collector.records(RAW_SOURCE_TABLES[source])) !==
			tableContentHash(current.rawRows[source]),
	);
	const nextPayload = payloadFromCollector(runId, startedAt, collector);
	if (
		schema.statements.length === 0 &&
		current.previousPipelineRevision === DATABASE_PIPELINE_REVISION &&
		changedSources.length === 0 &&
		current.previousPayload != null &&
		publicContentHash(nextPayload) ===
			publicContentHash(current.previousPayload)
	) {
		const statements = sourceHealthStatements(current.previousRunId, collector);
		await queryD1Batch(statements.map((sql) => ({ sql })));
		const payload = withSourceHealth(
			current.previousPayload,
			derived.rows.sourceHealth,
		);
		return {
			result: publishResult(
				config.databaseId,
				payload,
				current.previousRunId,
				false,
				[],
				statements.length,
				schema,
			),
			payload,
		};
	}
	const completedAt = nowEpochSeconds();
	const statements = publicationStatements(
		runId,
		derived.rows.startedAt,
		completedAt,
		collector,
		changedSources,
	);
	await queryD1Batch(statements.map((sql) => ({ sql })));
	const payload = payloadFromCollector(runId, completedAt, collector);
	return {
		result: publishResult(
			config.databaseId,
			payload,
			runId,
			true,
			changedSources,
			statements.length,
			schema,
		),
		payload,
	};
}

/** Reuses the completed payload only when every source and the derivation contract are still current. */
async function readReusableFreshD1Snapshot(
	currentEpochSeconds: number,
	schema: SchemaReconciliationPlan,
	replaceSourceRows: boolean,
): Promise<{ runId: number; payload: LlmStatsPayload } | null> {
	if (schema.statements.length > 0 || replaceSourceRows) {
		return null;
	}
	const [state] = await queryD1Rows(
		`SELECT
			p.id,
			p.pipeline_revision,
			COUNT(DISTINCT h.source) AS source_count,
			COUNT(DISTINCT CASE
				WHEN h.status IN ('cache_hit', 'fresh')
					AND h.source_input_count > 0
					AND h.last_fetch_epoch_seconds BETWEEN ? AND ?
				THEN h.source
			END) AS fresh_source_count
		FROM pipeline_runs p
		LEFT JOIN source_health h ON h.run_id = p.id
		WHERE p.id = (
			SELECT MAX(id) FROM pipeline_runs
			WHERE completed_at_epoch_seconds IS NOT NULL
		)
		GROUP BY p.id, p.pipeline_revision`,
		[currentEpochSeconds - RAW_SOURCE_CACHE_SECONDS, currentEpochSeconds],
	);
	const runId = Number(state?.id);
	if (
		!Number.isInteger(runId) ||
		Number(state?.pipeline_revision) !== DATABASE_PIPELINE_REVISION ||
		Number(state?.source_count) !== RAW_SOURCE_NAMES.length ||
		Number(state?.fresh_source_count) !== RAW_SOURCE_NAMES.length
	) {
		return null;
	}
	const payload = await readD1Payload();
	return payload == null ? null : { runId, payload };
}

function publishResult(
	databaseId: string,
	payload: LlmStatsPayload,
	runId: number,
	published: boolean,
	changedSources: RawSourceName[],
	statementCount: number,
	schema: SchemaReconciliationPlan,
): D1PublishResult {
	return {
		storage: "cloudflare_d1",
		database_id: databaseId,
		run_id: runId,
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

async function readD1RefreshState(now: number): Promise<D1RefreshState> {
	const rawRows = await readD1RawRows();
	const [previousRows, previousPayload] = await Promise.all([
		queryD1BatchRows([
			{
				sql: "SELECT source, row_key, row_label, status, missing_from_source_since_epoch_seconds FROM source_row_states WHERE run_id = (SELECT MAX(run_id) FROM source_row_states) ORDER BY row_index",
			},
			{
				sql: "SELECT id AS max_id, pipeline_revision FROM pipeline_runs ORDER BY id DESC LIMIT 1",
			},
		]),
		readD1Payload(),
	]);
	const previousSourceRows = previousRows[0] ?? [];
	const previousRunId = Number(previousRows[1]?.[0]?.max_id ?? 0);
	const previousPipelineRevision = Number.isFinite(
		Number(previousRows[1]?.[0]?.pipeline_revision),
	)
		? Number(previousRows[1]?.[0]?.pipeline_revision)
		: null;
	const previousHealth = previousPayload?.metadata.source_health?.sources;
	return {
		previousRunId,
		previousPipelineRevision,
		rawRows,
		caches: sourceCachesFromRows(rawRows),
		statuses: Object.fromEntries(
			RAW_SOURCE_NAMES.map((source) => [
				source,
				rawSourceCacheStatusFromRows(
					source,
					rawRows[source],
					now,
					previousHealth?.[source],
				),
			]),
		) as Record<RawSourceName, RawSourceCacheStatus>,
		previousSourceRowStates: sourceRowStatesFromRows(previousSourceRows),
		previousPayload,
	};
}

async function readD1RawRows(): Promise<Record<RawSourceName, CacheDbRow[]>> {
	const rowGroups = await queryD1BatchRows(
		RAW_SOURCE_NAMES.map((source) => {
			const table = RAW_SOURCE_TABLES[source];
			return {
				sql: `SELECT * FROM ${quoteIdentifier(table)} WHERE run_id = (SELECT MAX(run_id) FROM ${quoteIdentifier(table)}) ORDER BY row_index`,
			};
		}),
	);
	return Object.fromEntries(
		RAW_SOURCE_NAMES.map((source, index) => [
			source,
			(rowGroups[index] ?? []) as CacheDbRow[],
		]),
	) as Record<RawSourceName, CacheDbRow[]>;
}

function sourceCachesFromRows(
	rows: Record<RawSourceName, CacheDbRow[]>,
): SourceCaches {
	return {
		agentArena: readAgentArenaRawCache(rows.agent_arena),
		artificialAnalysis: artificialAnalysisRawCacheFromRows(
			rows.artificial_analysis,
		),
		artificialAnalysisEvaluationResources:
			artificialAnalysisEvaluationResourceRawCacheFromRows(
				rows.artificial_analysis_evaluation_resources,
			),
		modelsDev: modelsDevRawCacheFromRows(rows.models_dev),
		agentsLastExam: readAgentsLastExamRawCache(rows.agents_last_exam),
		blueprintBench: readBlueprintBenchRawCache(rows.blueprint_bench_2),
		browseComp: readBrowseCompRawCache(rows.browsecomp),
		cursorBench: readCursorBenchRawCache(rows.cursorbench),
		deepSWE: readDeepSWERawCache(rows.deep_swe),
		gdpPdf: readGdpPdfRawCache(rows.gdp_pdf),
		riemannBench: readRiemannBenchRawCache(rows.riemann_bench),
		toolathlon: readToolathlonRawCache(rows.toolathlon),
		valsIndex: readValsIndexRawCache(rows.vals_index),
		valsTerminalBench: readValsTerminalBenchRawCache(rows.vals_terminal_bench),
		vendingBench2: readVendingBench2RawCache(rows.vending_bench_2),
		openRouter: readOpenRouterRawCache(rows.openrouter),
	};
}

function collectDatabaseRun(
	runId: number,
	rows: Parameters<typeof writeDatabaseRunRows>[2],
): SnapshotRowCollector {
	const collector = new SnapshotRowCollector();
	writeDatabaseRunRows(collector, runId, rows);
	return collector;
}

/** Replaces only refresh metadata when source and derived content are unchanged. */
function sourceHealthStatements(
	runId: number,
	collector: SnapshotRowCollector,
): string[] {
	const collected = collector.tables.get(SNAPSHOT_TABLES.source_health);
	if (collected == null) {
		return [];
	}
	const runIdIndex = collected.columns.indexOf("run_id");
	if (runIdIndex < 0) {
		throw new Error("Collected source health rows do not include run_id");
	}
	return [
		`DELETE FROM ${quoteIdentifier(SNAPSHOT_TABLES.source_health)} WHERE run_id = ${runId};`,
		...insertStatements(SNAPSHOT_TABLES.source_health, {
			columns: collected.columns,
			rows: collected.rows.map((row) =>
				row.map((value, index) => (index === runIdIndex ? runId : value)),
			),
		}),
	];
}

function withSourceHealth(
	payload: LlmStatsPayload,
	sourceHealth: NonNullable<LlmStatsPayload["metadata"]["source_health"]>,
): LlmStatsPayload {
	return {
		...payload,
		metadata: {
			...payload.metadata,
			source_health: sourceHealth,
		},
	};
}

function payloadFromCollector(
	runId: number,
	fetchedAt: number,
	collector: SnapshotRowCollector,
): LlmStatsPayload {
	const rows: PayloadRows = {
		run: { id: runId, fetchedAt },
		modelRows: collector
			.records(SNAPSHOT_TABLES.model_stage_rows)
			.filter((row) => row.stage === "final"),
		sourceHealthRows: collector.records(SNAPSHOT_TABLES.source_health),
		agentArenaRows: collector.records(SNAPSHOT_TABLES.agent_arena),
		artificialAnalysisRows: collector.records(
			SNAPSHOT_TABLES.artificial_analysis,
		),
		agentsLastExamRows: collector.records(SNAPSHOT_TABLES.agents_last_exam),
		blueprintBenchRows: collector.records(SNAPSHOT_TABLES.blueprint_bench_2),
		browseCompRows: collector.records(SNAPSHOT_TABLES.browsecomp),
		cursorBenchRows: collector.records(SNAPSHOT_TABLES.cursorbench),
		deepSWERows: collector.records(SNAPSHOT_TABLES.deep_swe),
		gdpPdfRows: collector.records(SNAPSHOT_TABLES.gdp_pdf),
		riemannBenchRows: collector.records(SNAPSHOT_TABLES.riemann_bench),
		toolathlonRows: collector.records(SNAPSHOT_TABLES.toolathlon),
		valsIndexRows: collector.records(SNAPSHOT_TABLES.vals_index),
		valsTerminalBenchRows: collector.records(
			SNAPSHOT_TABLES.vals_terminal_bench,
		),
		vendingBench2Rows: collector.records(SNAPSHOT_TABLES.vending_bench_2),
	};
	return buildPayloadFromRows(rows);
}

function publicationStatements(
	runId: number,
	startedAt: number,
	completedAt: number,
	collector: SnapshotRowCollector,
	changedSources: RawSourceName[],
): string[] {
	const changedRawTables = changedSources.map(
		(source) => RAW_SOURCE_TABLES[source],
	);
	const tablesToInsert = [...changedRawTables, ...DERIVED_TABLES];
	return [
		...tablesToInsert.map(
			(table) =>
				`DELETE FROM ${quoteIdentifier(table)} WHERE run_id = ${runId};`,
		),
		`DELETE FROM pipeline_runs WHERE id = ${runId};`,
		`INSERT INTO pipeline_runs (id, started_at_epoch_seconds, completed_at_epoch_seconds, matched_row_count, enriched_row_count, final_model_count, pipeline_revision) VALUES (${runId}, ${startedAt}, NULL, ${collector.records(SNAPSHOT_TABLES.model_stage_rows).filter((row) => row.stage === "matched").length}, ${collector.records(SNAPSHOT_TABLES.model_stage_rows).filter((row) => row.stage === "enriched").length}, ${collector.records(SNAPSHOT_TABLES.model_stage_rows).filter((row) => row.stage === "final").length}, ${DATABASE_PIPELINE_REVISION});`,
		...tablesToInsert.flatMap((table) =>
			insertStatements(table, collector.tables.get(table)),
		),
		`UPDATE pipeline_runs SET completed_at_epoch_seconds = ${completedAt} WHERE id = ${runId};`,
		...changedRawTables.map(
			(table) =>
				`DELETE FROM ${quoteIdentifier(table)} WHERE run_id != ${runId};`,
		),
		...DERIVED_TABLES.map(
			(table) =>
				`DELETE FROM ${quoteIdentifier(table)} WHERE run_id != ${runId};`,
		),
		`DELETE FROM pipeline_runs WHERE id != ${runId};`,
	];
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
		rows.map(({ run_id, row_index, fetched_at_epoch_seconds, ...row }) => row),
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

function quoteIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQL identifier: ${value}`);
	}
	return `"${value}"`;
}
