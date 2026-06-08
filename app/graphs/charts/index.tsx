"use client";

import { GridColumns, GridRows } from "@visx/grid";
import { LinePath } from "@visx/shape";
import { extent, max, median, quantile } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type {
	ModelStatsSelectedModel,
	ModelStatsSelectedPayload,
} from "../../../src/model-atlas/llm/llm-stats/types";
import type { DeepSWELeaderboardRow } from "../../../src/model-atlas/llm/sources/deep-swe-scraper";
import styles from "../charts.module.css";
import {
	clamp,
	finite,
	finiteValue,
	fmtCompact,
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
	focusHover,
	groupBy,
	interactionConfigs,
	modelKey,
	modelLimitOptions,
	modelName,
	pointHover,
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
	Margin,
	ModelLimit,
	Point,
} from "./types";

type DeepSWEMetricKey = "cost" | "time" | "tokens";

type AccuracyDistribution = {
	count: number;
	min: number;
	q1: number;
	median: number;
	q3: number;
	max: number;
};

type HiddenResourceMetric = {
	firstLabel: string;
	secondLabel: string;
	firstValue: (row: DeepSWEChartRow) => number;
	secondValue: (row: DeepSWEChartRow) => number;
};

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

export function ModelAtlasCharts({
	initialPayload,
}: {
	initialPayload: ModelStatsSelectedPayload | null;
}) {
	const [mounted, setMounted] = useState(false);
	const [provider, setProvider] = useState("all");
	const [maxCost, setMaxCost] = useState<"all" | number>("all");
	const [modelLimit, setModelLimit] = useState<ModelLimit>(30);
	const [hover, setHover] = useState<HoverState | null>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

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

	if (!mounted) {
		return (
			<main className={styles.atlas}>
				<div className={styles.error}>Loading Model Atlas charts.</div>
			</main>
		);
	}

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
	return (
		<article className={`${styles.panel} ${wide ? styles.wide : ""}`}>
			<div className={styles.panelHead}>
				<div className={styles.panelMeta}>
					<p className={styles.chartKicker}>{kicker}</p>
					{summary ??
						(chips && chips.length > 0 ? (
							<div className={styles.chips}>
								{chips.map((chip) => (
									<span key={chip} className={styles.chip}>
										{chip}
									</span>
								))}
							</div>
						) : null)}
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

function AccuracyBoxWhisker({
	distribution,
}: {
	distribution: AccuracyDistribution;
}) {
	const domainMax = Math.max(75, distribution.max);
	const toPosition = (value: number) =>
		`${clamp((value / domainMax) * 100, 0, 100)}%`;
	const formatPoint = (value: number) => `${value.toFixed(0)}%`;
	const style = {
		"--whisker-min": toPosition(distribution.min),
		"--whisker-q1": toPosition(distribution.q1),
		"--whisker-median": toPosition(distribution.median),
		"--whisker-q3": toPosition(distribution.q3),
		"--whisker-max": toPosition(distribution.max),
	} as React.CSSProperties;

	return (
		<div className={styles.boxWhiskerSummary} style={style}>
			<div className={styles.boxWhiskerTop}>
				<span>DeepSWE accuracy</span>
				<b>{distribution.count} models</b>
			</div>
			<div
				className={styles.boxWhiskerPlot}
				aria-label={`DeepSWE accuracy distribution from ${formatPoint(
					distribution.min,
				)} to ${formatPoint(distribution.max)} with median ${formatPoint(
					distribution.median,
				)}`}
				role="img"
			>
				<span className={styles.boxWhiskerLine} />
				<span className={styles.boxWhiskerMin} />
				<span className={styles.boxWhiskerMax} />
				<span className={styles.boxWhiskerBox} />
				<span className={styles.boxWhiskerMedian} />
			</div>
			<div className={styles.boxWhiskerStats}>
				<span className={styles.boxWhiskerMinValue}>
					{formatPoint(distribution.min)}
				</span>
				<span className={styles.boxWhiskerMedianValue}>
					{formatPoint(distribution.median)}
				</span>
				<span className={styles.boxWhiskerMaxValue}>
					{formatPoint(distribution.max)}
				</span>
			</div>
		</div>
	);
}

function deepSWEAccuracyDistribution(
	rows: DeepSWELeaderboardRow[],
): AccuracyDistribution {
	const accuracyValues = [...groupBy(rows, (row) => row.model).values()]
		.map((modelRows) => {
			const modelScores = modelRows
				.map((row) => percent(row.pass_at_1))
				.filter(finite);
			return max(modelScores) ?? null;
		})
		.filter(finite)
		.sort((left, right) => left - right);

	return {
		count: accuracyValues.length,
		min: accuracyValues[0] ?? 0,
		q1: quantile(accuracyValues, 0.25) ?? 0,
		median: quantile(accuracyValues, 0.5) ?? 0,
		q3: quantile(accuracyValues, 0.75) ?? 0,
		max: accuracyValues[accuracyValues.length - 1] ?? 0,
	};
}

function hiddenResourceValue(
	row: DeepSWEChartRow,
	metric: HiddenResourceMetric,
) {
	return metric.firstValue(row) * metric.secondValue(row);
}

function FrontierPanel({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
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
		if (score > best + 0.5) {
			frontier.push(model);
			best = score;
		}
	}

	const width = 820;
	const height = 500;
	const margin = { top: 26, right: 58, bottom: 68, left: 62 };
	const costs = candidates.map((model) => Number(model.cost?.blended_price));
	const scores = candidates.map(
		(model) => model.relative_scores.intelligence_score,
	);
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
	const medianPrice = median(costs) ?? xDomain[0];
	const medianScore = median(scores) ?? 50;
	const visibleFrontier = frontier.filter(
		(model) => model.relative_scores.intelligence_score >= 55,
	);
	const visibleFrontierIds = new Set(visibleFrontier.map(modelKey));
	const frontierPath = stepPath(visibleFrontier, x, y);
	const guidePath = line<ModelStatsSelectedModel>()
		.x((model) => x(Number(model.cost?.blended_price)))
		.y((model) => y(model.relative_scores.intelligence_score))(visibleFrontier);

	return (
		<Panel
			kicker="Graph 01 / Pareto frontier"
			title="Pareto frontier"
			copy="Intelligence score plotted against blended price per 1M tokens."
			chips={["observed envelope"]}
			note={
				<>
					Step line: highest observed intelligence score available at or below
					each price level.
				</>
			}
		>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="Capability per blended dollar scatter plot"
				>
					<PlotFrame width={width} height={height} margin={margin} />
					{[20, 40, 60, 80, 100].map((tick) => (
						<g key={`y-${tick}`}>
							<line
								className={styles.gridLine}
								x1={margin.left}
								x2={width - margin.right}
								y1={y(tick)}
								y2={y(tick)}
							/>
							<text
								className={styles.axisLabel}
								x={margin.left - 18}
								y={y(tick) + 4}
								textAnchor="end"
							>
								{tick}
							</text>
						</g>
					))}
					{[0.25, 0.5, 1, 2, 5, 10, 25, 50]
						.filter((tick) => tick >= xDomain[0] && tick <= xDomain[1])
						.map((tick) => (
							<g key={`x-${tick}`}>
								<line
									className={styles.gridLine}
									x1={x(tick)}
									x2={x(tick)}
									y1={margin.top}
									y2={height - margin.bottom}
								/>
								<text
									className={styles.axisLabel}
									x={x(tick)}
									y={height - 24}
									textAnchor="middle"
								>
									${tick}
								</text>
							</g>
						))}
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x="Blended price per 1M tokens, log scale"
						y="Intelligence score"
					/>
					<line
						className={styles.axisStrong}
						x1={x(medianPrice)}
						x2={x(medianPrice)}
						y1={margin.top}
						y2={height - margin.bottom}
					/>
					<line
						className={styles.axisStrong}
						x1={margin.left}
						x2={width - margin.right}
						y1={y(medianScore)}
						y2={y(medianScore)}
					/>
					<text
						className={styles.quadrantLabel}
						x={margin.left + 18}
						y={margin.top + 44}
					>
						High value
					</text>
					<text
						className={styles.quadrantLabel}
						x={x(medianPrice) + 22}
						y={height - margin.bottom - 20}
					>
						Costly ceiling
					</text>
					{guidePath ? (
						<path className={styles.frontierGuide} d={guidePath} />
					) : null}
					{frontierPath ? (
						<path className={styles.frontier} d={frontierPath} />
					) : null}
					{candidates.slice(0, 95).map((model) => {
						const cx = x(Number(model.cost?.blended_price));
						const cy = y(model.relative_scores.intelligence_score);
						const isFrontier = visibleFrontierIds.has(modelKey(model));
						const shouldLabel = isFrontier;
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
							<g key={model.id ?? model.name ?? `${cx}-${cy}`}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={clamp(
										(model.relative_scores.agentic_score ?? 35) / 11,
										3,
										9,
									)}
									fill={providerColor(model.provider)}
									stroke={isFrontier ? "var(--accent)" : "rgba(8,9,9,0.7)"}
									strokeWidth={isFrontier ? 2 : 1}
									opacity={isFrontier ? 0.95 : 0.35}
								/>
								<PointHitTarget
									cx={cx}
									cy={cy}
									model={model}
									rows={rows}
									setHover={setHover}
								/>
								{shouldLabel ? (
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
	const allEfforts = deepSweRows(models, rows, "all");
	const deep =
		effortMode === "all" ? allEfforts : deepSweRows(models, rows, "best");

	if (deep.length === 0) {
		return (
			<Panel
				kicker="Graph 02 / DeepSWE resource axis"
				title="DeepSWE resource axis"
				copy="DeepSWE rows appear when the current filters include models with DeepSWE task metrics."
			>
				<EmptyChart message="No DeepSWE rows match the current filters." />
			</Panel>
		);
	}

	const metric = deepSweMetricConfig[metricKey];
	const width = 760;
	const height = 490;
	const margin = { top: 28, right: 62, bottom: 70, left: 62 };
	const plotWidth = width - margin.left - margin.right;
	const plotHeight = height - margin.top - margin.bottom;
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
	const markerMetrics = hiddenResourceMetrics[metricKey];
	const bubbleValue = (row: DeepSWEChartRow) =>
		hiddenResourceValue(row, markerMetrics);
	const bubbleScale = scaleLog()
		.domain(positiveDomain(deep.map(bubbleValue).filter(finite)))
		.range([5, 20])
		.clamp(true);
	const leader = deep[0] as DeepSWEChartRow;
	const bestAxis =
		[...deep].sort(
			(left, right) =>
				Number(percent(right.row.pass_at_1)) / metric.get(right) -
				Number(percent(left.row.pass_at_1)) / metric.get(left),
		)[0] ?? leader;
	const leanAboveFloor =
		[...deep]
			.filter((row) => Number(percent(row.row.pass_at_1)) >= 20)
			.sort((left, right) => metric.get(left) - metric.get(right))[0] ??
		bestAxis;
	const labeledRows = new Set([leader, bestAxis, leanAboveFloor]);
	const accuracyDistribution = deepSWEAccuracyDistribution(rows);
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

	return (
		<Panel
			kicker="Graph 02 / DeepSWE resource axis"
			title="DeepSWE resource axis"
			copy="DeepSWE accuracy plotted against cost, runtime, or output tokens. Bubble size uses a log-scaled product of the two other resources."
			summary={<AccuracyBoxWhisker distribution={accuracyDistribution} />}
		>
			<div className={styles.resourceToolbar}>
				<fieldset className={styles.metricToggle}>
					<legend className={styles.visuallyHidden}>
						DeepSWE resource axis
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
						Bubble = log({markerMetrics.firstLabel} x{" "}
						{markerMetrics.secondLabel})
					</span>
				</div>
			</div>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="DeepSWE accuracy by resource axis scatter plot"
				>
					<PlotFrame width={width} height={height} margin={margin} />
					<GridRows
						scale={y}
						tickValues={yTicks}
						width={plotWidth}
						left={margin.left}
						stroke="rgba(238, 238, 234, 0.16)"
						strokeWidth={1}
					/>
					<GridColumns
						scale={x}
						tickValues={xTicks}
						height={plotHeight}
						top={margin.top}
						stroke="rgba(238, 238, 234, 0.18)"
						strokeWidth={1}
					/>
					{yTicks.map((tick) => (
						<g key={`y-${tick}`}>
							<text
								className={styles.axisLabel}
								x={margin.left - 18}
								y={y(tick) + 4}
								textAnchor="end"
							>
								{tick}%
							</text>
						</g>
					))}
					{xTicks.map((tick) => (
						<g key={`x-${tick}`}>
							<text
								className={styles.axisLabel}
								x={x(tick)}
								y={height - 26}
								textAnchor="middle"
							>
								{metric.format(tick)}
							</text>
						</g>
					))}
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x={`${metric.label}, log scale`}
						y="DeepSWE accuracy"
					/>
					{effortLines.map((modelRows) => {
						const firstRow = modelRows[0] as DeepSWEChartRow;
						return (
							<LinePath<DeepSWEChartRow>
								key={firstRow.modelKey}
								className={styles.deepSweEffortLine}
								data={modelRows}
								x={(row) => x(metric.get(row))}
								y={(row) => y(Number(percent(row.row.pass_at_1)))}
								style={
									{
										"--line-color": providerColor(firstRow.model.provider),
									} as React.CSSProperties
								}
							/>
						);
					})}
					{plotRows.map((row) => {
						const axisValue = metric.get(row);
						const score = Number(percent(row.row.pass_at_1));
						const cx = x(axisValue);
						const cy = y(score);
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
									r={bubbleScale(bubbleValue(row))}
									fill={providerColor(row.model.provider)}
									stroke="rgba(8,9,9,0.7)"
									strokeWidth={1}
									opacity={0.72}
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
						const cx = x(axisValue);
						const cy = y(score);
						return labeledRows.has(row) ? (
							<DeepSWEPointLabel
								key={`label-${row.row.config ?? row.modelKey}`}
								label={deepSWELabel(row, false)}
								cx={cx}
								cy={cy}
								width={width}
								margin={margin}
								height={height}
								xOffset={bubbleScale(bubbleValue(row)) + 8}
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
					label={`Best accuracy per ${metric.unit}`}
					value={deepSWELabel(bestAxis, effortMode === "all")}
					detail={(
						Number(percent(bestAxis.row.pass_at_1)) / metric.get(bestAxis)
					).toFixed(metricKey === "tokens" ? 4 : 1)}
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

function InteractionMatrix({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
	return (
		<Panel
			kicker="Graph 03 / Intelligence interaction matrix"
			title="Intelligence interaction matrix"
			copy="Small multiples plotting intelligence against price, speed, response time, context, task cost, and coding reliability."
			chips={[
				"y = intelligence",
				"r = correlation",
				"corner label = selected tradeoff",
			]}
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
	const margin = { top: 22, right: 36, bottom: 64, left: 50 };
	const [rawMin, rawMax] = extent(data, (point) => point.x);
	const xMin = rawMin ?? 1;
	const xMax = rawMax ?? xMin * 2;
	const xSpan = xMax - xMin || Math.max(1, xMax);
	const xDomain: [number, number] = config.log
		? [Math.max(xMin / 1.2, 0.001), Math.max(xMax * 1.2, 0.002)]
		: [Math.min(0, xMin - xSpan * 0.08), xMax + xSpan * 0.08];
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
	const cornerX = config.lowerBetter
		? margin.left + 12
		: width - margin.right - 12;
	const cornerAnchor = config.lowerBetter ? "start" : "end";

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
			>
				<PlotFrame width={width} height={height} margin={margin} />
				{config.ticks
					.filter((tick) => tick >= xDomain[0] && tick <= xDomain[1])
					.map((tick, index) => (
						<g key={`${config.key}-x-${tick}`}>
							<line
								className={styles.gridLine}
								x1={x(tick)}
								x2={x(tick)}
								y1={margin.top}
								y2={height - margin.bottom}
							/>
							{index % 2 === 0 ? (
								<text
									className={styles.axisLabel}
									x={x(tick)}
									y={height - 24}
									textAnchor="middle"
								>
									{config.format(tick)}
								</text>
							) : null}
						</g>
					))}
				{[0, 20, 40, 60, 80, 100]
					.filter((tick) => tick >= yDomain[0] && tick <= yDomain[1])
					.map((tick) => (
						<g key={`${config.key}-y-${tick}`}>
							<line
								className={styles.gridLine}
								x1={margin.left}
								x2={width - margin.right}
								y1={y(tick)}
								y2={y(tick)}
							/>
							<text
								className={styles.axisLabel}
								x={margin.left - 14}
								y={y(tick) + 4}
								textAnchor="end"
							>
								{tick}
							</text>
						</g>
					))}
				<AxisTitles
					width={width}
					height={height}
					margin={margin}
					x={config.xLabel}
					y="Intelligence score"
					compact
				/>
				<text
					className={styles.cornerLabel}
					x={cornerX}
					y={margin.top + 26}
					textAnchor={cornerAnchor}
				>
					{config.corner}
				</text>
				{data.slice(0, 130).map((point) => {
					const highlighted = bestPointId === point.model.id;
					const radius = clamp((point.agentic ?? 35) / 12, 3, 8);
					const cx = x(point.x);
					const cy = y(point.y);
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
								r={highlighted ? radius + 2 : radius}
								fill={providerColor(point.model.provider)}
								stroke={highlighted ? "var(--ink)" : "rgba(8,9,9,0.7)"}
								strokeWidth={highlighted ? 2.4 : 1}
								opacity={highlighted ? 0.96 : 0.34}
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
				kicker="Graph 04 / Context runway"
				title="Context runway"
				copy="Context runway appears when context and throughput metrics are available under the current filters."
			>
				<EmptyChart />
			</Panel>
		);
	}

	const width = 760;
	const height = 460;
	const margin = { top: 30, right: 72, bottom: 72, left: 70 };
	const xDomain = positiveDomain(
		candidates.map((model) => Number(model.context_window?.context)),
	);
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
	const labelSet = new Set(candidates.slice(0, 3).map((model) => model.id));

	return (
		<Panel
			kicker="Graph 04 / Context runway"
			title="Context runway"
			copy="Context window plotted against median output throughput."
			chips={["bubble = value"]}
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
				>
					<PlotFrame width={width} height={height} margin={margin} />
					{[32_000, 128_000, 256_000, 1_000_000, 2_000_000, 10_000_000]
						.filter((tick) => tick >= xDomain[0] && tick <= xDomain[1])
						.map((tick) => (
							<g key={`x-${tick}`}>
								<line
									className={styles.gridLine}
									x1={x(tick)}
									x2={x(tick)}
									y1={margin.top}
									y2={height - margin.bottom}
								/>
								<text
									className={styles.axisLabel}
									x={x(tick)}
									y={height - 26}
									textAnchor="middle"
								>
									{fmtCompact(tick)}
								</text>
							</g>
						))}
					{[20, 50, 100, 250, 500, 1000, 2500]
						.filter((tick) => tick >= yDomain[0] && tick <= yDomain[1])
						.map((tick) => (
							<g key={`y-${tick}`}>
								<line
									className={styles.gridLine}
									x1={margin.left}
									x2={width - margin.right}
									y1={y(tick)}
									y2={y(tick)}
								/>
								<text
									className={styles.axisLabel}
									x={margin.left - 18}
									y={y(tick) + 4}
									textAnchor="end"
								>
									{fmtCompact(tick)}
								</text>
							</g>
						))}
					<AxisTitles
						width={width}
						height={height}
						margin={margin}
						x="Context window, log scale"
						y="Output tokens per second, log scale"
					/>
					{candidates.slice(0, 90).map((model) => {
						const cx = x(Number(model.context_window?.context));
						const cy = y(
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
									r={clamp(
										(model.relative_scores.value_score ?? 25) / 9,
										3,
										10,
									)}
									fill={providerColor(model.provider)}
									stroke="rgba(8,9,9,0.7)"
									strokeWidth={1}
									opacity={labeled ? 0.9 : 0.34}
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

function PlotFrame({
	width,
	height,
	margin,
}: {
	width: number;
	height: number;
	margin: Margin;
}) {
	return (
		<rect
			x={margin.left}
			y={margin.top}
			width={width - margin.left - margin.right}
			height={height - margin.top - margin.bottom}
			fill="rgba(255,255,255,0.015)"
		/>
	);
}

function AxisTitles({
	width,
	height,
	margin,
	x,
	y,
	compact = false,
}: {
	width: number;
	height: number;
	margin: Margin;
	x: string;
	y: string;
	compact?: boolean;
}) {
	const plotLeft = margin.left;
	const plotRight = width - margin.right;
	const plotBottom = height - margin.bottom;
	const plotMiddleY = margin.top + (height - margin.top - margin.bottom) / 2;
	const yTitleX = compact ? 14 : 18;
	return (
		<>
			<text
				className={styles.axisTitle}
				x={plotLeft + (plotRight - plotLeft) / 2}
				y={plotBottom + (compact ? 58 : 60)}
				textAnchor="middle"
			>
				{x}
			</text>
			<text
				className={styles.axisTitle}
				x={yTitleX}
				y={plotMiddleY}
				textAnchor="middle"
				transform={`rotate(-90 ${yTitleX} ${plotMiddleY})`}
			>
				{y}
			</text>
		</>
	);
}

function PointHitTarget({
	cx,
	cy,
	model,
	rows,
	setHover,
	hoverTitle,
}: {
	cx: number;
	cy: number;
	model: ModelStatsSelectedModel;
	rows: HoverRow[];
	setHover: HoverSetter;
	hoverTitle?: string;
}) {
	const size = 28;
	const displayName = hoverTitle ?? modelName(model);
	return (
		<foreignObject
			x={cx - size / 2}
			y={cy - size / 2}
			width={size}
			height={size}
		>
			<button
				type="button"
				className={styles.pointButton}
				aria-label={`Show details for ${displayName}`}
				onPointerEnter={(event) =>
					setHover(pointHover(event, model, rows, displayName))
				}
				onFocus={(event) =>
					setHover(focusHover(event.currentTarget, model, rows, displayName))
				}
				onPointerMove={(event) =>
					setHover((hover) =>
						hover
							? {
									...hover,
									left: event.clientX,
									top: event.clientY,
								}
							: null,
					)
				}
				onPointerLeave={() => setHover(null)}
				onBlur={() => setHover(null)}
			/>
		</foreignObject>
	);
}

function PointLabel({
	model,
	cx,
	cy,
	width,
	margin,
	height,
}: {
	model: ModelStatsSelectedModel;
	cx: number;
	cy: number;
	width: number;
	margin: Margin;
	height: number;
}) {
	const labelOnLeft = cx > width - margin.right - 120;
	const xOffset = 10;
	const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
	return (
		<text
			className={styles.pointLabel}
			x={labelOnLeft ? cx - xOffset : cx + xOffset}
			y={y}
			textAnchor={labelOnLeft ? "end" : "start"}
		>
			{shortLabel(model)}
		</text>
	);
}

function DeepSWEPointLabel({
	label,
	cx,
	cy,
	width,
	margin,
	height,
	xOffset = 10,
}: {
	label: string;
	cx: number;
	cy: number;
	width: number;
	margin: Margin;
	height: number;
	xOffset?: number;
}) {
	const labelOnLeft = cx > width - margin.right - 135;
	const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
	return (
		<text
			className={styles.pointLabel}
			x={labelOnLeft ? cx - xOffset : cx + xOffset}
			y={y}
			textAnchor={labelOnLeft ? "end" : "start"}
		>
			{label}
		</text>
	);
}

function HoverCard({ hover }: { hover: HoverState }) {
	const left = Math.min(Math.max(14, hover.left + 16), window.innerWidth - 280);
	const top = Math.min(Math.max(14, hover.top + 16), window.innerHeight - 210);
	return (
		<div
			className={styles.hoverCard}
			style={
				{
					"--hover-color": hover.color,
					transform: `translate3d(${left}px, ${top}px, 0)`,
				} as React.CSSProperties
			}
		>
			<div className={styles.hoverCardHead}>
				<span className={styles.hoverCardLogo}>
					{hover.logo ? (
						<Image
							src={hover.logo}
							alt=""
							width={26}
							height={26}
							loading="lazy"
							unoptimized
							onError={(event) => {
								event.currentTarget.hidden = true;
							}}
						/>
					) : null}
				</span>
				<div>
					<div className={styles.hoverCardTitle}>{hover.model}</div>
					<div className={styles.hoverCardProvider}>{hover.provider}</div>
				</div>
			</div>
			<div className={styles.hoverCardRows}>
				{hover.rows.map(([label, value]) => (
					<div key={label} className={styles.hoverCardRow}>
						<span>{label}</span>
						<span>{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function EmptyChart({
	message = "No models match the current filters.",
}: {
	message?: string;
}) {
	return <div className={styles.error}>{message}</div>;
}

function FilterButton({
	active,
	color,
	label,
	count,
	onClick,
}: {
	active: boolean;
	color: string;
	label: string;
	count: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={styles.filterButton}
			aria-pressed={active}
			style={{ "--provider-color": color } as React.CSSProperties}
			onClick={onClick}
		>
			<span className={styles.filterSwatch} />
			<span>{label}</span>
			<span>{fmtCompact(count)}</span>
		</button>
	);
}

function SummaryCard({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className={styles.summaryCard}>
			<div className={styles.summaryLabel}>{label}</div>
			<span className={styles.summaryValue}>{value}</span>
			<span className={styles.summaryDetail}>{detail}</span>
		</div>
	);
}
