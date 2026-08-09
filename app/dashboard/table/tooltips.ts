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
    body: "Reported cost to complete one task",
    row: "cost per task",
  },
  seconds: {
    title: "seconds per task",
    body: "Reported runtime to complete one task",
    row: "runtime per task",
  },
  tokens: {
    title: "tokens per task",
    body: "Reported total token use for one task",
    row: "tokens per task",
  },
  input_tokens: {
    title: "input tokens per task",
    body: "Reported input token use for one task",
    row: "input tokens per task",
  },
  output_tokens: {
    title: "output tokens per task",
    body: "Reported output token use for one task",
    row: "output tokens per task",
  },
};

const taskMetricColumnTooltips = Object.fromEntries(
  taskMetricColumns.flatMap((column) => taskMetricTooltipEntry(column)),
) as Partial<Record<SortKey, ModelAtlasColumnTooltip>>;

const staticTableColumnTooltips = {
  rank: {
    title: "Rank ↓",
    body: "Competition rank by Intelligence Score; tied models share the same rank.",
  },
  model: {
    title: "Model",
    body: "Model display name and canonical provider/model route ID.",
    rows: [["Sort", "alphabetical by model name"]],
  },
  release: {
    title: "Release date",
    body: "Known release date for the selected model variant.",
    rows: [["Sort", "newer releases sort first"]],
  },
  openWeights: {
    title: "Open weights",
    body: "Whether downloadable model weights are available according to the selected metadata.",
    rows: [["Sort", "open-weight models sort first"]],
  },
  modalities: {
    title: "Input modalities",
    body: "Input types the selected route accepts: text, image, audio, and video.",
    rows: [["Sort", "more input capabilities sort first"]],
  },
  effectiveInputPrice: {
    title: "Effective input price ↓",
    body: "Estimated current input price per 1M tokens across routed providers.",
    rows: [
      ["Source", "OpenRouter"],
      ["Provider weighting", "estimated token share"],
    ],
  },
  effectiveOutputPrice: {
    title: "Effective output price ↓",
    body: "Estimated current output price per 1M tokens across routed providers.",
    rows: [
      ["Source", "OpenRouter"],
      ["Provider weighting", "estimated token share"],
    ],
  },
  throughput: {
    title: "Output throughput",
    body: "Estimated current output speed across routed providers.",
    rows: [
      ["Source", "OpenRouter"],
      ["Metric", "output tokens per second"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  latency: {
    title: "Latency ↓",
    body: "Estimated current time until the first output token across routed providers.",
    rows: [
      ["Source", "OpenRouter"],
      ["Metric", "time to first token"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  e2eLatency: {
    title: "End-to-end latency ↓",
    body: "Estimated current total response time across routed providers.",
    rows: [
      ["Source", "OpenRouter"],
      ["Metric", "end-to-end response time"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  confidence: CONFIDENCE_TOOLTIP,
} as const satisfies Partial<Record<TableColumnKey, ModelAtlasColumnTooltip>>;

const fallbackColumnTooltips: Partial<Record<TableColumnKey, ModelAtlasColumnTooltip>> = {
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
export function tableColumnTooltip(key: TableColumnKey, columnTooltips: ModelAtlasColumnTooltips) {
  return fallbackColumnTooltips[key] ?? columnTooltips[key];
}
