"use client";

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
	ModelStatsColumnTooltips,
	ModelStatsSelectedPayload,
} from "../../src/model-atlas/llm/llm-stats/types";
import { BenchmarkStrip } from "./benchmarkStrip";
import { liveStatsPath } from "./constants";
import { cacheBustedPath } from "./format";
import { RefreshIcon } from "./icons";
import {
	dedupeDisplayModels,
	type SortKey,
	type SortState,
	sortedRows,
	sorters,
	type TableRow,
} from "./models";
import { ModelTable, reverseDirection } from "./modelTable";
import {
	hasSelectedProviderThemeColor,
	type ProviderThemeColors,
	providerThemeSlug,
} from "./providerTheme";
import {
	ColumnTooltip,
	type HeaderTooltipHandler,
	type TooltipState,
	tooltipPositionFromElement,
} from "./tooltip";

const emptyColumnTooltips: ModelStatsColumnTooltips = {};
const SELECTED_PAYLOAD_CACHE_KEY = "model-atlas:selected-payload:v1";

export function Dashboard({
	initialPayload,
}: {
	initialPayload: ModelStatsSelectedPayload | null;
}) {
	const dashboardRef = useRef<HTMLElement>(null);
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

	const clearTooltip = useCallback(() => {
		setTooltip((current) => (current == null ? current : null));
	}, []);

	const showTooltip = useCallback<HeaderTooltipHandler>(
		(event, key) => {
			if (!columnTooltips[key]) {
				return;
			}
			setTooltip({
				key,
				...tooltipPositionFromElement(event.currentTarget),
			});
		},
		[columnTooltips],
	);

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
		<main ref={dashboardRef}>
			<DashboardHeader />
			<BenchmarkStrip payload={payload} />
			<DashboardControls
				filterQuery={filterQuery}
				rowCountLabel={rowCountLabel}
				isRefreshing={isRefreshing}
				onFilterQueryChange={setFilterQuery}
				onRefresh={() => void refreshPayload()}
			/>
			<ModelTable
				sortState={sortState}
				visibleRows={visibleRows}
				emptyMessage={emptyMessage}
				onSort={handleSort}
				onTooltip={showTooltip}
				onTooltipEnd={clearTooltip}
				providerColors={providerColors}
			/>
			{tooltip != null && activeTooltipContent != null && (
				<ColumnTooltip
					content={activeTooltipContent}
					left={tooltip.left}
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

function useLivePayload(initialPayload: ModelStatsSelectedPayload | null) {
	const [payload, setPayload] = useState<ModelStatsSelectedPayload | null>(
		initialPayload,
	);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const refreshPayload = useCallback(async () => {
		setIsRefreshing(true);
		setErrorMessage(null);
		try {
			const response = await fetch(cacheBustedPath(liveStatsPath), {
				cache: "no-store",
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const nextPayload = (await response.json()) as ModelStatsSelectedPayload;
			setPayload(nextPayload);
			scheduleCachedPayloadWrite(nextPayload);
		} catch (error) {
			console.error("Unable to refresh stats", error);
			setErrorMessage("Unable to refresh stats");
		} finally {
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		if (initialPayload != null) {
			return;
		}
		setPayload(readCachedPayload());
	}, [initialPayload]);

	useEffect(() => {
		if (initialPayload == null) {
			void refreshPayload();
			return;
		}
		const idleCallback = window.requestIdleCallback?.(
			() => {
				void refreshPayload();
			},
			{ timeout: 2000 },
		);
		if (idleCallback != null) {
			return () => {
				window.cancelIdleCallback?.(idleCallback);
			};
		}
		const timeout = window.setTimeout(() => {
			void refreshPayload();
		}, 1200);
		return () => {
			window.clearTimeout(timeout);
		};
	}, [initialPayload, refreshPayload]);

	return { payload, isRefreshing, errorMessage, refreshPayload };
}

function isSelectedPayload(
	payload: unknown,
): payload is ModelStatsSelectedPayload {
	if (payload == null || typeof payload !== "object") {
		return false;
	}
	return Array.isArray((payload as Partial<ModelStatsSelectedPayload>).models);
}

function readCachedPayload(): ModelStatsSelectedPayload | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		const cachedPayload = window.localStorage.getItem(
			SELECTED_PAYLOAD_CACHE_KEY,
		);
		if (cachedPayload == null) {
			return null;
		}
		const parsedPayload: unknown = JSON.parse(cachedPayload);
		return isSelectedPayload(parsedPayload) ? parsedPayload : null;
	} catch {
		return null;
	}
}

function scheduleCachedPayloadWrite(payload: ModelStatsSelectedPayload): void {
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

function writeCachedPayload(payload: ModelStatsSelectedPayload): void {
	try {
		window.localStorage.setItem(
			SELECTED_PAYLOAD_CACHE_KEY,
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
