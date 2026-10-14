"use client";

/** Coordinate dashboard hydration and active-page refreshes while payload-cache owns downloads and persisted validators. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import {
  type CachedPayload,
  fetchDashboardPayload,
  readCachedPayload,
  schedulePayloadCacheWrite,
} from "./payload-cache";

const PAYLOAD_REFRESH_ATTEMPT_KEY = "model-atlas:selected-payload-refresh-at";
// Cache is only a display substitute; missing or incomplete server payloads still refresh through this guard policy.
const AUTOMATIC_REFRESH_GUARD_MS = 15_000;
const ACTIVE_REFRESH_INTERVAL_MS = 60_000;
const REFRESH_RETRY_SLACK_MS = 25;

type RefreshPayloadOptions = {
  retryWhenGuarded?: boolean;
};

/**
 * Keeps the dashboard payload current while cached data covers compact or unavailable initial responses.
 *
 * `initialEtag` is the dashboard view's validator for the snapshot the server rendered `initialPayload` from.
 * Without it the first refresh of every visit downloaded the whole view and re-rendered the dashboard with identical data.
 */
export function useLivePayload(
  initialPayload: ModelAtlasPayload | null,
  initialEtag: string | null = null,
) {
  const [payload, setPayload] = useState<ModelAtlasPayload | null>(initialPayload);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshRetryTimeoutRef = useRef<number | null>(null);
  const currentPayloadRef = useRef<CachedPayload | null>(
    initialPayload == null ? null : { etag: initialEtag, payload: initialPayload },
  );
  // The browser copy is written once a refresh confirms the payload, whether or not the snapshot had changed.
  const storedPayloadRef = useRef<CachedPayload | null>(null);

  const refreshPayload = useCallback((options?: RefreshPayloadOptions) => {
    if (refreshInFlightRef.current != null) {
      return refreshInFlightRef.current;
    }
    const remainingGuardMs = refreshGuardRemainingMs();
    if (remainingGuardMs > 0) {
      if (options?.retryWhenGuarded && refreshRetryTimeoutRef.current == null) {
        refreshRetryTimeoutRef.current = window.setTimeout(() => {
          refreshRetryTimeoutRef.current = null;
          void refreshPayload();
        }, remainingGuardMs + REFRESH_RETRY_SLACK_MS);
      }
      return Promise.resolve();
    }
    if (refreshRetryTimeoutRef.current != null) {
      window.clearTimeout(refreshRetryTimeoutRef.current);
      refreshRetryTimeoutRef.current = null;
    }
    recordRefreshAttempt();
    setErrorMessage(null);
    const current = currentPayloadRef.current;
    refreshInFlightRef.current = fetchDashboardPayload(current)
      .then((next) => {
        if (next !== storedPayloadRef.current) {
          storedPayloadRef.current = next;
          schedulePayloadCacheWrite(next);
        }
        if (next === current) return;
        currentPayloadRef.current = next;
        setPayload(next.payload);
      })
      .catch((error) => {
        console.error("Unable to refresh stats", error);
        setErrorMessage("Unable to refresh stats");
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });
    return refreshInFlightRef.current;
  }, []);

  useLayoutEffect(() => {
    if (initialPayload != null && hasSelectedBenchmarks(initialPayload)) return;
    const cached = readCachedPayload();
    if (cached != null && (initialPayload == null || hasSelectedBenchmarks(cached.payload))) {
      currentPayloadRef.current = cached;
      storedPayloadRef.current = cached;
      setPayload(cached.payload);
    }
    void refreshPayload({ retryWhenGuarded: true });
  }, [initialPayload, refreshPayload]);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        void refreshPayload({ retryWhenGuarded: true });
      }
    };
    const refreshInterval = window.setInterval(refreshWhenActive, ACTIVE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
      if (refreshRetryTimeoutRef.current != null) {
        window.clearTimeout(refreshRetryTimeoutRef.current);
        refreshRetryTimeoutRef.current = null;
      }
    };
  }, [refreshPayload]);

  return {
    payload,
    errorMessage,
  };
}

function hasSelectedBenchmarks(payload: ModelAtlasPayload): boolean {
  return payload.metadata.scoring.selected_benchmark_keys.length > 0;
}

function refreshGuardRemainingMs(): number {
  try {
    const refreshedAt = Number.parseInt(
      window.sessionStorage.getItem(PAYLOAD_REFRESH_ATTEMPT_KEY) ?? "",
      10,
    );
    if (!Number.isFinite(refreshedAt)) {
      return 0;
    }
    return Math.max(0, AUTOMATIC_REFRESH_GUARD_MS - (Date.now() - refreshedAt));
  } catch {
    return 0;
  }
}

function recordRefreshAttempt(): void {
  try {
    window.sessionStorage.setItem(PAYLOAD_REFRESH_ATTEMPT_KEY, String(Date.now()));
  } catch {}
}
