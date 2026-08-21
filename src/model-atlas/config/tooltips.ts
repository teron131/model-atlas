/** Column tooltip copy stays aligned with active scoring weights and benchmark resource policy. */

import {
  AGENTIC_BENCHMARK_DISPLAY_KEYS,
  BENCHMARK_CATALOG,
  BENCHMARK_KEYS,
  benchmarkDimensionWeight,
  type BenchmarkKey,
  benchmarkPortfolioEntry,
  benchmarkResourcePolicy,
  INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
} from "../benchmarks/registry";
import { RESOURCE_SCORE_BUCKET_WEIGHTS } from "./stage";

export type ModelAtlasColumnTooltipRow = readonly [string, string];

export type ModelAtlasColumnTooltipNestedSection = {
  title: string;
  weight?: string;
  rows: readonly ModelAtlasColumnTooltipRow[];
};

export type ModelAtlasColumnTooltipSectionItem =
  | ModelAtlasColumnTooltipRow
  | ModelAtlasColumnTooltipNestedSection;

type ModelAtlasColumnTooltipSection = {
  title: string;
  hideTitle?: boolean;
  weight?: string;
  rows: readonly ModelAtlasColumnTooltipSectionItem[];
};

export type ModelAtlasColumnTooltip = {
  title: string;
  body: string;
  rows?: readonly ModelAtlasColumnTooltipRow[];
  sections?: readonly ModelAtlasColumnTooltipSection[];
};

export type ModelAtlasColumnTooltips = Record<string, ModelAtlasColumnTooltip>;

const QUALITY_COVERAGE_SCALE =
  "score multiplier is zero through 10% of selected weight and full from 60%";

export const CONFIDENCE_TOOLTIP = {
  title: "Evidence support",
  body: "The weighted share of each score's active inputs supported by direct or validated evidence.",
  rows: [
    ["I", "Intelligence evidence support"],
    ["A", "Agentic evidence support"],
    ["S", "Speed evidence support"],
    ["V", "Value evidence support"],
    ["Displayed scale", "literal weighted share of active inputs"],
    ["Quality score coverage", QUALITY_COVERAGE_SCALE],
    [
      "Model-default evidence",
      "supports the source-default variant without claiming an explicit effort run",
    ],
  ],
} as const satisfies ModelAtlasColumnTooltip;

function percent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

const benchmarkContributionPercent = (
  keys: readonly BenchmarkKey[],
  key: BenchmarkKey,
  dimension: "intelligence" | "agentic",
) => {
  const totalWeight = keys.reduce(
    (sum, benchmarkKey) => sum + benchmarkDimensionWeight(benchmarkKey, dimension),
    0,
  );
  return totalWeight > 0 ? percent(benchmarkDimensionWeight(key, dimension) / totalWeight, 1) : "-";
};

const PROVIDER_SPEED_LABELS = ["Throughput", "Latency ↓", "End-to-end latency ↓"] as const;
const PRICE_COMPONENT_LABELS = [
  "Log blended price ↓",
  "Quality-adjusted log blended price ↓",
] as const;

type CoreColumnTooltipKey =
  | "intelligence"
  | "agentic"
  | "speed"
  | "value"
  | "blend"
  | "context"
  | "artificialAnalysisCost"
  | "artificialAnalysisSeconds"
  | "artificialAnalysisTokens";
type CoreColumnTooltips = ModelAtlasColumnTooltips &
  Record<CoreColumnTooltipKey, ModelAtlasColumnTooltip>;

export type ActiveResourceComponents = {
  artificialAnalysisBenchmarkKeys: readonly string[];
  directBenchmarkKeys: readonly string[];
};

const ALL_RESOURCE_COMPONENTS = {
  artificialAnalysisBenchmarkKeys: BENCHMARK_KEYS.filter(
    (key) => benchmarkResourcePolicy(key)?.source === "artificial_analysis",
  ),
  directBenchmarkKeys: BENCHMARK_KEYS.filter(
    (key) => benchmarkResourcePolicy(key)?.source === "benchmark",
  ),
} as const satisfies ActiveResourceComponents;

function perComponentWeight(totalWeight: number, count: number): string {
  return count > 0 ? percent(totalWeight / count, 1) : "-";
}

function benchmarkLabel(key: string): string {
  return BENCHMARK_CATALOG[key as BenchmarkKey]?.presentation.scoringLabel ?? key;
}

function resourceBenchmarkKeys(components: ActiveResourceComponents): readonly string[] {
  const componentKeys = new Set([
    ...components.artificialAnalysisBenchmarkKeys,
    ...components.directBenchmarkKeys,
  ]);
  return BENCHMARK_KEYS.filter((key) => componentKeys.has(key));
}

function benchmarkResourceRows(
  keys: readonly string[],
  labelPrefix: string,
  labelSuffix: string,
  weight: string,
): readonly ModelAtlasColumnTooltipRow[] {
  return keys.map((key) => [`${labelPrefix}${benchmarkLabel(key)} ${labelSuffix}`, weight]);
}

const qualityBenchmarkRows = (
  benchmarkRows: Readonly<{
    baseline: readonly ModelAtlasColumnTooltipRow[];
    frontier: readonly ModelAtlasColumnTooltipRow[];
  }>,
) =>
  [
    ["Effective weight", "importance x dimension loading"],
    ["Aggregation", "weights normalized within dimension"],
    [
      "Imputed values",
      "validated point predictions; held-out reliability scales influence and support",
    ],
    ["Evidence support", "literal weighted share of direct or validated evidence"],
    ["Score coverage", QUALITY_COVERAGE_SCALE],
    {
      title: "Frontier benchmarks",
      rows: benchmarkRows.frontier,
    },
    {
      title: "Baseline benchmarks",
      rows: benchmarkRows.baseline,
    },
  ] as const;

const benchmarkRowsByGroup = (
  keys: readonly BenchmarkKey[],
  dimension: "intelligence" | "agentic",
) => ({
  baseline: keys
    .filter((key) => benchmarkPortfolioEntry(key)?.group === "baseline")
    .map(
      (key) =>
        [
          BENCHMARK_CATALOG[key].presentation.scoringLabel,
          benchmarkContributionPercent(keys, key, dimension),
        ] as const,
    ),
  frontier: keys
    .filter((key) => benchmarkPortfolioEntry(key)?.group === "frontier")
    .map(
      (key) =>
        [
          BENCHMARK_CATALOG[key].presentation.scoringLabel,
          benchmarkContributionPercent(keys, key, dimension),
        ] as const,
    ),
});

const INTELLIGENCE_BENCHMARK_ROWS = benchmarkRowsByGroup(
  INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
  "intelligence",
);

const AGENTIC_BENCHMARK_ROWS = benchmarkRowsByGroup(AGENTIC_BENCHMARK_DISPLAY_KEYS, "agentic");

const speedInputRows = (components: ActiveResourceComponents) => {
  const resourceKeys = resourceBenchmarkKeys(components);
  const benchmarkComponentWeight = perComponentWeight(
    RESOURCE_SCORE_BUCKET_WEIGHTS.benchmark,
    resourceKeys.length,
  );
  const providerComponentWeight = perComponentWeight(
    RESOURCE_SCORE_BUCKET_WEIGHTS.nonBenchmark,
    PROVIDER_SPEED_LABELS.length,
  );
  return [
    {
      title: "Benchmark runtimes ↓",
      weight: percent(RESOURCE_SCORE_BUCKET_WEIGHTS.benchmark),
      rows: benchmarkResourceRows(resourceKeys, "", "runtime ↓", benchmarkComponentWeight),
    },
    {
      title: "Provider speed",
      weight: percent(RESOURCE_SCORE_BUCKET_WEIGHTS.nonBenchmark),
      rows: PROVIDER_SPEED_LABELS.map((label) => [label, providerComponentWeight] as const),
    },
  ] as const;
};

const valueInputRows = (components: ActiveResourceComponents) => {
  const resourceKeys = resourceBenchmarkKeys(components);
  const benchmarkComponentWeight = perComponentWeight(
    RESOURCE_SCORE_BUCKET_WEIGHTS.benchmark,
    resourceKeys.length,
  );
  const priceComponentWeight = perComponentWeight(
    RESOURCE_SCORE_BUCKET_WEIGHTS.nonBenchmark,
    PRICE_COMPONENT_LABELS.length,
  );
  return [
    {
      title: "Price components",
      weight: percent(RESOURCE_SCORE_BUCKET_WEIGHTS.nonBenchmark),
      rows: PRICE_COMPONENT_LABELS.map((label) => [label, priceComponentWeight] as const),
    },
    {
      title: "Benchmark costs ↓",
      weight: percent(RESOURCE_SCORE_BUCKET_WEIGHTS.benchmark),
      rows: benchmarkResourceRows(resourceKeys, "", "cost ↓", benchmarkComponentWeight),
    },
  ] as const;
};

export function columnTooltipsForActiveComponents(
  components: ActiveResourceComponents = ALL_RESOURCE_COMPONENTS,
): CoreColumnTooltips {
  return {
    intelligence: {
      title: "Intelligence Score",
      body: "Model Atlas score for knowledge, reasoning, interpretation, and problem solving. Selected benchmarks are normalized to 0–100 and weighted by importance × Intelligence loading. Frontier and baseline groups differ only in how strongly uncertain estimates are penalized.",
      rows: [
        ["Observed benchmark weight", "importance × Intelligence loading"],
        ["Benchmark normalization", "observed range mapped to 0–100"],
        ["Final score", "weighted mean × score coverage multiplier"],
      ],
      sections: [
        {
          title: "Score blend",
          hideTitle: true,
          rows: qualityBenchmarkRows(INTELLIGENCE_BENCHMARK_ROWS),
        },
      ],
    },
    agentic: {
      title: "Agentic Score",
      body: "Model Atlas score for completing work through tools, files, repositories, browsers, terminals, APIs, and other external environments. Selected benchmarks are normalized to 0–100 and weighted by importance × Agentic loading. Frontier and baseline groups differ only in how strongly uncertain estimates are penalized.",
      rows: [
        ["Observed benchmark weight", "importance × Agentic loading"],
        ["Benchmark normalization", "observed range mapped to 0–100"],
        ["Final score", "weighted mean × score coverage multiplier"],
      ],
      sections: [
        {
          title: "Score blend",
          hideTitle: true,
          rows: qualityBenchmarkRows(AGENTIC_BENCHMARK_ROWS),
        },
      ],
    },
    speed: {
      title: "Speed Score",
      body: "How quickly the model delivers comparable work. Benchmark runtimes receive 70% of Speed and provider speed metrics receive 30%. Each bucket divides its weight equally among its active components. Provider metrics use logged min–max scores; task runtimes compare the model with independent peers at similar benchmark quality. Weak peer support pulls a task score toward neutral 50, while estimated evidence reduces influence and evidence support.",
      rows: [
        ["Benchmark runtimes", "70% total; quality-adjusted peer comparison"],
        ["Provider metrics", "30% total across three logged min–max components"],
        ["Missing task runtime", "validated sibling-effort estimate or omitted"],
        ["Model coverage", "shared from the source-default variant"],
      ],
      sections: [
        {
          title: "Speed inputs",
          hideTitle: true,
          rows: speedInputRows(components),
        },
      ],
    },
    value: {
      title: "Value Score",
      body: "How much quality and capability the model delivers for its cost. Benchmark task costs receive 70% of Value and price components receive 30%. Each bucket divides its weight equally among its active components. Quality-adjusted inputs compare the model with independent peers at similar quality. Weak peer support pulls an efficiency score toward neutral 50, while estimated evidence reduces influence and evidence support.",
      rows: [
        ["Benchmark task costs", "70% total; quality-adjusted peer comparison"],
        ["Price components", "30% total across absolute and quality-adjusted price"],
        ["Missing task cost", "validated sibling-effort estimate or omitted"],
        ["Model coverage", "shared from the source-default variant"],
      ],
      sections: [
        {
          title: "Value inputs",
          hideTitle: true,
          rows: valueInputRows(components),
        },
      ],
    },
    blend: {
      title: "Effective blended price ↓",
      body: "Estimated current price per 1M tokens across the model's routed providers.",
      rows: [
        ["Source", "OpenRouter"],
        ["Blend", "50% effective input price + 50% effective output price"],
        ["Provider weighting", "estimated OpenRouter token share"],
      ],
    },
    context: {
      title: "Context",
      body: "Maximum number of input tokens the selected model route can accept at once.",
      rows: [
        ["Definition", "maximum input tokens"],
        ["Unit", "tokens"],
        ["Source", "selected model metadata"],
      ],
    },
    artificialAnalysisCost: {
      title: "Artificial Analysis Cost per Task ↓",
      body: "Reported cost to complete one Artificial Analysis Intelligence Index v4.1 task.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported cost per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
    artificialAnalysisSeconds: {
      title: "Artificial Analysis Seconds per Task ↓",
      body: "Reported runtime to complete one Artificial Analysis Intelligence Index v4.1 task.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported time per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
    artificialAnalysisTokens: {
      title: "Artificial Analysis Output Tokens per Task",
      body: "Reported output tokens used to complete one Artificial Analysis Intelligence Index v4.1 task.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported output tokens per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
  };
}

export const COLUMN_TOOLTIPS = columnTooltipsForActiveComponents();
