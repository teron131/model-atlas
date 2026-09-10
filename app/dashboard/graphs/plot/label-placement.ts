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
};
type PointObstacle = { key?: string; cx: number; cy: number; radius: number; weight?: number };
type Candidate = PointLabelPlacement & { box: Box; connector: Segment; cost: number };

/** Retain a bounded set of alternative layouts, then refine the best complete arrangement without sacrificing text readability to shorter leaders. */
export function calloutLabelPlacements({
  labels,
  obstacles,
  bounds,
  segments = [],
  reservedBoxes = [],
}: {
  labels: Label[];
  obstacles: PointObstacle[];
  bounds: Box;
  segments?: Segment[];
  reservedBoxes?: Box[];
}): Map<string, PointLabelPlacement> {
  const ordered = labels
    .map((label, order) => ({ ...label, order }))
    .sort(
      (left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.order - right.order,
    );
  const candidates = ordered.map((label) =>
    labelCandidates(label, bounds, obstacles, segments, reservedBoxes),
  );
  // Keep alternative partial layouts so an early label cannot trap a later leader through text.
  let layouts: { placed: Candidate[]; cost: number }[] = [{ placed: [], cost: 0 }];
  for (const choices of candidates) {
    layouts = layouts
      .flatMap((layout) =>
        choices.map((choice) => ({
          placed: [...layout.placed, choice],
          cost: layout.cost + candidateCost(choice, layout.placed, layout.placed.length),
        })),
      )
      .sort((a, b) => a.cost - b.cost)
      .slice(0, SEARCH_WIDTH);
  }
  const placed = layouts[0]!.placed;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (let index = placed.length - 1; index >= 0; index--) {
      const current = placed[index]!;
      const best = bestCandidate(candidates[index]!, placed, index, current);
      if (best !== current) {
        placed[index] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
  untanglePairs(placed, candidates);
  return new Map(
    ordered.map((label, index) => {
      const { x, y, textAnchor, line } = placed[index]!;
      return [label.key, { x, y, textAnchor, line }];
    }),
  );
}

/** Candidates anchor the text rectangle's edge near the point; text length never adds an artificial leader offset. */
function labelCandidates(
  label: Label,
  bounds: Box,
  obstacles: PointObstacle[],
  segments: Segment[],
  reservedBoxes: Box[],
): Candidate[] {
  const size = label.size ?? {
    width: Math.max(18, label.label.length * 7.8),
    ascent: 12,
    descent: 3,
  };
  const height = size.ascent + size.descent;
  const padding = LABEL_PADDING;
  const candidates: Candidate[] = [];
  for (const [dx, dy] of DIRECTIONS) {
    for (const gap of GAPS) {
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
      if (
        reservedBoxes.some(
          (reserved) =>
            (box.left < reserved.right &&
              box.right > reserved.left &&
              box.top < reserved.bottom &&
              box.bottom > reserved.top) ||
            segmentHitsBox(connector, reserved),
        )
      )
        continue;
      const line = clearance > 10 ? connector : undefined;
      let cost = clearance * 0.5 + clearance * clearance * 0.025;
      for (const point of obstacles) {
        const distance = Math.hypot(
          point.cx - clamp(point.cx, box.left, box.right),
          point.cy - clamp(point.cy, box.top, box.bottom),
        );
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
      for (const segment of segments) {
        if (segmentHitsBox(segment, box)) cost += 200;
        if (segmentsCross(connector, segment)) cost += 1_000;
      }
      candidates.push({
        x: left,
        y: top + size.ascent,
        textAnchor: "start",
        box,
        connector,
        line,
        cost,
      });
    }
  }
  return candidates;
}

/** Strict improvements and fixed traversal order keep identical family states stable across pointer movement. */
function bestCandidate(
  choices: Candidate[],
  placed: Candidate[],
  index: number,
  current: Candidate,
): Candidate {
  let best = current;
  let bestCost = candidateCost(best, placed, index);
  for (const choice of choices) {
    const cost = candidateCost(choice, placed, index);
    if (cost < bestCost - IMPROVEMENT_EPSILON) {
      best = choice;
      bestCost = cost;
    }
  }
  return best;
}

function candidateCost(candidate: Candidate, placed: Candidate[], index: number): number {
  return (
    candidate.cost +
    placed.reduce(
      (cost, other, otherIndex) => cost + (index === otherIndex ? 0 : pairCost(candidate, other)),
      0,
    )
  );
}

function pairCost(candidate: Candidate, other: Candidate): number {
  let cost = 0;
  const area =
    Math.max(
      0,
      Math.min(candidate.box.right, other.box.right) - Math.max(candidate.box.left, other.box.left),
    ) *
    Math.max(
      0,
      Math.min(candidate.box.bottom, other.box.bottom) - Math.max(candidate.box.top, other.box.top),
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
function untanglePairs(placed: Candidate[], candidates: Candidate[][]): void {
  for (let pass = 0; pass < PAIR_PASSES; pass++) {
    let changed = false;
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        if (pairCost(placed[a]!, placed[b]!) < TEXT_CONFLICT_COST) continue;
        const others = placed.filter((_, index) => index !== a && index !== b);
        let bestA = placed[a]!,
          bestB = placed[b]!;
        let bestCost =
          candidateCost(bestA, others, -1) +
          candidateCost(bestB, others, -1) +
          pairCost(bestA, bestB);
        const choicesA = candidates[a]!.map((choice) => ({
          choice,
          cost: candidateCost(choice, others, -1),
        }));
        const choicesB = candidates[b]!.map((choice) => ({
          choice,
          cost: candidateCost(choice, others, -1),
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

function paddedBox(box: Box, padding: number): Box {
  return {
    left: box.left - padding,
    right: box.right + padding,
    top: box.top - padding,
    bottom: box.bottom + padding,
  };
}
