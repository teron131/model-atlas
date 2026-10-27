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
import { canonicalReasoningEffort, parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord, nowEpochSeconds } from "../../runtime";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../parsing";
import { fetchSource } from "../request-scheduler";

type MercorLoader = Omit<Extract<BenchmarkObservationLoader, { kind: "mercor" }>, "kind">;

const RESULT_MARKER = '{"model":{"_id":';
const METRIC = "pass-1";

/** Fetch the declared series without substituting a different harness or metric when it is absent. */
export async function getMercorStats(
  benchmarkKey: string,
  source: MercorLoader,
  timeoutMs = 30_000,
): Promise<BenchmarkObservationPayload> {
  try {
    return await fetchSource(source.sourceUrl, {}, timeoutMs, async (response) => {
      if (!response.ok) throw new Error(`Mercor scrape failed: ${response.status}`);
      const data = processMercorPageHtml(await response.text(), benchmarkKey, source);
      return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
    });
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
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
  for (
    let start = corpus.indexOf(RESULT_MARKER);
    start !== -1;
    start = corpus.indexOf(RESULT_MARKER, start + 1)
  ) {
    const end = findObjectEnd(corpus, start);
    if (end === -1) continue;
    const raw = parseFlightJsonObject(corpus.slice(start, end + 1));
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
  const identity = mercorIdentity(name, model.effort);
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

/** Keep Mercor's labelled Pro configurations distinct while preferring explicit effort fields over display suffixes. */
function mercorIdentity(name: string, effort: unknown) {
  const pro = name.toLowerCase().includes("max + pro");
  const reasoningEffort =
    canonicalReasoningEffort(effort) ??
    (pro || name.toLowerCase().includes("(thinking)")
      ? "max"
      : parseModelEffort(name).reasoningEffort);
  const unqualified = name.replace(/\s+\([^)]*\)\s*$/, "").trim();
  const baseModel = (
    /^(?:Opus|Sonnet|Fable)\b/.test(unqualified) ? `Claude ${unqualified}` : unqualified
  ).replace(/^GPT\s+(\d)/, "GPT-$1");
  return {
    model: pro
      ? `${baseModel} (Max + Pro)`
      : reasoningEffort == null
        ? baseModel
        : `${baseModel} (${reasoningEffort})`,
    baseModel: pro ? `${baseModel} Pro` : baseModel,
    reasoningEffort,
  };
}
