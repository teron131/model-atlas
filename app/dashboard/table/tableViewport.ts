/** Viewport measurement and horizontal scroll sync for the leaderboard table. */

import {
	type RefObject,
	type UIEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

type ScrollTargetName = "body" | "header";

export type TableViewportSnapshot = {
	scrollLeft: number;
	maxScrollLeft: number;
	clientWidth: number;
	scrollWidth: number;
};

type UseTableViewportOptions = {
	columnCount: number;
	onTooltipEnd: () => void;
};

type UseTableViewportResult = {
	tableScrollRef: RefObject<HTMLDivElement | null>;
	headerScrollRef: RefObject<HTMLDivElement | null>;
	tableRef: RefObject<HTMLTableElement | null>;
	columnWidths: number[];
	pinnedColumnsEnabled: boolean;
	scrollSnapshot: TableViewportSnapshot;
	handleBodyScroll: (event: UIEvent<HTMLDivElement>) => void;
	handleHeaderScroll: (event: UIEvent<HTMLDivElement>) => void;
	scrollTableTo: (scrollLeft: number) => void;
};

const PINNED_COLUMNS_WIDTH_MULTIPLIER = 2;
const PINNED_COLUMNS_ENABLE_BUFFER_PX = 24;
const MOBILE_UNPINNED_COLUMNS_MEDIA_QUERY = "(max-width: 720px)";
const NON_PASSIVE_WHEEL_OPTIONS: AddEventListenerOptions = { passive: false };

/** Manage mirrored table/header horizontal scrolling and column measurements. */
export function useTableViewport({
	columnCount,
	onTooltipEnd,
}: UseTableViewportOptions): UseTableViewportResult {
	const tableScrollRef = useRef<HTMLDivElement>(null);
	const headerScrollRef = useRef<HTMLDivElement>(null);
	const tableRef = useRef<HTMLTableElement>(null);
	const mirroredScrollTargetRef = useRef<ScrollTargetName | null>(null);
	const widestLeadingColumnsWidthRef = useRef(0);
	const [columnWidths, setColumnWidths] = useState<number[]>([]);
	const [pinnedColumnsEnabled, setPinnedColumnsEnabled] = useState(false);
	const [scrollSnapshot, setScrollSnapshot] = useState<TableViewportSnapshot>(
		() => emptyHorizontalScrollSnapshot(),
	);
	const syncScrollSnapshot = useCallback(() => {
		const snapshot = horizontalScrollSnapshot(tableScrollRef.current);
		setScrollSnapshot((current) =>
			sameHorizontalScrollSnapshot(current, snapshot) ? current : snapshot,
		);
	}, []);
	const syncTableLayoutMeasurements = useCallback(() => {
		const widths = measuredTableColumnWidths(tableRef.current, columnCount);
		if (widths.length === 0) {
			setPinnedColumnsEnabled(false);
			syncScrollSnapshot();
			return;
		}
		setColumnWidths((current) =>
			sameNumberList(current, widths) ? current : widths,
		);
		widestLeadingColumnsWidthRef.current = Math.max(
			widestLeadingColumnsWidthRef.current,
			leadingColumnsWidth(widths),
		);
		setPinnedColumnsEnabled((current) =>
			nextPinnedColumnsEnabled(
				tableScrollRef.current,
				widestLeadingColumnsWidthRef.current,
				current,
			),
		);
		syncScrollSnapshot();
	}, [columnCount, syncScrollSnapshot]);
	const markMirroredScrollTarget = useCallback(
		(targetName: ScrollTargetName) => {
			mirroredScrollTargetRef.current = targetName;
			window.requestAnimationFrame(() => {
				if (mirroredScrollTargetRef.current === targetName) {
					mirroredScrollTargetRef.current = null;
				}
			});
		},
		[],
	);
	const handleWheel = useCallback(
		(event: WheelEvent) => {
			const tableScroll = tableScrollRef.current;
			if (
				tableScroll == null ||
				Math.abs(event.deltaX) <= Math.abs(event.deltaY)
			) {
				return;
			}
			const { maxScrollLeft } = horizontalScrollState(tableScroll);
			if (maxScrollLeft <= 0) {
				return;
			}
			event.preventDefault();
			tableScroll.scrollLeft = getNextScrollLeft(tableScroll, event.deltaX);
			markMirroredScrollTarget("header");
			syncHorizontalScroll(tableScroll, headerScrollRef.current);
			syncScrollSnapshot();
		},
		[markMirroredScrollTarget, syncScrollSnapshot],
	);
	const scrollTableTo = useCallback(
		(scrollLeft: number) => {
			const tableScroll = tableScrollRef.current;
			if (tableScroll == null) {
				return;
			}
			const { maxScrollLeft } = horizontalScrollState(tableScroll);
			tableScroll.scrollLeft = clampNumber(scrollLeft, 0, maxScrollLeft);
			onTooltipEnd();
			markMirroredScrollTarget("header");
			syncHorizontalScroll(tableScroll, headerScrollRef.current);
			syncScrollSnapshot();
		},
		[markMirroredScrollTarget, onTooltipEnd, syncScrollSnapshot],
	);
	const handleBodyScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (mirroredScrollTargetRef.current === "body") {
				mirroredScrollTargetRef.current = null;
				return;
			}
			onTooltipEnd();
			markMirroredScrollTarget("header");
			if (!syncHorizontalScroll(event.currentTarget, headerScrollRef.current)) {
				mirroredScrollTargetRef.current = null;
			}
			syncScrollSnapshot();
		},
		[markMirroredScrollTarget, onTooltipEnd, syncScrollSnapshot],
	);
	const handleHeaderScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (mirroredScrollTargetRef.current === "header") {
				mirroredScrollTargetRef.current = null;
				return;
			}
			onTooltipEnd();
			markMirroredScrollTarget("body");
			if (!syncHorizontalScroll(event.currentTarget, tableScrollRef.current)) {
				mirroredScrollTargetRef.current = null;
			}
			syncScrollSnapshot();
		},
		[markMirroredScrollTarget, onTooltipEnd, syncScrollSnapshot],
	);

	useEffect(() => {
		const tableScroll = tableScrollRef.current;
		const headerScroll = headerScrollRef.current;
		if (tableScroll == null) {
			return;
		}
		tableScroll.addEventListener(
			"wheel",
			handleWheel,
			NON_PASSIVE_WHEEL_OPTIONS,
		);
		headerScroll?.addEventListener(
			"wheel",
			handleWheel,
			NON_PASSIVE_WHEEL_OPTIONS,
		);
		return () => {
			tableScroll.removeEventListener(
				"wheel",
				handleWheel,
				NON_PASSIVE_WHEEL_OPTIONS,
			);
			headerScroll?.removeEventListener(
				"wheel",
				handleWheel,
				NON_PASSIVE_WHEEL_OPTIONS,
			);
		};
	}, [handleWheel]);

	useLayoutEffect(() => {
		const table = tableRef.current;
		syncTableLayoutMeasurements();
		const animationFrame = window.requestAnimationFrame(
			syncTableLayoutMeasurements,
		);
		const observer = new ResizeObserver(syncTableLayoutMeasurements);
		if (table) {
			observer.observe(table);
		}
		if (tableScrollRef.current) {
			observer.observe(tableScrollRef.current);
		}
		window.addEventListener("resize", syncTableLayoutMeasurements);
		document.fonts?.ready.then(syncTableLayoutMeasurements).catch(() => {});
		return () => {
			window.cancelAnimationFrame(animationFrame);
			observer.disconnect();
			window.removeEventListener("resize", syncTableLayoutMeasurements);
		};
	}, [syncTableLayoutMeasurements]);

	useLayoutEffect(() => {
		const tableScroll = tableScrollRef.current;
		const headerScroll = headerScrollRef.current;
		if (
			tableScroll == null ||
			headerScroll == null ||
			columnWidths.length !== columnCount
		) {
			return;
		}
		headerScroll.scrollLeft = tableScroll.scrollLeft;
	}, [columnCount, columnWidths.length]);

	useLayoutEffect(() => {
		syncScrollSnapshot();
		const animationFrame = window.requestAnimationFrame(syncScrollSnapshot);
		return () => {
			window.cancelAnimationFrame(animationFrame);
		};
	}, [syncScrollSnapshot]);

	return {
		tableScrollRef,
		headerScrollRef,
		tableRef,
		columnWidths,
		pinnedColumnsEnabled,
		scrollSnapshot,
		handleBodyScroll,
		handleHeaderScroll,
		scrollTableTo,
	};
}

/** Clamp a number inside an inclusive range. */
export function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

/** Measure visible table columns from the first complete body row or header. */
function measuredTableColumnWidths(
	table: HTMLTableElement | null,
	expectedColumnCount: number,
): number[] {
	const dataRow = Array.from(table?.querySelectorAll("tbody tr") ?? []).find(
		(row) => row.children.length === expectedColumnCount,
	);
	const measurementCells =
		dataRow?.children ?? table?.querySelector("thead tr")?.children;
	return Array.from(
		measurementCells ?? [],
		(cell) => Math.round(cell.getBoundingClientRect().width * 100) / 100,
	);
}

/** Sum the leading rank and model-name columns that can become pinned. */
function leadingColumnsWidth(columnWidths: number[]): number {
	return (columnWidths[0] ?? 0) + (columnWidths[1] ?? 0);
}

/** Decide whether pinned columns fit the current table viewport. */
function nextPinnedColumnsEnabled(
	scrollElement: HTMLElement | null,
	leadingColumnsWidth: number,
	isCurrentlyPinned: boolean,
): boolean {
	if (scrollElement == null || leadingColumnsWidth <= 0) {
		return false;
	}
	if (window.matchMedia(MOBILE_UNPINNED_COLUMNS_MEDIA_QUERY).matches) {
		return false;
	}
	const threshold = leadingColumnsWidth * PINNED_COLUMNS_WIDTH_MULTIPLIER;
	const viewportWidth = scrollElement.clientWidth;
	return isCurrentlyPinned
		? viewportWidth > threshold
		: viewportWidth > threshold + PINNED_COLUMNS_ENABLE_BUFFER_PX;
}

/** Compare measured column lists while tolerating subpixel jitter. */
function sameNumberList(left: number[], right: number[]): boolean {
	return (
		left.length === right.length &&
		left.every((leftValue, index) => {
			const rightValue = right[index];
			return rightValue != null && Math.abs(leftValue - rightValue) < 0.5;
		})
	);
}

/** Read normalized horizontal scroll bounds from an element. */
function horizontalScrollState(element: HTMLElement | null): {
	scrollLeft: number;
	maxScrollLeft: number;
} {
	if (element == null) {
		return { scrollLeft: 0, maxScrollLeft: 0 };
	}
	const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
	const scrollLeft = clampNumber(element.scrollLeft, 0, maxScrollLeft);
	return { scrollLeft, maxScrollLeft };
}

/** Capture the current horizontal scroll metrics for the custom rail. */
function horizontalScrollSnapshot(
	element: HTMLElement | null,
): TableViewportSnapshot {
	if (element == null) {
		return emptyHorizontalScrollSnapshot();
	}
	const { scrollLeft, maxScrollLeft } = horizontalScrollState(element);
	return {
		scrollLeft,
		maxScrollLeft,
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
	};
}

/** Return the inert scroll snapshot used before the table is measurable. */
function emptyHorizontalScrollSnapshot(): TableViewportSnapshot {
	return {
		scrollLeft: 0,
		maxScrollLeft: 0,
		clientWidth: 0,
		scrollWidth: 0,
	};
}

/** Compare scroll snapshots while tolerating subpixel browser differences. */
function sameHorizontalScrollSnapshot(
	left: TableViewportSnapshot,
	right: TableViewportSnapshot,
): boolean {
	return (
		Math.abs(left.scrollLeft - right.scrollLeft) < 0.5 &&
		Math.abs(left.maxScrollLeft - right.maxScrollLeft) < 0.5 &&
		Math.abs(left.clientWidth - right.clientWidth) < 0.5 &&
		Math.abs(left.scrollWidth - right.scrollWidth) < 0.5
	);
}

/** Apply a wheel delta to an element's bounded horizontal scroll position. */
function getNextScrollLeft(element: HTMLElement, deltaX: number): number {
	const { scrollLeft, maxScrollLeft } = horizontalScrollState(element);
	return clampNumber(scrollLeft + deltaX, 0, maxScrollLeft);
}

/** Mirror one horizontal scroll container into another. */
function syncHorizontalScroll(
	sourceElement: HTMLElement,
	targetElement: HTMLElement | null,
): boolean {
	if (targetElement == null) {
		return false;
	}
	const { maxScrollLeft } = horizontalScrollState(targetElement);
	const nextScrollLeft = clampNumber(
		sourceElement.scrollLeft,
		0,
		maxScrollLeft,
	);
	if (Math.abs(targetElement.scrollLeft - nextScrollLeft) < 0.5) {
		return false;
	}
	targetElement.scrollLeft = nextScrollLeft;
	return true;
}
