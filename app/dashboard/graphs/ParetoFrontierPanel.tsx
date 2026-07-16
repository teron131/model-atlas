/** Pareto frontier panel for model intelligence and value tradeoffs. */

import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import type { CSSProperties } from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import { modelVariantKey } from "../shared/modelDisplay";
import { providerPaletteColor } from "../shared/providerTheme";
import { scoreAxisScale } from "./axisScale";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { EmptyChart } from "./ChartComponents";
import { linearBubbleRadius, valueDistribution } from "./chartStats";
import { finite, fmtTooltipMoney, fmtTooltipScore } from "./format";
import styles from "./graphs.module.css";
import { calloutLabelPlacements } from "./labelPlacement";
import { shortLabel } from "./models";
import { Panel } from "./Panel";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	MedianCross,
	ModelPointLabel,
	PlotFrame,
	PointHitTarget,
	plotBoundsFor,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./PlotPrimitives";
import type { HoverRow, HoverSetter } from "./types";

const SCORE_AXIS_FORMAT_OPTIONS = {
	formatTick: (tick: number) => tick.toFixed(0),
};
const PARETO_CHART_WIDTH = 820;

export function ParetoFrontierPanel({
	models,
	setHover,
}: {
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
	const candidates = models
		.filter(
			(model) =>
				finite(model.scores?.intelligence_score) &&
				finite(model.scores?.value_score) &&
				finite(model.cost?.blended_price) &&
				Number(model.cost?.blended_price) > 0,
		)
		.sort(
			(left, right) =>
				Number(left.scores?.value_score) - Number(right.scores?.value_score),
		);

	if (candidates.length === 0) {
		return (
			<Panel
				captureWidth={PARETO_CHART_WIDTH}
				title="Pareto frontier"
				copy="A tradeoff scatter for INTELLIGENCE score versus VALUE score."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const width = PARETO_CHART_WIDTH;
	const height = 500;
	const margin = { top: 26, right: 34, bottom: 68, left: 62 };
	const values = candidates.map((model) => Number(model.scores.value_score));
	const scores = candidates.map((model) => model.scores.intelligence_score);
	const frontierDescending: LlmStatsModel[] = [];
	let bestFromRight = -Infinity;
	for (const model of [...candidates].sort(
		(left, right) =>
			Number(right.scores.value_score) - Number(left.scores.value_score),
	)) {
		const score = model.scores.intelligence_score;
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
	const frontierIds = new Set(frontier.map(modelVariantKey));
	const frontierPath = frontier.reduce((path, model, index) => {
		const nextX = xPoint(Number(model.scores.value_score));
		const nextY = yPoint(model.scores.intelligence_score);
		return index === 0 ? `M${nextX},${nextY}` : `${path} H${nextX} V${nextY}`;
	}, "");
	const plot = plotBoundsFor(width, height, margin);
	const medianX = xPoint(medianValue);
	const medianY = yPoint(medianScore);
	const yTicks = intelligenceAxis.ticks;
	const xTicks = valueAxis.ticks;
	const plottedCandidates = candidates;
	const bubbleValue = (model: LlmStatsModel) =>
		Number(model.scores.intelligence_score) *
		Number(model.scores.agentic_score ?? 0);
	const bubbleRadius = linearBubbleRadius(
		plottedCandidates.map(bubbleValue),
		3,
		10,
	);
	const projectionPoints = plottedCandidates.map((model) => {
		const xValue = Number(model.scores.value_score);
		const yValue = model.scores.intelligence_score;
		return {
			x: xPoint(xValue),
			y: yPoint(yValue),
			xValue,
			yValue,
		};
	});
	const projectionHandlers = cursorHandlers({
		bounds: plot,
		points: projectionPoints,
	});
	const labelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: plottedCandidates.map((model) => ({
			cx: xPoint(Number(model.scores.value_score)),
			cy: yPoint(model.scores.intelligence_score),
			radius: bubbleRadius(bubbleValue(model)),
		})),
		labels: frontier.map((model, index) => ({
			key: modelVariantKey(model),
			label: shortLabel(model),
			cx: xPoint(Number(model.scores.value_score)),
			cy: yPoint(model.scores.intelligence_score),
			radius: bubbleRadius(bubbleValue(model)),
			priority: frontier.length - index,
		})),
		fontSize: 11,
		charWidth: 6.6,
		lineHeight: 13,
	});

	return (
		<Panel
			captureWidth={PARETO_CHART_WIDTH}
			title="Pareto frontier"
			copy="INTELLIGENCE score plotted against VALUE score."
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
					Step line: strongest observed INTELLIGENCE versus VALUE tradeoff
					envelope.
				</>
			}
		>
			<div className={styles.chartToolbar}>
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
					aria-label="Intelligence by Value score scatter plot"
					{...projectionHandlers}
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
						x="Value score"
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
						const cx = xPoint(Number(model.scores.value_score));
						const cy = yPoint(model.scores.intelligence_score);
						const isFrontier = frontierIds.has(modelVariantKey(model));
						const rows: HoverRow[] = [
							[
								"Intelligence score",
								fmtTooltipScore(model.scores.intelligence_score),
							],
							["Agentic score", fmtTooltipScore(model.scores.agentic_score)],
							["Speed score", fmtTooltipScore(model.scores.speed_score)],
							["Value score", fmtTooltipScore(model.scores.value_score)],
							[
								"Blended price",
								fmtTooltipMoney(Number(model.cost?.blended_price)),
							],
						];
						return (
							<g
								className={isFrontier ? styles.frontierPoint : undefined}
								key={modelVariantKey(model) || `${cx}-${cy}`}
							>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(bubbleRadius(bubbleValue(model)))}
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
										xValue: Number(model.scores.value_score),
										yValue: model.scores.intelligence_score,
									}}
									setCursorProjection={setCursorProjection}
								/>
								{isFrontier ? (
									<ModelPointLabel
										model={model}
										cx={cx}
										cy={cy}
										width={width}
										margin={margin}
										height={height}
										placement={labelPlacements.get(modelVariantKey(model))}
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
