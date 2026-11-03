/**
 * Arena WebDev leaderboard ratings from Arena.
 *
 * Page source: https://arena.ai/leaderboard/code/webdev
 * Dataset source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/viewer/webdev/latest
 */

import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  excludeAmbiguousConfigurations,
} from "../../benchmarks/observation";
import {
  normalizeModelToken,
  parseModelEffort,
  parseSlugEffort,
} from "../../identity/normalization";
import { providerIdentityKey } from "../../identity/provider";
import { asFiniteNumber, asNonEmptyString, asRecord, nowEpochSeconds } from "../../runtime";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../parsing";
import { fetchSource } from "../request-scheduler";
import {
  ARENA_WEBDEV_DATASET_URL,
  arenaBoardNames,
  arenaDatasetIdentity,
  fetchArenaDataset,
} from "./dataset";

const SOURCE_URL = "https://arena.ai/leaderboard/code/webdev";
const PAYLOAD_MARKER = '{"arena":{"slug":"code"';

/** Prefer the live Overall series; the dated official dataset is used only when the website cannot supply rows. */
export async function getArenaWebDevStats(
  sourceUrl = SOURCE_URL,
): Promise<BenchmarkObservationPayload> {
  try {
    return await fetchSource(sourceUrl, {}, 30_000, async (response) => {
      if (!response.ok) throw new Error(`Arena WebDev scrape failed: ${response.status}`);
      const data = processArenaWebDevPageHtml(await response.text(), sourceUrl);
      if (data.length === 0) throw new Error("Arena WebDev website has no usable rows");
      return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
    });
  } catch {
    const data = processArenaWebDevDatasetRows(await fetchArenaDataset("webdev"));
    return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
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
    const cutoff = asNonEmptyString(leaderboard.voteCutoffISOString);
    const observedAt = cutoff && /^\d{4}-\d{2}-\d{2}T/.test(cutoff) ? cutoff.slice(0, 10) : null;
    const rows = new Map<string, BenchmarkObservationRow>();
    for (const entry of leaderboard.entries) {
      const row = webDevRow(entry, sourceUrl, observedAt, cutoff);
      if (row != null) rows.set(String(row.metadata.source_model_id), row);
    }
    if (rows.size > 0)
      return excludeAmbiguousConfigurations(
        [...rows.values()],
        (row) =>
          `${row.model_creator}|${normalizeModelToken(row.base_model)}|${row.reasoning_effort ?? ""}`,
      );
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
  const id = asNonEmptyString(entry.modelKey);
  const name = asNonEmptyString(entry.modelDisplayName);
  const organization = asNonEmptyString(entry.modelOrganization);
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
  // A slug's effort may be followed by a release date, which stays in identity, or a thinking budget, which does not.
  const trailer = /-(?:\d{4,8}|\d+k)$/i.exec(modelName)?.[0] ?? "";
  const slug = parseSlugEffort(modelName.slice(0, modelName.length - trailer.length));
  const budget = slug.reasoningEffort != null && /k$/i.test(trailer) ? trailer.slice(1) : null;
  const parsed =
    slug.reasoningEffort == null
      ? parseModelEffort(modelName)
      : {
          baseModel: budget == null ? `${slug.baseModel}${trailer}` : slug.baseModel,
          reasoningEffort: slug.reasoningEffort,
        };
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
      effort_token_budget: budget,
      votes,
      rating_lower: asFiniteNumber(entry.ratingLower),
      rating_upper: asFiniteNumber(entry.ratingUpper),
      rank_lower: asFiniteNumber(entry.rankLower),
      rank_upper: asFiniteNumber(entry.rankUpper),
      release_type: asNonEmptyString(entry.releaseType),
      vote_cutoff: cutoff,
    },
  };
}

/** Preserve the official fallback's disclosed identity and publication without asserting website configuration equivalence. */
export function processArenaWebDevDatasetRows(
  values: Record<string, unknown>[],
): BenchmarkObservationRow[] {
  const rows: BenchmarkObservationRow[] = [];
  const occurrences = new Map<string, number>();
  const overall = values.filter((value) => value.category === "overall");
  const boardNames = arenaBoardNames(overall);
  for (const value of overall) {
    const name = asNonEmptyString(value.model_name);
    const organization = asNonEmptyString(value.organization);
    const rating = asFiniteNumber(value.rating);
    const votes = asFiniteNumber(value.vote_count);
    const rank = asFiniteNumber(value.rank);
    const observedAt = asNonEmptyString(value.leaderboard_publish_date);
    if (
      name == null ||
      rating == null ||
      votes == null ||
      !Number.isInteger(votes) ||
      votes <= 0 ||
      rank == null ||
      !Number.isInteger(rank) ||
      rank < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(observedAt ?? "")
    )
      throw new Error("Invalid Arena WebDev dataset row");
    const identity = arenaDatasetIdentity(name, boardNames);
    const sourceIdentity = `${organization ?? ""}:${name}`;
    const occurrence = (occurrences.get(sourceIdentity) ?? 0) + 1;
    occurrences.set(sourceIdentity, occurrence);
    const row: BenchmarkObservationRow = {
      benchmark_key: "arena_webdev",
      source_url: ARENA_WEBDEV_DATASET_URL,
      model_id: null,
      model:
        identity.reasoningEffort == null
          ? identity.baseModel
          : `${identity.baseModel} (${identity.reasoningEffort})`,
      base_model: identity.baseModel,
      reasoning_effort: identity.reasoningEffort,
      model_creator: organization,
      rank,
      canonical_value: rating,
      observed_at: observedAt,
      metadata: {
        source_model_id: `dataset:${sourceIdentity}:${occurrence}`,
        source_identity_kind: "dataset-name-occurrence",
        source_model_name: name,
        track: "overall",
        harness: identity.harness,
        effort_token_budget: identity.budget,
        votes,
        rating_lower: asFiniteNumber(value.rating_lower),
        rating_upper: asFiniteNumber(value.rating_upper),
        dataset: "lmarena-ai/leaderboard-dataset",
        dataset_split: "latest",
        leaderboard_publish_date: observedAt,
        ...(identity.unknown
          ? {
              assignment_eligible: false,
              assignment_exclusion: "undisclosed meaning of source configuration qualifier",
            }
          : {}),
      },
    };
    rows.push(row);
  }
  return excludeAmbiguousConfigurations(
    rows,
    (row) =>
      `${providerIdentityKey(row.model_creator)}|${normalizeModelToken(row.base_model)}|${row.reasoning_effort ?? ""}`,
  );
}
