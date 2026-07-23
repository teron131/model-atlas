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

import type { LlmStatsColumnTooltips } from "../../src/model-atlas/config/tooltips";
import type { LlmStatsPayload } from "../../src/model-atlas/stats/types";
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

const emptyColumnTooltips: LlmStatsColumnTooltips = {};
const REASONING_VARIANT_STORAGE_KEY = "model-atlas:expand-reasoning-variants";
const TOOLTIP_FADE_OUT_MS = 1_000;
const COLUMN_FRAME_HEADER_KEYS = ["modalities", "context"] as const;

type DashboardTooltipState = Omit<TooltipState, "key"> & {
	key: SortKey;
};

export function Dashboard({
	initialPayload,
}: {
	initialPayload: LlmStatsPayload | null;
}) {
	const dashboardRef = useRef<HTMLElement>(null);
	const tooltipFadeTimeoutRef = useRef<number | null>(null);
	const [showReasoningVariants, setShowReasoningVariants] =
		useReasoningVariantDisplay();
	const [sortState, setSortState] = useState<SortState>({
		key: "intelligence",
		direction: "descending",
	});
	const [filterQuery, setFilterQuery] = useState("");
	const [tooltip, setTooltip] = useState<DashboardTooltipState | null>(null);
	const [selectedProviders, setSelectedProviders] = useState<ProviderFilters>(
		[],
	);
	const [maxCostFilter, setMaxCostFilter] = useState<CostFilter>("all");
	const [modelLimit, setModelLimit] = useState<ModelLimit>(
		DEFAULT_DISPLAY_ITEMS,
	);
	const [showLeaderboardVariants, setShowLeaderboardVariants] = useState(false);
	const deferredFilterQuery = useDeferredValue(filterQuery);
	const [, startSortTransition] = useTransition();
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
	const tableRows = useMemo(
		() =>
			dedupeDisplayModels(
				modelsForVariantDisplay(payload?.models ?? [], showLeaderboardVariants),
			),
		[payload, showLeaderboardVariants],
	);
	const providerChoices = useMemo(
		() => providerOptions(tableRows.map((row) => row.model)),
		[tableRows],
	);
	const providerModelCount = useMemo(
		() => modelCount(tableRows.map((row) => row.model)),
		[tableRows],
	);
	const filteredTableRows = useMemo(() => {
		return filterByModelControls(tableRows, (row) => row.model, {
			providers: selectedProviders,
			maxCost: maxCostFilter,
		});
	}, [tableRows, selectedProviders, maxCostFilter]);
	const maximumLeaderboardLimit = filteredTableRows.length;
	const [effectiveLeaderboardLimit, setLeaderboardLimit] = useDisplayLimit(
		maximumLeaderboardLimit,
	);
	const leaderboardRowKind = showLeaderboardVariants ? "variants" : "models";
	const matchingTableRows = useMemo(
		() =>
			sortedRows(filteredTableRows, deferredFilterQuery, {
				key: "intelligence",
				direction: "descending",
			}),
		[deferredFilterQuery, filteredTableRows],
	);
	const limitedTableRows = useMemo(
		() => matchingTableRows.slice(0, effectiveLeaderboardLimit),
		[effectiveLeaderboardLimit, matchingTableRows],
	);
	const visibleRows = useMemo(
		() => sortedRows(limitedTableRows, "", sortState),
		[limitedTableRows, sortState],
	);
	const columnTooltips =
		payload?.metadata?.scoring?.column_tooltips ?? emptyColumnTooltips;
	const activeTooltipContent =
		tooltip == null
			? undefined
			: tableColumnTooltip(tooltip.key, columnTooltips);
	const isInitialLoading = payload == null && errorMessage == null;
	const rowCountLabel =
		deferredFilterQuery.length > 0
			? `${matchingTableRows.length} matches`
			: null;
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
								onSelectedProvidersChange: setSelectedProviders,
							}}
							display={{
								id: "leaderboard-model-limit",
								label: "Leaderboard display",
								itemKind: leaderboardRowKind,
								maximum: maximumLeaderboardLimit,
								value: effectiveLeaderboardLimit,
								onValueChange: setLeaderboardLimit,
								variantControl: {
									showVariants: showLeaderboardVariants,
									onShowVariantsChange: setShowLeaderboardVariants,
								},
							}}
							screenshotControl={
								<LeaderboardCapture
									rows={visibleRows}
									rowKind={leaderboardRowKind}
									sortState={sortState}
								/>
							}
							onFilterQueryChange={setFilterQuery}
						/>
						<ModelTable
							sortState={sortState}
							visibleRows={visibleRows}
							emptyMessage={emptyMessage}
							isLoading={isInitialLoading}
							metricColumns={dashboardMetricColumns}
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
