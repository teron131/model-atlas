/**
 * WeirdML leaderboard results from the benchmark creator and Epoch AI.
 *
 * Benchmark source: https://htihle.github.io/weirdml.html
 * Creator CSV source: https://htihle.github.io/data/weirdml_data.csv
 * Epoch page source: https://epoch.ai/benchmarks/weirdml?tab=leaderboard&metric=Accuracy
 * Epoch CSV source: https://epoch.ai/data/external_benchmarks/weirdml.csv
 * Score fields: avg_acc (creator), Accuracy (Epoch)
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../benchmarks/observation";
import {
  benchmarkModelEffort,
  canonicalReasoningEffort,
  normalizeModelToken,
} from "../identity/normalization";
import { asFiniteNumber, nowEpochSeconds } from "../runtime";
import {
  processEpochWeirdMlCsv,
  WEIRDML_EPOCH_CSV_URL,
  type WeirdMlEpochRow,
} from "./epoch/weirdml";
import { parseCsvRecords } from "./parsing";
import { fetchSource } from "./request-scheduler";

const WEIRDML_CREATOR_CSV_URL = "https://htihle.github.io/data/weirdml_data.csv";

const DEFAULT_TIMEOUT_MS = 30_000;

const TASK_COLUMNS = [
  "shapes_easy_acc",
  "shapes_hard_acc",
  "digits_unsup_acc",
  "chess_winners_acc",
  "kolmo_shuffle_acc",
  "classify_sentences_acc",
  "classify_shuffled_acc",
  "insert_patches_acc",
  "blunders_easy_acc",
  "blunders_hard_acc",
  "digits_generalize_acc",
  "shapes_variable_acc",
  "xor_easy_acc",
  "xor_hard_acc",
  "splash_easy_acc",
  "splash_hard_acc",
  "number_patterns_acc",
] as const;

type WeirdMlCrosswalkMatch = {
  primaryIndex: number;
  epochIndex: number;
};

type WeirdMlCrosswalkStatus = {
  primaryRowCount: number;
  epochRowCount: number;
  matchedRowCount: number;
  coverage: number;
  ambiguousEpochModels: string[];
  epochOnlyRowCount: number;
  addedEpochRowCount: number;
};

type WeirdMlMergePlan = {
  status: WeirdMlCrosswalkStatus;
  matches: WeirdMlCrosswalkMatch[];
  addedEpochIndices: number[];
};

type WeirdMlPayload = BenchmarkObservationPayload & {
  crosswalk: WeirdMlCrosswalkStatus | null;
};

type WeirdMlScraperOptions = {
  creatorUrl?: string;
  epochUrl?: string;
  timeoutMs?: number;
};

/** Fetch both source datasets and reconcile model aliases without treating matching scores as a prerequisite for identity. */
export async function getWeirdMlStats(
  options: WeirdMlScraperOptions = {},
): Promise<WeirdMlPayload> {
  try {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const epochRequest = fetchSource(
      options.epochUrl ?? WEIRDML_EPOCH_CSV_URL,
      {},
      timeoutMs,
      async (response) => {
        if (!response.ok) return { text: null };
        // Missing mirrors allow primary-only results; interrupted mirror bodies still reject the refresh.
        return response.text().then(
          (text) => ({ text }),
          (error: unknown) => ({ error }),
        );
      },
    ).catch(() => ({ text: null }));
    const creatorCsv = await fetchSource(
      options.creatorUrl ?? WEIRDML_CREATOR_CSV_URL,
      {},
      timeoutMs,
      async (response) => {
        if (!response.ok) {
          throw new Error(`WeirdML creator scrape failed: ${response.status}`);
        }
        return response.text();
      },
    );
    const primaryRows = processWeirdMlCsv(creatorCsv);
    if (primaryRows.length === 0) {
      throw new Error("WeirdML creator scrape returned no current-schema rows");
    }
    const epochResult = await epochRequest;
    if ("error" in epochResult) throw epochResult.error;
    const epochRows = epochResult.text == null ? [] : processEpochWeirdMlCsv(epochResult.text);
    if (epochRows.length === 0) {
      return {
        fetched_at_epoch_seconds: nowEpochSeconds(),
        data: primaryRows,
        crosswalk: null,
      };
    }
    const merged = mergeWeirdMlRows(primaryRows, epochRows);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      ...merged,
    };
  } catch {
    return {
      fetched_at_epoch_seconds: null,
      data: [],
      crosswalk: null,
    };
  }
}

/** Parse WeirdML's current 17-task creator schema and preserve task-level evidence. */
export function processWeirdMlCsv(csv: string): BenchmarkObservationRow[] {
  const records = parseCsvRecords(csv);
  const firstRecord = records[0];
  if (firstRecord == null || TASK_COLUMNS.some((column) => !Object.hasOwn(firstRecord, column))) {
    return [];
  }
  return records.flatMap((row, index) => {
    const score = asFiniteNumber(row.avg_acc);
    const model = row.display_name?.trim() || row.internal_model_name?.trim();
    if (score == null || model == null || model.length === 0) return [];
    const parsed = benchmarkModelEffort(model);
    const taskScores = Object.fromEntries(
      TASK_COLUMNS.map((key) => [key, asFiniteNumber(row[key])]),
    );
    return [
      {
        benchmark_key: "weirdml",
        source_url: WEIRDML_CREATOR_CSV_URL,
        model_id: row.model_slug?.trim() || row.internal_model_name?.trim() || null,
        model,
        base_model: parsed.baseModel,
        reasoning_effort: parsed.reasoningEffort,
        model_creator: null,
        rank: index + 1,
        canonical_value: score,
        observed_at: row.release_date?.trim() || null,
        metadata: {
          weirdml_origin: "creator",
          internal_model_name: row.internal_model_name?.trim() || null,
          ...taskScores,
          cost_per_run_usd: asFiniteNumber(row.cost_per_run_usd),
          mean_total_output_tokens: asFiniteNumber(row.mean_total_output_tokens),
          code_len_p10: asFiniteNumber(row.code_len_p10),
          code_len_p50: asFiniteNumber(row.code_len_p50),
          code_len_p90: asFiniteNumber(row.code_len_p90),
          exec_time_median_s: asFiniteNumber(row.exec_time_median_s),
        },
      },
    ];
  });
}

/** Reconcile unambiguous model identities while retaining both source values for downstream 50/50 fusion. */
export function mergeWeirdMlRows(
  primaryRows: readonly BenchmarkObservationRow[],
  epochRows: readonly WeirdMlEpochRow[],
): { data: BenchmarkObservationRow[]; crosswalk: WeirdMlCrosswalkStatus } {
  const plan = buildWeirdMlCrosswalk(primaryRows, epochRows);
  const matchByEpoch = new Map(plan.matches.map((match) => [match.epochIndex, match]));
  const eligible = new Set([...matchByEpoch.keys(), ...plan.addedEpochIndices]);
  const mirrors = epochRows.map((epoch, index) => {
    const row = epochBenchmarkRow(epoch);
    const match = matchByEpoch.get(index);
    const primary = match == null ? null : primaryRows[match.primaryIndex];
    return {
      ...row,
      ...(primary == null
        ? {}
        : {
            model: primary.model,
            base_model: primary.base_model,
            reasoning_effort: primary.reasoning_effort,
          }),
      metadata: {
        ...row.metadata,
        observation_role: "component",
        fusion_eligible: eligible.has(index),
        identity_contract: "model-effort",
        weirdml_epoch_crosswalk: match == null ? null : "identity",
      },
    };
  });
  return { data: [...primaryRows, ...mirrors], crosswalk: plan.status };
}

/** Pair model aliases only at the same effort; score, cost, code length, and release metadata never establish identity. */
function buildWeirdMlCrosswalk(
  primaryRows: readonly BenchmarkObservationRow[],
  epochRows: readonly WeirdMlEpochRow[],
): WeirdMlMergePlan {
  const primaryAliases = primaryRows.map(primaryIdentityAliases);
  const candidates = epochRows.map((row) => {
    const aliases = identityAliases([...row.aliases, configurationKey(row)]);
    return primaryAliases.flatMap((primary, index) =>
      canonicalReasoningEffort(primaryRows[index]!.reasoning_effort) ===
        canonicalReasoningEffort(row.reasoning_effort) &&
      aliases.some((alias) => primary.includes(alias))
        ? [index]
        : [],
    );
  });
  const claims = new Map<number, number>();
  for (const indexes of candidates) {
    for (const index of indexes) claims.set(index, (claims.get(index) ?? 0) + 1);
  }
  const matches: WeirdMlCrosswalkMatch[] = [];
  const ambiguous = new Set<number>();
  const unmatched: number[] = [];
  candidates.forEach((indexes, epochIndex) => {
    if (indexes.length === 0) unmatched.push(epochIndex);
    else if (indexes.length === 1 && claims.get(indexes[0]!) === 1)
      matches.push({ primaryIndex: indexes[0]!, epochIndex });
    else ambiguous.add(epochIndex);
  });
  const primaryKeys = new Set(primaryRows.map(configurationKey));
  const epochCounts = new Map<string, number>();
  for (const index of unmatched) {
    const key = configurationKey(epochRows[index]!);
    epochCounts.set(key, (epochCounts.get(key) ?? 0) + 1);
  }
  const addedEpochIndices = unmatched.filter((index) => {
    const key = configurationKey(epochRows[index]!);
    return key.length > 0 && !primaryKeys.has(key) && epochCounts.get(key) === 1;
  });
  const overlapSize = Math.min(primaryRows.length, epochRows.length);
  return {
    matches,
    addedEpochIndices,
    status: {
      primaryRowCount: primaryRows.length,
      epochRowCount: epochRows.length,
      matchedRowCount: matches.length,
      coverage: overlapSize === 0 ? 0 : matches.length / overlapSize,
      ambiguousEpochModels: [...ambiguous].map((index) => epochRows[index]!.model_version),
      epochOnlyRowCount: unmatched.length,
      addedEpochRowCount: addedEpochIndices.length,
    },
  };
}

function primaryIdentityAliases(row: BenchmarkObservationRow): string[] {
  return identityAliases([
    row.metadata.internal_model_name,
    row.model_id,
    row.model,
    configurationKey(row),
  ]);
}

function identityAliases(values: readonly unknown[]) {
  return [
    ...new Set(
      values.flatMap((value) => {
        if (typeof value !== "string" || value.length === 0) return [];
        const normalized = normalizeModelToken(value);
        const undated = normalized.replace(/-20\d{6}(?=-|$)/g, "");
        const canonical = (alias: string) =>
          alias
            .replace(/^claude-opus-(\d(?:-\d+)?)(?=-|$)/, "claude-$1-opus")
            .replace(/-16k-thinking(?=-|$)/g, "-thinking-16k");
        return [normalized, undated, canonical(normalized), canonical(undated)];
      }),
    ),
  ];
}

function configurationKey(row: { base_model: string; reasoning_effort: string | null }): string {
  const baseModel = normalizeModelToken(row.base_model);
  const effort = normalizeModelToken(row.reasoning_effort ?? "default");
  return baseModel.length === 0 ? "" : `${baseModel}--${effort}`;
}

function epochBenchmarkRow(row: WeirdMlEpochRow): BenchmarkObservationRow {
  return {
    benchmark_key: "weirdml",
    source_url: WEIRDML_EPOCH_CSV_URL,
    model_id: row.model_version,
    model: row.name,
    base_model: row.base_model,
    reasoning_effort: row.reasoning_effort,
    model_creator: row.provider,
    rank: null,
    canonical_value: row.accuracy,
    observed_at: row.observed_at,
    metadata: {
      weirdml_origin: "epoch",
      epoch_model_version: row.model_version,
      source_model_id: `epoch:${row.model_version}`,
      cost_per_run_usd: row.cost_per_run_usd,
      code_len_p50: row.code_len_p50,
    },
  };
}
