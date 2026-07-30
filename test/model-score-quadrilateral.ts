/** Verify fixed-compass score quadrilateral geometry and its visual missing-score policy. */

import assert from "node:assert/strict";

import {
  scoreQuadrilateralPoints,
  scoreQuadrilateralRadius,
} from "../app/dashboard/graphs/score-quadrilateral";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const completeModel = {
  ...minimalModelAtlasModel({ id: "complete", name: "Complete" }),
  scores: {
    intelligence_score: 80,
    agentic_score: 60,
    speed_score: 40,
    value_score: 20,
  },
};

const radius = scoreQuadrilateralRadius(completeModel, 3, 10);
assert.ok(Math.abs(radius - Math.sqrt(54.5)) < 1e-12);

const polygon = scoreQuadrilateralPoints(completeModel, 50, 50, radius);
assert.equal(polygon.length, 4);
assert.ok((polygon[0]?.y ?? 50) < 50);
assert.ok((polygon[1]?.x ?? 50) > 50);
assert.ok((polygon[2]?.y ?? 50) > 50);
assert.ok((polygon[3]?.x ?? 50) < 50);

const area = polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point.x * (next?.y ?? 0) - (next?.x ?? 0) * point.y;
}, 0);
assert.ok(Math.abs(Math.abs(area) / 2 - Math.PI * radius * radius) < 1e-9);

const partialModel = {
  ...completeModel,
  scores: {
    intelligence_score: 80,
    agentic_score: Number.NaN,
    speed_score: 40,
    value_score: Number.NaN,
  },
};
assert.ok(Math.abs(scoreQuadrilateralRadius(partialModel, 3, 10) - Math.sqrt(63.6)) < 1e-12);

const partialPolygon = scoreQuadrilateralPoints(partialModel, 50, 50, 10);
const explicitFallbackPolygon = scoreQuadrilateralPoints(
  {
    ...partialModel,
    scores: {
      intelligence_score: 80,
      agentic_score: 60,
      speed_score: 40,
      value_score: 60,
    },
  },
  50,
  50,
  10,
);
assert.deepEqual(partialPolygon, explicitFallbackPolygon);

const emptyModel = {
  ...completeModel,
  scores: {
    intelligence_score: Number.NaN,
    agentic_score: Number.NaN,
    speed_score: Number.NaN,
    value_score: Number.NaN,
  },
};
assert.equal(scoreQuadrilateralRadius(emptyModel, 3, 10), 3);
