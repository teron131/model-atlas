/** Community rankings share candidates and publication time; each index projects its own graph before one bounded Intelligence correction. */

import type {
  ModelAtlasColumnTooltip,
  ModelAtlasColumnTooltipNestedSection,
  ModelAtlasColumnTooltipRow,
} from "../config/tooltips";
import { asNonEmptyString, asRecord } from "../runtime";
import { modelDisplayExclusion } from "../stats/model-visibility";
import type { ModelAtlasModel, ModelAtlasPayload } from "../stats/types";
import {
  COMMUNITY_INDEXES,
  type CommunityIndex,
  type CommunityIndexKey,
  type CommunityIndexPlace,
  communityPlaceLabel,
} from "./catalog";

const CHAIN_RELATIONS = ["=", "≥", ">", "≫"] as const;
const CANDIDATE_POOL_SIZE = 15;
const CANDIDATE_RELEASE_DAYS = 60;
const PULL = 0.4;
const MAX_MOVE_POINTS = 5;
const RANKED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type ChainRelation = (typeof CHAIN_RELATIONS)[number];
type ChainEntry = { model_id: string; relation?: ChainRelation };

export type CommunityCandidate = { model_id: string; name: string; release_date: string };

/** Every index shares one immutable version; other fields remain the run's log. */
export type CommunityRanking = {
  ranked_at: string;
  indexes: Record<CommunityIndexKey, ChainEntry[][]>;
};

export function isValidRankedAt(value: string): boolean {
  return RANKED_AT_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** Sorted by id so the list does not reveal benchmark order. */
export function communityCandidates(
  payload: ModelAtlasPayload,
  asOf: string,
): CommunityCandidate[] {
  const releaseCutoff = shiftDays(asOf, -CANDIDATE_RELEASE_DAYS);
  return [...highestVariants(payload).values()]
    .sort((left, right) => right.scores.intelligence_score - left.scores.intelligence_score)
    .slice(0, CANDIDATE_POOL_SIZE)
    .filter(
      (model) =>
        model.release_date != null &&
        model.release_date > releaseCutoff &&
        model.release_date <= asOf,
    )
    .map((model) => ({
      model_id: model.id!,
      name: model.name ?? model.id!,
      release_date: model.release_date!,
    }))
    .sort((left, right) => left.model_id.localeCompare(right.model_id));
}

/** Validates only the fields the site reads, returns the submission untouched, and rejects chains that contradict each other. */
export function parseCommunityRanking(value: unknown): {
  ranking: CommunityRanking | null;
  errors: string[];
} {
  const errors: string[] = [];
  const record = asRecord(value);
  const rankedAt = asNonEmptyString(record.ranked_at);
  if (rankedAt == null || !isValidRankedAt(rankedAt)) {
    errors.push("ranked_at must be a UTC datetime like 2026-10-19T05:00:00Z");
  }
  const indexes = asRecord(record.indexes);
  for (const key of Object.keys(indexes)) {
    if (!COMMUNITY_INDEXES.some((definition) => definition.key === key)) {
      errors.push(`indexes.${key} is not a supported community index`);
    }
  }
  for (const { key } of COMMUNITY_INDEXES) {
    const field = `indexes.${key}`;
    const chains: unknown[] = Array.isArray(indexes[key]) ? indexes[key] : [];
    if (!Array.isArray(indexes[key])) errors.push(`${field} must be an array of chains`);
    chains.forEach((item, chainIndex) => {
      const at = `${field}[${chainIndex}]`;
      const chain: unknown[] = Array.isArray(item) ? item : [];
      if (chain.length < 2) errors.push(`${at} must be a list of at least two models`);
      const seen = new Set<string>();
      chain.forEach((value, index) => {
        const entry = asRecord(value);
        const modelId = asNonEmptyString(entry.model_id);
        if (modelId == null) errors.push(`${at}[${index}].model_id is required`);
        else if (seen.has(modelId)) errors.push(`${at} lists ${modelId} more than once`);
        else seen.add(modelId);
        if (index === 0 && entry.relation != null) {
          errors.push(`${at}[0] is the chain's strongest model and has no relation`);
        }
        if (index > 0 && !CHAIN_RELATIONS.includes(entry.relation as ChainRelation)) {
          errors.push(`${at}[${index}].relation must be one of = ≥ > ≫`);
        }
      });
    });
  }
  if (errors.length > 0) return { ranking: null, errors };
  const ranking = record as CommunityRanking;
  if (COMMUNITY_INDEXES.every(({ key }) => ranking.indexes[key].length === 0)) {
    return { ranking: null, errors: ["At least one index must contain a supported chain"] };
  }
  const conflicts = COMMUNITY_INDEXES.flatMap(({ key }) =>
    indexOrder(ranking.indexes[key]).conflicts.map((error) => `indexes.${key}: ${error}`),
  );
  return conflicts.length > 0 ? { ranking: null, errors: conflicts } : { ranking, errors };
}

export function communityCandidateErrors(
  ranking: CommunityRanking,
  candidates: readonly CommunityCandidate[],
): string[] {
  const candidateIds = new Set(candidates.map((model) => model.model_id));
  const placed = new Set(
    COMMUNITY_INDEXES.flatMap(({ key }) => ranking.indexes[key])
      .flat()
      .map((entry) => entry.model_id),
  );
  return [...placed].filter((id) => !candidateIds.has(id)).map((id) => `${id} is not a candidate`);
}

/** Both graphs start from the unadjusted payload; absent placements contribute no movement, and effort variants share their best variant's shift. */
export function applyCommunityIndexes(
  payload: ModelAtlasPayload,
  ranking: CommunityRanking | null,
): ModelAtlasPayload {
  if (ranking == null) return payload;
  const best = highestVariants(payload);
  const scores = new Map([...best].map(([id, model]) => [id, model.scores.intelligence_score]));
  const indexes = COMMUNITY_INDEXES.map((definition) => {
    const chains = ranking.indexes[definition.key];
    const order = indexOrder(chains);
    return {
      definition,
      chains,
      places: indexPlaces(order),
      targets: indexTargets(order, scores),
    };
  });
  const gaps = [...scores].map(
    ([id, score]) =>
      [
        id,
        indexes.reduce(
          (gap, { definition, targets }) =>
            gap + definition.weight * ((targets.get(id) ?? score) - score),
          0,
        ),
      ] as const,
  );
  const largestGap = Math.max(0, ...gaps.map(([, gap]) => Math.abs(gap)));
  const fraction = largestGap === 0 ? 0 : Math.min(PULL, MAX_MOVE_POINTS / largestGap);
  const shifts = new Map(gaps.map(([id, gap]) => [id, fraction * gap]));
  const columnTooltips = Object.fromEntries(
    indexes
      .filter(({ places }) => places.size > 0)
      .map(({ definition, chains, places }) => [
        definition.columnKey,
        indexTooltip(definition, ranking.ranked_at, chains, places, best),
      ]),
  );

  return {
    ...payload,
    models: payload.models.map((model) => {
      const id = model.id;
      if (id == null) return model;
      const placements = indexes.flatMap(({ definition, places }) => {
        const place = places.get(id);
        return place == null ? [] : [[definition.key, place] as const];
      });
      if (placements.length === 0) return model;
      return {
        ...model,
        community_indexes: Object.fromEntries(placements),
        scores: {
          ...model.scores,
          intelligence_score: model.scores.intelligence_score + (shifts.get(id) ?? 0),
        },
      };
    }),
    metadata: {
      ...payload.metadata,
      scoring: {
        ...payload.metadata.scoring,
        column_tooltips: {
          ...payload.metadata.scoring.column_tooltips,
          ...columnTooltips,
        },
      },
    },
  };
}

/** Highest-Intelligence variant per base model, skipping models the dashboard hides. */
function highestVariants(payload: ModelAtlasPayload) {
  const best = new Map<string, ModelAtlasModel>();
  for (const model of payload.models) {
    const score = model.scores?.intelligence_score;
    if (model.id == null || !Number.isFinite(score) || modelDisplayExclusion(model) != null) {
      continue;
    }
    const current = best.get(model.id);
    if (current == null || score > current.scores.intelligence_score) best.set(model.id, model);
  }
  return best;
}

type IndexOrder = {
  groups: string[][];
  below: Set<number>[];
  conflicts: string[];
};

/** The partial order the chains state, with "=" groups and transitive `below` sets; a group below itself means the chains conflict. */
function indexOrder(chains: readonly (readonly ChainEntry[])[]): IndexOrder {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const next = parent.get(id) ?? id;
    return next === id ? id : root(next);
  };
  for (const chain of chains) {
    chain.forEach((entry, index) => {
      if (!parent.has(entry.model_id)) parent.set(entry.model_id, entry.model_id);
      if (entry.relation === "=") {
        parent.set(root(entry.model_id), root(chain[index - 1]!.model_id));
      }
    });
  }
  const groups: string[][] = [];
  const groupOf = new Map<string, number>();
  const groupOfRoot = new Map<string, number>();
  for (const id of parent.keys()) {
    const key = root(id);
    if (!groupOfRoot.has(key)) {
      groupOfRoot.set(key, groups.length);
      groups.push([]);
    }
    const group = groupOfRoot.get(key)!;
    groupOf.set(id, group);
    groups[group]!.push(id);
  }
  const directlyBelow = groups.map(() => new Set<number>());
  for (const chain of chains) {
    chain.forEach((entry, index) => {
      if (index === 0 || entry.relation === "=") return;
      directlyBelow[groupOf.get(chain[index - 1]!.model_id)!]!.add(groupOf.get(entry.model_id)!);
    });
  }
  const below = directlyBelow.map((start) => {
    const reached = new Set<number>();
    const pending = [...start];
    while (pending.length > 0) {
      const next = pending.pop()!;
      if (reached.has(next)) continue;
      reached.add(next);
      pending.push(...directlyBelow[next]!);
    }
    return reached;
  });
  const conflicts = groups.flatMap((members, index) =>
    below[index]!.has(index)
      ? [
          `the inequalities place ${members.join(" = ")} both above and below another model; keep every direction consistent and use = for a supported tie`,
        ]
      : [],
  );
  return { groups, below, conflicts };
}

function indexPlaces({ groups, below }: IndexOrder): Map<string, CommunityIndexPlace> {
  const size = (indices: Iterable<number>) =>
    [...indices].reduce((total, index) => total + groups[index]!.length, 0);
  const total = size(groups.keys());
  const places = new Map<string, CommunityIndexPlace>();
  groups.forEach((members, index) => {
    const above = size(below.flatMap((reached, other) => (reached.has(index) ? [other] : [])));
    const place = { best: above + 1, worst: total - size(below[index]!) - members.length + 1 };
    for (const id of members) places.set(id, place);
  });
  return places;
}

/** Isotonic regression over the partial order by Brunk's minimum lower sets, exact by subset enumeration for at most fifteen candidates. */
function indexTargets(order: IndexOrder, scores: ReadonlyMap<string, number>): Map<string, number> {
  const nodes = order.groups.flatMap((members, index) => {
    const scored = members.filter((id) => scores.has(id));
    if (scored.length === 0) return [];
    const total = scored.reduce((sum, id) => sum + scores.get(id)!, 0);
    return [{ index, members: scored, total }];
  });
  const belowMask = nodes.map(({ index }) =>
    nodes.reduce(
      (mask, other, bit) => (order.below[index]!.has(other.index) ? mask | (1 << bit) : mask),
      0,
    ),
  );
  const targets = new Map<string, number>();
  let remaining = (1 << nodes.length) - 1;
  while (remaining !== 0) {
    let lowest = { subset: remaining, mean: Number.POSITIVE_INFINITY };
    for (let subset = remaining; subset !== 0; subset = (subset - 1) & remaining) {
      let total = 0;
      let count = 0;
      let closed = true;
      nodes.forEach((node, bit) => {
        if ((subset & (1 << bit)) === 0) return;
        closed &&= (belowMask[bit]! & remaining & ~subset) === 0;
        total += node.total;
        count += node.members.length;
      });
      if (closed && total / count < lowest.mean) lowest = { subset, mean: total / count };
    }
    nodes.forEach((node, bit) => {
      if ((lowest.subset & (1 << bit)) === 0) return;
      for (const id of node.members) targets.set(id, lowest.mean);
    });
    remaining &= ~lowest.subset;
  }
  return targets;
}

function indexTooltip(
  definition: CommunityIndex,
  rankedAt: string,
  chains: readonly (readonly ChainEntry[])[],
  places: ReadonlyMap<string, CommunityIndexPlace>,
  models: ReadonlyMap<string, ModelAtlasModel>,
): ModelAtlasColumnTooltip {
  const chainSections = chains.map(
    (chain, index): ModelAtlasColumnTooltipNestedSection => ({
      title: chains.length === 1 ? "Inequality" : `Inequality ${index + 1}`,
      rows: chain.map((entry): ModelAtlasColumnTooltipRow => {
        const name = models.get(entry.model_id)?.name ?? entry.model_id;
        return [
          entry.relation == null ? name : `${entry.relation} ${name}`,
          communityPlaceLabel(places.get(entry.model_id)!),
        ];
      }),
    }),
  );
  return {
    title: definition.title,
    body: `${definition.description} ${definition.label} supplies ${definition.weight * 100}% of the shared Intelligence correction.`,
    rows: [
      ["Source", "Reddit and YouTube users' experiences"],
      ["Candidates", "Intelligence top 15 released within 60 days"],
      ["Intelligence", "40% toward the blended targets, capped at 5 points per model"],
      ["Ranked", `${rankedAt.slice(0, 16).replace("T", " ")} UTC`],
    ],
    sections: [{ title: "Inequalities", hideTitle: true, rows: chainSections }],
  };
}

function shiftDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
