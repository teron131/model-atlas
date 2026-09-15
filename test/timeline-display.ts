/** Protect frontier eligibility, representative selection and provider-qualified visibility without changing measured scores. */
import assert from "node:assert/strict";

import { modelsForVariantDisplay } from "../app/dashboard/shared/model-display";
import { compactModelVariants } from "../app/leaderboard/model-variants";
import { coverageFrontier } from "../app/timeline/frontier";
import { modelRepresentatives } from "../app/timeline/model-representatives";
import { modelDisplayExclusion } from "../src/model-atlas/stats/model-visibility";
import { historicalSourceModel } from "../src/model-atlas/timeline/model-identity";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const old = { current: false, score: 30, coverage: 0.8, releaseDate: "2023-03-14" };
const reference = { current: true, score: 100, coverage: 0.83, releaseDate: "2025-08-07" };
const weak = { current: true, score: 140, coverage: 0.2, releaseDate: "2025-06-10" };
const unknown = { current: false, score: 150, coverage: null, releaseDate: "2026-05-01" };
const nearby = { current: true, score: 101, coverage: 0.6, releaseDate: "2025-09-01" };
const points = [old, reference, weak, nearby, unknown];
const original = structuredClone(points);
assert.deepEqual(coverageFrontier(points, 0.6), [old, reference, nearby]);
assert.deepEqual(points, original);
assert.deepEqual(coverageFrontier([{ ...old, coverage: null }, weak], 0.6), []);
assert.deepEqual(
  coverageFrontier(
    points.map((point) => ({ ...point, current: !point.current })),
    0.6,
  ).map((point) => point.score),
  [30, 100, 101],
  "Current-app membership cannot change frontier eligibility",
);
const reanchored = points.map((point) => ({ ...point, score: point.score * 10 - 300 }));
assert.deepEqual(
  coverageFrontier(reanchored, 0.6),
  [reanchored[0], reanchored[1], reanchored[3]],
  "Display anchors cannot suppress a nearby record high",
);

const variant = (name: string, effort: string | null, score: number | null) => ({
  ...historicalSourceModel(name, "Lab", effort, "2026-01-01"),
  score,
  coverage: 0.8,
  representativeScore: score,
});
const models = [
  variant("GPT-5.5", null, 135),
  variant("GPT-5.5", "high", 126),
  { ...variant("GPT-5.5", "xhigh", 128), current: true },
  variant("GPT-5.5 Pro", null, 140),
  variant("Old model", null, 30),
  variant("Old model", "high", null),
];
assert.deepEqual(modelRepresentatives(models), [models[2], models[3], models[4]]);
for (const current of [false, true]) {
  const variants = [
    { ...variant("Model", "high", 90), current, representativeScore: 70 },
    { ...variant("Model", "max", 60), current, coverage: 0.3, representativeScore: 80 },
  ];
  assert.deepEqual(
    modelRepresentatives(variants),
    [variants[1]],
    "Agentic values and coverage cannot replace the strongest-Intelligence representative",
  );
}

for (const [name, provider, excluded] of [
  ["GPT-5 Pro", "OpenAI", "OpenAI Pro"],
  ["o1-pro", "OpenAI", "OpenAI Pro"],
  ["Gemini 3 Deep Think", "Google DeepMind", "Gemini Deep Think"],
  ["Claude Mythos Preview", "Anthropic", "Claude Mythos"],
  ["Gemini 3.1 Pro", "Google", null],
  ["GPT-5 Pro", "Another lab", null],
  ["GPT-5.5 (XHigh)", "OpenAI", null],
] as const)
  assert.equal(modelDisplayExclusion({ name, provider }), excluded);

const displayModels = [
  ["GPT-5.5 Pro", "openai"],
  ["Gemini 3 Deep Think", "google"],
  ["Claude Mythos Preview", "anthropic"],
  ["Gemini 3.1 Pro", "google"],
  ["GPT-5.5", "openai"],
].map(([name, provider], index) => ({
  ...minimalModelAtlasModel({ id: `${provider}/model-${index}`, name: name! }),
  provider: provider!,
}));
for (const visible of [
  compactModelVariants(displayModels),
  modelsForVariantDisplay(displayModels, false),
  modelsForVariantDisplay(displayModels, true),
]) {
  assert.deepEqual(
    visible.map((model) => model.name),
    ["Gemini 3.1 Pro", "GPT-5.5"],
  );
}
assert.equal(displayModels.length, 5, "display exclusions preserve the source population");
