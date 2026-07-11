/** Price-efficiency comparison panel for the dashboard graph surface. */

import { scaleLinear } from "d3-scale";
import {
	type CSSProperties,
	type FocusEvent as ReactFocusEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useMemo,
	useState,
} from "react";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../../../src/model-atlas/stats/types";
import {
	providerAssetLogo,
	providerName,
	providerPaletteColor,
} from "../shared/providerTheme";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { EmptyChart, SummaryCard } from "./ChartComponents";
import { bestByScore, valueDistribution } from "./chartStats";
import styles from "./graphs.module.css";
import { focusHover, modelKey, modelName, shortLabel } from "./models";
import { Panel } from "./Panel";
import { stableSvgScale } from "./PlotPrimitives";
import {
	type PriceEfficiencyComparisonRow,
	priceEfficiencyComparisonRows,
	priceEfficiencyDeltaDetail,
	priceEfficiencyHoverRows,
	priceEfficiencySummaryDetail,
} from "./priceEfficiencyComparisonModel";
import type { HoverSetter } from "./types";

const SCORE_DOMAIN: [number, number] = [0, 100];

type SlopeGraphRow = {
	row: PriceEfficiencyComparisonRow;
	key: string;
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

export function PriceEfficiencyComparisonPanel({
	benchmarkPortfolio,
	models,
	setHover,
}: {
	benchmarkPortfolio: BenchmarkPortfolio;
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const rows = useMemo(
		() => priceEfficiencyComparisonRows(models, benchmarkPortfolio),
		[benchmarkPortfolio, models],
	);

	if (rows.length === 0) {
		return (
			<Panel
				title="Price vs Cost Efficiency"
				copy="Price score plotted against benchmark task-cost efficiency."
				wide
			>
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
			title="Price vs Cost Efficiency"
			copy="Each point is one model: Price score on the left is the percentile rank of blended price, where blended price comes from unit prices applied through the workflow simulation mix and lower blended price ranks higher. Benchmark cost efficiency on the right compares task cost among similarly scoring benchmark rows and ignores provider price, workflow price value, and quality-per-price signals."
			summary={
				<BoxWhiskerSummary
					label="Benchmark cost efficiency"
					distribution={scoreDistribution}
					domainMax={100}
					formatValue={(value) => value.toFixed(0)}
					showDomainEndpoints
				/>
			}
			wide
		>
			<PriceEfficiencySlopeGraph rows={plottedRows} setHover={setHover} />
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
	rows,
	setHover,
}: {
	rows: PriceEfficiencyComparisonRow[];
	setHover: HoverSetter;
}) {
	const width = 940;
	const height = 940;
	const margin = { top: 34, right: 196, bottom: 30, left: 196 };
	const leftX = 310;
	const rightX = width - 310;
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
	const y = scaleLinear()
		.domain(SCORE_DOMAIN)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const yPoint = stableSvgScale(y);
	const leftLabels = distributedLabelPositions(
		rows,
		(row) => yPoint(row.priceScore),
		margin.top + 18,
		height - margin.bottom,
	);
	const rightLabels = distributedLabelPositions(
		rows,
		(row) => yPoint(row.costEfficiencyScore),
		margin.top + 18,
		height - margin.bottom,
	);
	const graphRows: SlopeGraphRow[] = rows.map((row, index) => {
		const key = priceEfficiencyRowKey(row, index);
		const logo =
			providerAssetLogo(row.model.provider) ||
			(typeof row.model.logo === "string" ? row.model.logo : "");
		const hasLogo = logo.length > 0;
		const leftY = yPoint(row.priceScore);
		const rightY = yPoint(row.costEfficiencyScore);
		return {
			row,
			key,
			color: providerPaletteColor(row.model.provider),
			logo,
			leftY,
			rightY,
			leftLabelY: leftLabels.get(row) ?? leftY,
			rightLabelY: rightLabels.get(row) ?? rightY,
			leftNameX: hasLogo ? leftX - 64 : leftX - 48,
			leftScoreX: hasLogo ? leftX - 32 : leftX - 28,
			rightNameX: hasLogo ? rightX + 72 : rightX + 52,
		};
	});

	function showRowHover(graphRow: SlopeGraphRow, event: SlopeHoverEvent) {
		setHighlightedKey(graphRow.key);
		setHover({
			left: event.clientX,
			top: event.clientY,
			model: modelName(graphRow.row.model),
			provider: providerName(graphRow.row.model),
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
			className={styles.chartWrap}
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
					Price score
				</text>
				<text
					className={styles.slopeRailTitle}
					x={rightX}
					y={18}
					textAnchor="middle"
				>
					Benchmark cost efficiency
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
								x={leftX - 230}
								y={graphRow.leftLabelY - 13}
								width={208}
								height={20}
							/>
							<rect
								className={styles.slopeHitRect}
								x={rightX + 22}
								y={graphRow.rightLabelY - 13}
								width={250}
								height={20}
							/>
							<LabelLeader
								fromX={leftX}
								fromY={graphRow.leftY}
								toX={leftX - 22}
								toY={graphRow.leftLabelY}
							/>
							<text
								className={styles.slopeLabel}
								x={graphRow.leftNameX}
								y={graphRow.leftLabelY}
								textAnchor="end"
								fill="var(--ink)"
							>
								{shortLabel(graphRow.row.model)}
							</text>
							{hasLogo ? (
								<ProviderLogoMark
									logo={graphRow.logo}
									x={leftX - 56}
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
								x={rightX + 24}
								y={graphRow.rightLabelY}
								textAnchor="start"
								fill="var(--ink)"
							>
								{graphRow.row.costEfficiencyScore.toFixed(0)}
							</text>
							{hasLogo ? (
								<ProviderLogoMark
									logo={graphRow.logo}
									x={rightX + 48}
									y={graphRow.rightLabelY - 12}
								/>
							) : null}
							<LabelLeader
								fromX={rightX}
								fromY={graphRow.rightY}
								toX={rightX + 22}
								toY={graphRow.rightLabelY}
							/>
							<text
								className={styles.slopeLabel}
								x={graphRow.rightNameX}
								y={graphRow.rightLabelY}
								textAnchor="start"
								fill="var(--ink)"
							>
								{shortLabel(graphRow.row.model)}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

function priceEfficiencyRowKey(
	row: PriceEfficiencyComparisonRow,
	index: number,
) {
	return modelKey(row.model) || `${row.model.provider}-${index}`;
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
	rows: PriceEfficiencyComparisonRow[],
	yForRow: (row: PriceEfficiencyComparisonRow) => number,
	minY: number,
	maxY: number,
): Map<PriceEfficiencyComparisonRow, number> {
	const minGap = 22;
	const sorted = [...rows].sort(
		(left, right) => yForRow(left) - yForRow(right),
	);
	const placed = sorted.map((row) => ({
		row,
		y: Math.min(maxY, Math.max(minY, yForRow(row))),
	}));
	if (placed.length === 0) {
		return new Map();
	}
	for (let index = 1; index < placed.length; index += 1) {
		const previous = placed[index - 1];
		const current = placed[index];
		if (
			previous != null &&
			current != null &&
			current.y - previous.y < minGap
		) {
			current.y = previous.y + minGap;
		}
	}
	const last = placed[placed.length - 1];
	if (last != null && last.y > maxY) {
		last.y = maxY;
	}
	for (let index = placed.length - 2; index >= 0; index -= 1) {
		const current = placed[index];
		const next = placed[index + 1];
		if (current != null && next != null && next.y - current.y < minGap) {
			current.y = next.y - minGap;
		}
	}
	const first = placed[0];
	if (first != null && first.y < minY) {
		first.y = minY;
	}
	for (let index = 1; index < placed.length; index += 1) {
		const previous = placed[index - 1];
		const current = placed[index];
		if (
			previous != null &&
			current != null &&
			current.y - previous.y < minGap
		) {
			current.y = previous.y + minGap;
		}
	}
	return new Map(placed.map(({ row, y }) => [row, y]));
}
