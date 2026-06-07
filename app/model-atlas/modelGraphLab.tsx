"use client";

import { extent, max, median } from "d3-array";
import { scaleLinear, scaleLog, scaleSqrt } from "d3-scale";
import { line } from "d3-shape";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
	ModelStatsSelectedModel,
	ModelStatsSelectedPayload,
} from "../../src/model-atlas/llm/llm-stats/types";
import styles from "./modelGraphLab.module.css";

type ProviderOption = {
	slug: string;
	label: string;
	count: number;
	color: string;
};

type HoverRow = readonly [string, string];

type HoverState = {
	left: number;
	top: number;
	model: string;
	provider: string;
	color: string;
	rows: HoverRow[];
};

type HoverSetter = Dispatch<SetStateAction<HoverState | null>>;

type Point = {
	model: ModelStatsSelectedModel;
	x: number;
	y: number;
	overall: number | null;
	agentic: number | null;
};

type InteractionConfig = {
	key: string;
	title: string;
	corner: string;
	lowerBetter: boolean;
	log: boolean;
	ticks: number[];
	get: (model: ModelStatsSelectedModel) => number | null;
	format: (value: number) => string;
	xLabel: string;
	read: string;
};

type Margin = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

type ModelLimit = 30 | 60 | "all";

const providerThemeColors: Record<string, string> = {
	alibaba: "#ff7018",
	anthropic: "#d07860",
	amazon: "#ff9800",
	aws: "#ff9800",
	deepseek: "#2040e8",
	google: "#38a850",
	kimi: "#0878ff",
	meta: "#0088f8",
	minimax: "#e83868",
	mistral: "#ff6800",
	mistralai: "#ff6800",
	moonshotai: "#0878ff",
	nvidia: "#88b838",
	openai: "#eeeeea",
	qwen: "#ff7018",
	tencent: "#1820a8",
	upstage: "#8058f8",
	xai: "#7070d0",
	"x-ai": "#7070d0",
	xiaomi: "#ff6800",
	zai: "#2080f8",
	"z-ai": "#2080f8",
};

const providerDisplayLabels: Record<string, string> = {
	alibaba: "Alibaba",
	anthropic: "Anthropic",
	amazon: "Amazon",
	aws: "AWS",
	deepseek: "DeepSeek",
	google: "Google",
	kimi: "Kimi",
	meta: "Meta",
	minimax: "MiniMax",
	mistral: "Mistral",
	mistralai: "Mistral",
	moonshotai: "Moonshot AI",
	nvidia: "NVIDIA",
	openai: "OpenAI",
	qwen: "Qwen",
	tencent: "Tencent",
	upstage: "Upstage",
	xai: "xAI",
	"x-ai": "xAI",
	xiaomi: "Xiaomi",
	zai: "Z AI",
	"z-ai": "Z AI",
};

const fallbackProviderColors = [
	"#ff5a46",
	"#f6b44b",
	"#7cc69b",
	"#7aa7ff",
	"#d078ff",
	"#5cc8c8",
	"#d7d46a",
];

const benchmarkLabels: Record<string, string> = {
	apex_agents: "APEX",
	critpt: "CritPt",
	deep_swe: "DeepSWE",
	gdpval_normalized: "GDPval",
	hle: "HLE",
	ifbench: "IFBench",
	lcr: "LCR",
	omniscience_accuracy: "Omni Acc",
	scicode: "SciCode",
	terminal_bench_2: "TB 2.0",
	terminalbench_hard: "TB Hard",
};

const costFilterOptions: Array<"all" | number> = ["all", 1, 2, 5, 10, 25];
const modelLimitOptions: ModelLimit[] = [30, 60, "all"];

const interactionConfigs: InteractionConfig[] = [
	{
		key: "price",
		title: "Intelligence vs blended price",
		corner: "upper left",
		lowerBetter: true,
		log: true,
		ticks: [0.25, 0.5, 1, 2, 5, 10, 25],
		get: (model) => finiteValue(model.cost?.blended_price),
		format: fmtMoney,
		xLabel: "Blended price per 1M tokens",
		read: "Shows whether price actually buys broad intelligence, and where cheap high-ceiling models break the curve.",
	},
	{
		key: "speed",
		title: "Intelligence vs output speed",
		corner: "upper right",
		lowerBetter: false,
		log: true,
		ticks: [20, 50, 100, 250, 500, 1000, 2500],
		get: (model) =>
			finiteValue(model.speed?.throughput_tokens_per_second_median),
		format: (value) => `${fmtCompact(value)} t/s`,
		xLabel: "Output tokens per second",
		read: "Separates fast utility models from models that are both fast enough and genuinely capable.",
	},
	{
		key: "response",
		title: "Intelligence vs response time",
		corner: "upper left",
		lowerBetter: true,
		log: true,
		ticks: [2, 5, 10, 20, 40, 80],
		get: (model) => finiteValue(model.speed?.e2e_latency_seconds_median),
		format: fmtSeconds,
		xLabel: "End-to-end response time",
		read: "Makes the practical waiting-time tradeoff visible instead of ranking intelligence in isolation.",
	},
	{
		key: "context",
		title: "Intelligence vs context window",
		corner: "upper right",
		lowerBetter: false,
		log: true,
		ticks: [32_000, 128_000, 256_000, 1_000_000, 2_000_000, 10_000_000],
		get: (model) => finiteValue(model.context_window?.context),
		format: fmtCompact,
		xLabel: "Context tokens",
		read: "Highlights when huge context is real leverage versus just a large number beside a weaker model.",
	},
	{
		key: "aaCost",
		title: "Intelligence vs AA task cost",
		corner: "upper left",
		lowerBetter: true,
		log: true,
		ticks: [0.02, 0.05, 0.1, 0.25, 0.5, 1],
		get: (model) => finiteValue(model.task_metrics?.artificial_analysis?.cost),
		format: fmtMoney,
		xLabel: "AA task cost",
		read: "Connects benchmark quality to the cost of producing that quality during the evaluation workload.",
	},
	{
		key: "deepSwe",
		title: "Intelligence vs DeepSWE accuracy",
		corner: "upper right",
		lowerBetter: false,
		log: false,
		ticks: [0, 20, 40, 60, 80],
		get: (model) => percent(model.evaluations?.deep_swe),
		format: (value) => `${value.toFixed(0)}%`,
		xLabel: "DeepSWE accuracy",
		read: "Shows when broad intelligence and long-horizon coding reliability agree, and where they diverge.",
	},
];

export function ModelGraphLab({
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
			<main className={styles.lab}>
				<div className={styles.error}>Loading the graph lab.</div>
			</main>
		);
	}

	if (!initialPayload || allModels.length === 0) {
		return (
			<main className={styles.lab}>
				<div className={styles.error}>
					Unable to load the Model Atlas snapshot.
				</div>
			</main>
		);
	}

	return (
		<main className={styles.lab}>
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
					<DeepSwePanel models={models} setHover={setHover} />
					<InteractionMatrix models={models} setHover={setHover} />
					<FingerprintPanel models={models} />
					<HeatmapPanel
						models={models}
						keys={initialPayload.metadata.scoring.selected_benchmark_keys}
					/>
					<RunwayPanel models={models} setHover={setHover} />
					<EfficiencyTablePanel models={models} />
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
	children,
	note,
	wide = false,
}: {
	kicker: string;
	title: string;
	copy?: string;
	chips?: string[];
	children: React.ReactNode;
	note?: React.ReactNode;
	wide?: boolean;
}) {
	return (
		<article className={`${styles.panel} ${wide ? styles.wide : ""}`}>
			<div className={styles.panelHead}>
				<div className={styles.panelMeta}>
					<p className={styles.chartKicker}>{kicker}</p>
					{chips && chips.length > 0 ? (
						<div className={styles.chips}>
							{chips.map((chip) => (
								<span key={chip} className={styles.chip}>
									{chip}
								</span>
							))}
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
				title="Capability per blended dollar"
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
			title="Capability per blended dollar"
			copy="A tradeoff scatter for the Artificial Analysis-style intelligence versus price story, with the efficient budget envelope pulled forward."
			chips={["line = observed envelope"]}
			note={
				<>
					<b>Read:</b> The step line marks the best available intelligence once
					you raise the budget. It is an envelope of observed models, not a
					fitted curve.
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
								fmtScore(model.relative_scores.intelligence_score),
							],
							["Agentic", fmtScore(model.relative_scores.agentic_score)],
							["Blend", fmtMoney(Number(model.cost?.blended_price))],
							["Overall", fmtScore(model.relative_scores.overall_score)],
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
			<div className={styles.frontierStrip}>
				{visibleFrontier
					.slice(-4)
					.reverse()
					.map((model) => (
						<div key={model.id ?? model.name} className={styles.frontierCard}>
							<div className={styles.frontierCardName}>{modelName(model)}</div>
							<span className={styles.frontierCardValue}>
								{fmtScore(model.relative_scores.intelligence_score)}
							</span>
							<span className={styles.frontierCardNote}>
								{fmtMoney(Number(model.cost?.blended_price))} blend
							</span>
						</div>
					))}
			</div>
		</Panel>
	);
}

function DeepSwePanel({
	models,
	setHover,
}: {
	models: ModelStatsSelectedModel[];
	setHover: HoverSetter;
}) {
	const [metricKey, setMetricKey] = useState<"cost" | "time" | "tokens">(
		"cost",
	);
	const deep = deepSweRows(models);

	if (deep.length === 0) {
		return (
			<Panel
				kicker="Graph 02 / DeepSWE resource axis"
				title="Pass rate is not just spend"
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
	const metricValues = deep.map(metric.get).filter(finite);
	const xDomain = positiveDomain(metricValues);
	const passMax =
		max(deep, (model) => percent(model.evaluations?.deep_swe)) ?? 75;
	const x = scaleLog()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLinear()
		.domain([0, Math.max(75, passMax + 4)])
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const bubbleValue = (model: ModelStatsSelectedModel) => {
		if (metricKey === "time") {
			return Number(model.task_metrics?.deep_swe?.cost);
		}
		if (metricKey === "tokens") {
			return Number(model.task_metrics?.deep_swe?.seconds) / 60;
		}
		return Number(model.task_metrics?.deep_swe?.output_tokens);
	};
	const bubbleDomain = positiveDomain(deep.map(bubbleValue).filter(finite));
	const bubbleScale = scaleSqrt()
		.domain(bubbleDomain)
		.range([5, 15])
		.clamp(true);
	const labelSet = new Set(deep.slice(0, 8).map((model) => model.id));
	const leader = deep[0] as ModelStatsSelectedModel;
	const bestAxis =
		[...deep].sort(
			(left, right) =>
				Number(percent(right.evaluations?.deep_swe)) / metric.get(right) -
				Number(percent(left.evaluations?.deep_swe)) / metric.get(left),
		)[0] ?? leader;
	const leanAboveFloor =
		[...deep]
			.filter((model) => Number(percent(model.evaluations?.deep_swe)) >= 20)
			.sort((left, right) => metric.get(left) - metric.get(right))[0] ??
		bestAxis;

	return (
		<Panel
			kicker="Graph 02 / DeepSWE resource axis"
			title="Accuracy is not just spend"
			copy="The official DeepSWE page lets the scatter pivot between cost, time, and output tokens; this draft keeps that behavior and adds dot-size encoding for the hidden resource."
			chips={[
				`leader ${fmtPercent(leader.evaluations?.deep_swe)}`,
				"cost / time / output tokens",
				`best accuracy/${metric.unit} ${shortName(bestAxis)}`,
			]}
			note={
				<>
					<b>Read:</b> Use the resource buttons to ask three different
					questions: who buys accuracy cheaply, who gets it quickly, and who
					gets it with fewer generated tokens.
				</>
			}
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
							onClick={() => setMetricKey(key as "cost" | "time" | "tokens")}
						>
							{config.shortLabel}
						</button>
					))}
				</fieldset>
				<div className={styles.resourceCaption}>
					Bubble size = {metric.bubble}
				</div>
			</div>
			<div className={styles.chartWrap}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label="DeepSWE accuracy by resource axis scatter plot"
				>
					<PlotFrame width={width} height={height} margin={margin} />
					{[0, 15, 30, 45, 60, 75].map((tick) => (
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
								{tick}%
							</text>
						</g>
					))}
					{metric.ticks
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
					<path
						d={`M${margin.left},${y(18)} C${x(xDomain[0] * 1.8)},${y(42)} ${x(Math.sqrt(xDomain[0] * xDomain[1]))},${y(58)} ${width - margin.right},${y(68)}`}
						fill="none"
						stroke="rgba(246,180,75,0.38)"
						strokeWidth={2}
						strokeDasharray="7 7"
					/>
					<text
						className={styles.calloutLabel}
						x={x(Math.sqrt(xDomain[0] * xDomain[1]))}
						y={y(63)}
					>
						diminishing returns band
					</text>
					{deep.map((model) => {
						const axisValue = metric.get(model);
						const score = Number(percent(model.evaluations?.deep_swe));
						const cx = x(axisValue);
						const cy = y(score);
						const labeled = labelSet.has(model.id);
						const rows: HoverRow[] = [
							["DeepSWE", fmtPercent(model.evaluations?.deep_swe)],
							["Cost", fmtMoney(Number(model.task_metrics?.deep_swe?.cost))],
							[
								"Time",
								fmtMinutes(Number(model.task_metrics?.deep_swe?.seconds)),
							],
							[
								"Output tokens",
								fmtCompact(Number(model.task_metrics?.deep_swe?.output_tokens)),
							],
						];
						return (
							<g key={model.id ?? model.name}>
								<circle
									className={styles.datavizPoint}
									cx={cx}
									cy={cy}
									r={bubbleScale(bubbleValue(model))}
									fill={providerColor(model.provider)}
									stroke="rgba(8,9,9,0.7)"
									strokeWidth={1}
									opacity={labeled ? 0.9 : 0.32}
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
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={`${modelName(leader)} - ${fmtPercent(leader.evaluations?.deep_swe)}`}
					detail={`${fmtMoney(Number(leader.task_metrics?.deep_swe?.cost))} / ${fmtMinutes(Number(leader.task_metrics?.deep_swe?.seconds))}`}
				/>
				<SummaryCard
					label={`Best accuracy per ${metric.unit}`}
					value={modelName(bestAxis)}
					detail={(
						Number(percent(bestAxis.evaluations?.deep_swe)) /
						metric.get(bestAxis)
					).toFixed(metricKey === "tokens" ? 4 : 1)}
				/>
				<SummaryCard
					label="Leanest above 20%"
					value={modelName(leanAboveFloor)}
					detail={metric.format(metric.get(leanAboveFloor))}
				/>
				<SummaryCard
					label="Median accuracy"
					value={fmtPercent(
						median(deep, (model) => percent(model.evaluations?.deep_swe)),
					)}
					detail={`${deep.length} models`}
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
			title="Keep intelligence fixed, change the question"
			copy="The table already tells you who ranks highest. This matrix asks whether intelligence moves with price, speed, response time, context, task cost, and coding reliability."
			chips={[
				"AA-style comparisons",
				"not another rank list",
				"best corner labels",
			]}
			wide
			note={
				<>
					<b>Read:</b> Every plot uses intelligence on the vertical axis. The
					useful model is usually in the named corner, not necessarily the model
					with the highest standalone score.
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
						["Intelligence", fmtScore(point.y)],
						[config.xLabel, config.format(point.x)],
						["Overall", fmtScore(point.overall)],
						["Agentic", fmtScore(point.agentic)],
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

function FingerprintPanel({ models }: { models: ModelStatsSelectedModel[] }) {
	return (
		<Panel
			kicker="Graph 04 / Capability fingerprints"
			title="Why two adjacent ranks feel different"
			copy="A row fingerprint is faster to scan than four separate numeric columns when the question is which workload a model naturally fits."
			chips={["top 10 overall", "four-score shape"]}
			note={
				<>
					<b>Read:</b> The shape matters more than the rank. A model with weaker
					speed but stronger agentic score belongs in a different default lane
					than a cheap fast model.
				</>
			}
		>
			<div className={styles.radarList}>
				{models.slice(0, 10).map((model, index) => (
					<div key={model.id ?? model.name} className={styles.radarRow}>
						<div className={styles.modelTitle}>
							<div className={styles.modelName}>{modelName(model)}</div>
							<div className={styles.modelProvider}>{providerName(model)}</div>
						</div>
						<div className={styles.scoreBars}>
							<ScoreBar
								label="Int"
								value={model.relative_scores.intelligence_score}
								kind="intel"
							/>
							<ScoreBar
								label="Agt"
								value={model.relative_scores.agentic_score}
								kind="agentic"
							/>
							<ScoreBar
								label="Spd"
								value={model.relative_scores.speed_score}
								kind="speed"
							/>
							<ScoreBar
								label="Val"
								value={model.relative_scores.value_score}
								kind="value"
							/>
						</div>
						<div className={styles.rankPill}>#{index + 1}</div>
					</div>
				))}
			</div>
		</Panel>
	);
}

function HeatmapPanel({
	models,
	keys,
}: {
	models: ModelStatsSelectedModel[];
	keys: string[];
}) {
	const visibleKeys = keys.length > 0 ? keys : Object.keys(benchmarkLabels);
	const top = models.filter((model) => model.evaluations).slice(0, 12);
	return (
		<Panel
			kicker="Graph 05 / Benchmark breadth"
			title="Broad strength versus one-benchmark spikes"
			copy="This turns selected benchmark coverage into a texture. It can reveal whether a high overall rank is broad, coding-heavy, or carried by one outlier."
			chips={[`${top.length} models`, `${visibleKeys.length} benchmarks`]}
			note={
				<>
					<b>Read:</b> Warm continuous rows are balanced. Striped gaps show
					missing benchmark evidence, which should reduce confidence in a single
					blended score.
				</>
			}
		>
			<div className={styles.heatmap}>
				<div
					className={styles.heatmapGrid}
					style={{
						gridTemplateColumns: `170px repeat(${visibleKeys.length}, minmax(52px, 1fr))`,
					}}
				>
					<div className={styles.heatmapHead} />
					{visibleKeys.map((key) => (
						<div key={key} className={styles.heatmapHead}>
							{benchmarkLabels[key] ?? key}
						</div>
					))}
					{top.flatMap((model) => [
						<div key={`${model.id}-model`} className={styles.heatmapModel}>
							{modelName(model).replace(" Preview", "")}
						</div>,
						...visibleKeys.map((key) => {
							const score = percent(model.evaluations?.[key]);
							const value = score == null ? 0 : clamp(score, 0, 100);
							return (
								<div
									key={`${model.id}-${key}`}
									className={styles.heatmapCell}
									data-missing={score == null}
									style={{ "--value": value } as React.CSSProperties}
									title={`${modelName(model)} / ${benchmarkLabels[key] ?? key}: ${
										score == null ? "missing" : `${score.toFixed(1)}%`
									}`}
								/>
							);
						}),
					])}
				</div>
			</div>
		</Panel>
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
				kicker="Graph 06 / Context runway"
				title="How much room and how fast"
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
			kicker="Graph 06 / Context runway"
			title="How much room and how fast"
			copy="Long-context claims are more useful when paired with throughput. This plot separates giant-but-slow context from models that can actually move through large inputs."
			chips={["bubble = value"]}
			note={
				<>
					<b>Read:</b> Upper right is the long-context runway. It is a better
					signal for RAG and repository-scale workflows than context alone.
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
							["Context", fmtCompact(Number(model.context_window?.context))],
							[
								"Throughput",
								`${fmtCompact(
									Number(model.speed?.throughput_tokens_per_second_median),
								)} t/s`,
							],
							["Value", fmtScore(model.relative_scores.value_score)],
							["Overall", fmtScore(model.relative_scores.overall_score)],
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

function EfficiencyTablePanel({
	models,
}: {
	models: ModelStatsSelectedModel[];
}) {
	const rows = models
		.filter(
			(model) =>
				finite(model.evaluations?.deep_swe) &&
				finite(model.task_metrics?.deep_swe?.cost),
		)
		.map((model) => {
			const pass = Number(percent(model.evaluations?.deep_swe));
			const cost = Number(model.task_metrics?.deep_swe?.cost);
			const seconds = Number(model.task_metrics?.deep_swe?.seconds);
			return {
				model,
				pass,
				cost,
				seconds,
				passPerDollar: pass / cost,
			};
		})
		.sort((left, right) => right.passPerDollar - left.passPerDollar)
		.slice(0, 8);

	return (
		<Panel
			kicker="Graph 07 / Decision inset"
			title="The shortlist table that belongs beside the graphs"
			copy="The table is intentionally small: it only shows the best DeepSWE accuracy-per-dollar candidates, because the graph already carries the broad visual story."
			chips={["accuracy/$ sorted", "DeepSWE only"]}
			note={
				<>
					<b>Read:</b> This is a companion to the charts, not a replacement
					leaderboard. It answers the operational question after the visual
					comparison narrows the field.
				</>
			}
		>
			<table className={styles.tableMini}>
				<thead>
					<tr>
						<th>Model</th>
						<th>Pass</th>
						<th>Cost</th>
						<th>Time</th>
						<th>Pass/$</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.model.id ?? row.model.name}>
							<td>{modelName(row.model)}</td>
							<td>{fmtPercent(row.pass)}</td>
							<td>{fmtMoney(row.cost)}</td>
							<td>{fmtMinutes(row.seconds)}</td>
							<td>{row.passPerDollar.toFixed(1)}</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className={styles.legend}>
				<span className={styles.accentLegend}>
					<i /> Highlighted frontier
				</span>
				<span className={styles.goldLegend}>
					<i /> Runway leaders
				</span>
				<span className={styles.goodLegend}>
					<i /> Value strength
				</span>
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
}: {
	cx: number;
	cy: number;
	model: ModelStatsSelectedModel;
	rows: HoverRow[];
	setHover: HoverSetter;
}) {
	const size = 28;
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
				aria-label={`Show details for ${modelName(model)}`}
				onPointerEnter={(event) => setHover(pointHover(event, model, rows))}
				onFocus={(event) =>
					setHover(focusHover(event.currentTarget, model, rows))
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
				<span className={styles.hoverCardSwatch} />
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

function ScoreBar({
	label,
	value,
	kind,
}: {
	label: string;
	value: number | null | undefined;
	kind: string;
}) {
	const normalized = clamp(value ?? 0, 0, 100);
	return (
		<div className={`${styles.scoreBar} ${styles[kind]}`}>
			<span>{label}</span>
			<span className={styles.barTrack}>
				<span
					className={styles.barFill}
					style={{ "--value": normalized } as React.CSSProperties}
				/>
			</span>
			<span>{fmtScore(value)}</span>
		</div>
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
			<span className={styles.frontierCardNote}>{detail}</span>
		</div>
	);
}

const deepSweMetricConfig = {
	cost: {
		label: "Avg cost per task",
		shortLabel: "Cost",
		unit: "dollar",
		get: (model: ModelStatsSelectedModel) =>
			Number(model.task_metrics?.deep_swe?.cost),
		format: fmtMoney,
		ticks: [0.5, 1, 2, 5, 10, 20],
		bubble: "output tokens",
	},
	time: {
		label: "Avg time per task",
		shortLabel: "Time",
		unit: "minute",
		get: (model: ModelStatsSelectedModel) =>
			Number(model.task_metrics?.deep_swe?.seconds) / 60,
		format: (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}m`,
		ticks: [10, 20, 30, 45, 60],
		bubble: "cost",
	},
	tokens: {
		label: "Avg output tokens",
		shortLabel: "Output tokens",
		unit: "output token",
		get: (model: ModelStatsSelectedModel) =>
			Number(model.task_metrics?.deep_swe?.output_tokens),
		format: fmtCompact,
		ticks: [20_000, 50_000, 100_000, 200_000],
		bubble: "time",
	},
};

function deepSweRows(models: ModelStatsSelectedModel[]) {
	return models
		.filter(
			(model) =>
				finite(model.evaluations?.deep_swe) &&
				finite(model.task_metrics?.deep_swe?.cost) &&
				Number(model.task_metrics?.deep_swe?.cost) > 0,
		)
		.sort(
			(left, right) =>
				Number(percent(right.evaluations?.deep_swe)) -
				Number(percent(left.evaluations?.deep_swe)),
		);
}

function providerOptions(models: ModelStatsSelectedModel[]): ProviderOption[] {
	const byProvider = new Map<string, ProviderOption>();
	for (const model of models) {
		const slug = providerSlug(model.provider);
		const current = byProvider.get(slug) ?? {
			slug,
			label: providerName(model),
			count: 0,
			color: providerColor(model.provider),
		};
		current.count += 1;
		byProvider.set(slug, current);
	}
	return [...byProvider.values()]
		.sort(
			(left, right) =>
				right.count - left.count || left.label.localeCompare(right.label),
		)
		.slice(0, 14);
}

function modelKey(model: ModelStatsSelectedModel) {
	return model.id ?? model.name ?? "";
}

function pointHover(
	event: React.PointerEvent<Element>,
	model: ModelStatsSelectedModel,
	rows: HoverRow[],
): HoverState {
	return {
		left: event.clientX,
		top: event.clientY,
		model: modelName(model),
		provider: providerName(model),
		color: providerColor(model.provider),
		rows,
	};
}

function focusHover(
	target: Element,
	model: ModelStatsSelectedModel,
	rows: HoverRow[],
): HoverState {
	const rect = target.getBoundingClientRect();
	return {
		left: rect.left + rect.width / 2,
		top: rect.top + rect.height / 2,
		model: modelName(model),
		provider: providerName(model),
		color: providerColor(model.provider),
		rows,
	};
}

function stepPath(
	points: ModelStatsSelectedModel[],
	x: (value: number) => number,
	y: (value: number) => number,
) {
	if (points.length === 0) {
		return "";
	}
	const [first, ...rest] = points;
	if (first == null) {
		return "";
	}
	let path = `M${x(Number(first.cost?.blended_price))},${y(first.relative_scores.intelligence_score)}`;
	for (const point of rest) {
		const nextX = x(Number(point.cost?.blended_price));
		const nextY = y(point.relative_scores.intelligence_score);
		path += ` H${nextX} V${nextY}`;
	}
	return path;
}

function correlationLabel(
	points: Point[],
	transformX: (value: number) => number,
) {
	if (points.length < 3) {
		return "r --";
	}
	const xs = points.map((point) => transformX(point.x));
	const ys = points.map((point) => point.y);
	const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
	const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
	let numerator = 0;
	let varianceX = 0;
	let varianceY = 0;
	for (const [index, xValue] of xs.entries()) {
		const dx = xValue - meanX;
		const dy = (ys[index] ?? meanY) - meanY;
		numerator += dx * dy;
		varianceX += dx * dx;
		varianceY += dy * dy;
	}
	const denominator = Math.sqrt(varianceX * varianceY);
	if (denominator === 0) {
		return "r --";
	}
	const r = numerator / denominator;
	return `r ${r >= 0 ? "+" : ""}${r.toFixed(2)}`;
}

function positiveDomain(values: number[]): [number, number] {
	const positive = values.filter((value) => finite(value) && value > 0);
	const low = Math.min(...positive);
	const high = Math.max(...positive);
	if (!finite(low) || !finite(high)) {
		return [0.001, 1];
	}
	if (low === high) {
		return [Math.max(low / 1.4, 0.001), high * 1.4];
	}
	return [Math.max(low / 1.08, 0.001), high * 1.08];
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function finiteValue(value: unknown): number | null {
	return finite(value) ? value : null;
}

function clamp(value: number, minValue: number, maxValue: number) {
	return Math.max(minValue, Math.min(maxValue, value));
}

function percent(value: unknown) {
	if (!finite(value)) {
		return null;
	}
	return value <= 1 ? value * 100 : value;
}

function fmtPercent(value: unknown, digits = 0) {
	const normalized = percent(value);
	return normalized == null ? "--" : `${normalized.toFixed(digits)}%`;
}

function fmtScore(value: number | null | undefined) {
	return finite(value) ? value.toFixed(0) : "--";
}

function fmtMoney(value: number | null | undefined) {
	if (!finite(value)) {
		return "--";
	}
	if (value < 1) {
		return `$${value.toFixed(2)}`;
	}
	if (value < 10) {
		return `$${value.toFixed(1)}`;
	}
	return `$${value.toFixed(0)}`;
}

function fmtCompact(value: number | null | undefined) {
	if (!finite(value)) {
		return "--";
	}
	if (Math.abs(value) >= 1_000_000) {
		return `${Number((value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1))}M`;
	}
	if (Math.abs(value) >= 1_000) {
		return `${Number((value / 1_000).toFixed(value >= 10_000 ? 0 : 1))}K`;
	}
	if (Number.isInteger(value)) {
		return String(value);
	}
	return value.toFixed(value >= 10 ? 0 : 1);
}

function fmtSeconds(value: number) {
	return `${value.toFixed(value >= 10 ? 0 : 1)}s`;
}

function fmtMinutes(seconds: number | null | undefined) {
	if (!finite(seconds)) {
		return "--";
	}
	return `${(seconds / 60).toFixed(seconds > 600 ? 0 : 1)}m`;
}

function modelName(model: ModelStatsSelectedModel) {
	return model.name ?? model.id ?? "Unknown model";
}

function shortName(model: ModelStatsSelectedModel) {
	return modelName(model).split(" ").slice(0, 2).join(" ");
}

function shortLabel(model: ModelStatsSelectedModel) {
	return modelName(model)
		.replace(" Preview", "")
		.replace("Claude ", "")
		.replace("GPT-", "GPT ");
}

function providerName(model: ModelStatsSelectedModel | string | null) {
	const rawProvider = typeof model === "string" ? model : model?.provider;
	const slug = providerSlug(rawProvider);
	return providerDisplayLabels[slug] ?? rawProvider ?? "Unknown";
}

function providerSlug(provider: string | null | undefined) {
	return String(provider ?? "unknown")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function providerColor(provider: string | null | undefined) {
	const slug = providerSlug(provider);
	if (providerThemeColors[slug]) {
		return providerThemeColors[slug];
	}
	let hash = 0;
	for (const char of slug) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return (
		fallbackProviderColors[hash % fallbackProviderColors.length] ?? "#ff5a46"
	);
}
