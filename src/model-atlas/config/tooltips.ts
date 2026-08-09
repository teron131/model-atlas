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

const CONFIDENCE_SCALE = "zero through 10% weighted evidence; full from 60%";

export const CONFIDENCE_TOOLTIP = {
  title: "Confidence",
  body: "How much evidence supports each estimated score.",
  rows: [
    ["I", "Intelligence confidence"],
    ["A", "Agentic confidence"],
    ["S", "Speed confidence"],
    ["V", "Value confidence"],
    ["I/A scale", CONFIDENCE_SCALE],
    ["S/V scale", "effective direct and validated evidence share"],
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
    ["Imputed-value penalty", "frontier subtracts 1.0x error; baseline subtracts 0.5x error"],
    ["Confidence", CONFIDENCE_SCALE],
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
  const componentCount = resourceKeys.length + PROVIDER_SPEED_LABELS.length;
  const componentWeight = perComponentWeight(1, componentCount);
  return [
    {
      title: "Benchmark runtimes ↓",
      rows: benchmarkResourceRows(resourceKeys, "", "runtime ↓", componentWeight),
    },
    {
      title: "Provider speed",
      rows: PROVIDER_SPEED_LABELS.map((label) => [label, componentWeight] as const),
    },
  ] as const;
};

const valueInputRows = (components: ActiveResourceComponents) => {
  const resourceKeys = resourceBenchmarkKeys(components);
  const componentWeight = perComponentWeight(
    1,
    resourceKeys.length + PRICE_COMPONENT_LABELS.length,
  );
  return [
    {
      title: "Price components",
      rows: PRICE_COMPONENT_LABELS.map((label) => [label, componentWeight] as const),
    },
    {
      title: "Benchmark costs ↓",
      rows: benchmarkResourceRows(resourceKeys, "", "cost ↓", componentWeight),
    },
  ] as const;
};

export function columnTooltipsForActiveComponents(
  components: ActiveResourceComponents = ALL_RESOURCE_COMPONENTS,
): CoreColumnTooltips {
  return {
    intelligence: {
      title: "Intelligence Score",
      body: "Atlas capability score from selected INTELLIGENCE benchmarks. Each benchmark's weight is its importance multiplied by its Intelligence loading; frontier or baseline group affects only missing-data handling.",
      rows: [
        ["Benchmark normalization", "observed min-max range to 0-100"],
        ["Final score", "weighted mean x evidence confidence"],
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
      body: "Atlas workflow and coding-task score from selected AGENTIC benchmarks. Each benchmark's weight is its importance multiplied by its Agentic loading; frontier or baseline group affects only missing-data handling.",
      rows: [
        ["Benchmark normalization", "observed min-max range to 0-100"],
        ["Final score", "weighted mean x evidence confidence"],
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
      body: "Provider inputs are logged before min-max normalization. Benchmark runtime scores average model-balanced percentile and winsorized min-max mappings of logged residuals from the model-excluded expectation at comparable quality, then shrink toward 50 when peer support is weak. Direct inputs get one slot and validated sibling-effort estimates are confidence-weighted. Coverage comes from the model's source-default variant, then one shared multiplier is applied to every effort.",
      rows: [
        ["Provider metrics", "three equal log/min-max components"],
        ["Benchmark runtimes", "quality-adjusted residual hybrid"],
        ["Missing task runtime", "validated sibling-effort ratio or omitted"],
        ["Coverage", "shared from the default variant"],
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
      body: "Blended price uses logged one-sided winsorized min-max normalization. Quality-adjusted price and benchmark-cost inputs average model-balanced percentile and winsorized min-max mappings of residuals from the model-excluded expectation at comparable quality. Direct inputs get one slot and validated sibling-effort estimates are confidence-weighted. Coverage comes from the model's source-default variant, then one shared multiplier is applied to every effort.",
      rows: [
        ["Blended price", "log input, then winsorized min-max"],
        ["Quality-adjusted price signals", "residual percentile/min-max mean"],
        ["Benchmark costs", "logged residual percentile/min-max mean"],
        ["Missing task cost", "validated sibling-effort ratio or omitted"],
        ["Coverage", "shared from the default variant"],
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
      body: "Current routed-provider effective token price.",
      rows: [
        ["Source", "OpenRouter"],
        ["Metric", "50% effective input + 50% effective output"],
        ["Method", "weighted by estimated OpenRouter traffic share"],
      ],
    },
    context: {
      title: "Context",
      body: "Largest prompt context window available for the model.",
      rows: [
        ["Definition", "maximum input tokens"],
        ["Unit", "tokens"],
        ["Source", "model context limit"],
      ],
    },
    artificialAnalysisCost: {
      title: "Artificial Analysis Cost per Task ↓",
      body: "Artificial Analysis v4.1 reported cost for one Intelligence Index task.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported cost per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
    artificialAnalysisSeconds: {
      title: "Artificial Analysis Seconds per Task ↓",
      body: "Artificial Analysis v4.1 reported runtime for one Intelligence Index task.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported time per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
    artificialAnalysisTokens: {
      title: "Artificial Analysis Output Tokens per Task",
      body: "Artificial Analysis v4.1 reported output tokens for one Intelligence Index task.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported output tokens per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
  };
}

export const COLUMN_TOOLTIPS = columnTooltipsForActiveComponents();
