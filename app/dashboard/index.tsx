"use client";

/** Client dashboard for live LLM stats payloads, filtering, sorting, and tooltips. */

import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";

import type {
	LlmStatsColumnTooltips,
	LlmStatsPayload,
} from "../../src/model-atlas/llm/stats/types";
import { BenchmarkStrip } from "./benchmarks/BenchmarkStrip";
import { DashboardGraphs } from "./graphs";
import {
	ColumnTooltip,
	type HeaderTooltipHandler,
	type TooltipState,
	tooltipPositionFromElement,
} from "./shared/ColumnTooltip";
import { liveStatsPath } from "./shared/constants";
import { cacheBustedPath } from "./shared/format";
import { RefreshIcon } from "./shared/icons";
import { ModelTable, reverseDirection } from "./table/ModelTable";
import {
	dedupeDisplayModels,
	type SortKey,
	type SortState,
	sortedRows,
	sorters,
	type TableRow,
} from "./table/models";
import {
	hasSelectedProviderThemeColor,
	type ProviderThemeColors,
	providerThemeSlug,
} from "./table/providerTheme";

const emptyColumnTooltips: LlmStatsColumnTooltips = {};
const LLM_STATS_PAYLOAD_CACHE_KEY = "model-atlas:selected-payload:v1";
const LLM_STATS_PAYLOAD_REFRESH_ATTEMPT_KEY =
	"model-atlas:selected-payload-refresh-at:v1";
// Cache is only a display substitute; loading and scheduled refreshes still run through this guard policy.
const SCHEDULED_REFRESH_INTERVAL_MS = 60_000;
const AUTOMATIC_REFRESH_GUARD_MS = 15_000;
const GUARDED_REFRESH_RETRY_SLACK_MS = 25;
const TOOLTIP_FADE_OUT_MS = 1_000;
const AUTOMATIC_LIVE_REFRESH_ENABLED =
	process.env.NODE_ENV === "production" ||
	process.env.NEXT_PUBLIC_MODEL_ATLAS_AUTO_REFRESH === "1";

type RefreshPayloadOptions = {
	bypassGuard?: boolean;
	retryWhenGuarded?: boolean;
};

export function Dashboard({
	initialPayload,
}: {
	initialPayload: LlmStatsPayload | null;
}) {
	const dashboardRef = useRef<HTMLElement>(null);
	const tooltipFadeTimeoutRef = useRef<number | null>(null);
	const [sortState, setSortState] = useState<SortState>({
		key: "intelligence",
		direction: "descending",
	});
	const [filterQuery, setFilterQuery] = useState("");
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	const deferredFilterQuery = useDeferredValue(filterQuery);
	const [, startSortTransition] = useTransition();
	const { payload, isRefreshing, errorMessage, refreshPayload } =
		useLivePayload(initialPayload);

	const tableRows = useMemo(
		() => dedupeDisplayModels(payload?.models ?? []),
		[payload],
	);
	const providerColors = useProviderThemeColors(tableRows);
	const visibleRows = useMemo(
		() => sortedRows(tableRows, deferredFilterQuery, sortState),
		[deferredFilterQuery, sortState, tableRows],
	);
	const columnTooltips =
		payload?.metadata?.scoring?.column_tooltips ?? emptyColumnTooltips;
	const activeTooltipContent =
		tooltip == null ? undefined : columnTooltips[tooltip.key];
	const isInitialLoading = payload == null && errorMessage == null;
	const rowCountLabel =
		payload == null
			? "Loading"
			: `${visibleRows.length} of ${tableRows.length} models`;
	const emptyMessage =
		errorMessage ?? (payload == null ? "Loading stats" : "No models");

	const handleSort = useCallback((key: SortKey) => {
		const defaultDirection = sorters[key].direction;
		startSortTransition(() => {
			setSortState((current) => ({
				key,
				direction:
					current.key === key && current.direction === defaultDirection
						? reverseDirection(defaultDirection)
						: defaultDirection,
			}));
		});
	}, []);

	const clearTooltipFadeTimeout = useCallback(() => {
		if (tooltipFadeTimeoutRef.current != null) {
			window.clearTimeout(tooltipFadeTimeoutRef.current);
			tooltipFadeTimeoutRef.current = null;
		}
	}, []);

	const cancelTooltipFade = useCallback(() => {
		clearTooltipFadeTimeout();
		setTooltip((current) =>
			current == null || current.phase === "visible"
				? current
				: { ...current, phase: "visible" },
		);
	}, [clearTooltipFadeTimeout]);

	const clearTooltip = useCallback(() => {
		setTooltip((current) =>
			current == null || current.phase === "leaving"
				? current
				: { ...current, phase: "leaving" },
		);
		clearTooltipFadeTimeout();
		tooltipFadeTimeoutRef.current = window.setTimeout(() => {
			setTooltip((current) => (current?.phase === "leaving" ? null : current));
			tooltipFadeTimeoutRef.current = null;
		}, TOOLTIP_FADE_OUT_MS);
	}, [clearTooltipFadeTimeout]);

	const showTooltip = useCallback<HeaderTooltipHandler>(
		(event, key) => {
			if (!columnTooltips[key]) {
				return;
			}
			clearTooltipFadeTimeout();
			setTooltip({
				key,
				phase: "visible",
				...tooltipPositionFromElement(event.currentTarget),
			});
		},
		[columnTooltips, clearTooltipFadeTimeout],
	);

	useEffect(() => {
		return clearTooltipFadeTimeout;
	}, [clearTooltipFadeTimeout]);

	useEffect(() => {
		const observer = new ResizeObserver(() => {
			syncFrameWidth();
		});
		const syncFrameWidth = () => {
			const frameWidth = contextColumnFrameWidth(dashboardRef.current);
			if (frameWidth != null) {
				dashboardRef.current?.style.setProperty(
					"--dashboard-frame-width",
					`${frameWidth}px`,
				);
			}
		};
		const observeLayoutTargets = () => {
			const root = dashboardRef.current;
			if (root == null) {
				return;
			}
			const table = root.querySelector<HTMLElement>(".table-wrap table");
			const contextHeader = root.querySelector<HTMLElement>(
				'.table-wrap th[data-column-key="context"]',
			);
			observer.observe(root);
			if (table != null) {
				observer.observe(table);
			}
			if (contextHeader != null) {
				observer.observe(contextHeader);
			}
		};
		syncFrameWidth();
		observeLayoutTargets();
		const animationFrame = window.requestAnimationFrame(() => {
			observeLayoutTargets();
			syncFrameWidth();
		});
		window.addEventListener("resize", syncFrameWidth);
		return () => {
			window.cancelAnimationFrame(animationFrame);
			observer.disconnect();
			window.removeEventListener("resize", syncFrameWidth);
		};
	}, []);

	return (
		<main
			className="dashboard-main"
			ref={dashboardRef}
			aria-busy={isInitialLoading}
		>
			<DashboardHeader />
			<DashboardGraphs
				initialPayload={payload}
				afterControls={
					<BenchmarkStrip payload={payload} isLoading={isInitialLoading} />
				}
				afterLead={
					<section className="dashboard-deck" aria-label="Model leaderboard">
						<DashboardControls
							filterQuery={filterQuery}
							rowCountLabel={rowCountLabel}
							isRefreshing={isRefreshing}
							onFilterQueryChange={setFilterQuery}
							onRefresh={() => void refreshPayload({ bypassGuard: true })}
						/>
						<ModelTable
							sortState={sortState}
							visibleRows={visibleRows}
							emptyMessage={emptyMessage}
							isLoading={isInitialLoading}
							onSort={handleSort}
							onTooltip={showTooltip}
							onTooltipEnd={clearTooltip}
							providerColors={providerColors}
						/>
					</section>
				}
			/>
			{tooltip != null && activeTooltipContent != null && (
				<ColumnTooltip
					content={activeTooltipContent}
					phase={tooltip.phase}
					left={tooltip.left}
					onMouseEnter={cancelTooltipFade}
					onMouseLeave={clearTooltip}
					top={tooltip.top}
				/>
			)}
		</main>
	);
}

function useProviderThemeColors(rows: TableRow[]) {
	const [colors, setColors] = useState<ProviderThemeColors>({});
	const providerKey = useMemo(() => {
		const providers = rows
			.map((row) => providerThemeSlug(row.model.provider))
			.filter(
				(provider) =>
					provider.length > 0 && !hasSelectedProviderThemeColor(provider),
			)
			.sort();
		return [...new Set(providers)].join(",");
	}, [rows]);

	useEffect(() => {
		if (providerKey.length === 0) {
			setColors({});
			return;
		}
		let active = true;
		void fetch(
			`/api/provider-colors?providers=${encodeURIComponent(providerKey)}`,
			{
				cache: "no-store",
			},
		)
			.then((response) => (response.ok ? response.json() : {}))
			.then((payload: ProviderThemeColors) => {
				if (active) {
					setColors(payload);
				}
			})
			.catch((error) => {
				console.error("Unable to derive provider colors", error);
				if (active) {
					setColors({});
				}
			});
		return () => {
			active = false;
		};
	}, [providerKey]);

	return colors;
}

function useLivePayload(initialPayload: LlmStatsPayload | null) {
	const [payload, setPayload] = useState<LlmStatsPayload | null>(
		initialPayload,
	);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const refreshInFlightRef = useRef<Promise<void> | null>(null);
	const refreshRetryTimeoutRef = useRef<number | null>(null);

	const refreshPayload = useCallback((options?: RefreshPayloadOptions) => {
		if (refreshInFlightRef.current != null) {
			return refreshInFlightRef.current;
		}
		const remainingGuardMs = options?.bypassGuard
			? 0
			: refreshGuardRemainingMs();
		if (remainingGuardMs > 0) {
			if (options?.retryWhenGuarded && refreshRetryTimeoutRef.current == null) {
				refreshRetryTimeoutRef.current = window.setTimeout(() => {
					refreshRetryTimeoutRef.current = null;
					void refreshPayload();
				}, remainingGuardMs + GUARDED_REFRESH_RETRY_SLACK_MS);
			}
			return Promise.resolve();
		}
		if (refreshRetryTimeoutRef.current != null) {
			window.clearTimeout(refreshRetryTimeoutRef.current);
			refreshRetryTimeoutRef.current = null;
		}
		recordRefreshAttempt();
		setIsRefreshing(true);
		setErrorMessage(null);
		refreshInFlightRef.current = fetch(cacheBustedPath(liveStatsPath), {
			cache: "no-store",
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.json() as Promise<LlmStatsPayload>;
			})
			.then((nextPayload) => {
				setPayload(nextPayload);
				scheduleCachedPayloadWrite(nextPayload);
			})
			.catch((error) => {
				console.error("Unable to refresh stats", error);
				setErrorMessage("Unable to refresh stats");
			})
			.finally(() => {
				refreshInFlightRef.current = null;
				setIsRefreshing(false);
			});
		return refreshInFlightRef.current;
	}, []);

	useEffect(() => {
		if (initialPayload == null) {
			const cachedPayload = readCachedPayload();
			if (cachedPayload != null) {
				setPayload(cachedPayload);
			}
			void refreshPayload({ retryWhenGuarded: true });
			return;
		}
		if (AUTOMATIC_LIVE_REFRESH_ENABLED) {
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
		if (payload == null || !AUTOMATIC_LIVE_REFRESH_ENABLED) {
			return;
		}
		const interval = window.setInterval(() => {
			void refreshPayload();
		}, SCHEDULED_REFRESH_INTERVAL_MS);
		return () => {
			window.clearInterval(interval);
		};
	}, [payload, refreshPayload]);

	return { payload, isRefreshing, errorMessage, refreshPayload };
}

function isLlmStatsPayload(payload: unknown): payload is LlmStatsPayload {
	if (payload == null || typeof payload !== "object") {
		return false;
	}
	return Array.isArray((payload as Partial<LlmStatsPayload>).models);
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
			window.sessionStorage.getItem(LLM_STATS_PAYLOAD_REFRESH_ATTEMPT_KEY) ??
				"",
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
			LLM_STATS_PAYLOAD_REFRESH_ATTEMPT_KEY,
			String(Date.now()),
		);
	} catch {}
}

function scheduleCachedPayloadWrite(payload: LlmStatsPayload): void {
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

function DashboardHeader() {
	return (
		<header>
			<div className="brand-lockup">
				{/* biome-ignore lint/performance/noImgElement: static markup tests render the client dashboard without Next's image runtime. */}
				<img
					className="brand-mark"
					src="/icons/icon.png"
					alt=""
					width={512}
					height={512}
					decoding="async"
					fetchPriority="high"
				/>
				<h1>Model Atlas</h1>
			</div>
		</header>
	);
}

function DashboardControls({
	filterQuery,
	rowCountLabel,
	isRefreshing,
	onFilterQueryChange,
	onRefresh,
}: {
	filterQuery: string;
	rowCountLabel: string;
	isRefreshing: boolean;
	onFilterQueryChange: (value: string) => void;
	onRefresh: () => void;
}) {
	return (
		<div className="controls">
			<input
				className="model-filter"
				type="search"
				autoComplete="off"
				spellCheck="false"
				placeholder="Filter models"
				value={filterQuery}
				onChange={(event) => onFilterQueryChange(event.target.value)}
			/>
			<div className="control-meta">
				<div className="row-count">{rowCountLabel}</div>
				<button
					className="refresh-button"
					type="button"
					aria-label="Refresh"
					title="Refresh"
					aria-busy={isRefreshing}
					disabled={isRefreshing}
					onClick={onRefresh}
				>
					<RefreshIcon />
				</button>
			</div>
		</div>
	);
}

function contextColumnFrameWidth(root: HTMLElement | null) {
	const contextHeader = root?.querySelector<HTMLElement>(
		'.table-wrap th[data-column-key="context"]',
	);
	if (!contextHeader) {
		return null;
	}
	const rootStyle = root == null ? null : window.getComputedStyle(root);
	const horizontalPadding =
		Number.parseFloat(rootStyle?.paddingLeft ?? "0") +
		Number.parseFloat(rootStyle?.paddingRight ?? "0");
	return Math.ceil(
		contextHeader.offsetLeft + contextHeader.offsetWidth + horizontalPadding,
	);
}
