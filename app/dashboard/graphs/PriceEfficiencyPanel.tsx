/** Price-efficiency comparison panel for the dashboard graph surface. */

import { scaleLinear } from "d3-scale";
import {
	type CSSProperties,
	type FocusEvent as ReactFocusEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../../../src/model-atlas/stats/types";
import { CaptureButton } from "../capture/button";
import { captureFileToken } from "../capture/png";
import { useDisplayLimit } from "../shared/display-controls";
import {
	modelCount,
	modelMatchesQuery,
	modelsForVariantDisplay,
	modelVariantKey,
} from "../shared/model-display";
import { ModelToolbar } from "../shared/model-toolbar";
import {
	providerChartColor,
	providerDisplayName,
	providerLogo,
} from "../shared/provider-theme";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { EmptyChart, SummaryCard } from "./ChartComponents";
import { bestByScore, valueDistribution } from "./chart-stats";
import styles from "./graphs.module.css";
import {
	filterByModelControls,
	focusHover,
	modelName,
	providerOptions,
	shortLabel,
} from "./models";
import { Panel } from "./Panel";
import { stableSvgScale } from "./PlotPrimitives";
import {
	type PriceEfficiencyRow,
	priceEfficiencyDeltaDetail,
	priceEfficiencyHoverRows,
	priceEfficiencyRows,
	priceEfficiencySummaryDetail,
} from "./price-efficiency";
import type { CostFilter, HoverSetter } from "./types";

const SCORE_DOMAIN: [number, number] = [0, 100];
const SLOPE_LABEL_MIN_GAP = 24;
const CHART_WIDTH = 1100;
const COMPACT_CHART_WIDTH = 660;
const COMPACT_CHART_MEDIA_QUERY = "(max-width: 520px)";
const PANEL_TITLE = "Price vs Cost Efficiency";
const COMPACT_EFFORT_LABELS: Record<string, string> = {
	low: "LO",
	medium: "MED",
	high: "HI",
	xhigh: "XH",
	max: "MAX",
};

type SlopeGraphRow = {
	row: PriceEfficiencyRow;
	key: string;
	label: string;
	color: string;
	logo: string;
	leftY: number;
	rightY: number;
	leftLabelY: number;
	rightLabelY: number;
	leftNameX: number;
	leftScoreX: number;
	rightNameX: number;
};

type SlopeHoverEvent =
	| ReactMouseEvent<SVGElement>
	| ReactPointerEvent<SVGElement>;

export function PriceEfficiencyPanel({
	benchmarkPortfolio,
	displayExpanded,
	maxCost,
	onDisplayExpandedChange,
	selectedProviders,
	onSelectedProvidersChange,
	referenceModels,
	setHover,
}: {
	benchmarkPortfolio: BenchmarkPortfolio;
	displayExpanded: boolean;
	maxCost: CostFilter;
	onDisplayExpandedChange: (expanded: boolean) => void;
	selectedProviders: string[];
	onSelectedProvidersChange: (providers: string[]) => void;
	referenceModels: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const [filterQuery, setFilterQuery] = useState("");
	const panelRef = useRef<HTMLElement>(null);
	const compactChartLayout = useCompactChartLayout();
	const chartWidth = compactChartLayout ? COMPACT_CHART_WIDTH : CHART_WIDTH;
	const displayModels = useMemo(
		() =>
			modelsForVariantDisplay(referenceModels, displayExpanded)
				.filter(
					(model) =>
						model.name != null &&
						Number.isFinite(model.scores?.intelligence_score),
				)
				.sort(
					(left, right) =>
						right.scores.intelligence_score - left.scores.intelligence_score,
				),
		[displayExpanded, referenceModels],
	);
	const providerChoices = useMemo(
		() => providerOptions(displayModels),
		[displayModels],
	);
	const providerModelCount = modelCount(displayModels);
	const availableRows = useMemo(() => {
		const filteredModels = filterByModelControls(
			displayModels,
			(model) => model,
			{ providers: selectedProviders, maxCost },
		);
		return priceEfficiencyRows(
			filteredModels,
			referenceModels,
			benchmarkPortfolio,
			displayExpanded,
		).sort(
			(left, right) =>
				right.model.scores.intelligence_score -
				left.model.scores.intelligence_score,
		);
	}, [
		benchmarkPortfolio,
		displayModels,
		displayExpanded,
		maxCost,
		referenceModels,
		selectedProviders,
	]);
	const maximumLimit = availableRows.length;
	const [effectiveLimit, setDisplayLimit] = useDisplayLimit(maximumLimit);
	const matchingRows = useMemo(
		() =>
			availableRows.filter((row) => modelMatchesQuery(row.model, filterQuery)),
		[availableRows, filterQuery],
	);
	const rows = matchingRows.slice(0, effectiveLimit);
	const itemKind = displayExpanded ? "variants" : "models";
	const captureFileName = [
		`model-atlas-price-vs-cost-efficiency-top-${effectiveLimit}-${itemKind}`,
		...(selectedProviders.length === 0
			? []
			: [`providers-${selectedProviders.map(captureFileToken).join("-")}`]),
		...(filterQuery.trim().length === 0
			? []
			: [`filter-${captureFileToken(filterQuery)}`]),
	].join("-");
	const controls = (
		<ModelToolbar
			filterQuery={filterQuery}
			rowCountLabel={
				filterQuery.trim().length === 0
					? null
					: `${matchingRows.length} matches`
			}
			provider={{
				id: "price-efficiency-provider-menu",
				label: "Filter price efficiency providers",
				options: providerChoices,
				totalCount: providerModelCount,
				selectedProviders,
				onSelectedProvidersChange,
			}}
			display={{
				id: "price-efficiency-model-limit",
				label: "Price efficiency graph display",
				itemKind,
				maximum: maximumLimit,
				value: effectiveLimit,
				onValueChange: setDisplayLimit,
				variantControl: {
					expanded: displayExpanded,
					onExpandedChange: onDisplayExpandedChange,
				},
			}}
			screenshotControl={
				<CaptureButton
					targetRef={panelRef}
					title={PANEL_TITLE}
					captureWidth={chartWidth + 48}
					fileName={captureFileName}
				/>
			}
			onFilterQueryChange={setFilterQuery}
		/>
	);
	if (rows.length === 0) {
		return (
			<Panel
				captureEnabled={false}
				captureWidth={chartWidth}
				panelRef={panelRef}
				title={PANEL_TITLE}
				copy="Price score plotted against benchmark task-cost efficiency."
				wide
			>
				{controls}
				<EmptyChart message="No models have enough blended price and benchmark task-cost data for the price-efficiency comparison." />
			</Panel>
		);
	}

	const plottedRows = [...rows].sort(
		(left, right) => left.costEfficiencyScore - right.costEfficiencyScore,
	);
	const efficiencyLeader = bestByScore(rows, (row) => row.costEfficiencyScore);
	const bestLift = bestByScore(rows, (row) => row.deltaScore);
	const worstDrop = bestByScore(rows, (row) => -row.deltaScore);
	const scoreDistribution = valueDistribution(
		rows.map((row) => row.costEfficiencyScore),
	);

	return (
		<Panel
			captureEnabled={false}
			captureWidth={chartWidth}
			panelRef={panelRef}
			title={PANEL_TITLE}
			copy="Each point is one visible model variant. Both axes keep the full public leaderboard as their reference population, so filters only change which points are shown. Price score uses log blended price with model-balanced 2.5% one-sided winsorization. Benchmark cost efficiency averages model-balanced percentile and winsorized min-max mappings of logged cost residuals from the model-excluded expectation at comparable benchmark quality; it excludes provider and workflow price signals."
			summary={
				<BoxWhiskerSummary
					label="Benchmark cost efficiency"
					countLabel={itemKind}
					distribution={scoreDistribution}
					domainMax={100}
					formatValue={(value) => value.toFixed(0)}
					showDomainEndpoints
				/>
			}
			wide
		>
			{controls}
			<PriceEfficiencySlopeGraph
				compactLayout={compactChartLayout}
				rows={plottedRows}
				setHover={setHover}
			/>
			<div className={styles.chartSummary}>
				{efficiencyLeader == null ? null : (
					<SummaryCard
						label="Leader"
						value={modelName(efficiencyLeader.model)}
						detail={priceEfficiencySummaryDetail(efficiencyLeader)}
					/>
				)}
				{bestLift == null ? null : (
					<SummaryCard
						label="Best lift"
						value={modelName(bestLift.model)}
						detail={priceEfficiencyDeltaDetail(bestLift)}
					/>
				)}
				{worstDrop == null ? null : (
					<SummaryCard
						label="Worst drop"
						value={modelName(worstDrop.model)}
						detail={priceEfficiencyDeltaDetail(worstDrop)}
					/>
				)}
			</div>
		</Panel>
	);
}

function PriceEfficiencySlopeGraph({
	compactLayout,
	rows,
	setHover,
}: {
	compactLayout: boolean;
	rows: PriceEfficiencyRow[];
	setHover: HoverSetter;
}) {
	const width = compactLayout ? COMPACT_CHART_WIDTH : CHART_WIDTH;
	const margin = compactLayout
		? { top: 34, right: 220, bottom: 30, left: 200 }
		: { top: 34, right: 380, bottom: 30, left: 330 };
	const minimumLabelY = margin.top + 18;
	const height =
		minimumLabelY +
		Math.max(0, rows.length - 1) * SLOPE_LABEL_MIN_GAP +
		margin.bottom;
	const leftX = margin.left;
	const rightX = width - margin.right;
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
	const y = scaleLinear()
		.domain(SCORE_DOMAIN)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const yPoint = stableSvgScale(y);
	const leftLabels = distributedLabelPositions(
		rows,
		(row) => yPoint(row.priceScore),
		minimumLabelY,
		height - margin.bottom,
	);
	const rightLabels = distributedLabelPositions(
		rows,
		(row) => yPoint(row.costEfficiencyScore),
		minimumLabelY,
		height - margin.bottom,
	);
	const graphRows: SlopeGraphRow[] = rows.map((row, index) => {
		const key = priceEfficiencyRowKey(row, index);
		const logo =
			providerLogo(row.model.provider) ||
			(typeof row.model.logo === "string" ? row.model.logo : "");
		const hasLogo = logo.length > 0;
		const leftY = yPoint(row.priceScore);
		const rightY = yPoint(row.costEfficiencyScore);
		return {
			row,
			key,
			label: compactLayout
				? compactSlopeLabel(row.model)
				: shortLabel(row.model),
			color: providerChartColor(row.model.provider),
			logo,
			leftY,
			rightY,
			leftLabelY: leftLabels.get(row) ?? leftY,
			rightLabelY: rightLabels.get(row) ?? rightY,
			leftNameX: hasLogo
				? leftX - (compactLayout ? 50 : 64)
				: leftX - (compactLayout ? 36 : 48),
			leftScoreX: hasLogo
				? leftX - (compactLayout ? 22 : 32)
				: leftX - (compactLayout ? 18 : 28),
			rightNameX: hasLogo
				? rightX + (compactLayout ? 52 : 72)
				: rightX + (compactLayout ? 38 : 52),
		};
	});

	function showRowHover(graphRow: SlopeGraphRow, event: SlopeHoverEvent) {
		setHighlightedKey(graphRow.key);
		setHover({
			left: event.clientX,
			top: event.clientY,
			model: modelName(graphRow.row.model),
			provider: providerDisplayName(graphRow.row.model),
			color: graphRow.color,
			logo: graphRow.logo,
			rows: priceEfficiencyHoverRows(graphRow.row),
		});
	}

	function updateRowHover(event: SlopeHoverEvent) {
		setHover((hover) =>
			hover == null ||
			(Math.abs(hover.left - event.clientX) < 6 &&
				Math.abs(hover.top - event.clientY) < 6)
				? hover
				: {
						...hover,
						left: event.clientX,
						top: event.clientY,
					},
		);
	}

	function clearRowHover() {
		setHighlightedKey(null);
		setHover(null);
	}

	function rowHoverHandlers(graphRow: SlopeGraphRow) {
		return {
			onPointerOver: (event: ReactPointerEvent<SVGElement>) => {
				showRowHover(graphRow, event);
			},
			onPointerMove: updateRowHover,
			onPointerOut: (event: ReactPointerEvent<SVGElement>) => {
				if (leftRowHoverTarget(event.currentTarget, event.relatedTarget)) {
					clearRowHover();
				}
			},
			onMouseOver: (event: ReactMouseEvent<SVGElement>) => {
				showRowHover(graphRow, event);
			},
			onMouseMove: updateRowHover,
			onMouseOut: (event: ReactMouseEvent<SVGElement>) => {
				if (leftRowHoverTarget(event.currentTarget, event.relatedTarget)) {
					clearRowHover();
				}
			},
			onFocus: (event: ReactFocusEvent<SVGElement>) => {
				setHighlightedKey(graphRow.key);
				setHover(
					focusHover(
						event.currentTarget,
						graphRow.row.model,
						priceEfficiencyHoverRows(graphRow.row),
						modelName(graphRow.row.model),
					),
				);
			},
			onBlur: clearRowHover,
		};
	}

	return (
		<div
			className={`${styles.chartWrap} ${styles.slopeChartWrap}`}
			style={{ "--chart-max-width": `${width}px` } as CSSProperties}
		>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="Price score to benchmark cost efficiency slope graph"
			>
				<text
					className={styles.slopeRailTitle}
					x={leftX}
					y={18}
					textAnchor="middle"
				>
					{compactLayout ? "Price" : "Price score"}
				</text>
				<text
					className={styles.slopeRailTitle}
					x={rightX}
					y={18}
					textAnchor="middle"
				>
					{compactLayout ? "Cost efficiency" : "Benchmark cost efficiency"}
				</text>
				<line
					className={styles.slopeRail}
					x1={leftX}
					x2={leftX}
					y1={margin.top}
					y2={height - margin.bottom}
				/>
				<line
					className={styles.slopeRail}
					x1={rightX}
					x2={rightX}
					y1={margin.top}
					y2={height - margin.bottom}
				/>
				{graphRows.map((graphRow) => {
					const isHighlighted = highlightedKey === graphRow.key;
					const isDimmed = highlightedKey != null && !isHighlighted;
					const opacity = isDimmed ? 0.16 : isHighlighted ? 0.96 : 0.72;
					return (
						<g key={graphRow.key}>
							<line
								className={styles.slopeLine}
								x1={leftX}
								x2={rightX}
								y1={graphRow.leftY}
								y2={graphRow.rightY}
								stroke={graphRow.color}
								opacity={opacity}
								style={isHighlighted ? { strokeWidth: 2.8 } : undefined}
							/>
							<circle
								className={styles.slopePoint}
								cx={leftX}
								cy={graphRow.leftY}
								r={isHighlighted ? 5.6 : 4.5}
								fill={graphRow.color}
								opacity={opacity}
							/>
							<circle
								className={styles.slopePoint}
								cx={rightX}
								cy={graphRow.rightY}
								r={isHighlighted ? 5.6 : 4.5}
								fill={graphRow.color}
								opacity={opacity}
							/>
							<line
								className={styles.slopeHitLine}
								x1={leftX}
								x2={rightX}
								y1={graphRow.leftY}
								y2={graphRow.rightY}
								aria-label={`Show details for ${modelName(graphRow.row.model)}`}
								tabIndex={0}
								{...rowHoverHandlers(graphRow)}
							/>
						</g>
					);
				})}
				{graphRows.map((graphRow) => {
					const hasLogo = graphRow.logo.length > 0;
					const labelLeaderOffset = compactLayout ? 12 : 22;
					const leftLogoX = leftX - (compactLayout ? 42 : 56);
					const rightScoreX = rightX + (compactLayout ? 14 : 24);
					const rightLogoX = rightX + (compactLayout ? 32 : 48);
					const labelOpacity =
						highlightedKey != null && highlightedKey !== graphRow.key
							? 0.24
							: 1;
					return (
						<g
							key={`label-${graphRow.key}`}
							opacity={labelOpacity}
							{...rowHoverHandlers(graphRow)}
						>
							<rect
								className={styles.slopeHitRect}
								x={leftX - (compactLayout ? 180 : 230)}
								y={graphRow.leftLabelY - 13}
								width={compactLayout ? 168 : 208}
								height={20}
							/>
							<rect
								className={styles.slopeHitRect}
								x={rightX + labelLeaderOffset}
								y={graphRow.rightLabelY - 13}
								width={compactLayout ? 198 : 250}
								height={20}
							/>
							<LabelLeader
								fromX={leftX}
								fromY={graphRow.leftY}
								toX={leftX - labelLeaderOffset}
								toY={graphRow.leftLabelY}
							/>
							<text
								className={styles.slopeLabel}
								x={graphRow.leftNameX}
								y={graphRow.leftLabelY}
								textAnchor="end"
								fill="var(--ink)"
							>
								{graphRow.label}
							</text>
							{hasLogo ? (
								<ProviderLogoMark
									logo={graphRow.logo}
									x={leftLogoX}
									y={graphRow.leftLabelY - 12}
								/>
							) : null}
							<text
								className={styles.slopeLabel}
								x={graphRow.leftScoreX}
								y={graphRow.leftLabelY}
								textAnchor="start"
								fill="var(--ink)"
							>
								{graphRow.row.priceScore.toFixed(0)}
							</text>
							<text
								className={styles.slopeLabel}
								x={rightScoreX}
								y={graphRow.rightLabelY}
								textAnchor="start"
								fill="var(--ink)"
							>
								{graphRow.row.costEfficiencyScore.toFixed(0)}
							</text>
							{hasLogo ? (
								<ProviderLogoMark
									logo={graphRow.logo}
									x={rightLogoX}
									y={graphRow.rightLabelY - 12}
								/>
							) : null}
							<LabelLeader
								fromX={rightX}
								fromY={graphRow.rightY}
								toX={rightX + labelLeaderOffset}
								toY={graphRow.rightLabelY}
							/>
							<text
								className={styles.slopeLabel}
								x={graphRow.rightNameX}
								y={graphRow.rightLabelY}
								textAnchor="start"
								fill="var(--ink)"
							>
								{graphRow.label}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/** Follow the phone breakpoint without changing the server-rendered layout. */
function useCompactChartLayout(): boolean {
	const [compact, setCompact] = useState(false);

	useEffect(() => {
		const query = window.matchMedia(COMPACT_CHART_MEDIA_QUERY);
		const update = () => setCompact(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	return compact;
}

/** Keep effort identity visible while fitting model labels beside both mobile rails. */
function compactSlopeLabel(model: LlmStatsModel): string {
	const label = shortLabel(model);
	const effort = model.reasoning_effort;
	const effortSuffix =
		effort == null
			? ""
			: `·${COMPACT_EFFORT_LABELS[effort] ?? effort.slice(0, 2).toUpperCase()}`;
	const effortLabel = effort == null ? "" : ` (${effort})`;
	const baseLabel =
		effortLabel.length > 0 && label.endsWith(effortLabel)
			? label.slice(0, -effortLabel.length)
			: label;
	const maximumBaseLength = 14 - effortSuffix.length;
	const compactBase =
		baseLabel.length <= maximumBaseLength
			? baseLabel
			: `${baseLabel.slice(0, Math.max(1, maximumBaseLength - 1))}…`;
	return `${compactBase}${effortSuffix}`;
}

function priceEfficiencyRowKey(row: PriceEfficiencyRow, index: number) {
	return modelVariantKey(row.model) || `${row.model.provider}-${index}`;
}

function leftRowHoverTarget(
	currentTarget: SVGElement,
	relatedTarget: EventTarget | null,
) {
	return !(
		relatedTarget instanceof Node && currentTarget.contains(relatedTarget)
	);
}

function ProviderLogoMark({
	logo,
	x,
	y,
}: {
	logo: string;
	x: number;
	y: number;
}) {
	return (
		<image
			href={logo}
			x={x}
			y={y}
			width={16}
			height={16}
			preserveAspectRatio="xMidYMid meet"
		/>
	);
}

function LabelLeader({
	fromX,
	fromY,
	toX,
	toY,
}: {
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
}) {
	if (Math.abs(fromY - toY) < 3) {
		return null;
	}
	return (
		<line
			className={styles.slopeLabelLeader}
			x1={fromX}
			x2={toX}
			y1={fromY}
			y2={toY}
		/>
	);
}

function distributedLabelPositions(
	rows: PriceEfficiencyRow[],
	yForRow: (row: PriceEfficiencyRow) => number,
	minY: number,
	maxY: number,
): Map<PriceEfficiencyRow, number> {
	const sorted = [...rows].sort(
		(left, right) => yForRow(left) - yForRow(right),
	);
	const placements = sorted.map((row) => ({
		row,
		y: Math.min(maxY, Math.max(minY, yForRow(row))),
	}));
	if (placements.length === 0) {
		return new Map();
	}
	for (let index = 1; index < placements.length; index += 1) {
		const previous = placements[index - 1];
		const current = placements[index];
		if (
			previous != null &&
			current != null &&
			current.y - previous.y < SLOPE_LABEL_MIN_GAP
		) {
			current.y = previous.y + SLOPE_LABEL_MIN_GAP;
		}
	}
	const last = placements[placements.length - 1];
	if (last != null && last.y > maxY) {
		last.y = maxY;
	}
	for (let index = placements.length - 2; index >= 0; index -= 1) {
		const current = placements[index];
		const next = placements[index + 1];
		if (
			current != null &&
			next != null &&
			next.y - current.y < SLOPE_LABEL_MIN_GAP
		) {
			current.y = next.y - SLOPE_LABEL_MIN_GAP;
		}
	}
	const first = placements[0];
	if (first != null && first.y < minY) {
		first.y = minY;
	}
	for (let index = 1; index < placements.length; index += 1) {
		const previous = placements[index - 1];
		const current = placements[index];
		if (
			previous != null &&
			current != null &&
			current.y - previous.y < SLOPE_LABEL_MIN_GAP
		) {
			current.y = previous.y + SLOPE_LABEL_MIN_GAP;
		}
	}
	return new Map(placements.map(({ row, y }) => [row, y]));
}
