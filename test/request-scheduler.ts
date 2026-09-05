/** Verify shared scraper pacing, publisher cooldowns, and cancellation through the complete response body. */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, type TestContext } from "node:test";

import {
  fetchSource,
  scheduleSourcePage,
  scheduleSourceRequest,
  SourceQueueTimeoutError,
} from "../src/model-atlas/sources/request-scheduler";

test("host slots cover body consumption while independent publishers run in parallel", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0);
  const starts: { host: string; at: number }[] = [];
  let finishBodies!: () => void;
  const bodies = new Promise<void>((resolve) => {
    finishBodies = resolve;
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    starts.push({ host: new URL(input).hostname, at: Date.now() });
    return new Response("complete");
  });
  const read = async (response: Response) => {
    await bodies;
    return response.text();
  };
  const requests = [
    fetchSource("https://shared.test/one", {}, 10_000, read),
    fetchSource("https://www.shared.test/two", {}, 10_000, read),
    scheduleSourceRequest("https://shared.test/three", async () => {
      starts.push({ host: "shared.test", at: Date.now() });
      await bodies;
      return "complete";
    }),
    fetchSource("https://shared.test/four", {}, 10_000, read),
    fetchSource("https://independent.test/one", {}, 10_000, read),
  ];
  await advance(t, 0);
  assert.equal(starts.length, 2);
  await advance(t, 149);
  assert.equal(starts.length, 2);
  await advance(t, 1);
  assert.equal(starts.length, 3);
  await advance(t, 150);
  assert.equal(starts.length, 4);
  await advance(t, 500);
  assert.equal(starts.length, 4, "Receiving headers must not release a body download slot");
  finishBodies();
  assert.deepEqual(await Promise.all(requests), Array(5).fill("complete"));
  assert.deepEqual(starts, [
    { host: "shared.test", at: 0 },
    { host: "independent.test", at: 0 },
    { host: "www.shared.test", at: 150 },
    { host: "shared.test", at: 300 },
    { host: "shared.test", at: 800 },
  ]);
  await advance(t, 300);
});

test("OpenRouter starts a page's requests together within the shared twelve-download cap", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0.999);
  const starts: number[] = [];
  let finishBodies!: () => void;
  const bodies = new Promise<void>((resolve) => {
    finishBodies = resolve;
  });
  t.mock.method(globalThis, "fetch", async () => {
    starts.push(Date.now());
    return new Response("ok");
  });
  const pages = Array.from({ length: 3 }, (_, page) =>
    scheduleSourcePage(
      "https://openrouter.ai",
      Array.from(
        { length: 6 },
        (_, index) => () =>
          fetchSource(
            `https://openrouter.ai/stats/${page}/${index}`,
            {},
            10_000,
            async (response) => {
              await bodies;
              return response.text();
            },
          ),
      ),
    ),
  );
  await advance(t, 0);
  assert.deepEqual(starts, Array(6).fill(0));
  await advance(t, 298);
  assert.equal(starts.length, 6);
  await advance(t, 1);
  assert.deepEqual(starts, [...Array(6).fill(0), ...Array(6).fill(299)]);
  await advance(t, 1_000);
  assert.equal(starts.length, 12, "twelve active bodies must prevent a thirteenth download");
  finishBodies();
  assert.deepEqual(
    await Promise.all(pages),
    Array.from({ length: 3 }, () => Array(6).fill("ok")),
  );
  assert.deepEqual(starts.slice(12), Array(6).fill(1_299));
  await advance(t, 300);
});

test("page failures retain their slot until sibling work finishes, across callers and aliases", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0);
  const starts: number[] = [];
  let finishSibling!: () => void;
  const sibling = new Promise<void>((resolve) => {
    finishSibling = resolve;
  });
  const failure = new Error("failed endpoint");
  const pages = Array.from({ length: 5 }, (_, page) => {
    const host = page % 2 === 0 ? "openrouter.ai" : "www.openrouter.ai";
    return assert.rejects(
      scheduleSourcePage(`https://${host}/models/${page}`, [
        async () => {
          starts.push(Date.now());
          throw failure;
        },
        () => sibling,
      ]),
      (error) => error === failure,
    );
  });
  await advance(t, 0);
  for (let page = 1; page < 4; page++) await advance(t, 150);
  assert.deepEqual(starts, [0, 150, 300, 450]);
  await advance(t, 1_000);
  assert.equal(starts.length, 4, "Failed requests must not release a still-active page slot");
  finishSibling();
  await Promise.all(pages);
  assert.deepEqual(starts, [0, 150, 300, 450, 1_450]);
  await advance(t, 150);
});

test("publisher cooldowns pause new pages and retries within an active page", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0);
  const starts: number[] = [];
  const pages: number[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    starts.push(Date.now());
    return new Response(
      "ok",
      starts.length === 1 ? { status: 429, headers: { "retry-after": "2" } } : {},
    );
  });
  const url = "https://openrouter.ai/";
  const read = () => fetchSource(url, {}, 1_000, (response) => response.text());
  const first = scheduleSourcePage(url, [
    async () => {
      pages.push(Date.now());
      await read();
      return read();
    },
  ]);
  const second = scheduleSourcePage(url, [
    async () => {
      pages.push(Date.now());
      return read();
    },
  ]);
  await advance(t, 0);
  await advance(t, 1_999);
  assert.deepEqual(starts, [0]);
  assert.deepEqual(pages, [0]);
  await advance(t, 1);
  await Promise.all([first, second]);
  assert.deepEqual(starts, [0, 2_000, 2_000]);
  assert.deepEqual(pages, [0, 2_000]);
  await advance(t, 150);
});

test("an idle request queue resumes before a slower page retry reuses it", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0);
  const starts: number[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    starts.push(Date.now());
    return new Response(
      "ok",
      starts.length === 1 ? { status: 503, headers: { "retry-after": "1" } } : {},
    );
  });
  const url = "https://openrouter.ai/";
  const read = () => fetchSource(url, {}, 1_000, (response) => response.text());
  const page = scheduleSourcePage(url, [
    async () => {
      await read();
      await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
      return read();
    },
  ]);
  await advance(t, 0);
  await advance(t, 1_000);
  assert.deepEqual(starts, [0]);
  await advance(t, 500);
  assert.deepEqual(await page, ["ok"]);
  assert.deepEqual(starts, [0, 1_500]);
  await advance(t, 150);
});

test("start jitter adds at most 149 ms to the minimum interval", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0.999);
  const starts: number[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    starts.push(Date.now());
    return new Response("ok");
  });
  const first = fetchSource("https://jitter.test/one", {}, 1_000, (response) => response.text());
  const second = fetchSource("https://jitter.test/two", {}, 1_000, (response) => response.text());
  assert.deepEqual(
    starts,
    [0],
    "Queue admission must start fetch immediately, without a deferred reservation",
  );
  await advance(t, 298);
  assert.equal(starts.length, 1);
  await advance(t, 1);
  await Promise.all([first, second]);
  assert.deepEqual(starts, [0, 299]);
  await advance(t, 300);
});

test("Retry-After pauses requests already queued for that host", async (t) => {
  const now = Date.UTC(2026, 8, 5);
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  t.mock.method(Math, "random", () => 0);
  const cases = [
    { status: 429, header: "2", delay: 2_000 },
    { status: 503, header: "date", delay: 5_000 },
    { status: 429, header: null, delay: 30_000 },
    { status: 429, header: "invalid", delay: 30_000 },
    { status: 429, header: "-1", delay: 30_000 },
    { status: 503, header: null, delay: 1_000 },
  ];
  const request = t.mock.method(globalThis, "fetch");
  for (const [index, { status, header, delay }] of cases.entries()) {
    await advance(t, 1_000 - (Date.now() % 1_000));
    const retryAfter = header === "date" ? new Date(Date.now() + delay).toUTCString() : header;
    const starts: number[] = [];
    request.mock.mockImplementation(async () => {
      starts.push(Date.now());
      return new Response("body", {
        status: starts.length === 1 ? status : 200,
        headers: retryAfter == null ? {} : { "retry-after": retryAfter },
      });
    });
    const url = `https://cooldown-${index}.test/`;
    const first = fetchSource(url, {}, 1_000, (response) => response.text());
    const second = fetchSource(url, {}, 1_000, (response) => response.text());
    await advance(t, 0);
    await advance(t, delay - 1);
    assert.equal(starts.length, 1, `HTTP ${status} must hold the host queue`);
    await advance(t, 1);
    await Promise.all([first, second]);
    assert.equal(starts[1]! - starts[0]!, delay);
    await advance(t, 150);
  }
});

test("long cooldowns bound queue waits without issuing requests", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const starts: number[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    starts.push(Date.now());
    return new Response("limited", { status: 429, headers: { "retry-after": "120" } });
  });
  const url = "https://long-cooldown.test/";
  await fetchSource(url, {}, 1_000, (response) => response.text());
  const expired = assert.rejects(
    fetchSource(url, {}, 1_000, (response) => response.text()),
    SourceQueueTimeoutError,
  );
  await advance(t, 60_000);
  await expired;
  assert.equal(starts.length, 1);
  await advance(t, 59_999);
  assert.equal(starts.length, 1);
  await advance(t, 1);
  await fetchSource(url, {}, 1_000, (response) => response.text());
  assert.deepEqual(starts, [0, 120_000]);
  await advance(t, 120_000);
});

test("cancelled queued work never reaches the publisher", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  t.mock.method(Math, "random", () => 0);
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    paths.push(new URL(input).pathname);
    return new Response("ok");
  });
  await fetchSource("https://cancel.test/first", {}, 1_000, (response) => response.text());
  const controller = new AbortController();
  const reason = new Error("refresh cancelled");
  const cancelled = assert.rejects(
    fetchSource("https://cancel.test/cancelled", { signal: controller.signal }, 1_000, (response) =>
      response.text(),
    ),
    (error) => error === reason,
  );
  const next = fetchSource("https://cancel.test/next", {}, 1_000, (response) => response.text());
  controller.abort(reason);
  await cancelled;
  await advance(t, 150);
  assert.equal(await next, "ok");
  assert.deepEqual(paths, ["/first", "/next"]);
  await assert.rejects(
    fetchSource(
      "https://cancel.test/pre-aborted",
      { signal: controller.signal },
      1_000,
      (response) => response.text(),
    ),
    (error) => error === reason,
  );
  await advance(t, 150);
});

test("native fetch aborts slow bodies and starts request timeouts after the queue", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    if (request.url === "/slow") {
      response.write("unfinished");
      return;
    }
    response.end("complete");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;
    let receivedHeaders = false;
    const timedOut = assert.rejects(
      fetchSource(`${url}/slow`, {}, 1_000, async (response) => {
        receivedHeaders = true;
        return response.text();
      }),
      { name: "AbortError" },
    );
    // This timeout is shorter than the host start interval and must not run while queued.
    const next = fetchSource(`${url}/complete`, {}, 100, (response) => response.text());
    const [, complete] = await Promise.all([timedOut, next]);
    assert.ok(receivedHeaders, "The timeout must remain active after response headers arrive");
    assert.equal(complete, "complete");

    const controller = new AbortController();
    await assert.rejects(
      fetchSource(`${url}/slow`, { signal: controller.signal }, 5_000, (response) => {
        const body = response.text();
        controller.abort();
        return body;
      }),
      { name: "AbortError" },
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function advance(t: TestContext, milliseconds: number): Promise<void> {
  t.mock.timers.tick(milliseconds);
  await new Promise<void>((resolve) => setImmediate(resolve));
}
