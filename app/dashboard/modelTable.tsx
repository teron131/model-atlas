import Image from "next/image";
import {
	type CSSProperties,
	type ReactNode,
	type UIEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import type { ModelStatsSelectedModel } from "../../src/model-atlas/llm/llm-stats/types";
import {
	formatBenchmarkMetric,
	formatContext,
	formatCost,
	formatScore,
	formatTaskMetric,
	safeSlug,
} from "./format";
import {
	benchmarkMetricValue,
	contextWindowValue,
	type Direction,
	dashboardMetricColumns,
	type SortKey,
	type SortState,
	type TableRow,
	taskMetricValue,
} from "./models";
import { type ProviderThemeColors, providerThemeColor } from "./providerTheme";
import { dashboardColumnKeys, staticSortableColumns } from "./tableColumns";
import type { HeaderTooltipHandler } from "./tooltip";

type ScrollTargetName = "body" | "header";

type ModelTableProps = {
	sortState: SortState;
	visibleRows: TableRow[];
	emptyMessage: string;
	onSort: (key: SortKey) => void;
	onTooltip: HeaderTooltipHandler;
	onTooltipEnd: () => void;
	providerColors: ProviderThemeColors;
};

const PINNED_COLUMNS_WIDTH_MULTIPLIER = 2;
const PINNED_COLUMNS_ENABLE_BUFFER_PX = 24;
const MOBILE_UNPINNED_COLUMNS_MEDIA_QUERY = "(max-width: 720px)";
const NON_PASSIVE_WHEEL_OPTIONS: AddEventListenerOptions = { passive: false };

export function ModelTable({
	sortState,
	visibleRows,
	emptyMessage,
	onSort,
	onTooltip,
	onTooltipEnd,
	providerColors,
}: ModelTableProps) {
	const tableScrollRef = useRef<HTMLDivElement>(null);
	const headerScrollRef = useRef<HTMLDivElement>(null);
	const tableRef = useRef<HTMLTableElement>(null);
	const mirroredScrollTargetRef = useRef<ScrollTargetName | null>(null);
	const widestLeadingColumnsWidthRef = useRef(0);
	const [columnWidths, setColumnWidths] = useState<number[]>([]);
	const [pinnedColumnsEnabled, setPinnedColumnsEnabled] = useState(false);
	const stickyHeaderReady = columnWidths.length === dashboardColumnKeys.length;
	const stickyHeaderWidth = columnWidths.reduce((sum, width) => sum + width, 0);
	const stickyHeaderWidthStyle = `${stickyHeaderWidth}px`;
	const stickyHeaderTableStyle =
		stickyHeaderReady && stickyHeaderWidth > 0
			? ({
					width: stickyHeaderWidthStyle,
					minWidth: stickyHeaderWidthStyle,
					maxWidth: stickyHeaderWidthStyle,
				} as CSSProperties)
			: undefined;
	const tableShellStyle =
		columnWidths[0] == null
			? undefined
			: ({
					"--rank-column-width": `${columnWidths[0]}px`,
				} as CSSProperties);
	const syncTableLayoutMeasurements = useCallback(() => {
		const widths = measuredTableColumnWidths(tableRef.current);
		if (widths.length === 0) {
			setPinnedColumnsEnabled(false);
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
	}, []);
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
		},
		[markMirroredScrollTarget],
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
		},
		[markMirroredScrollTarget, onTooltipEnd],
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
		},
		[markMirroredScrollTarget, onTooltipEnd],
	);

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
		if (tableScroll == null || headerScroll == null || !stickyHeaderReady) {
			return;
		}
		headerScroll.scrollLeft = tableScroll.scrollLeft;
	}, [stickyHeaderReady]);

	return (
		<div
			className="table-shell"
			data-pinned-columns={pinnedColumnsEnabled}
			data-sticky-head-ready={stickyHeaderReady}
			style={tableShellStyle}
		>
			<div
				className="table-sticky-head"
				ref={headerScrollRef}
				onScroll={handleHeaderScroll}
			>
				<table className="sticky-header-table" style={stickyHeaderTableStyle}>
					<ColumnGroup widths={columnWidths} />
					<thead>
						<TableHeaderRow
							sortState={sortState}
							onSort={onSort}
							onTooltip={onTooltip}
							onTooltipEnd={onTooltipEnd}
						/>
					</thead>
				</table>
			</div>
			<div
				className="table-wrap"
				ref={tableScrollRef}
				onScroll={handleBodyScroll}
			>
				<table ref={tableRef}>
					<thead>
						<TableHeaderRow
							sortState={sortState}
							onSort={onSort}
							onTooltip={onTooltip}
							onTooltipEnd={onTooltipEnd}
						/>
					</thead>
					<tbody>
						{visibleRows.map((rowData) => (
							<ModelRow
								key={rowData.model.id ?? `${rowData.originalIndex}`}
								rowData={rowData}
								providerColors={providerColors}
							/>
						))}
						{visibleRows.length === 0 && (
							<EmptyStateRow message={emptyMessage} />
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function ColumnGroup({ widths }: { widths: number[] }) {
	if (widths.length === 0) {
		return null;
	}
	return (
		<colgroup>
			{dashboardColumnKeys.map((key, columnIndex) => {
				const width = widths[columnIndex];
				return width == null ? null : <col key={key} style={{ width }} />;
			})}
		</colgroup>
	);
}

function TableHeaderRow({
	sortState,
	onSort,
	onTooltip,
	onTooltipEnd,
}: Omit<ModelTableProps, "visibleRows" | "emptyMessage" | "providerColors">) {
	return (
		<tr>
			{staticSortableColumns.map((column) => (
				<SortableHeader
					key={column.key}
					label={column.label}
					keyName={column.key}
					className={column.className}
					sortState={sortState}
					onSort={onSort}
					onTooltip={onTooltip}
					onTooltipEnd={onTooltipEnd}
				/>
			))}
			{dashboardMetricColumns.map((column) => (
				<SortableHeader
					key={column.key}
					label={column.label}
					keyName={column.key}
					sortState={sortState}
					onSort={onSort}
					onTooltip={onTooltip}
					onTooltipEnd={onTooltipEnd}
				/>
			))}
		</tr>
	);
}

function EmptyStateRow({ message }: { message: string }) {
	return (
		<tr>
			<td className="empty" colSpan={dashboardColumnKeys.length}>
				{message}
			</td>
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
	const sortDirection =
		sortState.key === keyName ? sortState.direction : "none";
	return (
		<th
			className={className}
			aria-sort={sortState.key === keyName ? sortState.direction : "none"}
			data-column-key={keyName}
			data-sort-state={sortDirection}
		>
			<button
				className="sort-button"
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

function ModelRow({
	rowData,
	providerColors,
}: {
	rowData: TableRow;
	providerColors: ProviderThemeColors;
}) {
	const model = rowData.model;
	const displayName = displayModelName(model.name);
	const displayId = displayModelId(model.id);
	const relativeScores = model.relative_scores ?? {};
	return (
		<tr>
			<TableCell
				text={String(rowData.intelligenceRank).padStart(2, "0")}
				className="rank"
			/>
			<td className="model-column">
				<div className="model-cell">
					<ProviderLogo model={model} />
					<div className="model-copy">
						<div className="model" title={model.name ?? undefined}>
							{displayName}
						</div>
						<div className="id" title={model.id ?? undefined}>
							{displayId}
						</div>
					</div>
				</div>
			</td>
			{scoreCell(
				relativeScores.overall_score,
				model.provider,
				providerColors,
				"overall",
			)}
			{scoreCell(
				relativeScores.intelligence_score,
				model.provider,
				providerColors,
			)}
			{scoreCell(relativeScores.agentic_score, model.provider, providerColors)}
			{scoreCell(relativeScores.speed_score, model.provider, providerColors)}
			{scoreCell(relativeScores.value_score, model.provider, providerColors)}
			<TableCell
				text={formatCost(model.cost?.blended_price)}
				className="data-cell"
			/>
			<TableCell
				text={formatContext(contextWindowValue(model))}
				className="data-cell"
			/>
			{dashboardMetricColumns.map((column) =>
				"source" in column ? (
					<TableCell
						key={column.key}
						text={formatTaskMetric(taskMetricValue(model, column), column)}
						className="data-cell"
					/>
				) : (
					<TableCell
						key={column.key}
						text={formatBenchmarkMetric(
							benchmarkMetricValue(model, column),
							column,
						)}
						className="data-cell"
					/>
				),
			)}
		</tr>
	);
}

function displayModelName(name: string | null | undefined) {
	if (name == null || name.length === 0) {
		return "-";
	}
	return stripModelDisplaySuffixes(name, " ");
}

function displayModelId(id: string | null | undefined) {
	if (id == null || id.length === 0) {
		return "-";
	}
	const slashIndex = id.indexOf("/");
	return stripModelDisplaySuffixes(
		slashIndex === -1 ? id : id.slice(slashIndex + 1),
		"-",
	);
}

function stripModelDisplaySuffixes(value: string, separator: " " | "-") {
	const tokens = value.split(separator).filter((token) => token.length > 0);
	const visibleTokens = tokens.filter((token) => !isHiddenDisplayToken(token));
	while (visibleTokens.length > 1 && isReleaseDateToken(visibleTokens.at(-1))) {
		visibleTokens.pop();
	}
	return visibleTokens.join(separator) || value;
}

function isHiddenDisplayToken(token: string) {
	return /^(instruct|preview)$/i.test(token);
}

function isReleaseDateToken(token: string | undefined) {
	return token != null && /^\d{4}$/.test(token);
}

function ProviderLogo({ model }: { model: ModelStatsSelectedModel }) {
	const [hidden, setHidden] = useState(false);
	const logoSrc = logoSource(model);

	if (hidden || !logoSrc) {
		return <span className="provider-logo provider-logo-empty" />;
	}

	return (
		<Image
			className="provider-logo"
			src={logoSrc}
			alt=""
			width={32}
			height={32}
			unoptimized
			onError={() => {
				setHidden(true);
			}}
		/>
	);
}

function logoSource(model: ModelStatsSelectedModel) {
	if (typeof model.logo === "string" && model.logo.length > 0) {
		return model.logo;
	}
	const logoSlug = safeSlug(model.provider);
	return logoSlug ? `/api/logos/${logoSlug}.png` : "";
}

function TableCell({ text, className }: { text: string; className?: string }) {
	const missingClass = text === "-" ? " missing" : "";
	return <td className={`${className ?? ""}${missingClass}`.trim()}>{text}</td>;
}

function scoreCell(
	value: number | null | undefined,
	provider: string | null | undefined,
	providerColors: ProviderThemeColors,
	className = "",
) {
	const score =
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const themeColor = providerThemeColor(provider, providerColors);
	const style = {
		"--score": String(Math.max(0, Math.min(100, score ?? 0))),
		"--score-color": themeColor,
	} as CSSProperties;
	return (
		<td
			className={`score-cell ${className}${score == null ? " missing" : ""}`.trim()}
			style={style}
		>
			<span className="score-value">{formatScore(score)}</span>
			<span className="score-meter" />
		</td>
	);
}

function measuredTableColumnWidths(table: HTMLTableElement | null) {
	const dataRow = Array.from(table?.querySelectorAll("tbody tr") ?? []).find(
		(row) => row.children.length === dashboardColumnKeys.length,
	);
	const measurementCells =
		dataRow?.children ?? table?.querySelector("thead tr")?.children;
	return Array.from(
		measurementCells ?? [],
		(cell) => Math.round(cell.getBoundingClientRect().width * 100) / 100,
	);
}

function leadingColumnsWidth(columnWidths: number[]) {
	return (columnWidths[0] ?? 0) + (columnWidths[1] ?? 0);
}

function nextPinnedColumnsEnabled(
	scrollElement: HTMLElement | null,
	leadingColumnsWidth: number,
	isCurrentlyPinned: boolean,
) {
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

function sameNumberList(left: number[], right: number[]) {
	return (
		left.length === right.length &&
		left.every((leftValue, index) => {
			const rightValue = right[index];
			return rightValue != null && Math.abs(leftValue - rightValue) < 0.5;
		})
	);
}

function horizontalScrollState(element: HTMLElement | null) {
	if (element == null) {
		return { scrollLeft: 0, maxScrollLeft: 0 };
	}
	const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
	const scrollLeft = Math.max(0, Math.min(element.scrollLeft, maxScrollLeft));
	return { scrollLeft, maxScrollLeft };
}

function getNextScrollLeft(element: HTMLElement, deltaX: number) {
	const { scrollLeft, maxScrollLeft } = horizontalScrollState(element);
	return Math.max(0, Math.min(scrollLeft + deltaX, maxScrollLeft));
}

function syncHorizontalScroll(
	sourceElement: HTMLElement,
	targetElement: HTMLElement | null,
) {
	if (targetElement == null) {
		return false;
	}
	const { maxScrollLeft } = horizontalScrollState(targetElement);
	const nextScrollLeft = Math.max(
		0,
		Math.min(sourceElement.scrollLeft, maxScrollLeft),
	);
	if (Math.abs(targetElement.scrollLeft - nextScrollLeft) < 0.5) {
		return false;
	}
	targetElement.scrollLeft = nextScrollLeft;
	return true;
}

export function reverseDirection(direction: Direction): Direction {
	return direction === "ascending" ? "descending" : "ascending";
}
