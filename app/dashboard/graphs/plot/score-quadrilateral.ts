/** Own the fixed-compass quadrilateral geometry used by analytical model-score plots. */

import { meanOfFinite } from "../../../../src/model-atlas/numeric";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";

type QuadrilateralPoint = {
  x: number;
  y: number;
};

type ScoreQuadrilateral = readonly [
  QuadrilateralPoint,
  QuadrilateralPoint,
  QuadrilateralPoint,
  QuadrilateralPoint,
];

type ScoreQuadrilateralConnectorAnchor = {
  model: Pick<ModelAtlasModel, "scores">;
  cx: number;
  cy: number;
  radius: number;
};

type ScoreQuadrilateralConnectorSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * Size a score quadrilateral so its area tracks the mean of its available scores.
 * Missing axes use that same observed mean to preserve a complete visual silhouette.
 */
export function scoreQuadrilateralRadius(
  model: Pick<ModelAtlasModel, "scores">,
  minRadius = 3,
  maxRadius = 10,
): number {
  const { mean } = quadrilateralScoreUnits(model);
  return Math.sqrt(minRadius * minRadius + mean * (maxRadius * maxRadius - minRadius * minRadius));
}

/** Build an equal-area compass polygon: Intelligence up, Agentic right, Speed left, Value down. */
export function scoreQuadrilateralPoints(
  model: Pick<ModelAtlasModel, "scores">,
  cx: number,
  cy: number,
  radius: number,
): ScoreQuadrilateral {
  const { intelligence, agentic, speed, value } = quadrilateralScoreUnits(model);
  const intelligenceRadius = scoreRadius(intelligence);
  const agenticRadius = scoreRadius(agentic);
  const speedRadius = scoreRadius(speed);
  const valueRadius = scoreRadius(value);
  const rawArea = ((intelligenceRadius + valueRadius) * (agenticRadius + speedRadius)) / 2;
  const targetArea = Math.PI * radius * radius;
  const scale = Math.sqrt(targetArea / Math.max(rawArea, 0.01));

  return [
    { x: cx, y: cy - intelligenceRadius * scale },
    { x: cx + agenticRadius * scale, y: cy },
    { x: cx, y: cy + valueRadius * scale },
    { x: cx - speedRadius * scale, y: cy },
  ];
}

/** Connect score quadrilaterals with segments that stop outside each polygon boundary. */
export function scoreQuadrilateralConnectorSegments(
  anchors: ScoreQuadrilateralConnectorAnchor[],
  gap = 2,
): ScoreQuadrilateralConnectorSegment[] {
  return anchors.slice(1).flatMap((to, index) => {
    const from = anchors[index];
    if (from == null) {
      return [];
    }
    const segment = scoreQuadrilateralConnectorSegment(from, to, gap);
    return segment == null ? [] : [segment];
  });
}

function scoreQuadrilateralConnectorSegment(
  from: ScoreQuadrilateralConnectorAnchor,
  to: ScoreQuadrilateralConnectorAnchor,
  gap: number,
): ScoreQuadrilateralConnectorSegment | null {
  const deltaX = to.cx - from.cx;
  const deltaY = to.cy - from.cy;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) {
    return null;
  }
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const safeGap = Math.max(0, gap);
  const fromInset = quadrilateralBoundaryDistance(from, unitX, unitY) + safeGap;
  const toInset = quadrilateralBoundaryDistance(to, -unitX, -unitY) + safeGap;
  if (distance <= fromInset + toInset) {
    return null;
  }
  return {
    x1: from.cx + unitX * fromInset,
    y1: from.cy + unitY * fromInset,
    x2: to.cx - unitX * toInset,
    y2: to.cy - unitY * toInset,
  };
}

function quadrilateralBoundaryDistance(
  anchor: ScoreQuadrilateralConnectorAnchor,
  unitX: number,
  unitY: number,
): number {
  const points = scoreQuadrilateralPoints(anchor.model, anchor.cx, anchor.cy, anchor.radius);
  let boundaryDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (start == null || end == null) {
      continue;
    }
    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const denominator = crossProduct(unitX, unitY, edgeX, edgeY);
    if (Math.abs(denominator) < Number.EPSILON) {
      continue;
    }
    const offsetX = start.x - anchor.cx;
    const offsetY = start.y - anchor.cy;
    const rayDistance = crossProduct(offsetX, offsetY, edgeX, edgeY) / denominator;
    const edgeUnit = crossProduct(offsetX, offsetY, unitX, unitY) / denominator;
    if (rayDistance >= 0 && edgeUnit >= 0 && edgeUnit <= 1) {
      boundaryDistance = Math.min(boundaryDistance, rayDistance);
    }
  }
  return Number.isFinite(boundaryDistance) ? boundaryDistance : 0;
}

function crossProduct(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return leftX * rightY - leftY * rightX;
}

function quadrilateralScoreUnits(model: Pick<ModelAtlasModel, "scores">) {
  const rawScores = [
    model.scores.intelligence_score,
    model.scores.agentic_score,
    model.scores.speed_score,
    model.scores.value_score,
  ];
  const fallbackScore = meanOfFinite(rawScores) ?? 0;
  return {
    intelligence: scoreUnit(model.scores.intelligence_score, fallbackScore),
    agentic: scoreUnit(model.scores.agentic_score, fallbackScore),
    speed: scoreUnit(model.scores.speed_score, fallbackScore),
    value: scoreUnit(model.scores.value_score, fallbackScore),
    mean: scoreUnit(fallbackScore, 0),
  };
}

function scoreUnit(value: number | null | undefined, fallback: number): number {
  return Math.max(0, Math.min(1, (Number.isFinite(value) ? Number(value) : fallback) / 100));
}

function scoreRadius(score: number): number {
  return 0.48 + score * 0.72;
}
