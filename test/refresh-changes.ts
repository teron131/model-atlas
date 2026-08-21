/** Verify refresh audits retain only material changes, rank-aligned evidence, and the last event across quiet refreshes. */

import assert from "node:assert/strict";

import {
  insertModels,
  insertModelScoreChanges,
  insertRefreshRuns,
  SnapshotRowCollector,
} from "../src/model-atlas/ingest/writers";
import { buildRefreshChanges } from "../src/model-atlas/stats/payload/changes";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

const previousAlpha = {
  ...minimalModelAtlasModel({ id: "provider/alpha", name: "Alpha" }),
  benchmarks: { hle: 0.5 },
  scores: {
    intelligence_score: 80,
    agentic_score: 50,
    speed_score: 60,
    value_score: 70,
  },
};
const previousBeta = {
  ...minimalModelAtlasModel({ id: "provider/beta", name: "Beta" }),
  benchmarks: { hle: 0.6 },
  scores: {
    intelligence_score: 81,
    agentic_score: 50,
    speed_score: 60,
    value_score: 70,
  },
};
const previousPeers = [
  { name: "gamma", intelligence: 70, hle: 0.4 },
  { name: "delta", intelligence: 60, hle: 0.3 },
  { name: "epsilon", intelligence: 50, hle: 0.2 },
  { name: "zeta", intelligence: 40, hle: 0.1 },
].map(({ name, intelligence, hle }) => ({
  ...minimalModelAtlasModel({ id: `provider/${name}`, name }),
  benchmarks: { hle },
  scores: {
    intelligence_score: intelligence,
    agentic_score: 50,
    speed_score: 60,
    value_score: 70,
  },
}));
const previousPayload = minimalModelAtlasPayload({
  fetchedAt: 100,
  models: [previousAlpha, previousBeta, ...previousPeers],
});
previousPayload.metadata.scoring.intelligence_benchmark_keys = ["hle"];

const currentAlpha = {
  ...previousAlpha,
  benchmarks: { hle: 0.6 },
  confidence: { ...previousAlpha.confidence, intelligence: 0.8 },
  scores: { ...previousAlpha.scores, intelligence_score: 82 },
};
const changes = buildRefreshChanges(
  200,
  previousPayload,
  [currentAlpha, previousBeta, ...previousPeers],
  previousPayload.metadata.scoring,
);

assert.equal(changes.refreshRunRows[0]?.previous_refresh_id, 100);
assert.equal(changes.refreshRunRows[0]?.model_change_count, 2);
assert.equal(changes.refreshRunRows[0]?.score_change_count, 2);
assert.equal(changes.models[0]?.latest_change?.score_before, 80);
assert.equal(changes.models[0]?.latest_change?.score_after, 82);
assert.equal(changes.models[0]?.latest_change?.rank_before, 2);
assert.equal(changes.models[0]?.latest_change?.rank_after, 1);
assert.equal(
  changes.models[0]?.latest_change?.causes.some(({ label }) => label.includes("HLE")),
  true,
  "changed benchmark evidence should be named in the row popover trail",
);
assert.deepEqual(changes.models[0]?.latest_change?.rank_drivers, [
  {
    benchmark_key: "hle",
    label: "HLE",
    benchmark_rank: 1,
    benchmark_model_count: 6,
    rank_correlation: 0.99,
  },
]);
assert.equal(changes.models[1]?.latest_change?.score_delta, 0);
assert.equal(changes.models[1]?.latest_change?.rank_before, 1);
assert.equal(changes.models[1]?.latest_change?.rank_after, 2);
assert.equal(
  changes.models[1]?.latest_change?.causes[0]?.label,
  "Lost #1 within the stable cohort",
  "a leadership swap among continuing models should remain material for the displaced leader",
);

const collector = new SnapshotRowCollector();
insertModels(collector, changes.models);
insertRefreshRuns(collector, changes.refreshRunRows);
insertModelScoreChanges(collector, changes.modelScoreChangeRows);
assert.equal(collector.tables.get("refresh_runs")?.rows.length, 1);
assert.equal(collector.tables.get("model_score_changes")?.rows.length, 2);
const rankDriversColumn =
  collector.tables.get("model_score_changes")?.columns.indexOf("rank_drivers_json") ?? -1;
assert.equal(rankDriversColumn >= 0, true);
assert.equal(
  JSON.parse(String(collector.tables.get("model_score_changes")?.rows[0]?.[rankDriversColumn]))[0]
    .benchmark_key,
  "hle",
  "the material-change audit should retain its strongest rank-aligned benchmark evidence",
);
const latestChangeColumn =
  collector.tables.get("models")?.columns.indexOf("latest_change_json") ?? -1;
assert.equal(latestChangeColumn >= 0, true);
assert.equal(
  JSON.parse(String(collector.tables.get("models")?.rows[0]?.[latestChangeColumn])).score_delta,
  2,
  "the current model row should carry only its primary popover change",
);

const carriedPayload = {
  ...previousPayload,
  fetched_at_epoch_seconds: 200,
  models: changes.models,
};
const quietRefresh = buildRefreshChanges(
  300,
  carriedPayload,
  [
    {
      ...currentAlpha,
      scores: { ...currentAlpha.scores, intelligence_score: 82.2 },
    },
    previousBeta,
    ...previousPeers,
  ],
  previousPayload.metadata.scoring,
);
assert.equal(quietRefresh.modelScoreChangeRows.length, 0);
assert.equal(
  quietRefresh.models[0]?.latest_change?.refresh_id,
  200,
  "quiet refreshes should retain the last material event instead of resetting the UI",
);

const newLeader = {
  ...minimalModelAtlasModel({ id: "provider/new-leader", name: "New Leader" }),
  benchmarks: { hle: 0.7 },
  scores: {
    intelligence_score: 90,
    agentic_score: 49,
    speed_score: 59,
    value_score: 69,
  },
};
const entrantCascade = buildRefreshChanges(
  400,
  previousPayload,
  [newLeader, previousAlpha, previousBeta, ...previousPeers],
  previousPayload.metadata.scoring,
);
assert.equal(entrantCascade.refreshRunRows[0]?.model_change_count, 1);
assert.equal(entrantCascade.models[0]?.latest_change?.dimension, "intelligence");
assert.equal(entrantCascade.models[0]?.latest_change?.rank_before, null);
assert.equal(entrantCascade.models[0]?.latest_change?.rank_after, 1);
assert.equal(entrantCascade.models[0]?.latest_change?.causes[0]?.label, "New model entered at #1");
assert.equal(
  entrantCascade.models.slice(1).every(({ latest_change }) => latest_change == null),
  true,
  "a new leader should not create cascade events for unchanged incumbent models",
);

const baseline = buildRefreshChanges(100, null, [previousAlpha], previousPayload.metadata.scoring);
assert.equal(baseline.modelScoreChangeRows.length, 0, "the first snapshot should be a baseline");
assert.equal(baseline.models[0]?.latest_change, null);
