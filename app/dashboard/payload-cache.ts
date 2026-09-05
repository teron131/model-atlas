/** Browser payload storage keeps validators paired with their data and bounds conditional downloads through body decoding. */

import { isModelAtlasPayload } from "../../src/model-atlas/stats/payload/validation";
import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";

const DASHBOARD_PAYLOAD_PATH = "/api/llm-stats?view=dashboard";
const PAYLOAD_CACHE_KEY = "model-atlas:selected-payload";
const PAYLOAD_DOWNLOAD_TIMEOUT_MS = 30_000;

export type CachedPayload = {
  etag: string | null;
  payload: ModelAtlasPayload;
};

let pendingCacheWrite: CachedPayload | null = null;

/** Reuse a validator only while its validated payload is available to render. */
export async function fetchDashboardPayload(current: CachedPayload | null): Promise<CachedPayload> {
  const response = await fetch(DASHBOARD_PAYLOAD_PATH, {
    cache: "no-cache",
    headers: current?.etag ? { "If-None-Match": current.etag } : {},
    signal: AbortSignal.timeout(PAYLOAD_DOWNLOAD_TIMEOUT_MS),
  });
  if (response.status === 304) {
    if (current == null) throw new Error("Stats returned 304 without a cached payload");
    return current;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  const etag = response.headers.get("etag");
  // Browser caches may merge a 304 into a 200 response; the stored payload still avoids decoding and rendering again.
  if (etag != null && etag === current?.etag) {
    await response.body?.cancel();
    return current;
  }
  const payload: unknown = await response.json();
  if (!isModelAtlasPayload(payload)) throw new Error("Stats returned an invalid dashboard payload");
  return { etag, payload };
}

/** Reject malformed cache entries before pairing a stored validator with data for the next refresh. */
export function readCachedPayload(): CachedPayload | null {
  try {
    const stored = window.localStorage.getItem(PAYLOAD_CACHE_KEY);
    if (stored == null) return null;
    const cached: unknown = JSON.parse(stored);
    if (
      cached != null &&
      typeof cached === "object" &&
      "etag" in cached &&
      (cached.etag === null || typeof cached.etag === "string") &&
      "payload" in cached &&
      isModelAtlasPayload(cached.payload)
    )
      return { etag: cached.etag, payload: cached.payload };
    window.localStorage.removeItem(PAYLOAD_CACHE_KEY);
  } catch {
    // Storage is optional; the live response remains authoritative when it is unavailable or corrupt.
  }
  return null;
}

/** Coalesce deferred writes so an older idle callback cannot overwrite a newer payload and ETag. */
export function schedulePayloadCacheWrite(cached: CachedPayload): void {
  const scheduled = pendingCacheWrite != null;
  pendingCacheWrite = cached;
  if (scheduled) return;
  if (window.requestIdleCallback != null) {
    window.requestIdleCallback(writePendingPayload, { timeout: 2500 });
  } else {
    window.setTimeout(writePendingPayload, 0);
  }
}

function writePendingPayload(): void {
  const cached = pendingCacheWrite;
  pendingCacheWrite = null;
  if (cached == null) return;
  try {
    window.localStorage.setItem(PAYLOAD_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // The live response still renders when storage is unavailable or full.
  }
}
