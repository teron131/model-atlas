"use client";

/** Leaderboard state, filtering, sorting, table rendering, and tooltips for the dashboard. */

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
  ModelAtlasColumnTooltip,
  ModelAtlasColumnTooltips,
} from "../../src/model-atlas/config/tooltips";
import { canonicalModelKey } from "../../src/model-atlas/identity/normalization";
import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { LeaderboardCapture } from "./capture/LeaderboardCapture";
import { researchRegionOrdinal } from "./graphs/research-index";
import {
  ColumnTooltip,
  type HeaderTooltipHandler,
  tooltipPositionFromElement,
  type TooltipState,
} from "./shared/ColumnTooltip";
import { DEFAULT_DISPLAY_ITEMS, useDisplayLimit } from "./shared/DisplayControls";
import {
  type CostFilter,
  filterByModelControls,
  filterByModelQuery,
  type ModelLimit,
  modelsForVariantDisplay,
  type ProviderFilters,
} from "./shared/model-display";
import { ModelToolbar } from "./shared/ModelToolbar";
import {
  tableColumnKeysForView,
  type TableColumnPreset,
  tableColumnSearchMatchCount,
  tableColumnSortKey,
} from "./table/column-views";
import { ColumnViewControls } from "./table/ColumnViewControls";
import {
  dashboardMetricColumns,
  dedupeDisplayModels,
  sortedRows,
  sorters,
  type SortKey,
  type SortState,
  type TableColumnKey,
} from "./table/models";
import { ModelTable, reverseDirection } from "./table/ModelTable";
import type { ScoreChangeHandler } from "./table/Rows";
import { scoreChangeTooltip, tableColumnTooltip } from "./table/tooltips";

const emptyColumnTooltips: ModelAtlasColumnTooltips = {};
const TOOLTIP_FADE_OUT_MS = 1_000;

type DashboardTooltipState = Omit<TooltipState, "key"> &
  ({ kind: "column"; key: TableColumnKey } | { kind: "change"; content: ModelAtlasColumnTooltip });

/** Isolate leaderboard interactions so slider and sort updates do not re-render dashboard graphs. */
export function DashboardLeaderboard({
  payload,
  errorMessage,
  isLoading,
  maxCost,
  modelLimit,
  globalModelFilterQuery,
  selectedProviders,
}: {
  payload: ModelAtlasPayload | null;
  errorMessage: string | null;
  isLoading: boolean;
  maxCost: CostFilter;
  modelLimit: ModelLimit;
  globalModelFilterQuery: string;
  selectedProviders: ProviderFilters;
}) {
  const tooltipFadeTimeoutRef = useRef<number | null>(null);
  const collapsedLimitRef = useRef(DEFAULT_DISPLAY_ITEMS);
  const [sortState, setSortState] = useState<SortState>({
    key: "intelligence",
    direction: "descending",
  });
  const [filterQuery, setFilterQuery] = useState("");
  const [columnFilterQuery, setColumnFilterQuery] = useState("");
  const [columnPreset, setColumnPreset] = useState<TableColumnPreset>("all");
  const [tooltip, setTooltip] = useState<DashboardTooltipState | null>(null);
  const [showVariants, setShowVariants] = useState(false);
  const deferredFilterQuery = useDeferredValue(filterQuery);
  const deferredShowVariants = useDeferredValue(showVariants);
  const deferredSelectedProviders = useDeferredValue(selectedProviders);
  const deferredMaxCost = useDeferredValue(maxCost);
  const deferredGlobalModelFilterQuery = useDeferredValue(globalModelFilterQuery);
  const [, startSortTransition] = useTransition();
  const tableRows = useMemo(
    () =>
      dedupeDisplayModels(
        modelsForVariantDisplay(
          payload?.models ?? [],
          deferredShowVariants,
          payload?.benchmark_observations,
        ),
      ),
    [deferredShowVariants, payload],
  );
  const filteredRows = useMemo(
    () =>
      filterByModelControls(tableRows, (row) => row.model, {
        providers: deferredSelectedProviders,
        maxCost: deferredMaxCost,
      }),
    [tableRows, deferredSelectedProviders, deferredMaxCost],
  );
  const globallyFilteredRows = useMemo(
    () => filterByModelQuery(filteredRows, (row) => row.model, deferredGlobalModelFilterQuery),
    [deferredGlobalModelFilterQuery, filteredRows],
  );
  const maximumLimit = globallyFilteredRows.length;
  const expandedTableRows = useMemo(
    () =>
      dedupeDisplayModels(
        modelsForVariantDisplay(payload?.models ?? [], true, payload?.benchmark_observations),
      ),
    [payload],
  );
  const filteredExpandedRows = useMemo(
    () =>
      filterByModelControls(expandedTableRows, (row) => row.model, {
        providers: deferredSelectedProviders,
        maxCost: deferredMaxCost,
      }),
    [expandedTableRows, deferredSelectedProviders, deferredMaxCost],
  );
  const globallyFilteredExpandedRows = useMemo(
    () =>
      filterByModelQuery(filteredExpandedRows, (row) => row.model, deferredGlobalModelFilterQuery),
    [deferredGlobalModelFilterQuery, filteredExpandedRows],
  );
  const [effectiveLimit, setLimit] = useDisplayLimit(maximumLimit);
  const requestedGlobalLimit =
    modelLimit === "all" ? maximumLimit : Math.min(modelLimit, maximumLimit);
  const deferredLimit = useDeferredValue(effectiveLimit);
  const matchingRows = useMemo(
    () =>
      sortedRows(globallyFilteredRows, deferredFilterQuery, {
        key: "intelligence",
        direction: "descending",
      }),
    [deferredFilterQuery, globallyFilteredRows],
  );
  const limitedRows = useMemo(
    () => matchingRows.slice(0, deferredLimit),
    [deferredLimit, matchingRows],
  );
  const expandedVariantCount = useMemo(() => {
    const selectedModels = new Set(limitedRows.map((row) => canonicalModelKey(row.model)));
    return filterByModelQuery(
      globallyFilteredExpandedRows,
      (row) => row.model,
      deferredFilterQuery,
    ).filter((row) => selectedModels.has(canonicalModelKey(row.model))).length;
  }, [deferredFilterQuery, globallyFilteredExpandedRows, limitedRows]);
  const visibleRows = useMemo(
    () => sortedRows(limitedRows, "", sortState),
    [limitedRows, sortState],
  );
  const columnTooltips = payload?.metadata?.scoring?.column_tooltips ?? emptyColumnTooltips;
  const visibleColumnKeys = useMemo(
    () => tableColumnKeysForView(columnPreset, columnFilterQuery, columnTooltips),
    [columnFilterQuery, columnPreset, columnTooltips],
  );
  const columnSearchMatchCount = useMemo(
    () => tableColumnSearchMatchCount(columnFilterQuery, columnTooltips),
    [columnFilterQuery, columnTooltips],
  );
  const activeTooltipContent =
    tooltip == null
      ? undefined
      : tooltip.kind === "change"
        ? tooltip.content
        : tableColumnTooltip(tooltip.key, columnTooltips);
  const rowKind = deferredShowVariants ? "variants" : "models";
  const rowCountLabel = deferredFilterQuery.length > 0 ? `${matchingRows.length} matches` : null;
  const emptyMessage = errorMessage ?? (payload == null ? "Loading stats" : "No models");

  useEffect(() => {
    setLimit(requestedGlobalLimit);
  }, [requestedGlobalLimit, setLimit]);

  useEffect(() => {
    setSortState((current) => {
      if (visibleColumnKeys.includes(current.key)) {
        return current;
      }
      const key = tableColumnSortKey(columnPreset, columnFilterQuery, visibleColumnKeys);
      return { key, direction: sorters[key].direction };
    });
  }, [columnFilterQuery, columnPreset, visibleColumnKeys]);

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

  const handleVariantDisplay = useCallback(
    (expanded: boolean) => {
      if (expanded) {
        collapsedLimitRef.current = effectiveLimit;
        setLimit(expandedVariantCount);
      } else {
        setLimit(collapsedLimitRef.current);
      }
      setShowVariants(expanded);
    },
    [effectiveLimit, expandedVariantCount, setLimit],
  );

  const handleColumnPresetChange = useCallback((preset: TableColumnPreset) => {
    setColumnPreset(preset);
    setColumnFilterQuery("");
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
      current == null || current.phase === "visible" ? current : { ...current, phase: "visible" },
    );
  }, [clearTooltipFadeTimeout]);

  const clearTooltip = useCallback(() => {
    setTooltip((current) =>
      current == null || current.phase === "leaving" ? current : { ...current, phase: "leaving" },
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
        kind: "column",
        key,
        phase: "visible",
        ...tooltipPositionFromElement(event.currentTarget),
      });
    },
    [columnTooltips, clearTooltipFadeTimeout],
  );

  const showScoreChange = useCallback<ScoreChangeHandler>(
    (event, model) => {
      if (model.latest_change == null) {
        return;
      }
      clearTooltipFadeTimeout();
      setTooltip({
        kind: "change",
        content: scoreChangeTooltip(model),
        phase: "visible",
        ...tooltipPositionFromElement(event.currentTarget),
      });
    },
    [clearTooltipFadeTimeout],
  );

  useEffect(() => {
    if (tooltip?.kind !== "change") {
      return;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setTooltip(null);
      }
    };
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".column-tooltip, .score-change-button") == null
      ) {
        setTooltip(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [tooltip?.kind]);

  useEffect(() => {
    return clearTooltipFadeTimeout;
  }, [clearTooltipFadeTimeout]);

  return (
    <section
      id="leaderboard"
      className="dashboard-deck dashboard-research-section"
      aria-labelledby="leaderboard-title"
    >
      <header className="dashboard-section-head">
        <p className="dashboard-section-marker">
          <b aria-hidden="true">{researchRegionOrdinal("leaderboard")}</b>
          <span>Working view · Sortable model catalogue</span>
        </p>
        <h2 id="leaderboard-title">Model Leaderboard</h2>
      </header>
      <ModelToolbar
        filterQuery={filterQuery}
        rowCountLabel={rowCountLabel}
        display={{
          id: "leaderboard-model-limit",
          label: "Leaderboard display",
          itemKind: rowKind,
          maximum: maximumLimit,
          value: effectiveLimit,
          onValueChange: setLimit,
          variantControl: {
            showVariants,
            onShowVariantsChange: handleVariantDisplay,
          },
        }}
        screenshotControl={
          <LeaderboardCapture rows={visibleRows} rowKind={rowKind} sortState={sortState} />
        }
        onFilterQueryChange={setFilterQuery}
      />
      <ColumnViewControls
        preset={columnPreset}
        query={columnFilterQuery}
        searchMatchCount={columnSearchMatchCount}
        onPresetChange={handleColumnPresetChange}
        onQueryChange={setColumnFilterQuery}
      />
      <ModelTable
        sortState={sortState}
        fitColumnContent={columnFilterQuery.trim().length > 0}
        visibleColumnKeys={visibleColumnKeys}
        visibleRows={visibleRows}
        emptyMessage={emptyMessage}
        isLoading={isLoading}
        metricColumns={dashboardMetricColumns}
        onSort={handleSort}
        onScoreChange={showScoreChange}
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
          role={tooltip.kind === "change" ? "dialog" : "tooltip"}
          top={tooltip.top}
        />
      )}
    </section>
  );
}
