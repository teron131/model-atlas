/** Serve the separate cloud-published Intelligence Index; reading never changes leaderboard relative scores or refits calibration. */

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import { readIntelligenceIndex } from "../../../src/model-atlas/database/runtime-snapshot";
import type { HistoricalDataset } from "../../../src/model-atlas/timeline/schemas";
import { matchesEtag } from "../cache-headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const compress = promisify(gzip);
const responses = new WeakMap<HistoricalDataset, Promise<{ body: Buffer; etag: string }>>();

export async function GET(request: Request) {
  try {
    const dataset = await readIntelligenceIndex();
    if (!dataset?.prepared || !dataset.displayAnchors)
      throw new Error("The published snapshot has no Intelligence Index.");
    let cached = responses.get(dataset);
    if (!cached) {
      // Browser charts use published estimates and diagnostics; fitting graphs stay on the server.
      const { scale: _scale, ...display } = dataset;
      const json = JSON.stringify(display);
      cached = compress(json).then((body) => ({
        body,
        etag: `"${createHash("sha256").update(body).digest("hex")}"`,
      }));
      responses.set(dataset, cached);
      cached.catch(() => responses.delete(dataset));
    }
    const { body, etag } = await cached;
    const headers = {
      "Cache-Control": "no-store",
      ETag: etag,
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
    };
    const unchanged = matchesEtag(request.headers.get("If-None-Match"), etag);
    return new Response(unchanged ? null : new Uint8Array(body), {
      status: unchanged ? 304 : 200,
      headers,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 503 });
  }
}
