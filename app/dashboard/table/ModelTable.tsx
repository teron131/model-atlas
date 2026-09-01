/** Leaderboard table with sticky headers, pinned columns, and mirrored horizontal scroll. */

import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import type { HeaderTooltipHandler } from "../shared/ColumnTooltip";
import { modelVariantKey } from "../shared/model-display";
import { staticSortableColumns } from "./Columns";
import type {
  BenchmarkColumnOrder,
  DashboardMetricColumn,
  SortDirection,
  SortKey,
  SortState,
  TableColumnKey,
  TableRow,
} from "./models";
import { tableColumnRuleKeys } from "./models";
import { EmptyStateRow, LoadingRows, ModelRow, type ScoreChangeHandler } from "./Rows";
import { clampNumber, type TableViewportSnapshot, useTableViewport } from "./viewport";

const TABLE_SCROLL_REGION_ID = "model-table-scroll-region";

type ModelTableProps = {
  sortState: SortState;
  fitColumnContent: boolean;
  benchmarkColumnOrder: BenchmarkColumnOrder;
  visibleColumnKeys: readonly TableColumnKey[];
  visibleRows: TableRow[];
  emptyMessage: string;
  isLoading: boolean;
  onSort: (key: SortKey) => void;
  onTooltip: HeaderTooltipHandler;
  onTooltipEnd: () => void;
  onScoreChange: ScoreChangeHandler;
  metricColumns: DashboardMetricColumn[];
};

const SCROLL_THUMB_MIN_PERCENT = 8;
const SCROLL_THUMB_MIN_WIDTH_PX = 58;
const TABLE_SCROLL_KEY_STEP_PX = 80;
const SCROLL_PAGE_STEP_RATIO = 0.85;

export const ModelTable = memo(function ModelTable({
  sortState,
  fitColumnContent,
  benchmarkColumnOrder,
  visibleColumnKeys,
  visibleRows,
  emptyMessage,
  isLoading,
  onSort,
  onTooltip,
  onTooltipEnd,
  onScoreChange,
  metricColumns,
}: ModelTableProps) {
  const visibleColumnKeySet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys]);
  const ruledColumnKeySet = useMemo(
    () => tableColumnRuleKeys(visibleColumnKeys, benchmarkColumnOrder),
    [benchmarkColumnOrder, visibleColumnKeys],
  );
  const {
    tableScrollRef,
    headerScrollRef,
    tableRef,
    rowHeight,
    columnWidths,
    pinnedColumnsEnabled,
    scrollSnapshot,
    handleBodyScroll,
    handleHeaderScroll,
    scrollTableTo,
  } = useTableViewport({
    columnCount: visibleColumnKeys.length,
    onTooltipEnd,
  });
  const isStickyHeaderReady = columnWidths.length === visibleColumnKeys.length;
  const rowKeys = useMemo(() => stableModelRowKeys(visibleRows), [visibleRows]);
  const stickyHeaderWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const stickyHeaderWidthStyle = `${stickyHeaderWidth}px`;
  const stickyHeaderTableStyle =
    isStickyHeaderReady && stickyHeaderWidth > 0
      ? ({
          width: stickyHeaderWidthStyle,
          minWidth: stickyHeaderWidthStyle,
          maxWidth: stickyHeaderWidthStyle,
        } as CSSProperties)
      : undefined;
  const tableShellStyle = {
    "--rank-column-width": columnWidths[0] == null ? undefined : `${columnWidths[0]}px`,
    "--table-body-height":
      rowHeight == null ? undefined : `calc(${rowHeight}px * var(--table-visible-rows))`,
  } as CSSProperties;

  return (
    <div
      className="table-shell"
      data-fit-column-content={fitColumnContent}
      data-pinned-columns={pinnedColumnsEnabled}
      data-sticky-head-ready={isStickyHeaderReady}
      style={tableShellStyle}
    >
      <div className="table-sticky-head" ref={headerScrollRef} onScroll={handleHeaderScroll}>
        <table className="sticky-header-table" style={stickyHeaderTableStyle}>
          <ColumnGroup widths={columnWidths} columnKeys={visibleColumnKeys} />
          <thead>
            <TableHeaderRow
              metricColumns={metricColumns}
              sortState={sortState}
              onSort={onSort}
              onTooltip={onTooltip}
              onTooltipEnd={onTooltipEnd}
              visibleColumnKeySet={visibleColumnKeySet}
              ruledColumnKeySet={ruledColumnKeySet}
            />
          </thead>
        </table>
      </div>
      <div
        id={TABLE_SCROLL_REGION_ID}
        className="table-wrap"
        ref={tableScrollRef}
        onScroll={handleBodyScroll}
      >
        <table ref={tableRef}>
          <thead>
            <TableHeaderRow
              metricColumns={metricColumns}
              sortState={sortState}
              onSort={onSort}
              onTooltip={onTooltip}
              onTooltipEnd={onTooltipEnd}
              visibleColumnKeySet={visibleColumnKeySet}
              ruledColumnKeySet={ruledColumnKeySet}
            />
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRows columnKeys={visibleColumnKeys} ruledColumnKeySet={ruledColumnKeySet} />
            ) : (
              <>
                {visibleRows.map((rowData, index) => (
                  <ModelRow
                    key={rowKeys[index] ?? `${rowData.originalIndex}`}
                    rowData={rowData}
                    metricColumns={metricColumns}
                    visibleColumnKeySet={visibleColumnKeySet}
                    ruledColumnKeySet={ruledColumnKeySet}
                    onScoreChange={onScoreChange}
                  />
                ))}
                {visibleRows.length === 0 && (
                  <EmptyStateRow message={emptyMessage} columnCount={visibleColumnKeys.length} />
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <TableScrollRail snapshot={scrollSnapshot} onScrollTo={scrollTableTo} />
    </div>
  );
});

/** Keep each model's representative row mounted when expanded effort rows appear. */
function stableModelRowKeys(rows: readonly TableRow[]): string[] {
  const strongestIndexByModel = new Map<string, number>();
  for (const [index, row] of rows.entries()) {
    const modelKey = canonicalModelKey(row.model);
    const strongestIndex = strongestIndexByModel.get(modelKey);
    if (
      strongestIndex == null ||
      (row.model.scores.intelligence_score ?? Number.NEGATIVE_INFINITY) >
        (rows[strongestIndex]?.model.scores.intelligence_score ?? Number.NEGATIVE_INFINITY)
    ) {
      strongestIndexByModel.set(modelKey, index);
    }
  }
  return rows.map((row, index) => {
    const modelKey = canonicalModelKey(row.model);
    return strongestIndexByModel.get(modelKey) === index ? modelKey : modelVariantKey(row.model);
  });
}

/** Mirror the table viewport in an accessible scroll rail and translate pointer, drag, and keyboard input back to horizontal table positions. */
function TableScrollRail({
  snapshot,
  onScrollTo,
}: {
  snapshot: TableViewportSnapshot;
  onScrollTo: (scrollLeft: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<number | null>(null);
  const canScroll = snapshot.maxScrollLeft > 1;
  const thumbWidthPercent = canScroll
    ? Math.max(SCROLL_THUMB_MIN_PERCENT, (snapshot.clientWidth / snapshot.scrollWidth) * 100)
    : 100;
  const thumbLeftPercent = canScroll ? (snapshot.scrollLeft / snapshot.scrollWidth) * 100 : 0;
  const percentScrolled = canScroll
    ? Math.round((snapshot.scrollLeft / snapshot.maxScrollLeft) * 100)
    : 0;
  const railStyle = {
    "--table-scrollbar-thumb-left": `${thumbLeftPercent}%`,
    "--table-scrollbar-thumb-min-width": `${SCROLL_THUMB_MIN_WIDTH_PX}px`,
    "--table-scrollbar-thumb-width": `${thumbWidthPercent}%`,
  } as CSSProperties;
  const scrollToPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (track == null || !canScroll) {
        return;
      }
      const trackRect = track.getBoundingClientRect();
      const thumbWidth = trackRect.width * (thumbWidthPercent / 100);
      const maxThumbLeft = trackRect.width - thumbWidth;
      if (maxThumbLeft <= 0) {
        return;
      }
      const nextThumbLeft = clampNumber(
        clientX - trackRect.left - (dragOffsetRef.current ?? thumbWidth / 2),
        0,
        maxThumbLeft,
      );
      onScrollTo((nextThumbLeft / maxThumbLeft) * snapshot.maxScrollLeft);
    },
    [canScroll, onScrollTo, snapshot.maxScrollLeft, thumbWidthPercent],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canScroll) {
        return;
      }
      const thumbRect = thumbRef.current?.getBoundingClientRect();
      dragOffsetRef.current =
        event.target === thumbRef.current && thumbRect != null
          ? event.clientX - thumbRect.left
          : (thumbRect?.width ?? 0) / 2;
      event.currentTarget.setPointerCapture(event.pointerId);
      scrollToPointer(event.clientX);
    },
    [canScroll, scrollToPointer],
  );
  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (dragOffsetRef.current == null) {
        return;
      }
      scrollToPointer(event.clientX);
    },
    [scrollToPointer],
  );
  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragOffsetRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!canScroll) {
        return;
      }
      const pageStep = snapshot.clientWidth * SCROLL_PAGE_STEP_RATIO;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft - TABLE_SCROLL_KEY_STEP_PX);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft + TABLE_SCROLL_KEY_STEP_PX);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft - pageStep);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft + pageStep);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        onScrollTo(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onScrollTo(snapshot.maxScrollLeft);
      }
    },
    [canScroll, onScrollTo, snapshot],
  );

  return (
    <div className="table-scrollbar" data-scrollable={canScroll} style={railStyle}>
      <div
        aria-controls={TABLE_SCROLL_REGION_ID}
        aria-label="Table columns"
        aria-orientation="horizontal"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentScrolled}
        className="table-scrollbar-track"
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={trackRef}
        role="scrollbar"
        tabIndex={canScroll ? 0 : -1}
      >
        <div className="table-scrollbar-thumb" ref={thumbRef} />
      </div>
    </div>
  );
}

function ColumnGroup({
  widths,
  columnKeys,
}: {
  widths: number[];
  columnKeys: readonly TableColumnKey[];
}) {
  if (widths.length === 0) {
    return null;
  }
  return (
    <colgroup>
      {columnKeys.map((key, columnIndex) => {
        const width = widths[columnIndex];
        return width == null ? null : <col key={key} style={{ width }} />;
      })}
    </colgroup>
  );
}

function TableHeaderRow({
  metricColumns,
  sortState,
  onSort,
  onTooltip,
  onTooltipEnd,
  visibleColumnKeySet,
  ruledColumnKeySet,
}: Omit<
  ModelTableProps,
  | "visibleRows"
  | "emptyMessage"
  | "isLoading"
  | "visibleColumnKeys"
  | "fitColumnContent"
  | "benchmarkColumnOrder"
  | "onScoreChange"
> & {
  visibleColumnKeySet: ReadonlySet<TableColumnKey>;
  ruledColumnKeySet: ReadonlySet<TableColumnKey>;
}) {
  return (
    <tr>
      {staticSortableColumns
        .filter((column) => visibleColumnKeySet.has(column.key))
        .map((column) => (
          <SortableHeader
            key={column.key}
            label={column.label}
            keyName={column.key}
            className={[
              column.className,
              ruledColumnKeySet.has(column.key) ? "column-group-end" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            sortState={sortState}
            onSort={onSort}
            onTooltip={onTooltip}
            onTooltipEnd={onTooltipEnd}
          />
        ))}
      {metricColumns
        .filter((column) => visibleColumnKeySet.has(column.key))
        .map((column) => (
          <SortableHeader
            key={column.key}
            label={column.label}
            keyName={column.key}
            className={[
              column.key === "modalities" ? "modality-cell" : undefined,
              ruledColumnKeySet.has(column.key) ? "column-group-end" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            sortState={sortState}
            onSort={onSort}
            onTooltip={onTooltip}
            onTooltipEnd={onTooltipEnd}
          />
        ))}
      {visibleColumnKeySet.has("confidence") ? (
        <th className="confidence-cell" data-column-key="confidence" scope="col">
          <button
            className="header-button"
            type="button"
            onMouseEnter={(event) => onTooltip(event, "confidence")}
            onFocus={(event) => onTooltip(event, "confidence")}
            onMouseLeave={onTooltipEnd}
            onBlur={onTooltipEnd}
          >
            Evidence
          </button>
        </th>
      ) : null}
      {visibleColumnKeySet.has("change") ? (
        <th className="change-cell" data-column-key="change" scope="col">
          <button
            className="header-button"
            type="button"
            onMouseEnter={(event) => onTooltip(event, "change")}
            onFocus={(event) => onTooltip(event, "change")}
            onMouseLeave={onTooltipEnd}
            onBlur={onTooltipEnd}
          >
            Change
          </button>
        </th>
      ) : null}
    </tr>
  );
}

function SortableHeader({
  label,
  keyName,
  className,
  sortState,
  onSort,
  onTooltip,
  onTooltipEnd,
}: {
  label: ReactNode;
  keyName: SortKey;
  className?: string;
  sortState: SortState;
  onSort: (key: SortKey) => void;
  onTooltip: HeaderTooltipHandler;
  onTooltipEnd: () => void;
}) {
  const sortDirection = sortState.key === keyName ? sortState.direction : "none";
  return (
    <th
      className={className}
      aria-sort={sortState.key === keyName ? sortState.direction : "none"}
      data-column-key={keyName}
      data-sort-state={sortDirection}
    >
      <button
        className="header-button sort-button"
        type="button"
        onClick={() => onSort(keyName)}
        onMouseEnter={(event) => onTooltip(event, keyName)}
        onFocus={(event) => onTooltip(event, keyName)}
        onMouseLeave={onTooltipEnd}
        onBlur={onTooltipEnd}
      >
        {label}
        <span className="sort-indicator" />
      </button>
    </th>
  );
}

export function reverseDirection(direction: SortDirection): SortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}
