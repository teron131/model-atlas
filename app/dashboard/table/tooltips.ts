/** Resolve dashboard table header tooltips from table policy and payload metadata. */

import { COLUMN_TOOLTIPS } from "../../../src/model-atlas/constants";
import type {
	LlmStatsColumnTooltip,
	LlmStatsColumnTooltips,
} from "../../../src/model-atlas/stats/types";
import { benchmarkTooltips } from "../shared/constants";
import {
	benchmarkMetricColumns,
	type SortKey,
	type TaskMetricColumn,
	taskMetricColumns,
} from "./models";

const benchmarkTableColumnTooltips = Object.fromEntries(
	benchmarkMetricColumns.flatMap((column) => {
		const tooltip = benchmarkTooltips[column.benchmark];
		return tooltip == null ? [] : [[column.key, tooltip]];
	}),
) as Partial<Record<SortKey, LlmStatsColumnTooltip>>;

type TaskMetricTooltipText = {
	title: string;
	body: string;
	row: string;
};

const defaultTaskMetricTooltipText: Record<string, TaskMetricTooltipText> = {
	cost: {
		title: "cost per task",
		body: "Reported task cost",
		row: "cost per task",
	},
	seconds: {
		title: "seconds per task",
		body: "Reported task runtime",
		row: "runtime per task",
	},
	tokens: {
		title: "tokens per task",
		body: "Reported token use",
		row: "tokens per task",
	},
	input_tokens: {
		title: "input tokens per task",
		body: "Reported input token use",
		row: "input tokens per task",
	},
	output_tokens: {
		title: "output tokens per task",
		body: "Reported output token use",
		row: "output tokens per task",
	},
};

const terminalBenchMetricTooltipText: Record<string, TaskMetricTooltipText> = {
	cost: {
		title: "cost per task",
		body: "Median available task cost",
		row: "median cost per task",
	},
	seconds: {
		title: "seconds per task",
		body: "Median available task runtime",
		row: "median runtime per task",
	},
	tokens: {
		title: "tokens per task",
		body: "Artificial Analysis reported token use",
		row: "AA tokens per task",
	},
	input_tokens: {
		title: "input tokens per task",
		body: "Artificial Analysis reported input token use",
		row: "AA input tokens per task",
	},
	output_tokens: {
		title: "output tokens per task",
		body: "Artificial Analysis reported output token use",
		row: "AA output tokens per task",
	},
};

const taskMetricTableColumnTooltips = Object.fromEntries(
	taskMetricColumns.flatMap((column) => taskMetricTooltipEntry(column)),
) as Partial<Record<SortKey, LlmStatsColumnTooltip>>;

const staticTableColumnTooltips = {
	rank: {
		title: "Rank ↓",
		body: "Competition rank by Model Atlas Intelligence score.",
	},
	model: {
		title: "Model",
		body: "Model display name and provider route id.",
		rows: [["Sort", "alphabetical by model name"]],
	},
	release: {
		title: "Release date",
		body: "Known model release date from the selected model metadata.",
		rows: [["Sort", "newer releases sort first"]],
	},
	openWeights: {
		title: "Open weights",
		body: "Whether the model is available with open weights in the selected metadata.",
		rows: [["Sort", "open-weight models sort first"]],
	},
	modalities: {
		title: "Input modalities",
		body: "Input types the model route advertises for text, image, audio, and video.",
		rows: [["Sort", "more input capabilities sort first"]],
	},
	inputCost: {
		title: "Input cost ↓",
		body: "Published input price per 1M tokens for the selected route.",
	},
	outputCost: {
		title: "Output cost ↓",
		body: "Published output price per 1M tokens for the selected route.",
	},
	cacheReadCost: {
		title: "Cache read cost ↓",
		body: "Published cache-read price per 1M tokens when available.",
	},
	throughput: {
		title: "Output throughput",
		body: "Median output tokens per second from provider speed data.",
	},
	latency: {
		title: "Latency ↓",
		body: "Median time to first token from provider speed data.",
	},
	e2eLatency: {
		title: "End-to-end latency ↓",
		body: "Median total response time from provider speed data.",
	},
} as const satisfies Partial<Record<SortKey, LlmStatsColumnTooltip>>;

const tableColumnFallbackTooltips: Partial<
	Record<SortKey, LlmStatsColumnTooltip>
> = {
	...staticTableColumnTooltips,
	...benchmarkTableColumnTooltips,
	...taskMetricTableColumnTooltips,
};

function taskMetricTooltipEntry(
	column: TaskMetricColumn,
): Array<[SortKey, LlmStatsColumnTooltip]> {
	const configuredTooltip = COLUMN_TOOLTIPS[column.key];
	if (configuredTooltip != null) {
		return [[column.key, configuredTooltip]];
	}
	const benchmarkTooltip = benchmarkTooltips[column.source];
	if (benchmarkTooltip == null) {
		return [];
	}
	const metricTooltip = taskMetricTooltipFor(column);
	return [
		[
			column.key,
			{
				title: `${benchmarkTooltip.title} ${metricTooltip.title}${
					column.direction === "ascending" ? " ↓" : ""
				}`,
				body: `${metricTooltip.body} for ${benchmarkTooltip.title}.`,
				rows: [
					["Source", taskMetricTooltipSource(column, benchmarkTooltip)],
					["Metric", metricTooltip.row],
				],
			},
		],
	];
}

function taskMetricTooltipSource(
	column: TaskMetricColumn,
	tooltip: LlmStatsColumnTooltip,
) {
	if (column.source === "terminalbench_v21") {
		return isTokenTaskMetric(column.metric)
			? "Artificial Analysis"
			: "Artificial Analysis & Vals";
	}
	return (
		tooltip.rows?.find(([label]) => label === "Source")?.[1] ?? tooltip.title
	);
}

function taskMetricTooltipFor(column: TaskMetricColumn): TaskMetricTooltipText {
	const metricTooltip =
		column.source === "terminalbench_v21"
			? terminalBenchMetricTooltipText[column.metric]
			: defaultTaskMetricTooltipText[column.metric];
	if (metricTooltip == null) {
		throw new Error(`Unsupported task metric tooltip: ${column.metric}`);
	}
	return metricTooltip;
}

function isTokenTaskMetric(metric: TaskMetricColumn["metric"]) {
	return (
		metric === "tokens" ||
		metric === "input_tokens" ||
		metric === "output_tokens"
	);
}

/** Prefer table-owned tooltip policy, then use payload-provided scoring metadata. */
export function tableColumnTooltip(
	key: SortKey,
	columnTooltips: LlmStatsColumnTooltips,
) {
	return tableColumnFallbackTooltips[key] ?? columnTooltips[key];
}
