/** Leaderboard table with sticky headers, pinned columns, and mirrored horizontal scroll, navigated by a group rail above its headers. */

import { type CSSProperties, memo, type ReactNode, useMemo } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { rowShowsModelSheet } from "../model-sheet/open";
import type { HeaderTooltipHandler } from "../shared/ColumnTooltip";
import { modelVariantKey } from "../shared/model-display";
import { useMediaQuery } from "../shared/use-media-query";
import { useUrlState } from "../use-url-state";
import { scoreMetricColumns, staticSortableColumns } from "./Columns";
import type {
  DashboardMetricColumn,
  SortDirection,
  SortKey,
  SortState,
  TableColumnKey,
  TableRow,
} from "./models";
import { tableColumnRuleKeys, tableColumnRuns } from "./models";
import { EmptyStateRow, LoadingRows, ModelRow, type ScoreChangeHandler } from "./Rows";
import { TableScrollRail } from "./TableScrollRail";
import { useTableViewport } from "./viewport";

const TABLE_SCROLL_REGION_ID = "model-table-scroll-region";
const SCORE_KEYS = new Set<TableColumnKey>(scoreMetricColumns.map((column) => column.key));
// Phones gather the four scores under each model's name, at the stylesheet's 760px phone boundary.
const SCORE_STRIP_MEDIA_QUERY = "(max-width: 760px)";

type ModelTableProps = {
  sortState: SortState;
  fitColumnContent: boolean;
  visibleColumnKeys: readonly TableColumnKey[];
  visibleRows: TableRow[];
  emptyMessage: string;
  isLoading: boolean;
  onSort: (key: SortKey) => void;
  onTooltip: HeaderTooltipHandler<TableColumnKey>;
  onTooltipEnd: () => void;
  onScoreChange: ScoreChangeHandler;
  metricColumns: DashboardMetricColumn[];
};

export const ModelTable = memo(function ModelTable({
  sortState,
  fitColumnContent,
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
  // On phones the four scores ride under each name rather than in columns, while still sorting the table.
  const scoreStrip = useMediaQuery(SCORE_STRIP_MEDIA_QUERY);
  const columnKeys = useMemo(
    () =>
      scoreStrip ? visibleColumnKeys.filter((key) => !SCORE_KEYS.has(key)) : visibleColumnKeys,
    [scoreStrip, visibleColumnKeys],
  );
  const visibleColumnKeySet = useMemo(() => new Set(columnKeys), [columnKeys]);
  const [sheetModel] = useUrlState("model");
  const [sheetEffort] = useUrlState("effort");
  // A model pinned for comparison keeps its row marked while other rows open beside it, and while a click elsewhere has hidden the sheet.
  const [pinnedModel] = useUrlState("compare");
  const [pinnedEffort] = useUrlState("compare-effort");
  const ruledColumnKeySet = useMemo(() => tableColumnRuleKeys(columnKeys), [columnKeys]);
  const runs = useMemo(() => tableColumnRuns(columnKeys), [columnKeys]);
  const {
    tableScrollRef,
    headerScrollRef,
    tableRef,
    rowHeight,
    columnWidths,
    pinnedColumnsEnabled,
    handleScroll,
    scrollTableTo,
  } = useTableViewport({
    columnCount: columnKeys.length,
    onTooltipEnd,
  });
  const isStickyHeaderReady = columnWidths.length === columnKeys.length;
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
      data-score-strip={scoreStrip}
      style={tableShellStyle}
    >
      <TableScrollRail
        regionId={TABLE_SCROLL_REGION_ID}
        tableScrollRef={tableScrollRef}
        tableRef={tableRef}
        onScrollTo={scrollTableTo}
        runs={isStickyHeaderReady ? runs : []}
        columnWidths={columnWidths}
        pinnedWidth={pinnedColumnsEnabled ? (columnWidths[0] ?? 0) + (columnWidths[1] ?? 0) : 0}
      />
      <div className="table-sticky-head" ref={headerScrollRef} onScroll={handleScroll}>
        <table className="sticky-header-table" style={stickyHeaderTableStyle}>
          <ColumnGroup widths={columnWidths} columnKeys={columnKeys} />
          <thead>
            <TableHeaderRow
              metricColumns={metricColumns}
              sortState={sortState}
              onSort={onSort}
              onTooltip={onTooltip}
              onTooltipEnd={onTooltipEnd}
              visibleColumnKeySet={visibleColumnKeySet}
              ruledColumnKeySet={ruledColumnKeySet}
              scoreStrip={scoreStrip}
            />
          </thead>
        </table>
      </div>
      <div
        id={TABLE_SCROLL_REGION_ID}
        className="table-wrap"
        ref={tableScrollRef}
        onScroll={handleScroll}
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
              scoreStrip={scoreStrip}
            />
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRows columnKeys={columnKeys} ruledColumnKeySet={ruledColumnKeySet} />
            ) : (
              <>
                {visibleRows.map((rowData, index) => (
                  <ModelRow
                    key={rowKeys[index] ?? `${rowData.originalIndex}`}
                    rowData={rowData}
                    metricColumns={metricColumns}
                    visibleColumnKeySet={visibleColumnKeySet}
                    ruledColumnKeySet={ruledColumnKeySet}
                    scoreStrip={scoreStrip}
                    sheetOpen={
                      (sheetModel != null &&
                        rowShowsModelSheet(rowData.model, sheetModel, sheetEffort)) ||
                      (pinnedModel != null &&
                        rowShowsModelSheet(rowData.model, pinnedModel, pinnedEffort))
                    }
                    onScoreChange={onScoreChange}
                  />
                ))}
                {visibleRows.length === 0 && (
                  <EmptyStateRow message={emptyMessage} columnCount={columnKeys.length} />
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
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
  scoreStrip,
}: Omit<
  ModelTableProps,
  | "visibleRows"
  | "emptyMessage"
  | "isLoading"
  | "visibleColumnKeys"
  | "fitColumnContent"
  | "onScoreChange"
> & {
  visibleColumnKeySet: ReadonlySet<TableColumnKey>;
  ruledColumnKeySet: ReadonlySet<TableColumnKey>;
  scoreStrip: boolean;
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
          >
            {scoreStrip && column.key === "model" ? (
              <ScoreSortStrip sortState={sortState} onSort={onSort} />
            ) : null}
          </SortableHeader>
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

/** `children` follow the sort button inside the header cell. */
function SortableHeader({
  label,
  keyName,
  className,
  sortState,
  onSort,
  onTooltip,
  onTooltipEnd,
  children,
}: {
  label: ReactNode;
  keyName: SortKey;
  className?: string;
  sortState: SortState;
  onSort: (key: SortKey) => void;
  onTooltip: HeaderTooltipHandler<TableColumnKey>;
  onTooltipEnd: () => void;
  children?: ReactNode;
}) {
  const sortDirection = sortState.key === keyName ? sortState.direction : "none";
  return (
    <th
      className={className}
      aria-sort={sortDirection}
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
      {children}
    </th>
  );
}

/** On phones the model header also sorts by each score, with the score marks the strip beneath each name lines up under; the marks carry spoken names instead of column tooltips, whose phone layer would catch the tap. */
function ScoreSortStrip({
  sortState,
  onSort,
}: {
  sortState: SortState;
  onSort: (key: SortKey) => void;
}) {
  return (
    <span className="score-strip score-strip-head" role="group" aria-label="Sort by score">
      {scoreMetricColumns.map((column) => {
        const direction = sortState.key === column.key ? sortState.direction : "none";
        return (
          <button
            key={column.key}
            type="button"
            className="header-button sort-button score-strip-sort"
            aria-label={`Sort by ${column.name}`}
            aria-pressed={direction !== "none"}
            data-sort-state={direction}
            onClick={() => onSort(column.key)}
          >
            {column.icon}
            <span className="sort-indicator" />
          </button>
        );
      })}
    </span>
  );
}

export function reverseDirection(direction: SortDirection): SortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}
