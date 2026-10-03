/** Round star marks for analytical plots: a model's area follows the mean of its published scores, and effort connectors stop at each star's edge. */

import { meanOfFinite } from "../../../../src/model-atlas/math-utils";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";

type StarAnchor = {
  cx: number;
  cy: number;
  radius: number;
};

type StarConnectorSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * Size a star so its area tracks the mean of the model's available Intelligence, Agentic, Speed, and Value scores.
 * A model without any published score keeps the minimum radius.
 */
export function starMarkRadius(
  model: Pick<ModelAtlasModel, "scores">,
  minRadius = 3,
  maxRadius = 10,
): number {
  const mean = meanOfFinite([
    model.scores.intelligence_score,
    model.scores.agentic_score,
    model.scores.speed_score,
    model.scores.value_score,
  ]);
  const strength = Math.max(0, (mean ?? 0) / 100);
  return Math.sqrt(
    minRadius * minRadius + strength * (maxRadius * maxRadius - minRadius * minRadius),
  );
}

/** Join consecutive stars with segments that stop a small gap outside each edge; stars too close to clear both gaps get no segment. */
export function starConnectorSegments(
  anchors: readonly StarAnchor[],
  gap = 2,
): StarConnectorSegment[] {
  const clearance = Math.max(0, gap);
  return anchors.slice(1).flatMap((to, index) => {
    const from = anchors[index];
    if (from == null) {
      return [];
    }
    const deltaX = to.cx - from.cx;
    const deltaY = to.cy - from.cy;
    const distance = Math.hypot(deltaX, deltaY);
    const fromInset = from.radius + clearance;
    const toInset = to.radius + clearance;
    if (distance <= fromInset + toInset) {
      return [];
    }
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    return [
      {
        x1: from.cx + unitX * fromInset,
        y1: from.cy + unitY * fromInset,
        x2: to.cx - unitX * toInset,
        y2: to.cy - unitY * toInset,
      },
    ];
  });
}
