/** Round star marks for analytical plots: a model's area follows the mean of its published scores, effort connectors stop at each star's edge, and any line drawn over the stars runs behind them. */

import { meanOfFinite } from "../../../../src/model-atlas/math-utils";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import type { PlotBounds } from "./Primitives";
import { type SkyPlotStar, starBody } from "./sky-renderer";

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

// A line passing behind text stops this far short of the text's box.
const TEXT_CLEARANCE = 3;

type LinePoint = { x: number; y: number };
/** A plotted star as a line drawn over the stars sees it. */
export type LineStar = Pick<SkyPlotStar, "x" | "y" | "role" | "glow" | "scale">;

/** The pieces of the straight line from `from` to `to` that stop at the visible body of every star in `stars` and keep clear of every text box in `boxes`, so the line meets the stars and runs behind them and the text; a star standing at `flaring` flares, so its body reads wider. */
export function lineBehind(
  from: LinePoint,
  to: LinePoint,
  stars: readonly LineStar[],
  boxes: readonly PlotBounds[] = [],
  flaring?: LinePoint,
): StarConnectorSegment[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return [];
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  // Stretches along the line, measured from `from`, that a star's clearance circle or a text's grown box covers.
  const cuts: [number, number][] = [];
  for (const star of stars) {
    const clearance = starBody(
      star,
      flaring != null && Math.hypot(star.x - flaring.x, star.y - flaring.y) < 0.5,
    );
    const along = (star.x - from.x) * ux + (star.y - from.y) * uy;
    const off = Math.abs((star.x - from.x) * uy - (star.y - from.y) * ux);
    if (off >= clearance) continue;
    const half = Math.sqrt(clearance ** 2 - off ** 2);
    cuts.push([along - half, along + half]);
  }
  for (const box of boxes) {
    const axes: [number, number, number, number][] = [
      [from.x, ux, box.left - TEXT_CLEARANCE, box.right + TEXT_CLEARANCE],
      [from.y, uy, box.top - TEXT_CLEARANCE, box.bottom + TEXT_CLEARANCE],
    ];
    let start = -Infinity;
    let end = Infinity;
    for (const [origin, step, low, high] of axes) {
      if (step === 0) {
        if (origin <= low || origin >= high) end = -Infinity;
        continue;
      }
      const near = (low - origin) / step;
      const far = (high - origin) / step;
      start = Math.max(start, Math.min(near, far));
      end = Math.min(end, Math.max(near, far));
    }
    if (start < end) cuts.push([start, end]);
  }
  cuts.sort(([start], [otherStart]) => start - otherStart);
  const pieces: StarConnectorSegment[] = [];
  let open = 0;
  const piece = (start: number, end: number) => ({
    x1: from.x + ux * start,
    y1: from.y + uy * start,
    x2: from.x + ux * end,
    y2: from.y + uy * end,
  });
  for (const [start, end] of cuts) {
    if (start > open) pieces.push(piece(open, Math.min(start, length)));
    open = Math.max(open, end);
    if (open >= length) break;
  }
  if (open < length) pieces.push(piece(open, length));
  return pieces;
}
