/** Resolve dashboard table header and row-change tooltips from table policy and payload metadata. */

import { COLUMN_TOOLTIPS } from "../../../src/model-atlas/config";
import {
  CONFIDENCE_TOOLTIP,
  type ModelAtlasColumnTooltip,
  type ModelAtlasColumnTooltips,
} from "../../../src/model-atlas/config/tooltips";
import type {
  ModelAtlasModel,
  ModelAtlasScoreDimension,
} from "../../../src/model-atlas/stats/types";
import { benchmarkTooltips } from "../shared/constants";
import { modelDisplayName } from "../shared/model-display";
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
  change: {
    title: "Latest material change",
    body: "The latest material score, evidence-support, or stable-cohort rank movement. Entrants and removals do not create cascade events for incumbent models, while reaching or losing #1 among continuing models remains material. Click a row value for its before-and-after evidence and strongest rank-aligned benchmarks.",
  },
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

/** Build the row-owned evidence popover from one persisted material change. */
export function scoreChangeTooltip(model: ModelAtlasModel): ModelAtlasColumnTooltip {
  const change = model.latest_change!;
  const scoreBefore = change.score_before == null ? "New" : change.score_before.toFixed(1);
  const scoreAfter = change.score_after.toFixed(1);
  const rank =
    change.rank_before == null
      ? change.rank_after == null
        ? null
        : `#${change.rank_after}`
      : change.rank_before === change.rank_after
        ? null
        : formatChangePair(change.rank_before, change.rank_after, "#");
  const rankLabel = change.rank_before == null ? "Entry rank" : "Stable-cohort rank";
  const support =
    change.confidence_before === change.confidence_after
      ? null
      : formatChangePair(change.confidence_before, change.confidence_after, "", "%");
  const scoreSummary =
    change.score_before == null
      ? `New score ${scoreAfter}.`
      : change.score_delta === 0
        ? `Score unchanged at ${scoreAfter}.`
        : `Score ${scoreBefore} → ${scoreAfter}${change.score_delta == null ? "" : ` (${signedScore(change.score_delta)})`}.`;
  const rankAlignment =
    change.rank_drivers.length === 0
      ? ""
      : " Rank alignment uses Spearman ρ across model-balanced results.";
  return {
    title: `${modelDisplayName(model)} · Material ${scoreDimensionLabel(change.dimension)} change`,
    body: `Latest material event. ${scoreSummary}${rankAlignment}`,
    rows: [
      ...(rank == null ? [] : [[rankLabel, rank] as [string, string]]),
      ...(support == null ? [] : [["Evidence support", support] as [string, string]]),
      ...change.causes.map(({ label }) => ["Cause", label] as [string, string]),
    ],
    sections:
      change.rank_drivers.length === 0
        ? undefined
        : [
            {
              title: "Rank-aligned benchmarks",
              rows: change.rank_drivers.map((driver) => [
                driver.label,
                `#${driver.benchmark_rank} of ${driver.benchmark_model_count} · ρ ${signedCorrelation(driver.rank_correlation)}`,
              ]),
            },
          ],
  };
}

export function scoreDimensionLabel(dimension: ModelAtlasScoreDimension): string {
  return dimension === "intelligence"
    ? "Intelligence"
    : dimension === "agentic"
      ? "Agentic"
      : dimension === "speed"
        ? "Speed"
        : "Value";
}

function signedScore(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;
}

function signedCorrelation(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

function formatChangePair(
  before: number | null,
  after: number | null,
  prefix: string,
  suffix = "",
): string | null {
  if (before == null && after == null) {
    return null;
  }
  return `${before == null ? "—" : `${prefix}${before}${suffix}`} → ${after == null ? "—" : `${prefix}${after}${suffix}`}`;
}
