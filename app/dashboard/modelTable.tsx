import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import type { ModelStatsSelectedModel } from "../../src/model-atlas/llm/llm-stats/types";
import {
	formatContext,
	formatCost,
	formatScore,
	formatTaskMetric,
	safeSlug,
} from "./format";
import {
	contextWindowValue,
	type Direction,
	type SortKey,
	type SortState,
	type TableRow,
	taskMetricColumns,
	taskMetricValue,
} from "./models";
import { type ProviderThemeColors, providerThemeColor } from "./providerTheme";
import { dashboardColumnKeys, staticSortableColumns } from "./tableColumns";
import type { HeaderTooltipHandler } from "./tooltip";

type ModelTableProps = {
	sortState: SortState;
	visibleRows: TableRow[];
	emptyMessage: string;
	onSort: (key: SortKey) => void;
	onTooltip: HeaderTooltipHandler;
	onTooltipEnd: () => void;
	providerColors: ProviderThemeColors;
};

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
	const stickyHeadTrackRef = useRef<HTMLDivElement>(null);
	const tableRef = useRef<HTMLTableElement>(null);
	const scrollAnimationFrameRef = useRef<number | null>(null);
	const [columnWidths, setColumnWidths] = useState<number[]>([]);
	const syncColumnWidths = useCallback(() => {
		const widths = Array.from(
			tableRef.current?.querySelectorAll("thead th") ?? [],
			(cell) => Math.ceil(cell.getBoundingClientRect().width),
		);
		if (widths.length === 0) {
			return;
		}
		setColumnWidths((current) =>
			sameNumberList(current, widths) ? current : widths,
		);
	}, []);
	const syncStickyHeaderScroll = useCallback(() => {
		scrollAnimationFrameRef.current = null;
		const scrollLeft = tableScrollRef.current?.scrollLeft ?? 0;
		if (stickyHeadTrackRef.current != null) {
			stickyHeadTrackRef.current.style.transform = `translateX(${-scrollLeft}px)`;
		}
	}, []);
	const handleScroll = useCallback(() => {
		onTooltipEnd();
		if (scrollAnimationFrameRef.current == null) {
			scrollAnimationFrameRef.current = window.requestAnimationFrame(
				syncStickyHeaderScroll,
			);
		}
	}, [onTooltipEnd, syncStickyHeaderScroll]);

	useLayoutEffect(() => {
		const table = tableRef.current;
		syncColumnWidths();
		syncStickyHeaderScroll();
		const animationFrame = window.requestAnimationFrame(syncColumnWidths);
		const observer = new ResizeObserver(syncColumnWidths);
		if (table) {
			observer.observe(table);
		}
		window.addEventListener("resize", syncColumnWidths);
		return () => {
			window.cancelAnimationFrame(animationFrame);
			if (scrollAnimationFrameRef.current != null) {
				window.cancelAnimationFrame(scrollAnimationFrameRef.current);
			}
			observer.disconnect();
			window.removeEventListener("resize", syncColumnWidths);
		};
	}, [syncColumnWidths, syncStickyHeaderScroll]);

	return (
		<div className="table-shell">
			<div className="table-sticky-head">
				<div className="table-sticky-head-viewport">
					<div ref={stickyHeadTrackRef} className="table-sticky-head-track">
						<table className="sticky-header-table">
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
				</div>
			</div>
			<div className="table-wrap" ref={tableScrollRef} onScroll={handleScroll}>
				<table ref={tableRef}>
					<ColumnGroup widths={columnWidths} />
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
			{taskMetricColumns.map((column) => (
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
	const relativeScores = model.relative_scores ?? {};
	return (
		<tr>
			<TableCell
				text={String(rowData.intelligenceRank).padStart(2, "0")}
				className="rank"
			/>
			<td>
				<div className="model-cell">
					<ProviderLogo model={model} />
					<div className="model-copy">
						<div className="model" title={model.name ?? undefined}>
							{model.name ?? "-"}
						</div>
						<div className="id" title={model.id ?? undefined}>
							{model.id ?? "-"}
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
			{taskMetricColumns.map((column) => (
				<TableCell
					key={column.key}
					text={formatTaskMetric(taskMetricValue(model, column), column)}
					className="data-cell"
				/>
			))}
		</tr>
	);
}

function ProviderLogo({ model }: { model: ModelStatsSelectedModel }) {
	const [hidden, setHidden] = useState(false);
	const logoSrc = logoSource(model);

	if (hidden || !logoSrc) {
		return <span className="provider-logo provider-logo-empty" />;
	}

	return (
		<img
			className="provider-logo"
			src={logoSrc}
			alt=""
			width={32}
			height={32}
			decoding="async"
			loading="lazy"
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

function sameNumberList(left: number[], right: number[]) {
	return (
		left.length === right.length &&
		left.every((leftValue, index) => leftValue === right[index])
	);
}

export function reverseDirection(direction: Direction): Direction {
	return direction === "ascending" ? "descending" : "ascending";
}
