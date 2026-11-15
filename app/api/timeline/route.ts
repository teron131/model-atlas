/** Serve the separate cloud-published Intelligence Index, or with `view=chart` only its chart points; reading never changes leaderboard relative scores or refits calibration, though it rederives each placement's typical miss from the published scale. */

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import {
  readPublishedPayload,
  readTimelineDataset,
} from "../../../src/model-atlas/database/runtime-snapshot";
import type { ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { calibrateTimeline } from "../../../src/model-atlas/timeline/calibration";
import { capabilityModelId } from "../../../src/model-atlas/timeline/capability";
import type { HistoricalDataset } from "../../../src/model-atlas/timeline/schemas";
import { timelineChartPoints } from "../../dashboard/graphs/timeline/chart-data";
import { matchesEtag } from "../cache-headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const compress = promisify(gzip);
type EncodedResponse = Promise<{ body: Buffer; etag: string }>;
const responses = new WeakMap<HistoricalDataset, EncodedResponse>();
// A chart response also depends on the published payload, whose leaderboard picks each family's representative, and a publish can change either artifact while the other stays byte-identical.
const chartResponses = new WeakMap<
  ModelAtlasPayload,
  WeakMap<HistoricalDataset, EncodedResponse>
>();

export async function GET(request: Request) {
  try {
    const dataset = await readTimelineDataset();
    if (!dataset?.prepared || !dataset.displayAnchors) {
      return Response.json(
        { error: "The published snapshot has no Intelligence Index." },
        { status: 503 },
      );
    }
    const chartPayload =
      new URL(request.url).searchParams.get("view") === "chart"
        ? await readPublishedPayload()
        : null;
    const cache = chartPayload == null ? responses : chartCache(chartPayload);
    let cached = cache.get(dataset);
    if (!cached) {
      // Browser charts use the published estimates with rederived typical misses; fitting graphs stay on the server.
      const { scale: _scale, ...display } = dataset;
      // Chart representatives follow the leaderboard's listed configurations, read from the same published snapshot.
      const json = JSON.stringify(
        chartPayload != null
          ? timelineChartPoints(
              dataset,
              // A model without a catalog ID has no Timeline position, as the dataset build also skips it.
              new Map(
                chartPayload.models.flatMap((model) =>
                  model.id ? [[capabilityModelId(model), model.scores.intelligence_score]] : [],
                ),
              ),
            )
          : withTypicalMisses(display, dataset),
      );
      cached = compress(json).then((body) => ({
        body,
        etag: `"${createHash("sha256").update(body).digest("hex")}"`,
      }));
      cache.set(dataset, cached);
      cached.catch(() => cache.delete(dataset));
    }
    const { body, etag } = await cached;
    const headers = {
      "Cache-Control": chartPayload != null ? "private, max-age=30, must-revalidate" : "no-store",
      ETag: etag,
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
    };
    const unchanged = matchesEtag(request.headers.get("If-None-Match"), etag);
    return new Response(unchanged ? null : new Uint8Array(body), {
      status: unchanged ? 304 : 200,
      headers,
    });
  } catch {
    // A read failure's own message names storage configuration and state, so the client gets a fixed one.
    return Response.json({ error: "Unable to read the Intelligence Index." }, { status: 503 });
  }
}

/** Typical misses are rederived from the published scale as it is served, so a change to how they are checked reaches the chart without waiting for a refresh to republish the evidence; positions stay as published. */
function withTypicalMisses(
  display: Omit<HistoricalDataset, "scale">,
  dataset: HistoricalDataset,
): Omit<HistoricalDataset, "scale"> {
  const prepared = dataset.prepared!;
  const misses = new Map(
    calibrateTimeline(dataset, "intelligence").estimates.map((estimate) => [
      estimate.modelId,
      estimate.uncertainty ?? null,
    ]),
  );
  const intelligence = prepared.calibrations.intelligence;
  return {
    ...display,
    prepared: {
      ...prepared,
      calibrations: {
        ...prepared.calibrations,
        intelligence: {
          ...intelligence,
          estimates: intelligence.estimates.map((estimate) => ({
            ...estimate,
            uncertainty: misses.get(estimate.modelId) ?? null,
          })),
        },
      },
    },
  };
}

function chartCache(payload: ModelAtlasPayload) {
  const cache = chartResponses.get(payload) ?? new WeakMap<HistoricalDataset, EncodedResponse>();
  chartResponses.set(payload, cache);
  return cache;
}
