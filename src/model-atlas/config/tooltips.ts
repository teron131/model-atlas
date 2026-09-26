/** Column tooltip copy stays aligned with active scoring weights and benchmark resource policy. */

import { isAggregateIndex } from "../benchmarks/index-policy";
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

const QUALITY_REGULARIZATION_SCALE =
  "retain 85% of the score through 1.2 supported benchmark weight, rising smoothly to 100% at 12; eligible indexes count their overlap-adjusted breadth";

export const CONFIDENCE_TOOLTIP = {
  title: "Evidence support",
  body: "How much of each score's input weight is supported by direct results or discounted, validated estimates. This is evidence coverage, not a confidence interval or the probability that a rank is correct.",
  rows: [
    ["I", "Intelligence evidence support"],
    ["A", "Agentic evidence support"],
    ["S", "Speed evidence support"],
    ["V", "Value evidence support"],
    ["Displayed scale", "literal weighted share of active inputs"],
    ["Quality regularization", QUALITY_REGULARIZATION_SCALE],
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
  const group = benchmarkPortfolioEntry(key)?.group;
  if (group === "baseline") return "display only";
  const totalWeight = keys.reduce(
    (sum, benchmarkKey) =>
      sum +
      (!isAggregateIndex(benchmarkKey) && benchmarkPortfolioEntry(benchmarkKey)?.group === group
        ? benchmarkDimensionWeight(benchmarkKey, dimension)
        : 0),
    0,
  );
  return totalWeight > 0
    ? percent(
        benchmarkDimensionWeight(key, dimension) / totalWeight,
        dimension === "intelligence" ? 2 : 1,
      )
    : "-";
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
    indexes: readonly ModelAtlasColumnTooltipRow[];
  }>,
  dimension: "intelligence" | "agentic",
) =>
  [
    [
      "Effective weight",
      dimension === "intelligence"
        ? "importance × Intelligence allocation for frontier benchmarks"
        : "importance × Agentic allocation for frontier benchmarks",
    ],
    [
      "Aggregation",
      dimension === "intelligence"
        ? "frontier benchmarks supply the benchmark score; indexes enter at their overlap-adjusted evidence share"
        : "frontier benchmarks and eligible indexes form one evidence pool; direct benchmarks receive a 1.5× multiplier and indexes multiply configured weight by represented breadth",
    ],
    [
      "Imputed values",
      "supported estimates from other efforts enter missing benchmark contributions; validated predictions from other benchmarks supply discounted evidence support",
    ],
    ["Evidence support", "literal weighted share of direct or validated evidence"],
    ["Coverage regularization", QUALITY_REGULARIZATION_SCALE],
    [
      "Aggregate-index proxy",
      "known direct and cross-index component overlap counts once; ECI uses fixed breadth 7.5; effort-labelled variants use effort-aware AA and CAIS indexes",
    ],
    {
      title: "Frontier benchmarks",
      weight: "100% of benchmark component",
      rows: benchmarkRows.frontier,
    },
    {
      title: "Baseline benchmarks",
      weight: "display only",
      rows: benchmarkRows.baseline,
    },
    {
      title: "Aggregate indexes",
      rows: benchmarkRows.indexes,
    },
  ] as const;

const benchmarkRowsByGroup = (
  keys: readonly BenchmarkKey[],
  dimension: "intelligence" | "agentic",
) => ({
  baseline: keys
    .filter((key) => benchmarkPortfolioEntry(key)?.group === "baseline" && !isAggregateIndex(key))
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
  indexes: keys
    .filter((key) => isAggregateIndex(key))
    .map(
      (key) =>
        [
          BENCHMARK_CATALOG[key].presentation.scoringLabel,
          "model-specific share after overlap",
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
      body: "Knowledge, perception, understanding, reasoning, and judgment on selected difficult benchmarks. Frontier benchmarks supply the benchmark score; baseline results remain visible without directly contributing to either capability. Every quality benchmark uses the same linear scaling within its observed range in Intelligence and Agentic. Aggregate indexes enter at their overlap-adjusted evidence share. Low supported benchmark weight discounts the entire score.",
      rows: [
        ["Benchmark weights", "importance × Intelligence allocation for frontier benchmarks"],
        ["Benchmark normalization", "100 × observed-range position in both capabilities"],
        [
          "Final score",
          "frontier benchmark score plus eligible indexes, then coverage retention once",
        ],
      ],
      sections: [
        {
          title: "Score blend",
          hideTitle: true,
          rows: qualityBenchmarkRows(INTELLIGENCE_BENCHMARK_ROWS, "intelligence"),
        },
      ],
    },
    agentic: {
      title: "Agentic Score",
      body: "How reliably the model turns goals into working results through coding, instruction following, tool use, verification, and recovery. Every quality benchmark uses the same linear scaling within its observed range as Intelligence. Frontier benchmark contributions are weighted by importance × Agentic loading; baseline results remain visible without direct score weight. Direct token use can adjust a contribution before it is remapped to 0-100, using independent models at similar benchmark quality as the comparison.",
      rows: [
        ["Observed benchmark weight", "importance × Agentic loading"],
        [
          "Benchmark quality",
          "same normalized benchmark score in Intelligence and Agentic before the Agentic token modifier",
        ],
        [
          "Benchmark normalization",
          "shared benchmark quality × token modifier, then rescaled within bounds that include 0 and 100",
        ],
        ["Token efficiency", "0.85-1.15 before remapping; not a ±15% bound on the final score"],
        [
          "Token evidence",
          "same-benchmark measurements or discounted estimates; AA tokens apply only to AA's own index",
        ],
        [
          "Weak or missing token evidence",
          "multiplier approaches 1; estimated tokens and inherited index tokens are excluded",
        ],
        [
          "Final score",
          "coverage-regularized unified benchmark/index evidence mean with supported estimates from other efforts",
        ],
      ],
      sections: [
        {
          title: "Score blend",
          hideTitle: true,
          rows: qualityBenchmarkRows(AGENTIC_BENCHMARK_ROWS, "agentic"),
        },
      ],
    },
    speed: {
      title: "Speed Score",
      body: "How quickly the model delivers comparable work. Ranked models assign 70% of base weight to benchmark task time and 30% to provider speed. Resource measurements are compared at similar benchmark quality, so easier or lower-quality work does not automatically look faster. A bounded local trend blends with the peer mean as support grows, and qualities beyond the peer range use its nearest endpoint. Resources must match the benchmark; overall source averages cannot fill missing benchmark measurements. Limited peer support brings a benchmark resource comparison toward neutral 50; missing or estimated inputs reduce evidence support.",
      rows: [
        [
          "Benchmark runtimes",
          "70% base weight; bounded local quality trend blended by peer support",
        ],
        [
          "Runtime estimates",
          "output tokens divided by output throughput; total tokens are not substituted",
        ],
        [
          "Provider metrics",
          "30% base weight; equal shares for throughput and both latency metrics",
        ],
        [
          "Missing task runtime",
          "validated estimate from another effort, then the shared global/lab/release/model resource fallback",
        ],
        [
          "Speed availability",
          "at least 4 benchmarks of observed time-and-quality coverage, including residual AA index breadth; estimates do not count",
        ],
        ["Model coverage", "shared source-default multiplier; full from 60% coverage"],
      ],
      sections: [
        {
          title: "Official Speed inputs",
          hideTitle: true,
          rows: speedInputRows(components),
        },
      ],
    },
    value: {
      title: "Value Score",
      body: "How efficiently the model delivers capability for its cost. Ranked models assign 70% of base weight to task cost and 30% to absolute and quality-adjusted token price. Comparing benchmark resource measurements at similar quality helps distinguish efficient work from merely cheap work. A bounded local trend blends with the peer mean as support grows, and qualities beyond the peer range use its nearest endpoint. Resources must match the benchmark; overall source averages cannot fill missing benchmark measurements. Limited peer support brings a comparison toward neutral 50; missing or estimated inputs reduce evidence support.",
      rows: [
        [
          "Benchmark task costs",
          "70% base weight; bounded local quality trend blended by peer support",
        ],
        [
          "Price components",
          "30% base weight; equal shares for absolute and quality-adjusted price",
        ],
        [
          "Missing task cost",
          "validated effort estimate first; fixed-shrinkage global/lab/release-proximity/model cost fallback",
        ],
        [
          "Value availability",
          "at least 4 benchmarks of observed cost-and-quality coverage, including residual AA index breadth",
        ],
        ["Without eligible Value", "quality remains in the table; excluded from all graphs"],
        ["Model coverage", "shared source-default multiplier; full from 60% coverage"],
      ],
      sections: [
        {
          title: "Official Value inputs",
          hideTitle: true,
          rows: valueInputRows(components),
        },
      ],
    },
    blend: {
      title: "Effective blended price ↓",
      body: "An equal blend of effective input and output prices, in USD per million tokens. Provider prices are weighted by estimated OpenRouter token share. This gives a common comparison price; a workload's bill depends on its own input/output mix.",
      rows: [
        ["Source", "OpenRouter"],
        ["Blend", "50% effective input price + 50% effective output price"],
        ["Provider weighting", "estimated OpenRouter token share"],
      ],
    },
    context: {
      title: "Context",
      body: "The maximum context window reported for the selected model route, in tokens.",
      rows: [
        ["Definition", "maximum context window"],
        ["Unit", "tokens"],
        ["Source", "selected model metadata"],
      ],
    },
    artificialAnalysisCost: {
      title: "Artificial Analysis Cost per Task ↓",
      body: "Artificial Analysis's reported cost to complete one Intelligence Index task. This is a task cost, separate from a price per million tokens.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported cost per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
    artificialAnalysisSeconds: {
      title: "Artificial Analysis Seconds per Task ↓",
      body: "Artificial Analysis's reported time to complete one Intelligence Index task, in seconds.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported time per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
    artificialAnalysisTokens: {
      title: "Artificial Analysis Output Tokens per Task",
      body: "Artificial Analysis's reported output tokens per Intelligence Index task. These tokens describe the index evaluation, not each constituent benchmark.",
      rows: [
        ["Source", "Artificial Analysis"],
        ["Metric", "reported output tokens per Intelligence task"],
        ["Method", "direct Artificial Analysis per-task field"],
      ],
    },
  };
}

export const COLUMN_TOOLTIPS = columnTooltipsForActiveComponents();
