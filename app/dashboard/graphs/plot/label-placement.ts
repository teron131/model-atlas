/** Deterministic scatter-label placement balances readable text, short leaders, and uncrossed associations. */

import { clamp } from "../../../../src/model-atlas/math-utils";

const DIRECTIONS = [
  [1, -1],
  [1, 0],
  [1, 1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
] as const;
const GAPS = [5, 12, 24, 42, 66, 94, 126];
const MAX_PASSES = 6;
const PAIR_PASSES = 2;
const IMPROVEMENT_EPSILON = 0.001;
const LABEL_PADDING = 3;
const SEARCH_WIDTH = 96;
const LEADER_CLEARANCE = 5;
const TEXT_CONFLICT_COST = 1_000_000_000;
// The pointed name sits this close to its star, near enough that it needs no leader.
const POINTED_GAP = 2;
// The sides of its star the pointed name tries in turn: the right first, away from the pointer's guides, which run left and down from the star.
const POINTED_SIDES = [
  [1, 0],
  [1, -1],
  [1, 1],
  [0, -1],
  [-1, -1],
  [-1, 1],
  [0, 1],
  [-1, 0],
] as const;

type Box = { left: number; right: number; top: number; bottom: number };
type Segment = { x1: number; y1: number; x2: number; y2: number };

export type PointLabelSize = { width: number; ascent: number; descent: number };
export type PointLabelPlacement = {
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  line?: Segment;
};
type Label = {
  key: string;
  label: string;
  cx: number;
  cy: number;
  radius: number;
  priority?: number;
  size?: PointLabelSize;
  /** Set only on the pointed star's name: the pointer's guides from its star to the axes. The name sits right beside its star, never on a leader, on the first of `POINTED_SIDES` that keeps off these guides, the plot's other lines, and reserved boxes, and other names give way to it. Where every side meets a reserved box, it takes the first that keeps off the lines, covering a fixed caption only while its star is pointed. */
  pointerGuides?: Segment[];
};
type PointObstacle = { key?: string; cx: number; cy: number; radius: number; weight?: number };
/** `box` is the text with its padding, which stars, reserved text, and leaders keep out of; `spacing` is the text with half the name clearance on each side, so two names conflict when their spacings meet. */
type Candidate = PointLabelPlacement & { box: Box; spacing: Box; connector: Segment; cost: number };
type Clearance = { x: number; y: number };
type PairCost = (candidate: Candidate, other: Candidate) => number;

// A name set beside its star sits at most this far from it, so where the field is too crowded a lower-priority name gives way instead of hanging on a long leader.
const BESIDE_STAR_GAPS = [5, 12];

/** The gap, across and down, that a name keeps from other names and reserved text. Phones, which name every frontier model, hold names apart: across by more than two characters, nearer than which two names on one line read as one phrase, and down by a few pixels, so stacked names stay separate lines. Wider plots only keep names from touching. */
export const NAME_CLEARANCE = {
  compact: { x: 14, y: 3 },
  wide: { x: 2, y: 2 },
} as const;

/**
 * Placements for names set beside their stars, from a `calloutLabelPlacements` request serialized as `layoutKey` without its gaps, or none while the key is `null`; a name takes no leader, whose few dots would read as stray stars beside it.
 * Each reserved box is held off by the name clearance, as `crowdedOutLabels` then checks it, so a name takes a place clear of reserved text wherever one exists.
 */
export function placeBesideStars(
  layoutKey: string | null,
  compact: boolean,
): Map<string, PointLabelPlacement> {
  if (layoutKey == null) return new Map();
  const request: Parameters<typeof calloutLabelPlacements>[0] = JSON.parse(layoutKey);
  const clearance = NAME_CLEARANCE[compact ? "compact" : "wide"];
  const placements = calloutLabelPlacements({
    ...request,
    gaps: BESIDE_STAR_GAPS,
    reservedBoxes: request.reservedBoxes?.map((box) => paddedBox(box, clearance.x, clearance.y)),
  });
  return new Map(
    [...placements].map(([key, placement]) => [key, { ...placement, line: undefined }]),
  );
}

// A name in the sky starts this far above and before its star and keeps this far from the horizon on every side, so no name sits on the rim's glow; one sliding left to clear the horizon moves in steps this fine.
const SKY_GAP = 2;
const HORIZON_MARGIN = 6;
const SLIDE_STEP = 2;
// A name moved clear of another goes this hair further, so rounding never leaves the two meeting.
const NUDGE = 0.01;
// A name that sits this close to its star needs no leader.
const LEADER_REACH = 8;
// A name crosses below the horizon only where the sky's nearest free spot would hang it on a leader this much longer, since the field crowds the ground under the horizon.
const UNDER_HORIZON_HANDICAP = 80;
// A leader meeting its name from below or above lands at least this far inside the name's ends, so it reaches text rather than the empty end of a shorter second line or the gap between names.
const LEADER_INSET = 6;
// A leader passing through another name, or within this margin of it, costs as much as this much more leader, since a reader follows it to the wrong name.
const LEADER_MARGIN = 3;
const LEADER_CONFLICT_COST = 70;

/**
 * Placements for the names a phone sets around a frontier, which names every star of the frontier and any star picked or found: each in the open sky above the horizon drawn by `segments` wherever it finds room near its star.
 * Along a frontier that rises to the right, each name starts just above and before its star, or lower than that nowhere the horizon reaches; one that comes within `clearance` of a name already placed or of `reserved` text moves below it, sliding left as far as the horizon needs, or above it, and a name away from its star reaches back on a leader. A frontier that rises to the left is placed as the mirror image of one that rises to the right.
 * Where the sky has no free spot near its star, a name drops just beneath the horizon, beside and below its star, under any name already there; of these spots it takes the one with the shortest leader that keeps clear of other names.
 * A leader meets its name at the middle of its nearer end when the star lies more beside the name than below or above it, and otherwise at the point along its facing edge that runs into the fewest other names.
 */
export function placeInSky({
  labels,
  bounds,
  segments,
  reserved = [],
  rises,
  clearance,
}: {
  labels: Label[];
  bounds: Box;
  segments: Segment[];
  reserved?: Box[];
  rises: "left" | "right";
  clearance: Clearance;
}): Map<string, PointLabelPlacement> {
  if (rises === "left") {
    const flip = (x: number) => bounds.left + bounds.right - x;
    const widths = new Map(labels.map((label) => [label.key, labelSize(label).width]));
    const mirrored = placeInSky({
      labels: labels.map((label) => ({ ...label, cx: flip(label.cx) })),
      bounds,
      segments: segments.map((segment) => ({
        ...segment,
        x1: flip(segment.x1),
        x2: flip(segment.x2),
      })),
      reserved: reserved.map((box) => ({ ...box, left: flip(box.right), right: flip(box.left) })),
      rises: "right",
      clearance,
    });
    return new Map(
      [...mirrored].map(([key, { x, line, ...placement }]) => [
        key,
        {
          ...placement,
          x: flip(x + widths.get(key)!),
          line: line && { ...line, x1: flip(line.x1), x2: flip(line.x2) },
        },
      ]),
    );
  }
  // The horizon's heights at the ends of its pieces over a stretch of x widened by the margin on each side, so a name keeps its margin from a steep horizon beside it as well as below it; none past the horizon's ends.
  const horizonHeights = (left: number, right: number) =>
    segments.flatMap(({ x1, y1, x2, y2 }) => {
      const from = Math.max(left - HORIZON_MARGIN, Math.min(x1, x2));
      const to = Math.min(right + HORIZON_MARGIN, Math.max(x1, x2));
      if (from > to) return [];
      if (x1 === x2) return [y1, y2];
      const at = (x: number) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      return [at(from), at(to)];
    });
  const horizonTop = (left: number, right: number) => Math.min(...horizonHeights(left, right));
  const spacing = (box: Box) => paddedBox(box, clearance.x / 2, clearance.y / 2);
  const names = labels.map((label) => {
    const size = labelSize(label);
    const height = size.ascent + size.descent;
    const anchor = clamp(label.cx - label.radius - SKY_GAP, bounds.left + size.width, bounds.right);
    // The name with its bottom at `bottom`: ending at its anchor, or slid left until it clears the horizon or meets the plot's edge.
    const boxAt = (bottom: number): Box => {
      let right = anchor;
      while (
        right - size.width > bounds.left &&
        horizonTop(right - size.width, right) < bottom + HORIZON_MARGIN
      )
        right -= SLIDE_STEP;
      return { left: right - size.width, right, top: bottom - height, bottom };
    };
    // The lowest bottom a name spanning `box` can take above the horizon.
    const floor = (box: Pick<Box, "left" | "right">) =>
      Math.min(bounds.bottom, horizonTop(box.left, box.right) - HORIZON_MARGIN);
    const start = Math.min(
      label.cy - label.radius - SKY_GAP,
      floor({ left: anchor - size.width, right: anchor }),
    );
    return { label, size, height, boxAt, floor, start };
  });
  // Names are placed from both ends of the frontier inward, so the newest models and the oldest take the sky beside their stars and the crowded middle gives way: starts a b c d e are placed in the order a e b d c.
  const byStart = names.sort(
    (a, b) => a.start - b.start || a.label.cy - b.label.cy || b.label.cx - a.label.cx,
  );
  const order = byStart.map(
    (_, index) => byStart[index % 2 === 0 ? index / 2 : byStart.length - 1 - (index - 1) / 2]!,
  );
  type Name = (typeof names)[number];
  type Spot = { box: Box; handicap: number; leader: Segment | null };
  const runsInto = (leader: Segment, box: Box) =>
    segmentHitsBox(leader, paddedBox(box, LEADER_MARGIN));
  // The cheapest spot for a name among the other names of `layout`.
  const place = (name: Name, layout: ReadonlyMap<Name, Spot>): Spot => {
    const others = [...layout].flatMap(([other, spot]) => (other === name ? [] : [spot]));
    const placed = [...reserved, ...others.map(({ box }) => box)];
    const leaders = others.flatMap(({ leader }) => (leader ? [leader] : []));
    const met = (box: Box) => placed.filter((other) => boxesMeet(spacing(box), spacing(other)));
    const { cx, cy, radius } = name.label;
    // Beneath the horizon a name starts beside and below its star, where a rising horizon leaves the most room, and moves down past names already there.
    const underHorizon = () => {
      const left = Math.min(cx + radius + SKY_GAP, bounds.right - name.size.width);
      const right = left + name.size.width;
      const spanAt = (top: number) => ({ left, right, top, bottom: top + name.height });
      let top = Math.max(
        cy + radius + SKY_GAP,
        Math.max(...horizonHeights(left, right)) + HORIZON_MARGIN,
      );
      for (let blockers = met(spanAt(top)); blockers.length > 0; blockers = met(spanAt(top)))
        top = Math.max(...blockers.map((other) => other.bottom)) + clearance.y + NUDGE;
      return spanAt(top);
    };
    // Leader length plus the price of every placed name it runs along or through.
    const leaderCost = (leader: Segment) =>
      Math.hypot(leader.x2 - cx, leader.y2 - cy) +
      placed.filter((other) => runsInto(leader, other)).length * LEADER_CONFLICT_COST;
    const leaderTo = (box: Box): Segment | null => {
      if (distanceToBox(cx, cy, box) - radius <= LEADER_REACH) return null;
      const beside = Math.max(box.left - cx, 0, cx - box.right);
      const across = Math.max(box.top - cy, 0, cy - box.bottom);
      if (beside > across)
        return {
          x1: cx,
          y1: cy,
          x2: cx < box.left ? box.left : box.right,
          y2: (box.top + box.bottom) / 2,
        };
      const inset = Math.min(LEADER_INSET, (box.right - box.left) / 2);
      const [low, high] = [box.left + inset, box.right - inset];
      const y2 = cy < box.top ? box.top : box.bottom;
      return [clamp(cx, low, high), low, high, (low + high) / 2]
        .map((x2) => ({ x1: cx, y1: cy, x2, y2 }))
        .reduce((best, leader) => (leaderCost(leader) < leaderCost(best) ? leader : best));
    };
    // The leader's cost, or the gap to a name close enough to need none, plus the price of every placed leader the name covers.
    const cost = (box: Box) => {
      const leader = leaderTo(box);
      return (
        (leader ? leaderCost(leader) : distanceToBox(cx, cy, box)) +
        leaders.filter((other) => runsInto(other, box)).length * LEADER_CONFLICT_COST
      );
    };
    let below: number | null = null;
    for (let bottom = name.start; bottom <= name.floor(name.boxAt(bottom));) {
      const blockers = met(name.boxAt(bottom));
      if (blockers.length === 0) {
        below = bottom;
        break;
      }
      bottom =
        Math.max(...blockers.map((other) => other.bottom)) + clearance.y + name.height + NUDGE;
    }
    let above: number | null = null;
    for (
      let bottom = name.start;
      bottom - name.height >= bounds.top &&
      (below == null || name.start - bottom < below - name.start);
    ) {
      const box = name.boxAt(bottom);
      if (bottom > name.floor(box)) {
        bottom = name.floor(box);
        continue;
      }
      const blockers = met(box);
      if (blockers.length === 0) {
        above = bottom;
        break;
      }
      bottom = Math.min(...blockers.map((other) => other.top)) - clearance.y - NUDGE;
    }
    const { box, handicap } = [
      ...[below, above].flatMap((bottom) =>
        bottom == null ? [] : [{ box: name.boxAt(bottom), handicap: 0 }],
      ),
      { box: underHorizon(), handicap: UNDER_HORIZON_HANDICAP },
    ].reduce((best, option) =>
      cost(option.box) + option.handicap < cost(best.box) + best.handicap ? option : best,
    );
    return { box, handicap, leader: leaderTo(box) };
  };
  // A whole layout's cost: each name's leader length, or its gap to a star close enough to need none, its handicap, and the price of every name or reserved text each leader runs into.
  const layoutCost = (layout: ReadonlyMap<Name, Spot>) =>
    [...layout].reduce(
      (sum, [name, { box, handicap, leader }]) =>
        sum +
        handicap +
        (leader
          ? Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1) +
            [
              ...reserved,
              ...[...layout].flatMap(([other, spot]) => (other === name ? [] : [spot.box])),
            ].filter((other) => runsInto(leader, other)).length *
              LEADER_CONFLICT_COST
          : distanceToBox(name.label.cx, name.label.cy, box)),
      0,
    );
  const first = new Map<Name, Spot>();
  for (const name of order) first.set(name, place(name, first));
  // A second pass places every name again among all the others, so a name placed early also steers its leader clear of names placed after it; the cheaper whole layout stands.
  const second = new Map(first);
  for (const name of order) second.set(name, place(name, second));
  const layout = layoutCost(second) < layoutCost(first) ? second : first;
  return new Map(
    [...layout].map(([{ label, size }, { box, leader }]) => {
      const { cx, cy, radius } = label;
      // A drawn leader starts just clear of its star's core.
      const lift = leader ? (radius + 2) / Math.hypot(leader.x2 - cx, leader.y2 - cy) : 0;
      return [
        label.key,
        {
          x: box.left,
          y: box.bottom - size.descent,
          textAnchor: "start",
          line: leader
            ? { ...leader, x1: cx + (leader.x2 - cx) * lift, y1: cy + (leader.y2 - cy) * lift }
            : undefined,
        },
      ];
    }),
  );
}

/** Retain a bounded set of alternative layouts, then refine the best complete arrangement without sacrificing text readability to shorter leaders. */
export function calloutLabelPlacements({
  labels,
  obstacles,
  bounds,
  segments = [],
  reservedBoxes = [],
  directions = DIRECTIONS,
  gaps = GAPS,
  clearance = { x: LABEL_PADDING * 2, y: LABEL_PADDING * 2 },
}: {
  labels: Label[];
  obstacles: PointObstacle[];
  bounds: Box;
  segments?: Segment[];
  reservedBoxes?: Box[];
  directions?: readonly (readonly [number, number])[];
  /** Distances from its point a label may sit at; the default reaches far enough that a crowded label can hang on a long leader, while `placeBesideStars` keeps names close. */
  gaps?: readonly number[];
  /** The gap, across and down, two names' text keeps; nearer names count as overlapping text. */
  clearance?: Clearance;
}): Map<string, PointLabelPlacement> {
  const ordered = labels
    .map((label, order) => ({ ...label, order }))
    .sort(
      (left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.order - right.order,
    );
  const candidates = ordered.map((label) =>
    labelCandidates(label, bounds, obstacles, segments, reservedBoxes, directions, gaps, clearance),
  );
  const pairCost = cachedPairCost(candidates);
  // Keep alternative partial layouts so an early label cannot trap a later leader through text.
  let layouts: { placed: Candidate[]; cost: number }[] = [{ placed: [], cost: 0 }];
  for (const choices of candidates) {
    layouts = layouts
      .flatMap((layout) =>
        choices.map((choice) => ({
          layout,
          choice,
          cost: layout.cost + candidateCost(choice, layout.placed, layout.placed.length, pairCost),
        })),
      )
      .sort((a, b) => a.cost - b.cost)
      .slice(0, SEARCH_WIDTH)
      .map(({ layout, choice, cost }) => ({ placed: [...layout.placed, choice], cost }));
  }
  const placed = layouts[0]!.placed;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (let index = placed.length - 1; index >= 0; index--) {
      const current = placed[index]!;
      const best = bestCandidate(candidates[index]!, placed, index, current, pairCost);
      if (best !== current) {
        placed[index] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
  untanglePairs(placed, candidates, pairCost);
  return new Map(
    ordered.map((label, index) => {
      const { x, y, textAnchor, line } = placed[index]!;
      return [label.key, { x, y, textAnchor, line }];
    }),
  );
}

/**
 * Candidates anchor the text rectangle's edge near the point; text length never adds an artificial leader offset.
 * Positions crossing a reserved box are left out, unless every position does, when they are kept at the cost of overlapping text so the label still has a place.
 */
function labelCandidates(
  label: Label,
  bounds: Box,
  obstacles: PointObstacle[],
  segments: Segment[],
  reservedBoxes: Box[],
  directions: readonly (readonly [number, number])[],
  gaps: readonly number[],
  nameClearance: Clearance,
): Candidate[] {
  const size = labelSize(label);
  const height = size.ascent + size.descent;
  const padding = LABEL_PADDING;
  const candidates: Candidate[] = [];
  const blocked: Candidate[] = [];
  // The pointed name's first side clear of every line and its own star, taken when no side also clears the reserved boxes.
  let pointedFallback: Candidate | undefined;
  for (const [dx, dy] of label.pointerGuides ? POINTED_SIDES : directions) {
    for (const gap of label.pointerGuides ? [POINTED_GAP] : gaps) {
      const distance = label.radius + gap + padding;
      const left = clamp(
        label.cx + dx * distance - (dx < 0 ? size.width : dx === 0 ? size.width / 2 : 0),
        bounds.left + padding,
        Math.max(bounds.left + padding, bounds.right - size.width - padding),
      );
      const top = clamp(
        label.cy + dy * distance - (dy < 0 ? height : dy === 0 ? height / 2 : 0),
        bounds.top + padding,
        Math.max(bounds.top + padding, bounds.bottom - height - padding),
      );
      const textBox = { left, right: left + size.width, top, bottom: top + height };
      const box = paddedBox(textBox, padding);
      const spacing = paddedBox(textBox, nameClearance.x / 2, nameClearance.y / 2);
      const x2 = clamp(label.cx, textBox.left, textBox.right);
      const y2 = clamp(label.cy, textBox.top, textBox.bottom);
      const length = Math.hypot(x2 - label.cx, y2 - label.cy);
      const clearance = Math.max(0, length - label.radius);
      const scale = length > 0 ? Math.min(1, (label.radius + 2) / length) : 0;
      const connector = {
        x1: label.cx + (x2 - label.cx) * scale,
        y1: label.cy + (y2 - label.cy) * scale,
        x2,
        y2,
      };
      const crossesReserved = reservedBoxes.some(
        (reserved) =>
          (box.left < reserved.right &&
            box.right > reserved.left &&
            box.top < reserved.bottom &&
            box.bottom > reserved.top) ||
          segmentHitsBox(connector, reserved),
      );
      if (crossesReserved && candidates.length > 0 && !label.pointerGuides) continue;
      const line = clearance > 10 ? connector : undefined;
      let cost = clearance * 0.5 + clearance * clearance * 0.025;
      for (const point of obstacles) {
        const distance = distanceToBox(point.cx, point.cy, box);
        if (distance < point.radius + 2)
          cost += (10_000 + (point.radius + 2 - distance) * 100) * (point.weight ?? 1);
        const ownPoint =
          point.key != null
            ? point.key === label.key
            : point.cx === label.cx && point.cy === label.cy;
        if (!ownPoint) {
          const gap = pointSegmentDistance(point.cx, point.cy, connector) - point.radius;
          if (gap < LEADER_CLEARANCE)
            cost += (2_000 + (LEADER_CLEARANCE - gap) * 100) * Math.max(0.5, point.weight ?? 1);
        }
      }
      // A line through a name strikes it out as surely as another name over it, while a leader may cross one at a price.
      let crossesLine = false;
      for (const segment of [...segments, ...(label.pointerGuides ?? [])]) {
        if (segmentHitsBox(segment, box)) {
          cost += TEXT_CONFLICT_COST;
          crossesLine = true;
        }
        if (segmentsCross(connector, segment)) cost += 1_000;
      }
      const candidate: Candidate = {
        x: left,
        y: top + size.ascent,
        textAnchor: "start",
        box,
        spacing,
        connector,
        line,
        cost,
      };
      // A side the plot's edge pushes the name along still counts, unless that slides it over its own star.
      const coversStar = distanceToBox(label.cx, label.cy, box) < label.radius + 2;
      if (label.pointerGuides && !crossesLine && !coversStar) {
        if (!crossesReserved) return [candidate];
        pointedFallback ??= candidate;
      }
      if (crossesReserved) blocked.push({ ...candidate, cost: cost + TEXT_CONFLICT_COST });
      else candidates.push(candidate);
    }
  }
  if (pointedFallback) return [pointedFallback];
  return candidates.length > 0 ? candidates : blocked;
}

/** Strict improvements and fixed traversal order keep identical family states stable across pointer movement. */
function bestCandidate(
  choices: Candidate[],
  placed: Candidate[],
  index: number,
  current: Candidate,
  pairCost: PairCost,
): Candidate {
  let best = current;
  let bestCost = candidateCost(best, placed, index, pairCost);
  for (const choice of choices) {
    const cost = candidateCost(choice, placed, index, pairCost);
    if (cost < bestCost - IMPROVEMENT_EPSILON) {
      best = choice;
      bestCost = cost;
    }
  }
  return best;
}

function candidateCost(
  candidate: Candidate,
  placed: Candidate[],
  index: number,
  pairCost: PairCost,
): number {
  return (
    candidate.cost +
    placed.reduce(
      (cost, other, otherIndex) => cost + (index === otherIndex ? 0 : pairCost(candidate, other)),
      0,
    )
  );
}

/** Reuse symmetric collision costs within one layout search; the compact matrix is discarded with that search. */
function cachedPairCost(candidates: Candidate[][]): PairCost {
  const choices = candidates.flat();
  const indices = new Map(choices.map((choice, index) => [choice, index]));
  const costs = new Float64Array((choices.length * (choices.length - 1)) / 2).fill(NaN);
  return (candidate, other) => {
    const a = indices.get(candidate)!;
    const b = indices.get(other)!;
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    const index = (high * (high - 1)) / 2 + low;
    const cached = costs[index]!;
    if (!Number.isNaN(cached)) return cached;
    const cost = pairCost(candidate, other);
    costs[index] = cost;
    return cost;
  };
}

function pairCost(candidate: Candidate, other: Candidate): number {
  let cost = 0;
  const area =
    Math.max(
      0,
      Math.min(candidate.spacing.right, other.spacing.right) -
        Math.max(candidate.spacing.left, other.spacing.left),
    ) *
    Math.max(
      0,
      Math.min(candidate.spacing.bottom, other.spacing.bottom) -
        Math.max(candidate.spacing.top, other.spacing.top),
    );
  if (area > 0) cost += TEXT_CONFLICT_COST + area * 30;
  if (segmentHitsBox(candidate.connector, paddedBox(other.box, LEADER_CLEARANCE)))
    cost += TEXT_CONFLICT_COST;
  if (segmentHitsBox(other.connector, paddedBox(candidate.box, LEADER_CLEARANCE)))
    cost += TEXT_CONFLICT_COST;
  const gap = segmentDistance(candidate.connector, other.connector);
  if (gap < LEADER_CLEARANCE) cost += 2_000 + (LEADER_CLEARANCE - gap) * 100;
  return cost;
}

/** Resolve coupled conflicts by moving both callouts together when neither can improve alone. */
function untanglePairs(placed: Candidate[], candidates: Candidate[][], pairCost: PairCost): void {
  for (let pass = 0; pass < PAIR_PASSES; pass++) {
    let changed = false;
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        if (pairCost(placed[a]!, placed[b]!) < TEXT_CONFLICT_COST) continue;
        const others = placed.filter((_, index) => index !== a && index !== b);
        let bestA = placed[a]!,
          bestB = placed[b]!;
        let bestCost =
          candidateCost(bestA, others, -1, pairCost) +
          candidateCost(bestB, others, -1, pairCost) +
          pairCost(bestA, bestB);
        const choicesA = candidates[a]!.map((choice) => ({
          choice,
          cost: candidateCost(choice, others, -1, pairCost),
        }));
        const choicesB = candidates[b]!.map((choice) => ({
          choice,
          cost: candidateCost(choice, others, -1, pairCost),
        }));
        for (const left of choicesA) {
          for (const right of choicesB) {
            const cost = left.cost + right.cost + pairCost(left.choice, right.choice);
            if (cost < bestCost - IMPROVEMENT_EPSILON) {
              bestCost = cost;
              bestA = left.choice;
              bestB = right.choice;
            }
          }
        }
        if (bestA !== placed[a] || bestB !== placed[b]) {
          placed[a] = bestA;
          placed[b] = bestB;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

function segmentHitsBox(line: Segment, box: Box): boolean {
  const inside = (x: number, y: number) =>
    x > box.left && x < box.right && y > box.top && y < box.bottom;
  return (
    inside(line.x1, line.y1) ||
    inside(line.x2, line.y2) ||
    [
      { x1: box.left, y1: box.top, x2: box.right, y2: box.top },
      { x1: box.right, y1: box.top, x2: box.right, y2: box.bottom },
      { x1: box.right, y1: box.bottom, x2: box.left, y2: box.bottom },
      { x1: box.left, y1: box.bottom, x2: box.left, y2: box.top },
    ].some((edge) => segmentsCross(line, edge))
  );
}

function segmentsCross(a: Segment, b: Segment): boolean {
  const side = (line: Segment, x: number, y: number) =>
    (line.x2 - line.x1) * (y - line.y1) - (line.y2 - line.y1) * (x - line.x1);
  return (
    side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0
  );
}

/** Reserve a corridor around leaders, including near misses and collinear runs that intersection tests miss. */
function segmentDistance(a: Segment, b: Segment): number {
  if (segmentsCross(a, b)) return 0;
  return Math.min(
    pointSegmentDistance(a.x1, a.y1, b),
    pointSegmentDistance(a.x2, a.y2, b),
    pointSegmentDistance(b.x1, b.y1, a),
    pointSegmentDistance(b.x2, b.y2, a),
  );
}

/** Measure the shortest distance to a plotted segment, including a segment reduced to one point. */
function pointSegmentDistance(x: number, y: number, line: Segment): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const squaredLength = dx * dx + dy * dy;
  const t =
    squaredLength === 0
      ? 0
      : clamp(((x - line.x1) * dx + (y - line.y1) * dy) / squaredLength, 0, 1);
  return Math.hypot(x - line.x1 - t * dx, y - line.y1 - t * dy);
}

/** A label's measured size, or before it is measured an estimate generous enough that nothing placed around it moves much once it is. */
function labelSize(label: Label): PointLabelSize {
  return label.size ?? { width: Math.max(18, label.label.length * 7.8), ascent: 12, descent: 3 };
}

/** Whether two boxes share any area; boxes that only touch along an edge do not. */
export function boxesMeet(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function paddedBox(box: Box, x: number, y = x): Box {
  return { left: box.left - x, right: box.right + x, top: box.top - y, bottom: box.bottom + y };
}

function distanceToBox(x: number, y: number, box: Box): number {
  return Math.hypot(x - clamp(x, box.left, box.right), y - clamp(y, box.top, box.bottom));
}
