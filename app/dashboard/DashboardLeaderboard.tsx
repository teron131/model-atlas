"use client";

/** The leaderboard region: derives its rows from the URL state, the global filters, and the table search, and hosts the column tooltip; it is kept apart from the graphs so row-limit, sort, and table-search updates re-render only the table. */

import { useCallback, useDeferredValue, useEffect, useMemo } from "react";

import type { ModelAtlasColumnTooltips } from "../../src/model-atlas/config/tooltips";
import type { ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { LeaderboardCapture } from "./capture/LeaderboardCapture";
import { ResearchRegion } from "./ResearchRegions";
import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  modelSearchDocument,
} from "./shared/model-filters";
import { filterSearchDocuments, hasSearchQuery } from "./shared/search";
import { type SortKey, type TableColumnKey } from "./table/column-registry";
import {
  splitTableSearch,
  type TableColumnPreset,
  tableColumnView,
  visibleSort,
} from "./table/column-views";
import { ColumnTooltip, useColumnTooltip } from "./table/ColumnTooltip";
import { type EffortSelection, useDisplayLimit } from "./table/DisplayControls";
import { effortChoices, leaderboardRows } from "./table/leaderboard-rows";
import { LeaderboardControls } from "./table/LeaderboardControls";
import { ModelTable } from "./table/ModelTable";
import { sortedRows, toggledSort } from "./table/sort";
import { tableColumnTooltip } from "./table/tooltips";
import type { DashboardUrlPatch } from "./url-state";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

const emptyColumnTooltips: ModelAtlasColumnTooltips = {};

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
  const [requestedSort, setSortState] = useUrlState("sort");
  const [tableQuery] = useUrlState("table-q");
  const [columnPreset] = useUrlState("view");
  const [showVariants] = useUrlState("table-variants");
  const [requestedEfforts] = useUrlState("table-effort");
  const deferredTableQuery = useDeferredValue(tableQuery);
  const columnTooltips = payload?.metadata.scoring.column_tooltips ?? emptyColumnTooltips;
  const hasTooltip = useCallback(
    (key: TableColumnKey) => tableColumnTooltip(key, columnTooltips) != null,
    [columnTooltips],
  );
  const {
    tooltip,
    show: showTooltip,
    end: endTooltip,
    hold: holdTooltip,
    closeOnSort,
  } = useColumnTooltip(hasTooltip);
  const deferredShowVariants = useDeferredValue(showVariants);
  const deferredEfforts = useDeferredValue(requestedEfforts);
  const deferredFilters = useDeferredValue(filters);
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
  const admittedRows = useMemo(
    () => filterByGlobalModelFilters(tableRows, (row) => row.model, deferredFilters, filterScope),
    [tableRows, deferredFilters, filterScope],
  );
  const rowDocuments = useMemo(
    () => admittedRows.map((row) => modelSearchDocument(row, row.model)),
    [admittedRows],
  );
  // The table search's parts that name columns pick the columns, and the rest narrow the rows the global filters admit.
  const { columnQuery, modelQuery } = useMemo(
    () => splitTableSearch(deferredTableQuery, columnTooltips, rowDocuments),
    [deferredTableQuery, columnTooltips, rowDocuments],
  );
  const filteredRows = useMemo(
    () =>
      hasSearchQuery(modelQuery) ? filterSearchDocuments(modelQuery, rowDocuments) : admittedRows,
    [modelQuery, rowDocuments, admittedRows],
  );
  const {
    searchQuery: columnFilterQuery,
    searchMatchCount: columnSearchMatchCount,
    keys: visibleColumnKeys,
  } = useMemo(
    () => tableColumnView(columnPreset, columnQuery, columnTooltips),
    [columnPreset, columnQuery, columnTooltips],
  );
  const sortState = useMemo(
    () => visibleSort(requestedSort, columnPreset, columnFilterQuery, visibleColumnKeys),
    [requestedSort, columnPreset, columnFilterQuery, visibleColumnKeys],
  );
  // URL subscriptions update synchronously; defer the row reorder so the chosen header can paint first.
  const deferredSortState = useDeferredValue(sortState);
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
  // The effort menu counts both views the global filters and the table search admit, whichever one the table shows.
  const otherViewRows = useMemo(() => {
    const rows = filterByGlobalModelFilters(
      leaderboardRows(payload, !deferredShowVariants),
      (row) => row.model,
      deferredFilters,
      filterScope,
    );
    return hasSearchQuery(modelQuery)
      ? filterSearchDocuments(
          modelQuery,
          rows.map((row) => modelSearchDocument(row, row.model)),
        )
      : rows;
  }, [payload, deferredShowVariants, deferredFilters, filterScope, modelQuery]);
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
  const tooltipKey = tooltip?.key;
  const activeTooltipContent = useMemo(
    () =>
      tooltipKey == null
        ? undefined
        : tableColumnTooltip(tooltipKey, columnTooltips, {
            models: visibleRows.map((row) => row.model),
            population: payload?.models ?? [],
            scoring: payload?.metadata.scoring,
            versions: payload?.metadata.benchmark_versions,
            health: payload?.metadata.benchmark_update_health,
            unit: rowKind,
          }),
    [tooltipKey, columnTooltips, visibleRows, payload, rowKind],
  );
  const searchResultLabel =
    [
      hasSearchQuery(columnQuery)
        ? `${columnSearchMatchCount} ${columnSearchMatchCount === 1 ? "column" : "columns"}`
        : null,
      hasSearchQuery(modelQuery) ? `${modelCount} ${modelCount === 1 ? "model" : "models"}` : null,
    ]
      .filter((part) => part != null)
      .join(" · ") || null;
  const emptyMessage = errorMessage ?? (payload == null ? "Loading stats" : "No models");

  useEffect(() => {
    setLimit(scopedRows.length);
  }, [scopedRows.length, setLimit]);

  const handleSort = useCallback(
    (key: SortKey) => {
      closeOnSort();
      setSortState(toggledSort(sortState, key));
    },
    [closeOnSort, sortState, setSortState],
  );

  const changeColumnView = useCallback(
    (patch: Pick<DashboardUrlPatch, "view" | "table-q">) => {
      const preset = patch.view ?? columnPreset;
      const search = splitTableSearch(patch["table-q"] ?? tableQuery, columnTooltips, rowDocuments);
      const { searchQuery: query, keys } = tableColumnView(
        preset,
        search.columnQuery,
        columnTooltips,
      );
      const sort = visibleSort(sortState, preset, query, keys);
      updateDashboardUrl(
        { ...patch, ...(sort.key !== requestedSort.key ? { sort } : {}) },
        patch.view == null,
      );
    },
    [columnPreset, tableQuery, columnTooltips, rowDocuments, sortState, requestedSort],
  );
  // A preset replaces the columns a search picked, so choosing one drops the search's column parts and keeps the parts that narrow the rows.
  const handleColumnPresetChange = useCallback(
    (preset: TableColumnPreset) => {
      const search = splitTableSearch(tableQuery, columnTooltips, rowDocuments);
      changeColumnView({
        view: preset,
        ...(hasSearchQuery(search.columnQuery) ? { "table-q": search.modelQuery.trim() } : {}),
      });
    },
    [changeColumnView, tableQuery, columnTooltips, rowDocuments],
  );
  const handleTableQueryChange = useCallback(
    (query: string) => changeColumnView({ "table-q": query }),
    [changeColumnView],
  );

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
          query={tableQuery}
          resultLabel={searchResultLabel}
          isColumnSearch={hasSearchQuery(columnFilterQuery)}
          display={{
            itemKind: rowKind,
            maximum: maximumLimit,
            value: effectiveLimit,
            onValueChange: setLimit,
            efforts: {
              options: effortOptions,
              modelCount,
              selected: showVariants ? requestedEfforts : "collapsed",
              onChange: chooseEfforts,
            },
          }}
          onPresetChange={handleColumnPresetChange}
          onQueryChange={handleTableQueryChange}
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
          onTooltip={showTooltip}
          onTooltipEnd={endTooltip}
        />
        <p className="table-legend">
          <em>Italic</em>
          {
            " values are estimated by adjusting the model's value at another effort for how other models, its lab, its lab's nearby releases, and its other benchmarks change between efforts, weighted by evidence."
          }
        </p>
      </ResearchRegion>
      {tooltip != null && activeTooltipContent != null && (
        <ColumnTooltip
          content={activeTooltipContent}
          anchor={tooltip.anchor}
          phase={tooltip.phase}
          onMouseEnter={holdTooltip}
          onMouseLeave={endTooltip}
        />
      )}
    </>
  );
}

// Choosing efforts asks for reasoning-variant rows, so a collapsed table expands to show them.
function chooseEfforts(selection: EffortSelection) {
  updateDashboardUrl(
    selection === "collapsed"
      ? { "table-variants": false }
      : { "table-variants": true, "table-effort": selection },
  );
}
