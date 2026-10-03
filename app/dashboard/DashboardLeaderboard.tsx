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
import {
  type ResourceRatioObservation,
  resourceRatioObservations,
  resourceRatioReferences,
  summarizeResourceRatios,
} from "../../src/model-atlas/stats/resource-ratios";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { LeaderboardCapture } from "./capture/LeaderboardCapture";
import { CopyDashboardLink } from "./CopyDashboardLink";
import { researchRegionOrdinal } from "./research-index";
import {
  ColumnTooltip,
  type HeaderTooltipHandler,
  tooltipPositionFromElement,
  type TooltipState,
} from "./shared/ColumnTooltip";
import { DEFAULT_DISPLAY_ITEMS, useDisplayLimit } from "./shared/DisplayControls";
import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  modelsForVariantDisplay,
} from "./shared/model-display";
import { hasSearchQuery } from "./shared/search";
import { type TableColumnPreset, tableColumnSortKey, tableColumnView } from "./table/column-views";
import { LeaderboardControls } from "./table/LeaderboardControls";
import {
  dashboardMetricColumns,
  dedupeDisplayModels,
  sortedRows,
  sorters,
  type SortKey,
  type TableColumnKey,
} from "./table/models";
import { ModelTable, reverseDirection } from "./table/ModelTable";
import type { ScoreChangeHandler } from "./table/Rows";
import { scoreChangeTooltip, tableColumnTooltip } from "./table/tooltips";
import type { DashboardUrlPatch } from "./url-state";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

const ratioKinds = ["cost", "time", "tokens"] as const;

const emptyColumnTooltips: ModelAtlasColumnTooltips = {};
const TOOLTIP_FADE_OUT_MS = 1_000;

type DashboardTooltipState = Omit<TooltipState, "key"> &
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
  const collapsedLimitRef = useRef(DEFAULT_DISPLAY_ITEMS);
  const [requestedSort, setSortState] = useUrlState("sort");
  const [columnQuery] = useUrlState("column-q");
  const [columnPreset] = useUrlState("view");
  const [tooltip, setTooltip] = useState<DashboardTooltipState | null>(null);
  const [showVariants, setShowVariants] = useUrlState("table-variants");
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
  const sortState = useMemo(() => {
    if (visibleColumnKeys.includes(requestedSort.key)) return requestedSort;
    const key = tableColumnSortKey(columnPreset, columnFilterQuery, visibleColumnKeys);
    return { key, direction: sorters[key].direction };
  }, [requestedSort, columnPreset, columnFilterQuery, visibleColumnKeys]);
  const deferredShowVariants = useDeferredValue(showVariants);
  const deferredFilters = useDeferredValue(filters);
  const [, startSortTransition] = useTransition();
  const ratioReferences = useMemo(
    () =>
      payload == null
        ? []
        : ratioKinds.map((kind) => ({
            kind,
            references: resourceRatioReferences(
              resourceRatioObservations(
                payload.models,
                payload.metadata.scoring.benchmark_portfolio,
                kind,
              ),
            ),
          })),
    [payload],
  );
  const tableRows = useMemo(() => {
    const rows = dedupeDisplayModels(
      modelsForVariantDisplay(
        payload?.models ?? [],
        deferredShowVariants,
        payload?.benchmark_observations,
      ),
    );
    if (payload == null) return rows;
    const metrics = ratioReferences.map(({ kind, references }) => {
      const observations = new Map<ModelAtlasModel, ResourceRatioObservation[]>();
      for (const observation of resourceRatioObservations(
        rows.map((row) => row.model),
        payload.metadata.scoring.benchmark_portfolio,
        kind,
      )) {
        const group = observations.get(observation.model) ?? [];
        group.push(observation);
        observations.set(observation.model, group);
      }
      return { kind, references, observations };
    });
    return rows.map((row) => ({
      ...row,
      resourceRatios: Object.fromEntries(
        metrics.map(({ kind, references, observations }) => [
          kind,
          summarizeResourceRatios(observations.get(row.model) ?? [], references),
        ]),
      ) as Record<(typeof ratioKinds)[number], ReturnType<typeof summarizeResourceRatios>>,
    }));
  }, [deferredShowVariants, payload, ratioReferences]);

  const filterScope = useMemo(
    () => ({
      observedAtEpochSeconds: payload?.fetched_at_epoch_seconds ?? null,
      rankingModels: payload?.models ?? [],
    }),
    [payload],
  );
  const scopedRows = useMemo(
    () => filterByGlobalModelFilters(tableRows, (row) => row.model, deferredFilters, filterScope),
    [tableRows, deferredFilters, filterScope],
  );
  const expandedTableRows = useMemo(
    () =>
      dedupeDisplayModels(
        modelsForVariantDisplay(payload?.models ?? [], true, payload?.benchmark_observations),
      ),
    [payload],
  );
  // Expanded counts follow the displayed families, so recency and rank are already applied through them.
  const globallyFilteredExpandedRows = useMemo(
    () =>
      filterByGlobalModelFilters(
        expandedTableRows,
        (row) => row.model,
        { ...deferredFilters, days: "all", rank: "all" },
        filterScope,
      ),
    [expandedTableRows, deferredFilters, filterScope],
  );
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
  const expandedVariantCount = useMemo(() => {
    const selectedModels = new Set(limitedRows.map((row) => canonicalModelKey(row.model)));
    return globallyFilteredExpandedRows.filter((row) =>
      selectedModels.has(canonicalModelKey(row.model)),
    ).length;
  }, [globallyFilteredExpandedRows, limitedRows]);
  const visibleRows = useMemo(() => sortedRows(limitedRows, sortState), [limitedRows, sortState]);
  const orderedMetricColumns = useMemo(() => {
    const orderByKey = new Map(visibleColumnKeys.map((key, index) => [key, index]));
    return [...dashboardMetricColumns].sort(
      (left, right) =>
        (orderByKey.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (orderByKey.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [visibleColumnKeys]);

  const rowKind = deferredShowVariants ? "variants" : "models";
  const activeTooltipContent =
    tooltip == null
      ? undefined
      : tooltip.kind === "change"
        ? tooltip.content
        : tableColumnTooltip(tooltip.key, columnTooltips, {
            models: visibleRows.map((row) => row.model),
            scoring: payload?.metadata.scoring,
            unit: rowKind,
          });
  const columnSearchResultLabel = hasSearchQuery(deferredColumnQuery)
    ? `${columnSearchMatchCount} ${columnSearchMatchCount === 1 ? "column" : "columns"}`
    : null;
  const emptyMessage = errorMessage ?? (payload == null ? "Loading stats" : "No models");

  useEffect(() => {
    setLimit(scopedRows.length);
  }, [scopedRows.length, setLimit]);

  const handleSort = useCallback(
    (key: SortKey) => {
      const defaultDirection = sorters[key].direction;
      startSortTransition(() => {
        setSortState({
          key,
          direction:
            sortState.key === key && sortState.direction === defaultDirection
              ? reverseDirection(defaultDirection)
              : defaultDirection,
        });
      });
    },
    [sortState, setSortState],
  );

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
    [effectiveLimit, expandedVariantCount, setLimit, setShowVariants],
  );

  /** Keep a column change and any required sort fallback in one navigable action. */
  const changeColumnView = useCallback(
    (patch: Pick<DashboardUrlPatch, "view" | "column-q">) => {
      const preset = patch.view ?? columnPreset;
      const searchQuery = patch["column-q"] ?? columnQuery;
      const { searchQuery: query, keys } = tableColumnView(preset, searchQuery, columnTooltips);
      const key = keys.includes(sortState.key)
        ? sortState.key
        : tableColumnSortKey(preset, query, keys);
      updateDashboardUrl(
        {
          ...patch,
          ...(key !== requestedSort.key
            ? { sort: { key, direction: sorters[key].direction } }
            : {}),
        },
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
    <section
      id="leaderboard"
      className="dashboard-research-section leaderboard-section"
      aria-labelledby="leaderboard-title"
    >
      <header className="dashboard-section-head">
        <h2 id="leaderboard-title" className="dashboard-section-title">
          <b aria-hidden="true">{researchRegionOrdinal("leaderboard")}</b>
          <span>Models</span>
        </h2>
        <div className="dashboard-section-actions" data-capture-exclude>
          <LeaderboardCapture rows={visibleRows} rowKind={rowKind} sortState={sortState} />
          <CopyDashboardLink sectionId="leaderboard" />
        </div>
      </header>
      <div className="dashboard-deck research-plane">
        <LeaderboardControls
          preset={columnPreset}
          columnQuery={columnQuery}
          columnSearchResultLabel={columnSearchResultLabel}
          isColumnSearch={hasSearchQuery(columnFilterQuery)}
          display={{
            itemKind: rowKind,
            maximum: maximumLimit,
            value: effectiveLimit,
            onValueChange: setLimit,
            showVariants,
            onShowVariantsChange: handleVariantDisplay,
          }}
          onPresetChange={handleColumnPresetChange}
          onColumnQueryChange={handleColumnQueryChange}
        />
        <ModelTable
          sortState={sortState}
          fitColumnContent={columnFilterQuery.trim().length > 0}
          visibleColumnKeys={visibleColumnKeys}
          visibleRows={visibleRows}
          emptyMessage={emptyMessage}
          isLoading={isLoading}
          metricColumns={orderedMetricColumns}
          onSort={handleSort}
          onScoreChange={showScoreChange}
          onTooltip={showTooltip}
          onTooltipEnd={clearTooltip}
        />
      </div>
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
