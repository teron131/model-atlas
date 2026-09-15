/** Verify multidimensional reconstruction and independent-evidence accounting rather than overall-index substitution. */
import assert from "node:assert/strict";

import { prepareTimelineBenchmarkEvidence } from "../src/model-atlas/timeline/benchmark-evidence";
import {
  calibrateTimeline,
  DEFAULT_TIMELINE_PARAMETERS,
} from "../src/model-atlas/timeline/calibration";
import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";
import { historicalSourceModel } from "../src/model-atlas/timeline/model-identity";
import { prepareTimelineRelease } from "../src/model-atlas/timeline/scale";
import type { HistoricalSourceRelease } from "../src/model-atlas/timeline/schemas";

const models = Array.from({ length: 16 }, (_, i) =>
  historicalSourceModel(`Donor ${i}`, "Lab", null, "2026-01-01"),
);
const reasoning = historicalSourceModel("Reasoning only", "Lab", null, "2026-01-01");
const mixed = historicalSourceModel("Strong reasoning weak agentic", "Lab", null, "2026-01-01");
const release: HistoricalSourceRelease = {
  id: "multidimensional",
  capturedAt: "2026-01-01",
  artifacts: [],
  portfolios: [],
  models: [...models, reasoning, mixed],
  benchmarks: ["i", "a"].flatMap((d) =>
    [0, 1, 2, 3].map((j) => ({
      id: `${d}${j}`,
      key: `${d}${j}`,
      label: `${d} ${j}`,
      kind: "task" as const,
      scale: "probability" as const,
      weights: { intelligence: d === "i" ? 1 : 0, agentic: d === "a" ? 1 : 0 },
    })),
  ),
  observations: models.flatMap((m, i) =>
    ["i", "a"].flatMap((d) =>
      [0, 1, 2, 3].map((j) => ({
        modelId: m.id,
        benchmarkId: `${d}${j}`,
        value: 0.1 + 0.2 * (d === "i" ? Math.floor(i / 4) : i % 4),
        observedAt: "2026-01-01",
        source: "fixture",
      })),
    ),
  ),
};
for (const m of [reasoning, mixed])
  for (const j of [0, 1, 2])
    release.observations.push({
      modelId: m.id,
      benchmarkId: `i${j}`,
      value: 0.7,
      observedAt: "2026-01-01",
      source: "fixture",
    });
for (const j of [0, 1, 2])
  release.observations.push({
    modelId: mixed.id,
    benchmarkId: `a${j}`,
    value: 0.1,
    observedAt: "2026-01-01",
    source: "fixture",
  });
const current = models.map((m, i) => ({
  model_id: m.id,
  name: m.name,
  provider_id: "Lab",
  release_date: m.releaseDate,
  intelligence_score: 20 + 15 * Math.floor(i / 4),
  agentic_score: 10 + 20 * (i % 4),
  intelligence_confidence: 0.8,
  agentic_confidence: 0.8,
}));
const data = prepareTimelineRelease(
  historicalDatasetFromReleases([release], current, 0, "2026-01-01"),
  DEFAULT_TIMELINE_PARAMETERS,
);
const before = JSON.stringify(data.observations);
const evidence = prepareTimelineBenchmarkEvidence(data, DEFAULT_TIMELINE_PARAMETERS);
const cell = (id: string, task: string) =>
  evidence.cells.find((c) => c.modelId === id && c.benchmarkId === task);
assert.equal(cell(reasoning.id, "i0")!.value, 0.7);
assert.equal(cell(reasoning.id, "i0")!.observed, true);
assert.equal(cell(reasoning.id, "i3")!.observed, false);
assert.ok(cell(reasoning.id, "i3")!.value > 0.5);
assert.equal(
  cell(reasoning.id, "a3"),
  undefined,
  "Reasoning observations cannot independently establish an agentic benchmark",
);
assert.ok(
  cell(mixed.id, "i3")!.value > cell(mixed.id, "a3")!.value,
  "Missing benchmarks preserve the distinct capability profile",
);
assert.equal(
  calibrateTimeline(data, "agentic").estimates.find((e) => e.modelId === reasoning.id)!.value,
  null,
);
assert.equal(
  JSON.stringify(data.observations),
  before,
  "Predictions remain separate from observations",
);
const calibration = calibrateTimeline(data, "intelligence");
const withInventedCells = {
  ...data,
  prepared: {
    parameters: DEFAULT_TIMELINE_PARAMETERS,
    evidence: {
      ...evidence,
      cells: Array.from({ length: 40 }, () => ({ ...cell(reasoning.id, "i3")!, value: 0.95 })),
    },
    calibrations: { intelligence: calibration, agentic: calibration },
  },
};
assert.deepEqual(
  calibrateTimeline(withInventedCells, "intelligence"),
  calibration,
  "Duplicated or altered diagnostic estimates cannot move a score or manufacture support",
);
console.log("Multidimensional benchmark reconstruction checks passed.");

const separatePortfolios = {
  ...data,
  benchmarks: data.benchmarks.map((b) => ({ ...b, primary: b.id === "i3" })),
};
const separated = prepareTimelineBenchmarkEvidence(separatePortfolios, DEFAULT_TIMELINE_PARAMETERS);
assert.equal(
  separated.cells.find((c) => c.modelId === reasoning.id && c.benchmarkId === "i3"),
  undefined,
  "A high percentile on a historical task basket cannot become a primary-portfolio percentile without comparable primary context or an observed index bridge",
);

const specialist = {
  ...data,
  benchmarks: data.benchmarks.map((b) => (b.id === "i0" ? { ...b, key: "epoch:ExploitBench" } : b)),
  observations: data.observations.filter(
    (o) => o.modelId !== models[0]!.id || o.benchmarkId !== "i0",
  ),
};
const specialistEvidence = prepareTimelineBenchmarkEvidence(
  specialist,
  DEFAULT_TIMELINE_PARAMETERS,
);
assert.equal(
  specialistEvidence.cells.find((c) => c.modelId === reasoning.id && c.benchmarkId === "i0")!
    .observed,
  true,
  "Measurements remain available regardless of a benchmark's name",
);
assert.equal(
  specialistEvidence.cells.find((c) => c.modelId === models[0]!.id && c.benchmarkId === "i0")!
    .observed,
  false,
  "A benchmark name cannot block otherwise validated contextual imputation",
);
assert.equal(
  specialistEvidence.cells.find((c) => c.modelId === reasoning.id && c.benchmarkId === "i3")!
    .observed,
  false,
  "Every benchmark follows the same three-observation context rule",
);
assert.ok(specialistEvidence.predictors.some((p) => p.target === "i0" || p.inputs.includes("i0")));
