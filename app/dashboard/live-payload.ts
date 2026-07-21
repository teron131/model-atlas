"use client";

/** Own the dashboard payload's browser fetch, cache, retry, and refresh lifecycle. */

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import type { LlmStatsPayload } from "../../src/model-atlas/stats/types";
import { liveStatsPath } from "./shared/constants";
import { cacheBustedPath } from "./shared/format";

const LLM_STATS_PAYLOAD_CACHE_KEY = "model-atlas:selected-payload";
const PAYLOAD_REFRESH_ATTEMPT_KEY = "model-atlas:selected-payload-refresh-at";
// Cache is only a display substitute; loading and scheduled refreshes still run through this guard policy.
const SCHEDULED_REFRESH_INTERVAL_MS = 60_000;
const AUTOMATIC_REFRESH_GUARD_MS = 15_000;
const REFRESH_RETRY_SLACK_MS = 25;
const AUTOMATIC_REFRESH_ENABLED =
	process.env.NODE_ENV === "production" ||
	process.env.NEXT_PUBLIC_MODEL_ATLAS_AUTO_REFRESH === "1";

type RefreshPayloadOptions = {
	bypassHttpCache?: boolean;
	retryWhenGuarded?: boolean;
};

/** Keeps the dashboard payload current while cached data covers compact or unavailable initial responses. */
export function useLivePayload(initialPayload: LlmStatsPayload | null) {
	const [payload, setPayload] = useState<LlmStatsPayload | null>(
		initialPayload,
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const refreshInFlightRef = useRef<Promise<void> | null>(null);
	const refreshRetryTimeoutRef = useRef<number | null>(null);

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
		refreshInFlightRef.current = fetch(
			options?.bypassHttpCache ? cacheBustedPath(liveStatsPath) : liveStatsPath,
			options?.bypassHttpCache ? { cache: "no-store" } : undefined,
		)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.json() as Promise<LlmStatsPayload>;
			})
			.then((nextPayload) => {
				setPayload(nextPayload);
				scheduleCacheWrite(nextPayload);
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
		const cachedPayload = readCachedPayload();
		if (initialPayload == null) {
			if (cachedPayload != null) {
				setPayload(cachedPayload);
			}
			void refreshPayload({ retryWhenGuarded: true });
			return;
		}
		if (!isFullPayload(initialPayload)) {
			if (cachedPayload != null && isFullPayload(cachedPayload)) {
				setPayload(cachedPayload);
			}
			void refreshPayload({ retryWhenGuarded: true });
		}
	}, [initialPayload, refreshPayload]);

	useEffect(() => {
		return () => {
			if (refreshRetryTimeoutRef.current != null) {
				window.clearTimeout(refreshRetryTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (payload == null || !AUTOMATIC_REFRESH_ENABLED) {
			return;
		}
		const interval = window.setInterval(() => {
			void refreshPayload({ bypassHttpCache: true });
		}, SCHEDULED_REFRESH_INTERVAL_MS);
		return () => {
			window.clearInterval(interval);
		};
	}, [payload, refreshPayload]);

	return {
		payload,
		errorMessage,
		hasFullPayload: payload != null && isFullPayload(payload),
	};
}

function isLlmStatsPayload(payload: unknown): payload is LlmStatsPayload {
	if (payload == null || typeof payload !== "object") {
		return false;
	}
	return Array.isArray((payload as Partial<LlmStatsPayload>).models);
}

function isFullPayload(payload: LlmStatsPayload): boolean {
	return payload.metadata.scoring.selected_benchmark_keys.length > 0;
}

function readCachedPayload(): LlmStatsPayload | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		const cachedPayload = window.localStorage.getItem(
			LLM_STATS_PAYLOAD_CACHE_KEY,
		);
		if (cachedPayload == null) {
			return null;
		}
		const parsedPayload: unknown = JSON.parse(cachedPayload);
		return isLlmStatsPayload(parsedPayload) ? parsedPayload : null;
	} catch {
		return null;
	}
}

function refreshGuardRemainingMs(): number {
	if (typeof window === "undefined") {
		return 0;
	}
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
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.sessionStorage.setItem(
			PAYLOAD_REFRESH_ATTEMPT_KEY,
			String(Date.now()),
		);
	} catch {}
}

function scheduleCacheWrite(payload: LlmStatsPayload): void {
	const idleCallback = window.requestIdleCallback?.(
		() => {
			writeCachedPayload(payload);
		},
		{ timeout: 2500 },
	);
	if (idleCallback != null) {
		return;
	}
	window.setTimeout(() => {
		writeCachedPayload(payload);
	}, 0);
}

function writeCachedPayload(payload: LlmStatsPayload): void {
	try {
		window.localStorage.setItem(
			LLM_STATS_PAYLOAD_CACHE_KEY,
			JSON.stringify(payload),
		);
	} catch {
		// The live response still renders even when browser storage is unavailable.
	}
}
