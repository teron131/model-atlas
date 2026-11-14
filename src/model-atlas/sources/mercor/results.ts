/**
 * Scrape benchmark leaderboard results from Mercor.
 *
 * Page source: https://www.mercor.com/apex
 */

import type { BenchmarkObservationLoader } from "../../benchmarks/factory";
import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { withClaudeFamily } from "../../identity/claude";
import { canonicalReasoningEffort, modelEffortLabel } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord, nowEpochSeconds } from "../../runtime";
import { extractNextFlightCorpus, flightObjects } from "../parsing";
import { fetchSourceText } from "../request-scheduler";

type MercorLoader = Omit<Extract<BenchmarkObservationLoader, { kind: "mercor" }>, "kind">;

const RESULT_MARKER = '{"model":{"_id":';
const METRIC = "pass-1";

/** Fetch the declared series without substituting a different harness or metric when it is absent. */
export async function getMercorStats(
  benchmarkKey: string,
  source: MercorLoader,
): Promise<BenchmarkObservationPayload> {
  const data = processMercorPageHtml(await fetchSourceText(source.sourceUrl), benchmarkKey, source);
  return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
}

/** Reject cached evidence if the selected metric, source, or harness contract has changed. */
export function mercorCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  source: MercorLoader,
): boolean {
  return rows.every(
    (row) =>
      row.source_url === source.sourceUrl &&
      row.metadata.metric === METRIC &&
      row.metadata.harness === source.harness,
  );
}

/** Decode hydrated results once per model-effort; raw JSON retains sample counts, errors, and noncanonical metrics. */
export function processMercorPageHtml(
  html: string,
  benchmarkKey: string,
  source: MercorLoader,
): BenchmarkObservationRow[] {
  const corpus = `${html}\n${extractNextFlightCorpus(html)}`;
  const rows = new Map<string, BenchmarkObservationRow>();
  for (const raw of flightObjects(corpus, RESULT_MARKER)) {
    const row = parseResult(raw, benchmarkKey, source);
    if (row != null) rows.set(`${row.base_model}\u001f${row.reasoning_effort ?? ""}`, row);
  }
  return [...rows.values()]
    .sort((a, b) => b.canonical_value - a.canonical_value)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function parseResult(
  raw: unknown,
  benchmarkKey: string,
  source: MercorLoader,
): BenchmarkObservationRow | null {
  const result = asRecord(raw);
  const model = asRecord(result.model);
  const name = asNonEmptyString(model.modelName);
  const id = asNonEmptyString(model.modelId);
  if (name == null || id == null || !Array.isArray(result.passScores)) return null;
  const passScore = asRecord(result.passScores.find((item) => asRecord(item).pass === METRIC));
  const harnessScores = Array.isArray(passScore.harnessScores) ? passScore.harnessScores : [];
  const selected =
    source.harness == null
      ? passScore
      : asRecord(harnessScores.find((item) => asRecord(item).harness === source.harness));
  // An unconfigured aggregate must not silently become a mixture of newly introduced harnesses.
  if (source.harness == null && harnessScores.length > 0) return null;
  const score = asFiniteNumber(selected.score);
  if (score == null || score < 0 || score > 100) return null;
  const identity = mercorIdentity(name, model.descriptors, model.effort);
  return {
    benchmark_key: benchmarkKey,
    source_url: source.sourceUrl,
    model_id: id,
    model: identity.model,
    base_model: identity.baseModel,
    reasoning_effort: identity.reasoningEffort,
    model_creator:
      asNonEmptyString(asRecord(model.provider).name) ??
      asNonEmptyString(asRecord(model.provider).providerId),
    rank: null,
    canonical_value: Number((score / 100).toFixed(6)),
    observed_at: null,
    metadata: {
      source_model: name,
      metric: METRIC,
      harness: source.harness,
      reported_error_percentage_points: asFiniteNumber(selected.error),
      reported_sample_count: asFiniteNumber(result.nSamples),
      raw_result_json: JSON.stringify(raw),
    },
  };
}

/** Mercor publishes product qualifiers such as "Pro" or "Thinking" as descriptors beside the display name, joined onto it here (GPT 5.2 with Pro → GPT-5.2 Pro); effort "auto" lets the model decide, which is its default variant. */
function mercorIdentity(name: string, descriptors: unknown, effort: unknown) {
  const qualifiers = Array.isArray(descriptors)
    ? descriptors.flatMap((value) => asNonEmptyString(value) ?? [])
    : [];
  const family = withClaudeFamily(name).replace(/^GPT\s+(\d)/, "GPT-$1");
  const baseModel = [family, ...qualifiers].join(" ");
  const label = canonicalReasoningEffort(effort);
  const reasoningEffort = label === "auto" ? null : label;
  return {
    model: modelEffortLabel(baseModel, reasoningEffort),
    baseModel,
    reasoningEffort,
  };
}
