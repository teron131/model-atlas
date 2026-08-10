/** Benchmark observations preserve source evidence while sharing conservative model-effort matching. */

import {
  benchmarkModelEffort,
  canonicalReasoningEffort,
  normalizeModelToken,
  reasoningEffortRank,
} from "../identity/normalization";

export type BenchmarkObservationMetadata = Record<
  string,
  string | number | boolean | null | string[] | number[]
>;

/** Direct benchmark evidence normalized for matching, scoring, and freshness. */
export type BenchmarkObservationRow = {
  benchmark_key: string;
  source_url: string;
  model_id: string | null;
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  model_creator: string | null;
  rank: number | null;
  canonical_value: number;
  observed_at: string | null;
  metadata: BenchmarkObservationMetadata;
};

export type BenchmarkObservationPayload = {
  fetched_at_epoch_seconds: number | null;
  data: BenchmarkObservationRow[];
};

export type BenchmarkObservationLookup = Map<string, BenchmarkObservationRow>;

function isNewer(row: BenchmarkObservationRow, current: BenchmarkObservationRow): boolean {
  return (row.observed_at ?? "") > (current.observed_at ?? "");
}

/** Prefer an explicit highest effort over an unlabelled source row when both configurations exist. */
function defaultEffortRank(value: unknown): number {
  const effort = canonicalReasoningEffort(value);
  return effort == null ? -1 : reasoningEffortRank(effort);
}

/** Return the final provider or composite-model alias without splitting configuration labels. */
function trailingModelAlias(value: string): string | null {
  let parenthesisDepth = 0;
  let slashIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    } else if (character === "/" && parenthesisDepth === 0) {
      slashIndex = index;
    }
  }
  if (slashIndex === -1) return null;
  const alias = value.slice(slashIndex + 1).trim();
  return alias.length > 0 ? alias : null;
}

function modelKeys(row: BenchmarkObservationRow): string[] {
  return [row.model_id, row.model, row.base_model]
    .flatMap((value) => {
      if (value == null) return [];
      return [value, trailingModelAlias(value)];
    })
    .filter((value): value is string => value != null)
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

/** Index one benchmark's eligible rows with exact variants and a source-default base row. */
export function buildBenchmarkObservationLookup(
  rows: readonly BenchmarkObservationRow[],
): BenchmarkObservationLookup {
  const rowsByModel = new Map<string, BenchmarkObservationRow>();
  const defaultByBase = new Map<string, BenchmarkObservationRow>();
  for (const row of rows) {
    for (const key of modelKeys(row)) {
      const exactKey =
        row.reasoning_effort == null ? key : `${key}--${normalizeModelToken(row.reasoning_effort)}`;
      const current = rowsByModel.get(exactKey);
      if (current == null || isNewer(row, current)) {
        rowsByModel.set(exactKey, row);
      }
    }
    const baseKey = normalizeModelToken(row.base_model);
    const currentDefault = defaultByBase.get(baseKey);
    if (
      currentDefault == null ||
      defaultEffortRank(row.reasoning_effort) >
        defaultEffortRank(currentDefault.reasoning_effort) ||
      (defaultEffortRank(row.reasoning_effort) ===
        defaultEffortRank(currentDefault.reasoning_effort) &&
        isNewer(row, currentDefault))
    ) {
      defaultByBase.set(baseKey, row);
    }
  }
  for (const [baseKey, row] of defaultByBase) {
    rowsByModel.set(baseKey, row);
  }
  return rowsByModel;
}

/** Find one observation without borrowing a different labelled effort variant. */
export function findBenchmarkObservation(
  candidateNames: unknown[],
  targetReasoningEffort: unknown,
  rowsByModel: ReadonlyMap<string, BenchmarkObservationRow>,
): BenchmarkObservationRow | null {
  const targetEffort =
    typeof targetReasoningEffort === "string" ? normalizeModelToken(targetReasoningEffort) : null;
  for (const candidate of candidateNames) {
    if (typeof candidate !== "string" || candidate.length === 0) continue;
    const parsed = benchmarkModelEffort(candidate);
    const effort =
      parsed.reasoningEffort == null ? targetEffort : normalizeModelToken(parsed.reasoningEffort);
    for (const value of [candidate, parsed.baseModel, trailingModelAlias(candidate)]) {
      if (value == null) continue;
      const key = normalizeModelToken(value);
      const exactRow = effort == null ? null : rowsByModel.get(`${key}--${effort}`);
      const defaultRow = rowsByModel.get(key);
      const row =
        effort == null || defaultRow?.reasoning_effort == null
          ? (exactRow ?? defaultRow)
          : exactRow;
      if (row != null) return row;
    }
  }
  return null;
}
