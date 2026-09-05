/** Check the published payload's structural envelope at snapshot and browser ingress without rebuilding or reordering source data. */

import type { ModelAtlasPayload } from "../types";

/** Reject truncated payloads and incompatible public views before consumers access metadata or model scores. */
export function isModelAtlasPayload(value: unknown): value is ModelAtlasPayload {
  if (!isRecord(value)) return false;
  if (
    value.fetched_at_epoch_seconds !== null &&
    !Number.isSafeInteger(value.fetched_at_epoch_seconds)
  )
    return false;
  const metadata = value.metadata;
  if (!isRecord(metadata) || !isRecord(metadata.available_metrics)) return false;
  if (!isStringArray(metadata.available_metrics.benchmark_keys)) return false;
  const scoring = metadata.scoring;
  if (!isRecord(scoring)) return false;
  for (const key of [
    "intelligence_benchmark_keys",
    "intelligence_benchmark_display_keys",
    "missing_intelligence_benchmark_keys",
    "agentic_benchmark_keys",
    "agentic_benchmark_display_keys",
    "missing_agentic_benchmark_keys",
    "selected_benchmark_keys",
  ]) {
    if (!isStringArray(scoring[key])) return false;
  }
  if (
    !isRecord(scoring.benchmark_portfolio) ||
    !isRecord(scoring.quality_coverage) ||
    !isRecord(scoring.column_tooltips) ||
    !Number.isFinite(scoring.agentic_token_modifier_cap) ||
    !Number.isSafeInteger(scoring.snapshot_preservation_version)
  )
    return false;
  return Array.isArray(value.models) && value.models.every(hasModelStructure);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasModelStructure(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.scores)) return false;
  for (const key of ["id", "name", "provider", "reasoning_effort", "release_date"]) {
    if (value[key] != null && typeof value[key] !== "string") return false;
  }
  for (const key of ["intelligence_score", "agentic_score", "speed_score", "value_score"]) {
    const score = value.scores[key];
    if (
      score === null &&
      (value.preview === true || key === "speed_score" || key === "value_score")
    )
      continue;
    if (typeof score !== "number" || !Number.isFinite(score)) return false;
  }
  return true;
}
