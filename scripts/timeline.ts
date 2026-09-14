/** Freeze a local historical experiment from an explicit checkpoint without publishing or changing leaderboard scores. */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { openDatabase } from "../src/model-atlas/database/schema";
import { importArtificialAnalysisHistory } from "../src/model-atlas/timeline/aa-history";
import { prepareTimelineBenchmarkEvidence } from "../src/model-atlas/timeline/benchmark-evidence";
import {
  anchorTimeline,
  calibrateTimeline,
  DEFAULT_TIMELINE_ANCHORS,
  DEFAULT_TIMELINE_PARAMETERS,
} from "../src/model-atlas/timeline/calibration";
import { buildHistoricalDataset } from "../src/model-atlas/timeline/dataset";
import { auditHistoricalIdentities } from "../src/model-atlas/timeline/identity-audit";
import { refreshHistoricalIndexSources } from "../src/model-atlas/timeline/index-sources";
import { prepareTimelineRelease } from "../src/model-atlas/timeline/scale";
import type { TimelineScale } from "../src/model-atlas/timeline/types";

const databasePath = process.argv[2];
if (!databasePath)
  throw new Error(
    "Usage: pnpm timeline <checkpoint.sqlite>. Use a checkpoint copy for experiments.",
  );
const referenceArg = process.argv.indexOf("--reference-checkpoint");
if (referenceArg >= 0 && !process.argv[referenceArg + 1])
  throw new Error("--reference-checkpoint requires a scored checkpoint path");
const scaleArg = process.argv.indexOf("--scale");
if (scaleArg >= 0 && !process.argv[scaleArg + 1])
  throw new Error("--scale requires a calibration file path");
const scalePath = resolve(
  scaleArg < 0 ? ".cache/timeline-scale.json" : process.argv[scaleArg + 1]!,
);
const db = await openDatabase(resolve(databasePath));
let referenceDb = db;
try {
  if (referenceArg >= 0)
    referenceDb = new DatabaseSync(resolve(process.argv[referenceArg + 1]!), { readOnly: true });
  if (process.argv.includes("--refresh-sources")) await refreshHistoricalIndexSources(db);
  if (process.argv.includes("--import-aa-history") || process.argv.includes("--refresh-sources")) {
    const releases = await importArtificialAnalysisHistory(db);
    console.log(
      JSON.stringify({
        historicalAaCaptures: releases.length,
        observations: releases.reduce((sum, release) => sum + release.observations.length, 0),
      }),
    );
  }
  const incoming = buildHistoricalDataset(db, referenceDb);
  await mkdir(".cache", { recursive: true });
  let previous: TimelineScale | undefined;
  try {
    previous = JSON.parse(await readFile(scalePath, "utf8")) as TimelineScale;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const dataset = prepareTimelineRelease(incoming, DEFAULT_TIMELINE_PARAMETERS, previous);
  const identityAudit = auditHistoricalIdentities(dataset);
  await writeFile(
    ".cache/timeline-identity-audit.json",
    `${JSON.stringify(identityAudit, null, 2)}\n`,
  );
  if (identityAudit.errors.length)
    throw new Error(
      `Historical identity audit found ${identityAudit.errors.length} defects; see .cache/timeline-identity-audit.json before replacing the preview.`,
    );

  const evidence = prepareTimelineBenchmarkEvidence(dataset, DEFAULT_TIMELINE_PARAMETERS);
  const calibrations = {
    intelligence: calibrateTimeline(dataset, "intelligence"),
    agentic: calibrateTimeline(dataset, "agentic"),
  };
  for (const dimension of ["intelligence", "agentic"] as const) {
    const calibration = calibrations[dimension];
    anchorTimeline(calibration, dataset, DEFAULT_TIMELINE_ANCHORS, dimension);
    console.log(
      JSON.stringify({
        dimension,
        models: dataset.models.length,
        references: calibration.estimates.filter((row) => row.reference).length,
        placed: calibration.estimates.filter((row) => row.value != null).length,
        componentSupported: calibration.estimates.filter(
          (row) => row.value != null && !row.indexOnly && !row.reference,
        ).length,
        predictors: calibration.predictors.filter((predictor) => predictor.accepted).length,
        connectedBenchmarks: calibration.connectedBenchmarks,
        scaleId: calibration.scaleId,
        multiStep: calibration.estimates.filter((row) => (row.uncertainty?.steps ?? 0) > 1).length,
      }),
    );
  }
  dataset.prepared = { parameters: DEFAULT_TIMELINE_PARAMETERS, evidence, calibrations };
  const scaleJson = `${JSON.stringify(dataset.scale)}\n`;
  const archiveDirectory = resolve(dirname(scalePath), "timeline-calibrations");
  await mkdir(archiveDirectory, { recursive: true });
  try {
    await writeFile(resolve(archiveDirectory, `${dataset.scale!.id}.json`), scaleJson, {
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await writeFile(`${scalePath}.next`, scaleJson);
  await rename(`${scalePath}.next`, scalePath);
  await writeFile(".cache/timeline-preview.json.next", `${JSON.stringify(dataset)}\n`);
  await rename(".cache/timeline-preview.json.next", ".cache/timeline-preview.json");
  console.log(
    `Timeline experiment saved to ${resolve(".cache/timeline-preview.json")}; open /timeline on the local development server.`,
  );
} finally {
  if (referenceDb !== db) referenceDb.close();
  db.close();
}
