/** Graph data shaping, filter options, and hover helpers. */

import type { PointerEvent } from "react";

import type { ModelStatsSelectedModel } from "../../../src/model-atlas/llm/model-stats/types";
import type { DeepSWELeaderboardRow } from "../../../src/model-atlas/llm/scrapers/deep-swe";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtMoney,
	fmtSeconds,
	fmtTooltipMoney,
	fmtTooltipNumber,
	fmtTooltipPercent,
	percent,
} from "./format";
import { providerColor, providerName, providerSlug } from "./providerTheme";
import type {
	DeepSWEChartRow,
	DeepSWEEffortMode,
	HoverRow,
	HoverState,
	InteractionConfig,
	ModelLimit,
	Point,
	ProviderOption,
} from "./types";

export const costFilterOptions: Array<"all" | number> = [
	"all",
	1,
	2,
	5,
	10,
	25,
];
export const modelLimitOptions: ModelLimit[] = [30, 60, "all"];

export const interactionConfigs: InteractionConfig[] = [
	{
		key: "price",
		title: "Intelligence vs blended price",
		corner: "upper left",
		lowerBetter: true,
		log: true,
		ticks: [0.25, 0.5, 1, 2, 5, 10, 25],
		get: (model) => finiteValue(model.cost?.blended_price),
		format: fmtMoney,
		tooltipFormat: fmtTooltipMoney,
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
		tooltipFormat: (value) => `${fmtTooltipNumber(value)} t/s`,
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
		tooltipFormat: (value) => `${fmtTooltipNumber(value)}s`,
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
		tooltipFormat: fmtTooltipNumber,
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
		tooltipFormat: fmtTooltipMoney,
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
		tooltipFormat: fmtTooltipPercent,
		xLabel: "DeepSWE accuracy",
		read: "Shows when broad intelligence and long-horizon coding reliability agree, and where they diverge.",
	},
];

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
		get: (row: DeepSWEChartRow) => row.row.mean_duration_seconds / 60,
		efficiencyLabel: "Best accuracy per minute",
		efficiencyScore: (row: DeepSWEChartRow) =>
			Number(percent(row.row.pass_at_1)) / (row.row.mean_duration_seconds / 60),
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
	models: ModelStatsSelectedModel[],
	rows: DeepSWELeaderboardRow[],
	mode: DeepSWEEffortMode,
): DeepSWEChartRow[] {
	const modelsByKey = new Map(
		models.map((model) => [modelLookupKey(modelName(model)), model]),
	);
	const chartRows = rows
		.flatMap((row): DeepSWEChartRow[] => {
			const key = modelLookupKey(row.model);
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
	const grouped = new Map<TKey, T[]>();
	for (const value of values) {
		const key = getKey(value);
		const current = grouped.get(key) ?? [];
		current.push(value);
		grouped.set(key, current);
	}
	return grouped;
}

export function providerOptions(
	models: ModelStatsSelectedModel[],
): ProviderOption[] {
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

export function modelKey(model: ModelStatsSelectedModel) {
	return model.id ?? model.name ?? "";
}

export function pointHover(
	event: PointerEvent<Element>,
	model: ModelStatsSelectedModel,
	rows: HoverRow[],
	displayName = modelName(model),
): HoverState {
	return {
		left: event.clientX,
		top: event.clientY,
		model: displayName,
		provider: providerName(model),
		color: providerColor(model.provider),
		logo: providerLogoSource(model),
		rows,
	};
}

export function focusHover(
	target: Element,
	model: ModelStatsSelectedModel,
	rows: HoverRow[],
	displayName = modelName(model),
): HoverState {
	const rect = target.getBoundingClientRect();
	return {
		left: rect.left + rect.width / 2,
		top: rect.top + rect.height / 2,
		model: displayName,
		provider: providerName(model),
		color: providerColor(model.provider),
		logo: providerLogoSource(model),
		rows,
	};
}

export function stepPath(
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

export function correlationLabel(
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

export function deepSWECi(row: DeepSWELeaderboardRow) {
	return row.ci_lo != null && row.ci_hi != null
		? `${fmtTooltipPercent(row.ci_lo)}-${fmtTooltipPercent(row.ci_hi)}`
		: "--";
}

export function modelName(model: ModelStatsSelectedModel) {
	return model.name ?? model.id ?? "Unknown model";
}

export function deepSWELabel(row: DeepSWEChartRow, includeEffort: boolean) {
	const base = row.displayName.replace(" Preview", "");
	return includeEffort && row.effortLabel !== "default"
		? `${base} (${row.effortLabel})`
		: base;
}

export function shortLabel(model: ModelStatsSelectedModel) {
	return modelName(model)
		.replace(" Preview", "")
		.replace("Claude ", "")
		.replace("GPT-", "GPT ");
}

function providerLogoSource(model: ModelStatsSelectedModel) {
	if (typeof model.logo === "string" && model.logo.length > 0) {
		return model.logo;
	}
	const logoSlug = providerSlug(model.provider);
	return logoSlug ? `/api/logos/${logoSlug}.png` : "";
}

function modelLookupKey(value: string) {
	return providerSlug(value);
}
