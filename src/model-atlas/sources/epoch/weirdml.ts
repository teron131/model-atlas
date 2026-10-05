/**
 * WeirdML v3 mirror results from Epoch AI.
 *
 * Page source: https://epoch.ai/benchmarks/weirdml-v3
 * CSV source: https://epoch.ai/data/external_benchmarks/weirdml_v3.csv
 * Benchmark source: https://htihle.github.io/weirdml.html
 * Score field: Score
 */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import { benchmarkModelEffort, canonicalReasoningEffort } from "../../identity/normalization";
import { asFiniteNumber } from "../../runtime";
import { parseCsvRecords } from "../parsing";

/** Parse the v3 official score, never v2 accuracy or the separate final-best metric. */
export function processEpochWeirdMlCsv(csv: string, sourceUrl: string): BenchmarkObservationRow[] {
  const rows: BenchmarkObservationRow[] = [];
  const ids = new Set<string>();
  for (const record of parseCsvRecords(csv)) {
    const id = record["Model version"]?.trim();
    const model = record.Name?.trim();
    const slug = record["Provider slug"]?.trim();
    const effort = canonicalReasoningEffort(record["Reasoning effort"]);
    const agent = record.Agent?.trim();
    const harnesses = record["Harness version"]
      ?.split(";")
      .map((value) => value.trim())
      .filter(Boolean);
    const score = asFiniteNumber(record.Score);
    const low = asFiniteNumber(record["Score 95% CI low"]);
    const high = asFiniteNumber(record["Score 95% CI high"]);
    const runs = asFiniteNumber(record.Runs);
    if (
      !id ||
      ids.has(id) ||
      !model ||
      !slug ||
      !effort ||
      !agent ||
      !harnesses?.length ||
      !harnesses.every(
        (value) => value.startsWith(`${agent}:`) && value.length > agent.length + 1,
      ) ||
      score == null ||
      score < 0 ||
      score > 1 ||
      low == null ||
      low < 0 ||
      low > score ||
      high == null ||
      high < score ||
      high > 1 ||
      runs == null ||
      !Number.isInteger(runs) ||
      runs <= 0
    )
      return [];
    ids.add(id);
    rows.push({
      benchmark_key: "weirdml_v3",
      source_url: sourceUrl,
      model_id: slug,
      model,
      base_model: benchmarkModelEffort(model).baseModel,
      reasoning_effort: effort,
      model_creator: record.Organization?.trim() || null,
      rank: null,
      canonical_value: score,
      observed_at: null,
      metadata: {
        benchmark_version: "3",
        metric: "score",
        source_series: "epoch",
        observation_role: "component",
        source_model_id: id,
        agent,
        harness: agent,
        harness_names: harnesses.map((value) => value.slice(0, value.indexOf(":"))),
        harness_versions: harnesses.map((value) => value.slice(value.indexOf(":") + 1)),
        score_ci_low: low,
        score_ci_high: high,
        runs,
        mean_final_best: asFiniteNumber(record["Max performance"]),
        mean_api_cost_usd: asFiniteNumber(record["Cost per run"]),
        mean_output_tokens: asFiniteNumber(record["Mean output tokens"]),
        source_reference: record.Source || null,
        source_notes: record.Notes || null,
        source_release_date: record["Release date"] || null,
        source_display_name: record["Unique display name"] || record["Display name"] || null,
      },
    });
  }
  return rows;
}

/** Cache eligibility is tied to the v3 mirror URL, official score, and disclosed run configuration. */
export function weirdMlEpochCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  sourceUrl: string,
): boolean {
  return rows.every(
    (row) =>
      row.source_url === sourceUrl &&
      row.benchmark_key === "weirdml_v3" &&
      row.metadata.benchmark_version === "3" &&
      row.metadata.metric === "score" &&
      row.metadata.source_series === "epoch" &&
      row.metadata.observation_role === "component" &&
      typeof row.metadata.source_model_id === "string" &&
      row.metadata.source_model_id.length > 0 &&
      typeof row.metadata.agent === "string" &&
      row.metadata.agent.length > 0 &&
      Array.isArray(row.metadata.harness_names) &&
      row.metadata.harness_names.length > 0 &&
      row.metadata.harness_names.every((value) => typeof value === "string" && value.length > 0) &&
      Array.isArray(row.metadata.harness_versions) &&
      row.metadata.harness_versions.length === row.metadata.harness_names.length &&
      row.metadata.harness_versions.every(
        (value) => typeof value === "string" && value.length > 0,
      ) &&
      Number.isFinite(row.canonical_value) &&
      row.canonical_value >= 0 &&
      row.canonical_value <= 1 &&
      typeof row.metadata.score_ci_low === "number" &&
      row.metadata.score_ci_low >= 0 &&
      row.metadata.score_ci_low <= row.canonical_value &&
      typeof row.metadata.score_ci_high === "number" &&
      row.metadata.score_ci_high >= row.canonical_value &&
      row.metadata.score_ci_high <= 1 &&
      typeof row.metadata.runs === "number" &&
      Number.isInteger(row.metadata.runs) &&
      row.metadata.runs > 0,
  );
}
