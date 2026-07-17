/** Metadata assembly keeps live, stored, and restored payloads aligned with the current scoring contract. */

import { benchmarkResourcePolicy } from "../config/benchmark-portfolio";
import {
	type ActiveResourceComponents,
	columnTooltipsForActiveComponents,
} from "../config/column-tooltips";
import { STAGE_CONFIG } from "../constants";
import type { MatcherConfig } from "../matcher";
import { positiveFiniteNumber } from "../math-utils";
import { asRecord } from "../shared";
import type { BenchmarkRowsByKey } from "./benchmarks";
import { buildBenchmarkUpdateHealth } from "./health";
import {
	type BenchmarkMetricModel,
	benchmarkMetricValue,
	effectiveTaskSeconds,
	type ResourceMetricModel,
} from "./resource-metrics";
import { SNAPSHOT_PRESERVATION_VERSION } from "./snapshot-preservation";
import type {
	LlmStatsBenchmarkUpdateHealth,
	LlmStatsMetadata,
	LlmStatsSourceHealth,
	ModelAtlasStageConfig,
} from "./types";

type BenchmarkHealthModels = Parameters<typeof buildBenchmarkUpdateHealth>[0];

type MetadataAvailabilitySource = "models" | "artificial_analysis";

type CurrentLlmStatsMetadataOptions = {
	models: readonly BenchmarkMetricModel[];
	resourceModels?: readonly ResourceMetricModel[];
	healthModels?: BenchmarkHealthModels;
	scoringConfig?: ModelAtlasStageConfig["scoring"];
	artificialAnalysis?: LlmStatsMetadata["artificial_analysis"];
	sourceHealth?: LlmStatsSourceHealth;
	benchmarkUpdateHealth?: LlmStatsBenchmarkUpdateHealth;
	sourceRowsByKey?: BenchmarkRowsByKey;
	matcherConfig?: MatcherConfig;
	availabilitySource?: MetadataAvailabilitySource;
};

function sortedUniqueKeys(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function keysFromModelField(
	models: readonly BenchmarkMetricModel[],
	field: "evaluations" | "intelligence",
): string[] {
	return sortedUniqueKeys(
		models.flatMap((model) => Object.keys(asRecord(model[field]))),
	);
}

function buildArtificialAnalysisMetadata(
	models: readonly BenchmarkMetricModel[],
): LlmStatsMetadata["artificial_analysis"] {
	const availableEvaluationKeys = keysFromModelField(models, "evaluations");
	const availableIntelligenceKeys = keysFromModelField(models, "intelligence");
	return {
		available_benchmark_keys: sortedUniqueKeys([
			...availableEvaluationKeys,
			...availableIntelligenceKeys,
		]),
		available_evaluation_keys: availableEvaluationKeys,
		available_intelligence_keys: availableIntelligenceKeys,
	};
}

function hasPositiveTaskMetric(
	model: ResourceMetricModel,
	key: string,
	scoringConfig: ModelAtlasStageConfig["scoring"],
): boolean {
	const resourcePolicy = benchmarkResourcePolicy(
		key,
		scoringConfig.benchmarkPortfolio,
	);
	const taskMetricKey =
		resourcePolicy?.source === "artificial_analysis"
			? "artificial_analysis"
			: key;
	const taskMetrics = asRecord(model.task_metrics);
	const task =
		taskMetricKey === key
			? asRecord(taskMetrics[taskMetricKey])
			: {
					...asRecord(taskMetrics[taskMetricKey]),
					...asRecord(taskMetrics[key]),
				};
	return (
		positiveFiniteNumber(task.cost) != null ||
		effectiveTaskSeconds(model, task) != null
	);
}

/** Resource components activate only when this payload has both benchmark values and comparable cost or runtime telemetry. */
function activeResourceBenchmarkKeys(
	models: readonly ResourceMetricModel[],
	scoringConfig: ModelAtlasStageConfig["scoring"],
): string[] {
	const benchmarkKeys = sortedUniqueKeys(
		models.flatMap((model) => [
			...Object.keys(asRecord(model.evaluations)),
			...Object.keys(asRecord(model.intelligence)),
		]),
	);
	return benchmarkKeys.filter((key) =>
		models.some(
			(model) =>
				benchmarkMetricValue(model, key) != null &&
				hasPositiveTaskMetric(model, key, scoringConfig),
		),
	);
}

function activeResourceComponents(
	models: readonly ResourceMetricModel[],
	scoringConfig: ModelAtlasStageConfig["scoring"],
): ActiveResourceComponents {
	const activeKeys = activeResourceBenchmarkKeys(models, scoringConfig);
	return {
		artificialAnalysisBenchmarkKeys: activeKeys.filter(
			(key) =>
				benchmarkResourcePolicy(key, scoringConfig.benchmarkPortfolio)
					?.source === "artificial_analysis",
		),
		directBenchmarkKeys: activeKeys.filter(
			(key) =>
				benchmarkResourcePolicy(key, scoringConfig.benchmarkPortfolio)
					?.source !== "artificial_analysis",
		),
	};
}

/** Older stored payloads may lack the combined benchmark-key field, so split fields remain the read fallback. */
function availableBenchmarkKeysFrom(
	artificialAnalysis: LlmStatsMetadata["artificial_analysis"],
): string[] {
	return artificialAnalysis.available_benchmark_keys.length > 0
		? artificialAnalysis.available_benchmark_keys
		: sortedUniqueKeys([
				...artificialAnalysis.available_evaluation_keys,
				...artificialAnalysis.available_intelligence_keys,
			]);
}

/** Preserve caller-owned source metadata while refreshing scoring fields from the active stage configuration. */
export function buildCurrentLlmStatsMetadata({
	models,
	resourceModels = models,
	healthModels = models as BenchmarkHealthModels,
	scoringConfig = STAGE_CONFIG.scoring,
	artificialAnalysis,
	sourceHealth,
	benchmarkUpdateHealth,
	sourceRowsByKey,
	matcherConfig = STAGE_CONFIG.matcher,
	availabilitySource = "models",
}: CurrentLlmStatsMetadataOptions): LlmStatsMetadata {
	const modelArtificialAnalysis = buildArtificialAnalysisMetadata(models);
	const outputArtificialAnalysis =
		artificialAnalysis ?? modelArtificialAnalysis;
	const availabilityArtificialAnalysis =
		availabilitySource === "artificial_analysis"
			? outputArtificialAnalysis
			: modelArtificialAnalysis;
	const availableBenchmarkKeys = availableBenchmarkKeysFrom(
		availabilityArtificialAnalysis,
	);
	const selectedBenchmarkKeys = sortedUniqueKeys([
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]);
	const resourceComponents = activeResourceComponents(
		resourceModels,
		scoringConfig,
	);
	return {
		artificial_analysis: outputArtificialAnalysis,
		...(sourceHealth == null ? {} : { source_health: sourceHealth }),
		benchmark_update_health:
			benchmarkUpdateHealth ??
			buildBenchmarkUpdateHealth(
				healthModels,
				scoringConfig,
				sourceRowsByKey,
				matcherConfig,
			),
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
			column_tooltips: {
				...scoringConfig.columnTooltips,
				...columnTooltipsForActiveComponents(resourceComponents),
			},
			snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
		},
	};
}
