/** Benchmark observations preserve source evidence while sharing conservative model-effort matching. */

import {
  defaultConfigurationRank,
  normalizeModelToken,
  parseModelEffort,
  reasoningEffortRank,
} from "../identity/normalization";
import { canonicalQwenName } from "../identity/qwen";

export type BenchmarkObservationMetadata = Record<
  string,
  string | number | boolean | null | string[] | number[]
>;

/** Decode persisted observation metadata without admitting arrays or primitive JSON values. */
export function parseBenchmarkObservationMetadata(
  value: unknown,
): BenchmarkObservationMetadata | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as BenchmarkObservationMetadata)
      : null;
  } catch {
    return null;
  }
}

export type BenchmarkResourceAggregate = {
  task_run_count: number;
  total_cost_usd?: number;
  total_tokens?: number;
};

export type BenchmarkObservationRow = Partial<BenchmarkResourceAggregate> & {
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
  tokens_per_task?: number | null;
  observed_at: string | null;
  metadata: BenchmarkObservationMetadata;
};

export function resourcePerTaskRun(total: number, taskRunCount: number): number {
  return Number((total / taskRunCount).toFixed(6));
}

export type BenchmarkObservationPayload = {
  fetched_at_epoch_seconds: number | null;
  data: BenchmarkObservationRow[];
};

export type BenchmarkObservationEvidenceRow = Partial<BenchmarkResourceAggregate> &
  Pick<
    BenchmarkObservationRow,
    | "model_id"
    | "model"
    | "base_model"
    | "reasoning_effort"
    | "canonical_value"
    | "cost"
    | "tokens_per_task"
    | "observed_at"
  > & {
    metadata?: BenchmarkObservationMetadata;
  };

export type BenchmarkObservationsByKey = Record<string, readonly BenchmarkObservationEvidenceRow[]>;

export type BenchmarkObservationLookup<
  Row extends BenchmarkObservationEvidenceRow = BenchmarkObservationRow,
> = Map<string, Row>;

export type BenchmarkObservationGroupLookup<
  Row extends BenchmarkObservationEvidenceRow = BenchmarkObservationRow,
> = {
  rows: readonly Row[];
  rowsByModel: ReadonlyMap<string, readonly Row[]>;
};

function isNewer<Row extends BenchmarkObservationEvidenceRow>(row: Row, current: Row): boolean {
  return (row.observed_at ?? "") > (current.observed_at ?? "");
}

/** Component and ambiguous configuration observations retain provenance without entering model assignment or display defaults. */
export function isAssignableBenchmarkObservation(
  row: Pick<BenchmarkObservationEvidenceRow, "metadata">,
): boolean {
  return (
    row.metadata?.observation_role !== "component" && row.metadata?.assignment_eligible !== false
  );
}

/** Rows sharing a configuration key are conflicting source configurations: all stay inspectable, none is scored, and a row without a source model id keeps its own stored identity through its source label. */
export function excludeAmbiguousConfigurations<Row extends BenchmarkObservationRow>(
  rows: readonly Row[],
  configurationKey: (row: Row) => string,
): Row[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = configurationKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((row) =>
    (counts.get(configurationKey(row)) ?? 0) < 2
      ? row
      : {
          ...row,
          metadata: {
            ...row.metadata,
            ...(row.metadata.source_model_id == null ? { source_model: row.model } : {}),
            assignment_eligible: false,
            assignment_exclusion: "multiple source configurations for one model and effort",
          },
        },
  );
}

/** Return the text after the last slash outside parentheses, so configuration labels stay whole: `"anthropic/claude-opus-4 (adaptive/max)"` → `"claude-opus-4 (adaptive/max)"`. */
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

/** A source's zero minor version also answers to the bare major release, as "Claude Fable 5.0" for "Claude Fable 5"; catalog names keep theirs, as "Beam 1.0". */
function baseModelNames(row: BenchmarkObservationEvidenceRow): string[] {
  const model = parseModelEffort(row.model).baseModel;
  return [row.base_model, model, canonicalQwenName(model), model.replace(/(\d)\.0(?!\d)/g, "$1")];
}

function modelKeys(row: BenchmarkObservationEvidenceRow): string[] {
  const modelId = modelIdConflictsWithBaseModel(row) ? null : row.model_id;
  return [modelId, row.model, ...baseModelNames(row)]
    .flatMap((value) => {
      if (value == null) return [];
      return [value, trailingModelAlias(value)];
    })
    .filter((value): value is string => value != null)
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

/** Normalize a model's names once so lookups across every benchmark reuse the same keys. */
export function candidateModelKeys(candidateNames: unknown[]): ReadonlySet<string> {
  return new Set(
    candidateNames.flatMap((candidate) => {
      if (typeof candidate !== "string" || candidate.length === 0) return [];
      const parsed = parseModelEffort(candidate);
      return [candidate, parsed.baseModel, trailingModelAlias(candidate)]
        .filter((value): value is string => value != null)
        .map(normalizeModelToken)
        .filter((key) => key.length > 0);
    }),
  );
}

/** Return all matching efforts in source order without renormalizing every benchmark row for each model. */
export function findBenchmarkObservations<Row extends BenchmarkObservationEvidenceRow>(
  candidateKeys: ReadonlySet<string>,
  lookup: BenchmarkObservationGroupLookup<Row>,
): Row[] {
  if (lookup.rows.length === 0) return [];
  const matches = new Set([...candidateKeys].flatMap((key) => lookup.rowsByModel.get(key) ?? []));
  return matches.size === 0 ? [] : lookup.rows.filter((row) => matches.has(row));
}

/** Index each retained exact observation under its model aliases while preserving the single-observation lookup's precedence. */
export function buildBenchmarkObservationGroupLookup<Row extends BenchmarkObservationEvidenceRow>(
  observations: readonly Row[],
): BenchmarkObservationGroupLookup<Row> {
  const rows = [...new Set(buildBenchmarkObservationLookup(observations).values())];
  const rowsByModel = new Map<string, Row[]>();
  for (const row of rows) {
    for (const key of modelKeys(row)) {
      const matches = rowsByModel.get(key) ?? [];
      matches.push(row);
      rowsByModel.set(key, matches);
    }
  }
  return { rows, rowsByModel };
}

/** Index one benchmark's eligible rows with exact variants and a source-default base row. */
export function buildBenchmarkObservationLookup<Row extends BenchmarkObservationEvidenceRow>(
  rows: readonly Row[],
): BenchmarkObservationLookup<Row> {
  const rowsByModel = new Map<string, Row>();
  const defaultByBase = new Map<string, Row>();
  for (const row of rows) {
    if (!isAssignableBenchmarkObservation(row)) continue;
    for (const key of modelKeys(row)) {
      const exactKey =
        row.reasoning_effort == null ? key : `${key}--${normalizeModelToken(row.reasoning_effort)}`;
      const current = rowsByModel.get(exactKey);
      if (current == null || isNewer(row, current)) {
        rowsByModel.set(exactKey, row);
      }
    }
    const rank = defaultConfigurationRank(row.reasoning_effort);
    if (rank == null) continue;
    for (const baseKey of new Set(baseModelNames(row).map(normalizeModelToken))) {
      const currentDefault = defaultByBase.get(baseKey);
      const currentRank = reasoningEffortRank(currentDefault?.reasoning_effort);
      if (
        currentDefault == null ||
        rank > currentRank ||
        (rank === currentRank && isNewer(row, currentDefault))
      ) {
        defaultByBase.set(baseKey, row);
      }
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
    const parsed = parseModelEffort(candidate);
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
