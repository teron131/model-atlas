/** Resolve dashboard table header and row-change tooltips from table policy and payload metadata; a benchmark's header describes the benchmark with its configured weights, its coverage in the current view, and its leaders, last update, and fetch state from benchmark health. */

import {
  BENCHMARK_DOMAINS,
  type BenchmarkDomain,
} from "../../../src/model-atlas/benchmarks/catalog";
import type {
  BenchmarkGroup,
  BenchmarkPortfolio,
} from "../../../src/model-atlas/benchmarks/factory";
import { indexPolicy } from "../../../src/model-atlas/benchmarks/index-policy";
import {
  BENCHMARK_CATALOG,
  benchmarkAllocation,
  type BenchmarkMetricModel,
  benchmarkValue,
} from "../../../src/model-atlas/benchmarks/registry";
import { COLUMN_TOOLTIPS } from "../../../src/model-atlas/config";
import {
  EVIDENCE_SUPPORT_TOOLTIP,
  type ModelAtlasColumnTooltip,
  type ModelAtlasColumnTooltipNestedSection,
  type ModelAtlasColumnTooltipRow,
  type ModelAtlasColumnTooltips,
} from "../../../src/model-atlas/config/tooltips";
import { MIDDLE_BLEND_MIX } from "../../../src/model-atlas/pipeline/scores/blended-price";
import {
  resourceRatioBenchmarks,
  type ResourceRatioKind,
} from "../../../src/model-atlas/stats/resource-ratios";
import type {
  ModelAtlasBenchmarkUpdateEntry,
  ModelAtlasMetadata,
  ModelAtlasModel,
  ModelAtlasScoreKey,
} from "../../../src/model-atlas/stats/types";
import { type DomainShare, domainShares } from "../../shared/DomainShares";
import { benchmarkTooltips } from "../shared/benchmark-display";
import { providerChartColor } from "../shared/provider-theme";
import {
  benchmarkMetricColumns,
  type SortKey,
  type TableColumnKey,
  type TaskMetricColumn,
  taskMetricColumns,
} from "./column-registry";
import { formatBenchmarkSourceValue, formatBenchmarkSpread, formatRefreshDate } from "./format";

const limitedEvidenceRow = [
  "Limited evidence",
  "The score retains 85% at low coverage, rising to 100% with sufficient support.",
] as const;

// Each score header reads its weights from the payload tooltip's weight groups and swaps in this body and these interpretation rows, so the payload stays the authority for every weight.
const scoreExplanations: Record<
  ModelAtlasScoreKey,
  { body: string; rows: readonly ModelAtlasColumnTooltipRow[] }
> = {
  intelligence: {
    body: "Reasoning, knowledge, and judgment across selected benchmarks.",
    rows: [
      ["Scale", "Each benchmark spans 0–100 within the reference population."],
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
};

const defaultTaskMetricText: Record<string, TaskMetricTooltipText> = {
  cost: {
    title: "cost per task",
    body: "Reported cost to complete one task",
  },
  seconds: {
    title: "seconds per task",
    body: "Reported runtime to complete one task",
  },
  tokens: {
    title: "tokens per task",
    body: "Reported total token use for one task",
  },
  input_tokens: {
    title: "input tokens per task",
    body: "Reported input token use for one task",
  },
  output_tokens: {
    title: "output tokens per task",
    body: "Reported output token use for one task",
  },
};

const taskMetricColumnTooltips = Object.fromEntries(
  taskMetricColumns.flatMap((column) => taskMetricTooltipEntry(column)),
) as Partial<Record<SortKey, ModelAtlasColumnTooltip>>;

const staticTableColumnTooltips = {
  taskCostRatio: {
    title: "Relative task cost ↓",
    body: "Weighted median of measured cost divided by each benchmark/source’s model-balanced median. 1× is benchmark-median expenditure. Quality is not adjusted.",
    rows: [
      ["Reference", "Each base model counts once, split across its observed efforts."],
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
      ["Scale", "1× is benchmark-median use."],
      ["Reference", "Each base model counts once, split across its observed efforts."],
    ],
  },
  taskTimeRatio: {
    title: "Relative task time ↓",
    body: "Weighted median of observed runtime divided by each benchmark/source’s model-balanced median. 1× is benchmark-median runtime. Only reported runtime contributes.",
    rows: [
      ["Reference", "Each base model counts once, split across its observed efforts."],
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
  },
  release: {
    title: "Release date",
    body: "The reported release date of the selected model variant.",
  },
  openWeights: {
    title: "Open weights",
    body: "Whether the selected metadata reports downloadable model weights. This field describes weight availability, not a licensing guarantee.",
  },
  modalities: {
    title: "Input modalities",
    body: "Input types accepted by the selected route: text, images, audio, or video.",
  },
  inputPrice: {
    title: "Input price ↓",
    body: "Listed price per million input tokens.",
    rows: [
      [
        "Source",
        "OpenRouter listed prices; catalog or Artificial Analysis prices where no route served tokens",
      ],
      ["Across providers", "the price most OpenRouter tokens pay"],
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
      ["Across providers", "the price most OpenRouter tokens pay"],
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
      ["Across providers", "the price most OpenRouter tokens pay"],
    ],
  },
  throughput: {
    title: "Throughput",
    body: "How many output tokens, reasoning included, the model writes per second once its first token arrives.",
    rows: [
      ["Source", "OpenRouter"],
      [
        "First-token wait",
        "removed from each provider's whole-request throughput using its first-token and end-to-end latency",
      ],
      ["Provider weighting", "estimated OpenRouter token share"],
      [
        "Known tradeoff",
        "likely overstated for models that stream only a summary of their reasoning, such as OpenAI's GPT models, since part of it comes before the first token",
      ],
    ],
  },
  latency: {
    title: "Latency ↓",
    body: "How long the model takes to produce its first output token, in seconds.",
    rows: [
      ["Source", "OpenRouter"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  e2eLatency: {
    title: "End-to-end latency ↓",
    body: "The measured time for the whole response, in seconds. It includes the initial wait and subsequent generation, so response length affects it.",
    rows: [
      ["Source", "OpenRouter"],
      ["Provider weighting", "estimated OpenRouter token share"],
    ],
  },
  evidenceSupport: EVIDENCE_SUPPORT_TOOLTIP,
  change: {
    title: "Latest material change",
    body: "The latest update that materially moved a model's score, evidence support, or rank among continuing models, with the date it landed. The value shows the largest move. New entrants do not cascade rank changes onto other models, but gaining or losing first place still counts.",
  },
} as const satisfies Partial<Record<TableColumnKey, ModelAtlasColumnTooltip>>;

const appColumnTooltips: Partial<Record<TableColumnKey, ModelAtlasColumnTooltip>> = {
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
        ],
      },
    ],
  ];
}

/** With a context, a benchmark column gets its live header facts and a resource ratio the benchmarks it counts; otherwise table-owned tooltips win over the payload's column tooltips. */
export function tableColumnTooltip(
  key: TableColumnKey,
  columnTooltips: ModelAtlasColumnTooltips,
  context?: BenchmarkTooltipContext,
): DashboardColumnTooltip | undefined {
  if (context != null) {
    const benchmark = benchmarkMetricColumns.find((column) => column.key === key);
    if (benchmark != null) {
      return benchmarkTooltip(benchmark, context);
    }
  }
  const tooltip = appColumnTooltips[key] ?? columnTooltips[key];
  if (!tooltip) return tooltip;
  const ratio = ratioKinds[key];
  if (ratio != null) {
    return context?.scoring == null
      ? tooltip
      : {
          ...tooltip,
          weights: ratioBenchmarks(ratio, context.population, context.scoring.benchmark_portfolio),
        };
  }
  if (key === "blend") {
    // The card's bar draws the middle mix, so its row would repeat it.
    return {
      ...tooltip,
      mix: MIDDLE_BLEND_MIX,
      rows: tooltip.rows?.filter(([label]) => label !== "Middle mix"),
    };
  }
  if (!isScoreKey(key)) return tooltip;
  const explanation = scoreExplanations[key];
  const payloadGroups =
    tooltip.sections?.flatMap((section) =>
      section.rows.filter(
        (item): item is ModelAtlasColumnTooltipNestedSection => !Array.isArray(item),
      ),
    ) ?? [];
  return {
    title: tooltip.title,
    body: explanation.body,
    weights: scoreWeights(payloadGroups),
    rows: explanation.rows,
  };
}

function isScoreKey(key: TableColumnKey): key is ModelAtlasScoreKey {
  return key in scoreExplanations;
}

// A weights map labels each benchmark with its table column's short name and files it under its primary domain; a score's payload names benchmarks as they score.
const catalogBenchmarks = Object.entries(BENCHMARK_CATALOG).map(([key, { presentation }]) => ({
  key,
  name: presentation.scoringLabel ?? presentation.label,
  label: presentation.column.label,
  domains: domainShares(key),
}));

const benchmarksByName = new Map(catalogBenchmarks.map((benchmark) => [benchmark.name, benchmark]));
const benchmarksByKey = new Map(catalogBenchmarks.map((benchmark) => [benchmark.key, benchmark]));

// A payload share in percent: "1.25%" → 1.25; any other text, such as "display only", is no share.
const PERCENT = /^(\d+(?:\.\d+)?)%$/;

/** Read a score's payload weight groups into numbers: a group of benchmarks splits into blocks by their primary domains, while a group of other inputs, such as Speed's provider speed, stays one block under its own title; groups without shares are listed apart. */
function scoreWeights(
  payloadGroups: readonly ModelAtlasColumnTooltipNestedSection[],
): ColumnWeights {
  const members = (group: ModelAtlasColumnTooltipNestedSection) =>
    group.rows.flatMap(([label, value]) => {
      const share = PERCENT.exec(value)?.[1];
      // Speed and Value weigh each benchmark's runtime or cost, so the suffix repeats the score's own meaning: "SWE-bench Pro runtime ↓" → "SWE-bench Pro".
      const name = label.replace(/ (runtime|cost) ↓$/, "");
      return share == null
        ? []
        : [
            {
              name,
              label: benchmarksByName.get(name)?.label ?? name,
              share: Number(share),
              domains: benchmarksByName.get(name)?.domains ?? [],
            },
          ];
    });
  const parsed = payloadGroups.map((group) => ({ group, items: members(group) }));
  const weighted = parsed.filter(({ items }) => items.length > 0);
  return {
    unit: "percent",
    caption: weighted.length === 1 ? weighted[0]!.group.title : "Inputs",
    groups: weighted
      .flatMap(({ group, items }): ColumnWeightGroup[] =>
        items.some((item) => benchmarksByName.has(item.name))
          ? domainBlocks(items, group.title)
          : [{ title: group.title, domain: null, items }],
      )
      .sort(heaviestFirst),
    unweighted: parsed
      .filter(({ items }) => items.length === 0)
      .map(({ group }) => ({
        title: group.title,
        note: group.weight,
        names: group.rows.map(([label]) => label),
      })),
  };
}

const ratioKinds: Partial<Record<TableColumnKey, ResourceRatioKind>> = {
  taskCostRatio: "cost",
  totalTokenRatio: "tokens",
  taskTimeRatio: "time",
};

/** A resource ratio's benchmarks across the population in blocks by primary domain, each counting once; an index counts only for the parts a model has no measurement of their own, so it is listed apart. */
function ratioBenchmarks(
  kind: ResourceRatioKind,
  population: readonly ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
): ColumnWeights {
  const benchmarks = resourceRatioBenchmarks(population, portfolio, kind).map((key) =>
    benchmarksByKey.get(key)!,
  );
  const measured = benchmarks.filter(({ key }) => indexPolicy(key) == null);
  const indexes = benchmarks.filter(({ key }) => indexPolicy(key) != null);
  return {
    unit: "count",
    caption: `${measured.length} benchmarks`,
    groups: domainBlocks(
      measured.map(({ name, label, domains }) => ({ name, label, share: 1, domains })),
      "Benchmarks",
    ).sort(heaviestFirst),
    unweighted:
      indexes.length === 0
        ? []
        : [
            {
              title: "Indexes",
              note: "count only for parts not measured alone",
              names: indexes.map(({ name }) => name),
            },
          ],
  };
}

// A benchmark the catalog files under no domain goes in a block titled `title`.
function domainBlocks(items: readonly ColumnWeightItem[], title: string): ColumnWeightGroup[] {
  const blocks = new Map<BenchmarkDomain | null, ColumnWeightItem[]>();
  for (const item of items) {
    const domain = item.domains[0]?.domain ?? null;
    blocks.set(domain, [...(blocks.get(domain) ?? []), item]);
  }
  return [...blocks].map(([domain, items]) => ({
    title: domain == null ? title : BENCHMARK_DOMAINS.find(({ key }) => key === domain)!.name,
    domain,
    items: items.sort((a, b) => b.share - a.share),
  }));
}

function heaviestFirst(a: ColumnWeightGroup, b: ColumnWeightGroup) {
  const total = (group: ColumnWeightGroup) =>
    group.items.reduce((sum, item) => sum + item.share, 0);
  return total(b) - total(a);
}

type BenchmarkTooltipContext = {
  models: readonly ModelAtlasModel[];
  /** Every published variant, which a resource ratio's medians are taken over, whatever the view shows. */
  population: readonly ModelAtlasModel[];
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
  domains: readonly DomainShare[];
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
  /** The label a card is about, whose chip leads its title. */
  domain?: BenchmarkDomain;
  benchmark?: BenchmarkTooltipFacts;
  weights?: ColumnWeights;
  /** Shares of new input and output tokens in the mix a blended price is set at; every other token is a cache read. */
  mix?: { new_input: number; output: number };
};

/** A score header's weights, drawn in place of the payload's weight groups, or the benchmarks a resource ratio header counts. */
export type ColumnWeights = {
  /** A score's shares are percentages of it; a ratio's benchmarks each count once, so they carry no figure. */
  unit: "percent" | "count";
  /** What the shares divide: the one weighted payload group's title, such as "Frontier benchmarks", "Inputs" when several groups split the score, or how many benchmarks a ratio counts. */
  caption: string;
  /** Heaviest first by total share: benchmarks in blocks by primary domain, or a score's several payload groups. */
  groups: readonly ColumnWeightGroup[];
  /** Groups listed without a share, such as a score's baseline benchmarks or a ratio's indexes, with a note on how they count. */
  unweighted: readonly { title: string; note?: string; names: readonly string[] }[];
};

export type ColumnWeightGroup = {
  /** The payload group's title, or the name of the primary domain a block's benchmarks share. */
  title: string;
  /** The primary domain a block's benchmarks share, whose icon marks the block; null for a payload group or benchmarks filed under no domain. */
  domain: BenchmarkDomain | null;
  /** Heaviest first; a payload group's all weigh the same, since the payload splits its share equally among its members. */
  items: readonly ColumnWeightItem[];
};

export type ColumnWeightItem = {
  name: string;
  /** A benchmark's table column name, such as "HLE" for HLE-Diamond, or the name itself for other inputs. */
  label: string;
  /** A percent of the score, or 1 for a counted benchmark. */
  share: number;
  /** Empty for an index or an input other than a benchmark; the first is the block the item is filed under. */
  domains: readonly DomainShare[];
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
              intelligence: capabilityAllocation(key, "intelligence", scoring),
              agentic: capabilityAllocation(key, "agentic", scoring),
            },
      domains: domainShares(key),
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

/**
 * The header sets the version beside the name, so a name that already ends in that version drops it rather than showing it twice.
 * Trailing `v` and `.0` parts are ignored when comparing: ("Terminal-Bench v2.0", "2") → "Terminal-Bench".
 */
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

function capabilityAllocation(
  key: string,
  capability: "intelligence" | "agentic",
  scoring: ModelAtlasMetadata["scoring"],
): number {
  const keys = scoring[`${capability}_benchmark_keys`];
  return keys.includes(key) ? benchmarkAllocation(key, capability, scoring.benchmark_portfolio) : 0;
}
