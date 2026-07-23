/** Metadata assembly keeps live, stored, and restored payloads aligned with the current scoring contract. */

import type { BenchmarkResourcePolicy } from "../../benchmarks/factory";
import { STAGE_CONFIG } from "../../config";
import type { ScoringConfig } from "../../config/stage";
import {
	type ActiveResourceComponents,
	columnTooltipsForActiveComponents,
} from "../../config/tooltips";
import type { MatcherConfig } from "../../identity";
import { positiveFiniteNumber } from "../../numeric";
import type { BenchmarkRowsByKey } from "../../pipeline/benchmark-rows";
import {
	type BenchmarkMetricModel,
	benchmarkMetricValue,
	effectiveTaskSeconds,
	type ResourceMetricModel,
} from "../../pipeline/scores/resource-metrics";
import { asRecord } from "../../runtime";
import type {
	ModelAtlasBenchmarkUpdateHealth,
	ModelAtlasMetadata,
	ModelAtlasSourceHealth,
} from "../types";
import { buildBenchmarkUpdateHealth } from "./health";
import { SNAPSHOT_PRESERVATION_VERSION } from "./snapshot-preservation";

type BenchmarkHealthModels = Parameters<typeof buildBenchmarkUpdateHealth>[0];

type MetadataAvailabilitySource = "models" | "artificial_analysis";

type CurrentModelAtlasMetadataOptions = {
	models: readonly BenchmarkMetricModel[];
	resourceModels?: readonly ResourceMetricModel[];
	healthModels?: BenchmarkHealthModels;
	scoringConfig?: ScoringConfig;
	artificialAnalysis?: ModelAtlasMetadata["artificial_analysis"];
	sourceHealth?: ModelAtlasSourceHealth;
	benchmarkUpdateHealth?: ModelAtlasBenchmarkUpdateHealth;
	sourceRowsByKey?: BenchmarkRowsByKey;
	matcherConfig?: MatcherConfig;
	availabilitySource?: MetadataAvailabilitySource;
};

function sortedUniqueKeys(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function keysFromModelField(
	models: readonly BenchmarkMetricModel[],
	field: "benchmarks" | "intelligence",
): string[] {
	return sortedUniqueKeys(
		models.flatMap((model) => Object.keys(asRecord(model[field]))),
	);
}

function buildArtificialAnalysisMetadata(
	models: readonly BenchmarkMetricModel[],
): ModelAtlasMetadata["artificial_analysis"] {
	const availableBenchmarkKeys = keysFromModelField(models, "benchmarks");
	const availableIntelligenceKeys = keysFromModelField(models, "intelligence");
	return {
		available_benchmark_keys: sortedUniqueKeys([
			...availableBenchmarkKeys,
			...availableIntelligenceKeys,
		]),
		available_intelligence_keys: availableIntelligenceKeys,
	};
}

function hasPositiveTaskMetric(
	model: ResourceMetricModel,
	key: string,
	resourcePolicy: BenchmarkResourcePolicy,
): boolean {
	const taskMetricKey =
		resourcePolicy.source === "artificial_analysis"
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

/** Resource components activate only for declared policies with both benchmark values and comparable telemetry. */
function activeResourceComponents(
	models: readonly ResourceMetricModel[],
	scoringConfig: ScoringConfig,
): ActiveResourceComponents {
	const activeBenchmarks = Object.entries(scoringConfig.benchmarkPortfolio)
		.flatMap(([key, entry]) => {
			const resourcePolicy = entry.resourcePolicy;
			return resourcePolicy != null &&
				models.some(
					(model) =>
						benchmarkMetricValue(model, key) != null &&
						hasPositiveTaskMetric(model, key, resourcePolicy),
				)
				? [{ key, resourcePolicy }]
				: [];
		})
		.sort((left, right) => left.key.localeCompare(right.key));
	return {
		artificialAnalysisBenchmarkKeys: activeBenchmarks.flatMap(
			({ key, resourcePolicy }) =>
				resourcePolicy.source === "artificial_analysis" ? [key] : [],
		),
		directBenchmarkKeys: activeBenchmarks.flatMap(
			({ key, resourcePolicy }) =>
				resourcePolicy.source === "benchmark" ? [key] : [],
		),
	};
}

function resolveAvailableBenchmarkKeys(
	artificialAnalysis: ModelAtlasMetadata["artificial_analysis"],
): string[] {
	return artificialAnalysis.available_benchmark_keys;
}

/** Preserve caller-owned source metadata while refreshing scoring fields from the active stage configuration. */
export function buildCurrentModelAtlasMetadata({
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
}: CurrentModelAtlasMetadataOptions): ModelAtlasMetadata {
	const modelArtificialAnalysis = buildArtificialAnalysisMetadata(models);
	const outputArtificialAnalysis =
		artificialAnalysis ?? modelArtificialAnalysis;
	const availabilityArtificialAnalysis =
		availabilitySource === "artificial_analysis"
			? outputArtificialAnalysis
			: modelArtificialAnalysis;
	const availableBenchmarkKeys = resolveAvailableBenchmarkKeys(
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
			confidence: {
				intelligence: {
					...scoringConfig.confidence.intelligence,
				},
				agentic: { ...scoringConfig.confidence.agentic },
			},
			price_profiles: { ...scoringConfig.priceProfiles },
			simulation_profiles: { ...scoringConfig.simulationProfiles },
			seconds_per_input_token: scoringConfig.secondsPerInputToken,
			column_tooltips: {
				...scoringConfig.columnTooltips,
				...columnTooltipsForActiveComponents(resourceComponents),
			},
			snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
		},
	};
}
