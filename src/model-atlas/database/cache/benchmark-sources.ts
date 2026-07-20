/** Benchmark source cache reconstruction from persisted leaderboard rows. */

import type { DatabaseSync } from "node:sqlite";
import type { AgentArenaModelScoreRow } from "../../scrapers/agent-arena";
import type { AgentsLastExamHarnessRow } from "../../scrapers/agents-last-exam";
import type {
	BenchmarkScoreKey,
	BenchmarkScoreMetadata,
	BenchmarkScoreRow,
	BenchmarkScoreSource,
} from "../../scrapers/benchmark-score";
import type { BlueprintBenchModelScoreRow } from "../../scrapers/blueprint-bench";
import type { BrowseCompModelScoreRow } from "../../scrapers/browsecomp";
import type { CursorBenchModelScoreRow } from "../../scrapers/cursorbench";
import {
	asDeepSWERawLeaderboardRow,
	type DeepSWERawLeaderboardRow,
	type DeepSWESourceVersion,
	deepSWESourceVersionForRows,
} from "../../scrapers/deep-swe";
import type { MercorApexAgentsRow } from "../../scrapers/mercor-apex-agents";
import type { GdpPdfModelScoreRow } from "../../scrapers/surge/gdp-pdf";
import type { RiemannBenchModelScoreRow } from "../../scrapers/surge/riemann-bench";
import type { ToolathlonModelScoreRow } from "../../scrapers/toolathlon";
import type {
	ValsIndexModelScoreRow,
	ValsIndexTaskScoreRow,
} from "../../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchTaskRow,
} from "../../scrapers/vals/terminal-bench";
import type { VendingBench2ModelScoreRow } from "../../scrapers/vending-bench-2";
import { asFiniteNumber } from "../../shared";
import { SOURCE_URLS } from "../types";
import {
	booleanFromSql,
	type CacheDbRow,
	firstEpochSecond,
	queryCacheRows,
	stringValue,
} from "./rows";

type CacheSource = DatabaseSync | CacheDbRow[];

function benchmarkScoreMetadata(value: unknown): BenchmarkScoreMetadata | null {
	if (typeof value !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed != null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as BenchmarkScoreMetadata)
			: null;
	} catch {
		return null;
	}
}

function readBenchmarkScoreRawCache(
	cache: CacheSource,
	table: string,
	benchmarkKey: BenchmarkScoreKey,
	expectedSource: BenchmarkScoreSource,
): {
	rows: BenchmarkScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		`SELECT * FROM ${table} ORDER BY row_index`,
	);
	if (cacheRows.length === 0) return null;
	const rows = cacheRows.flatMap((row) => {
		const rowBenchmarkKey = stringValue(row.benchmark_key);
		const source = stringValue(row.source);
		const sourceUrl = stringValue(row.url);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const score = asFiniteNumber(row.score);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const metadata = benchmarkScoreMetadata(row.metadata_json);
		if (
			rowBenchmarkKey !== benchmarkKey ||
			source !== expectedSource ||
			sourceUrl == null ||
			model == null ||
			baseModel == null ||
			score == null ||
			scoreEligible == null ||
			metadata == null
		)
			return [];
		return [
			{
				benchmark_key: benchmarkKey,
				source: expectedSource,
				source_url: sourceUrl,
				model_id: stringValue(row.model_id),
				model,
				base_model: baseModel,
				reasoning_effort: stringValue(row.reasoning_effort),
				provider: stringValue(row.provider),
				rank: asFiniteNumber(row.rank),
				score,
				score_eligible: scoreEligible,
				standard_error: asFiniteNumber(row.standard_error),
				confidence_low: asFiniteNumber(row.confidence_low),
				confidence_high: asFiniteNumber(row.confidence_high),
				observed_at: stringValue(row.observed_at),
				metadata,
			} as BenchmarkScoreRow,
		];
	});
	return rows.length === 0
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

function numberArray(value: unknown): number[] | null {
	if (typeof value !== "string") {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) &&
			parsed.length > 0 &&
			parsed.every((item) => typeof item === "number" && Number.isFinite(item))
			? parsed
			: null;
	} catch {
		return null;
	}
}

function sourceRows(cache: CacheSource, sql: string): CacheDbRow[] {
	return Array.isArray(cache) ? cache : queryCacheRows(cache, sql);
}

export function readAgentArenaRawCache(cache: CacheSource): {
	rows: AgentArenaModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM agent_arena_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.agent_arena)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const rank = asFiniteNumber(row.rank);
		const contenderName = stringValue(row.contender_name);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const reasoningEffort = stringValue(row.reasoning_effort);
		const organization = stringValue(row.organization);
		const score = asFiniteNumber(row.score);
		return rank != null &&
			contenderName != null &&
			model != null &&
			baseModel != null &&
			organization != null &&
			score != null
			? [
					{
						rank,
						contender_name: contenderName,
						model,
						base_model: baseModel,
						reasoning_effort: reasoningEffort,
						organization,
						score,
					},
				]
			: [];
	});
	return rows.length === 0
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

export function readAgentsLastExamRawCache(cache: CacheSource): {
	rows: AgentsLastExamHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM agents_last_exam_raw_rows WHERE row_kind = 'harness_score' ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	return {
		rows: cacheRows.flatMap((row) => {
			const split = stringValue(row.split);
			const harness = stringValue(row.harness);
			const model = stringValue(row.model);
			const runs = asFiniteNumber(row.runs);
			const tasks = asFiniteNumber(row.tasks);
			const splitTasks = asFiniteNumber(row.split_tasks);
			const passes = asFiniteNumber(row.passes);
			const accuracy = asFiniteNumber(row.accuracy);
			const score = asFiniteNumber(row.score);
			const totalDurationSeconds = asFiniteNumber(row.total_duration_seconds);
			const totalInputTokens = asFiniteNumber(row.total_input_tokens);
			const totalOutputTokens = asFiniteNumber(row.total_output_tokens);
			const totalCostUsd = asFiniteNumber(row.total_cost_usd);
			return split != null &&
				harness != null &&
				model != null &&
				runs != null &&
				tasks != null &&
				splitTasks != null &&
				passes != null &&
				accuracy != null &&
				score != null &&
				totalDurationSeconds != null &&
				totalInputTokens != null &&
				totalOutputTokens != null
				? [
						{
							split,
							harness,
							model,
							harness_variant: stringValue(row.harness_variant),
							runs,
							tasks,
							split_tasks: splitTasks,
							passes,
							accuracy,
							score,
							total_duration_seconds: totalDurationSeconds,
							total_input_tokens: totalInputTokens,
							total_output_tokens: totalOutputTokens,
							total_cost_usd: totalCostUsd,
							cost_source: stringValue(row.cost_source),
						},
					]
				: [];
		}),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readBlueprintBenchRawCache(cache: CacheSource): {
	rows: BlueprintBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM blueprint_bench_2_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.blueprint_bench_2,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						model,
						score,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readBrowseCompRawCache(cache: CacheSource): {
	rows: BrowseCompModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM browsecomp_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.browsecomp)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const provider = stringValue(row.provider);
		const score = asFiniteNumber(row.score);
		return model != null && provider != null && score != null
			? [
					{
						model,
						provider,
						provider_name: stringValue(row.provider_name),
						score,
						source_url: stringValue(row.source_url),
						analysis_method: stringValue(row.analysis_method),
						verified: booleanFromSql(row.verified),
						self_reported: booleanFromSql(row.self_reported),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

/** Reconstructs Chartography rows from its source cache. */
export function readChartographyRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"chartography_raw_rows",
		"chartography",
		"surge",
	);
}

/** Reconstructs Chess Puzzles rows from its source cache. */
export function readChessPuzzlesRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"chess_puzzles_raw_rows",
		"chess_puzzles",
		"epoch",
	);
}

export function readCursorBenchRawCache(cache: CacheSource): {
	rows: CursorBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM cursorbench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.cursorbench)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const rank = asFiniteNumber(row.rank);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const score = asFiniteNumber(row.score);
		const costPerTaskUsd = asFiniteNumber(row.cost_per_task_usd);
		const tokensPerTask = asFiniteNumber(row.tokens_per_task);
		const stepsPerTask = asFiniteNumber(row.steps_per_task);
		return rank != null &&
			model != null &&
			baseModel != null &&
			scoreEligible != null &&
			score != null &&
			costPerTaskUsd != null &&
			tokensPerTask != null &&
			stepsPerTask != null
			? [
					{
						rank,
						model,
						base_model: baseModel,
						reasoning_effort: stringValue(row.reasoning_effort),
						score_eligible: scoreEligible,
						score,
						cost_per_task_usd: costPerTaskUsd,
						tokens_per_task: tokensPerTask,
						steps_per_task: stepsPerTask,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readDeepSWERawCache(cache: CacheSource): {
	rows: DeepSWERawLeaderboardRow[];
	fetchedAt: number | null;
	sourceVersion: DeepSWESourceVersion | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM deep_swe_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	const deepSweRows = cacheRows.flatMap((row) => {
		const parsedRow = asDeepSWERawLeaderboardRow(row);
		return parsedRow == null ? [] : [parsedRow];
	});
	return {
		rows: deepSweRows,
		fetchedAt: firstEpochSecond(cacheRows),
		sourceVersion: deepSWESourceVersionForRows(deepSweRows),
	};
}

/** Reconstructs EBR-Bench rows from its source cache. */
export function readEbrBenchRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"ebr_bench_raw_rows",
		"ebr_bench",
		"epoch",
	);
}

/** Reconstructs EnterpriseBench CoreCraft rows from its source cache. */
export function readEnterpriseBenchCoreCraftRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"enterprisebench_corecraft_raw_rows",
		"enterprisebench_corecraft",
		"surge",
	);
}

/** Reconstructs Epoch Capabilities Index rows from its source cache. */
export function readEpochCapabilitiesIndexRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"epoch_capabilities_index_raw_rows",
		"epoch_capabilities_index",
		"epoch",
	);
}

/** Reconstructs FrontierMath Tier 4 rows from its source cache. */
export function readFrontierMathTier4RawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"frontiermath_tier_4_raw_rows",
		"frontiermath_tier_4",
		"epoch",
	);
}

export function readGdpPdfRawCache(cache: CacheSource): {
	rows: GdpPdfModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM gdp_pdf_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.gdp_pdf)) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						provider: stringValue(row.provider),
						model,
						score,
						last_updated: stringValue(row.last_updated),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

/** Reconstructs HANDBOOK.md rows from its source cache. */
export function readHandbookMdRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"handbook_md_raw_rows",
		"handbook_md",
		"surge",
	);
}

export function readMercorApexAgentsRawCache(cache: CacheSource): {
	rows: MercorApexAgentsRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM mercor_apex_agents_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.mercor_apex_agents,
		)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const modelId = stringValue(row.model_id);
		const sourceModel = stringValue(row.source_model);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const organization = stringValue(row.organization);
		const score = asFiniteNumber(row.score);
		return modelId != null &&
			sourceModel != null &&
			model != null &&
			baseModel != null &&
			organization != null &&
			score != null
			? [
					{
						model_id: modelId,
						source_model: sourceModel,
						model,
						base_model: baseModel,
						reasoning_effort: stringValue(row.reasoning_effort),
						organization,
						score,
					},
				]
			: [];
	});
	return rows.length === 0
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

/** Reconstructs Vals ProofBench rows from their independent source cache. */
export function readProofBenchRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"proofbench_raw_rows",
		"proofbench",
		"vals",
	);
}

export function readRiemannBenchRawCache(cache: CacheSource): {
	rows: RiemannBenchModelScoreRow[];
	fetchedAt: number | null;
	sourceUrl: string;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM riemann_bench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	const sourceUrls = new Set(cacheRows.map((row) => stringValue(row.url)));
	if (sourceUrls.size !== 1 || sourceUrls.has(null)) {
		return null;
	}
	const sourceUrl = [...sourceUrls][0];
	if (sourceUrl == null) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return model != null && score != null
			? [
					{
						provider: stringValue(row.provider),
						model,
						score,
						last_updated: stringValue(row.last_updated),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
		sourceUrl,
	};
}

export function readValsTerminalBenchRawCache(cache: CacheSource): {
	rows: TerminalBenchTaskRow[];
	modelScores: TerminalBenchModelHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM vals_terminal_bench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.vals_terminal_bench,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		if (
			task == null ||
			taskLabel == null ||
			modelId == null ||
			model == null ||
			score == null
		) {
			return [];
		}
		return [
			{
				task,
				task_label: taskLabel,
				source_model_id: stringValue(row.source_model_id) ?? modelId,
				model_id: modelId,
				model,
				provider: stringValue(row.provider),
				harness: stringValue(row.harness),
				score,
				cost_per_task_usd: asFiniteNumber(row.cost_per_task_usd),
				seconds_per_task: asFiniteNumber(row.seconds_per_task),
			},
		];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		modelScores: cachedRows.filter(
			(row): row is TerminalBenchModelHarnessRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readToolathlonRawCache(cache: CacheSource): {
	rows: ToolathlonModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM toolathlon_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.toolathlon)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const provider = stringValue(row.provider);
		const score = asFiniteNumber(row.score);
		return model != null && provider != null && score != null
			? [
					{
						rank: asFiniteNumber(row.rank),
						model,
						provider,
						provider_name: stringValue(row.provider_name),
						score,
						source_url: stringValue(row.source_url),
						analysis_method: stringValue(row.analysis_method),
						verified: booleanFromSql(row.verified),
						self_reported: booleanFromSql(row.self_reported),
						announcement_date: stringValue(row.announcement_date),
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readValsIndexRawCache(cache: CacheSource): {
	rows: ValsIndexTaskScoreRow[];
	modelScores: ValsIndexModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM vals_index_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.vals_index)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return task != null &&
			taskLabel != null &&
			modelId != null &&
			model != null &&
			score != null
			? [
					{
						task,
						task_label: taskLabel,
						model_id: modelId,
						model,
						provider: stringValue(row.provider),
						score,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		modelScores: cachedRows.filter(
			(row): row is ValsIndexModelScoreRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readVendingBench2RawCache(cache: CacheSource): {
	rows: VendingBench2ModelScoreRow[];
	fetchedAt: number | null;
	sourceUrl?: string;
} | null {
	const cacheRows = sourceRows(
		cache,
		"SELECT * FROM vending_bench_2_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.vending_bench_2,
		)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const rank = asFiniteNumber(row.rank);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const reasoningEffort = stringValue(row.reasoning_effort);
		const runCount = asFiniteNumber(row.run_count);
		const finalBalanceUsd = asFiniteNumber(row.final_balance_usd);
		const dailyBalanceUsd = numberArray(row.daily_balance_usd_json);
		return rank != null &&
			model != null &&
			baseModel != null &&
			runCount != null &&
			finalBalanceUsd != null &&
			dailyBalanceUsd != null
			? [
					{
						rank,
						model,
						base_model: baseModel,
						reasoning_effort: reasoningEffort,
						run_count: runCount,
						final_balance_usd: finalBalanceUsd,
						daily_balance_usd: dailyBalanceUsd,
					},
				]
			: [];
	});
	if (rows.length === 0) {
		return null;
	}
	return {
		rows,
		fetchedAt: firstEpochSecond(cacheRows),
		sourceUrl: stringValue(cacheRows[0]?.data_url) ?? undefined,
	};
}

/** Reconstructs WeirdML rows from their independent source cache. */
export function readWeirdMlRawCache(cache: CacheSource) {
	return readBenchmarkScoreRawCache(
		cache,
		"weirdml_raw_rows",
		"weirdml",
		"weirdml",
	);
}
