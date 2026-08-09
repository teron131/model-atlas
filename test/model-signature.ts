/** Verify the model signature selects distinct base models for its five frontier roles. */

import assert from "node:assert/strict";

import { signatureModels } from "../app/dashboard/signature/models";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const model = ({
  id,
  intelligence,
  agentic,
  price,
  throughput,
  openWeights = false,
  effort = null,
}: {
  id: string;
  intelligence: number;
  agentic: number;
  price: number;
  throughput: number;
  openWeights?: boolean;
  effort?: string | null;
}) => ({
  ...minimalModelAtlasModel({ id, name: id }),
  reasoning_effort: effort,
  open_weights: openWeights,
  cost: { blended_price: price },
  speed: {
    throughput_tokens_per_second_median: throughput,
    latency_seconds_median: null,
    e2e_latency_seconds_median: null,
  },
  scores: {
    intelligence_score: intelligence,
    agentic_score: agentic,
    speed_score: throughput / 10,
    value_score: 70,
  },
});

const selected = signatureModels([
  model({
    id: "alpha",
    intelligence: 100,
    agentic: 100,
    price: 10,
    throughput: 100,
    openWeights: true,
    effort: "low",
  }),
  model({
    id: "alpha",
    intelligence: 99,
    agentic: 99,
    price: 9,
    throughput: 110,
    effort: "high",
  }),
  model({
    id: "beta",
    intelligence: 99,
    agentic: 90,
    price: 8,
    throughput: 120,
  }),
  model({
    id: "gamma",
    intelligence: 98,
    agentic: 89,
    price: 7,
    throughput: 130,
  }),
  model({
    id: "delta",
    intelligence: 97,
    agentic: 88,
    price: 1,
    throughput: 140,
  }),
  model({
    id: "epsilon",
    intelligence: 96,
    agentic: 87,
    price: 6,
    throughput: 150,
  }),
  ...Array.from({ length: 20 }, (_, index) =>
    model({
      id: `filler-${index}`,
      intelligence: 20 + index,
      agentic: 20 + index,
      price: 0.01,
      throughput: 50,
    }),
  ),
]);

assert.deepEqual(
  selected.map(({ name, role }) => [role, name]),
  [
    ["Best Intelligence", "alpha (low)"],
    ["Intelligence #3", "gamma"],
    ["Another Top 3", "beta"],
    ["Intelligence #5", "epsilon"],
    ["Pareto Frontier", "delta"],
  ],
);
assert.equal(selected[2]?.selectionMetric, "INT 99.0");
assert.equal(selected[4]?.selectionMetric, "INT 97.0 · $1.0 / 1M");
assert.equal(new Set(selected.map(({ key }) => key.split("\u0000")[0])).size, selected.length);
assert.deepEqual(
  {
    intelligence: selected[0]?.parameters.intelligence,
    agentic: selected[0]?.parameters.agentic,
    speed: selected[0]?.parameters.speed,
    value: selected[0]?.parameters.value,
    mean: selected[0]?.parameters.mean,
  },
  {
    intelligence: 1,
    agentic: 1,
    speed: 0.1,
    value: 0.7,
    mean: 0.7,
  },
);
