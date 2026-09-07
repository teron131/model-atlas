/** Effort curves follow the observed effort sequence even when quality or resource coordinates reverse direction. */
import assert from "node:assert/strict";

import { scoreQuadrilateralConnectorSegments } from "../app/dashboard/graphs/plot/score-quadrilateral";
import { reasoningVariantGroups } from "../app/dashboard/shared/model-display";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const model = minimalModelAtlasModel({ id: "test/model", name: "Model" });
const anchors = [
  { model: { ...model, reasoning_effort: "high" }, cx: 150, cy: 0, radius: 2 },
  { model: { ...model, reasoning_effort: "low" }, cx: 100, cy: 200, radius: 2 },
  { model: { ...model, reasoning_effort: "medium" }, cx: 50, cy: 100, radius: 2 },
];
const [group] = reasoningVariantGroups(anchors, (anchor) => anchor.model);
assert.deepEqual(
  group?.variants.map((anchor) => anchor.model.reasoning_effort),
  ["low", "medium", "high"],
);
const segments = scoreQuadrilateralConnectorSegments(group!.variants);
assert.equal(segments.length, 2, "Three efforts form an open chain, not a triangle");
assert.ok(segments[0]!.x1 > segments[0]!.x2, "Low-to-medium retains the reversed X direction");
assert.ok(segments[1]!.x1 < segments[1]!.x2, "Medium-to-high then moves forward on X");
