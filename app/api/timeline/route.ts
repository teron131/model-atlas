/** Serve the local benchmark-evidence release and keep expensive recalibration off the browser thread. */
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { prepareTimelineBenchmarkEvidence } from "../../../src/model-atlas/timeline/benchmark-evidence";
import {
  anchorTimeline,
  calibrateTimeline,
  DEFAULT_TIMELINE_ANCHORS,
  DEFAULT_TIMELINE_PARAMETERS,
} from "../../../src/model-atlas/timeline/calibration";
import type {
  HistoricalDataset,
  TimelineParameters,
} from "../../../src/model-atlas/timeline/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
let cached: { stamp: number; data: HistoricalDataset } | null = null;

async function release() {
  const path = resolve(".cache/timeline-preview.json");
  const stamp = (await stat(path)).mtimeMs;
  if (cached?.stamp === stamp) return cached;
  const data = JSON.parse(await readFile(path, "utf8")) as HistoricalDataset;
  if (!data.releaseId || !data.scale || !data.prepared)
    throw new Error(
      "Regenerate the local benchmark-evidence release with pnpm timeline <checkpoint.sqlite>.",
    );
  for (const dimension of ["intelligence", "agentic"] as const)
    anchorTimeline(
      data.prepared.calibrations[dimension],
      data,
      DEFAULT_TIMELINE_ANCHORS,
      dimension,
    );
  // Publish only a validated release, and keep its data and file stamp together for response validators.
  cached = { stamp, data };
  return cached;
}

export async function GET(request: Request) {
  try {
    const { data, stamp } = await release();
    const etag = `"${data.releaseId}:${data.scale!.id}:${stamp}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (request.headers.get("If-None-Match") === etag)
      return new Response(null, { status: 304, headers });
    return Response.json(data, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "Generate a local release with pnpm timeline <checkpoint.sqlite>."
            : (error as Error).message,
      },
      { status: 503 },
    );
  }
}

/** Parameters affect derived estimates only; the archived observations and prepared default release stay unchanged. */
export async function POST(request: Request) {
  try {
    const parameters = (await request.json()) as TimelineParameters;
    if (
      !parameters ||
      Object.keys(DEFAULT_TIMELINE_PARAMETERS).some(
        (key) => typeof parameters[key as keyof TimelineParameters] !== "number",
      )
    )
      throw new Error("Provide numeric saturation and validation parameters.");
    const { data } = await release();
    const calibrations = {
      intelligence: calibrateTimeline(data, "intelligence", parameters),
      agentic: calibrateTimeline(data, "agentic", parameters),
    };
    return Response.json(
      {
        releaseId: data.releaseId,
        scaleId: data.scale!.id,
        parameters,
        evidence: prepareTimelineBenchmarkEvidence(data, parameters),
        calibrations,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
