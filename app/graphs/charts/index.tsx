"use client";

/** Interactive chart view for selected Model Atlas payloads. */

import { LinePath } from "@visx/shape";
import { extent, max, median, quantile } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import { type CSSProperties, useMemo, useState } from "react";
import type {
	ModelStatsSelectedModel,
	ModelStatsSelectedPayload,
} from "../../../src/model-atlas/llm/model-stats/types";
import type { DeepSWELeaderboardRow } from "../../../src/model-atlas/llm/scrapers/deep-swe";
import { areaScaledRadius, clamp } from "../../../src/model-atlas/math-utils";
import styles from "../charts.module.css";
import {
	type BoxWhiskerDistribution,
	BoxWhiskerSummary,
} from "./BoxWhiskerSummary";
import {
	AxisTitles,
	CursorCapture,
	CursorProjectionLayer,
	DeepSWEPointLabel,
	EmptyChart,
	FilterButton,
	HoverCard,
	MedianCross,
	PlotFrame,
	PointHitTarget,
	PointLabel,
	plotBoundsFor,
	SummaryCard,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./ChartComponents";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtDurationShort,
	fmtMinutes,
	fmtMoney,
	fmtPercent,
	fmtTooltipMoney,
	fmtTooltipNumber,
	fmtTooltipPercent,
	fmtTooltipScore,
	percent,
} from "./format";
import {
	correlationLabel,
	costFilterOptions,
	deepSWECi,
	deepSWELabel,
	deepSweMetricConfig,
	deepSweRows,
	groupBy,
	interactionConfigs,
	modelKey,
	modelLimitOptions,
	modelName,
	positiveDomain,
	providerOptions,
	shortLabel,
	stepPath,
} from "./models";
import { providerColor, providerSlug } from "./providerTheme";
import type {
	DeepSWEChartRow,
	DeepSWEEffortMode,
	HoverRow,
	HoverSetter,
	HoverState,
	InteractionConfig,
	ModelLimit,
	Point,
} from "./types";

type DeepSWEMetricKey = "cost" | "time" | "tokens";
type ALEMetricKey = "cost" | "time" | "tokens";

type HiddenResourceMetric = {
	firstLabel: string;
	secondLabel: string;
	firstValue: (row: DeepSWEChartRow) => number;
	secondValue: (row: DeepSWEChartRow) => number;
};

type ALEChartRow = {
	model: ModelStatsSelectedModel;
	score: number;
	cost: number;
	seconds: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
};

type ALEMetricConfig = {
	label: string;
	shortLabel: string;
	bubbleLabel: string;
	get: (row: ALEChartRow) => number;
	efficiencyLabel: string;
	efficiencyScore: (row: ALEChartRow) => number;
	formatEfficiency: (value: number) => string;
	format: (value: number) => string;
	ticks: number[];
};

function fmtAxisMoney(value: number) {
	const digits = value < 1 ? 2 : Number.isInteger(value) ? 0 : 2;
	const amount =
		digits === 0
			? value.toFixed(0)
			: value.toFixed(digits).replace(/\.?0+$/, "");
	return `$${amount}`;
}

const hiddenResourceMetrics: Record<DeepSWEMetricKey, HiddenResourceMetric> = {
	cost: {
		firstLabel: "time",
		secondLabel: "output tokens",
		firstValue: (row) => row.row.mean_duration_seconds / 60,
		secondValue: (row) => row.row.mean_output_tokens,
	},
	time: {
		firstLabel: "cost",
		secondLabel: "output tokens",
		firstValue: (row) => row.row.mean_cost_usd,
		secondValue: (row) => row.row.mean_output_tokens,
	},
	tokens: {
		firstLabel: "cost",
		secondLabel: "time",
		firstValue: (row) => row.row.mean_cost_usd,
		secondValue: (row) => row.row.mean_duration_seconds / 60,
	},
};

const aleMetricConfig: Record<ALEMetricKey, ALEMetricConfig> = {
	cost: {
		label: "ALE task cost",
		shortLabel: "Cost",
		bubbleLabel: "cost",
		get: (row) => row.cost,
		efficiencyLabel: "Best score per dollar",
		efficiencyScore: (row) => row.score / row.cost,
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtMoney,
		ticks: [10, 25, 50, 100, 250, 500, 1000, 2000],
	},
	time: {
		label: "ALE task time",
		shortLabel: "Time",
		bubbleLabel: "time",
		get: (row) => row.seconds,
		efficiencyLabel: "Best score per day",
		efficiencyScore: (row) => row.score / (row.seconds / 86_400),
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtDurationShort,
		ticks: [100_000, 250_000, 500_000, 1_000_000, 2_000_000],
	},
	tokens: {
		label: "ALE tokens",
		shortLabel: "Tokens",
		bubbleLabel: "tokens",
		get: (row) => row.totalTokens,
		efficiencyLabel: "Best score per 1M tokens",
		efficiencyScore: (row) => row.score / (row.totalTokens / 1_000_000),
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtCompact,
		ticks: [
			50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000,
			2_000_000_000,
		],
	},
};

export function ModelAtlasCharts({
	initialPayload,
}: {
	initialPayload: ModelStatsSelectedPayload | null;
}) {
	const [provider, setProvider] = useState("all");
	const [maxCost, setMaxCost] = useState<"all" | number>("all");
	const [modelLimit, setModelLimit] = useState<ModelLimit>(30);
	const [hover, setHover] = useState<HoverState | null>(null);

	const allModels = useMemo(() => {
		return (initialPayload?.models ?? [])
			.filter(
				(model) =>
					model.name != null && finite(model.relative_scores?.overall_score),
			)
			.sort(
				(left, right) =>
					right.relative_scores.overall_score -
					left.relative_scores.overall_score,
			);
	}, [initialPayload]);

	const providers = useMemo(() => providerOptions(allModels), [allModels]);

	const filteredModels = useMemo(() => {
		return allModels
			.filter((model) => {
				if (provider !== "all" && providerSlug(model.provider) !== provider) {
					return false;
				}
				if (maxCost !== "all") {
					const cost = finiteValue(model.cost?.blended_price);
					return cost != null && cost <= maxCost;
				}
				return true;
			})
			.sort(
				(left, right) =>
					right.relative_scores.overall_score -
					left.relative_scores.overall_score,
			);
	}, [allModels, provider, maxCost]);

	const models = useMemo(() => {
		return modelLimit === "all"
			? filteredModels
			: filteredModels.slice(0, modelLimit);
	}, [filteredModels, modelLimit]);

	const visibleModelLabel =
		modelLimit === "all" || filteredModels.length <= modelLimit
			? `${fmtCompact(filteredModels.length)} shown`
			: `Top ${modelLimit} of ${fmtCompact(filteredModels.length)}`;

	if (!initialPayload || allModels.length === 0) {
		return (
			<main className={styles.atlas}>
				<div className={styles.error}>
					Unable to load the Model Atlas snapshot.
				</div>
			</main>
		);
	}

	return (
		<main className={styles.atlas}>
			<header className={styles.hero}>
				<div>
					<p className={styles.kicker}>Model graphs</p>
					<h1>Model Atlas</h1>
				</div>
			</header>

			<section className={styles.controls} aria-label="Graph filters">
				<div className={styles.controlGroup}>
					<div className={styles.controlLabel}>
						<span>Provider filter</span>
						<b>
							{provider === "all"
								? "All providers"
								: providers.find((item) => item.slug === provider)?.label}
						</b>
					</div>
					<div className={styles.filterRow}>
						<FilterButton
							active={provider === "all"}
							color="#eeeeea"
							label="All"
							count={allModels.length}
							onClick={() => setProvider("all")}
						/>
						{providers.map((option) => (
							<FilterButton
								key={option.slug}
								active={provider === option.slug}
								color={option.color}
								label={option.label}
								count={option.count}
								onClick={() => setProvider(option.slug)}
							/>
						))}
					</div>
				</div>
				<div className={styles.controlGroup}>
					<div className={styles.controlLabel}>
						<span>Max blended cost</span>
						<b>{maxCost === "all" ? "Any cost" : `<= ${fmtMoney(maxCost)}`}</b>
					</div>
					<div className={`${styles.filterRow} ${styles.costFilterRow}`}>
						{costFilterOptions.map((option) => (
							<button
								key={String(option)}
								type="button"
								className={styles.costFilterButton}
								aria-pressed={maxCost === option}
								onClick={() => setMaxCost(option)}
							>
								<span>
									{option === "all" ? "Any" : `<= ${fmtMoney(option)}`}
								</span>
							</button>
						))}
					</div>
				</div>
				<div className={styles.controlGroup}>
					<div className={styles.controlLabel}>
						<span>Model count</span>
						<b>{visibleModelLabel}</b>
					</div>
					<div className={`${styles.filterRow} ${styles.costFilterRow}`}>
						{modelLimitOptions.map((option) => (
							<button
								key={String(option)}
								type="button"
								className={styles.costFilterButton}
								aria-pressed={modelLimit === option}
								onClick={() => setModelLimit(option)}
							>
								<span>{option === "all" ? "All" : `Top ${option}`}</span>
							</button>
						))}
					</div>
				</div>
			</section>

			{models.length === 0 ? (
				<div className={styles.error}>
					No models match the current provider and cost filters.
				</div>
			) : (
				<section className={styles.sectionGrid}>
					<FrontierPanel models={models} setHover={setHover} />
					<DeepSwePanel
						models={models}
						rows={initialPayload.deep_swe?.rows ?? []}
						setHover={setHover}
					/>
					<ALEPanel models={models} setHover={setHover} />
					<InteractionMatrix models={models} setHover={setHover} />
					<RunwayPanel models={models} setHover={setHover} />
				</section>
			)}

			{hover ? <HoverCard hover={hover} /> : null}
		</main>
	);
}

function Panel({
	kicker,
	title,
	copy,
	chips,
	summary,
	children,
	note,
	wide = false,
}: {
	kicker: string;
	title: string;
	copy?: string;
	chips?: string[];
	summary?: React.ReactNode;
	children: React.ReactNode;
	note?: React.ReactNode;
	wide?: boolean;
}) {
	const showChips = chips != null && chips.length > 0;

	return (
		<article className={`${styles.panel} ${wide ? styles.wide : ""}`}>
			<div className={styles.panelHead}>
				<div className={styles.panelMeta}>
					<p className={styles.chartKicker}>{kicker}</p>
					{summary != null || showChips ? (
						<div className={styles.panelSide}>
							{showChips ? (
								<div className={styles.chips}>
									{chips.map((chip) => (
										<span key={chip} className={styles.chip}>
											{chip}
										</span>
									))}
								</div>
							) : null}
							{summary}
						</div>
					) : null}
				</div>
				<div className={styles.panelTitleBlock}>
					<h2>{title}</h2>
					{copy ? <p className={styles.panelCopy}>{copy}</p> : null}
				</div>
			</div>
			{children}
			{note ? <div className={styles.note}>{note}</div> : null}
		</article>
	);
}

function valueDistribution(values: number[]): BoxWhiskerDistribution {
	const sortedValues = values
		.filter(finite)
		.sort((left, right) => left - right);

	return {
		count: sortedValues.length,
		min: sortedValues[0] ?? 0,
		q1: quantile(sortedValues, 0.25) ?? 0,
		median: quantile(sortedValues, 0.5) ?? 0,
		q3: quantile(sortedValues, 0.75) ?? 0,
		max: sortedValues[sortedValues.length - 1] ?? 0,
	};
}

function deepSWEAccuracyDistribution(
	rows: DeepSWEChartRow[],
): BoxWhiskerDistribution {
	return valueDistribution(
		rows.map((row) => percent(row.row.pass_at_1)).filter(finite),
	);
}

function intelligenceDistribution(
	models: ModelStatsSelectedModel[],
): BoxWhiskerDistribution {
	return valueDistribution(
		models
			.map((model) => finiteValue(model.relative_scores?.intelligence_score))
			.filter(finite),
	);
}

function outputSpeedDistribution(
	models: ModelStatsSelectedModel[],
): BoxWhiskerDistribution {
	return valueDistribution(
		models
			.map((model) =>
				finiteValue(model.speed?.throughput_tokens_per_second_median),
			)
			.filter(finite),
	);
}

function aleRows(models: ModelStatsSelectedModel[]): ALEChartRow[] {
	return models
		.map((model) => {
			const score = percent(model.evaluations?.agents_last_exam);
			const task = model.task_metrics?.agents_last_exam;
			const cost = finiteValue(task?.cost);
			const seconds = finiteValue(task?.seconds);
			const inputTokens = finiteValue(task?.input_tokens);
			const outputTokens = finiteValue(task?.output_tokens);
			const totalTokens =
				inputTokens != null && outputTokens != null
					? inputTokens + outputTokens
					: null;
			return score != null &&
				cost != null &&
				cost > 0 &&
				seconds != null &&
				seconds > 0 &&
				inputTokens != null &&
				inputTokens > 0 &&
				outputTokens != null &&
				outputTokens > 0 &&
				totalTokens != null &&
				totalTokens > 0
				? {
						model,
						score,
						cost,
						seconds,
						inputTokens,
						outputTokens,
						totalTokens,
					}
				: null;
		})
		.filter((row): row is ALEChartRow => row != null)
		.sort((left, right) => right.score - left.score);
}

function aleScoreDistribution(rows: ALEChartRow[]): BoxWhiskerDistribution {
	return valueDistribution(rows.map((row) => row.score));
}

function hiddenResourceValue(
	row: DeepSWEChartRow,
	metric: HiddenResourceMetric,
) {
	return metric.firstValue(row) * metric.secondValue(row);
}

function inverseLogBubbleRadius(values: number[]) {
	const minRadius = 5;
	const maxRadius = 16;
	const logs = values
		.filter((value) => finite(value) && value > 0)
		.map((value) => Math.log(value));
	const minLog = Math.min(...logs);
	const maxLog = Math.max(...logs);
	const span = maxLog - minLog;

	return (value: number) => {
		if (!finite(value) || value <= 0) {
			return minRadius;
		}
		if (!finite(span) || span === 0) {
			return areaScaledRadius(minRadius, maxRadius, 0.5);
		}
		const normalized = clamp((Math.log(value) - minLog) / span, 0, 1);
		return areaScaledRadius(minRadius, maxRadius, 1 - normalized);
	};
}

function aleBubbleValue(row: ALEChartRow, selectedMetric: ALEMetricKey) {
	return (Object.keys(aleMetricConfig) as ALEMetricKey[])
		.filter((key) => key !== selectedMetric)
		.map((key) => aleMetricConfig[key].get(row))
		.filter((value) => finite(value) && value > 0)
		.reduce((product, value) => product * value, 1);
}

function aleBubbleLabel(selectedMetric: ALEMetricKey) {
	return (Object.keys(aleMetricConfig) as ALEMetricKey[])
		.filter((key) => key !== selectedMetric)
		.map((key) => aleMetricConfig[key].bubbleLabel)
		.join(" x ");
}

function FrontierPanel({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers } = useCursorProjection();
	const candidates = models
		.filter(
			(model) =>
				finite(model.relative_scores?.intelligence_score) &&
				finite(model.cost?.blended_price) &&
				Number(model.cost?.blended_price) > 0,
		)
		.sort(
			(left, right) =>
				Number(left.cost?.blended_price) - Number(right.cost?.blended_price),
		);

	if (candidates.length === 0) {
		return (
			<Panel
				kicker="Graph 01 / Pareto frontier"
				title="Pareto frontier"
				copy="A tradeoff scatter for intelligence versus price."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const frontier: ModelStatsSelectedModel[] = [];
	let best = -Infinity;
	for (const model of candidates) {
		const score = model.relative_scores.intelligence_score;
		if (score > best) {
			frontier.push(model);
			best = score;
		}
	}

	const width = 820;
	const height = 500;
	const margin = { top: 26, right: 76, bottom: 68, left: 76 };
	const costs = candidates.map((model) => Number(model.cost?.blended_price));
	const scores = candidates.map(
		(model) => model.relative_scores.intelligence_score,
	);
	const scoreDistribution = valueDistribution(scores);
	const xDomain = positiveDomain(costs);
	const yMin = Math.max(0, Math.min(...scores) - 4);
	const x = scaleLog()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLinear()
		.domain([yMin, 102])
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const medianPrice = median(costs) ?? xDomain[0];
	const medianScore = median(scores) ?? 50;
	const frontierIds = new Set(frontier.map(modelKey));
	const frontierPath = stepPath(frontier, xPoint, yPoint);
	const frontierGuideLine = line<ModelStatsSelectedModel>()
		.x((model) => xPoint(Number(model.cost?.blended_price)))
		.y((model) => yPoint(model.relative_scores.intelligence_score));
	const guidePath = frontierGuideLine(frontier);
	const plot = plotBoundsFor(width, height, margin);
	const medianX = xPoint(medianPrice);
	const medianY = yPoint(medianScore);
	const yTickStart = Math.ceil(yMin / 5) * 5;
	const yTicks = Array.from(
		{ length: Math.floor((100 - yTickStart) / 5) + 1 },
		(_, index) => yTickStart + index * 5,
	);
	const xTickCandidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
	const xTicks = xTickCandidates.filter(
		(tick) => tick >= xDomain[0] && tick <= xDomain[1],
	);
	const plottedCandidates = candidates.slice(0, 95);
	const projectionPoints = plottedCandidates.map((model) => {
		const xValue = Number(model.cost?.blended_price);
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
		xInvert: x.invert,
		yInvert: y.invert,
		points: projectionPoints,
	});

	return (
		<Panel
			kicker="Graph 01 / Pareto frontier"
			title="Pareto frontier"
			copy="Intelligence score plotted against blended price per 1M tokens."
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
					Step line: highest observed intelligence score available at or below
					each price level.
				</>
			}
		>
			<div className={styles.frontierLegend}>
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble = agentic score
					</span>
				</div>
			</div>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="Capability per blended dollar scatter plot"
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
						format={fmtAxisMoney}
						keyPrefix="frontier"
					/>
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x="Blended price per 1M tokens, log scale"
						y="Intelligence score"
						xTitleOffset={48}
					/>
					<MedianCross
						x={medianX}
						y={medianY}
						bounds={plot}
						xLabel={fmtAxisMoney(medianPrice)}
						yLabel={medianScore.toFixed(0)}
					/>
					<text
						className={styles.quadrantLabel}
						x={plot.left + 16}
						y={plot.top + 40}
					>
						High value
					</text>
					<text
						className={styles.quadrantLabel}
						x={medianX + 18}
						y={plot.bottom - 20}
					>
						Costly ceiling
					</text>
					<CursorProjectionLayer
						projection={cursorProjection}
						bounds={plot}
						xLabel={
							cursorProjection ? fmtTooltipMoney(cursorProjection.xValue) : ""
						}
						yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
					/>
					{guidePath ? (
						<path className={styles.frontierGuide} d={guidePath} />
					) : null}
					{frontierPath ? (
						<path className={styles.frontier} d={frontierPath} />
					) : null}
					{plottedCandidates.map((model) => {
						const cx = xPoint(Number(model.cost?.blended_price));
						const cy = yPoint(model.relative_scores.intelligence_score);
						const isFrontier = frontierIds.has(modelKey(model));
						const rows: HoverRow[] = [
							[
								"Intelligence",
								fmtTooltipScore(model.relative_scores.intelligence_score),
							],
							["Agentic", fmtTooltipScore(model.relative_scores.agentic_score)],
							["Blend", fmtTooltipMoney(Number(model.cost?.blended_price))],
							["Overall", fmtTooltipScore(model.relative_scores.overall_score)],
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
										clamp(
											(model.relative_scores.agentic_score ?? 35) / 11,
											3,
											9,
										),
									)}
									fill={providerColor(model.provider)}
									stroke={
										isFrontier ? "rgba(255, 112, 92, 0.74)" : "rgba(8,9,9,0.7)"
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
								/>
								{isFrontier ? (
									<PointLabel
										model={model}
										cx={cx}
										cy={cy}
										width={width}
										margin={margin}
										height={height}
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

function DeepSwePanel({
	models,
	rows,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	rows: DeepSWELeaderboardRow[];
	setHover: HoverSetter;
}) {
	const [metricKey, setMetricKey] = useState<DeepSWEMetricKey>("cost");
	const [effortMode, setEffortMode] = useState<DeepSWEEffortMode>("best");
	const { cursorProjection, cursorHandlers } = useCursorProjection();
	const allEfforts = deepSweRows(models, rows, "all");
	const bestEfforts = deepSweRows(models, rows, "best");
	const deep = effortMode === "all" ? allEfforts : bestEfforts;

	if (deep.length === 0) {
		return (
			<Panel
				kicker="Graph 02 / DeepSWE efficiency axis"
				title="DeepSWE efficiency axis"
				copy="DeepSWE rows appear when the current filters include models with DeepSWE task metrics."
			>
				<EmptyChart message="No DeepSWE rows match the current filters." />
			</Panel>
		);
	}

	const metric = deepSweMetricConfig[metricKey];
	const width = 760;
	const height = 490;
	const margin = { top: 28, right: 78, bottom: 70, left: 76 };
	const metricValues = deep.map(metric.get).filter(finite);
	const xDomain = positiveDomain(metricValues);
	const passMax = max(deep, (row) => percent(row.row.pass_at_1)) ?? 75;
	const yTicks = [0, 15, 30, 45, 60, 75];
	const xTicks = metric.ticks.filter(
		(tick) => tick >= xDomain[0] && tick <= xDomain[1],
	);
	const x = scaleLog()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const yDomain: [number, number] = [0, Math.max(75, passMax + 4)];
	const y = scaleLinear()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const plot = plotBoundsFor(width, height, margin);
	const markerMetrics = hiddenResourceMetrics[metricKey];
	const bubbleValue = (row: DeepSWEChartRow) =>
		hiddenResourceValue(row, markerMetrics);
	const bubbleRadius = inverseLogBubbleRadius(deep.map(bubbleValue));
	const leader = deep[0] as DeepSWEChartRow;
	const bestAxis =
		[...deep].sort(
			(left, right) =>
				metric.efficiencyScore(right) - metric.efficiencyScore(left),
		)[0] ?? leader;
	const leanAboveFloor =
		[...deep]
			.filter((row) => Number(percent(row.row.pass_at_1)) >= 20)
			.sort((left, right) => metric.get(left) - metric.get(right))[0] ??
		bestAxis;
	const labeledRows = new Set([leader, bestAxis, leanAboveFloor]);
	const accuracyDistribution = deepSWEAccuracyDistribution(bestEfforts);
	const effortLines =
		effortMode === "all"
			? [...groupBy(deep, (row) => row.modelKey).values()]
					.filter((modelRows) => modelRows.length > 1)
					.map((modelRows) =>
						[...modelRows].sort(
							(left, right) => metric.get(left) - metric.get(right),
						),
					)
			: [];
	const plotRows = [...deep].sort(
		(left, right) =>
			Number(percent(left.row.pass_at_1)) -
			Number(percent(right.row.pass_at_1)),
	);
	const medianMetric = median(metricValues) ?? xDomain[0];
	const medianAccuracy =
		median(deep.map((row) => Number(percent(row.row.pass_at_1)))) ?? 0;
	const projectionPoints = plotRows.map((row) => {
		const xValue = metric.get(row);
		const yValue = Number(percent(row.row.pass_at_1));
		return {
			x: xPoint(xValue),
			y: yPoint(yValue),
			xValue,
			yValue,
		};
	});
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		xInvert: x.invert,
		yInvert: y.invert,
		points: projectionPoints,
	});

	return (
		<Panel
			kicker="Graph 02 / DeepSWE efficiency axis"
			title="DeepSWE efficiency axis"
			copy="DeepSWE accuracy plotted against cost, runtime, or output tokens. Bigger bubbles mark lower use of the other two resources."
			summary={
				<BoxWhiskerSummary
					label="DeepSWE accuracy"
					distribution={accuracyDistribution}
					domainMax={100}
					formatValue={(value) => `${value.toFixed(0)}%`}
					showDomainEndpoints
				/>
			}
		>
			<div className={styles.resourceToolbar}>
				<fieldset className={styles.metricToggle}>
					<legend className={styles.visuallyHidden}>
						DeepSWE efficiency axis
					</legend>
					{Object.entries(deepSweMetricConfig).map(([key, config]) => (
						<button
							key={key}
							type="button"
							aria-pressed={key === metricKey}
							onClick={() => setMetricKey(key as DeepSWEMetricKey)}
						>
							{config.shortLabel}
						</button>
					))}
				</fieldset>
				<fieldset className={styles.metricToggle}>
					<legend className={styles.visuallyHidden}>DeepSWE effort rows</legend>
					{[
						["best", "Best"],
						["all", "All efforts"],
					].map(([key, label]) => (
						<button
							key={key}
							type="button"
							aria-pressed={effortMode === key}
							onClick={() => setEffortMode(key as DeepSWEEffortMode)}
						>
							{label}
						</button>
					))}
				</fieldset>
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble = lower ({markerMetrics.firstLabel} x{" "}
						{markerMetrics.secondLabel})
					</span>
				</div>
			</div>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="DeepSWE accuracy by efficiency axis scatter plot"
					{...cursorProjectionHandlers}
				>
					<PlotFrame width={width} height={height} margin={margin} />
					<CursorCapture bounds={plot} />
					<YAxisTicks
						ticks={yTicks}
						yPoint={yPoint}
						x={plot.left}
						format={(tick) => `${tick}%`}
						keyPrefix="deep-swe"
					/>
					<XAxisTicks
						ticks={xTicks}
						xPoint={xPoint}
						y={plot.bottom}
						format={metric.format}
						keyPrefix="deep-swe"
					/>
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x={`${metric.label}, log scale`}
						y="DeepSWE accuracy"
						xTitleOffset={50}
					/>
					<MedianCross
						x={xPoint(medianMetric)}
						y={yPoint(medianAccuracy)}
						bounds={plot}
						xLabel={metric.format(medianMetric)}
						yLabel={`${medianAccuracy.toFixed(0)}%`}
					/>
					<CursorProjectionLayer
						projection={cursorProjection}
						bounds={plot}
						xLabel={
							cursorProjection ? metric.format(cursorProjection.xValue) : ""
						}
						yLabel={
							cursorProjection ? `${cursorProjection.yValue.toFixed(1)}%` : ""
						}
					/>
					{effortLines.map((modelRows) => {
						const firstRow = modelRows[0] as DeepSWEChartRow;
						return (
							<LinePath<DeepSWEChartRow>
								key={firstRow.modelKey}
								className={styles.deepSweEffortLine}
								data={modelRows}
								x={(row) => xPoint(metric.get(row))}
								y={(row) => yPoint(Number(percent(row.row.pass_at_1)))}
								style={
									{
										"--line-color": providerColor(firstRow.model.provider),
									} as CSSProperties
								}
							/>
						);
					})}
					{plotRows.map((row) => {
						const axisValue = metric.get(row);
						const score = Number(percent(row.row.pass_at_1));
						const cx = xPoint(axisValue);
						const cy = yPoint(score);
						const hoverTitle = deepSWELabel(row, true);
						const rows: HoverRow[] = [
							["DeepSWE", fmtTooltipPercent(row.row.pass_at_1)],
							["Cost", fmtTooltipMoney(row.row.mean_cost_usd)],
							["Time", fmtMinutes(row.row.mean_duration_seconds)],
							["Output tokens", fmtTooltipNumber(row.row.mean_output_tokens)],
							["95% CI", deepSWECi(row.row)],
						];
						return (
							<g key={row.row.config ?? `${row.modelKey}-${row.effortLabel}`}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(bubbleRadius(bubbleValue(row)))}
									fill={providerColor(row.model.provider)}
									stroke="rgba(8,9,9,0.7)"
									strokeWidth={1}
									opacity={1}
								/>
								<PointHitTarget
									cx={cx}
									cy={cy}
									model={row.model}
									rows={rows}
									setHover={setHover}
									hoverTitle={hoverTitle}
								/>
							</g>
						);
					})}
					{plotRows.map((row) => {
						const axisValue = metric.get(row);
						const score = Number(percent(row.row.pass_at_1));
						const cx = xPoint(axisValue);
						const cy = yPoint(score);
						return labeledRows.has(row) ? (
							<DeepSWEPointLabel
								key={`label-${row.row.config ?? row.modelKey}`}
								label={deepSWELabel(row, false)}
								cx={cx}
								cy={cy}
								width={width}
								margin={margin}
								height={height}
								xOffset={bubbleRadius(bubbleValue(row)) + 8}
							/>
						) : null;
					})}
				</svg>
			</div>
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={`${deepSWELabel(leader, effortMode === "all")} - ${fmtPercent(leader.row.pass_at_1)}`}
					detail={`${fmtMoney(leader.row.mean_cost_usd)} / ${fmtMinutes(leader.row.mean_duration_seconds)}`}
				/>
				<SummaryCard
					label={metric.efficiencyLabel}
					value={deepSWELabel(bestAxis, effortMode === "all")}
					detail={metric.formatEfficiency(metric.efficiencyScore(bestAxis))}
				/>
				<SummaryCard
					label="Leanest above 20%"
					value={deepSWELabel(leanAboveFloor, effortMode === "all")}
					detail={metric.format(metric.get(leanAboveFloor))}
				/>
			</div>
		</Panel>
	);
}

function ALEPanel({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
	const [metricKey, setMetricKey] = useState<ALEMetricKey>("cost");
	const { cursorProjection, cursorHandlers } = useCursorProjection();
	const rows = aleRows(models);

	if (rows.length === 0) {
		return (
			<Panel
				kicker="Graph 03 / ALE efficiency axis"
				title="ALE efficiency axis"
				copy="ALE rows appear when the current filters include models with Agents' Last Exam task metrics."
			>
				<EmptyChart message="No ALE rows match the current filters." />
			</Panel>
		);
	}

	const metric = aleMetricConfig[metricKey];
	const width = 760;
	const height = 490;
	const margin = { top: 28, right: 78, bottom: 70, left: 76 };
	const metricValues = rows.map(metric.get).filter(finite);
	const xDomain = positiveDomain(metricValues);
	const scoreMax = max(rows, (row) => row.score) ?? 50;
	const yTicks = [0, 10, 20, 30, 40, 50];
	const xTicks = metric.ticks.filter(
		(tick) => tick >= xDomain[0] && tick <= xDomain[1],
	);
	const x = scaleLog()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const yDomain: [number, number] = [0, Math.max(50, scoreMax + 4)];
	const y = scaleLinear()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const plot = plotBoundsFor(width, height, margin);
	const bubbleValue = (row: ALEChartRow) => aleBubbleValue(row, metricKey);
	const bubbleRadius = inverseLogBubbleRadius(rows.map(bubbleValue));
	const leader = rows[0] as ALEChartRow;
	const bestAxis =
		[...rows].sort(
			(left, right) =>
				metric.efficiencyScore(right) - metric.efficiencyScore(left),
		)[0] ?? leader;
	const leanAboveFloor =
		[...rows]
			.filter((row) => row.score >= 10)
			.sort((left, right) => metric.get(left) - metric.get(right))[0] ??
		bestAxis;
	const labeledRows = new Set([leader, bestAxis, leanAboveFloor]);
	const scoreDistribution = aleScoreDistribution(rows);
	const plotRows = [...rows].sort((left, right) => left.score - right.score);
	const bubbleLabel = aleBubbleLabel(metricKey);
	const medianMetric = median(metricValues) ?? xDomain[0];
	const medianScore = median(rows.map((row) => row.score)) ?? 0;
	const projectionPoints = plotRows.map((row) => {
		const xValue = metric.get(row);
		return {
			x: xPoint(xValue),
			y: yPoint(row.score),
			xValue,
			yValue: row.score,
		};
	});
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		xInvert: x.invert,
		yInvert: y.invert,
		points: projectionPoints,
	});

	return (
		<Panel
			kicker="Graph 03 / ALE efficiency axis"
			title="ALE efficiency axis"
			copy="Agents' Last Exam score plotted against task cost, time, or total tokens. Bigger bubbles mark lower use of the other two resources."
			summary={
				<BoxWhiskerSummary
					label="ALE score"
					distribution={scoreDistribution}
					domainMax={100}
					formatValue={(value) => `${value.toFixed(0)}%`}
					showDomainEndpoints
				/>
			}
		>
			<div className={styles.resourceToolbar}>
				<fieldset className={styles.metricToggle}>
					<legend className={styles.visuallyHidden}>ALE efficiency axis</legend>
					{Object.entries(aleMetricConfig).map(([key, config]) => (
						<button
							key={key}
							type="button"
							aria-pressed={key === metricKey}
							onClick={() => setMetricKey(key as ALEMetricKey)}
						>
							{config.shortLabel}
						</button>
					))}
				</fieldset>
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble = lower ({bubbleLabel})
					</span>
				</div>
			</div>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="Agents' Last Exam score by efficiency axis scatter plot"
					{...cursorProjectionHandlers}
				>
					<PlotFrame width={width} height={height} margin={margin} />
					<CursorCapture bounds={plot} />
					<YAxisTicks
						ticks={yTicks}
						yPoint={yPoint}
						x={plot.left}
						format={(tick) => `${tick}%`}
						keyPrefix="ale"
					/>
					<XAxisTicks
						ticks={xTicks}
						xPoint={xPoint}
						y={plot.bottom}
						format={metric.format}
						keyPrefix="ale"
					/>
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x={`${metric.label}, log scale`}
						y="ALE score"
						xTitleOffset={50}
					/>
					<MedianCross
						x={xPoint(medianMetric)}
						y={yPoint(medianScore)}
						bounds={plot}
						xLabel={metric.format(medianMetric)}
						yLabel={`${medianScore.toFixed(0)}%`}
					/>
					<CursorProjectionLayer
						projection={cursorProjection}
						bounds={plot}
						xLabel={
							cursorProjection ? metric.format(cursorProjection.xValue) : ""
						}
						yLabel={
							cursorProjection ? `${cursorProjection.yValue.toFixed(1)}%` : ""
						}
					/>
					{plotRows.map((row) => {
						const axisValue = metric.get(row);
						const cx = xPoint(axisValue);
						const cy = yPoint(row.score);
						const rows: HoverRow[] = [
							["ALE score", `${row.score.toFixed(1)}%`],
							["Cost", fmtTooltipMoney(row.cost)],
							["Time", fmtDurationShort(row.seconds)],
							["Total tokens", fmtTooltipNumber(row.totalTokens)],
							["Input tokens", fmtTooltipNumber(row.inputTokens)],
							["Output tokens", fmtTooltipNumber(row.outputTokens)],
						];
						return (
							<g key={row.model.id ?? row.model.name}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(bubbleRadius(bubbleValue(row)))}
									fill={providerColor(row.model.provider)}
									stroke="rgba(8,9,9,0.7)"
									strokeWidth={1}
									opacity={1}
								/>
								<PointHitTarget
									cx={cx}
									cy={cy}
									model={row.model}
									rows={rows}
									setHover={setHover}
								/>
							</g>
						);
					})}
					{plotRows.map((row) => {
						const axisValue = metric.get(row);
						const cx = xPoint(axisValue);
						const cy = yPoint(row.score);
						return labeledRows.has(row) ? (
							<DeepSWEPointLabel
								key={`ale-label-${row.model.id ?? row.model.name}`}
								label={shortLabel(row.model)}
								cx={cx}
								cy={cy}
								width={width}
								margin={margin}
								height={height}
								xOffset={bubbleRadius(bubbleValue(row)) + 8}
							/>
						) : null;
					})}
				</svg>
			</div>
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={`${modelName(leader.model)} - ${leader.score.toFixed(1)}%`}
					detail={`${fmtMoney(leader.cost)} / ${fmtDurationShort(leader.seconds)}`}
				/>
				<SummaryCard
					label={metric.efficiencyLabel}
					value={modelName(bestAxis.model)}
					detail={metric.formatEfficiency(metric.efficiencyScore(bestAxis))}
				/>
				<SummaryCard
					label="Leanest above 10%"
					value={modelName(leanAboveFloor.model)}
					detail={metric.format(metric.get(leanAboveFloor))}
				/>
			</div>
		</Panel>
	);
}

function InteractionMatrix({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
	const distribution = intelligenceDistribution(models);

	return (
		<Panel
			kicker="Graph 04 / Intelligence interaction matrix"
			title="Intelligence interaction matrix"
			copy="Small multiples plotting intelligence against price, speed, response time, context, task cost, and coding reliability."
			summary={
				<BoxWhiskerSummary
					label="Intelligence score"
					distribution={distribution}
					domainMax={100}
					showDomainEndpoints
				/>
			}
			wide
			note={
				<>
					Each plot uses intelligence on the vertical axis. The corner label
					names the tradeoff emphasized in that plot.
				</>
			}
		>
			<div className={styles.interactionGrid}>
				{interactionConfigs.map((config) => (
					<InteractionPlot
						key={config.key}
						models={models}
						config={config}
						setHover={setHover}
					/>
				))}
			</div>
		</Panel>
	);
}

function InteractionPlot({
	models,
	config,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	config: InteractionConfig;
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers } = useCursorProjection();
	const data = models
		.map((model) => ({
			model,
			x: config.get(model),
			y: finiteValue(model.relative_scores?.intelligence_score),
			overall: finiteValue(model.relative_scores?.overall_score),
			agentic: finiteValue(model.relative_scores?.agentic_score),
		}))
		.filter(
			(point): point is Point =>
				point.x != null && point.y != null && (!config.log || point.x > 0),
		);

	if (data.length === 0) {
		return (
			<div className={styles.interactionPlot}>
				<div className={styles.interactionPlotHead}>
					<div className={styles.interactionTitle}>{config.title}</div>
					<div className={styles.interactionBadge}>r --</div>
				</div>
				<EmptyChart />
			</div>
		);
	}

	const width = 430;
	const height = 315;
	const margin = { top: 22, right: 50, bottom: 64, left: 62 };
	const [rawMin, rawMax] = extent(data, (point) => point.x);
	const xMin = rawMin ?? 1;
	const xMax = rawMax ?? xMin * 2;
	const xSpan = xMax - xMin || Math.max(1, xMax);
	const xDomain: [number, number] = config.log
		? positiveDomain(data.map((point) => point.x))
		: [Math.min(0, xMin - xSpan * 0.05), xMax + xSpan * 0.05];
	const yValues = data.map((point) => point.y);
	const yDomain: [number, number] = [
		Math.min(0, Math.floor((Math.min(...yValues) - 6) / 10) * 10),
		Math.max(105, Math.ceil((Math.max(...yValues) + 6) / 10) * 10),
	];
	const x = (config.log ? scaleLog() : scaleLinear())
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLinear()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const plot = plotBoundsFor(width, height, margin);
	const transformX = (value: number) =>
		config.log ? Math.log10(Math.max(value, 0.001)) : value;
	const txMin = transformX(xDomain[0]);
	const txMax = transformX(xDomain[1]);
	const normalizedX = (value: number) =>
		(transformX(value) - txMin) / (txMax - txMin || 1);
	const cornerScore = (point: Point) => {
		const xFit = config.lowerBetter
			? 1 - normalizedX(point.x)
			: normalizedX(point.x);
		return point.y + xFit * 34 + (point.overall ?? 0) * 0.05;
	};
	const bestCornerPoint = ([...data].sort(
		(left, right) => cornerScore(right) - cornerScore(left),
	)[0] ?? data[0]) as Point;
	const bestPointId = bestCornerPoint.model.id;
	const rLabel = correlationLabel(data, transformX);
	// Keep lower-is-better axes visually conventional: cheaper/faster remains left, while the label marks the better corner.
	const bestCornerIsRight = !config.lowerBetter;
	const cornerLabel = bestCornerIsRight ? "upper right" : "upper left";
	const cornerX = bestCornerIsRight
		? width - margin.right - 12
		: margin.left + 12;
	const cornerAnchor = bestCornerIsRight ? "end" : "start";
	const plottedPoints = data.slice(0, 130);
	const medianXValue =
		median(plottedPoints.map((point) => point.x)) ?? xDomain[0];
	const medianYValue =
		median(plottedPoints.map((point) => point.y)) ?? yDomain[0];
	const projectionPoints = plottedPoints.map((point) => ({
		x: xPoint(point.x),
		y: yPoint(point.y),
		xValue: point.x,
		yValue: point.y,
	}));
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		xInvert: x.invert,
		yInvert: y.invert,
		points: projectionPoints,
	});

	return (
		<div className={styles.interactionPlot}>
			<div className={styles.interactionPlotHead}>
				<div className={styles.interactionTitle}>{config.title}</div>
				<div className={styles.interactionBadge}>{rLabel}</div>
			</div>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${config.title} scatter plot`}
				{...cursorProjectionHandlers}
			>
				<PlotFrame width={width} height={height} margin={margin} />
				<CursorCapture bounds={plot} />
				<XAxisTicks
					ticks={config.ticks.filter(
						(tick) => tick >= xDomain[0] && tick <= xDomain[1],
					)}
					xPoint={xPoint}
					y={plot.bottom}
					format={config.format}
					keyPrefix={config.key}
					tickLength={6}
					labelOffset={20}
					labelEvery={2}
				/>
				<YAxisTicks
					ticks={[0, 20, 40, 60, 80, 100].filter(
						(tick) => tick >= yDomain[0] && tick <= yDomain[1],
					)}
					yPoint={yPoint}
					x={plot.left}
					format={(tick) => String(tick)}
					keyPrefix={config.key}
					tickLength={6}
					labelOffset={12}
				/>
				<AxisTitles
					width={width}
					height={height}
					margin={margin}
					x={config.xLabel}
					y="Intelligence score"
					compact
				/>
				<MedianCross
					x={xPoint(medianXValue)}
					y={yPoint(medianYValue)}
					bounds={plot}
					xLabel={config.format(medianXValue)}
					yLabel={medianYValue.toFixed(0)}
				/>
				<CursorProjectionLayer
					projection={cursorProjection}
					bounds={plot}
					xLabel={
						cursorProjection
							? config.tooltipFormat(cursorProjection.xValue)
							: ""
					}
					yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
				/>
				<text
					className={styles.cornerLabel}
					x={cornerX}
					y={margin.top + 26}
					textAnchor={cornerAnchor}
				>
					{cornerLabel}
				</text>
				{plottedPoints.map((point) => {
					const highlighted = bestPointId === point.model.id;
					const radius = clamp((point.agentic ?? 35) / 12, 3, 8);
					const cx = xPoint(point.x);
					const cy = yPoint(point.y);
					const rows: HoverRow[] = [
						["Intelligence", fmtTooltipScore(point.y)],
						[config.xLabel, config.tooltipFormat(point.x)],
						["Overall", fmtTooltipScore(point.overall)],
						["Agentic", fmtTooltipScore(point.agentic)],
					];
					return (
						<g key={point.model.id ?? `${point.x}-${point.y}`}>
							<circle
								className={styles.datavizPoint}
								cx={cx}
								cy={cy}
								r={stableSvgNumber(highlighted ? radius + 2 : radius)}
								fill={providerColor(point.model.provider)}
								stroke={highlighted ? "var(--ink)" : "rgba(8,9,9,0.7)"}
								strokeWidth={highlighted ? 2.4 : 1}
								opacity={1}
							/>
							<PointHitTarget
								cx={cx}
								cy={cy}
								model={point.model}
								rows={rows}
								setHover={setHover}
							/>
						</g>
					);
				})}
			</svg>
			<div className={styles.interactionBest}>
				Best corner <b>{modelName(bestCornerPoint.model)}</b>
			</div>
			<div className={styles.interactionRead}>{config.read}</div>
		</div>
	);
}

function RunwayPanel({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers } = useCursorProjection();
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
				right.relative_scores.overall_score -
				left.relative_scores.overall_score,
		);

	if (candidates.length === 0) {
		return (
			<Panel
				kicker="Graph 05 / Context runway"
				title="Context runway"
				copy="Context runway appears when context and throughput metrics are available under the current filters."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const width = 760;
	const height = 460;
	const margin = { top: 30, right: 88, bottom: 72, left: 84 };
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
	const labelSet = new Set(candidates.slice(0, 3).map((model) => model.id));
	const plottedCandidates = candidates.slice(0, 90);
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
		xInvert: x.invert,
		yInvert: y.invert,
		points: projectionPoints,
	});

	return (
		<Panel
			kicker="Graph 05 / Context runway"
			title="Context runway"
			copy="Context window plotted against median output throughput."
			summary={
				<BoxWhiskerSummary
					label="Output speed"
					distribution={outputSpeedSummary}
					domainMax={outputSpeedSummary.max}
					formatValue={(value) => `${fmtCompact(value)} t/s`}
					showObservedLabels
				/>
			}
			note={
				<>
					Upper right means larger context and higher throughput. Bubble size
					uses the model's value score.
				</>
			}
		>
			<div className={styles.chartWrap}>
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
							32_000, 128_000, 256_000, 1_000_000, 2_000_000, 10_000_000,
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
						const labeled = labelSet.has(model.id);
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
							["Value", fmtTooltipScore(model.relative_scores.value_score)],
							["Overall", fmtTooltipScore(model.relative_scores.overall_score)],
						];
						return (
							<g key={model.id ?? model.name}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(
										clamp((model.relative_scores.value_score ?? 25) / 9, 3, 10),
									)}
									fill={providerColor(model.provider)}
									stroke="rgba(8,9,9,0.7)"
									strokeWidth={1}
									opacity={1}
								/>
								<PointHitTarget
									cx={cx}
									cy={cy}
									model={model}
									rows={rows}
									setHover={setHover}
								/>
								{labeled ? (
									<PointLabel
										model={model}
										cx={cx}
										cy={cy}
										width={width}
										margin={margin}
										height={height}
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
