/** Exercise browser cache recovery, conditional downloads, and stalled-body timeouts against the shared published payload boundary. */

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mock } from "node:test";

import {
  fetchDashboardPayload,
  readCachedPayload,
  schedulePayloadCacheWrite,
} from "../app/dashboard/payload-cache";
import { parseSnapshotPayload } from "../src/model-atlas/database/snapshots/manifest";
import { isModelAtlasPayload } from "../src/model-atlas/stats/payload/validation";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

const payload = minimalModelAtlasPayload({
  fetchedAt: 1_700_000_000,
  models: [minimalModelAtlasModel({ id: "test/model", name: "Test model" })],
});
const cached = { etag: 'W/"first"', payload };
const updated = {
  etag: 'W/"second"',
  payload: { ...payload, fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds! + 1 },
};
const cacheKey = "model-atlas:selected-payload";
const storage = new Map<string, string>();
const idleCallbacks: Array<() => void> = [];
let storageUnavailable = false;
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => {
        if (storageUnavailable) throw new Error("Storage disabled");
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (storageUnavailable) throw new Error("Storage full");
        storage.set(key, value);
      },
      removeItem: (key: string) => storage.delete(key),
    },
    requestIdleCallback: (callback: () => void) => idleCallbacks.push(callback),
  },
});

try {
  assert.ok(isModelAtlasPayload(payload));
  const undated = { ...payload, fetched_at_epoch_seconds: null };
  assert.ok(isModelAtlasPayload(undated), "browser payloads may have no publication timestamp");
  assert.throws(
    () => parseSnapshotPayload(Buffer.from(JSON.stringify(undated))),
    /invalid dashboard snapshot/,
  );
  assert.deepEqual(parseSnapshotPayload(Buffer.from(JSON.stringify(payload))), payload);
  for (const invalid of [
    null,
    { models: [] },
    { ...payload, metadata: { scoring: {} } },
    { ...payload, models: [null] },
    { ...payload, models: [{ ...payload.models[0], scores: null }] },
    { ...payload, models: [{ ...payload.models[0], scores: { intelligence_score: "90" } }] },
  ]) {
    assert.equal(isModelAtlasPayload(invalid), false);
    storage.set(cacheKey, JSON.stringify({ etag: cached.etag, payload: invalid }));
    assert.equal(
      readCachedPayload(),
      null,
      "incompatible cached data must not reach the dashboard",
    );
    assert.throws(
      () => parseSnapshotPayload(Buffer.from(JSON.stringify(invalid))),
      /invalid dashboard snapshot/,
    );
  }
  const incomplete = {
    ...payload.models[0],
    cost: null,
    context_window: null,
    scores: { intelligence_score: null, agentic_score: 20, speed_score: null, value_score: null },
  };
  assert.equal(
    isModelAtlasPayload({ ...payload, models: [incomplete] }),
    false,
    "capability scores are required for every published model",
  );
  assert.ok(
    isModelAtlasPayload({
      ...payload,
      models: [{ ...incomplete, scores: { ...incomplete.scores, intelligence_score: 30 } }],
    }),
    "missing specifications and resource scores do not invalidate qualified models",
  );
  for (const stored of ["{broken", JSON.stringify(payload), JSON.stringify({ payload })]) {
    storage.set(cacheKey, stored);
    assert.equal(
      readCachedPayload(),
      null,
      "old or incomplete cache envelopes cannot supply validators",
    );
  }
  schedulePayloadCacheWrite(cached);
  schedulePayloadCacheWrite(updated);
  assert.equal(idleCallbacks.length, 1, "rapid updates share one deferred storage write");
  idleCallbacks.shift()!();
  assert.deepEqual(
    readCachedPayload(),
    updated,
    "the latest payload and validator must be persisted together",
  );
  storageUnavailable = true;
  assert.equal(readCachedPayload(), null);
  schedulePayloadCacheWrite(cached);
  assert.doesNotThrow(() => idleCallbacks.shift()!());
  storageUnavailable = false;

  const fetchMock = mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(init.cache, "no-cache");
    assert.equal(new Headers(init.headers).get("If-None-Match"), cached.etag);
    assert.ok(init.signal);
    return new Response(null, { status: 304 });
  });
  assert.equal(
    await fetchDashboardPayload(cached),
    cached,
    "304 reuses the same object without a render update",
  );
  fetchMock.mock.mockImplementation(async (_url: unknown, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("If-None-Match"), null);
    return Response.json(payload, { headers: { ETag: cached.etag! } });
  });
  assert.deepEqual(await fetchDashboardPayload(null), cached);
  let bodyCancelled = false;
  fetchMock.mock.mockImplementation(
    async () =>
      new Response(
        new ReadableStream({
          cancel: () => {
            bodyCancelled = true;
          },
        }),
        { headers: { ETag: cached.etag! } },
      ),
  );
  assert.equal(
    await fetchDashboardPayload(cached),
    cached,
    "a browser-merged 304 skips the body too",
  );
  assert.equal(bodyCancelled, true);
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 304 }));
  await assert.rejects(fetchDashboardPayload(null), /304 without a cached payload/);
  fetchMock.mock.mockImplementation(async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(fetchDashboardPayload(cached), /HTTP 503/);
  fetchMock.mock.mockImplementation(async () =>
    Response.json({ models: [] }, { headers: { ETag: updated.etag } }),
  );
  await assert.rejects(fetchDashboardPayload(cached), /invalid dashboard payload/);
  assert.deepEqual(
    readCachedPayload(),
    updated,
    "failed downloads do not change the persisted pair",
  );
  fetchMock.mock.restore();

  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"models":');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const originalFetch = globalThis.fetch;
    const timeout = new AbortController();
    mock.method(AbortSignal, "timeout", (delay: number) => {
      assert.equal(delay, 30_000);
      return timeout.signal;
    });
    mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
      assert.equal(init.signal, timeout.signal);
      const response = await originalFetch(`http://127.0.0.1:${address.port}/`, init);
      assert.equal(response.status, 200);
      // Expire only after headers arrive, so a header timeout cannot accidentally satisfy the body-timeout check.
      timeout.abort(new DOMException("Body download timed out", "TimeoutError"));
      return response;
    });
    await assert.rejects(
      fetchDashboardPayload(null),
      (error: Error) => error.name === "TimeoutError" || error.name === "AbortError",
      "timeouts cover a body stalled after successful headers",
    );
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
} finally {
  mock.restoreAll();
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
}

console.log("Dashboard payload cache checks passed");
