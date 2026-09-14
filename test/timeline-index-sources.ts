/** Verify aggregate-only imports preserve counts, membership, editions and source identities without manufacturing component evidence. */
import assert from "node:assert/strict";

import { processEpochCapabilitiesIndexCsv } from "../src/model-atlas/sources/epoch/capabilities-index";
import { historicalDatasetFromReleases } from "../src/model-atlas/timeline/dataset";
import {
  parseArtificialAnalysisTimeline,
  parseEpochTimeline,
} from "../src/model-atlas/timeline/index-sources";

const epoch = parseEpochTimeline(
  processEpochCapabilitiesIndexCsv(
    "Model,Display name,eci,date,Organization\nExample Model,Example Model,110,2020-05-01,Lab\n",
    undefined,
    "Model,benchmark_id,benchmark,performance\nExample Model,b1,MMLU,0.55\nExample Model,b2,New Test,0\nExample Model,b1,MMLU,0.6\n",
  ),
  "2026-09-10T00:00:00.000Z",
);
assert.equal(epoch.observations.length, 1);
assert.equal(epoch.observations[0]!.value, 110);
assert.equal(epoch.observations[0]!.sourceModelVersion, "Example Model");
assert.equal(epoch.observations[0]!.benchmarkCount, 2);
assert.deepEqual(epoch.observations[0]!.benchmarkNames, ["MMLU", "New Test"]);
assert.ok(epoch.benchmarks.every((b) => b.kind === "index"));
assert.equal(
  epoch.models[0]!.releaseDate,
  "2020-05-01",
  "Capture time cannot become model release time",
);
const unknown = parseEpochTimeline(
  processEpochCapabilitiesIndexCsv("Model,eci\nSparse,100\n"),
  "2026-09-10",
);
assert.equal(unknown.observations[0]!.benchmarkCount, undefined);
assert.deepEqual(
  unknown.observations[0]!.benchmarkNames,
  [],
  "Unknown membership is not an invented empty portfolio",
);

const measured = {
  slug: "other",
  shortName: "Other Model",
  intelligenceIndex: 40,
  intelligenceIndexIsEstimated: false,
  gpqa: 0.6,
};
const aa = parseArtificialAnalysisTimeline(
  [{ ...measured, shortName: "Estimated", intelligenceIndexIsEstimated: true }, measured],
  "2026-09-10T00:00:00.000Z",
  "4.3",
);
assert.equal(
  aa.observations.length,
  1,
  "Publisher estimates and component columns are not observed index evidence",
);
assert.equal(aa.benchmarks.length, 1);
assert.equal(aa.benchmarks[0]!.representedBenchmarks, 10);
assert.ok(aa.benchmarks[0]!.benchmarkNames!.includes("Terminal-Bench 4.0"));
assert.ok(!aa.benchmarks[0]!.benchmarkNames!.includes("Terminal-Bench Hard"));
assert.ok(aa.portfolios[0]!.components.every((c) => c.benchmarkId === null));
assert.throws(
  () => parseArtificialAnalysisTimeline([measured], "2026-09-10", "99.0"),
  /No benchmark membership/,
);

const duplicate = {
  ...aa,
  id: "conflict",
  observations: aa.observations.map((o) => ({ ...o, value: 45 })),
};
const conflict = historicalDatasetFromReleases([epoch, aa, duplicate]);
assert.equal(conflict.conflicts, 1);
assert.ok(!conflict.observations.some((o) => o.benchmarkId === "aa:index:4.3"));
assert.deepEqual(historicalDatasetFromReleases([duplicate, aa, epoch]), conflict);
const correction = {
  ...duplicate,
  id: "correction",
  capturedAt: "2026-09-11",
  observations: duplicate.observations.map((o) => ({ ...o, observedAt: "2026-09-11" })),
};
assert.equal(historicalDatasetFromReleases([epoch, aa, duplicate, correction]).conflicts, 0);
const v2 = parseArtificialAnalysisTimeline([measured], "2025-07-01", "2.0");
const v3 = parseArtificialAnalysisTimeline(
  [{ ...measured, intelligenceIndex: 30 }],
  "2025-10-01",
  "3.0",
);
const editions = historicalDatasetFromReleases([v2, v3]);
assert.equal(editions.models.length, 1);
assert.deepEqual(
  editions.observations.map((o) => o.value),
  [40, 30],
);
assert.equal(v2.benchmarks[0]!.representedBenchmarks, 7);
assert.equal(v3.benchmarks[0]!.representedBenchmarks, 10);
console.log("Index values, benchmark counts, membership and edition checks passed.");

const groupDate = parseEpochTimeline(
  processEpochCapabilitiesIndexCsv(
    "Model,Display name,eci,date,Organization\nExample (Nov 2023),Example (Nov 2023),126,2024-01-25,Lab\n",
  ),
  "2026-09-12",
);
assert.equal(groupDate.models[0]!.name, "Example (Jan 2024)");
assert.equal(groupDate.models[0]!.releaseDate, "2024-01-25");
assert.equal(groupDate.observations[0]!.sourceModelName, "Example (Nov 2023)");
assert.equal(groupDate.observations[0]!.sourceModelVersion, "Example (Nov 2023)");
assert.equal(groupDate.observations[0]!.value, 126);
