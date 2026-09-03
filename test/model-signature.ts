/** Verify signature roles preserve balanced and above-median Value frontier choices across variants and sparse evidence. */

import assert from "node:assert/strict";

import {
  signatureModels as selectSignatureModels,
  type SignaturePopulation,
} from "../app/dashboard/signature/models";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const signatureModels = (models: SignaturePopulation["models"], limit = 6) =>
  selectSignatureModels({ models, paretoModels: models, referenceModels: models }, limit);

const model = ({
  id,
  intelligence,
  agentic,
  price,
  throughput,
  provider = id,
  openWeights = false,
  effort = null,
  value = 70,
}: {
  id: string;
  intelligence: number;
  agentic: number;
  price: number;
  throughput: number;
  provider?: string;
  openWeights?: boolean;
  effort?: string | null;
  value?: number | null;
}) => ({
  ...minimalModelAtlasModel({ id, name: id }),
  provider,
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
    value_score: value,
  },
});

const selected = signatureModels([
  model({
    id: "alpha",
    intelligence: 100,
    agentic: 100,
    price: 10,
    throughput: 100,
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
    openWeights: true,
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
    value: 90,
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
    ["Best Intelligence", "alpha"],
    ["Best Agentic", "alpha"],
    ["Another Lab", "beta"],
    ["Best Open Weight", "beta"],
    ["Pareto Balance", "delta"],
    ["Pareto Value", "delta"],
  ],
);
assert.equal(selected[1]?.selectionMetric, "AGT 100.0");
assert.equal(selected[2]?.selectionMetric, "INT 99.0");
assert.equal(selected[4]?.selectionMetric, "INT 97.0 · VAL 90.0 · BLEND $1.00/M");
assert.equal(selected[5]?.selectionMetric, "INT 97.0 · VAL 90.0 · BLEND $1.00/M");

const selectedAcrossEfforts = signatureModels([
  model({
    id: "alpha",
    intelligence: 100,
    agentic: 90,
    price: 10,
    throughput: 100,
    effort: "high",
  }),
  model({ id: "alpha", intelligence: 95, agentic: 100, price: 10, throughput: 100, effort: "max" }),
  model({ id: "beta", intelligence: 99, agentic: 95, price: 8, throughput: 100 }),
  model({ id: "gamma", intelligence: 98, agentic: 94, price: 7, throughput: 100 }),
]);
assert.deepEqual(
  selectedAcrossEfforts
    .slice(0, 3)
    .map(({ name, role, selectionMetric }) => [role, name, selectionMetric]),
  [
    ["Best Intelligence", "alpha", "INT 100.0"],
    ["Best Agentic", "alpha", "AGT 100.0"],
    ["Another Lab", "beta", "INT 99.0"],
  ],
  "Best Agentic must inspect every effort instead of inheriting the highest-Intelligence variant",
);
assert.equal(selectedAcrossEfforts[1]?.parameters.intelligence, 0.95);
assert.equal(selectedAcrossEfforts[1]?.parameters.agentic, 1);
assert.equal(
  selectedAcrossEfforts.filter(({ name, role }) => name === "alpha" && !role.startsWith("Pareto "))
    .length,
  2,
  "Fallback roles should not select another effort of a model already represented",
);
assert.equal(selectedAcrossEfforts.at(-1)?.role, "Pareto Value");
assert.equal(
  selectedAcrossEfforts.at(-1)?.name,
  "alpha",
  "The frontier winner must retain its role even when it is already the Intelligence or Agentic leader",
);

const selectedAcrossLeaderLabs = signatureModels([
  model({ id: "intelligence-lab", intelligence: 100, agentic: 90, price: 10, throughput: 100 }),
  model({ id: "agentic-lab", intelligence: 90, agentic: 100, price: 5, throughput: 100 }),
  model({ id: "third-lab", intelligence: 80, agentic: 80, price: 1, throughput: 100 }),
]);
assert.deepEqual(
  selectedAcrossLeaderLabs.slice(0, 3).map(({ name, role }) => [role, name]),
  [
    ["Best Intelligence", "intelligence-lab"],
    ["Best Agentic", "agentic-lab"],
    ["Another Lab", "third-lab"],
  ],
);
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

const preview = {
  ...model({
    id: "preview",
    intelligence: 101,
    agentic: 101,
    price: 5,
    throughput: 100,
  }),
  preview: true,
} as const;
const selectedWithPreview = signatureModels([
  preview,
  model({ id: "official-a", intelligence: 100, agentic: 90, price: 10, throughput: 100 }),
  model({ id: "official-b", intelligence: 90, agentic: 100, price: 5, throughput: 100 }),
  model({ id: "official-c", intelligence: 80, agentic: 80, price: 1, throughput: 100 }),
]);
assert.equal(selectedWithPreview[0]?.name, "* preview");
assert.equal(selectedWithPreview[0]?.preview, true);
assert.equal(selectedWithPreview.at(-1)?.role, "Pareto Value");
assert.equal(selectedWithPreview.at(-1)?.name, "* preview");

const tradeoffModels = [
  model({ id: "quality", intelligence: 100, agentic: 100, value: 30, price: 1, throughput: 100 }),
  model({ id: "balanced", intelligence: 72, agentic: 75, value: 91, price: 10, throughput: 60 }),
  model({ id: "capable", intelligence: 82, agentic: 86, value: 71, price: 0.5, throughput: 65 }),
  model({ id: "cheap", intelligence: 61, agentic: 70, value: 95, price: 0.1, throughput: 50 }),
  model({ id: "dominated", intelligence: 71, agentic: 80, value: 90, price: 0.01, throughput: 90 }),
];
assert.equal(
  signatureModels(tradeoffModels).find(({ role }) => role === "Pareto Balance")?.name,
  "balanced",
  "Use the maximum Intelligence × Value frontier point without an Intelligence cutoff or blended-price override",
);
const valueRole = (models: Parameters<typeof signatureModels>[0]) =>
  signatureModels(models).find(({ role }) => role === "Pareto Value");
assert.equal(
  valueRole(tradeoffModels)?.name,
  "capable",
  "Neither the cheap model below the median nor the balanced model exactly at it can qualify",
);
const broadTradeoffs = [
  ...tradeoffModels,
  model({
    id: "extreme-value",
    intelligence: 28,
    agentic: 30,
    value: 99,
    price: 0.001,
    throughput: 50,
  }),
  model({ id: "lower-a", intelligence: 40, agentic: 40, value: 50, price: 1, throughput: 50 }),
  model({ id: "lower-b", intelligence: 50, agentic: 50, value: 50, price: 1, throughput: 50 }),
  model({
    id: "at-median",
    intelligence: 53,
    agentic: 53,
    value: 98,
    price: 0.001,
    throughput: 50,
  }),
  model({ id: "lower-c", intelligence: 45, agentic: 45, value: 50, price: 1, throughput: 50 }),
  model({ id: "lower-d", intelligence: 48, agentic: 48, value: 50, price: 1, throughput: 50 }),
];
assert.deepEqual(
  signatureModels(broadTradeoffs)
    .filter(({ role }) => role.startsWith("Pareto "))
    .map(({ role, name }) => [role, name]),
  [
    ["Pareto Balance", "balanced"],
    ["Pareto Value", "cheap"],
  ],
  "Use the full model median, not the frontier median, and exclude models exactly at the threshold",
);
assert.equal(
  selectSignatureModels({
    models: tradeoffModels.slice(0, 3),
    paretoModels: tradeoffModels,
    referenceModels: broadTradeoffs,
  }).find(({ role }) => role === "Pareto Value")?.name,
  "cheap",
  "The global median and Pareto candidates must survive a smaller ranked or recent display selection",
);
assert.equal(
  selectSignatureModels({
    models: tradeoffModels,
    paretoModels: tradeoffModels.filter(({ id }) => id !== "cheap"),
    referenceModels: broadTradeoffs,
  }).find(({ role }) => role === "Pareto Value")?.name,
  "balanced",
  "Explicit candidate filters must still be honored without changing the global median",
);
assert.equal(
  valueRole([
    ...broadTradeoffs,
    ...["low", "medium", "high", "max"].map((effort) =>
      model({
        id: "quality",
        intelligence: 90,
        agentic: 90,
        value: 90,
        price: 1,
        throughput: 50,
        effort,
      }),
    ),
  ])?.name,
  "cheap",
  "Extra efforts must neither move the base-model median nor replace the highest-Intelligence representative",
);
assert.equal(
  valueRole([
    ...broadTradeoffs,
    {
      ...model({
        id: "preview-value",
        intelligence: 65,
        agentic: 70,
        value: 95,
        price: 1,
        throughput: 50,
      }),
      preview: true,
    },
  ])?.name,
  "* preview-value",
  "Eligible previews compete, and higher Intelligence breaks Value ties",
);
assert.equal(
  valueRole([tradeoffModels[0]!]),
  undefined,
  "A lone model equals the median and cannot qualify",
);
assert.equal(valueRole([]), undefined);
assert.equal(signatureModels(tradeoffModels, 4).length, 4);
assert.equal(signatureModels(tradeoffModels, 5).at(-1)?.role, "Pareto Balance");
assert.equal(
  signatureModels(
    tradeoffModels.map((model) => ({ ...model, cost: { blended_price: null } })),
  ).find(({ role }) => role === "Pareto Balance")?.selectionMetric,
  "INT 72.0 · VAL 91.0",
  "Missing blended price must not affect selection or invent a price",
);
const missingValue = signatureModels(
  tradeoffModels.map((model) => ({ ...model, scores: { ...model.scores, value_score: null } })),
);
assert.equal(
  missingValue.length,
  4,
  "Missing Value evidence must not manufacture either Pareto role",
);
