/** Graph data shaping, filter options, and hover helpers. */

import type { PointerEvent } from "react";
import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { minMaxScale } from "../../../src/model-atlas/pipeline/scores/normalization";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../../../src/model-atlas/stats/types";
import { modelDisplayName, modelVariantKey } from "../shared/model-display";
import {
	providerChartColor,
	providerDisplayName,
	providerFilterKey,
	providerLogo,
} from "../shared/provider-theme";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtMoney,
	fmtPercentScore,
	fmtSeconds,
	fmtTooltipMoney,
	fmtTooltipNumber,
	percent,
} from "./format";
import type {
	CostFilter,
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

type ModelControlFilters = {
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
			label: providerDisplayName(model),
			count: 0,
			color: providerChartColor(model.provider),
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
				finiteValue(model.scores?.intelligence_score) ?? -Infinity,
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
		provider: providerDisplayName(model),
		color: providerChartColor(model.provider),
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
		provider: providerDisplayName(model),
		color: providerChartColor(model.provider),
		logo: providerLogoSource(model),
		rows,
	};
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

export function modelName(model: LlmStatsModel) {
	return modelDisplayName(model)
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

export function shortLabel(model: LlmStatsModel) {
	return modelName(model).replace(" Preview", "");
}

function providerLogoSource(model: LlmStatsModel) {
	const logo = providerLogo(model.provider);
	if (logo.length > 0) {
		return logo;
	}
	if (typeof model.logo === "string" && model.logo.length > 0) {
		return model.logo;
	}
	return "";
}
