"use client";

/** Leaderboard state, filtering, sorting, table rendering, and tooltips for the dashboard. */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type {
  ModelAtlasColumnTooltip,
  ModelAtlasColumnTooltips,
} from "../../src/model-atlas/config/tooltips";
import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { LeaderboardCapture } from "./capture/LeaderboardCapture";
import { focusModelSearch } from "./GlobalModelControls";
import { ResearchRegion } from "./ResearchRegions";
import { filterByGlobalModelFilters, type GlobalModelFilters } from "./shared/model-display";
import { hasSearchQuery } from "./shared/search";
import { type TableColumnPreset, tableColumnView, visibleSort } from "./table/column-views";
import {
  ColumnTooltip,
  type HeaderTooltipHandler,
  tooltipPositionFromElement,
  type TooltipState,
} from "./table/ColumnTooltip";
import { type EffortSelection, useDisplayLimit } from "./table/DisplayControls";
import { LeaderboardControls } from "./table/LeaderboardControls";
import {
  effortChoices,
  leaderboardRows,
  sortedRows,
  type SortKey,
  type TableColumnKey,
  toggledSort,
} from "./table/models";
import { ModelTable } from "./table/ModelTable";
import type { ScoreChangeHandler } from "./table/Rows";
import { scoreChangeTooltip, tableColumnTooltip } from "./table/tooltips";
import type { DashboardUrlPatch } from "./url-state";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

const emptyColumnTooltips: ModelAtlasColumnTooltips = {};
const TOOLTIP_FADE_OUT_MS = 1_000;

type DashboardTooltipState = TooltipState &
  ({ kind: "column"; key: TableColumnKey } | { kind: "change"; content: ModelAtlasColumnTooltip });

/** Isolate leaderboard interactions so slider and sort updates do not re-render dashboard graphs. */
export function DashboardLeaderboard({
  payload,
  errorMessage,
  isLoading,
  filters,
}: {
  payload: ModelAtlasPayload | null;
  errorMessage: string | null;
  isLoading: boolean;
  filters: GlobalModelFilters;
}) {
  const tooltipFadeTimeoutRef = useRef<number | null>(null);
  const [requestedSort, setSortState] = useUrlState("sort");
  const [columnQuery] = useUrlState("column-q");
  const [columnPreset] = useUrlState("view");
  const [tooltip, setTooltip] = useState<DashboardTooltipState | null>(null);
  const [showVariants] = useUrlState("table-variants");
  const [requestedEfforts] = useUrlState("table-effort");
  const deferredColumnQuery = useDeferredValue(columnQuery);
  const columnTooltips = payload?.metadata?.scoring?.column_tooltips ?? emptyColumnTooltips;
  const {
    searchQuery: columnFilterQuery,
    searchMatchCount: columnSearchMatchCount,
    keys: visibleColumnKeys,
  } = useMemo(
    () => tableColumnView(columnPreset, deferredColumnQuery, columnTooltips),
    [columnPreset, deferredColumnQuery, columnTooltips],
  );
  const sortState = useMemo(
    () => visibleSort(requestedSort, columnPreset, columnFilterQuery, visibleColumnKeys),
    [requestedSort, columnPreset, columnFilterQuery, visibleColumnKeys],
  );
  const deferredShowVariants = useDeferredValue(showVariants);
  const deferredEfforts = useDeferredValue(requestedEfforts);
  const deferredFilters = useDeferredValue(filters);
  // URL subscriptions update synchronously; defer the row reorder so the chosen header can paint first.
  const deferredSortState = useDeferredValue(sortState);
  const tableRows = useMemo(
    () => leaderboardRows(payload, deferredShowVariants),
    [deferredShowVariants, payload],
  );

  const filterScope = useMemo(
    () => ({
      observedAtEpochSeconds: payload?.fetched_at_epoch_seconds ?? null,
      rankingModels: payload?.models ?? [],
    }),
    [payload],
  );
  const filteredRows = useMemo(
    () => filterByGlobalModelFilters(tableRows, (row) => row.model, deferredFilters, filterScope),
    [tableRows, deferredFilters, filterScope],
  );
  // Variant rows keep the chosen efforts, every effort when `null`; a model without an effort label shows only in the default view.
  const scopedRows = useMemo(
    () =>
      deferredShowVariants
        ? filteredRows.filter(
            ({ model }) =>
              model.reasoning_effort != null &&
              (deferredEfforts?.includes(model.reasoning_effort) ?? true),
          )
        : filteredRows,
    [filteredRows, deferredShowVariants, deferredEfforts],
  );
  // The effort menu counts both views the global filters admit, whichever one the table shows.
  const otherViewRows = useMemo(
    () =>
      filterByGlobalModelFilters(
        leaderboardRows(payload, !deferredShowVariants),
        (row) => row.model,
        deferredFilters,
        filterScope,
      ),
    [payload, deferredShowVariants, deferredFilters, filterScope],
  );
  const effortOptions = useMemo(
    () => effortChoices(deferredShowVariants ? filteredRows : otherViewRows),
    [deferredShowVariants, filteredRows, otherViewRows],
  );
  const modelCount = deferredShowVariants ? otherViewRows.length : filteredRows.length;
  const matchingRows = useMemo(
    () =>
      sortedRows(scopedRows, {
        key: "intelligence",
        direction: "descending",
      }),
    [scopedRows],
  );
  const maximumLimit = matchingRows.length;
  const [effectiveLimit, setLimit] = useDisplayLimit(maximumLimit);
  const deferredLimit = useDeferredValue(effectiveLimit);
  const limitedRows = useMemo(
    () => matchingRows.slice(0, deferredLimit),
    [deferredLimit, matchingRows],
  );
  const visibleRows = useMemo(
    () => sortedRows(limitedRows, deferredSortState),
    [limitedRows, deferredSortState],
  );

  const rowKind = deferredShowVariants ? "variants" : "models";
  const activeTooltipContent =
    tooltip == null
      ? undefined
      : tooltip.kind === "change"
        ? tooltip.content
        : tableColumnTooltip(tooltip.key, columnTooltips, {
            models: visibleRows.map((row) => row.model),
            scoring: payload?.metadata.scoring,
            versions: payload?.metadata.benchmark_versions,
            unit: rowKind,
          });
  const columnSearchResultLabel = hasSearchQuery(deferredColumnQuery)
    ? `${columnSearchMatchCount} ${columnSearchMatchCount === 1 ? "column" : "columns"}`
    : null;
  // A model name typed into the column search finds no columns; count the models it would find as a model search instead.
  const modelMatchCount = useMemo(
    () =>
      hasSearchQuery(deferredColumnQuery) && columnSearchMatchCount === 0
        ? filterByGlobalModelFilters(
            tableRows,
            (row) => row.model,
            { ...deferredFilters, q: deferredColumnQuery },
            filterScope,
          ).length
        : 0,
    [columnSearchMatchCount, deferredColumnQuery, deferredFilters, filterScope, tableRows],
  );
  const emptyMessage = errorMessage ?? (payload == null ? "Loading stats" : "No models");

  useEffect(() => {
    setLimit(scopedRows.length);
  }, [scopedRows.length, setLimit]);

  const handleSort = useCallback(
    (key: SortKey) => setSortState(toggledSort(sortState, key)),
    [sortState, setSortState],
  );

  const changeColumnView = useCallback(
    (patch: Pick<DashboardUrlPatch, "view" | "column-q">) => {
      const preset = patch.view ?? columnPreset;
      const searchQuery = patch["column-q"] ?? columnQuery;
      const { searchQuery: query, keys } = tableColumnView(preset, searchQuery, columnTooltips);
      const sort = visibleSort(sortState, preset, query, keys);
      updateDashboardUrl(
        { ...patch, ...(sort.key !== requestedSort.key ? { sort } : {}) },
        patch.view == null,
      );
    },
    [columnPreset, columnQuery, columnTooltips, sortState, requestedSort],
  );
  const handleColumnPresetChange = useCallback(
    (preset: TableColumnPreset) => {
      changeColumnView({ view: preset, ...(columnQuery ? { "column-q": "" } : {}) });
    },
    [changeColumnView, columnQuery],
  );
  const handleColumnQueryChange = useCallback(
    (query: string) => changeColumnView({ "column-q": query }),
    [changeColumnView],
  );
  const searchModelsInstead = useCallback(() => {
    updateDashboardUrl({ q: columnQuery.trim(), "column-q": "" });
    focusModelSearch();
  }, [columnQuery]);

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

  const showTooltip = useCallback<HeaderTooltipHandler<TableColumnKey>>(
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
    <>
      <ResearchRegion
        id="leaderboard"
        plane="dashboard-deck"
        capture={{
          action: (
            <LeaderboardCapture
              rows={visibleRows}
              rowKind={rowKind}
              sortState={deferredSortState}
            />
          ),
        }}
      >
        <LeaderboardControls
          preset={columnPreset}
          columnQuery={columnQuery}
          columnSearchResultLabel={columnSearchResultLabel}
          modelMatchCount={modelMatchCount}
          isColumnSearch={hasSearchQuery(columnFilterQuery)}
          display={{
            itemKind: rowKind,
            maximum: maximumLimit,
            value: effectiveLimit,
            onValueChange: setLimit,
            efforts: {
              options: effortOptions,
              modelCount,
              selected: showVariants ? requestedEfforts : "default",
              onChange: chooseEfforts,
            },
          }}
          onPresetChange={handleColumnPresetChange}
          onColumnQueryChange={handleColumnQueryChange}
          onSearchModels={searchModelsInstead}
        />
        <ModelTable
          sortState={sortState}
          fitColumnContent={columnFilterQuery.trim().length > 0}
          visibleColumnKeys={visibleColumnKeys}
          visibleRows={visibleRows}
          emptyMessage={emptyMessage}
          isLoading={isLoading}
          isSorting={deferredSortState !== sortState}
          onSort={handleSort}
          onScoreChange={showScoreChange}
          onTooltip={showTooltip}
          onTooltipEnd={clearTooltip}
        />
      </ResearchRegion>
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
    </>
  );
}

// Choosing efforts asks for reasoning-variant rows, so a collapsed table expands to show them.
function chooseEfforts(selection: EffortSelection) {
  updateDashboardUrl(
    selection === "default"
      ? { "table-variants": false }
      : { "table-variants": true, "table-effort": selection },
  );
}
