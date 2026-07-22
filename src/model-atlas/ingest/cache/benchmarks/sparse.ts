/** Cache reconstruction for sparse benchmark leaderboard rows. */

import { asFiniteNumber } from "../../../runtime";
import type { AgentArenaModelScoreRow } from "../../../scrapers/agent-arena";
import type { AgentsLastExamHarnessRow } from "../../../scrapers/agents-last-exam";
import {
	type AleBenchConfigurationRow,
	processAleBenchConfigurationRow,
} from "../../../scrapers/ale-bench";
import type { BlueprintBenchModelScoreRow } from "../../../scrapers/blueprint-bench";
import type { CursorBenchModelScoreRow } from "../../../scrapers/cursorbench";
import {
	asDeepSWERawLeaderboardRow,
	type DeepSWERawLeaderboardRow,
	type DeepSWESourceVersion,
	deepSWESourceVersionForRows,
} from "../../../scrapers/deep-swe";
import {
	FRONTIER_CODE_SOURCE_REVISION,
	type FrontierCodeModelEffortRow,
	processFrontierCodeSubsetMetrics,
} from "../../../scrapers/frontier-code";
import type { MercorApexAgentsRow } from "../../../scrapers/mercor-apex-agents";
import type { VendingBench2ModelScoreRow } from "../../../scrapers/vending-bench-2";
import { SOURCE_URLS } from "../../types";
import {
	booleanFromSql,
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../rows";

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

function jsonValue(value: unknown): unknown | null {
	if (typeof value !== "string") return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

export function readAgentArenaRawCache(cache: CacheRowSource): {
	rows: AgentArenaModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
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

export function readAgentsLastExamRawCache(cache: CacheRowSource): {
	rows: AgentsLastExamHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
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

/** Reconstruct every ALE refinement configuration without accepting a partial raw cache. */
export function readAleBenchRawCache(cache: CacheRowSource): {
	rows: AleBenchConfigurationRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM ale_bench_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.ale_bench)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const model = stringValue(row.model);
		const detailPath = stringValue(row.detail_path);
		const numSelfRefine = asFiniteNumber(row.num_self_refine);
		if (model == null || detailPath == null || numSelfRefine == null) return [];
		const parsed = processAleBenchConfigurationRow(model, detailPath, {
			num_self_refine: numSelfRefine,
			rank: jsonValue(row.rank_json),
			performance: jsonValue(row.performance_json),
			input_tokens: jsonValue(row.input_tokens_json),
			output_tokens: jsonValue(row.output_tokens_json),
			total_tokens: jsonValue(row.total_tokens_json),
			cost: jsonValue(row.cost_json),
			results: jsonValue(row.results_json),
		});
		return parsed == null ? [] : [parsed];
	});
	return rows.length !== cacheRows.length
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

export function readBlueprintBenchRawCache(cache: CacheRowSource): {
	rows: BlueprintBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
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

export function readCursorBenchRawCache(cache: CacheRowSource): {
	rows: CursorBenchModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
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

export function readDeepSWERawCache(cache: CacheRowSource): {
	rows: DeepSWERawLeaderboardRow[];
	fetchedAt: number | null;
	sourceVersion: DeepSWESourceVersion | null;
} | null {
	const cacheRows = sourceCacheRows(
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

/** Reconstruct every FrontierCode effort only when the persisted revision and both subsets are complete. */
export function readFrontierCodeRawCache(cache: CacheRowSource): {
	rows: FrontierCodeModelEffortRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM frontier_code_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some(
			(row) =>
				stringValue(row.url) !== SOURCE_URLS.frontier_code ||
				stringValue(row.revision) !== FRONTIER_CODE_SOURCE_REVISION,
		)
	) {
		return null;
	}
	const rows = cacheRows.flatMap<FrontierCodeModelEffortRow>((row) => {
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const sourceEffort = stringValue(row.source_effort);
		const harness = stringValue(row.harness);
		const scoreEligible = booleanFromSql(row.score_eligible);
		const officialRank = asFiniteNumber(row.official_rank);
		const officialBestEffort = booleanFromSql(row.official_best_effort);
		const main = processFrontierCodeSubsetMetrics(jsonValue(row.main_json));
		const extended = processFrontierCodeSubsetMetrics(
			jsonValue(row.extended_json),
		);
		if (
			model == null ||
			baseModel == null ||
			sourceEffort == null ||
			harness == null ||
			scoreEligible == null ||
			officialRank == null ||
			officialBestEffort == null ||
			main == null ||
			extended == null
		) {
			return [];
		}
		return [
			{
				revision: FRONTIER_CODE_SOURCE_REVISION,
				model,
				base_model: baseModel,
				source_effort: sourceEffort,
				reasoning_effort: stringValue(row.reasoning_effort),
				harness,
				score_eligible: scoreEligible,
				official_rank: officialRank,
				official_best_effort: officialBestEffort,
				main,
				extended,
				score: main.score,
				cost_per_task_usd: main.cost_per_task_usd,
				tokens_per_task: main.tokens_per_task,
			},
		];
	});
	return rows.length !== cacheRows.length
		? null
		: { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

export function readMercorApexAgentsRawCache(cache: CacheRowSource): {
	rows: MercorApexAgentsRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
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

export function readVendingBench2RawCache(cache: CacheRowSource): {
	rows: VendingBench2ModelScoreRow[];
	fetchedAt: number | null;
	sourceUrl?: string;
} | null {
	const cacheRows = sourceCacheRows(
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
