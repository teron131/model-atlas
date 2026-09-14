/** Protect archived AA measurement provenance, edition separation, conservative identities, and query-series deduplication. */
import assert from "node:assert/strict";

import type { JsonObject } from "../src/model-atlas/runtime";
import { parseArtificialAnalysisHistory } from "../src/model-atlas/timeline/aa-history";
import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";

const html = (rows: JsonObject[]) =>
  `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(rows))}])</script>`;
const v2 = { timestamp: "20250302071507", version: "2.0" };
const v3 = { timestamp: "20251001204842", version: "3.0" };
const observed = {
  id: "measured",
  name: "GPT-4o (Nov '24)",
  short_name: "GPT-4o",
  slug: "gpt-4o",
  model_creators: { name: "OpenAI" },
  release_date: "2024-11-20",
  intelligence_index: 41,
  estimated_intelligence_index: null,
  mmlu_pro: 0.7,
  gpqa: 0.6,
  math_500: 0.8,
};
const rawMissing = {
  id: "missing",
  name: "Grok-1",
  slug: "grok-1",
  model_creators: { name: "xAI" },
  intelligence_index: null,
  estimated_intelligence_index: 32.69,
  gpqa: null,
  lab_claimed_gpqa: 0.99,
};
const displayEstimate = {
  ...rawMissing,
  intelligence_index: 32.69,
  intelligence_index_is_estimated: true,
};
const first = parseArtificialAnalysisHistory(html([observed, rawMissing, displayEstimate]), v2);
assert.equal(first.benchmarks.length, 1);
assert.ok(first.benchmarks.every((b) => b.kind === "index"));
assert.equal(first.benchmarks[0]!.representedBenchmarks, 7);
assert.ok(first.benchmarks[0]!.benchmarkNames!.includes("GPQA Diamond"));
assert.ok(first.observations.every((o) => o.benchmarkId.endsWith(":index")));
const reordered = parseArtificialAnalysisHistory(html([displayEstimate, rawMissing, observed]), v2);
assert.deepEqual(
  [...first.observations].sort((a, b) => a.benchmarkId.localeCompare(b.benchmarkId)),
  [...reordered.observations].sort((a, b) => a.benchmarkId.localeCompare(b.benchmarkId)),
);
assert.equal(first.observations.filter((o) => o.benchmarkId.endsWith(":index")).length, 1);
assert.ok(
  first.observations.every((o) => o.modelId !== "name:grok-1::unknown"),
  "Neither a displayed estimate nor a lab claim is measured evidence",
);
assert.equal(
  first.models.find((m) => m.id === "name:gpt-4o-nov-2024::unknown")!.releaseDate,
  "2024-11-20",
);
const second = parseArtificialAnalysisHistory(
  html([
    {
      ...observed,
      intelligence_index: 30,
      intelligence_index_is_estimated: false,
      estimated_intelligence_index: 28,
      ifbench: 0.5,
    },
  ]),
  v3,
);
const combined = historicalDatasetFromReleases([first, second]);
assert.equal(combined.models.filter((m) => m.name === "GPT-4o (Nov 2024)").length, 1);
assert.deepEqual(
  combined.observations
    .filter((o) => o.benchmarkId.endsWith(":index"))
    .map((o) => o.value)
    .sort((a, b) => a - b),
  [30, 41],
);
const legacy = parseArtificialAnalysisHistory(
  html([
    { id: "legacy", name: "Older model", quality_index_aa: 70, mmlu_aa: 0.8, gpqa_aa: 0.5 },
    { id: "claim", name: "o1-preview", quality_index_aa: 86.4, mmlu_aa: 0.908, gpqa_aa: 0.669 },
  ]),
  { timestamp: "20250101082016", version: "1.x" },
);
assert.ok(
  legacy.observations.every((o) => o.modelId !== "name:o1-preview::unknown"),
  "The capture's preliminary-claim footnote applies to components as well as the aggregate",
);
const variants = parseArtificialAnalysisHistory(
  html([
    { ...observed, id: "thinking", name: "Claude 4 Opus (Reasoning)" },
    { ...observed, id: "none", name: "Claude 4 Opus (Non-reasoning)" },
  ]),
  v2,
);
assert.deepEqual(
  new Set(variants.models.map((m) => m.id)),
  new Set(["name:claude-opus-4::unknown", "name:claude-opus-4::none"]),
);
const collision = parseArtificialAnalysisHistory(
  html([
    { ...observed, id: "a" },
    { ...observed, id: "b", intelligence_index: 42 },
  ]),
  v2,
);
assert.equal(
  collision.models.length,
  2,
  "Distinct publisher records cannot be silently merged by a shared display label",
);
assert.ok(collision.models.every((m) => m.id.startsWith("aa-model:")));
assert.throws(
  () =>
    parseArtificialAnalysisHistory(html([observed, { ...observed, intelligence_index: 90 }]), v2),
  /Conflicting archived AA score/,
);
assert.equal(
  parseArtificialAnalysisHistory(html([observed, { ...observed, gpqa: 0.9 }]), v2).observations
    .length,
  1,
  "Unconsumed component columns cannot create a measurement conflict or additional evidence",
);
assert.equal(legacy.benchmarks[0]!.representedBenchmarks, 4);
assert.deepEqual(legacy.benchmarks[0]!.benchmarkNames, [
  "MMLU",
  "GPQA Diamond",
  "MATH-500",
  "HumanEval",
]);
console.log("Historical AA provenance, editions, estimates, and model identities passed.");

// Corroborated snapshot metadata supersedes a generic family launch date; a deployment alone or conflicting snapshots do not.
const snapshotRow = {
  id: "snapshot-evidence",
  name: "Example Model",
  slug: "example-model",
  model_creators: { name: "Lab" },
  release_date: "2023-11-06",
  intelligence_index: 45,
  chatbot_arena_label: "Example-Model-2024-04-09",
  host_models: [{ host_api_id: "example-model-2024-04-09-global-standard" }],
};
const snapshotRelease = parseArtificialAnalysisHistory(
  html([snapshotRow, { ...snapshotRow, host_models: null }]),
  v2,
);
assert.equal(snapshotRelease.models[0]!.name, "Example Model (Apr 2024)");
assert.equal(snapshotRelease.models[0]!.releaseDate, "2024-04-09");
assert.equal(snapshotRelease.observations[0]!.sourceModelName, "Example Model");
assert.equal(snapshotRelease.observations[0]!.sourceReleaseDate, "2023-11-06");
assert.equal(snapshotRelease.observations[0]!.sourceSnapshot, "Example-Model-2024-04-09");
const conflictingSnapshots = parseArtificialAnalysisHistory(
  html([{ ...snapshotRow, host_models: [{ host_api_id: "example-model-2024-01-25" }] }]),
  v2,
);
assert.equal(conflictingSnapshots.models[0]!.releaseDate, "2023-11-06");
assert.equal(conflictingSnapshots.observations[0]!.sourceSnapshot, undefined);
const uncorroboratedSnapshot = parseArtificialAnalysisHistory(
  html([{ ...snapshotRow, chatbot_arena_label: null }]),
  v2,
);
assert.equal(uncorroboratedSnapshot.models[0]!.releaseDate, "2023-11-06");
const explicitStandard = parseArtificialAnalysisHistory(
  html([{ ...snapshotRow, name: "Example Model (Standard)" }]),
  v2,
);
assert.equal(explicitStandard.models[0]!.effort, "none");
