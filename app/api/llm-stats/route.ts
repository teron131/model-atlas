/** Public LLM stats API for Model Atlas. */

import { readDisplayPayload } from "../../../src/model-atlas/database/runtime-snapshot";
import { publicJsonView, serializedPublicJson } from "../../leaderboard/public-json";
import { matchesEtag, publicCacheHeaders } from "../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
  browserMaxAgeSeconds: 60,
  cdnMaxAgeSeconds: 300,
  staleWhileRevalidateSeconds: 3600,
});

export async function GET(request: Request) {
  const view = publicJsonView(
    new URL(request.url).searchParams.get("view") ?? request.headers.get("x-model-atlas-view"),
  );
  try {
    const serialized = serializedPublicJson(await readDisplayPayload(), view, siteOrigin(request));
    const headers = new Headers(SNAPSHOT_CACHE_HEADERS);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("ETag", serialized.etag);
    headers.set("Vary", "x-model-atlas-view");
    const unchanged = matchesEtag(request.headers.get("if-none-match"), serialized.etag);
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

/**
 * The public address to prefix a response's own URLs with.
 *
 * Vercel's production domain is used where it is known, so the body is the same for every host that may share the CDN's copy.
 * Elsewhere it is the address the server itself reports for the request, which a local server gives as `localhost`.
 * Forwarding headers are never read: a client can set them, and this response is cached for other callers.
 */
function siteOrigin(request: Request): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return productionHost ? `https://${productionHost}` : new URL(request.url).origin;
}
