/** Read the latest SQLite selected rows as the payload consumed by the minimal UI. */

import { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../../constants";
import type {
	ModelStatsNullableRelativeScores,
	ModelStatsNullableScores,
	ModelStatsScoredCandidate,
	ModelStatsSelectedContextWindow,
	ModelStatsSelectedCost,
	ModelStatsSelectedEvaluations,
	ModelStatsSelectedIntelligence,
	ModelStatsSelectedMetadata,
	ModelStatsSelectedModalities,
	ModelStatsSelectedPayload,
	ModelStatsSelectedSpeed,
	ModelStatsSelectedTaskMetrics,
} from "../model-stats/types";
import type { DeepSWELeaderboardRow } from "../scrapers/deep-swe";
import { asFiniteNumber, asRecord } from "../shared";
import { DEFAULT_DATABASE_PATH } from "./types";

type DbRow = Record<string, unknown>;

const INTELLIGENCE_KEYS = [
	"intelligence_index",
	"agentic_index",
	"coding_index",
	"omniscience_index",
	"omniscience_accuracy",
	"omniscience_nonhallucination_rate",
] as const;

const EVALUATION_KEYS = [
	"apex_agents",
	"critpt",
	"gdpval_normalized",
	"gpqa",
	"hle",
	"ifbench",
	"lcr",
	"mmmu_pro",
	"scicode",
	"terminalbench_hard",
	"deep_swe",
	"terminal_bench_2",
	"agents_last_exam",
	"browsecomp",
] as const;

const INPUT_MODALITY_COLUMNS = [
	["input_modality_text", "text"],
	["input_modality_image", "image"],
	["input_modality_audio", "audio"],
	["input_modality_video", "video"],
] as const;

/** Return a non-empty string value from SQLite. */
function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Convert SQLite integer booleans back to booleans. */
function booleanValue(value: unknown): boolean | null {
	if (value === 1) {
		return true;
	}
	if (value === 0) {
		return false;
	}
	return null;
}

/** Return whether an object has at least one own field. */
function hasFields(record: object): boolean {
	return Object.keys(record).length > 0;
}

/** Assign a finite numeric field when present. */
function assignNumber(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const numericValue = asFiniteNumber(value);
	if (numericValue != null) {
		target[key] = numericValue;
	}
}

/** Build an object from row columns with identical output keys. */
function numericObject<T extends object>(
	row: DbRow,
	keys: readonly string[],
): T | null {
	const record: Record<string, number> = {};
	for (const key of keys) {
		assignNumber(record, key, row[key]);
	}
	return hasFields(record) ? (record as T) : null;
}

/** Build the modalities object from scalar input-modality columns. */
function buildModalities(row: DbRow): ModelStatsSelectedModalities | null {
	const input = INPUT_MODALITY_COLUMNS.flatMap(([column, modality]) =>
		booleanValue(row[column]) === true ? [modality] : [],
	);
	return input.length > 0 ? { input } : null;
}

/** Build the context window object from scalar columns. */
function buildContextWindow(row: DbRow): ModelStatsSelectedContextWindow {
	const contextWindow: NonNullable<ModelStatsSelectedContextWindow> = {};
	assignNumber(contextWindow, "context", row.context);
	assignNumber(contextWindow, "input", row.context_input);
	assignNumber(contextWindow, "output", row.context_output);
	return hasFields(contextWindow) ? contextWindow : null;
}

/** Build the speed object from scalar columns. */
function buildSpeed(row: DbRow): ModelStatsSelectedSpeed {
	return {
		throughput_tokens_per_second_median:
			asFiniteNumber(row.throughput_tokens_per_second_median) ?? null,
		latency_seconds_median: asFiniteNumber(row.latency_seconds_median) ?? null,
		e2e_latency_seconds_median:
			asFiniteNumber(row.e2e_latency_seconds_median) ?? null,
	};
}

/** Build the cost object from scalar columns. */
function buildCost(row: DbRow): ModelStatsSelectedCost {
	const cost: Record<string, unknown> = {};
	assignNumber(cost, "input", row.cost_input);
	assignNumber(cost, "output", row.cost_output);
	assignNumber(cost, "cache_read", row.cost_cache_read);
	assignNumber(cost, "cache_write", row.cost_cache_write);
	assignNumber(cost, "weighted_input", row.cost_weighted_input);
	assignNumber(cost, "weighted_output", row.cost_weighted_output);
	assignNumber(cost, "blended_price", row.cost_blended_price);
	const contextOver200k: Record<string, number> = {};
	assignNumber(contextOver200k, "input", row.context_over_200k_input);
	assignNumber(contextOver200k, "output", row.context_over_200k_output);
	assignNumber(contextOver200k, "cache_read", row.context_over_200k_cache_read);
	assignNumber(
		contextOver200k,
		"cache_write",
		row.context_over_200k_cache_write,
	);
	if (hasFields(contextOver200k)) {
		cost.context_over_200k = contextOver200k;
	}
	return hasFields(cost) ? (cost as NonNullable<ModelStatsSelectedCost>) : null;
}

/** Build the task metrics object from scalar columns. */
function buildTaskMetrics(row: DbRow): ModelStatsSelectedTaskMetrics {
	const artificialAnalysis: Record<string, number> = {};
	assignNumber(artificialAnalysis, "cost", row.aa_task_cost);
	assignNumber(artificialAnalysis, "seconds", row.aa_task_seconds);
	assignNumber(artificialAnalysis, "output_tokens", row.aa_task_output_tokens);
	const deepSWE: Record<string, number> = {};
	assignNumber(deepSWE, "cost", row.deep_swe_task_cost);
	assignNumber(deepSWE, "seconds", row.deep_swe_task_seconds);
	assignNumber(deepSWE, "output_tokens", row.deep_swe_task_output_tokens);
	const agentsLastExam: Record<string, number> = {};
	assignNumber(agentsLastExam, "cost", row.agents_last_exam_task_cost);
	assignNumber(agentsLastExam, "seconds", row.agents_last_exam_task_seconds);
	assignNumber(
		agentsLastExam,
		"input_tokens",
		row.agents_last_exam_task_input_tokens,
	);
	assignNumber(
		agentsLastExam,
		"output_tokens",
		row.agents_last_exam_task_output_tokens,
	);
	const taskMetrics: NonNullable<ModelStatsSelectedTaskMetrics> = {};
	if (hasFields(artificialAnalysis)) {
		taskMetrics.artificial_analysis = artificialAnalysis;
	}
	if (hasFields(deepSWE)) {
		taskMetrics.deep_swe = deepSWE;
	}
	if (hasFields(agentsLastExam)) {
		taskMetrics.agents_last_exam = agentsLastExam;
	}
	return hasFields(taskMetrics) ? taskMetrics : null;
}

/** Build nullable raw score fields from scalar columns. */
function buildScores(row: DbRow): ModelStatsNullableScores {
	return {
		intelligence_score: asFiniteNumber(row.raw_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.raw_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.raw_speed_score) ?? null,
		value_score: asFiniteNumber(row.raw_value_score) ?? null,
	};
}

/** Build nullable relative score fields from scalar columns. */
function buildRelativeScores(row: DbRow): ModelStatsNullableRelativeScores {
	return {
		intelligence_score: asFiniteNumber(row.relative_intelligence_score) ?? null,
		agentic_score: asFiniteNumber(row.relative_agentic_score) ?? null,
		speed_score: asFiniteNumber(row.relative_speed_score) ?? null,
		value_score: asFiniteNumber(row.relative_value_score) ?? null,
		overall_score: asFiniteNumber(row.relative_overall_score) ?? null,
	};
}

/** Convert one SQLite selected row into the model payload shape. */
function modelFromRow(row: DbRow): ModelStatsScoredCandidate {
	const modelId = stringValue(row.model_id);
	const provider =
		stringValue(row.provider_id) ?? modelId?.split("/")[0] ?? null;
	return {
		id: modelId,
		name: stringValue(row.name),
		provider,
		logo: stringValue(row.logo) ?? "",
		attachment: booleanValue(row.attachment),
		reasoning: booleanValue(row.reasoning),
		release_date: stringValue(row.release_date),
		modalities: buildModalities(row),
		open_weights: booleanValue(row.open_weights),
		cost: buildCost(row),
		context_window: buildContextWindow(row),
		speed: buildSpeed(row),
		intelligence: numericObject<ModelStatsSelectedIntelligence>(
			row,
			INTELLIGENCE_KEYS,
		),
		intelligence_index_cost: null,
		task_metrics: buildTaskMetrics(row),
		evaluations: numericObject<ModelStatsSelectedEvaluations>(
			row,
			EVALUATION_KEYS,
		),
		scores: buildScores(row),
		relative_scores: buildRelativeScores(row),
	};
}

/** Return sorted unique keys from model object fields. */
function keysFromModelField(
	models: ModelStatsScoredCandidate[],
	field: "evaluations" | "intelligence",
): string[] {
	return [
		...new Set(models.flatMap((model) => Object.keys(asRecord(model[field])))),
	].sort((left, right) => left.localeCompare(right));
}

/** Build metadata for the DB-backed UI payload. */
function buildMetadata(
	models: ModelStatsScoredCandidate[],
): ModelStatsSelectedMetadata {
	const scoringConfig = STAGE_CONFIG.scoring;
	const availableEvaluationKeys = keysFromModelField(models, "evaluations");
	const availableIntelligenceKeys = keysFromModelField(models, "intelligence");
	const availableBenchmarkKeys = [
		...new Set([...availableEvaluationKeys, ...availableIntelligenceKeys]),
	].sort((left, right) => left.localeCompare(right));
	const selectedBenchmarkKeys = [
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	].sort((left, right) => left.localeCompare(right));
	return {
		artificial_analysis: {
			available_benchmark_keys: availableBenchmarkKeys,
			available_evaluation_keys: availableEvaluationKeys,
			available_intelligence_keys: availableIntelligenceKeys,
		},
		scoring: {
			intelligence_benchmark_keys: [...scoringConfig.intelligenceBenchmarkKeys],
			intelligence_benchmark_display_keys: [
				...scoringConfig.intelligenceBenchmarkDisplayKeys,
			],
			missing_intelligence_benchmark_keys:
				scoringConfig.intelligenceBenchmarkKeys.filter(
					(key) => !availableBenchmarkKeys.includes(key),
				),
			agentic_benchmark_keys: [...scoringConfig.agenticBenchmarkKeys],
			agentic_benchmark_display_keys: [
				...scoringConfig.agenticBenchmarkDisplayKeys,
			],
			missing_agentic_benchmark_keys: scoringConfig.agenticBenchmarkKeys.filter(
				(key) => !availableBenchmarkKeys.includes(key),
			),
			selected_benchmark_keys: selectedBenchmarkKeys,
			benchmark_portfolio: { ...scoringConfig.benchmarkPortfolio },
			price_profiles: { ...scoringConfig.priceProfiles },
			simulation_profiles: { ...scoringConfig.simulationProfiles },
			simulation_input_token_seconds: scoringConfig.simulationInputTokenSeconds,
			quality_score_weights: { ...scoringConfig.qualityScoreWeights },
			overall_relative_score_weights: {
				...scoringConfig.overallRelativeScoreWeights,
			},
			column_tooltips: { ...scoringConfig.columnTooltips },
		},
	};
}

/** Read the latest completed run id from SQLite. */
function latestRun(db: DatabaseSync): { id: number; fetchedAt: number | null } {
	const row = asRecord(
		db
			.prepare(
				"SELECT id, COALESCE(completed_at_epoch_seconds, started_at_epoch_seconds) AS fetched_at_epoch_seconds FROM pipeline_runs ORDER BY id DESC LIMIT 1",
			)
			.get(),
	);
	const id = asFiniteNumber(row.id);
	if (id == null) {
		throw new Error("No Model Atlas database run exists");
	}
	return {
		id,
		fetchedAt: asFiniteNumber(row.fetched_at_epoch_seconds),
	};
}

/** Read all DeepSWE effort rows for graph-only display. */
function readDeepSWERows(
	db: DatabaseSync,
	runId: number,
): DeepSWELeaderboardRow[] {
	return db
		.prepare(
			"SELECT * FROM deep_swe_raw_rows WHERE run_id = ? ORDER BY pass_at_1 DESC, row_index",
		)
		.all(runId)
		.flatMap((row) => {
			const record = asRecord(row);
			const model = stringValue(record.model);
			const passAt1 = asFiniteNumber(record.pass_at_1);
			const meanCostUsd = asFiniteNumber(record.mean_cost_usd);
			const meanDurationSeconds = asFiniteNumber(record.mean_duration_seconds);
			const meanOutputTokens = asFiniteNumber(record.mean_output_tokens);
			return model != null &&
				passAt1 != null &&
				meanCostUsd != null &&
				meanDurationSeconds != null &&
				meanOutputTokens != null
				? [
						{
							model,
							reasoning_effort: stringValue(record.reasoning_effort),
							config: stringValue(record.config),
							pass_at_1: passAt1,
							ci_lo: asFiniteNumber(record.ci_lo),
							ci_hi: asFiniteNumber(record.ci_hi),
							ci_half: asFiniteNumber(record.ci_half),
							mean_cost_usd: meanCostUsd,
							mean_duration_seconds: meanDurationSeconds,
							mean_output_tokens: meanOutputTokens,
						},
					]
				: [];
		});
}

/** Read the UI payload from the latest SQLite selected rows. */
export function readModelAtlasDatabasePayload(
	databasePath = DEFAULT_DATABASE_PATH,
): ModelStatsSelectedPayload {
	const db = new DatabaseSync(databasePath);
	try {
		const run = latestRun(db);
		const rows = db
			.prepare(
				"SELECT * FROM processed_models WHERE run_id = ? AND stage = 'final' ORDER BY row_index",
			)
			.all(run.id)
			.map((row) => asRecord(row));
		const models = rows.map(modelFromRow);
		return {
			fetched_at_epoch_seconds: run.fetchedAt,
			metadata: buildMetadata(models),
			deep_swe: {
				rows: readDeepSWERows(db, run.id),
			},
			models: models as ModelStatsSelectedPayload["models"],
		};
	} finally {
		db.close();
	}
}
