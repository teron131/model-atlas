/** Shared source requests pace page loads and standalone downloads, with host-wide cooldowns and full-body timeouts. */

import PQueue from "p-queue";

type RequestPolicy = {
  concurrency: number;
  startIntervalMs: number;
  startJitterMs: number;
};

type QueueState = {
  queue: PQueue;
  policy: RequestPolicy;
  nextStartAt: number;
  timer: ReturnType<typeof setTimeout> | null;
};

type HostQueues = {
  requests: QueueState;
  pages: QueueState;
};

const DEFAULT_REQUEST_POLICY = { concurrency: 3, startIntervalMs: 150, startJitterMs: 150 };
const OPENROUTER_REQUEST_POLICY = { concurrency: 12, startIntervalMs: 0, startJitterMs: 0 };
const PAGE_REQUEST_POLICY = { concurrency: 4, startIntervalMs: 150, startJitterMs: 150 };
const MAX_QUEUE_WAIT_MS = 60_000;
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const UNAVAILABLE_COOLDOWN_MS = 1_000;
const hosts = new Map<string, HostQueues>();

/** A congested or cooling host should fall back to cached evidence instead of immediately rejoining its queue. */
export class SourceQueueTimeoutError extends Error {
  constructor(host: string) {
    super(`Timed out waiting to request source host ${host}`);
    this.name = "SourceQueueTimeoutError";
  }
}

/** Hold a host slot until the caller consumes the body; queue time is bounded separately from the active request timeout. */
export async function fetchSource<T>(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  return scheduleSourceRequest(
    input,
    async () => {
      const controller = new AbortController();
      const signal = init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(input, { ...init, signal });
        if (response.status === 429 || response.status === 503) {
          const delay =
            retryAfterMs(response.headers.get("retry-after")) ??
            (response.status === 429 ? RATE_LIMIT_COOLDOWN_MS : UNAVAILABLE_COOLDOWN_MS);
          const host = sourceHost(input);
          pauseHost(host, hosts.get(host)!, delay);
        }
        return await consume(response);
      } finally {
        clearTimeout(timeout);
        controller.abort();
      }
    },
    init.signal,
  );
}

/** Pace related page requests as one load, retaining its slot until every request and retry settles, even when one fails. */
export async function scheduleSourcePage<T extends unknown[]>(
  input: string | URL,
  requests: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T> {
  const host = sourceHost(input);
  const queues = getHostQueues(host);
  return enqueue(host, queues, queues.pages, async () => {
    const results = await Promise.allSettled(
      requests.map((request) => Promise.resolve().then(request)),
    );
    return results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    }) as T;
  });
}

/** Share host admission with alternate transports such as browser navigation; the operation must cover its complete I/O lifecycle and active cancellation. */
export async function scheduleSourceRequest<T>(
  input: string | URL,
  request: () => Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  signal?.throwIfAborted();
  const host = sourceHost(input);
  const queues = getHostQueues(host);
  return enqueue(host, queues, queues.requests, request, signal);
}

function sourceHost(input: string | URL): string {
  return new URL(input).hostname.replace(/^www\./, "");
}

function getHostQueues(host: string): HostQueues {
  const existing = hosts.get(host);
  if (existing) return existing;
  const policy = host === "openrouter.ai" ? OPENROUTER_REQUEST_POLICY : DEFAULT_REQUEST_POLICY;
  const queues = {
    requests: createQueue(policy),
    pages: createQueue(PAGE_REQUEST_POLICY),
  };
  hosts.set(host, queues);
  for (const state of [queues.requests, queues.pages]) {
    state.queue.on("idle", () => resumeQueue(host, queues, state));
  }
  return queues;
}

function createQueue(policy: RequestPolicy): QueueState {
  return {
    queue: new PQueue({ concurrency: policy.concurrency }),
    policy,
    nextStartAt: 0,
    timer: null,
  };
}

/** Bound queue waits independently; active work retains its slot until its own cancellation and cleanup finish. */
async function enqueue<T>(
  host: string,
  queues: HostQueues,
  state: QueueState,
  operation: () => Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  const timeout = setTimeout(
    () => controller.abort(new SourceQueueTimeoutError(host)),
    MAX_QUEUE_WAIT_MS,
  );
  signal?.addEventListener("abort", abort, { once: true });
  state.timer?.ref();
  try {
    return await state.queue.add(
      async () => {
        clearTimeout(timeout);
        // Queue cancellation ends at admission; the transport keeps its slot until active cancellation finishes.
        signal?.removeEventListener("abort", abort);
        const delay =
          state.policy.startIntervalMs + Math.floor(Math.random() * state.policy.startJitterMs);
        if (delay > 0) pauseQueue(host, queues, state, delay);
        return operation();
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function pauseHost(host: string, queues: HostQueues, delayMs: number): void {
  pauseQueue(host, queues, queues.requests, delayMs);
  pauseQueue(host, queues, queues.pages, delayMs);
}

function pauseQueue(host: string, queues: HostQueues, state: QueueState, delayMs: number): void {
  state.nextStartAt = Math.max(state.nextStartAt, Date.now() + delayMs);
  state.queue.pause();
  resumeQueue(host, queues, state);
}

/** Retain both queues until their work and cooldowns finish so later page loads cannot bypass publisher backpressure. */
function resumeQueue(host: string, queues: HostQueues, state: QueueState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  const idle = isIdle(state);
  const delay = Math.max(0, state.nextStartAt - Date.now());
  if (delay === 0) {
    state.queue.start();
    if (
      [queues.requests, queues.pages].every(
        (queue) => isIdle(queue) && queue.nextStartAt <= Date.now(),
      )
    ) {
      hosts.delete(host);
    }
    return;
  }
  state.timer = setTimeout(
    () => resumeQueue(host, queues, state),
    Math.min(delay, MAX_QUEUE_WAIT_MS),
  );
  if (idle) state.timer.unref();
}

function isIdle(state: QueueState): boolean {
  return state.queue.pending === 0 && state.queue.size === 0;
}

/** Retry-After permits either whole seconds or an HTTP date; an invalid value leaves the source cooldown default in force. */
function retryAfterMs(value: string | null): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (!/^[A-Za-z]/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}
