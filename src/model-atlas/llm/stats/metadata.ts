/** Build current Model Atlas scoring metadata for live, stored, and restored payloads. */

import { STAGE_CONFIG } from "../../constants";
import { asRecord } from "../shared";
import type { BenchmarkRowsByKey } from "./benchmarks";
import { buildBenchmarkUpdateHealth } from "./health";
import { SNAPSHOT_PRESERVATION_VERSION } from "./snapshot-preservation";
import type {
	LlmStatsBenchmarkUpdateHealth,
	LlmStatsMetadata,
	LlmStatsSourceHealth,
	MatcherConfig,
	ModelAtlasStageConfig,
} from "./types";

type BenchmarkFieldModel = {
	evaluations?: unknown;
	intelligence?: unknown;
};

type BenchmarkHealthModels = Parameters<typeof buildBenchmarkUpdateHealth>[0];

type MetadataAvailabilitySource = "models" | "artificial_analysis";

type CurrentLlmStatsMetadataOptions = {
	models: readonly BenchmarkFieldModel[];
	healthModels?: BenchmarkHealthModels;
	scoringConfig?: ModelAtlasStageConfig["scoring"];
	artificialAnalysis?: LlmStatsMetadata["artificial_analysis"];
	sourceHealth?: LlmStatsSourceHealth;
	benchmarkUpdateHealth?: LlmStatsBenchmarkUpdateHealth;
	sourceRowsByKey?: BenchmarkRowsByKey;
	matcherConfig?: MatcherConfig;
	availabilitySource?: MetadataAvailabilitySource;
};

/** Return sorted unique keys for metadata fields. */
function sortedUniqueKeys(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/** Collect available benchmark-like keys from a model object field. */
function keysFromModelField(
	models: readonly BenchmarkFieldModel[],
	field: "evaluations" | "intelligence",
): string[] {
	return sortedUniqueKeys(
		models.flatMap((model) => Object.keys(asRecord(model[field]))),
	);
}

/** Build Artificial Analysis availability metadata from model rows. */
function buildArtificialAnalysisMetadata(
	models: readonly BenchmarkFieldModel[],
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

/** Return benchmark keys, falling back to split metadata fields when old snapshots omit the combined field. */
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

/** Build current metadata while preserving caller-owned source and restored metadata fields. */
export function buildCurrentLlmStatsMetadata({
	models,
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
			quality_score_weights: { ...scoringConfig.qualityScoreWeights },
			overall_relative_score_weights: {
				...scoringConfig.overallRelativeScoreWeights,
			},
			column_tooltips: { ...scoringConfig.columnTooltips },
			snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
		},
	};
}
