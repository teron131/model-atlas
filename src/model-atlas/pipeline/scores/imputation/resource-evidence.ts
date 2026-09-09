/** Resource evidence owns benchmark eligibility, measurement semantics, and estimate lookup shared by sibling ratios, tier priors, and scoring projections. */

import { indexPolicy } from "../../../benchmarks/index-policy";
import type { ScoringConfig } from "../../../config/stage";
import { canonicalModelKey, canonicalReasoningEffort } from "../../../identity/normalization";
import { positiveFiniteNumber } from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import {
  benchmarkTaskMetrics,
  directBenchmarkTokens,
  effectiveTaskSeconds,
} from "../resource-metrics";

export const TASK_RESOURCE_KINDS = ["cost", "time", "tokens", "output_tokens"] as const;

export type TaskResourceKind = (typeof TASK_RESOURCE_KINDS)[number];

export type ImputedTaskResource = {
  amount: number;
  confidence: number;
};

export type EffortResourceImputation = {
  byVariant: ReadonlyMap<
    string,
    ReadonlyMap<string, Partial<Record<TaskResourceKind, ImputedTaskResource>>>
  >;
};

/** AA token telemetry can support its own index; aggregate cost and time never stand in for task resources. */
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

/** Stable lookup survives model projection without merging different reasoning variants. */
export function resourceVariantKey(
  model: Pick<ModelAtlasCandidate, "id" | "name" | "reasoning_effort">,
) {
  return `${canonicalModelKey(model)}\u0000${canonicalReasoningEffort(model.reasoning_effort) ?? ""}`;
}

/** Within-model time ratios retain the existing throughput fallback; token totals and output-only amounts stay separate. */
export function directTaskResource(
  model: ModelAtlasCandidate,
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

/** Look up a validated scoring-only task resource for a projected model variant. */
export function imputedTaskResource(
  preparation: EffortResourceImputation,
  model: Pick<ModelAtlasCandidate, "id" | "name" | "reasoning_effort">,
  key: string,
  kind: TaskResourceKind,
): ImputedTaskResource | null {
  return preparation.byVariant.get(resourceVariantKey(model))?.get(key)?.[kind] ?? null;
}
