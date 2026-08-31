/** Benchmark observations preserve source evidence while sharing conservative model-effort matching. */

import {
  benchmarkModelEffort,
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
  cost?: number | null;
  observed_at: string | null;
  metadata: BenchmarkObservationMetadata;
};

export type BenchmarkObservationPayload = {
  fetched_at_epoch_seconds: number | null;
  data: BenchmarkObservationRow[];
};

export type BenchmarkObservationEvidenceRow = Pick<
  BenchmarkObservationRow,
  | "model_id"
  | "model"
  | "base_model"
  | "reasoning_effort"
  | "canonical_value"
  | "cost"
  | "observed_at"
>;

export type BenchmarkObservationsByKey = Record<string, readonly BenchmarkObservationEvidenceRow[]>;

export type BenchmarkObservationLookup<
  Row extends BenchmarkObservationEvidenceRow = BenchmarkObservationRow,
> = Map<string, Row>;

function isNewer<Row extends BenchmarkObservationEvidenceRow>(row: Row, current: Row): boolean {
  return (row.observed_at ?? "") > (current.observed_at ?? "");
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

function modelIdConflictsWithBaseModel(row: BenchmarkObservationEvidenceRow): boolean {
  if (row.model_id == null) return false;
  const modelId = normalizeModelToken(trailingModelAlias(row.model_id) ?? row.model_id);
  const baseModel = normalizeModelToken(row.base_model);
  return (
    modelId !== baseModel &&
    (baseModel.startsWith(`${modelId}-`) || modelId.startsWith(`${baseModel}-`))
  );
}

function modelKeys(row: BenchmarkObservationEvidenceRow): string[] {
  const modelId = modelIdConflictsWithBaseModel(row) ? null : row.model_id;
  return [modelId, row.model, row.base_model]
    .flatMap((value) => {
      if (value == null) return [];
      return [value, trailingModelAlias(value)];
    })
    .filter((value): value is string => value != null)
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

function candidateModelKeys(candidateNames: unknown[]): Set<string> {
  return new Set(
    candidateNames.flatMap((candidate) => {
      if (typeof candidate !== "string" || candidate.length === 0) return [];
      const parsed = benchmarkModelEffort(candidate);
      return [candidate, parsed.baseModel, trailingModelAlias(candidate)]
        .filter((value): value is string => value != null)
        .map(normalizeModelToken)
        .filter((key) => key.length > 0);
    }),
  );
}

/** Return every distinct source observation matched to one model. */
export function findBenchmarkObservations<Row extends BenchmarkObservationEvidenceRow>(
  candidateNames: unknown[],
  rowsByModel: ReadonlyMap<string, Row>,
): Row[] {
  const candidateKeys = candidateModelKeys(candidateNames);
  return [...new Set(rowsByModel.values())].filter((row) =>
    modelKeys(row).some((key) => candidateKeys.has(key)),
  );
}

/** Index one benchmark's eligible rows with exact variants and a source-default base row. */
export function buildBenchmarkObservationLookup<Row extends BenchmarkObservationEvidenceRow>(
  rows: readonly Row[],
): BenchmarkObservationLookup<Row> {
  const rowsByModel = new Map<string, Row>();
  const defaultByBase = new Map<string, Row>();
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
      reasoningEffortRank(row.reasoning_effort) >
        reasoningEffortRank(currentDefault.reasoning_effort) ||
      (reasoningEffortRank(row.reasoning_effort) ===
        reasoningEffortRank(currentDefault.reasoning_effort) &&
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
export function findBenchmarkObservation<Row extends BenchmarkObservationEvidenceRow>(
  candidateNames: unknown[],
  targetReasoningEffort: unknown,
  rowsByModel: ReadonlyMap<string, Row>,
): Row | null {
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
