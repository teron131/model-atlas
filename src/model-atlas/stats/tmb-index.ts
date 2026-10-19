/** Trust Me Bro Index candidates, ranking contract, places, Intelligence correction, and header card; the method is in docs/methodology/intelligence-agentic.md and storage in database/snapshots/tmb-rankings.ts. */

import type {
  ModelAtlasColumnTooltip,
  ModelAtlasColumnTooltipNestedSection,
  ModelAtlasColumnTooltipRow,
} from "../config/tooltips";
import { asRecord, stringValue } from "../runtime";
import { modelDisplayExclusion } from "./model-visibility";
import type { ModelAtlasModel, ModelAtlasPayload } from "./types";

const TMB_RELATIONS = ["=", "≥", ">", "≫"] as const;
const CANDIDATE_COUNT = 10;
const CANDIDATE_RELEASE_MONTHS = 2;
const PULL = 0.4;
const MAX_MOVE_POINTS = 5;
const RANKED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type TmbRelation = (typeof TMB_RELATIONS)[number];
type TmbEntry = { model_id: string; relation?: TmbRelation };
type TmbPlace = NonNullable<ModelAtlasModel["tmb_index"]>;

export type TmbCandidate = { model_id: string; name: string; release_date: string };

/** Stored exactly as submitted; any other fields are the run's log. */
export type TmbRanking = {
  ranked_at: string;
  inequalities: TmbEntry[][];
};

export function isTmbRankedAt(value: string): boolean {
  return RANKED_AT.test(value) && !Number.isNaN(Date.parse(value));
}

export function tmbPlaceLabel(place: TmbPlace): string {
  return place.best === place.worst ? `#${place.best}` : `#${place.best}–${place.worst}`;
}

/** Sorted by id so the list does not reveal benchmark order. */
export function tmbCandidates(payload: ModelAtlasPayload, asOf: string): TmbCandidate[] {
  const releaseCutoff = shiftMonths(asOf, -CANDIDATE_RELEASE_MONTHS);
  return [...highestVariants(payload).values()]
    .sort((left, right) => right.scores.intelligence_score - left.scores.intelligence_score)
    .slice(0, CANDIDATE_COUNT)
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
export function parseTmbRanking(value: unknown): { ranking: TmbRanking | null; errors: string[] } {
  const errors: string[] = [];
  const record = asRecord(value);
  const rankedAt = stringValue(record.ranked_at);
  if (rankedAt == null || !isTmbRankedAt(rankedAt)) {
    errors.push("ranked_at must be a UTC datetime like 2026-10-19T05:00:00Z");
  }
  const inequalities: unknown[] = Array.isArray(record.inequalities) ? record.inequalities : [];
  if (inequalities.length === 0) errors.push("inequalities must contain at least one chain");
  inequalities.forEach((item, chainIndex) => {
    const at = `inequalities[${chainIndex}]`;
    const chain: unknown[] = Array.isArray(item) ? item : [];
    if (chain.length < 2) errors.push(`${at} must be a list of at least two models`);
    const seen = new Set<string>();
    chain.forEach((value, index) => {
      const entry = asRecord(value);
      const modelId = stringValue(entry.model_id);
      if (modelId == null) errors.push(`${at}[${index}].model_id is required`);
      else if (seen.has(modelId)) errors.push(`${at} lists ${modelId} more than once`);
      else seen.add(modelId);
      if (index === 0 && entry.relation != null) {
        errors.push(`${at}[0] is the chain's strongest model and has no relation`);
      }
      if (index > 0 && !TMB_RELATIONS.includes(entry.relation as TmbRelation)) {
        errors.push(`${at}[${index}].relation must be one of = ≥ > ≫`);
      }
    });
  });
  if (errors.length > 0) return { ranking: null, errors };
  const ranking = record as TmbRanking;
  const { conflicts } = tmbOrder(ranking.inequalities);
  return conflicts.length > 0 ? { ranking: null, errors: conflicts } : { ranking, errors };
}

export function tmbCandidateErrors(
  ranking: TmbRanking,
  candidates: readonly TmbCandidate[],
): string[] {
  const candidateIds = new Set(candidates.map((model) => model.model_id));
  const placed = new Set(ranking.inequalities.flat().map((entry) => entry.model_id));
  return [...placed].filter((id) => !candidateIds.has(id)).map((id) => `${id} is not a candidate`);
}

/** Adds each ranked model's places and moves its Intelligence toward the joint target; effort variants share their best variant's shift. */
export function applyTmbIndex(
  payload: ModelAtlasPayload,
  ranking: TmbRanking | null,
): ModelAtlasPayload {
  if (ranking == null) return payload;
  const best = highestVariants(payload);
  const order = tmbOrder(ranking.inequalities);
  const places = tmbPlaces(order);
  const scores = new Map([...best].map(([id, model]) => [id, model.scores.intelligence_score]));
  const gaps = [...tmbTargets(order, scores)].map(
    ([id, target]) => [id, target - scores.get(id)!] as const,
  );
  const largestGap = Math.max(0, ...gaps.map(([, gap]) => Math.abs(gap)));
  const fraction = largestGap === 0 ? 0 : Math.min(PULL, MAX_MOVE_POINTS / largestGap);
  const shifts = new Map(gaps.map(([id, gap]) => [id, fraction * gap]));

  return {
    ...payload,
    models: payload.models.map((model) => {
      const place = model.id == null ? undefined : places.get(model.id);
      if (place == null) return model;
      return {
        ...model,
        tmb_index: place,
        scores: {
          ...model.scores,
          intelligence_score: model.scores.intelligence_score + (shifts.get(model.id!) ?? 0),
        },
      };
    }),
    metadata: {
      ...payload.metadata,
      scoring: {
        ...payload.metadata.scoring,
        column_tooltips: {
          ...payload.metadata.scoring.column_tooltips,
          tmbIndex: tmbIndexTooltip(ranking, places, best),
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

type TmbOrder = {
  groups: string[][];
  below: Set<number>[];
  conflicts: string[];
};

/** The partial order the chains state, with "=" groups and transitive `below` sets; a group below itself means the chains conflict. */
function tmbOrder(inequalities: readonly (readonly TmbEntry[])[]): TmbOrder {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const next = parent.get(id) ?? id;
    return next === id ? id : root(next);
  };
  for (const chain of inequalities) {
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
  for (const chain of inequalities) {
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

function tmbPlaces({ groups, below }: TmbOrder): Map<string, TmbPlace> {
  const size = (indices: Iterable<number>) =>
    [...indices].reduce((total, index) => total + groups[index]!.length, 0);
  const total = size(groups.keys());
  const places = new Map<string, TmbPlace>();
  groups.forEach((members, index) => {
    const above = size(below.flatMap((reached, other) => (reached.has(index) ? [other] : [])));
    const place = { best: above + 1, worst: total - size(below[index]!) - members.length + 1 };
    for (const id of members) places.set(id, place);
  });
  return places;
}

/** Isotonic regression over the partial order by Brunk's minimum lower sets, exact by subset enumeration for at most ten candidates. */
function tmbTargets(order: TmbOrder, scores: ReadonlyMap<string, number>): Map<string, number> {
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

function tmbIndexTooltip(
  ranking: TmbRanking,
  places: ReadonlyMap<string, TmbPlace>,
  models: ReadonlyMap<string, ModelAtlasModel>,
): ModelAtlasColumnTooltip {
  const chains = ranking.inequalities.map(
    (chain, index): ModelAtlasColumnTooltipNestedSection => ({
      title: ranking.inequalities.length === 1 ? "Inequality" : `Inequality ${index + 1}`,
      rows: chain.map((entry): ModelAtlasColumnTooltipRow => {
        const name = models.get(entry.model_id)?.name ?? entry.model_id;
        return [
          entry.relation == null ? name : `${entry.relation} ${name}`,
          tmbPlaceLabel(places.get(entry.model_id)!),
        ];
      }),
    }),
  );
  return {
    title: "Trust Me Bro Index",
    body: "How people who use these models on real work rank them; a range is a place the stated relationships leave open. Intelligence moves 40% toward these relationships only where benchmark scores contradict them.",
    rows: [
      ["Source", "Reddit and YouTube users' experiences"],
      ["Candidates", "Intelligence top 10 released within two months"],
      ["Ranked", `${ranking.ranked_at.slice(0, 16).replace("T", " ")} UTC`],
    ],
    sections: [{ title: "Inequalities", hideTitle: true, rows: chains }],
  };
}

function shiftMonths(isoDate: string, months: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
