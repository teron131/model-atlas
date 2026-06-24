/** Leaderboard table with sticky headers, pinned columns, and mirrored horizontal scroll. */

import Image from "next/image";
import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";
import type { HeaderTooltipHandler } from "../shared/ColumnTooltip";
import {
	benchmarkPercentValue,
	formatContext,
	formatCost,
	formatDashboardMetric,
	formatScore,
} from "../shared/format";
import {
	AudioInputIcon,
	ImageInputIcon,
	TextInputIcon,
	VideoInputIcon,
} from "../shared/icons";
import {
	providerAssetLogo,
	providerDisplayColor,
} from "../shared/providerTheme";
import {
	contextWindowValue,
	type DashboardMetricColumn,
	type Direction,
	dashboardMetricValue,
	type SortKey,
	type SortState,
	type TableRow,
} from "./models";
import { staticSortableColumns } from "./tableColumns";
import {
	clampNumber,
	type TableViewportSnapshot,
	useTableViewport,
} from "./tableViewport";

const TABLE_SCROLL_REGION_ID = "model-table-scroll-region";

type ModelTableProps = {
	sortState: SortState;
	visibleRows: TableRow[];
	emptyMessage: string;
	isLoading: boolean;
	onSort: (key: SortKey) => void;
	onTooltip: HeaderTooltipHandler;
	onTooltipEnd: () => void;
	metricColumns: DashboardMetricColumn[];
};

const TABLE_SCROLL_THUMB_MIN_PERCENT = 8;
const TABLE_SCROLL_THUMB_MIN_WIDTH_PX = 58;
const TABLE_SCROLL_KEY_STEP_PX = 80;
const TABLE_SCROLL_PAGE_STEP_RATIO = 0.85;
const HIDDEN_MODEL_DISPLAY_TOKENS = new Set(["instruct", "preview"]);
const RELEASE_DATE_TOKEN_PATTERN = /^\d{4}$/;
const LOADING_ROW_KEYS = [
	"loading-row-01",
	"loading-row-02",
	"loading-row-03",
	"loading-row-04",
	"loading-row-05",
	"loading-row-06",
	"loading-row-07",
	"loading-row-08",
	"loading-row-09",
	"loading-row-10",
	"loading-row-11",
	"loading-row-12",
] as const;
const staticColumnKeys = staticSortableColumns.map((column) => column.key);

export function ModelTable({
	sortState,
	visibleRows,
	emptyMessage,
	isLoading,
	onSort,
	onTooltip,
	onTooltipEnd,
	metricColumns,
}: ModelTableProps) {
	const columnKeys = useMemo(
		() => [...staticColumnKeys, ...metricColumns.map((column) => column.key)],
		[metricColumns],
	);
	const {
		tableScrollRef,
		headerScrollRef,
		tableRef,
		columnWidths,
		pinnedColumnsEnabled,
		scrollSnapshot,
		handleBodyScroll,
		handleHeaderScroll,
		scrollTableTo,
	} = useTableViewport({
		columnCount: columnKeys.length,
		onTooltipEnd,
	});
	const stickyHeaderReady = columnWidths.length === columnKeys.length;
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
					<ColumnGroup widths={columnWidths} columnKeys={columnKeys} />
					<thead>
						<TableHeaderRow
							metricColumns={metricColumns}
							sortState={sortState}
							onSort={onSort}
							onTooltip={onTooltip}
							onTooltipEnd={onTooltipEnd}
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
						/>
					</thead>
					<tbody>
						{isLoading ? (
							<LoadingRows columnKeys={columnKeys} />
						) : (
							<>
								{visibleRows.map((rowData) => (
									<ModelRow
										key={rowData.model.id ?? `${rowData.originalIndex}`}
										rowData={rowData}
										metricColumns={metricColumns}
									/>
								))}
								{visibleRows.length === 0 && (
									<EmptyStateRow
										message={emptyMessage}
										columnCount={columnKeys.length}
									/>
								)}
							</>
						)}
					</tbody>
				</table>
			</div>
			<TableScrollRail snapshot={scrollSnapshot} onScrollTo={scrollTableTo} />
		</div>
	);
}

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
		? Math.max(
				TABLE_SCROLL_THUMB_MIN_PERCENT,
				(snapshot.clientWidth / snapshot.scrollWidth) * 100,
			)
		: 100;
	const thumbLeftPercent = canScroll
		? (snapshot.scrollLeft / snapshot.scrollWidth) * 100
		: 0;
	const percentScrolled = canScroll
		? Math.round((snapshot.scrollLeft / snapshot.maxScrollLeft) * 100)
		: 0;
	const railStyle = {
		"--table-scrollbar-thumb-left": `${thumbLeftPercent}%`,
		"--table-scrollbar-thumb-min-width": `${TABLE_SCROLL_THUMB_MIN_WIDTH_PX}px`,
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
	const handlePointerEnd = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			dragOffsetRef.current = null;
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
		},
		[],
	);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (!canScroll) {
				return;
			}
			const pageStep = snapshot.clientWidth * TABLE_SCROLL_PAGE_STEP_RATIO;
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
		<div
			className="table-scrollbar"
			data-scrollable={canScroll}
			style={railStyle}
		>
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
	columnKeys: SortKey[];
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
}: Omit<ModelTableProps, "visibleRows" | "emptyMessage" | "isLoading">) {
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
			{metricColumns.map((column) => (
				<SortableHeader
					key={column.key}
					label={column.label}
					keyName={column.key}
					className={column.key === "modalities" ? "modality-cell" : undefined}
					sortState={sortState}
					onSort={onSort}
					onTooltip={onTooltip}
					onTooltipEnd={onTooltipEnd}
				/>
			))}
		</tr>
	);
}

function EmptyStateRow({
	message,
	columnCount,
}: {
	message: string;
	columnCount: number;
}) {
	return (
		<tr>
			<td className="empty" colSpan={columnCount}>
				{message}
			</td>
		</tr>
	);
}

function LoadingRows({ columnKeys }: { columnKeys: SortKey[] }) {
	return (
		<>
			{LOADING_ROW_KEYS.map((key, index) => (
				<LoadingRow key={key} index={index} columnKeys={columnKeys} />
			))}
		</>
	);
}

function LoadingRow({
	index,
	columnKeys,
}: {
	index: number;
	columnKeys: SortKey[];
}) {
	return (
		<tr
			className="loading-row"
			style={{ "--loading-row-index": index } as CSSProperties}
		>
			<td className="rank">
				<span className="loading-block loading-rank" />
			</td>
			<td className="model-column">
				<div className="model-cell loading-model-cell">
					<span className="provider-logo loading-logo" />
					<div className="model-copy loading-model-copy">
						<span className="loading-block loading-model-name" />
						<span className="loading-block loading-model-id" />
					</div>
				</div>
			</td>
			{columnKeys.slice(2).map((key) => (
				<td className="data-cell" key={`loading-${key}`}>
					<span className="loading-block loading-metric" />
				</td>
			))}
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
	metricColumns,
}: {
	rowData: TableRow;
	metricColumns: DashboardMetricColumn[];
}) {
	const model = rowData.model;
	const visibleName = visibleModelName(model.name);
	const visibleSlug = visibleModelSlug(model.id);
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
							{visibleName}
						</div>
						<div className="id" title={model.id ?? undefined}>
							{visibleSlug}
						</div>
					</div>
				</div>
			</td>
			{scoreCell(relativeScores.intelligence_score, model.provider)}
			{scoreCell(relativeScores.agentic_score, model.provider)}
			{scoreCell(relativeScores.speed_score, model.provider)}
			{scoreCell(relativeScores.value_score, model.provider)}
			{scoreCell(relativeScores.overall_score, model.provider, "overall")}
			<TableCell
				text={formatCost(model.cost?.blended_price)}
				className="data-cell"
			/>
			<TableCell
				text={formatContext(contextWindowValue(model))}
				className="data-cell"
			/>
			{metricColumns.map((column) => (
				<DashboardMetricCell key={column.key} model={model} column={column} />
			))}
		</tr>
	);
}

function DashboardMetricCell({
	model,
	column,
}: {
	model: LlmStatsModel;
	column: DashboardMetricColumn;
}) {
	if (column.group === "profile" && column.field === "modalities") {
		return <ModalityInputCell inputs={model.modalities?.input} />;
	}
	const value = dashboardMetricValue(model, column);
	if ("benchmark" in column) {
		return (
			<BenchmarkMetricCell
				value={typeof value === "number" ? value : null}
				text={formatDashboardMetric(value, column)}
				provider={model.provider}
			/>
		);
	}
	return (
		<TableCell
			text={formatDashboardMetric(value, column)}
			className="data-cell"
		/>
	);
}

function BenchmarkMetricCell({
	value,
	text,
	provider,
}: {
	value: number | null;
	text: string;
	provider: string | null | undefined;
}) {
	const normalizedValue = benchmarkPercentValue(value);
	const displayColor = providerDisplayColor(provider);
	const style = {
		"--score": String(Math.max(0, Math.min(100, normalizedValue ?? 0))),
		"--score-color": displayColor,
	} as CSSProperties;
	return (
		<td
			className={`data-cell benchmark-cell${
				normalizedValue == null ? " missing" : ""
			}`}
			style={style}
		>
			<span className="score-value">{text}</span>
			<span className="score-meter benchmark-meter" />
		</td>
	);
}

function ModalityInputCell({ inputs }: { inputs: string[] | undefined }) {
	const availableSet = inputModalitySet(inputs);
	const availableModalities = inputModalities.filter((modality) =>
		availableSet.has(modality.key),
	);
	const label =
		availableModalities.length === 0
			? "none"
			: availableModalities.map((modality) => modality.label).join(", ");
	return (
		<td className="data-cell modality-cell">
			<span className="modality-icons" title={`Inputs: ${label}`}>
				<span className="column-filter-label">Inputs: {label}</span>
				{inputModalities.map(({ Icon, key, label }) => {
					const isAvailable = availableSet.has(key);
					return (
						<span
							className={`modality-icon ${isAvailable ? "" : "unavailable"}`}
							key={key}
							title={`${label} input ${isAvailable ? "available" : "unavailable"}`}
						>
							<Icon />
						</span>
					);
				})}
			</span>
		</td>
	);
}

const inputModalities = [
	{ key: "text", label: "text", Icon: TextInputIcon },
	{ key: "image", label: "image", Icon: ImageInputIcon },
	{ key: "audio", label: "audio", Icon: AudioInputIcon },
	{ key: "video", label: "video", Icon: VideoInputIcon },
] as const;

function inputModalitySet(inputs: string[] | undefined) {
	return new Set((inputs ?? []).map((input) => input.toLowerCase()));
}

function visibleModelName(name: string | null | undefined) {
	if (name == null || name.length === 0) {
		return "-";
	}
	return stripModelDisplayTokens(name, " ");
}

function visibleModelSlug(id: string | null | undefined) {
	if (id == null || id.length === 0) {
		return "-";
	}
	const slashIndex = id.indexOf("/");
	return stripModelDisplayTokens(
		slashIndex === -1 ? id : id.slice(slashIndex + 1),
		"-",
	);
}

function stripModelDisplayTokens(value: string, separator: " " | "-") {
	const tokens = value.split(separator).filter((token) => token.length > 0);
	const visibleTokens = tokens.filter((token) => !isHiddenDisplayToken(token));
	while (visibleTokens.length > 1 && isReleaseDateToken(visibleTokens.at(-1))) {
		visibleTokens.pop();
	}
	return visibleTokens.join(separator) || value;
}

function isHiddenDisplayToken(token: string) {
	return HIDDEN_MODEL_DISPLAY_TOKENS.has(token.toLowerCase());
}

function isReleaseDateToken(token: string | undefined) {
	return token != null && RELEASE_DATE_TOKEN_PATTERN.test(token);
}

function ProviderLogo({ model }: { model: LlmStatsModel }) {
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

function logoSource(model: LlmStatsModel) {
	const providerLogo = providerAssetLogo(model.provider);
	if (providerLogo.length > 0) {
		return providerLogo;
	}
	if (typeof model.logo === "string" && model.logo.length > 0) {
		return model.logo;
	}
	return "";
}

function TableCell({ text, className }: { text: string; className?: string }) {
	const missingClass = text === "-" ? " missing" : "";
	return <td className={`${className ?? ""}${missingClass}`.trim()}>{text}</td>;
}

function scoreCell(
	value: number | null | undefined,
	provider: string | null | undefined,
	className = "",
) {
	const score =
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const displayColor = providerDisplayColor(provider);
	const style = {
		"--score": String(Math.max(0, Math.min(100, score ?? 0))),
		"--score-color": displayColor,
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

export function reverseDirection(direction: Direction): Direction {
	return direction === "ascending" ? "descending" : "ascending";
}
