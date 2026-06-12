"use client";

/** Interactive chart view for LLM stats payloads. */

import { extent, max, median, quantile } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { useMemo, useState } from "react";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";
import {
	areaScaledRadius,
	clamp,
	minMaxScale,
} from "../../../src/model-atlas/math-utils";
import { benchmarkLabels } from "../shared/constants";
import {
	type BoxWhiskerDistribution,
	BoxWhiskerSummary,
} from "./BoxWhiskerSummary";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	calloutLabelPlacements,
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
import { EfficiencyAxisChart } from "./EfficiencyAxisChart";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtDurationShort,
	fmtMoney,
	fmtTooltipMoney,
	fmtTooltipNumber,
	fmtTooltipScore,
	percent,
} from "./format";
import styles from "./graphs.module.css";
import {
	correlationLabel,
	costFilterOptions,
	interactionConfigs,
	modelKey,
	modelLimitOptions,
	modelName,
	positiveDomain,
	providerOptions,
	shortLabel,
} from "./models";
import { providerColor, providerSlug } from "./providerTheme";
import type {
	HoverRow,
	HoverSetter,
	HoverState,
	InteractionConfig,
	ModelLimit,
	Point,
} from "./types";

type FrontierResourceMetricKey = "cost" | "time" | "tokens";
type FrontierResourceFilterKey = "all" | string;

type FrontierResourceRow = {
	benchmarkKey: string;
	benchmarkLabel: string;
	resourceSourceLabel: string;
	benchmarkCount: number;
	model: LlmStatsModel;
	score: number;
	cost: number;
	seconds: number;
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number;
};

type FrontierResourceMetricConfig = {
	label: string;
	shortLabel: string;
	get: (row: FrontierResourceRow) => number;
	efficiencyLabel: string;
	efficiencyScore: (row: FrontierResourceRow) => number;
	formatEfficiency: (value: number) => string;
	format: (value: number) => string;
};

const frontierResourceMetricConfig: Record<
	FrontierResourceMetricKey,
	FrontierResourceMetricConfig
> = {
	cost: {
		label: "Task cost",
		shortLabel: "Cost",
		get: (row) => row.cost,
		efficiencyLabel: "Best score per dollar",
		efficiencyScore: (row) => row.score / row.cost,
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtMoney,
	},
	time: {
		label: "Task time",
		shortLabel: "Time",
		get: (row) => row.seconds,
		efficiencyLabel: "Best score per day",
		efficiencyScore: (row) => row.score / (row.seconds / 86_400),
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtDurationShort,
	},
	tokens: {
		label: "Task tokens",
		shortLabel: "Tokens",
		get: (row) => row.totalTokens,
		efficiencyLabel: "Best score per 1M tokens",
		efficiencyScore: (row) => row.score / (row.totalTokens / 1_000_000),
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtCompact,
	},
};

export function DashboardGraphs({
	initialPayload,
	afterControls,
	afterLead,
}: {
	initialPayload: LlmStatsPayload | null;
	afterControls?: React.ReactNode;
	afterLead?: React.ReactNode;
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
			<section
				className={`${styles.atlas} ${styles.dashboardGraphs}`}
				aria-label="Model graphs"
			>
				{afterControls}
				<div className={styles.error}>
					Unable to load the Model Atlas snapshot.
				</div>
				{afterLead}
			</section>
		);
	}

	return (
		<section
			className={`${styles.atlas} ${styles.dashboardGraphs}`}
			aria-label="Model graphs"
		>
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
								logo={option.logo}
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
			{afterControls}

			{models.length === 0 ? (
				<div className={styles.error}>
					No models match the current provider and cost filters.
				</div>
			) : (
				<>
					<section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
						<FrontierPanel models={models} setHover={setHover} />
					</section>
					{afterLead}
					<section className={styles.sectionGrid}>
						<FrontierResourcePanel
							payload={initialPayload}
							models={models}
							setHover={setHover}
						/>
						<InteractionMatrix models={models} setHover={setHover} />
						<RunwayPanel models={models} setHover={setHover} />
					</section>
				</>
			)}

			{hover ? <HoverCard hover={hover} /> : null}
		</section>
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
	kicker?: string;
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
		<article
			className={`${styles.panel} ${wide ? styles.wide : ""} ${kicker ? "" : styles.noKicker}`}
		>
			<div className={styles.panelHead}>
				<div className={styles.panelMeta}>
					{kicker ? <p className={styles.chartKicker}>{kicker}</p> : null}
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

function intelligenceDistribution(
	models: LlmStatsModel[],
): BoxWhiskerDistribution {
	return valueDistribution(
		models
			.map((model) => finiteValue(model.relative_scores?.intelligence_score))
			.filter(finite),
	);
}

function outputSpeedDistribution(
	models: LlmStatsModel[],
): BoxWhiskerDistribution {
	return valueDistribution(
		models
			.map((model) =>
				finiteValue(model.speed?.throughput_tokens_per_second_median),
			)
			.filter(finite),
	);
}

function frontierResourceRows(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): FrontierResourceRow[] {
	const frontierKeys = Object.entries(portfolio)
		.filter(([, entry]) => entry.group === "frontier")
		.map(([key]) => key);
	return models
		.flatMap((model): FrontierResourceRow[] => {
			const evaluations = model.evaluations ?? {};
			const taskMetrics = model.task_metrics ?? {};
			return frontierKeys.flatMap((benchmarkKey) => {
				const score = percent(evaluations[benchmarkKey]);
				const directTask = taskMetrics[benchmarkKey];
				const task = directTask ?? taskMetrics.artificial_analysis;
				const cost = finiteValue(task?.cost);
				const seconds = finiteValue(task?.seconds);
				const inputTokens = finiteValue(task?.input_tokens);
				const outputTokens = finiteValue(task?.output_tokens);
				const totalTokens =
					inputTokens != null && inputTokens > 0
						? inputTokens + Math.max(outputTokens ?? 0, 0)
						: outputTokens != null && outputTokens > 0
							? outputTokens
							: null;
				if (
					score == null ||
					cost == null ||
					cost <= 0 ||
					seconds == null ||
					seconds <= 0 ||
					totalTokens == null ||
					totalTokens <= 0
				) {
					return [];
				}
				return [
					{
						benchmarkKey,
						benchmarkLabel: benchmarkLabels[benchmarkKey] ?? benchmarkKey,
						resourceSourceLabel:
							directTask != null ? "Benchmark source" : "Artificial Analysis",
						benchmarkCount: 1,
						model,
						score,
						cost,
						seconds,
						inputTokens,
						outputTokens,
						totalTokens,
					},
				];
			});
		})
		.sort((left, right) => right.score - left.score);
}

function meanFrontierResourceRows(
	rows: FrontierResourceRow[],
): FrontierResourceRow[] {
	const rowsByModel = new Map<string, FrontierResourceRow[]>();
	for (const row of rows) {
		const key = modelKey(row.model);
		const current = rowsByModel.get(key) ?? [];
		current.push(row);
		rowsByModel.set(key, current);
	}
	return [...rowsByModel.values()]
		.map((modelRows) => {
			const first = modelRows[0];
			if (first == null) {
				return null;
			}
			return {
				benchmarkKey: "all",
				benchmarkLabel: "Frontier mean",
				resourceSourceLabel: `Mean of ${modelRows.length} benchmarks`,
				benchmarkCount: modelRows.length,
				model: first.model,
				score: meanNumber(modelRows.map((row) => row.score)),
				cost: meanNumber(modelRows.map((row) => row.cost)),
				seconds: meanNumber(modelRows.map((row) => row.seconds)),
				inputTokens: nullableMeanNumber(
					modelRows.map((row) => row.inputTokens),
				),
				outputTokens: nullableMeanNumber(
					modelRows.map((row) => row.outputTokens),
				),
				totalTokens: meanNumber(modelRows.map((row) => row.totalTokens)),
			};
		})
		.filter((row): row is FrontierResourceRow => row != null)
		.sort((left, right) => right.score - left.score);
}

function normalizedFrontierResourceRows(
	rows: FrontierResourceRow[],
): FrontierResourceRow[] {
	const scoresByBenchmark = new Map<string, number[]>();
	for (const row of rows) {
		const scores = scoresByBenchmark.get(row.benchmarkKey) ?? [];
		scores.push(row.score);
		scoresByBenchmark.set(row.benchmarkKey, scores);
	}
	return rows.map((row) => ({
		...row,
		score:
			minMaxScale(scoresByBenchmark.get(row.benchmarkKey) ?? [], row.score) ??
			row.score,
	}));
}

function meanNumber(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nullableMeanNumber(values: Array<number | null>): number | null {
	const finiteValues = values.filter(finite);
	return finiteValues.length > 0 ? meanNumber(finiteValues) : null;
}

function inverseLogBubbleRadius(values: number[], maxRadius = 16) {
	const minRadius = 5;
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

function linearBubbleRadius(values: number[], minRadius = 3, maxRadius = 10) {
	const finiteValues = values.filter(finite);
	const minValue = Math.min(...finiteValues);
	const maxValue = Math.max(...finiteValues);
	const span = maxValue - minValue;

	return (value: number) => {
		if (!finite(value)) {
			return minRadius;
		}
		if (!finite(span) || span === 0) {
			return areaScaledRadius(minRadius, maxRadius, 0.5);
		}
		const normalized = clamp((value - minValue) / span, 0, 1);
		return areaScaledRadius(minRadius, maxRadius, normalized);
	};
}

function bestByScore<T>(
	rows: readonly T[],
	score: (row: T) => number | null,
): T | null {
	return (
		[...rows].sort((left, right) => {
			const leftScore = score(left);
			const rightScore = score(right);
			return (rightScore ?? -Infinity) - (leftScore ?? -Infinity);
		})[0] ?? null
	);
}

function extremeLabelRows<T>(
	rows: readonly T[],
	keyFor: (row: T) => string,
	xValue: (row: T) => number,
	yValue: (row: T) => number,
	{ xHigherBetter = true }: { xHigherBetter?: boolean } = {},
) {
	const ratioScore = (row: T) => {
		const x = xValue(row);
		const y = yValue(row);
		if (!finite(x) || !finite(y)) {
			return null;
		}
		return xHigherBetter ? (y > 0 ? x / y : null) : x > 0 ? y / x : null;
	};
	const selected: T[] = [];
	for (const row of [
		bestByScore(rows, (candidate) =>
			xHigherBetter ? xValue(candidate) : -xValue(candidate),
		),
		bestByScore(rows, yValue),
		bestByScore(rows, ratioScore),
	]) {
		if (
			row != null &&
			!selected.some((candidate) => keyFor(candidate) === keyFor(row))
		) {
			selected.push(row);
		}
	}
	return new Set(selected);
}

function frontierResourceProduct(
	row: FrontierResourceRow,
	selectedMetric: FrontierResourceMetricKey | "all",
) {
	return (
		Object.keys(frontierResourceMetricConfig) as FrontierResourceMetricKey[]
	)
		.filter((key) => selectedMetric === "all" || key !== selectedMetric)
		.map((key) => frontierResourceMetricConfig[key].get(row))
		.filter((value) => finite(value) && value > 0)
		.reduce((product, value) => product * value, 1);
}

function FrontierPanel({
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
				finite(model.relative_scores?.intelligence_score) &&
				finite(model.relative_scores?.value_score) &&
				finite(model.cost?.blended_price) &&
				Number(model.cost?.blended_price) > 0,
		)
		.sort(
			(left, right) =>
				Number(left.relative_scores?.value_score) -
				Number(right.relative_scores?.value_score),
		);

	if (candidates.length === 0) {
		return (
			<Panel
				title="Pareto frontier"
				copy="A tradeoff scatter for intelligence versus value score."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const width = 820;
	const height = 500;
	const margin = { top: 26, right: 34, bottom: 68, left: 62 };
	const values = candidates.map((model) =>
		Number(model.relative_scores.value_score),
	);
	const scores = candidates.map(
		(model) => model.relative_scores.intelligence_score,
	);
	const frontierDescending: LlmStatsModel[] = [];
	let bestFromRight = -Infinity;
	for (const model of [...candidates].sort(
		(left, right) =>
			Number(right.relative_scores.value_score) -
			Number(left.relative_scores.value_score),
	)) {
		const score = model.relative_scores.intelligence_score;
		if (score > bestFromRight) {
			frontierDescending.push(model);
			bestFromRight = score;
		}
	}
	const frontier = frontierDescending.reverse();
	const scoreDistribution = valueDistribution(scores);
	const xDomain: [number, number] = [
		Math.max(0, Math.floor((Math.min(...values) - 2) / 5) * 5),
		100,
	];
	const yMin = Math.max(0, Math.min(...scores) - 4);
	const x = scaleLinear()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLinear()
		.domain([yMin, 102])
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const medianValue = median(values) ?? xDomain[0];
	const medianScore = median(scores) ?? 50;
	const frontierIds = new Set(frontier.map(modelKey));
	const frontierPath = frontier.reduce((path, model, index) => {
		const nextX = xPoint(Number(model.relative_scores.value_score));
		const nextY = yPoint(model.relative_scores.intelligence_score);
		return index === 0 ? `M${nextX},${nextY}` : `${path} H${nextX} V${nextY}`;
	}, "");
	const plot = plotBoundsFor(width, height, margin);
	const medianX = xPoint(medianValue);
	const medianY = yPoint(medianScore);
	const yTickStart = Math.ceil(yMin / 5) * 5;
	const yTicks = Array.from(
		{ length: Math.floor((100 - yTickStart) / 5) + 1 },
		(_, index) => yTickStart + index * 5,
	);
	const xTickCandidates = [50, 60, 70, 80, 90, 100];
	const xTicks = xTickCandidates.filter(
		(tick) => tick >= xDomain[0] && tick <= xDomain[1],
	);
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
		const xValue = Number(model.relative_scores.value_score);
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
			cx: xPoint(Number(model.relative_scores.value_score)),
			cy: yPoint(model.relative_scores.intelligence_score),
			radius: capabilityBubbleRadius(capabilityBubbleValue(model)),
		})),
		labels: frontier.map((model, index) => ({
			key: modelKey(model),
			label: shortLabel(model),
			cx: xPoint(Number(model.relative_scores.value_score)),
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
			copy="Intelligence score plotted against value score."
			summary={
				<BoxWhiskerSummary
					label="Intelligence score"
					distribution={scoreDistribution}
					domainMax={100}
					showDomainEndpoints
				/>
			}
			note={
				<>Step line: strongest observed intelligence/value tradeoff envelope.</>
			}
		>
			<div className={styles.frontierLegend}>
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = quality
					</span>
				</div>
			</div>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="Intelligence by value score scatter plot"
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
						const cx = xPoint(Number(model.relative_scores.value_score));
						const cy = yPoint(model.relative_scores.intelligence_score);
						const isFrontier = frontierIds.has(modelKey(model));
						const rows: HoverRow[] = [
							[
								"Intelligence",
								fmtTooltipScore(model.relative_scores.intelligence_score),
							],
							["Value", fmtTooltipScore(model.relative_scores.value_score)],
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
										capabilityBubbleRadius(capabilityBubbleValue(model)),
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
									snapProjection={{
										x: cx,
										y: cy,
										xValue: Number(model.relative_scores.value_score),
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

function FrontierResourcePanel({
	payload,
	models,
	setHover,
}: {
	payload: LlmStatsPayload;
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const [metricKey, setMetricKey] = useState<FrontierResourceMetricKey>("cost");
	const [benchmarkFilter, setBenchmarkFilter] =
		useState<FrontierResourceFilterKey>("all");
	const allRows = useMemo(
		() =>
			frontierResourceRows(
				models,
				payload.metadata.scoring.benchmark_portfolio,
			),
		[models, payload.metadata.scoring.benchmark_portfolio],
	);
	const meanRows = useMemo(
		() => meanFrontierResourceRows(normalizedFrontierResourceRows(allRows)),
		[allRows],
	);
	const benchmarkOptions = useMemo(
		() => frontierResourceOptions(allRows),
		[allRows],
	);
	const selectedFilter =
		benchmarkFilter !== "all" &&
		benchmarkOptions.some((option) => option.key === benchmarkFilter)
			? benchmarkFilter
			: "all";
	const rows = useMemo(
		() =>
			selectedFilter === "all"
				? meanRows
				: allRows.filter((row) => row.benchmarkKey === selectedFilter),
		[allRows, meanRows, selectedFilter],
	);

	if (allRows.length === 0) {
		return (
			<Panel
				title="Frontier Efficiency"
				copy="Frontier benchmark resource rows appear when selected frontier benchmarks include score, cost, time, and token metrics."
			>
				<EmptyChart message="No frontier resource rows match the current filters." />
			</Panel>
		);
	}

	const isAllFilter = selectedFilter === "all";
	const resourceMetric = frontierResourceMetricConfig[metricKey];
	const axisMetric = isAllFilter
		? {
				label: "Value score",
				get: (row: FrontierResourceRow) =>
					finiteValue(row.model.relative_scores?.value_score) ?? 0,
				format: (value: number) => value.toFixed(0),
			}
		: resourceMetric;
	const metricValues = rows.map(axisMetric.get).filter(finite);
	const xDomain = linearResourceDomain(metricValues);
	const scoreMax = max(rows, (row) => row.score) ?? 50;
	const yDomainTop = Math.max(
		50,
		Math.min(105, Math.ceil((scoreMax + 4) / 10) * 10),
	);
	const yTicks = percentageTicks(yDomainTop);
	const bubbleValue = (row: FrontierResourceRow) =>
		frontierResourceProduct(row, isAllFilter ? "all" : metricKey);
	const bubbleRadius = inverseLogBubbleRadius(rows.map(bubbleValue), 13);
	const leader = rows[0] as FrontierResourceRow;
	const bestAxis = isAllFilter
		? ([...rows].sort(
				(left, right) => axisMetric.get(right) - axisMetric.get(left),
			)[0] ?? leader)
		: ([...rows].sort(
				(left, right) =>
					resourceMetric.efficiencyScore(right) -
					resourceMetric.efficiencyScore(left),
			)[0] ?? leader);
	const leanAboveFloor =
		[...rows]
			.filter((row) => row.score >= 10)
			.sort((left, right) => axisMetric.get(left) - axisMetric.get(right))[0] ??
		bestAxis;
	const valueAbove80 = bestValueRowAboveScore(rows, axisMetric.get, 80, leader);
	const valueAbove20 = bestValueRowAboveScore(rows, axisMetric.get, 20, leader);
	const labeledRows = new Set(
		isAllFilter
			? [leader, valueAbove80, valueAbove20]
			: [leader, bestAxis, leanAboveFloor],
	);
	const scoreDistribution = valueDistribution(rows.map((row) => row.score));
	const plotRows = [...rows].sort((left, right) => left.score - right.score);
	const yAxisLabel = isAllFilter ? "Normalized score" : "Benchmark score";
	const panelCopy = isAllFilter
		? "Each point is one model: normalized frontier score against value score."
		: `${leader.benchmarkLabel} score plotted against available task cost, time, or tokens.`;
	const leaderDetail = isAllFilter
		? `${leader.score.toFixed(1)}% / value ${axisMetric.format(
				axisMetric.get(leader),
			)}`
		: `${leader.score.toFixed(1)}% / ${fmtMoney(leader.cost)}`;

	return (
		<Panel
			title="Frontier Efficiency"
			copy={panelCopy}
			summary={
				<BoxWhiskerSummary
					label="Benchmark score"
					distribution={scoreDistribution}
					domainMax={100}
					formatValue={(value) => `${value.toFixed(0)}%`}
					showDomainEndpoints
				/>
			}
			wide
		>
			<div className={styles.resourceToolbar}>
				<fieldset
					className={`${styles.metricToggle} ${styles.benchmarkToggle}`}
				>
					<legend className={styles.visuallyHidden}>
						Frontier resource benchmark
					</legend>
					<button
						type="button"
						aria-pressed={selectedFilter === "all"}
						onClick={() => setBenchmarkFilter("all")}
					>
						All <span>{meanRows.length}</span>
					</button>
					{benchmarkOptions.map((option) => (
						<button
							key={option.key}
							type="button"
							aria-pressed={selectedFilter === option.key}
							onClick={() => setBenchmarkFilter(option.key)}
						>
							{option.label} <span>{option.count}</span>
						</button>
					))}
				</fieldset>
				{isAllFilter ? null : (
					<fieldset className={styles.metricToggle}>
						<legend className={styles.visuallyHidden}>
							Frontier Efficiency axis
						</legend>
						{Object.entries(frontierResourceMetricConfig).map(
							([key, config]) => (
								<button
									key={key}
									type="button"
									aria-pressed={key === metricKey}
									onClick={() => setMetricKey(key as FrontierResourceMetricKey)}
								>
									{config.shortLabel}
								</button>
							),
						)}
					</fieldset>
				)}
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = efficiency
					</span>
				</div>
			</div>
			<EfficiencyAxisChart
				rows={plotRows}
				metric={axisMetric}
				xDomain={xDomain}
				yDomain={[0, yDomainTop]}
				yTicks={yTicks}
				yAxisLabel={yAxisLabel}
				keyPrefix={`frontier-resource-${selectedFilter}-${isAllFilter ? "value" : metricKey}`}
				ariaLabel="Frontier Efficiency scatter plot"
				bubbleValue={bubbleValue}
				bubbleRadius={bubbleRadius}
				getScore={(row) => row.score}
				getModel={(row) => row.model}
				getKey={(row) => `${row.benchmarkKey}-${modelKey(row.model)}`}
				getHoverTitle={(row) =>
					`${modelName(row.model)} / ${row.benchmarkLabel}`
				}
				getHoverRows={(row) => frontierResourceHoverRows(row)}
				labelRows={labeledRows}
				getLabel={(row) => shortLabel(row.model)}
				setHover={setHover}
				height={520}
			/>
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={`${modelName(leader.model)} - ${leader.benchmarkLabel}`}
					detail={leaderDetail}
				/>
				{isAllFilter ? (
					<>
						<SummaryCard
							label="Best value above 80%"
							value={`${modelName(valueAbove80.model)} - ${valueAbove80.benchmarkLabel}`}
							detail={`${valueAbove80.score.toFixed(1)}% / value ${axisMetric
								.get(valueAbove80)
								.toFixed(0)}`}
						/>
						<SummaryCard
							label="Best value above 20%"
							value={`${modelName(valueAbove20.model)} - ${valueAbove20.benchmarkLabel}`}
							detail={`${valueAbove20.score.toFixed(1)}% / value ${axisMetric
								.get(valueAbove20)
								.toFixed(0)}`}
						/>
					</>
				) : (
					<>
						<SummaryCard
							label={resourceMetric.efficiencyLabel}
							value={`${modelName(bestAxis.model)} - ${bestAxis.benchmarkLabel}`}
							detail={resourceMetric.formatEfficiency(
								resourceMetric.efficiencyScore(bestAxis),
							)}
						/>
						<SummaryCard
							label="Leanest above 10%"
							value={`${modelName(leanAboveFloor.model)} - ${leanAboveFloor.benchmarkLabel}`}
							detail={axisMetric.format(axisMetric.get(leanAboveFloor))}
						/>
					</>
				)}
			</div>
		</Panel>
	);
}

function bestValueRowAboveScore(
	rows: FrontierResourceRow[],
	valueScore: (row: FrontierResourceRow) => number,
	minScore: number,
	fallback: FrontierResourceRow,
) {
	return (
		[...rows]
			.filter((row) => row.score >= minScore)
			.sort((left, right) => valueScore(right) - valueScore(left))[0] ??
		fallback
	);
}

function frontierResourceOptions(rows: FrontierResourceRow[]) {
	const counts = new Map<
		string,
		{ key: string; label: string; count: number }
	>();
	for (const row of rows) {
		const current = counts.get(row.benchmarkKey) ?? {
			key: row.benchmarkKey,
			label: row.benchmarkLabel,
			count: 0,
		};
		current.count += 1;
		counts.set(row.benchmarkKey, current);
	}
	return [...counts.values()].sort(
		(left, right) =>
			right.count - left.count || left.label.localeCompare(right.label),
	);
}

function percentageTicks(domainTop: number) {
	const step = domainTop <= 60 ? 10 : 20;
	return Array.from(
		{ length: Math.floor(domainTop / step) + 1 },
		(_, index) => index * step,
	);
}

function linearResourceDomain(values: number[]): [number, number] {
	const low = Math.min(...values);
	const high = Math.max(...values);
	if (!finite(low) || !finite(high)) {
		return [0, 1];
	}
	if (low === high) {
		const pad = Math.max(Math.abs(low) * 0.1, 1);
		return [Math.max(0, low - pad), high + pad];
	}
	const span = high - low;
	return [Math.max(0, low - span * 0.05), high + span * 0.05];
}

function frontierResourceHoverRows(row: FrontierResourceRow): HoverRow[] {
	const rows: HoverRow[] = [
		["Benchmark", row.benchmarkLabel],
		["Resource source", row.resourceSourceLabel],
		["Score", `${row.score.toFixed(1)}%`],
		["Cost", fmtTooltipMoney(row.cost)],
		["Time", fmtDurationShort(row.seconds)],
		["Task tokens", fmtTooltipNumber(row.totalTokens)],
	];
	if (row.inputTokens != null) {
		rows.push(["Input tokens", fmtTooltipNumber(row.inputTokens)]);
	}
	if (row.outputTokens != null) {
		rows.push(["Output tokens", fmtTooltipNumber(row.outputTokens)]);
	}
	return rows;
}

function InteractionMatrix({
	models,
	setHover,
}: {
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const distribution = intelligenceDistribution(models);

	return (
		<Panel
			title="Intelligence interaction matrix"
			copy="Small multiples across price, speed, response time, context, task cost, and coding reliability."
			summary={
				<BoxWhiskerSummary
					label="Intelligence score"
					distribution={distribution}
					domainMax={100}
					showDomainEndpoints
				/>
			}
			wide
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
	models: LlmStatsModel[];
	config: InteractionConfig;
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
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
	const margin = { top: 22, right: 22, bottom: 64, left: 54 };
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
	// Keep lower-is-better axes visually conventional: cheaper/faster remains left, while a small arrow marks the better corner.
	const bestCornerIsRight = !config.lowerBetter;
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
		points: projectionPoints,
	});
	const labeledPoints = extremeLabelRows(
		plottedPoints,
		(point) => modelKey(point.model),
		(point) => point.x,
		(point) => point.y,
		{ xHigherBetter: !config.lowerBetter },
	);
	const pointRadius = (point: Point) =>
		clamp((point.overall ?? 45) / 18, 3, 6) +
		(bestPointId === point.model.id ? 1.2 : 0);
	const interactionLabelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: plottedPoints.map((point) => ({
			cx: xPoint(point.x),
			cy: yPoint(point.y),
			radius: pointRadius(point),
		})),
		labels: plottedPoints
			.filter((point) => labeledPoints.has(point))
			.map((point, index) => ({
				key: modelKey(point.model),
				label: shortLabel(point.model),
				cx: xPoint(point.x),
				cy: yPoint(point.y),
				radius: pointRadius(point),
				priority: plottedPoints.length - index,
			})),
		fontSize: 9.5,
		charWidth: 5.8,
		lineHeight: 11,
		padding: 3,
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
				<CornerDirectionArrow
					bounds={plot}
					corner={bestCornerIsRight ? "upper-right" : "upper-left"}
				/>
				{plottedPoints.map((point) => {
					const highlighted = bestPointId === point.model.id;
					const radius = clamp((point.overall ?? 45) / 18, 3, 6);
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
								r={stableSvgNumber(highlighted ? radius + 1.2 : radius)}
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
								snapProjection={{
									x: cx,
									y: cy,
									xValue: point.x,
									yValue: point.y,
								}}
								setCursorProjection={setCursorProjection}
							/>
						</g>
					);
				})}
				{plottedPoints.map((point) =>
					labeledPoints.has(point) ? (
						<PointLabel
							key={`label-${point.model.id ?? `${point.x}-${point.y}`}`}
							model={point.model}
							cx={xPoint(point.x)}
							cy={yPoint(point.y)}
							width={width}
							margin={margin}
							height={height}
							placement={interactionLabelPlacements.get(modelKey(point.model))}
						/>
					) : null,
				)}
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
				right.relative_scores.overall_score -
				left.relative_scores.overall_score,
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
	const margin = { top: 30, right: 38, bottom: 72, left: 66 };
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
				Number(candidate.relative_scores.overall_score) >= labelQualityFloor,
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
		clamp((model.relative_scores.value_score ?? 25) / 9, 3, 10);
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
					formatValue={(value) => `${fmtCompact(value)} t/s`}
					showObservedLabels
				/>
			}
		>
			<div className={styles.frontierLegend}>
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = value score
					</span>
				</div>
			</div>
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
							["Value", fmtTooltipScore(model.relative_scores.value_score)],
							["Overall", fmtTooltipScore(model.relative_scores.overall_score)],
						];
						return (
							<g key={model.id ?? model.name}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={stableSvgNumber(runwayRadius(model))}
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
