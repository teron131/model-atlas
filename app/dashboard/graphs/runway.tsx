import { median } from "d3-array";
import { scaleLog } from "d3-scale";
import type { CSSProperties } from "react";
import { clamp } from "../../../src/model-atlas/math-utils";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import { providerPaletteColor } from "../shared/providerTheme";
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
import { outputSpeedDistribution } from "./chartStats";
import { finite, fmtCompact, fmtTooltipNumber } from "./format";
import styles from "./graphs.module.css";
import { calloutLabelPlacements } from "./labelPlacement";
import { modelKey, positiveDomain, shortLabel } from "./models";
import { Panel } from "./Panel";
import type { HoverRow, HoverSetter } from "./types";

export function RunwayPanel({
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
				finite(model.context_window?.context) &&
				Number(model.context_window?.context) > 0 &&
				finite(model.speed?.throughput_tokens_per_second_median) &&
				Number(model.speed?.throughput_tokens_per_second_median) > 0,
		)
		.sort(
			(left, right) =>
				right.relative_scores.intelligence_score -
				left.relative_scores.intelligence_score,
		);

	if (candidates.length === 0) {
		return (
			<Panel
				title="Context runway"
				copy="Context runway appears when context and throughput metrics are available under the current filters."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const width = 760;
	const height = 460;
	const margin = { top: 30, right: 64, bottom: 72, left: 66 };
	const xDomain = positiveDomain(
		candidates.map((model) => Number(model.context_window?.context)),
	);
	const outputSpeedSummary = outputSpeedDistribution(candidates);
	const yDomain = positiveDomain(
		candidates.map((model) =>
			Number(model.speed?.throughput_tokens_per_second_median),
		),
	);
	const x = scaleLog()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLog()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const plot = plotBoundsFor(width, height, margin);
	const plottedCandidates = candidates.slice(0, 90);
	const runwayLabelCandidates: LlmStatsModel[] = [];
	const labelContextRatio = 1.12;
	const labelQualityFloor = 55;
	let contextCluster: LlmStatsModel[] = [];
	let clusterStartContext = 0;
	const finishContextCluster = () => {
		if (contextCluster.length === 0) {
			return;
		}
		const winner = contextCluster.reduce((bestModel, model) =>
			Number(model.speed?.throughput_tokens_per_second_median) >
			Number(bestModel.speed?.throughput_tokens_per_second_median)
				? model
				: bestModel,
		);
		runwayLabelCandidates.push(winner);
	};
	for (const model of [...plottedCandidates]
		.filter(
			(candidate) =>
				Number(candidate.relative_scores.intelligence_score) >=
				labelQualityFloor,
		)
		.sort(
			(left, right) =>
				Number(left.context_window?.context) -
				Number(right.context_window?.context),
		)) {
		const context = Number(model.context_window?.context);
		if (
			contextCluster.length > 0 &&
			context / clusterStartContext > labelContextRatio
		) {
			finishContextCluster();
			contextCluster = [];
		}
		if (contextCluster.length === 0) {
			clusterStartContext = context;
		}
		contextCluster.push(model);
	}
	finishContextCluster();
	const maxContextModel = plottedCandidates.reduce<LlmStatsModel | null>(
		(bestModel, model) => {
			if (bestModel == null) {
				return model;
			}
			const contextDelta =
				Number(model.context_window?.context) -
				Number(bestModel.context_window?.context);
			if (contextDelta !== 0) {
				return contextDelta > 0 ? model : bestModel;
			}
			return Number(model.speed?.throughput_tokens_per_second_median) >
				Number(bestModel.speed?.throughput_tokens_per_second_median)
				? model
				: bestModel;
		},
		null,
	);
	if (
		maxContextModel != null &&
		!runwayLabelCandidates.some(
			(model) => modelKey(model) === modelKey(maxContextModel),
		)
	) {
		runwayLabelCandidates.push(maxContextModel);
	}
	const runwayLabels = runwayLabelCandidates
		.sort(
			(left, right) =>
				Number(right.speed?.throughput_tokens_per_second_median) -
				Number(left.speed?.throughput_tokens_per_second_median),
		)
		.reduce<LlmStatsModel[]>((selected, model) => {
			const xPosition = xPoint(Number(model.context_window?.context));
			const yPosition = yPoint(
				Number(model.speed?.throughput_tokens_per_second_median),
			);
			const tooClose = selected.some((other) => {
				const otherX = xPoint(Number(other.context_window?.context));
				const otherY = yPoint(
					Number(other.speed?.throughput_tokens_per_second_median),
				);
				return (
					Math.abs(xPosition - otherX) < 46 && Math.abs(yPosition - otherY) < 26
				);
			});
			if (!tooClose) {
				selected.push(model);
			}
			return selected;
		}, []);
	const labelSet = new Set(runwayLabels.map((model) => modelKey(model)));
	const medianContext =
		median(
			plottedCandidates.map((model) => Number(model.context_window?.context)),
		) ?? xDomain[0];
	const medianThroughput =
		median(
			plottedCandidates.map((model) =>
				Number(model.speed?.throughput_tokens_per_second_median),
			),
		) ?? yDomain[0];
	const projectionPoints = plottedCandidates.map((model) => {
		const xValue = Number(model.context_window?.context);
		const yValue = Number(model.speed?.throughput_tokens_per_second_median);
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
	const runwayRadius = (model: LlmStatsModel) =>
		clamp((model.relative_scores.cost_efficiency_score ?? 25) / 9, 3, 10);
	const runwayLabelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: plottedCandidates.map((model) => ({
			cx: xPoint(Number(model.context_window?.context)),
			cy: yPoint(Number(model.speed?.throughput_tokens_per_second_median)),
			radius: runwayRadius(model),
		})),
		labels: runwayLabels.map((model, index) => ({
			key: modelKey(model),
			label: shortLabel(model),
			cx: xPoint(Number(model.context_window?.context)),
			cy: yPoint(Number(model.speed?.throughput_tokens_per_second_median)),
			radius: runwayRadius(model),
			priority: runwayLabels.length - index,
		})),
	});

	return (
		<Panel
			title="Context runway"
			copy="Context window plotted against median output throughput."
			summary={
				<BoxWhiskerSummary
					label="Output speed"
					distribution={outputSpeedSummary}
					domainMax={outputSpeedSummary.max}
					formatValue={fmtCompact}
					showObservedLabels
				/>
			}
		>
			<div className={styles.frontierLegend}>
				<div className={styles.chartToolbarCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = cost efficiency score
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
					aria-label="Context window by output throughput scatter plot"
					{...cursorProjectionHandlers}
				>
					<PlotFrame width={width} height={height} margin={margin} />
					<CursorCapture bounds={plot} />
					<XAxisTicks
						ticks={[
							32_000, 128_000, 256_000, 400_000, 1_000_000, 2_000_000,
							10_000_000,
						].filter((tick) => tick >= xDomain[0] && tick <= xDomain[1])}
						xPoint={xPoint}
						y={plot.bottom}
						format={fmtCompact}
						keyPrefix="runway"
					/>
					<YAxisTicks
						ticks={[20, 50, 100, 250, 500, 1000, 2500].filter(
							(tick) => tick >= yDomain[0] && tick <= yDomain[1],
						)}
						yPoint={yPoint}
						x={plot.left}
						format={fmtCompact}
						keyPrefix="runway"
					/>
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x="Context window, log scale"
						y="Output tokens per second, log scale"
						xTitleOffset={50}
					/>
					<MedianCross
						x={xPoint(medianContext)}
						y={yPoint(medianThroughput)}
						bounds={plot}
						xLabel={fmtCompact(medianContext)}
						yLabel={`${fmtCompact(medianThroughput)} t/s`}
					/>
					<CornerDirectionArrow bounds={plot} corner="upper-right" />
					<CursorProjectionLayer
						projection={cursorProjection}
						bounds={plot}
						xLabel={cursorProjection ? fmtCompact(cursorProjection.xValue) : ""}
						yLabel={
							cursorProjection
								? `${fmtCompact(cursorProjection.yValue)} t/s`
								: ""
						}
					/>
					{plottedCandidates.map((model) => {
						const cx = xPoint(Number(model.context_window?.context));
						const cy = yPoint(
							Number(model.speed?.throughput_tokens_per_second_median),
						);
						const labeled = labelSet.has(modelKey(model));
						const rows: HoverRow[] = [
							[
								"Context",
								fmtTooltipNumber(Number(model.context_window?.context)),
							],
							[
								"Throughput",
								`${fmtTooltipNumber(
									Number(model.speed?.throughput_tokens_per_second_median),
								)} t/s`,
							],
						];
						return (
							<g key={model.id ?? model.name}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(runwayRadius(model))}
									fill={providerPaletteColor(model.provider)}
									stroke="var(--chart-point-stroke)"
									strokeWidth={1}
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
										xValue: Number(model.context_window?.context),
										yValue: Number(
											model.speed?.throughput_tokens_per_second_median,
										),
									}}
									setCursorProjection={setCursorProjection}
								/>
								{labeled ? (
									<PointLabel
										model={model}
										cx={cx}
										cy={cy}
										width={width}
										margin={margin}
										height={height}
										placement={runwayLabelPlacements.get(modelKey(model))}
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
