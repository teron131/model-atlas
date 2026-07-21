/** Direct D1 refresh preserves source evidence, skips unchanged writes, and publishes the derived snapshot atomically. */

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
	readAleBenchRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readChartographyRawCache,
	readChessPuzzlesRawCache,
	readCodeMigrationRawCache,
	readCursorBenchRawCache,
	readCyberBenchRawCache,
	readDeepSWERawCache,
	readEbrBenchRawCache,
	readEmbRawCache,
	readEnterpriseBenchCoreCraftRawCache,
	readEpochCapabilitiesIndexRawCache,
	readFinanceAgentV2RawCache,
	readFrontierCodeRawCache,
	readFrontierMathTier4RawCache,
	readGdpPdfRawCache,
	readHandbookMdRawCache,
	readHarveyLabRawCache,
	readLegalResearchRawCache,
	readMedCodeRawCache,
	readMercorApexAgentsRawCache,
	readOpenRouterRawCache,
	readProgramBenchRawCache,
	readProofBenchRawCache,
	readPublicBenefitsBenchRawCache,
	readRiemannBenchRawCache,
	readTerminalBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readVendingBench2RawCache,
	readVibeCodeRawCache,
	readWeirdMlRawCache,
} from "./cache";
import type { CacheDbRow } from "./cache/rows";
import {
	d1Config,
	ensureD1Schema,
	missingD1Environment,
	queryD1Batch,
	queryD1BatchRows,
	readD1Payload,
} from "./d1";
import {
	type OpenRouterRawCache,
	refreshOpenRouterRawPayload,
} from "./openrouter-cache";
import {
	buildPayloadFromRows,
	buildPayloadRows,
	PAYLOAD_ROW_GROUPS,
} from "./payload";
import { deriveDatabaseSnapshot, writeDatabaseSnapshotRows } from "./pipeline";
import { sourceRowStatesFromRows } from "./policy";
import type { SchemaReconciliationPlan } from "./schema";
import { refreshSourceSnapshots, type SourceSnapshotCaches } from "./snapshots";
import {
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
	SNAPSHOT_TABLES.source_quarantines,
	SNAPSHOT_TABLES.source_health,
	SNAPSHOT_TABLES.models,
	SNAPSHOT_TABLES.model_evaluations,
	SNAPSHOT_TABLES.model_task_metrics,
	SNAPSHOT_TABLES.model_match_debug,
] as const;
const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;

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
			tableContentHash(collector.records(RAW_SOURCE_TABLES[source])) !==
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
		const statements = sourceHealthStatements(collector);
		await queryD1Batch(statements.map((sql) => ({ sql })));
		const payload = {
			...current.previousPayload,
			metadata: {
				...current.previousPayload.metadata,
				source_health: derived.rows.sourceHealth,
			},
		};
		return {
			result: publishResult(
				config.databaseId,
				payload,
				false,
				[],
				statements.length,
				schema,
			),
			payload,
		};
	}
	const completedAtEpochSeconds = nowEpochSeconds();
	const statements = publicationStatements(
		completedAtEpochSeconds,
		collector,
		changedSources,
	);
	await queryD1Batch(statements.map((sql) => ({ sql })));
	const payload = payloadFromCollector(completedAtEpochSeconds, collector);
	return {
		result: publishResult(
			config.databaseId,
			payload,
			true,
			changedSources,
			statements.length,
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
	const rowGroups = await queryD1BatchRows(
		RAW_SOURCE_NAMES.map((source) => {
			const table = RAW_SOURCE_TABLES[source];
			return {
				sql: `SELECT * FROM ${quoteIdentifier(table)} ORDER BY row_index`,
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
): SourceSnapshotCaches {
	return {
		artificialAnalysis: artificialAnalysisRawCacheFromRows(
			rows.artificial_analysis,
		),
		artificialAnalysisEvaluationResources:
			artificialAnalysisEvaluationResourceRawCacheFromRows(
				rows.artificial_analysis_evaluation_resources,
			),
		modelsDev: modelsDevRawCacheFromRows(rows.models_dev),
		agentArena: readAgentArenaRawCache(rows.agent_arena),
		aleBench: readAleBenchRawCache(rows.ale_bench),
		agentsLastExam: readAgentsLastExamRawCache(rows.agents_last_exam),
		blueprintBench: readBlueprintBenchRawCache(rows.blueprint_bench_2),
		browseComp: readBrowseCompRawCache(rows.browsecomp),
		chartography: readChartographyRawCache(rows.chartography),
		chessPuzzles: readChessPuzzlesRawCache(rows.chess_puzzles),
		codeMigration: readCodeMigrationRawCache(rows.code_migration),
		cursorBench: readCursorBenchRawCache(rows.cursorbench),
		cyberBench: readCyberBenchRawCache(rows.cyberbench),
		deepSWE: readDeepSWERawCache(rows.deep_swe),
		ebrBench: readEbrBenchRawCache(rows.ebr_bench),
		emb: readEmbRawCache(rows.emb),
		enterpriseBenchCoreCraft: readEnterpriseBenchCoreCraftRawCache(
			rows.enterprisebench_corecraft,
		),
		epochCapabilitiesIndex: readEpochCapabilitiesIndexRawCache(
			rows.epoch_capabilities_index,
		),
		financeAgentV2: readFinanceAgentV2RawCache(rows.finance_agent_v2),
		frontierCode: readFrontierCodeRawCache(rows.frontier_code),
		frontierMathTier4: readFrontierMathTier4RawCache(rows.frontiermath_tier_4),
		gdpPdf: readGdpPdfRawCache(rows.gdp_pdf),
		handbookMd: readHandbookMdRawCache(rows.handbook_md),
		harveyLab: readHarveyLabRawCache(rows.vals_harvey_lab),
		legalResearch: readLegalResearchRawCache(rows.legal_research),
		medCode: readMedCodeRawCache(rows.medcode),
		mercorApexAgents: readMercorApexAgentsRawCache(rows.mercor_apex_agents),
		programBench: readProgramBenchRawCache(rows.programbench),
		proofBench: readProofBenchRawCache(rows.proofbench),
		publicBenefitsBench: readPublicBenefitsBenchRawCache(
			rows.public_benefits_bench,
		),
		riemannBench: readRiemannBenchRawCache(rows.riemann_bench),
		terminalBench: readTerminalBenchRawCache(rows.vals_terminal_bench),
		toolathlon: readToolathlonRawCache(rows.toolathlon),
		valsIndex: readValsIndexRawCache(rows.vals_index),
		vendingBench2: readVendingBench2RawCache(rows.vending_bench_2),
		vibeCode: readVibeCodeRawCache(rows.vibe_code),
		weirdMl: readWeirdMlRawCache(rows.weirdml),
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
			PAYLOAD_ROW_GROUPS.map(({ key, table }) => [
				key,
				collector.records(table),
			]),
		),
	);
}

function publicationStatements(
	completedAtEpochSeconds: number,
	collector: SnapshotRowCollector,
	changedSources: RawSourceName[],
): string[] {
	const changedRawTables = changedSources.map(
		(source) => RAW_SOURCE_TABLES[source],
	);
	const tablesToInsert = [...changedRawTables, ...DERIVED_TABLES];
	return [
		...tablesToInsert.map((table) => `DELETE FROM ${quoteIdentifier(table)};`),
		"DELETE FROM snapshot_metadata;",
		...tablesToInsert.flatMap((table) =>
			insertStatements(table, collector.tables.get(table)),
		),
		`INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (${completedAtEpochSeconds});`,
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

function quoteIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQL identifier: ${value}`);
	}
	return `"${value}"`;
}
