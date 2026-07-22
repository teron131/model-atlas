/** Shared dashboard constants for live data paths, tooltips, and benchmark labels. */

import {
	BENCHMARK_DISPLAY_ORDER,
	BENCHMARK_LABELS,
	BENCHMARK_TOOLTIPS,
} from "../../../src/model-atlas/benchmarks/catalog";
import type { LlmStatsColumnTooltip } from "../../../src/model-atlas/config/tooltips";

export const liveStatsPath = "/api/llm-stats?view=dashboard";

export const tooltipHorizontalPadding = 18;
export const tooltipMaxWidth = 360;
export const tooltipWorkflowMaxWidth = 480;
export const tooltipOffsetTop = 12;

export const benchmarkGroups = [
	{
		field: "intelligence_benchmark_display_keys",
		fallbackField: "intelligence_benchmark_keys",
		label: "Intelligence",
	},
	{
		field: "agentic_benchmark_display_keys",
		fallbackField: "agentic_benchmark_keys",
		label: "Agent",
	},
] as const;

export const benchmarkLabels: Readonly<Record<string, string>> =
	BENCHMARK_LABELS;
const benchmarkDisplayOrder = new Map(
	BENCHMARK_DISPLAY_ORDER.map((key, order) => [key, order]),
);

/** Apply the catalog's stable display order while keeping unknown payload keys deterministic. */
export function compareBenchmarkDisplayKeys(
	left: string,
	right: string,
): number {
	const orderDifference =
		(benchmarkDisplayOrder.get(left as keyof typeof BENCHMARK_LABELS) ??
			Number.MAX_SAFE_INTEGER) -
		(benchmarkDisplayOrder.get(right as keyof typeof BENCHMARK_LABELS) ??
			Number.MAX_SAFE_INTEGER);
	if (orderDifference !== 0) {
		return orderDifference;
	}
	const labelDifference = (benchmarkLabels[left] ?? left).localeCompare(
		benchmarkLabels[right] ?? right,
		"en",
		{ sensitivity: "base" },
	);
	return labelDifference !== 0 ? labelDifference : left.localeCompare(right);
}

export const benchmarkTooltips: Readonly<
	Record<string, LlmStatsColumnTooltip>
> = BENCHMARK_TOOLTIPS;
