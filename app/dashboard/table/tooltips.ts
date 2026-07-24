/** Resolve dashboard table header tooltips from table policy and payload metadata. */

import { COLUMN_TOOLTIPS } from "../../../src/model-atlas/config";
import {
	CONFIDENCE_TOOLTIP,
	type ModelAtlasColumnTooltip,
	type ModelAtlasColumnTooltips,
} from "../../../src/model-atlas/config/tooltips";
import { benchmarkTooltips } from "../shared/constants";
import {
	benchmarkMetricColumns,
	type SortKey,
	type TableColumnKey,
	type TaskMetricColumn,
	taskMetricColumns,
} from "./models";

const benchmarkColumnTooltips = Object.fromEntries(
	benchmarkMetricColumns.flatMap((column) => {
		const tooltip = benchmarkTooltips[column.benchmark];
		return tooltip == null ? [] : [[column.key, tooltip]];
	}),
) as Partial<Record<SortKey, ModelAtlasColumnTooltip>>;

type TaskMetricTooltipText = {
	title: string;
	body: string;
	row: string;
};

const defaultTaskMetricText: Record<string, TaskMetricTooltipText> = {
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

const taskMetricColumnTooltips = Object.fromEntries(
	taskMetricColumns.flatMap((column) => taskMetricTooltipEntry(column)),
) as Partial<Record<SortKey, ModelAtlasColumnTooltip>>;

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
	confidence: CONFIDENCE_TOOLTIP,
} as const satisfies Partial<Record<TableColumnKey, ModelAtlasColumnTooltip>>;

const fallbackColumnTooltips: Partial<
	Record<TableColumnKey, ModelAtlasColumnTooltip>
> = {
	...staticTableColumnTooltips,
	...benchmarkColumnTooltips,
	...taskMetricColumnTooltips,
};

function taskMetricTooltipEntry(
	column: TaskMetricColumn,
): Array<[SortKey, ModelAtlasColumnTooltip]> {
	const configuredTooltip = COLUMN_TOOLTIPS[column.key];
	if (configuredTooltip != null) {
		return [[column.key, configuredTooltip]];
	}
	if (column.tooltip != null) {
		return [
			[
				column.key,
				{
					title: column.tooltip.title,
					body: column.tooltip.body,
					rows: column.tooltip.details,
				},
			],
		];
	}
	const benchmarkTooltip = benchmarkTooltips[column.source];
	if (benchmarkTooltip == null) {
		return [];
	}
	const metricTooltip = defaultTaskMetricText[column.metric];
	if (metricTooltip == null) {
		throw new Error(`Unsupported task metric tooltip: ${column.metric}`);
	}
	return [
		[
			column.key,
			{
				title: `${benchmarkTooltip.title} ${metricTooltip.title}${
					column.direction === "ascending" ? " ↓" : ""
				}`,
				body: `${metricTooltip.body} for ${benchmarkTooltip.title}.`,
				rows: [
					[
						"Source",
						benchmarkTooltip.rows?.find(([label]) => label === "Source")?.[1] ??
							benchmarkTooltip.title,
					],
					["Metric", metricTooltip.row],
				],
			},
		],
	];
}

/** Prefer table-owned tooltip policy, then use payload-provided scoring metadata. */
export function tableColumnTooltip(
	key: TableColumnKey,
	columnTooltips: ModelAtlasColumnTooltips,
) {
	return fallbackColumnTooltips[key] ?? columnTooltips[key];
}
