/** Behavior checks for direction-aware Pareto frontier selection and stable visual ordering. */

import assert from "node:assert/strict";

import { paretoFrontier } from "../app/dashboard/graphs/plot/ParetoEnvelope";

const points = [
  { id: "a", x: 1, y: 1 },
  { id: "b", x: 1, y: 3 },
  { id: "c", x: 2, y: 2 },
  { id: "d", x: 3, y: 4 },
  { id: "e", x: 4, y: 1 },
];
const getX = (point: (typeof points)[number]) => point.x;
const getY = (point: (typeof points)[number]) => point.y;

function frontierIds(xGoal: "maximize" | "minimize", yGoal: "maximize" | "minimize") {
  return paretoFrontier(points, {
    x: { get: getX, goal: xGoal },
    y: { get: getY, goal: yGoal },
  }).map((point) => point.id);
}

assert.deepEqual(frontierIds("maximize", "maximize"), ["d", "e"]);
assert.deepEqual(frontierIds("minimize", "maximize"), ["b", "d"]);
assert.deepEqual(frontierIds("maximize", "minimize"), ["e"]);
assert.deepEqual(frontierIds("minimize", "minimize"), ["a"]);
