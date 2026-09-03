/** Public LLM stats API for Model Atlas. */

import { createHash } from "node:crypto";

import { readDisplaySnapshotPayload } from "../../../src/model-atlas/database/runtime-snapshot";
import {
  type ModelAtlasJsonView,
  publicJsonPayload,
  publicJsonView,
} from "../../../src/model-atlas/stats/payload/public-json";
import type { ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { publicCacheHeaders } from "../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
  browserMaxAgeSeconds: 60,
  cdnMaxAgeSeconds: 300,
  staleWhileRevalidateSeconds: 3600,
});

const serializedSnapshots = new WeakMap<
  ModelAtlasPayload,
  Partial<Record<ModelAtlasJsonView, { body: string; etag: string }>>
>();

export async function GET(request: Request) {
  const view = publicJsonView(
    new URL(request.url).searchParams.get("view") ?? request.headers.get("x-model-atlas-view"),
  );
  try {
    const snapshot = await readDisplaySnapshotPayload();
    let views = serializedSnapshots.get(snapshot);
    if (!views) {
      views = {};
      serializedSnapshots.set(snapshot, views);
    }
    let serialized = views[view];
    if (!serialized) {
      const body = JSON.stringify(publicJsonPayload(snapshot, view));
      serialized = {
        body,
        etag: `W/"${createHash("sha256").update(body).digest("hex")}"`,
      };
      views[view] = serialized;
    }
    const headers = new Headers(SNAPSHOT_CACHE_HEADERS);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("ETag", serialized.etag);
    headers.set("Vary", "x-model-atlas-view");
    const unchanged = request.headers
      .get("if-none-match")
      ?.split(",")
      .some(
        (tag) => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === serialized.etag.slice(2),
      );
    return new Response(unchanged ? null : serialized.body, {
      status: unchanged ? 304 : 200,
      headers,
    });
  } catch {
    return new Response("Unable to read stats", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
