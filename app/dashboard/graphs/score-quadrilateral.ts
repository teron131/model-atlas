/** Own the fixed-compass quadrilateral geometry used by analytical model-score plots. */

import { meanOfFinite } from "../../../src/model-atlas/numeric";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";

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
