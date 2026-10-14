/** Viewport measurement and horizontal scroll synchronization for the leaderboard table. */

import {
  type RefObject,
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { clamp } from "../../../src/model-atlas/math-utils";

type ScrollTargetName = "body" | "header";

type ScrollSnapshot = {
  scrollLeft: number;
  maxScrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
};

type UseTableViewportOptions = {
  /** The columns drawn, in order. */
  columnKeys: readonly string[];
  /** The rows drawn; a new list, like a new column list, has the column widths measured afresh. */
  rows: readonly unknown[];
  onTooltipEnd: () => void;
};

type UseTableViewportResult = {
  tableScrollRef: RefObject<HTMLDivElement | null>;
  headerScrollRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
  rowHeight: number | null;
  columnWidths: number[];
  /** Whether the body table should pin its columns to `columnWidths` as minimums. */
  columnWidthsHeld: boolean;
  pinnedColumnsEnabled: boolean;
  handleScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** `smooth` glides to the position, unless the reader prefers reduced motion; the header follows through the scroll handler. */
  scrollTableTo: (scrollLeft: number, options?: { smooth?: boolean }) => void;
};

const PINNED_COLUMNS_WIDTH_MULTIPLIER = 2;
const PINNED_COLUMNS_ENABLE_BUFFER_PX = 24;
const UNPIN_COLUMNS_MEDIA_QUERY = "(max-width: 720px)";
const NON_PASSIVE_WHEEL_OPTIONS: AddEventListenerOptions = { passive: false };

/**
 * Manage mirrored table/header horizontal scrolling and rendered layout measurements.
 *
 * Only rows near the viewport draw their cells, so a column's natural width follows whichever of them are drawn.
 * Once measured, the widths are held as minimums so a column cannot narrow while its rows scroll; it can still widen for a wider value.
 * A change of columns, rows, viewport width, or loaded fonts releases the hold for one commit, so the table is laid out naturally before it is measured and held again.
 */
export function useTableViewport({
  columnKeys,
  rows,
  onTooltipEnd,
}: UseTableViewportOptions): UseTableViewportResult {
  const columnCount = columnKeys.length;
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const mirroredPositionsRef = useRef<Record<ScrollTargetName, number | null>>({
    body: null,
    header: null,
  });
  const widestPinnedWidthRef = useRef(0);
  const viewportWidthRef = useRef<number | null>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [pinnedColumnsEnabled, setPinnedColumnsEnabled] = useState(false);
  // Counts the viewport-width and font changes that require fresh widths for unchanged columns and rows.
  const [measureEpoch, setMeasureEpoch] = useState(0);
  const [held, setHeld] = useState<{
    columnKeys: readonly string[];
    rows: readonly unknown[];
    epoch: number;
  } | null>(null);
  const columnWidthsHeld =
    held != null &&
    held.columnKeys === columnKeys &&
    held.rows === rows &&
    held.epoch === measureEpoch;
  const syncTableLayoutMeasurements = useCallback(() => {
    const table = tableRef.current;
    const viewportWidth = tableScrollRef.current?.clientWidth;
    if (viewportWidth != null) {
      if (
        viewportWidthRef.current != null &&
        Math.abs(viewportWidth - viewportWidthRef.current) >= 0.5
      ) {
        setMeasureEpoch((epoch) => epoch + 1);
      }
      viewportWidthRef.current = viewportWidth;
    }
    const measuredRowHeight =
      table
        ?.querySelector<HTMLTableCellElement>("tbody td.model-column")
        ?.parentElement?.getBoundingClientRect().height ?? 0;
    if (measuredRowHeight > 0) {
      setRowHeight((current) =>
        current != null && Math.abs(current - measuredRowHeight) < 0.5
          ? current
          : measuredRowHeight,
      );
    }
    const widths = measuredTableColumnWidths(table, columnCount);
    if (widths.length === 0) {
      setPinnedColumnsEnabled(false);
      return;
    }
    setColumnWidths((current) => (areNumberListsEqual(current, widths) ? current : widths));
    widestPinnedWidthRef.current = Math.max(
      widestPinnedWidthRef.current,
      (widths[0] ?? 0) + (widths[1] ?? 0),
    );
    setPinnedColumnsEnabled((current) =>
      shouldPinColumns(tableScrollRef.current, widestPinnedWidthRef.current, current),
    );
  }, [columnCount]);
  const mirrorScroll = useCallback((source: HTMLElement, targetName: ScrollTargetName) => {
    const target = targetName === "body" ? tableScrollRef.current : headerScrollRef.current;
    if (target == null) return;
    const { maxScrollLeft } = horizontalScrollSnapshot(target);
    const nextScrollLeft = clamp(source.scrollLeft, 0, maxScrollLeft);
    if (Math.abs(target.scrollLeft - nextScrollLeft) < 0.5) return;
    target.scrollLeft = nextScrollLeft;
    // A mirrored scroll can arrive after the next animation frame; recognize its position instead of expiring the guard by time.
    mirroredPositionsRef.current[targetName] = target.scrollLeft;
  }, []);
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const tableScroll = tableScrollRef.current;
      if (tableScroll == null || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }
      const { maxScrollLeft } = horizontalScrollSnapshot(tableScroll);
      if (maxScrollLeft <= 0) {
        return;
      }
      event.preventDefault();
      tableScroll.scrollLeft = clamp(tableScroll.scrollLeft + event.deltaX, 0, maxScrollLeft);
      mirrorScroll(tableScroll, "header");
    },
    [mirrorScroll],
  );
  const scrollTableTo = useCallback(
    (scrollLeft: number, options?: { smooth?: boolean }) => {
      const tableScroll = tableScrollRef.current;
      if (tableScroll == null) {
        return;
      }
      const { maxScrollLeft } = horizontalScrollSnapshot(tableScroll);
      const left = clamp(scrollLeft, 0, maxScrollLeft);
      onTooltipEnd();
      if (options?.smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        tableScroll.scrollTo({ left, behavior: "smooth" });
        return;
      }
      tableScroll.scrollLeft = left;
      mirrorScroll(tableScroll, "header");
    },
    [mirrorScroll, onTooltipEnd],
  );
  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const source = event.currentTarget;
      const sourceName = source === tableScrollRef.current ? "body" : "header";
      const mirroredPosition = mirroredPositionsRef.current[sourceName];
      mirroredPositionsRef.current[sourceName] = null;
      if (mirroredPosition != null && Math.abs(source.scrollLeft - mirroredPosition) < 0.5) {
        return;
      }
      onTooltipEnd();
      mirrorScroll(source, sourceName === "body" ? "header" : "body");
    },
    [mirrorScroll, onTooltipEnd],
  );

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    const headerScroll = headerScrollRef.current;
    if (tableScroll == null) {
      return;
    }
    tableScroll.addEventListener("wheel", handleWheel, NON_PASSIVE_WHEEL_OPTIONS);
    headerScroll?.addEventListener("wheel", handleWheel, NON_PASSIVE_WHEEL_OPTIONS);
    return () => {
      tableScroll.removeEventListener("wheel", handleWheel, NON_PASSIVE_WHEEL_OPTIONS);
      headerScroll?.removeEventListener("wheel", handleWheel, NON_PASSIVE_WHEEL_OPTIONS);
    };
  }, [handleWheel]);

  useLayoutEffect(() => {
    const table = tableRef.current;
    syncTableLayoutMeasurements();
    const animationFrame = window.requestAnimationFrame(syncTableLayoutMeasurements);
    const observer = new ResizeObserver(syncTableLayoutMeasurements);
    if (table) {
      observer.observe(table);
    }
    if (tableScrollRef.current) {
      observer.observe(tableScrollRef.current);
    }
    window.addEventListener("resize", syncTableLayoutMeasurements);
    // Fonts that finish loading can narrow columns as well as widen them, which held widths would hide.
    if (document.fonts?.status === "loading") {
      document.fonts.ready.then(() => setMeasureEpoch((epoch) => epoch + 1)).catch(() => {});
    }
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", syncTableLayoutMeasurements);
    };
  }, [syncTableLayoutMeasurements]);

  useLayoutEffect(() => {
    if (columnWidthsHeld) return;
    // The commit that released the widths laid the table out naturally; measure that before holding again.
    syncTableLayoutMeasurements();
    setHeld({ columnKeys, rows, epoch: measureEpoch });
  }, [columnWidthsHeld, columnKeys, rows, measureEpoch, syncTableLayoutMeasurements]);

  useLayoutEffect(() => {
    const tableScroll = tableScrollRef.current;
    const headerScroll = headerScrollRef.current;
    if (tableScroll == null || headerScroll == null || columnWidths.length !== columnCount) {
      return;
    }
    mirrorScroll(tableScroll, "header");
  }, [columnCount, columnWidths.length, mirrorScroll]);

  return {
    tableScrollRef,
    headerScrollRef,
    tableRef,
    rowHeight,
    columnWidths,
    columnWidthsHeld,
    pinnedColumnsEnabled,
    handleScroll,
    scrollTableTo,
  };
}

/** Keep rapidly changing scroll position local to the rail so scrolling never renders table headers or rows. */
export function useTableScrollSnapshot(
  tableScrollRef: RefObject<HTMLDivElement | null>,
  tableRef: RefObject<HTMLTableElement | null>,
): ScrollSnapshot {
  const [snapshot, setSnapshot] = useState<ScrollSnapshot>({
    scrollLeft: 0,
    maxScrollLeft: 0,
    clientWidth: 0,
    scrollWidth: 0,
  });
  // A passive effect runs after every ref in the table shell is attached, so the rail may render before the table it mirrors.
  useEffect(() => {
    const viewport = tableScrollRef.current;
    if (viewport == null) return;
    let animationFrame: number | null = null;
    const update = () => {
      animationFrame = null;
      const next = horizontalScrollSnapshot(viewport);
      setSnapshot((current) => (areScrollSnapshotsEqual(current, next) ? current : next));
    };
    const scheduleUpdate = () => {
      if (animationFrame == null) animationFrame = window.requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(viewport);
    if (tableRef.current) observer.observe(tableRef.current);
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    return () => {
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      viewport.removeEventListener("scroll", scheduleUpdate);
    };
  }, [tableRef, tableScrollRef]);
  return snapshot;
}

/** Rows of the table drawn in full, as a half-open index range; rows outside it keep only their rank and model. */
type DetailedRowRange = { start: number; end: number };

// Rows kept in full beyond each edge of the viewport, so ordinary scrolling reaches finished rows.
const DETAILED_ROW_OVERSCAN = 8;
// The range moves in steps, so scrolling re-renders the table once every few rows rather than on every one.
const DETAILED_ROW_STEP = 4;
// Before the row height is measured, the eight-row viewport and its overscan below.
const INITIAL_DETAILED_ROWS: DetailedRowRange = { start: 0, end: 16 };

/**
 * Track which rows sit in or near the table's vertical viewport.
 *
 * Most of the table's cells belong to rows scrolled out of its eight-row window, and drawing them all made every load, sort, and column change restyle the whole table.
 * The range starts at the top rows for server rendering and hydration, then follows the scroll position once a row has been measured.
 */
export function useDetailedRowRange(
  tableScrollRef: RefObject<HTMLDivElement | null>,
  rowHeight: number | null,
): DetailedRowRange {
  const [range, setRange] = useState(INITIAL_DETAILED_ROWS);
  useLayoutEffect(() => {
    const viewport = tableScrollRef.current;
    if (viewport == null || rowHeight == null || rowHeight <= 0) return;
    const update = () => {
      const first = Math.floor(viewport.scrollTop / rowHeight);
      const last = Math.ceil((viewport.scrollTop + viewport.clientHeight) / rowHeight);
      const start =
        Math.floor(Math.max(0, first - DETAILED_ROW_OVERSCAN) / DETAILED_ROW_STEP) *
        DETAILED_ROW_STEP;
      const end = Math.ceil((last + DETAILED_ROW_OVERSCAN) / DETAILED_ROW_STEP) * DETAILED_ROW_STEP;
      setRange((current) =>
        current.start === start && current.end === end ? current : { start, end },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    viewport.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
    };
  }, [rowHeight, tableScrollRef]);
  return range;
}

function measuredTableColumnWidths(
  table: HTMLTableElement | null,
  expectedColumnCount: number,
): number[] {
  const dataRow = Array.from(table?.querySelectorAll("tbody tr") ?? []).find(
    (row) => row.children.length === expectedColumnCount,
  );
  const measurementCells = dataRow?.children ?? table?.querySelector("thead tr")?.children;
  return Array.from(
    measurementCells ?? [],
    (cell) => Math.round(cell.getBoundingClientRect().width * 100) / 100,
  );
}

/** Pin the first two columns when space allows; extra width is required to enable pinning so layout changes near the cutoff do not toggle it repeatedly. */
function shouldPinColumns(
  viewport: HTMLElement | null,
  pinnedWidth: number,
  isPinned: boolean,
): boolean {
  if (viewport == null || pinnedWidth <= 0) {
    return false;
  }
  if (window.matchMedia(UNPIN_COLUMNS_MEDIA_QUERY).matches) {
    return false;
  }
  const threshold = pinnedWidth * PINNED_COLUMNS_WIDTH_MULTIPLIER;
  const viewportWidth = viewport.clientWidth;
  return isPinned
    ? viewportWidth > threshold
    : viewportWidth > threshold + PINNED_COLUMNS_ENABLE_BUFFER_PX;
}

/** Compare measured column lists while tolerating subpixel jitter. */
function areNumberListsEqual(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((leftValue, index) => {
      const rightValue = right[index];
      return rightValue != null && Math.abs(leftValue - rightValue) < 0.5;
    })
  );
}

/** Read one consistent set of dimensions and clamp browser overscroll before mirroring or positioning the rail. */
function horizontalScrollSnapshot(element: HTMLElement): ScrollSnapshot {
  const { clientWidth, scrollWidth } = element;
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  return {
    scrollLeft: clamp(element.scrollLeft, 0, maxScrollLeft),
    maxScrollLeft,
    clientWidth,
    scrollWidth,
  };
}

/** Compare scroll snapshots while tolerating subpixel browser differences. */
function areScrollSnapshotsEqual(left: ScrollSnapshot, right: ScrollSnapshot): boolean {
  return (
    Math.abs(left.scrollLeft - right.scrollLeft) < 0.5 &&
    Math.abs(left.maxScrollLeft - right.maxScrollLeft) < 0.5 &&
    Math.abs(left.clientWidth - right.clientWidth) < 0.5 &&
    Math.abs(left.scrollWidth - right.scrollWidth) < 0.5
  );
}
