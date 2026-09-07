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

const QUALITY_REGULARIZATION_SCALE =
  "ordinary high means stay at 50 through 10% of the aggregate-index median evidence mass, then move toward the task mean, including supported sibling estimates; regularization ends at that median";

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
    [
      "Aggregation",
      "20% tasks / 80% indexes at one direct task; 80% tasks / 20% indexes at the configured direct-task threshold",
    ],
    [
      "Imputed values",
      "supported sibling estimates enter missing task contributions; validated contextual predictions supply discounted evidence support",
    ],
    ["Evidence support", "literal weighted share of direct or validated evidence"],
    ["Coverage regularization", QUALITY_REGULARIZATION_SCALE],
    [
      "Aggregate-index proxy",
      "effort-labelled variants use effort-aware indexes (currently AA); each variant uses its own direct task count; a smooth taper reaches 80% tasks / 20% indexes at the configured direct-task threshold tasks",
    ],
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
      body: "Knowledge, perception, understanding, reasoning, and judgment on selected difficult benchmarks. Each observed result is normalized to 0-100 and weighted by benchmark importance × Intelligence loading. Sparse high means can be pulled toward 50; observed aggregate indexes provide a broader proxy when task coverage is incomplete, moving from 20% task / 80% index at one direct task to 80% task / 20% index at the configured direct-task threshold.",
      rows: [
        ["Observed benchmark weight", "importance × Intelligence loading"],
        ["Benchmark normalization", "0 at the observed minimum, 100 at the maximum"],
        [
          "Final score",
          "task mean with supported sibling estimates; index blend or sparse-high regularization as applicable",
        ],
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
      body: "How reliably the model turns goals into working results through coding, instruction following, tool use, verification, and recovery. Selected benchmark contributions are weighted by importance × Agentic loading. Direct token use can adjust a contribution before it is remapped to 0-100, using independent models at similar benchmark quality as the comparison.",
      rows: [
        ["Observed benchmark weight", "importance × Agentic loading"],
        [
          "Benchmark normalization",
          "zero-based contribution × token modifier, then cohort remapped to 0-100",
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
          "task mean with supported sibling estimates; index blend or sparse-high regularization as applicable",
        ],
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
      body: "How quickly the model delivers comparable work. Ordinary ranked models assign 70% of base weight to benchmark task time and 30% to provider speed. Tasks are compared at similar benchmark quality, so easier or lower-quality work does not automatically look faster. A bounded local trend blends with the peer average as support grows, and qualities beyond the peer range use its nearest endpoint. Resources must match the benchmark; overall source averages cannot fill missing tasks. Limited peer support brings a task comparison toward neutral 50; missing or estimated inputs reduce evidence support.",
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
          "validated sibling estimate, then the shared global/lab/release/model resource fallback",
        ],
        [
          "Speed availability",
          "at least 4 benchmarks of observed time-and-quality coverage, including residual AA index breadth; estimates do not count",
        ],
        ["Model coverage", "shared source-default multiplier; full from 60% coverage"],
        [
          "Previews",
          "100% provider speed tapering to 80% provider / 20% tasks with observed runtime-pair coverage",
        ],
        ["Preview without task runtime", "provider speed alone; no missing-coverage multiplier"],
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
      body: "How efficiently the model delivers capability for its cost. Ordinary ranked models assign 70% of base weight to task cost and 30% to absolute and quality-adjusted token price. Comparing tasks at similar quality helps distinguish efficient work from merely cheap work. A bounded local trend blends with the peer average as support grows, and qualities beyond the peer range use its nearest endpoint. Resources must match the benchmark; overall source averages cannot fill missing tasks. Limited peer support brings a comparison toward neutral 50; missing or estimated inputs reduce evidence support.",
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
          "validated sibling first; fixed-shrinkage global/lab/release-proximity/model cost fallback",
        ],
        [
          "Value availability",
          "at least 4 benchmarks of observed cost-and-quality coverage, including residual AA index breadth",
        ],
        ["Without eligible Value", "quality remains in the table; excluded from all graphs"],
        ["Model coverage", "shared source-default multiplier; full from 60% coverage"],
        [
          "Previews",
          "100% price components tapering to 80% price / 20% tasks with observed cost-pair coverage",
        ],
        ["Preview without task cost", "price components alone; no missing-coverage multiplier"],
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
