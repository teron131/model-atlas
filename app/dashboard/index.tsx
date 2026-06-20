"use client";

/** Client dashboard for live LLM stats payloads, filtering, sorting, and tooltips. */

import {
	useCallback,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";

import { COLUMN_TOOLTIPS } from "../../src/model-atlas/constants";
import type {
	LlmStatsColumnTooltip,
	LlmStatsColumnTooltips,
	LlmStatsPayload,
} from "../../src/model-atlas/llm/stats/types";
import { BenchmarkStrip } from "./benchmarks/BenchmarkStrip";
import { DashboardGraphs } from "./graphs";
import {
	filterByModelControls,
	limitByIntelligenceScore,
} from "./graphs/models";
import type { CostFilter, ModelLimit } from "./graphs/types";
import {
	ColumnTooltip,
	type HeaderTooltipHandler,
	type TooltipState,
	tooltipPositionFromElement,
} from "./shared/ColumnTooltip";
import { benchmarkTooltips, liveStatsPath } from "./shared/constants";
import { cacheBustedPath } from "./shared/format";
import { MoonIcon, RefreshIcon, SunIcon } from "./shared/icons";
import { ModelTable, reverseDirection } from "./table/ModelTable";
import {
	dedupeDisplayModels,
	type SortKey,
	type SortState,
	sortedRows,
	sorters,
} from "./table/models";
import {
	type ColumnView,
	columnViewOptions,
	isSortKeyVisible,
	metricColumnsForView,
} from "./table/tableColumns";

const emptyColumnTooltips: LlmStatsColumnTooltips = {};
const LLM_STATS_PAYLOAD_CACHE_KEY = "model-atlas:selected-payload";
const LLM_STATS_PAYLOAD_REFRESH_ATTEMPT_KEY =
	"model-atlas:selected-payload-refresh-at";
const DASHBOARD_THEME_STORAGE_KEY = "model-atlas:dashboard-theme";
// Cache is only a display substitute; loading and scheduled refreshes still run through this guard policy.
const SCHEDULED_REFRESH_INTERVAL_MS = 60_000;
const AUTOMATIC_REFRESH_GUARD_MS = 15_000;
const GUARDED_REFRESH_RETRY_SLACK_MS = 25;
const TOOLTIP_FADE_OUT_MS = 1_000;
const COLUMN_FRAME_HEADER_KEYS = ["modalities", "context"] as const;
const AUTOMATIC_LIVE_REFRESH_ENABLED =
	process.env.NODE_ENV === "production" ||
	process.env.NEXT_PUBLIC_MODEL_ATLAS_AUTO_REFRESH === "1";

const benchmarkColumnTooltipKeys = {
	gpqa: "gpqa",
	hle: "hle",
	terminalBench: "terminalbench_v21",
	automationBench: "automation_bench",
	blueprintBench: "blueprint_bench_2",
	gdpPdf: "gdp_pdf",
	riemannBench: "riemann_bench",
	cursorBench: "cursorbench",
	deepSWE: "deep_swe",
	agentsLastExam: "agents_last_exam",
} as const satisfies Partial<Record<SortKey, keyof typeof benchmarkTooltips>>;

const benchmarkTableColumnTooltips = Object.fromEntries(
	Object.entries(benchmarkColumnTooltipKeys).flatMap(
		([columnKey, benchmarkKey]) => {
			const tooltip = benchmarkTooltips[benchmarkKey];
			return tooltip == null
				? []
				: [[columnKey, benchmarkTableTooltip(tooltip)]];
		},
	),
) as Partial<Record<SortKey, LlmStatsColumnTooltip>>;

const tableColumnFallbackTooltips: Partial<
	Record<SortKey, LlmStatsColumnTooltip>
> = {
	...benchmarkTableColumnTooltips,
	agentsLastExamCost: COLUMN_TOOLTIPS.agentsLastExamCost,
};

function tooltipForColumn(
	key: SortKey,
	columnTooltips: LlmStatsColumnTooltips,
) {
	return tableColumnFallbackTooltips[key] ?? columnTooltips[key];
}

function benchmarkTableTooltip(
	tooltip: LlmStatsColumnTooltip,
): LlmStatsColumnTooltip {
	return {
		...tooltip,
		rows: [...(tooltip.rows ?? []), ["Sort", "higher values sort first"]],
	};
}

type RefreshPayloadOptions = {
	bypassGuard?: boolean;
	forceFresh?: boolean;
	retryWhenGuarded?: boolean;
};

type DashboardTooltipState = Omit<TooltipState, "key"> & {
	key: SortKey;
};

type DashboardTheme = "dark" | "light";

export function Dashboard({
	initialPayload,
}: {
	initialPayload: LlmStatsPayload | null;
}) {
	const dashboardRef = useRef<HTMLElement>(null);
	const tooltipFadeTimeoutRef = useRef<number | null>(null);
	const [theme, setTheme] = useDashboardTheme();
	const [sortState, setSortState] = useState<SortState>({
		key: "intelligence",
		direction: "descending",
	});
	const [filterQuery, setFilterQuery] = useState("");
	const [tooltip, setTooltip] = useState<DashboardTooltipState | null>(null);
	const [columnView, setColumnView] = useState<ColumnView>("specs");
	const [providerFilter, setProviderFilter] = useState("all");
	const [maxCostFilter, setMaxCostFilter] = useState<CostFilter>("all");
	const [modelLimit, setModelLimit] = useState<ModelLimit>(30);
	const deferredFilterQuery = useDeferredValue(filterQuery);
	const [, startSortTransition] = useTransition();
	const { payload, isRefreshing, errorMessage, refreshPayload } =
		useLivePayload(initialPayload);

	const tableRows = useMemo(
		() => dedupeDisplayModels(payload?.models ?? []),
		[payload],
	);
	const metricColumns = useMemo(
		() => metricColumnsForView(columnView),
		[columnView],
	);
	const filteredTableRows = useMemo(() => {
		const filteredRows = filterByModelControls(tableRows, (row) => row.model, {
			provider: providerFilter,
			maxCost: maxCostFilter,
		});
		return limitByIntelligenceScore(
			filteredRows,
			(row) => row.model,
			modelLimit,
		);
	}, [tableRows, providerFilter, maxCostFilter, modelLimit]);
	const visibleRows = useMemo(
		() => sortedRows(filteredTableRows, deferredFilterQuery, sortState),
		[deferredFilterQuery, sortState, filteredTableRows],
	);
	const columnTooltips =
		payload?.metadata?.scoring?.column_tooltips ?? emptyColumnTooltips;
	const activeTooltipContent =
		tooltip == null ? undefined : tooltipForColumn(tooltip.key, columnTooltips);
	const isInitialLoading = payload == null && errorMessage == null;
	const rowCountLabel =
		payload == null
			? "Loading"
			: `${visibleRows.length} of ${filteredTableRows.length} models`;
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

	const handleColumnViewChange = useCallback((nextColumnView: ColumnView) => {
		setColumnView(nextColumnView);
		setSortState((current) =>
			isSortKeyVisible(nextColumnView, current.key)
				? current
				: {
						key: "intelligence",
						direction: sorters.intelligence.direction,
					},
		);
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
			if (!tooltipForColumn(key, columnTooltips)) {
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
		const syncFrameWidth = () => {
			const frameWidth = defaultColumnFrameWidth(dashboardRef.current);
			if (frameWidth != null) {
				dashboardRef.current?.style.setProperty(
					"--dashboard-frame-width",
					`${frameWidth}px`,
				);
			}
		};
		const observer = new ResizeObserver(() => {
			syncFrameWidth();
		});
		const observeLayoutTargets = () => {
			const root = dashboardRef.current;
			if (root == null) {
				return;
			}
			const table = root.querySelector<HTMLElement>(".table-wrap table");
			const frameHeader = columnFrameHeader(root);
			observer.observe(root);
			if (table != null) {
				observer.observe(table);
			}
			if (frameHeader != null) {
				observer.observe(frameHeader);
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
			data-theme={theme}
			ref={dashboardRef}
			aria-busy={isInitialLoading}
		>
			<DashboardHeader theme={theme} onThemeChange={setTheme} />
			<DashboardGraphs
				initialPayload={payload}
				fullPayloadLoaded={payload != null && hasFullPayload(payload)}
				provider={providerFilter}
				maxCost={maxCostFilter}
				modelLimit={modelLimit}
				onProviderChange={setProviderFilter}
				onMaxCostChange={setMaxCostFilter}
				onModelLimitChange={setModelLimit}
				benchmarkControls={
					<BenchmarkStrip payload={payload} isLoading={isInitialLoading} />
				}
				afterLead={
					<section className="dashboard-deck" aria-label="Model leaderboard">
						<DashboardControls
							columnView={columnView}
							filterQuery={filterQuery}
							rowCountLabel={rowCountLabel}
							isRefreshing={isRefreshing}
							onColumnViewChange={handleColumnViewChange}
							onFilterQueryChange={setFilterQuery}
							onRefresh={() =>
								void refreshPayload({
									bypassGuard: true,
									forceFresh: true,
								})
							}
						/>
						<ModelTable
							sortState={sortState}
							visibleRows={visibleRows}
							emptyMessage={emptyMessage}
							isLoading={isInitialLoading}
							metricColumns={metricColumns}
							onSort={handleSort}
							onTooltip={showTooltip}
							onTooltipEnd={clearTooltip}
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

function useDashboardTheme() {
	const hydratedThemeRef = useRef(false);
	const [theme, setTheme] = useState<DashboardTheme>("dark");

	useLayoutEffect(() => {
		let nextTheme = theme;
		if (!hydratedThemeRef.current) {
			nextTheme = readDashboardTheme() ?? "dark";
			hydratedThemeRef.current = true;
			if (nextTheme !== theme) {
				setTheme(nextTheme);
			}
		}
		document.documentElement.dataset.modelAtlasTheme = nextTheme;
		writeDashboardTheme(nextTheme);
	}, [theme]);

	useEffect(() => {
		return () => {
			delete document.documentElement.dataset.modelAtlasTheme;
		};
	}, []);

	return [theme, setTheme] as const;
}

function readDashboardTheme(): DashboardTheme | null {
	try {
		const storedTheme = window.localStorage.getItem(
			DASHBOARD_THEME_STORAGE_KEY,
		);
		return storedTheme === "light" || storedTheme === "dark"
			? storedTheme
			: null;
	} catch {
		return null;
	}
}

function writeDashboardTheme(theme: DashboardTheme): void {
	try {
		window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, theme);
	} catch {}
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
		refreshInFlightRef.current = fetch(
			options?.forceFresh ? cacheBustedPath(liveStatsPath) : liveStatsPath,
			options?.forceFresh ? { cache: "no-store" } : undefined,
		)
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

	useLayoutEffect(() => {
		const cachedPayload = readCachedPayload();
		if (initialPayload == null) {
			if (cachedPayload != null) {
				setPayload(cachedPayload);
			}
			void refreshPayload({ retryWhenGuarded: true });
			return;
		}
		if (!hasFullPayload(initialPayload)) {
			if (cachedPayload != null && hasFullPayload(cachedPayload)) {
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
		if (payload == null || !AUTOMATIC_LIVE_REFRESH_ENABLED) {
			return;
		}
		const interval = window.setInterval(() => {
			void refreshPayload({ forceFresh: true });
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

function hasFullPayload(payload: LlmStatsPayload): boolean {
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

function DashboardHeader({
	theme,
	onThemeChange,
}: {
	theme: DashboardTheme;
	onThemeChange: (theme: DashboardTheme) => void;
}) {
	return (
		<header className="dashboard-header">
			<div className="brand-lockup">
				<span className="brand-mark" aria-hidden="true" />
				<h1>Model Atlas</h1>
			</div>
			<button
				className="theme-toggle"
				type="button"
				aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
				title={theme === "dark" ? "Light" : "Dark"}
				onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
			>
				{theme === "dark" ? <SunIcon /> : <MoonIcon />}
			</button>
		</header>
	);
}

function DashboardControls({
	columnView,
	filterQuery,
	rowCountLabel,
	isRefreshing,
	onColumnViewChange,
	onFilterQueryChange,
	onRefresh,
}: {
	columnView: ColumnView;
	filterQuery: string;
	rowCountLabel: string;
	isRefreshing: boolean;
	onColumnViewChange: (columnView: ColumnView) => void;
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
			<fieldset className="column-filter">
				<legend className="column-filter-label">Table columns</legend>
				{columnViewOptions.map((option) => (
					<button
						key={option.key}
						className="column-filter-button"
						type="button"
						aria-pressed={columnView === option.key}
						onClick={() => onColumnViewChange(option.key)}
					>
						{option.label}
					</button>
				))}
			</fieldset>
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

function defaultColumnFrameWidth(root: HTMLElement | null) {
	const frameHeader = columnFrameHeader(root);
	if (!frameHeader) {
		return null;
	}
	const rootStyle = root == null ? null : window.getComputedStyle(root);
	const horizontalPadding =
		Number.parseFloat(rootStyle?.paddingLeft ?? "0") +
		Number.parseFloat(rootStyle?.paddingRight ?? "0");
	return Math.ceil(
		frameHeader.offsetLeft + frameHeader.offsetWidth + horizontalPadding,
	);
}

function columnFrameHeader(root: HTMLElement | null) {
	for (const key of COLUMN_FRAME_HEADER_KEYS) {
		const header = root?.querySelector<HTMLElement>(
			`.table-wrap th[data-column-key="${key}"]`,
		);
		if (header != null) {
			return header;
		}
	}
	return null;
}
