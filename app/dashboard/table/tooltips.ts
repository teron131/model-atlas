/** Resolve dashboard table header and row-change tooltips from table policy and payload metadata; a benchmark's header describes the benchmark with its configured weights, its coverage in the current view, and its leaders, last update, and fetch state from benchmark health. */

import type { BenchmarkGroup } from "../../../src/model-atlas/benchmarks/factory";
import { benchmarkDimensionWeight } from "../../../src/model-atlas/benchmarks/registry";
import { COLUMN_TOOLTIPS } from "../../../src/model-atlas/config";
import {
  EVIDENCE_SUPPORT_TOOLTIP,
  type ModelAtlasColumnTooltip,
  type ModelAtlasColumnTooltipNestedSection,
  type ModelAtlasColumnTooltipRow,
  type ModelAtlasColumnTooltips,
} from "../../../src/model-atlas/config/tooltips";
import {
  type BenchmarkMetricModel,
  benchmarkValue,
} from "../../../src/model-atlas/pipeline/scores/resource-metrics";
import type {
  ModelAtlasBenchmarkUpdateEntry,
  ModelAtlasMetadata,
  ModelAtlasModel,
} from "../../../src/model-atlas/stats/types";
import { benchmarkTooltips } from "../shared/constants";
import { providerChartColor } from "../shared/provider-theme";
import { formatBenchmarkSourceValue, formatBenchmarkSpread, formatRefreshDate } from "./format";
import {
  benchmarkMetricColumns,
  type SortKey,
  type TableColumnKey,
  type TaskMetricColumn,
  taskMetricColumns,
} from "./models";

const limitedEvidenceRow = [
  "Limited evidence",
  "The score retains 85% at low coverage, rising to 100% with sufficient support.",
] as const;

// Summaries explain the score while published metadata remains the authority for every weight.
const scoreExplanations: Partial<
  Record<TableColumnKey, Pick<ModelAtlasColumnTooltip, "body" | "rows">>
> = {
  intelligence: {
    body: "Reasoning, knowledge, and judgment across selected benchmarks.",
    rows: [
      ["Scale", "Each benchmark spans 0–100 within the reference population."],
      ["Weights", "Benchmark importance × Intelligence loading."],
      ["Shared comparisons", "20% compares models on the benchmarks they share."],
      [
        "Indexes",
        "Count at the score of models with the same index standing. The full benchmark portfolio sets the benchmarks' weight against them.",
      ],
      limitedEvidenceRow,
    ],
  },
  agentic: {
    body: "Reliability in coding, tool use, and completing goals.",
    rows: [
      ["Weights", "Benchmark importance × Agentic loading."],
      [
        "Token efficiency",
        "0.85–1.15× before rescaling to 0–100; weak token evidence approaches 1×.",
      ],
      [
        "Benchmark/index blend",
        "Available benchmarks determine the mean. The full benchmark portfolio sets its weight against indexes.",
      ],
      limitedEvidenceRow,
    ],
  },
  speed: {
    body: "How quickly a model completes work at comparable quality.",
    rows: [
      ["Comparison", "Quality-matched task times; weak peer support moves toward neutral 50."],
      [
        "Eligibility",
        "At least 4 benchmarks with observed time and quality; estimates do not count.",
      ],
      ["Missing inputs", "Estimated when possible, with reduced evidence support."],
      ["Coverage", "Full model-coverage multiplier from 60%."],
    ],
  },
  value: {
    body: "How much capability a model delivers for its cost.",
    rows: [
      ["Comparison", "Quality-matched task costs; weak peer support moves toward neutral 50."],
      ["Eligibility", "At least 4 benchmarks with observed cost and quality."],
      ["Missing inputs", "Estimated when possible, with reduced evidence support."],
      ["Coverage", "Full model-coverage multiplier from 60%."],
    ],
  },
};

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
  taskCostRatio: {
    title: "Relative task cost ↓",
    body: "Weighted median of measured cost divided by each benchmark/source’s model-balanced median. 1× is benchmark-median expenditure; lower is cheaper. Quality is not adjusted.",
    rows: [
      ["Reference", "Each base model shares one vote across its observed efforts."],
      [
        "Weights",
        "One per benchmark, shared across separate sources; index breadth excludes measured constituents.",
      ],
      ["Coverage", "Available measured benchmarks only; cell tooltip shows the count."],
    ],
  },
  totalTokenRatio: {
    title: "Relative total tokens ↓",
    body: "Weighted median of total-token ratios against benchmark/source medians. Total tokens require a complete input/output pair or a reported total; output-only measurements stay missing.",
    rows: [
      ["Scale", "1× is benchmark-median use; lower uses fewer tokens."],
      ["Reference", "Each base model shares one vote across its observed efforts."],
    ],
  },
  taskTimeRatio: {
    title: "Relative task time ↓",
    body: "Weighted median of observed runtime divided by each benchmark/source’s model-balanced median. 1× is benchmark-median runtime; lower is faster. Only reported runtime contributes.",
    rows: [
      ["Reference", "Each base model shares one vote across its observed efforts."],
      ["Coverage", "Available measured benchmarks only; cell tooltip shows the count."],
    ],
  },
  rank: {
    title: "Rank ↓",
    body: "Position by Intelligence Score. Ties share a rank and leave the next position open: 1, 2, 2, 4. All admitted models receive numeric ranks, including models with missing specifications.",
  },
  model: {
    title: "Model",
    body: "The model's display name and canonical provider/model route ID. Reasoning-effort configurations keep their own results.",
    rows: [["Sort", "alphabetical by model name"]],
  },
  release: {
    title: "Release date",
    body: "The reported release date of the selected model variant.",
    rows: [["Sort", "newer releases sort first"]],
  },
  openWeights: {
    title: "Open weights",
    body: "Whether the selected metadata reports downloadable model weights. This field describes weight availability, not a licensing guarantee.",
    rows: [["Sort", "open-weight models sort first"]],
  },
  modalities: {
    title: "Input modalities",
    body: "Input types accepted by the selected route: text, images, audio, or video.",
    rows: [["Sort", "more input capabilities sort first"]],
  },
  inputPrice: {
    title: "Input price ↓",
    body: "Listed price per million input tokens.",
    rows: [
      [
        "Source",
        "OpenRouter listed prices; catalog or Artificial Analysis prices where no route served tokens",
      ],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  outputPrice: {
    title: "Output price ↓",
    body: "Listed price per million output tokens.",
    rows: [
      [
        "Source",
        "OpenRouter listed prices; catalog or Artificial Analysis prices where no route served tokens",
      ],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  cacheReadPrice: {
    title: "Cache read price ↓",
    body: "Listed price per million input tokens read from cache.",
    rows: [
      [
        "Source",
        "OpenRouter listed prices; catalog or Artificial Analysis prices where no route served tokens",
      ],
      ["Unlisted price", "a tenth of the input price"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  throughput: {
    title: "Output throughput",
    body: "How quickly output tokens arrive once generation is underway, in tokens per second. OpenRouter estimates are combined using routed-provider token shares.",
    rows: [
      ["Source", "OpenRouter"],
      ["Metric", "output tokens per second"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  latency: {
    title: "Latency ↓",
    body: "How long the model takes to produce its first output token, in seconds. Lower values mean a shorter initial wait.",
    rows: [
      ["Source", "OpenRouter"],
      ["Metric", "time to first token"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  e2eLatency: {
    title: "End-to-end latency ↓",
    body: "The measured time for the whole response, in seconds. It includes the initial wait and subsequent generation, so response length affects it.",
    rows: [
      ["Source", "OpenRouter"],
      ["Metric", "end-to-end response time"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  confidence: EVIDENCE_SUPPORT_TOOLTIP,
  change: {
    title: "Latest material change",
    body: "The latest update that materially moved a model's score, evidence support, or rank among continuing models, with the date it landed. The value shows the largest move; open it for every score that moved and the model's own results, task costs, prices, and speeds that changed. New entrants do not cascade rank changes onto other models, but gaining or losing first place still counts.",
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
  const sourceTooltip = benchmarkTooltips[column.benchmarkGroup];
  if (sourceTooltip == null) {
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
        title: `${sourceTooltip.title} ${metricTooltip.title}${
          column.direction === "ascending" ? " ↓" : ""
        }`,
        body: `${metricTooltip.body} for ${sourceTooltip.title}.`,
        rows: [
          [
            "Source",
            sourceTooltip.rows?.find(([label]) => label === "Source")?.[1] ?? sourceTooltip.title,
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
  context?: BenchmarkTooltipContext,
) {
  if (context != null) {
    const benchmark = benchmarkMetricColumns.find((column) => column.key === key);
    if (benchmark != null) {
      return benchmarkTooltip(benchmark, context);
    }
  }
  const tooltip = fallbackColumnTooltips[key] ?? columnTooltips[key];
  const explanation = scoreExplanations[key];
  if (!tooltip || !explanation) return tooltip;
  const weightGroups =
    tooltip.sections?.flatMap((section) =>
      section.rows.filter(
        (item): item is ModelAtlasColumnTooltipNestedSection => !Array.isArray(item),
      ),
    ) ?? [];
  const displayGroups =
    key === "speed" || key === "value"
      ? weightGroups.map((group) => ({
          ...group,
          rows: group.rows.map(
            ([label, weight]) => [label.replace(/ (runtime|cost) ↓$/, ""), weight] as const,
          ),
        }))
      : weightGroups;
  return {
    title: tooltip.title,
    body: explanation.body,
    sections: [
      { title: "Weights", hideTitle: true, rows: displayGroups },
      { title: "Interpretation", rows: explanation.rows ?? [] },
    ],
  };
}

type BenchmarkTooltipContext = {
  models: readonly ModelAtlasModel[];
  scoring: ModelAtlasMetadata["scoring"] | undefined;
  versions: ModelAtlasMetadata["benchmark_versions"];
  health: ModelAtlasMetadata["benchmark_update_health"];
  unit?: "models" | "variants";
};

/** A benchmark header's facts; the dashboard draws them in place of `rows`. */
export type BenchmarkTooltipFacts = {
  version: string | null;
  group: BenchmarkGroup | null;
  details: readonly ModelAtlasColumnTooltipRow[];
  weights: { intelligence: number; agentic: number } | null;
  coverage: { observed: number; total: number; unit: "models" | "variants" };
  leaders: BenchmarkTooltipLeaders | null;
  /** When a source couldn't be refreshed, the date of the results shown instead. */
  cachedSince: string | null;
};

export type BenchmarkTooltipLeaders = {
  /** The benchmark's observed range, weakest to strongest result, in source units. */
  domain: readonly [number, number];
  domainLabels: readonly [string, string];
  /** Every direct result in view, drawn faintly against the leaders. */
  field: readonly number[];
  stars: readonly { name: string; value: number; valueLabel: string; color: string }[];
  gapLabel: string | null;
  standardError: number | null;
  standardErrorLabel: string | null;
};

export type DashboardColumnTooltip = ModelAtlasColumnTooltip & {
  benchmark?: BenchmarkTooltipFacts;
};

/** Describe a benchmark without treating missing or estimated results as observed coverage. */
function benchmarkTooltip(
  column: (typeof benchmarkMetricColumns)[number],
  { models, scoring, versions, health, unit = "models" }: BenchmarkTooltipContext,
): DashboardColumnTooltip | undefined {
  const key = column.benchmark;
  const tooltip = benchmarkTooltips[key];
  if (tooltip == null) {
    return undefined;
  }
  const catalogRows = tooltip.rows ?? [];
  // The served version replaces the catalog's, so an automatically adopted version shows at once.
  const version =
    versions?.[key] ??
    catalogRows.find(([label]) => label === "Version")?.[1].replace(/^v/, "") ??
    null;
  const entry = scoring?.benchmark_portfolio[key];
  const healthEntry = health?.[key];
  const updatedAt = healthEntry?.rows_updated_at_epoch_seconds;
  const cachedAt = healthEntry?.cached_rows_fetched_at_epoch_seconds;
  return {
    title: titleWithoutVersion(tooltip.title, version),
    body: tooltip.body,
    benchmark: {
      version,
      group: entry?.group ?? null,
      details: [
        ...catalogRows.filter(([label]) => label !== "Role" && label !== "Version"),
        ...(updatedAt == null ? [] : [["Updated", formatRefreshDate(updatedAt)] as const]),
      ],
      weights:
        scoring == null || entry == null
          ? null
          : {
              intelligence: dimensionWeight(key, "intelligence", scoring),
              agentic: dimensionWeight(key, "agentic", scoring),
            },
      coverage: { ...benchmarkCoverage(models, key), unit },
      leaders: benchmarkLeaders(column, healthEntry, models),
      cachedSince: cachedAt == null ? null : formatRefreshDate(cachedAt),
    },
  };
}

/** Leaders come from the source's own rows when health has them, so a leader Atlas does not list still appears under its source label. */
function benchmarkLeaders(
  column: (typeof benchmarkMetricColumns)[number],
  entry: ModelAtlasBenchmarkUpdateEntry | undefined,
  models: readonly ModelAtlasModel[],
): BenchmarkTooltipLeaders | null {
  if (entry == null) return null;
  const leaders = entry.source_leaders.length > 0 ? entry.source_leaders : entry.matched_leaders;
  const top = leaders[0];
  const fullRange = entry.spread.full_range;
  if (top == null || fullRange == null) return null;
  const modelsById = new Map(
    models.flatMap((model) => (model.id == null ? [] : [[model.id, model]])),
  );
  const { top_range: topRange, top_standard_error: standardError } = entry.spread;
  const domain = [top.value - fullRange, top.value] as const;
  const formatValue = (value: number) => formatBenchmarkSourceValue(value, column.format);
  return {
    domain,
    domainLabels: [formatValue(domain[0]), formatValue(domain[1])],
    field: models.flatMap((model) => {
      const value = benchmarkValue(model, column.benchmark);
      return value == null ? [] : [value];
    }),
    stars: leaders.map((leader) => {
      const model = leader.model_id == null ? undefined : modelsById.get(leader.model_id);
      const provider = model?.provider ?? leader.model_id?.split("/")[0] ?? null;
      return {
        name: model?.name ?? leader.label,
        value: leader.value,
        valueLabel: formatValue(leader.value),
        color: provider == null ? "var(--muted)" : providerChartColor(provider),
      };
    }),
    gapLabel: topRange == null ? null : formatBenchmarkSpread(topRange, column.format),
    standardError,
    standardErrorLabel:
      standardError == null ? null : formatBenchmarkSpread(standardError, column.format),
  };
}

/** The header sets the version beside the name, so a name that already ends in that version drops it rather than showing it twice. */
function titleWithoutVersion(title: string, version: string | null): string {
  const trailing = /\s+v?(\d+(?:\.\d+)*)$/i.exec(title);
  const comparable = (value: string) => value.replace(/^v/i, "").replace(/(\.0)+$/, "");
  return version != null && trailing?.[1] != null && comparable(trailing[1]) === comparable(version)
    ? title.slice(0, trailing.index)
    : title;
}

/** Count direct benchmark values, including zero scores, in the supplied display population. */
function benchmarkCoverage(models: readonly BenchmarkMetricModel[], key: string) {
  return {
    observed: models.filter((model) => benchmarkValue(model, key) != null).length,
    total: models.length,
  };
}

function dimensionWeight(
  key: string,
  dimension: "intelligence" | "agentic",
  scoring: ModelAtlasMetadata["scoring"],
): number {
  const keys = scoring[`${dimension}_benchmark_keys`];
  return keys.includes(key)
    ? benchmarkDimensionWeight(key, dimension, scoring.benchmark_portfolio)
    : 0;
}
