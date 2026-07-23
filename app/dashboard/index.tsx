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

import type { ModelAtlasColumnTooltips } from "../../src/model-atlas/config/tooltips";
import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { LeaderboardCapture } from "./capture/LeaderboardCapture";
import { DashboardGraphs } from "./graphs/DashboardGraphs";
import { filterByModelControls, providerOptions } from "./graphs/models";
import type { CostFilter, ModelLimit, ProviderFilters } from "./graphs/types";
import { useLivePayload } from "./live-payload";
import {
	ColumnTooltip,
	type HeaderTooltipHandler,
	type TooltipState,
	tooltipPositionFromElement,
} from "./shared/ColumnTooltip";
import {
	DEFAULT_DISPLAY_ITEMS,
	useDisplayLimit,
} from "./shared/DisplayControls";
import { ModelToolbar } from "./shared/ModelToolbar";
import { modelCount, modelsForVariantDisplay } from "./shared/model-display";
import { ModelTable, reverseDirection } from "./table/ModelTable";
import {
	dashboardMetricColumns,
	dedupeDisplayModels,
	type SortKey,
	type SortState,
	sortedRows,
	sorters,
} from "./table/models";
import { tableColumnTooltip } from "./table/tooltips";

const emptyColumnTooltips: ModelAtlasColumnTooltips = {};
const REASONING_VARIANT_STORAGE_KEY = "model-atlas:expand-reasoning-variants";
const TOOLTIP_FADE_OUT_MS = 1_000;
const COLUMN_FRAME_HEADER_KEYS = ["modalities", "context"] as const;

type DashboardTooltipState = Omit<TooltipState, "key"> & {
	key: SortKey;
};

export function Dashboard({
	initialPayload,
}: {
	initialPayload: ModelAtlasPayload | null;
}) {
	const dashboardRef = useRef<HTMLElement>(null);
	const [showReasoningVariants, setShowReasoningVariants] =
		useReasoningVariantDisplay();
	const [selectedProviders, setSelectedProviders] = useState<ProviderFilters>(
		[],
	);
	const [maxCostFilter, setMaxCostFilter] = useState<CostFilter>("all");
	const [modelLimit, setModelLimit] = useState<ModelLimit>(
		DEFAULT_DISPLAY_ITEMS,
	);
	const { payload, errorMessage, hasFullPayload } =
		useLivePayload(initialPayload);

	const displayPayload = useMemo(() => {
		if (payload == null) {
			return null;
		}
		return {
			...payload,
			models: modelsForVariantDisplay(payload.models, showReasoningVariants),
		};
	}, [payload, showReasoningVariants]);
	const providerChoices = useMemo(
		() => providerOptions(displayPayload?.models ?? []),
		[displayPayload],
	);
	const isInitialLoading = payload == null && errorMessage == null;

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
			ref={dashboardRef}
			aria-busy={isInitialLoading}
		>
			<ModelAtlasHeader page="dashboard" />
			<DashboardGraphs
				payload={displayPayload}
				referenceModels={payload?.models ?? []}
				hasFullPayload={hasFullPayload}
				benchmarksLoading={isInitialLoading}
				selectedProviders={selectedProviders}
				providerChoices={providerChoices}
				maxCost={maxCostFilter}
				modelLimit={modelLimit}
				showReasoningVariants={showReasoningVariants}
				onShowReasoningVariantsChange={setShowReasoningVariants}
				onSelectedProvidersChange={setSelectedProviders}
				onMaxCostChange={setMaxCostFilter}
				onModelLimitChange={setModelLimit}
				afterLead={
					<DashboardLeaderboard
						payload={payload}
						errorMessage={errorMessage}
						isLoading={isInitialLoading}
						maxCost={maxCostFilter}
						selectedProviders={selectedProviders}
						onSelectedProvidersChange={setSelectedProviders}
					/>
				}
			/>
		</main>
	);
}

/** Isolate leaderboard interactions so slider and sort updates do not re-render dashboard graphs. */
function DashboardLeaderboard({
	payload,
	errorMessage,
	isLoading,
	maxCost,
	selectedProviders,
	onSelectedProvidersChange,
}: {
	payload: ModelAtlasPayload | null;
	errorMessage: string | null;
	isLoading: boolean;
	maxCost: CostFilter;
	selectedProviders: ProviderFilters;
	onSelectedProvidersChange: (providers: ProviderFilters) => void;
}) {
	const tooltipFadeTimeoutRef = useRef<number | null>(null);
	const [sortState, setSortState] = useState<SortState>({
		key: "intelligence",
		direction: "descending",
	});
	const [filterQuery, setFilterQuery] = useState("");
	const [tooltip, setTooltip] = useState<DashboardTooltipState | null>(null);
	const [showVariants, setShowVariants] = useState(false);
	const deferredFilterQuery = useDeferredValue(filterQuery);
	const [, startSortTransition] = useTransition();
	const tableRows = useMemo(
		() =>
			dedupeDisplayModels(
				modelsForVariantDisplay(payload?.models ?? [], showVariants),
			),
		[payload, showVariants],
	);
	const providerChoices = useMemo(
		() => providerOptions(tableRows.map((row) => row.model)),
		[tableRows],
	);
	const providerModelCount = useMemo(
		() => modelCount(tableRows.map((row) => row.model)),
		[tableRows],
	);
	const filteredRows = useMemo(
		() =>
			filterByModelControls(tableRows, (row) => row.model, {
				providers: selectedProviders,
				maxCost,
			}),
		[tableRows, selectedProviders, maxCost],
	);
	const maximumLimit = filteredRows.length;
	const [effectiveLimit, setLimit] = useDisplayLimit(maximumLimit);
	const matchingRows = useMemo(
		() =>
			sortedRows(filteredRows, deferredFilterQuery, {
				key: "intelligence",
				direction: "descending",
			}),
		[deferredFilterQuery, filteredRows],
	);
	const limitedRows = useMemo(
		() => matchingRows.slice(0, effectiveLimit),
		[effectiveLimit, matchingRows],
	);
	const visibleRows = useMemo(
		() => sortedRows(limitedRows, "", sortState),
		[limitedRows, sortState],
	);
	const columnTooltips =
		payload?.metadata?.scoring?.column_tooltips ?? emptyColumnTooltips;
	const activeTooltipContent =
		tooltip == null
			? undefined
			: tableColumnTooltip(tooltip.key, columnTooltips);
	const rowKind = showVariants ? "variants" : "models";
	const rowCountLabel =
		deferredFilterQuery.length > 0 ? `${matchingRows.length} matches` : null;
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
			if (!tableColumnTooltip(key, columnTooltips)) {
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

	return (
		<section className="dashboard-deck" aria-label="Model leaderboard">
			<ModelToolbar
				filterQuery={filterQuery}
				rowCountLabel={rowCountLabel}
				provider={{
					id: "leaderboard-provider-menu",
					label: "Filter leaderboard providers",
					options: providerChoices,
					totalCount: providerModelCount,
					selectedProviders,
					onSelectedProvidersChange,
				}}
				display={{
					id: "leaderboard-model-limit",
					label: "Leaderboard display",
					itemKind: rowKind,
					maximum: maximumLimit,
					value: effectiveLimit,
					onValueChange: setLimit,
					variantControl: {
						showVariants,
						onShowVariantsChange: setShowVariants,
					},
				}}
				screenshotControl={
					<LeaderboardCapture
						rows={visibleRows}
						rowKind={rowKind}
						sortState={sortState}
					/>
				}
				onFilterQueryChange={setFilterQuery}
			/>
			<ModelTable
				sortState={sortState}
				visibleRows={visibleRows}
				emptyMessage={emptyMessage}
				isLoading={isLoading}
				metricColumns={dashboardMetricColumns}
				onSort={handleSort}
				onTooltip={showTooltip}
				onTooltipEnd={clearTooltip}
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
		</section>
	);
}

function useReasoningVariantDisplay() {
	const hydratedModeRef = useRef(false);
	const [showReasoningVariants, setShowReasoningVariants] = useState(false);

	useLayoutEffect(() => {
		if (!hydratedModeRef.current) {
			hydratedModeRef.current = true;
			try {
				setShowReasoningVariants(
					window.localStorage.getItem(REASONING_VARIANT_STORAGE_KEY) === "true",
				);
			} catch {}
			return;
		}
		try {
			window.localStorage.setItem(
				REASONING_VARIANT_STORAGE_KEY,
				String(showReasoningVariants),
			);
		} catch {}
	}, [showReasoningVariants]);

	return [showReasoningVariants, setShowReasoningVariants] as const;
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
