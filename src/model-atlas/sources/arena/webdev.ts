/**
 * Arena WebDev leaderboard ratings from Arena.
 *
 * Page source: https://arena.ai/leaderboard/code/webdev
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { benchmarkModelEffort, normalizeModelToken } from "../../identity/normalization";
import { hasQwenMaxTier } from "../../identity/qwen";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import {
  extractNextFlightCorpus,
  findObjectEnd,
  parseFlightJsonObject,
  stringValue,
} from "../parsing";
import { fetchSource } from "../request-scheduler";

const SOURCE_URL = "https://arena.ai/leaderboard/code/webdev";
const PAYLOAD_MARKER = '{"arena":{"slug":"code"';

/** Fetch the current Overall human-vote series; failed requests leave cached evidence available. */
export async function getArenaWebDevStats(
  sourceUrl = SOURCE_URL,
): Promise<BenchmarkObservationPayload> {
  try {
    return await fetchSource(sourceUrl, {}, 30_000, async (response) => {
      if (!response.ok) throw new Error(`Arena WebDev scrape failed: ${response.status}`);
      const data = processArenaWebDevPageHtml(await response.text(), sourceUrl);
      return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
    });
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Retain rated configurations separately and exclude ambiguous model-effort assignments without choosing a winner. */
export function processArenaWebDevPageHtml(
  html: string,
  sourceUrl = SOURCE_URL,
): BenchmarkObservationRow[] {
  const corpus = extractNextFlightCorpus(html);
  for (
    let start = corpus.indexOf(PAYLOAD_MARKER);
    start !== -1;
    start = corpus.indexOf(PAYLOAD_MARKER, start + 1)
  ) {
    const end = findObjectEnd(corpus, start);
    if (end === -1) continue;
    const payload = parseFlightJsonObject(corpus.slice(start, end + 1));
    if (asRecord(payload?.arena).routeSlug !== "code/webdev") continue;
    const leaderboard = asRecord(payload?.leaderboard);
    if (
      leaderboard.leaderboardSlug !== "overall" ||
      asRecord(leaderboard.params).category !== "overall"
    )
      continue;
    if (!Array.isArray(leaderboard.entries)) continue;
    const cutoff = stringValue(leaderboard.voteCutoffISOString);
    const observedAt = cutoff && /^\d{4}-\d{2}-\d{2}T/.test(cutoff) ? cutoff.slice(0, 10) : null;
    const rows = new Map<string, BenchmarkObservationRow>();
    for (const entry of leaderboard.entries) {
      const row = webDevRow(entry, sourceUrl, observedAt, cutoff);
      if (row != null) rows.set(String(row.metadata.source_model_id), row);
    }
    const configurations = new Map<string, BenchmarkObservationRow[]>();
    for (const row of rows.values()) {
      const key = `${row.model_creator}|${normalizeModelToken(row.base_model)}|${row.reasoning_effort ?? ""}`;
      const group = configurations.get(key) ?? [];
      group.push(row);
      configurations.set(key, group);
    }
    for (const group of configurations.values()) {
      if (group.length < 2) continue;
      for (const row of group) {
        row.metadata.assignment_eligible = false;
        row.metadata.assignment_exclusion =
          "multiple source configurations for one model and effort";
      }
    }
    if (rows.size > 0) return [...rows.values()];
  }
  return [];
}

/** Keep explicit effort labels and product tiers distinct; opaque configuration IDs supply provenance rather than canonical model identities. */
function webDevRow(
  value: unknown,
  sourceUrl: string,
  observedAt: string | null,
  cutoff: string | null,
): BenchmarkObservationRow | null {
  const entry = asRecord(value);
  const id = stringValue(entry.modelKey);
  const name = stringValue(entry.modelDisplayName);
  const organization = stringValue(entry.modelOrganization);
  const rating = asFiniteNumber(entry.rating);
  const votes = asFiniteNumber(entry.votes);
  const rank = asFiniteNumber(entry.rank);
  if (
    id == null ||
    name == null ||
    organization == null ||
    rating == null ||
    votes == null ||
    !Number.isInteger(votes) ||
    votes <= 0 ||
    rank == null ||
    !Number.isInteger(rank) ||
    rank < 1
  )
    return null;
  const labelledHarness = /\s+\(([^()]+-harness)\)$/i.exec(name);
  const modelName = labelledHarness ? name.slice(0, labelledHarness.index) : name;
  const harness = labelledHarness?.[1] ?? /(?:^|-)([^-]+-harness)(?:-|$)/i.exec(id)?.[1] ?? null;
  const suffix = /^(.*?)-(none|minimal|low|medium|high|xhigh|max)(-(?:\d{4,8}|\d+k))?$/i.exec(
    modelName,
  );
  const thinkingEffort = /\s+\(thinking-(minimal|low|medium|high|xhigh|max)\)$/i.exec(modelName);
  const nonThinking = /\s+\(non-thinking\)$/i.exec(modelName);
  let parsed = benchmarkModelEffort(modelName);
  if (thinkingEffort) {
    parsed = {
      baseModel: modelName.slice(0, thinkingEffort.index),
      reasoningEffort: thinkingEffort[1]!.toLowerCase(),
    };
  } else if (nonThinking) {
    parsed = { baseModel: modelName.slice(0, nonThinking.index), reasoningEffort: "none" };
  } else if (suffix && !(suffix[2] === "max" && hasQwenMaxTier(`${suffix[1]}-max`))) {
    const modelDate = suffix[3]?.endsWith("k") ? "" : (suffix[3] ?? "");
    parsed = {
      baseModel: `${suffix[1]}${modelDate}`,
      reasoningEffort: suffix[2]!.toLowerCase(),
    };
  }
  return {
    benchmark_key: "arena_webdev",
    source_url: sourceUrl,
    model_id: null,
    model: modelName,
    base_model: parsed.baseModel,
    reasoning_effort: parsed.reasoningEffort,
    model_creator: organization,
    rank,
    canonical_value: rating,
    observed_at: observedAt,
    metadata: {
      source_model_id: id,
      source_model_name: name,
      track: "overall",
      harness,
      effort_token_budget: suffix?.[3]?.endsWith("k") ? suffix[3].slice(1) : null,
      votes,
      rating_lower: asFiniteNumber(entry.ratingLower),
      rating_upper: asFiniteNumber(entry.ratingUpper),
      rank_lower: asFiniteNumber(entry.rankLower),
      rank_upper: asFiniteNumber(entry.rankUpper),
      release_type: stringValue(entry.releaseType),
      vote_cutoff: cutoff,
    },
  };
}
