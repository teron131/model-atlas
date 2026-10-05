/**
 * WeirdML v3 leaderboard results from the benchmark creator and Epoch AI.
 *
 * Page source: https://htihle.github.io/weirdml.html
 * Mirror page: https://epoch.ai/benchmarks/weirdml-v3
 * JSON source: https://htihle.github.io/assets/data/weirdml_v3.json
 * CSV source: https://epoch.ai/data/external_benchmarks/weirdml_v3.csv
 * Scoring source: https://htihle.github.io/weirdml_scoring.html
 */

import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../benchmarks/observation";
import { benchmarkModelEffort, canonicalReasoningEffort } from "../identity/normalization";
import { asRecord, nowEpochSeconds } from "../runtime";
import { processEpochWeirdMlCsv, weirdMlEpochCacheMatches } from "./epoch/weirdml";
import { fetchSource } from "./request-scheduler";

const VERSION = "3";
const METRIC = "score";
const CONFIGURATIONS = [
  "shapes_generalize",
  "splash_generalize",
  "mystery_box",
  "mystery_box--nohints",
  "ship_detect",
  "ship_tune",
  "reaction_rates",
  "reaction_rates--nohints",
  "scan_stitch",
  "scan_stitch--nohints",
  "shattered_prior",
  "shattered_prior--nohints",
  "night_school",
  "tod_pipeline--nohints",
  "weirdml_bonanza",
] as const;
const DIAGNOSTICS = ["mean_api_cost_usd", "mean_output_tokens", "mean_final_best"] as const;
const CONFIGURATION_DIAGNOSTICS = [
  "final_best",
  "mean_api_cost_usd",
  "mean_tokens",
  "mean_output_tokens",
] as const;

/** Fetch the creator cohort and supporting Epoch mirror independently so one unavailable source cannot discard the other source's raw evidence. */
export async function getWeirdMlStats(
  sourceUrl: string,
  crosswalkSourceUrl: string,
): Promise<BenchmarkObservationPayload> {
  const [creator, epoch] = await Promise.all([
    fetchSource(sourceUrl, {}, 30_000, async (response) =>
      response.ok ? processWeirdMlPayload(await response.json(), sourceUrl) : [],
    ).catch(() => []),
    fetchSource(crosswalkSourceUrl, {}, 30_000, async (response) =>
      response.ok ? processEpochWeirdMlCsv(await response.text(), crosswalkSourceUrl) : [],
    ).catch(() => []),
  ]);
  const data = mergeWeirdMlRows(creator, epoch);
  return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
}

/** Preserve official AUC scores and compact configuration diagnostics, rejecting the entire cohort when any included model lacks a complete real evaluation. */
export function processWeirdMlPayload(
  value: unknown,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const payload = asRecord(value);
  if (
    payload.schema_version !== 1 ||
    payload.mode !== "real" ||
    payload.task_count !== 11 ||
    payload.configuration_count !== CONFIGURATIONS.length ||
    !text(payload.generated) ||
    !Number.isFinite(Date.parse(String(payload.generated))) ||
    !text(payload.source_commit) ||
    !Array.isArray(payload.configurations) ||
    payload.configurations.length !== CONFIGURATIONS.length ||
    !Array.isArray(payload.models) ||
    payload.models.length === 0 ||
    !Array.isArray(payload.excluded_models)
  )
    return [];

  const configurations = new Map<string, Record<string, unknown>>();
  for (const value of payload.configurations) {
    const configuration = asRecord(value);
    const id = text(configuration.id);
    if (
      !id ||
      !CONFIGURATIONS.includes(id as (typeof CONFIGURATIONS)[number]) ||
      configurations.has(id) ||
      configuration.task !== id.split("--")[0] ||
      !text(configuration.name) ||
      !(
        configuration.hint_mode === null ||
        configuration.hint_mode === "Hints allowed" ||
        configuration.hint_mode === "No hints"
      ) ||
      (id.endsWith("--nohints") && configuration.hint_mode !== "No hints")
    )
      return [];
    configurations.set(id, configuration);
  }
  if (new Set([...configurations.values()].map((configuration) => configuration.task)).size !== 11)
    return [];
  const excluded = new Set<string>();
  for (const value of payload.excluded_models) {
    const model = asRecord(value);
    const id = text(model.id);
    if (
      !id ||
      excluded.has(id) ||
      !Array.isArray(model.missing_configurations) ||
      model.missing_configurations.length === 0 ||
      !model.missing_configurations.every((key) =>
        CONFIGURATIONS.includes(key as (typeof CONFIGURATIONS)[number]),
      )
    )
      return [];
    excluded.add(id);
  }

  const rows: BenchmarkObservationRow[] = [];
  const ids = new Set<string>();
  for (const value of payload.models) {
    const model = asRecord(value);
    const id = text(model.id);
    const name = text(model.name);
    const slug = text(model.slug);
    const agent = text(model.agent);
    const effort = canonicalReasoningEffort(model.reasoning_effort);
    const interval = model.interval;
    if (
      !id ||
      ids.has(id) ||
      excluded.has(id) ||
      !name ||
      !slug ||
      !agent ||
      !effort ||
      model.synthetic !== false ||
      !unitScore(model.score) ||
      !Array.isArray(interval) ||
      interval.length !== 2 ||
      !interval.every(unitScore) ||
      interval[0]! > model.score ||
      interval[1]! < model.score ||
      !positiveInteger(model.runs) ||
      !DIAGNOSTICS.every((key) => nonnegativeNumber(model[key])) ||
      !unitScore(model.mean_final_best) ||
      !Array.isArray(model.harnesses) ||
      model.harnesses.length === 0
    )
      return [];
    const harnesses = model.harnesses.map(asRecord);
    if (
      !harnesses.every((harness) => text(harness.name) && text(harness.version)) ||
      !harnesses.some((harness) => harness.name === agent)
    )
      return [];
    const summaries = asRecord(model.configurations);
    if (Object.keys(summaries).length !== CONFIGURATIONS.length) return [];
    const metadata: BenchmarkObservationMetadata = {
      benchmark_version: VERSION,
      metric: METRIC,
      source_series: "creator",
      observation_role: "component",
      schema_version: 1,
      mode: "real",
      source_model_id: id,
      agent,
      harness: agent,
      harness_names: harnesses.map((harness) => String(harness.name)),
      harness_versions: harnesses.map((harness) => String(harness.version)),
      synthetic: false,
      generated: String(payload.generated),
      source_commit: String(payload.source_commit),
      task_count: 11,
      configuration_count: CONFIGURATIONS.length,
      model_count: payload.models.length,
      excluded_model_ids: [...excluded],
      score_ci_low: interval[0] as number,
      score_ci_high: interval[1] as number,
      runs: model.runs as number,
    };
    for (const key of DIAGNOSTICS) metadata[key] = model[key] as number;
    let runs = 0;
    for (const key of CONFIGURATIONS) {
      const summary = asRecord(summaries[key]);
      if (
        !unitScore(summary.score) ||
        !positiveInteger(summary.n) ||
        !CONFIGURATION_DIAGNOSTICS.every((field) => nonnegativeNumber(summary[field])) ||
        !unitScore(summary.final_best)
      )
        return [];
      const configuration = configurations.get(key)!;
      metadata[`configuration_${key}_task`] = String(configuration.task);
      metadata[`configuration_${key}_name`] = String(configuration.name);
      metadata[`configuration_${key}_hint_mode`] = configuration.hint_mode as string | null;
      metadata[`configuration_${key}_score`] = summary.score as number;
      metadata[`configuration_${key}_n`] = summary.n as number;
      for (const field of CONFIGURATION_DIAGNOSTICS)
        metadata[`configuration_${key}_${field}`] = summary[field] as number;
      runs += summary.n as number;
    }
    if (runs !== model.runs) return [];
    ids.add(id);
    rows.push({
      benchmark_key: "weirdml_v3",
      source_url: sourceUrl,
      model_id: slug,
      model: name,
      base_model: benchmarkModelEffort(name).baseModel,
      reasoning_effort: effort,
      model_creator: null,
      rank: rows.length + 1,
      canonical_value: model.score as number,
      observed_at: String(payload.generated),
      metadata,
    });
  }
  const groups = new Map<string, BenchmarkObservationRow[]>();
  for (const row of rows) {
    const key = `${row.model_id}|${row.reasoning_effort}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.metadata.assignment_eligible = false;
      row.metadata.assignment_exclusion = "multiple source configurations for one model and effort";
    }
  }
  return rows;
}

/** Accept only complete v3 caches under the current JSON URL and official metric, excluding former accuracy and mirror rows. */
export function weirdMlCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  sourceUrl: string,
): boolean {
  const configurationCounts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.model_id}|${row.reasoning_effort}`;
    if (row.metadata.assignment_eligible !== false) {
      configurationCounts.set(key, (configurationCounts.get(key) ?? 0) + 1);
    }
  }
  return (
    rows.length > 0 &&
    new Set(rows.map((row) => row.metadata.source_model_id)).size === rows.length &&
    rows.every((row) => {
      const metadata = row.metadata;
      return (
        row.benchmark_key === "weirdml_v3" &&
        row.source_url === sourceUrl &&
        metadata.benchmark_version === VERSION &&
        metadata.metric === METRIC &&
        metadata.source_series === "creator" &&
        metadata.observation_role === "component" &&
        metadata.schema_version === 1 &&
        metadata.mode === "real" &&
        metadata.synthetic === false &&
        positiveInteger(metadata.model_count) &&
        metadata.task_count === 11 &&
        metadata.configuration_count === CONFIGURATIONS.length &&
        text(metadata.source_model_id) != null &&
        text(metadata.harness) != null &&
        text(metadata.source_commit) != null &&
        text(metadata.generated) != null &&
        Number.isFinite(Date.parse(String(metadata.generated))) &&
        Array.isArray(metadata.harness_names) &&
        metadata.harness_names.length > 0 &&
        metadata.harness_names.every((name) => text(name) != null) &&
        Array.isArray(metadata.harness_versions) &&
        metadata.harness_versions.length === metadata.harness_names.length &&
        metadata.harness_versions.every((version) => text(version) != null) &&
        unitScore(row.canonical_value) &&
        unitScore(metadata.score_ci_low) &&
        unitScore(metadata.score_ci_high) &&
        metadata.score_ci_low <= row.canonical_value &&
        metadata.score_ci_high >= row.canonical_value &&
        positiveInteger(metadata.runs) &&
        DIAGNOSTICS.every((key) => nonnegativeNumber(metadata[key])) &&
        unitScore(metadata.mean_final_best) &&
        CONFIGURATIONS.every(
          (key) =>
            unitScore(metadata[`configuration_${key}_score`]) &&
            positiveInteger(metadata[`configuration_${key}_n`]) &&
            metadata[`configuration_${key}_task`] === key.split("--")[0] &&
            CONFIGURATION_DIAGNOSTICS.every((field) =>
              nonnegativeNumber(metadata[`configuration_${key}_${field}`]),
            ),
        ) &&
        CONFIGURATIONS.reduce(
          (runs, key) => runs + Number(metadata[`configuration_${key}_n`]),
          0,
        ) === metadata.runs &&
        (configurationCounts.get(`${row.model_id}|${row.reasoning_effort}`) ?? 0) <= 1
      );
    })
  );
}

/** Validate both retained source series without requiring the mirror to be available on every fetch. */
export function weirdMlSourceCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  sourceUrl: string,
  crosswalkSourceUrl: string,
): boolean {
  const creator = rows.filter((row) => row.metadata.source_series === "creator");
  const epoch = rows.filter((row) => row.metadata.source_series === "epoch");
  return (
    rows.length > 0 &&
    creator.length + epoch.length === rows.length &&
    (creator.length === 0 || weirdMlCacheMatches(creator, sourceUrl)) &&
    weirdMlEpochCacheMatches(epoch, crosswalkSourceUrl)
  );
}

/** Exact provider/model, effort, and agent identities align labels while preserving source scores and disclosed harness versions; ambiguous agents remain raw only. */
export function mergeWeirdMlRows(
  creator: readonly BenchmarkObservationRow[],
  epoch: readonly BenchmarkObservationRow[],
): BenchmarkObservationRow[] {
  const rows = [...creator, ...epoch].map((row) => ({ ...row, metadata: { ...row.metadata } }));
  const groups = new Map<string, BenchmarkObservationRow[]>();
  for (const row of rows) {
    const key = `${row.model_id}|${row.reasoning_effort}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const configurations = new Set(
      group.map((row) =>
        JSON.stringify({
          agent: row.metadata.agent,
          harnesses: [...new Set(row.metadata.harness_names as string[])].sort(),
        }),
      ),
    );
    if (
      configurations.size > 1 ||
      group.some((row) => row.metadata.assignment_eligible === false)
    ) {
      for (const row of group) {
        row.metadata.assignment_eligible = false;
        row.metadata.assignment_exclusion =
          "multiple source configurations for one model and effort";
      }
      continue;
    }
    const canonical = group.find((row) => row.metadata.source_series === "creator");
    if (canonical != null)
      for (const row of group) {
        row.model = canonical.model;
        row.base_model = canonical.base_model;
      }
  }
  return rows;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unitScore(value: unknown): value is number {
  return nonnegativeNumber(value) && value <= 1;
}

function positiveInteger(value: unknown): value is number {
  return nonnegativeNumber(value) && Number.isInteger(value) && value > 0;
}
