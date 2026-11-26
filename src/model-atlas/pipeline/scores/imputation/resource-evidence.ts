/** Which benchmarks may have a resource amount imputed, how a directly measured amount is read, and the lookup of a variant's estimates, shared by effort ratios and final scoring; broader evidence shares the benchmark keys and evidence floor and reads observed amounts its own way. */

import { indexPolicy } from "../../../benchmarks/index-policy";
import type { ScoringConfig } from "../../../config/stage";
import { canonicalVariantKey } from "../../../identity/normalization";
import { positiveFiniteNumber } from "../../../math-utils";
import type {
  ModelAtlasCandidate,
  ModelAtlasTaskEstimateMetric,
  ModelAtlasTaskEstimates,
} from "../../model-types";
import {
  benchmarkTaskMetrics,
  directBenchmarkTokens,
  effectiveTaskSeconds,
  type ResourceMetricModel,
} from "../resource-metrics";

export const TASK_RESOURCE_KINDS = ["cost", "time", "tokens", "output_tokens"] as const;

export type TaskResourceKind = (typeof TASK_RESOURCE_KINDS)[number];

export type ImputedTaskResource = {
  amount: number;
  evidenceFactor: number;
};

/** Estimates below this evidence factor are left out: a lower floor admits estimates that pull Speed and Value away from what measured amounts give, and a higher one leaves too many gaps unfilled. */
export const MIN_RESOURCE_EVIDENCE_FACTOR = 0.2;

export type EffortResourceImputation = {
  byVariant: ReadonlyMap<
    string,
    ReadonlyMap<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>
  >;
};

/** Artificial Analysis token telemetry can support its own index; aggregate cost and time never stand in for task resources. */
function supportsResourceImputation(
  config: ScoringConfig,
  key: string,
  kind: TaskResourceKind,
): boolean {
  return (
    config.benchmarkPortfolio[key]?.resourcePolicy != null ||
    (indexPolicy(key)?.resources?.imputationKinds.includes(kind) ?? false)
  );
}

export function resourceImputationKeys(config: ScoringConfig, kind: TaskResourceKind): string[] {
  return Object.keys(config.benchmarkPortfolio).filter((key) =>
    supportsResourceImputation(config, key, kind),
  );
}

/** Time falls back to the throughput runtime proxy when wall time is missing; token totals and output-only amounts stay separate. */
export function directTaskResource(
  model: ResourceMetricModel,
  key: string,
  scoringConfig: ScoringConfig,
  kind: TaskResourceKind,
): number | null {
  if (!supportsResourceImputation(scoringConfig, key, kind)) return null;
  const metrics = benchmarkTaskMetrics(model, key);
  if (kind === "tokens" || kind === "output_tokens")
    return directBenchmarkTokens(model, indexPolicy(key)?.resources?.key ?? key, kind);
  return kind === "cost"
    ? positiveFiniteNumber(metrics?.cost)
    : effectiveTaskSeconds(model, metrics);
}

/** The variant key keeps reasoning variants apart after model projection. */
export function imputedTaskResource(
  preparation: EffortResourceImputation,
  model: Pick<ModelAtlasCandidate, "id" | "name" | "reasoning_effort">,
  key: string,
  kind: TaskResourceKind,
): ImputedTaskResource | null {
  return preparation.byVariant.get(canonicalVariantKey(model))?.get(key)?.[kind] ?? null;
}

const PAYLOAD_METRICS = {
  cost: "cost",
  time: "seconds",
  tokens: "tokens",
  output_tokens: "output_tokens",
} as const satisfies Record<TaskResourceKind, ModelAtlasTaskEstimateMetric>;

/** One variant's estimates from every preparation, named as the payload names measured amounts; null when there are none. */
export function taskResourceEstimates(
  preparations: readonly EffortResourceImputation[],
  model: Pick<ModelAtlasCandidate, "id" | "name" | "reasoning_effort">,
): ModelAtlasTaskEstimates | null {
  const estimates: ModelAtlasTaskEstimates = {};
  for (const preparation of preparations) {
    for (const [key, resources] of preparation.byVariant.get(canonicalVariantKey(model)) ?? []) {
      for (const kind of TASK_RESOURCE_KINDS) {
        const estimate = resources[kind];
        if (estimate == null) continue;
        estimates[key] = {
          ...estimates[key],
          [PAYLOAD_METRICS[kind]]: {
            amount: estimate.amount,
            evidence_factor: estimate.evidenceFactor,
          },
        };
      }
    }
  }
  return Object.keys(estimates).length === 0 ? null : estimates;
}
