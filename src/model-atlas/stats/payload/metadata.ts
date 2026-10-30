/** Metadata assembly keeps live, stored, and restored payloads aligned with the current scoring contract. */

import { benchmarkValueLocation } from "../../benchmarks/registry";
import { STAGE_CONFIG } from "../../config";
import { type ScoringConfig, selectedBenchmarkKeys } from "../../config/stage";
import {
  type ActiveResourceComponents,
  columnTooltipsForActiveComponents,
} from "../../config/tooltips";
import type { MatcherConfig } from "../../identity";
import { positiveFiniteNumber } from "../../math-utils";
import { type BenchmarkRowsByKey, observedBenchmarkVersions } from "../../pipeline/benchmark-rows";
import {
  type BenchmarkMetricModel,
  benchmarkTaskMetrics,
  benchmarkValue,
  effectiveTaskSeconds,
  type ResourceMetricModel,
} from "../../pipeline/scores/resource-metrics";
import { asRecord } from "../../runtime";
import type {
  ModelAtlasBenchmarkUpdateHealth,
  ModelAtlasMetadata,
  ModelAtlasSourceHealth,
} from "../types";
import { buildBenchmarkUpdateHealth, isValidBenchmarkUpdateHealth } from "./health";
import { SNAPSHOT_PRESERVATION_VERSION } from "./snapshot-preservation";

type BenchmarkHealthModels = Parameters<typeof buildBenchmarkUpdateHealth>[0];

type MetadataAvailabilitySource = "models" | "metadata";

type CurrentModelAtlasMetadataOptions = {
  models: readonly BenchmarkMetricModel[];
  resourceModels?: readonly ResourceMetricModel[];
  healthModels?: BenchmarkHealthModels;
  scoringConfig?: ScoringConfig;
  availableMetrics?: ModelAtlasMetadata["available_metrics"];
  sourceHealth?: ModelAtlasSourceHealth;
  benchmarkUpdateHealth?: ModelAtlasBenchmarkUpdateHealth;
  benchmarkVersions?: Readonly<Record<string, string>>;
  sourceRowsByKey?: BenchmarkRowsByKey;
  matcherConfig?: MatcherConfig;
  availabilitySource?: MetadataAvailabilitySource;
  /** Saved rows retain their build version; null marks checkpoints that did not record one. */
  snapshotPreservationVersion?: number | null;
};

function sortedUniqueKeys(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function keysFromModelField(
  models: readonly BenchmarkMetricModel[],
  field: "benchmarks" | "intelligence",
): string[] {
  return sortedUniqueKeys(models.flatMap((model) => Object.keys(asRecord(model[field]))));
}

function buildAvailableMetrics(
  models: readonly BenchmarkMetricModel[],
): ModelAtlasMetadata["available_metrics"] {
  const availableBenchmarkKeys = keysFromModelField(models, "benchmarks");
  const availableIntelligenceKeys = keysFromModelField(models, "intelligence");
  return {
    benchmark_keys: sortedUniqueKeys([...availableBenchmarkKeys, ...availableIntelligenceKeys]),
  };
}

function benchmarkAvailable(
  key: string,
  availableMetrics: ModelAtlasMetadata["available_metrics"],
): boolean {
  if (availableMetrics.benchmark_keys.includes(key)) {
    return true;
  }
  const location = benchmarkValueLocation(key);
  return (
    location?.kind === "intelligence" && availableMetrics.benchmark_keys.includes(location.field)
  );
}

function hasPositiveTaskMetric(model: ResourceMetricModel, key: string): boolean {
  const task = benchmarkTaskMetrics(model, key);
  return positiveFiniteNumber(task?.cost) != null || effectiveTaskSeconds(model, task) != null;
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
          (model) => benchmarkValue(model, key) != null && hasPositiveTaskMetric(model, key),
        )
        ? [{ key, resourcePolicy }]
        : [];
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    artificialAnalysisBenchmarkKeys: activeBenchmarks.flatMap(({ key, resourcePolicy }) =>
      resourcePolicy.source === "artificial_analysis" ? [key] : [],
    ),
    directBenchmarkKeys: activeBenchmarks.flatMap(({ key, resourcePolicy }) =>
      resourcePolicy.source === "benchmark" ? [key] : [],
    ),
  };
}

/** Preserve caller-owned source metadata while refreshing scoring fields from the active stage configuration. */
export function buildCurrentModelAtlasMetadata({
  models,
  resourceModels = models,
  healthModels = models as BenchmarkHealthModels,
  scoringConfig = STAGE_CONFIG.scoring,
  availableMetrics,
  sourceHealth,
  benchmarkUpdateHealth,
  benchmarkVersions,
  sourceRowsByKey,
  matcherConfig = STAGE_CONFIG.matcher,
  availabilitySource = "models",
  snapshotPreservationVersion = SNAPSHOT_PRESERVATION_VERSION,
}: CurrentModelAtlasMetadataOptions): ModelAtlasMetadata {
  const modelAvailableMetrics = buildAvailableMetrics(models);
  const outputAvailableMetrics = availableMetrics ?? modelAvailableMetrics;
  const availabilityMetrics =
    availabilitySource === "metadata" ? outputAvailableMetrics : modelAvailableMetrics;
  const selectedKeys = sortedUniqueKeys(selectedBenchmarkKeys(scoringConfig));
  const resourceComponents = activeResourceComponents(resourceModels, scoringConfig);
  const hasCompleteStoredBenchmarkHealth =
    sourceRowsByKey == null &&
    benchmarkUpdateHealth != null &&
    selectedKeys.every((key) => isValidBenchmarkUpdateHealth(benchmarkUpdateHealth[key]));
  const computedBenchmarkUpdateHealth = hasCompleteStoredBenchmarkHealth
    ? {}
    : buildBenchmarkUpdateHealth(healthModels, scoringConfig, sourceRowsByKey, matcherConfig);
  const currentBenchmarkUpdateHealth = Object.fromEntries(
    selectedKeys.map((key) => [
      key,
      hasCompleteStoredBenchmarkHealth
        ? benchmarkUpdateHealth![key]!
        : computedBenchmarkUpdateHealth[key]!,
    ]),
  );
  const currentBenchmarkVersions =
    sourceRowsByKey == null ? benchmarkVersions : observedBenchmarkVersions(sourceRowsByKey);
  return {
    available_metrics: outputAvailableMetrics,
    ...(sourceHealth == null ? {} : { source_health: sourceHealth }),
    benchmark_update_health: currentBenchmarkUpdateHealth,
    ...(currentBenchmarkVersions == null ? {} : { benchmark_versions: currentBenchmarkVersions }),
    scoring: {
      intelligence_scoring: {
        group_weights: { ...scoringConfig.intelligenceGroupWeights },
        pairwise_weight: scoringConfig.pairwiseIntelligenceWeight,
      },
      intelligence_benchmark_keys: [...scoringConfig.intelligenceBenchmarkKeys],
      intelligence_benchmark_display_keys: [...scoringConfig.intelligenceBenchmarkDisplayKeys],
      missing_intelligence_benchmark_keys: scoringConfig.intelligenceBenchmarkKeys.filter(
        (key) => !benchmarkAvailable(key, availabilityMetrics),
      ),
      agentic_benchmark_keys: [...scoringConfig.agenticBenchmarkKeys],
      agentic_benchmark_display_keys: [...scoringConfig.agenticBenchmarkDisplayKeys],
      agentic_token_modifier_cap: scoringConfig.agenticTokenModifierCap,
      missing_agentic_benchmark_keys: scoringConfig.agenticBenchmarkKeys.filter(
        (key) => !benchmarkAvailable(key, availabilityMetrics),
      ),
      selected_benchmark_keys: selectedKeys,
      benchmark_portfolio: { ...scoringConfig.benchmarkPortfolio },
      column_tooltips: columnTooltipsForActiveComponents(resourceComponents),
      snapshot_preservation_version: snapshotPreservationVersion,
    },
  };
}
