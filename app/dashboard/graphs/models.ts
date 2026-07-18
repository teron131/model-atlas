/** Graph data shaping, filter options, and hover helpers. */

import type { PointerEvent } from "react";
import { minMaxScale } from "../../../src/model-atlas/math-utils";
import type { DeepSWELeaderboardRow } from "../../../src/model-atlas/scrapers/deep-swe";
import { canonicalModelKey } from "../../../src/model-atlas/shared";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../../../src/model-atlas/stats/types";
import {
	modelBaseDisplayName,
	modelDisplayName,
	modelVariantKey,
} from "../shared/modelDisplay";
import {
	providerAssetLogo,
	providerFilterKey,
	providerName,
	providerPaletteColor,
} from "../shared/providerTheme";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtMoney,
	fmtPercentScore,
	fmtSeconds,
	fmtTooltipMoney,
	fmtTooltipNumber,
	fmtTooltipPercent,
	percent,
} from "./format";
import type {
	CostFilter,
	DeepSWEChartRow,
	DeepSWEEffortMode,
	HoverRow,
	HoverState,
	InteractionConfig,
	ModelLimit,
	Point,
	ProviderFilters,
	ProviderOption,
} from "./types";

export const costFilterOptions: CostFilter[] = ["all", 1, 2, 5, 10, 25];
export const modelLimitOptions: ModelLimit[] = [30, 60, "all"];
const PROVIDER_FILTER_LIMIT = 14;
const PROVIDER_ORDER_TOP_SCORE_COUNT = 3;

export type ModelControlFilters = {
	providers: ProviderFilters;
	maxCost: CostFilter;
};

export const interactionConfigs: InteractionConfig[] = [
	{
		key: "price",
		title: "Intelligence vs blended price",
		fieldLabel: "Price",
		lowerIsBetter: true,
		logScale: true,
		ticks: [0.25, 0.5, 1, 2, 5, 10, 25],
		get: (model) => finiteValue(model.cost?.blended_price),
		format: fmtMoney,
		tooltipFormat: fmtTooltipMoney,
		xLabel: "Blended price per 1M tokens",
		hoverLabel: "Blended price",
	},
	{
		key: "speed",
		title: "Intelligence vs throughput",
		fieldLabel: "Throughput",
		lowerIsBetter: false,
		logScale: true,
		ticks: [20, 50, 100, 250, 500, 1000, 2500],
		get: (model) =>
			finiteValue(model.speed?.throughput_tokens_per_second_median),
		format: fmtCompact,
		tooltipFormat: (value) => `${fmtTooltipNumber(value)} t/s`,
		xLabel: "Output tokens per second (t/s)",
		hoverLabel: "Throughput",
		insight:
			"Separates fast utility models from models that are both fast enough and genuinely capable.",
	},
	{
		key: "response",
		title: "Intelligence vs response time",
		fieldLabel: "Response",
		lowerIsBetter: true,
		logScale: true,
		ticks: [2.5, 5, 10, 20, 40, 80],
		get: (model) => finiteValue(model.speed?.e2e_latency_seconds_median),
		format: fmtSeconds,
		tooltipFormat: (value) => `${fmtTooltipNumber(value)}s`,
		xLabel: "End-to-end response time",
		insight:
			"Makes the practical waiting-time tradeoff visible instead of ranking INTELLIGENCE in isolation.",
	},
	{
		key: "context",
		title: "Intelligence vs context window",
		fieldLabel: "Context",
		lowerIsBetter: false,
		logScale: true,
		ticks: [
			32_000, 128_000, 256_000, 400_000, 1_000_000, 2_000_000, 10_000_000,
		],
		get: (model) => finiteValue(model.context_window?.context),
		format: fmtCompact,
		tooltipFormat: fmtTooltipNumber,
		xLabel: "Context tokens",
		hoverLabel: "Context window",
		insight:
			"Highlights when huge context is real leverage versus just a large number beside a weaker model.",
	},
	{
		key: "artificialAnalysisCost",
		title: "Intelligence vs AA task cost",
		fieldLabel: "AA cost",
		lowerIsBetter: true,
		logScale: true,
		ticks: [0.02, 0.05, 0.1, 0.25, 0.5, 1],
		get: (model) => finiteValue(model.task_metrics?.artificial_analysis?.cost),
		format: fmtMoney,
		tooltipFormat: fmtTooltipMoney,
		xLabel: "AA task cost",
		insight:
			"Connects benchmark quality to the cost of producing that quality during the evaluation workload.",
	},
	{
		key: "frontierScore",
		title: "Intelligence vs frontier benchmark score",
		fieldLabel: "Frontier",
		lowerIsBetter: false,
		logScale: false,
		ticks: [0, 20, 40, 60, 80, 100],
		get: (model, context) =>
			context.frontierScoreByModel.get(modelVariantKey(model)) ?? null,
		format: (value) => `${value.toFixed(0)}%`,
		tooltipFormat: fmtPercentScore,
		xLabel: "MEAN NORMALIZED frontier benchmark score",
		insight:
			"Shows whether broad INTELLIGENCE agrees with each model's MEAN NORMALIZED frontier benchmark score.",
	},
];

export function frontierBenchmarkScoreByModel(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
) {
	const frontierKeys = Object.entries(portfolio)
		.filter(([, entry]) => entry.group === "frontier")
		.map(([key]) => key);
	const scoresByBenchmark = new Map<string, number[]>();
	for (const key of frontierKeys) {
		const scores = models
			.map((model) => percent(model.evaluations?.[key]))
			.filter(finite);
		if (scores.length > 0) {
			scoresByBenchmark.set(key, scores);
		}
	}

	const scoreByModel = new Map<string, number>();
	for (const model of models) {
		const normalizedScores = frontierKeys.flatMap((key) => {
			const score = percent(model.evaluations?.[key]);
			const benchmarkScores = scoresByBenchmark.get(key);
			if (score == null || benchmarkScores == null) {
				return [];
			}
			return [minMaxScale(benchmarkScores, score) ?? score];
		});
		if (normalizedScores.length > 0) {
			scoreByModel.set(
				modelVariantKey(model),
				normalizedScores.reduce((sum, value) => sum + value, 0) /
					normalizedScores.length,
			);
		}
	}
	return scoreByModel;
}

function deepSweMinutes(row: DeepSWEChartRow): number | null {
	const seconds = finiteValue(row.row.mean_duration_seconds);
	return seconds == null ? null : seconds / 60;
}

export const deepSweMetricConfig = {
	cost: {
		label: "Avg cost per task",
		shortLabel: "Cost",
		get: (row: DeepSWEChartRow) => row.row.mean_cost_usd,
		efficiencyLabel: "Best accuracy per dollar",
		efficiencyScore: (row: DeepSWEChartRow) =>
			Number(percent(row.row.pass_at_1)) / row.row.mean_cost_usd,
		formatEfficiency: (value: number) => value.toFixed(1),
		format: fmtMoney,
		ticks: [0.5, 1, 2, 5, 10, 20],
	},
	time: {
		label: "Avg time per task",
		shortLabel: "Time",
		get: deepSweMinutes,
		efficiencyLabel: "Best accuracy per minute",
		efficiencyScore: (row: DeepSWEChartRow) => {
			const minutes = deepSweMinutes(row);
			return minutes == null
				? null
				: Number(percent(row.row.pass_at_1)) / minutes;
		},
		formatEfficiency: (value: number) => value.toFixed(1),
		format: (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}m`,
		ticks: [10, 20, 30, 45, 60],
	},
	tokens: {
		label: "Avg output tokens",
		shortLabel: "Output tokens",
		get: (row: DeepSWEChartRow) => row.row.mean_output_tokens,
		efficiencyLabel: "Best accuracy per 1M output tokens",
		efficiencyScore: (row: DeepSWEChartRow) =>
			Number(percent(row.row.pass_at_1)) /
			(row.row.mean_output_tokens / 1_000_000),
		formatEfficiency: (value: number) => value.toFixed(2),
		format: fmtCompact,
		ticks: [20_000, 50_000, 100_000, 200_000],
	},
};

export function deepSweRows(
	models: LlmStatsModel[],
	rows: DeepSWELeaderboardRow[],
	mode: DeepSWEEffortMode,
): DeepSWEChartRow[] {
	const modelsByKey = new Map(
		models.map((model) => [
			providerFilterKey(graphModelName(modelBaseDisplayName(model))),
			model,
		]),
	);
	const chartRows = rows
		.flatMap((row): DeepSWEChartRow[] => {
			const key = providerFilterKey(row.model);
			const model = modelsByKey.get(key);
			return model != null &&
				finite(row.pass_at_1) &&
				finite(row.mean_cost_usd) &&
				row.mean_cost_usd > 0 &&
				finite(row.mean_duration_seconds) &&
				finite(row.mean_output_tokens)
				? [
						{
							model,
							row,
							displayName: modelName(model),
							effortLabel: row.reasoning_effort ?? "default",
							modelKey: key,
						},
					]
				: [];
		})
		.sort((left, right) => right.row.pass_at_1 - left.row.pass_at_1);
	if (mode === "all") {
		return chartRows;
	}
	return [...groupBy(chartRows, (row) => row.modelKey).values()]
		.map((modelRows) => modelRows[0])
		.filter((row): row is DeepSWEChartRow => row != null)
		.sort((left, right) => right.row.pass_at_1 - left.row.pass_at_1);
}

export function groupBy<T, TKey>(
	values: T[],
	getKey: (value: T) => TKey,
): Map<TKey, T[]> {
	const groups = new Map<TKey, T[]>();
	for (const value of values) {
		const key = getKey(value);
		const group = groups.get(key) ?? [];
		group.push(value);
		groups.set(key, group);
	}
	return groups;
}

export function providerOptions(models: LlmStatsModel[]): ProviderOption[] {
	type ProviderOptionDraft = ProviderOption & {
		modelKeys: Set<string>;
		bestScoreByModel: Map<string, number>;
	};

	const optionsBySlug = new Map<string, ProviderOptionDraft>();
	for (const model of models) {
		const slug = providerFilterKey(model.provider);
		const intelligenceScore = finiteValue(model.scores?.intelligence_score);
		const option = optionsBySlug.get(slug) ?? {
			slug,
			label: providerName(model),
			count: 0,
			color: providerPaletteColor(model.provider),
			logo: providerLogoSource(model),
			modelKeys: new Set(),
			bestScoreByModel: new Map(),
		};
		const modelKey = canonicalModelKey(model);
		option.modelKeys.add(modelKey);
		if (intelligenceScore != null) {
			option.bestScoreByModel.set(
				modelKey,
				Math.max(
					option.bestScoreByModel.get(modelKey) ?? Number.NEGATIVE_INFINITY,
					intelligenceScore,
				),
			);
		}
		option.count = option.modelKeys.size;
		optionsBySlug.set(slug, option);
	}
	const providerShortlist = [...optionsBySlug.values()]
		.sort(
			(left, right) =>
				right.count - left.count || left.label.localeCompare(right.label),
		)
		.slice(0, PROVIDER_FILTER_LIMIT);

	return providerShortlist
		.map((option) => ({
			...option,
			orderScore: meanTopProviderScore([...option.bestScoreByModel.values()]),
		}))
		.sort(
			(left, right) =>
				right.orderScore - left.orderScore ||
				right.count - left.count ||
				left.label.localeCompare(right.label),
		)
		.map((option) => ({
			slug: option.slug,
			label: option.label,
			count: option.count,
			color: option.color,
			logo: option.logo,
		}));
}

export function filterByModelControls<T>(
	items: T[],
	getModel: (item: T) => LlmStatsModel,
	filters: ModelControlFilters,
) {
	return items.filter((item) => modelMatchesControls(getModel(item), filters));
}

export function limitByIntelligenceScore<T>(
	items: T[],
	getModel: (item: T) => LlmStatsModel,
	limit: ModelLimit,
) {
	if (limit === "all") {
		return items;
	}
	const bestScoreByModel = new Map<string, number>();
	for (const item of items) {
		const model = getModel(item);
		const modelKey = canonicalModelKey(model);
		bestScoreByModel.set(
			modelKey,
			Math.max(
				bestScoreByModel.get(modelKey) ?? Number.NEGATIVE_INFINITY,
				modelIntelligenceScore(model),
			),
		);
	}
	const selectedModels = new Set(
		[...bestScoreByModel]
			.sort((left, right) => right[1] - left[1])
			.slice(0, limit)
			.map(([modelKey]) => modelKey),
	);
	return items.filter((item) =>
		selectedModels.has(canonicalModelKey(getModel(item))),
	);
}

function modelMatchesControls(
	model: LlmStatsModel,
	{ maxCost, providers }: ModelControlFilters,
) {
	if (
		providers.length > 0 &&
		!providers.includes(providerFilterKey(model.provider))
	) {
		return false;
	}
	if (maxCost === "all") {
		return true;
	}
	const blendedPrice = finiteValue(model.cost?.blended_price);
	return blendedPrice != null && blendedPrice <= maxCost;
}

function modelIntelligenceScore(model: LlmStatsModel) {
	return finiteValue(model.scores?.intelligence_score) ?? -Infinity;
}

function meanTopProviderScore(scores: number[]) {
	const topScores = [...scores]
		.sort((left, right) => right - left)
		.slice(0, PROVIDER_ORDER_TOP_SCORE_COUNT);
	return topScores.length > 0
		? topScores.reduce((total, score) => total + score, 0) / topScores.length
		: Number.NEGATIVE_INFINITY;
}

export function pointHover(
	event: PointerEvent<Element>,
	model: LlmStatsModel,
	rows: HoverRow[],
	displayName = modelName(model),
): HoverState {
	return {
		left: event.clientX,
		top: event.clientY,
		model: displayName,
		provider: providerName(model),
		color: providerPaletteColor(model.provider),
		logo: providerLogoSource(model),
		rows,
	};
}

export function focusHover(
	target: Element,
	model: LlmStatsModel,
	rows: HoverRow[],
	displayName = modelName(model),
): HoverState {
	const rect = target.getBoundingClientRect();
	return {
		left: rect.left + rect.width / 2,
		top: rect.top + rect.height / 2,
		model: displayName,
		provider: providerName(model),
		color: providerPaletteColor(model.provider),
		logo: providerLogoSource(model),
		rows,
	};
}

export function stepPath(
	points: LlmStatsModel[],
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
	let path = `M${x(Number(first.cost?.blended_price))},${y(first.scores.intelligence_score)}`;
	for (const point of rest) {
		const nextX = x(Number(point.cost?.blended_price));
		const nextY = y(point.scores.intelligence_score);
		path += ` H${nextX} V${nextY}`;
	}
	return path;
}

export function correlationLabel(
	points: Point[],
	transformX: (value: number) => number,
) {
	const correlation = correlationValue(
		points.map((point) => ({
			x: transformX(point.x),
			y: point.y,
		})),
	);
	return formatCorrelation(correlation);
}

export function formatCorrelation(correlation: number | null) {
	if (correlation == null) {
		return "CORR --";
	}
	return `CORR ${correlation >= 0 ? "+" : ""}${correlation.toFixed(2)}`;
}

export function correlationValue(points: { x: number; y: number }[]) {
	if (points.length < 3) {
		return null;
	}
	const xs = points.map((point) => point.x);
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
		return null;
	}
	return numerator / denominator;
}

export function positiveDomain(values: number[]): [number, number] {
	const positive = values.filter((value) => finite(value) && value > 0);
	const low = Math.min(...positive);
	const high = Math.max(...positive);
	if (!finite(low) || !finite(high)) {
		return [0.001, 1];
	}
	if (low === high) {
		return [Math.max(low / 1.4, 0.001), high * 1.4];
	}
	const logLow = Math.log10(low);
	const logHigh = Math.log10(high);
	const logPad = (logHigh - logLow) * 0.05;
	return [Math.max(10 ** (logLow - logPad), 0.001), 10 ** (logHigh + logPad)];
}

export function deepSweCi(row: DeepSWELeaderboardRow) {
	return row.ci_lo != null && row.ci_hi != null
		? `${fmtTooltipPercent(row.ci_lo)}-${fmtTooltipPercent(row.ci_hi)}`
		: "--";
}

export function modelName(model: LlmStatsModel) {
	return graphModelName(modelDisplayName(model));
}

function graphModelName(name: string) {
	return name
		.replace(/\bGPT\s+(?=\d)/g, "GPT-")
		.replace(/\bFable\s+(?=\d)/g, prefixBareFableModelName);
}

function prefixBareFableModelName(match: string, offset: number, name: string) {
	const previousToken = name.slice(
		Math.max(0, offset - "Claude ".length),
		offset,
	);
	return previousToken === "Claude " ? match : `Claude ${match}`;
}

export function deepSweLabel(row: DeepSWEChartRow, includeEffort: boolean) {
	const base = row.displayName.replace(" Preview", "");
	return includeEffort && row.effortLabel !== "default"
		? `${base} (${row.effortLabel})`
		: base;
}

export function shortLabel(model: LlmStatsModel) {
	return modelName(model).replace(" Preview", "");
}

function providerLogoSource(model: LlmStatsModel) {
	const providerLogo = providerAssetLogo(model.provider);
	if (providerLogo.length > 0) {
		return providerLogo;
	}
	if (typeof model.logo === "string" && model.logo.length > 0) {
		return model.logo;
	}
	return "";
}
