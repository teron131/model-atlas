import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import { type CSSProperties, useMemo, useState } from "react";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import { providerPaletteColor } from "../shared/providerTheme";
import { scoreAxisScale } from "./axisScale";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { EmptyChart } from "./ChartComponents";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	MedianCross,
	PlotFrame,
	PointHitTarget,
	PointLabel,
	plotBoundsFor,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./chartPrimitives";
import { linearBubbleRadius, valueDistribution } from "./chartStats";
import { finite, fmtTooltipMoney, fmtTooltipScore } from "./format";
import styles from "./graphs.module.css";
import { calloutLabelPlacements } from "./labelPlacement";
import { modelKey, shortLabel } from "./models";
import { Panel } from "./Panel";
import {
	ProviderEfficiencyView,
	providerEfficiencyRows,
} from "./ProviderEfficiencyView";
import type { HoverRow, HoverSetter } from "./types";

type ParetoViewKey = "models" | "providers";

type ParetoViewToggleProps = {
	activeView: ParetoViewKey;
	modelCount: number;
	providerCount: number;
	onViewChange: (viewKey: ParetoViewKey) => void;
};

const SCORE_AXIS_FORMAT_OPTIONS = {
	formatTick: (tick: number) => tick.toFixed(0),
};

export function ParetoFrontierPanel({
	models,
	setHover,
}: {
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const [viewKey, setViewKey] = useState<ParetoViewKey>("models");
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
	const providerRows = useMemo(() => providerEfficiencyRows(models), [models]);
	const candidates = models
		.filter(
			(model) =>
				finite(model.relative_scores?.intelligence_score) &&
				finite(model.relative_scores?.cost_efficiency_score) &&
				finite(model.cost?.blended_price) &&
				Number(model.cost?.blended_price) > 0,
		)
		.sort(
			(left, right) =>
				Number(left.relative_scores?.cost_efficiency_score) -
				Number(right.relative_scores?.cost_efficiency_score),
		);

	if (candidates.length === 0 && providerRows.length === 0) {
		return (
			<Panel
				title="Pareto frontier"
				copy="A tradeoff scatter for INTELLIGENCE score versus COST EFFICIENCY score."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const activeView =
		(viewKey === "providers" || candidates.length === 0) &&
		providerRows.length > 0
			? "providers"
			: "models";

	if (activeView === "providers") {
		const providerQualityDistribution = valueDistribution(
			providerRows.map((row) => row.quality),
		);
		return (
			<Panel
				title="Pareto frontier"
				copy="Each point is one provider: median quality against median COST EFFICIENCY across the current model set."
				summary={
					<BoxWhiskerSummary
						label="Provider quality"
						distribution={providerQualityDistribution}
						domainMax={100}
						formatValue={(value) => value.toFixed(0)}
						countLabel="providers"
						showDomainEndpoints
					/>
				}
				note={
					<>
						Step line: strongest observed provider quality versus COST
						EFFICIENCY envelope.
					</>
				}
			>
				<div className={styles.chartToolbar}>
					<ParetoViewToggle
						activeView="providers"
						modelCount={candidates.length}
						providerCount={providerRows.length}
						onViewChange={setViewKey}
					/>
					<div className={styles.chartToolbarCaption}>
						<span className={styles.markerKey}>
							<span className={styles.bubbleMarkerKey} />
							Bubble size = eligible model count
						</span>
					</div>
				</div>
				<ProviderEfficiencyView rows={providerRows} setHover={setHover} />
			</Panel>
		);
	}

	const width = 820;
	const height = 500;
	const margin = { top: 26, right: 34, bottom: 68, left: 62 };
	const values = candidates.map((model) =>
		Number(model.relative_scores.cost_efficiency_score),
	);
	const scores = candidates.map(
		(model) => model.relative_scores.intelligence_score,
	);
	const frontierDescending: LlmStatsModel[] = [];
	let bestFromRight = -Infinity;
	for (const model of [...candidates].sort(
		(left, right) =>
			Number(right.relative_scores.cost_efficiency_score) -
			Number(left.relative_scores.cost_efficiency_score),
	)) {
		const score = model.relative_scores.intelligence_score;
		if (score > bestFromRight) {
			frontierDescending.push(model);
			bestFromRight = score;
		}
	}
	const frontier = frontierDescending.reverse();
	const scoreDistribution = valueDistribution(scores);
	const valueAxis = scoreAxisScale(values, SCORE_AXIS_FORMAT_OPTIONS);
	const intelligenceAxis = scoreAxisScale(scores, SCORE_AXIS_FORMAT_OPTIONS);
	const xDomain = valueAxis.domain;
	const yDomain = intelligenceAxis.domain;
	const x = scaleLinear()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLinear()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const medianValue = median(values) ?? xDomain[0];
	const medianScore = median(scores) ?? 50;
	const frontierIds = new Set(frontier.map(modelKey));
	const frontierPath = frontier.reduce((path, model, index) => {
		const nextX = xPoint(Number(model.relative_scores.cost_efficiency_score));
		const nextY = yPoint(model.relative_scores.intelligence_score);
		return index === 0 ? `M${nextX},${nextY}` : `${path} H${nextX} V${nextY}`;
	}, "");
	const plot = plotBoundsFor(width, height, margin);
	const medianX = xPoint(medianValue);
	const medianY = yPoint(medianScore);
	const yTicks = intelligenceAxis.ticks;
	const xTicks = valueAxis.ticks;
	const plottedCandidates = candidates;
	const capabilityBubbleValue = (model: LlmStatsModel) =>
		Number(model.relative_scores.intelligence_score) *
		Number(model.relative_scores.agentic_score ?? 0);
	const capabilityBubbleRadius = linearBubbleRadius(
		plottedCandidates.map(capabilityBubbleValue),
		3,
		10,
	);
	const projectionPoints = plottedCandidates.map((model) => {
		const xValue = Number(model.relative_scores.cost_efficiency_score);
		const yValue = model.relative_scores.intelligence_score;
		return {
			x: xPoint(xValue),
			y: yPoint(yValue),
			xValue,
			yValue,
		};
	});
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		points: projectionPoints,
	});
	const frontierLabelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: plottedCandidates.map((model) => ({
			cx: xPoint(Number(model.relative_scores.cost_efficiency_score)),
			cy: yPoint(model.relative_scores.intelligence_score),
			radius: capabilityBubbleRadius(capabilityBubbleValue(model)),
		})),
		labels: frontier.map((model, index) => ({
			key: modelKey(model),
			label: shortLabel(model),
			cx: xPoint(Number(model.relative_scores.cost_efficiency_score)),
			cy: yPoint(model.relative_scores.intelligence_score),
			radius: capabilityBubbleRadius(capabilityBubbleValue(model)),
			priority: frontier.length - index,
		})),
		fontSize: 11,
		charWidth: 6.6,
		lineHeight: 13,
	});

	return (
		<Panel
			title="Pareto frontier"
			copy="INTELLIGENCE score plotted against COST EFFICIENCY score."
			summary={
				<BoxWhiskerSummary
					label="Intelligence score"
					distribution={scoreDistribution}
					domainMax={100}
					showDomainEndpoints
				/>
			}
			note={
				<>
					Step line: strongest observed INTELLIGENCE versus COST EFFICIENCY
					tradeoff envelope.
				</>
			}
		>
			<div className={styles.chartToolbar}>
				<ParetoViewToggle
					activeView="models"
					modelCount={candidates.length}
					providerCount={providerRows.length}
					onViewChange={setViewKey}
				/>
				<div className={styles.chartToolbarCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = quality
					</span>
				</div>
			</div>
			<div
				className={styles.chartWrap}
				style={{ "--chart-max-width": `${width}px` } as CSSProperties}
			>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="Intelligence by Cost Efficiency score scatter plot"
					{...cursorProjectionHandlers}
				>
					<PlotFrame width={width} height={height} margin={margin} />
					<CursorCapture bounds={plot} />
					<YAxisTicks
						ticks={yTicks}
						yPoint={yPoint}
						x={plot.left}
						format={(tick) => String(tick)}
						keyPrefix="frontier"
					/>
					<XAxisTicks
						ticks={xTicks}
						xPoint={xPoint}
						y={plot.bottom}
						format={(tick) => tick.toFixed(0)}
						keyPrefix="frontier"
					/>
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x="Cost Efficiency score"
						y="Intelligence score"
						xTitleOffset={48}
					/>
					<MedianCross
						x={medianX}
						y={medianY}
						bounds={plot}
						xLabel={medianValue.toFixed(0)}
						yLabel={medianScore.toFixed(0)}
					/>
					<CornerDirectionArrow bounds={plot} corner="upper-right" />
					<CursorProjectionLayer
						projection={cursorProjection}
						bounds={plot}
						xLabel={cursorProjection ? cursorProjection.xValue.toFixed(1) : ""}
						yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
					/>
					{frontierPath ? (
						<path className={styles.frontier} d={frontierPath} />
					) : null}
					{plottedCandidates.map((model) => {
						const cx = xPoint(
							Number(model.relative_scores.cost_efficiency_score),
						);
						const cy = yPoint(model.relative_scores.intelligence_score);
						const isFrontier = frontierIds.has(modelKey(model));
						const rows: HoverRow[] = [
							[
								"Intelligence score",
								fmtTooltipScore(model.relative_scores.intelligence_score),
							],
							[
								"Agentic score",
								fmtTooltipScore(model.relative_scores.agentic_score),
							],
							[
								"Speed score",
								fmtTooltipScore(model.relative_scores.speed_score),
							],
							[
								"Cost Efficiency score",
								fmtTooltipScore(model.relative_scores.cost_efficiency_score),
							],
							[
								"Blend price",
								fmtTooltipMoney(Number(model.cost?.blended_price)),
							],
						];
						return (
							<g
								className={isFrontier ? styles.frontierPoint : undefined}
								key={model.id ?? model.name ?? `${cx}-${cy}`}
							>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(
										capabilityBubbleRadius(capabilityBubbleValue(model)),
									)}
									fill={providerPaletteColor(model.provider)}
									stroke={
										isFrontier
											? "var(--chart-frontier-point-stroke)"
											: "var(--chart-point-stroke)"
									}
									strokeWidth={isFrontier ? 1.4 : 1}
									opacity={1}
								/>
								<PointHitTarget
									cx={cx}
									cy={cy}
									model={model}
									rows={rows}
									setHover={setHover}
									snapProjection={{
										x: cx,
										y: cy,
										xValue: Number(model.relative_scores.cost_efficiency_score),
										yValue: model.relative_scores.intelligence_score,
									}}
									setCursorProjection={setCursorProjection}
								/>
								{isFrontier ? (
									<PointLabel
										model={model}
										cx={cx}
										cy={cy}
										width={width}
										margin={margin}
										height={height}
										placement={frontierLabelPlacements.get(modelKey(model))}
									/>
								) : null}
							</g>
						);
					})}
				</svg>
			</div>
		</Panel>
	);
}

function ParetoViewToggle({
	activeView,
	modelCount,
	providerCount,
	onViewChange,
}: ParetoViewToggleProps) {
	return (
		<fieldset className={styles.metricToggle}>
			<legend className={styles.visuallyHidden}>Pareto frontier view</legend>
			<button
				type="button"
				aria-pressed={activeView === "models"}
				disabled={modelCount === 0}
				onClick={() => onViewChange("models")}
			>
				Models <span>{modelCount}</span>
			</button>
			<button
				type="button"
				aria-pressed={activeView === "providers"}
				disabled={providerCount === 0}
				onClick={() => onViewChange("providers")}
			>
				Providers <span>{providerCount}</span>
			</button>
		</fieldset>
	);
}
