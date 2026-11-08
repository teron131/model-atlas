/**
 * Benchmark results from Epoch AI: its own runs from the bulk benchmark dataset, and external leaderboards it republishes as one CSV per benchmark.
 *
 * CSV source: https://epoch.ai/data/benchmarks.csv
 * External CSV sources: https://epoch.ai/data/external_benchmarks/<benchmark>.csv
 */

import type { EpochRunEligibility } from "../../benchmarks/factory";
import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, nowEpochSeconds } from "../../runtime";
import { parseCsvRecords } from "../parsing";
import { fetchSource } from "../request-scheduler";

const EPOCH_BENCHMARKS_CSV_URL = "https://epoch.ai/data/benchmarks.csv";

let pendingBenchmarkRows: Promise<EpochBenchmarkRowsPayload> | null = null;

type EpochBenchmarkCsvRow = Record<string, string>;

type EpochBenchmarkRowsPayload = {
  fetched_at_epoch_seconds: number | null;
  data: EpochBenchmarkCsvRow[];
};

/** Load one Epoch run benchmark using the task policy declared in the catalog. */
export async function getEpochBenchmarkStats(
  benchmarkKey: BenchmarkObservationRow["benchmark_key"],
  task: string,
  eligibility: EpochRunEligibility = {},
): Promise<BenchmarkObservationPayload> {
  const payload = await fetchEpochBenchmarkRows();
  return {
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    data: epochBenchmarkObservationRows(payload.data, benchmarkKey, task, eligibility),
  };
}

/** Filter shared Epoch run rows through one catalog-declared benchmark task. */
export function epochBenchmarkObservationRows(
  rows: EpochBenchmarkCsvRow[],
  benchmarkKey: BenchmarkObservationRow["benchmark_key"],
  task: string,
  eligibility: EpochRunEligibility = {},
): BenchmarkObservationRow[] {
  const excludedModelIds = new Set(eligibility.excludedModelIds ?? []);
  const scoreRows = rows.flatMap((row) => {
    if (
      row.task !== task ||
      (eligibility.originalTaskName != null &&
        row.original_task_name !== eligibility.originalTaskName) ||
      (eligibility.requireStandardError === true && asFiniteNumber(row.stderr) == null) ||
      (row.id_model_version != null && excludedModelIds.has(row.id_model_version))
    ) {
      return [];
    }
    const scoreRow = epochRunScoreRow(row, benchmarkKey);
    return scoreRow == null ? [] : [scoreRow];
  });
  if (eligibility.latestTaskVersion !== true) return scoreRows;
  const version = newestTaskVersion(scoreRows);
  if (version == null) return [];
  return scoreRows
    .filter((row) => majorMinorVersion(row.metadata.task_version)?.label === version)
    .map((row) => ({ ...row, metadata: { ...row.metadata, benchmark_version: version } }));
}

/** Reject cached runs from a different task or excluded model cohort, and caches that mix task versions. */
export function epochBenchmarkCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  task: string,
  eligibility: EpochRunEligibility = {},
): boolean {
  const excludedModelIds = new Set(eligibility.excludedModelIds ?? []);
  return (
    (eligibility.latestTaskVersion !== true || holdsOneTaskVersion(rows)) &&
    rows.every(
      (row) =>
        row.metadata.task === task &&
        (eligibility.originalTaskName == null ||
          row.metadata.original_task_name === eligibility.originalTaskName) &&
        (eligibility.requireStandardError !== true || row.metadata.stderr != null) &&
        (row.model_id == null || !excludedModelIds.has(row.model_id)),
    )
  );
}

/** Load one external leaderboard Epoch republishes; its rows name models without an effort and carry the source's own score. */
export async function getEpochExternalBenchmarkStats(
  benchmarkKey: BenchmarkObservationRow["benchmark_key"],
  sourceUrl: string,
): Promise<BenchmarkObservationPayload> {
  return fetchSource(sourceUrl, {}, async (response) => {
    if (!response.ok)
      throw new Error(`Epoch external benchmark download failed: ${response.status}`);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: epochExternalBenchmarkRows(await response.text(), benchmarkKey, sourceUrl),
    };
  });
}

function epochExternalBenchmarkRows(
  csv: string,
  benchmarkKey: BenchmarkObservationRow["benchmark_key"],
  sourceUrl: string,
): BenchmarkObservationRow[] {
  return parseCsvRecords(csv).flatMap((record) => {
    const model = record.Name?.trim();
    const score = asFiniteNumber(record.Score);
    if (!model || score == null) return [];
    const parsed = parseModelEffort(model);
    return [
      {
        benchmark_key: benchmarkKey,
        source_url: sourceUrl,
        model_id: record["Model version"]?.trim() || null,
        model,
        base_model: parsed.baseModel,
        reasoning_effort: parsed.reasoningEffort,
        model_creator: record.Organization || null,
        rank: null,
        canonical_value: score,
        observed_at: null,
        metadata: {},
      },
    ];
  });
}

/** Shares only an in-flight CSV request while each Epoch benchmark keeps an independent lifecycle. */
function fetchEpochBenchmarkRows(): Promise<EpochBenchmarkRowsPayload> {
  if (pendingBenchmarkRows == null) {
    pendingBenchmarkRows = requestEpochBenchmarkRows().finally(() => {
      pendingBenchmarkRows = null;
    });
  }
  return pendingBenchmarkRows;
}

async function requestEpochBenchmarkRows(): Promise<EpochBenchmarkRowsPayload> {
  return fetchSource(EPOCH_BENCHMARKS_CSV_URL, {}, async (response) => {
    if (!response.ok) throw new Error(`Epoch benchmark scrape failed: ${response.status}`);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: parseCsvRecords(await response.text()),
    };
  });
}

/** The major.minor version of a task version; patch revisions within it stay comparable. */
function majorMinorVersion(
  version: unknown,
): { label: string; major: number; minor: number } | null {
  const match = typeof version === "string" ? /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(version) : null;
  if (match == null) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return { label: `${major}.${minor}`, major, minor };
}

function newestTaskVersion(rows: readonly BenchmarkObservationRow[]): string | null {
  let newest: ReturnType<typeof majorMinorVersion> = null;
  for (const row of rows) {
    const version = majorMinorVersion(row.metadata.task_version);
    if (
      version != null &&
      (newest == null ||
        version.major > newest.major ||
        (version.major === newest.major && version.minor > newest.minor))
    )
      newest = version;
  }
  return newest?.label ?? null;
}

/** Every row carries the same version label, and that label matches the row's own task version. */
function holdsOneTaskVersion(rows: readonly BenchmarkObservationRow[]): boolean {
  const [version, ...others] = new Set(rows.map((row) => row.metadata.benchmark_version));
  return (
    others.length === 0 &&
    rows.every(
      (row) => version != null && majorMinorVersion(row.metadata.task_version)?.label === version,
    )
  );
}

/** Normalize one successful Epoch run while retaining its exact task/version identity. */
function epochRunScoreRow(
  row: EpochBenchmarkCsvRow,
  benchmarkKey: BenchmarkObservationRow["benchmark_key"],
): BenchmarkObservationRow | null {
  if (row.Status !== "Success") return null;
  const score =
    asFiniteNumber(row.mean_score) ??
    asFiniteNumber(row["Best score (across scorers)"]) ??
    asFiniteNumber(row.best_score);
  const model = row["Unique display name"] || row["Display name"] || row.Model || row.model || "";
  if (score == null || model.length === 0) return null;
  const parsed = parseModelEffort(model);
  return {
    benchmark_key: benchmarkKey,
    source_url: EPOCH_BENCHMARKS_CSV_URL,
    model_id: row.id_model_version || row.model || null,
    model,
    base_model: parsed.baseModel,
    reasoning_effort: parsed.reasoningEffort,
    model_creator: row.Organization || null,
    rank: null,
    canonical_value: score,
    observed_at: row.started_at || null,
    metadata: cleanMetadata(row),
  };
}

function cleanMetadata(row: EpochBenchmarkCsvRow): BenchmarkObservationMetadata {
  return {
    run_id: row.id_runs || null,
    task: row.task || null,
    task_version: row["task version"] || null,
    scores: row.Scores || null,
    stderr: asFiniteNumber(row.stderr),
    best_score: asFiniteNumber(row.best_score),
    original_task_name: row.original_task_name || null,
  };
}
