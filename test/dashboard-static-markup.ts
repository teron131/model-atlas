/** Verify server-rendered dashboard markup for key loading and interaction states. */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ColumnTooltip } from "../app/dashboard/shared/ColumnTooltip";
import { benchmarkLabels, benchmarkTooltips } from "../app/dashboard/shared/constants";
import { formatBenchmarkMetric } from "../app/dashboard/shared/format";
import { ALL_TABLE_COLUMN_KEYS } from "../app/dashboard/table/column-views";
import {
  benchmarkMetricColumns,
  dashboardMetricColumns,
  type TableColumnKey,
  tableColumnRuleKeys,
  type TableRow,
} from "../app/dashboard/table/models";
import { scoreChangeTooltip, tableColumnTooltip } from "../app/dashboard/table/tooltips";
import {
  AGENTIC_BENCHMARK_DISPLAY_KEYS,
  BENCHMARK_PORTFOLIO,
  INDEX_BENCHMARK_KEYS,
  INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
} from "../src/model-atlas/benchmarks/registry";
import { COLUMN_TOOLTIPS } from "../src/model-atlas/config";
import type { ModelAtlasModel } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export default new Proxy({}, { get: (_, key) => String(key) });",
      };
    }
    return nextLoad(url, context);
  },
});

const { Dashboard } = await import("../app/dashboard/index");
const { BenchmarkStrip } = await import("../app/dashboard/BenchmarkStrip");
const { ModelTable } = await import("../app/dashboard/table/ModelTable");

const payload = minimalModelAtlasPayload({
  fetchedAt: 900,
  models: [
    {
      ...minimalModelAtlasModel({
        id: "openai/gpt-5.5",
        name: "GPT-5.5",
      }),
      release_date: "1970-01-01",
      benchmarks: { deep_swe: 0.6 },
      confidence: {
        intelligence: 0.83,
        agentic: 0.47,
        speed: 0.72,
        value: 0.61,
      },
      scores: {
        intelligence_score: 90,
        agentic_score: 80,
        speed_score: 70,
        value_score: 60,
      },
    },
  ],
});
payload.metadata.scoring.benchmark_portfolio = {
  deep_swe: BENCHMARK_PORTFOLIO.deep_swe,
};
const html = renderToStaticMarkup(React.createElement(Dashboard, { initialPayload: payload }));
const loadingHtml = renderToStaticMarkup(React.createElement(Dashboard, { initialPayload: null }));
const { confidence: _staleConfidence, ...staleConfidenceModel } = minimalModelAtlasModel({
  id: "openai/stale-snapshot-model",
  name: "Stale Snapshot Model",
});
staleConfidenceModel.release_date = "1970-01-01";
const staleConfidenceHtml = renderToStaticMarkup(
  React.createElement(Dashboard, {
    initialPayload: minimalModelAtlasPayload({
      fetchedAt: 901,
      models: [staleConfidenceModel as ModelAtlasModel],
    }),
  }),
);

const coverageModels = [
  {
    ...minimalModelAtlasModel({
      id: "openai/gpt-5.5",
      name: "GPT-5.5",
    }),
    benchmarks: { deep_swe: 0.6 },
  },
  minimalModelAtlasModel({
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
  }),
];
const coveragePayload = minimalModelAtlasPayload({
  fetchedAt: 902,
  models: coverageModels,
});
coveragePayload.metadata.scoring.agentic_benchmark_display_keys = ["deep_swe"];
coveragePayload.metadata.scoring.benchmark_portfolio = {
  deep_swe: {
    group: "frontier",
    benchmarkImportance: 1,
    dimensionLoadings: { intelligence: 0, agentic: 1 },
  },
};
const benchmarkCoverageHtml = renderToStaticMarkup(
  React.createElement(BenchmarkStrip, {
    payload: coveragePayload,
    models: coverageModels,
    isLoading: false,
  }),
);
const benchmarkOrderPayload = minimalModelAtlasPayload({
  fetchedAt: 903,
  models: coverageModels,
});
benchmarkOrderPayload.metadata.scoring.intelligence_benchmark_display_keys = [
  "weirdml",
  "riemann_bench",
  "agents_last_exam",
];
benchmarkOrderPayload.metadata.scoring.benchmark_portfolio = {
  agents_last_exam: BENCHMARK_PORTFOLIO.agents_last_exam,
  riemann_bench: BENCHMARK_PORTFOLIO.riemann_bench,
  weirdml: BENCHMARK_PORTFOLIO.weirdml,
};
const benchmarkOrderHtml = renderToStaticMarkup(
  React.createElement(BenchmarkStrip, {
    payload: benchmarkOrderPayload,
    models: coverageModels,
    isLoading: false,
  }),
);
const displayedBenchmarkKeys = new Set([
  ...INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
  ...AGENTIC_BENCHMARK_DISPLAY_KEYS,
]);
const tableColumnKeys: TableColumnKey[] = [...ALL_TABLE_COLUMN_KEYS];

assert.equal(
  html.includes("Loading stats"),
  false,
  "server-readable dashboard markup should not show the loading state when rows are available",
);
assert.equal(
  html.includes("openai/gpt-5.5"),
  true,
  "server-readable dashboard markup should include model row ids",
);
assert.equal(
  html.includes("Evidence") &&
    html.includes("Intelligence evidence support 83%") &&
    html.includes("Agentic evidence support 47%") &&
    html.includes("Speed evidence support 72%") &&
    html.includes("Value evidence support 61%"),
  true,
  "the final dashboard column should expose separate confidence percentages",
);
assert.equal(
  staleConfidenceHtml.includes(
    'aria-label="Intelligence evidence support -; Agentic evidence support -; Speed evidence support -; Value evidence support -"',
  ) && staleConfidenceHtml.includes('class="data-cell confidence-cell missing"'),
  true,
  "stale dashboard rows without confidence should use the neutral missing representation",
);
assert.equal(
  matchCount(html, 'data-column-key="confidence"'),
  2,
  "the sticky and source table headers should end with the confidence column",
);
assert.equal(
  html.includes("Variants") && html.includes("Collapsed") && html.includes("Expanded"),
  true,
  "the global view panel should expose both reasoning variant display modes",
);
assert.equal(
  html.includes('aria-label="Search table columns"') &&
    html.includes('placeholder="Search columns or benchmarks"') &&
    html.includes('aria-label="Column presets"') &&
    html.includes("Scores") &&
    html.includes("Cost") &&
    html.includes("Time") &&
    html.includes("All"),
  true,
  "the leaderboard should expose full-catalog column search and fixed presets",
);
assert.equal(
  html.includes('aria-label="Global model filter"') && html.includes('placeholder="Filter models"'),
  true,
  "the global view panel should expose a model string filter",
);
assert.equal(
  html.includes("data-capture-theme"),
  true,
  "graph exports should have a stable theme boundary independent of CSS-module class names",
);
assert.equal(
  html.includes("Pareto Frontier") &&
    html.includes("Price vs Cost Efficiency") &&
    html.includes("Frontier Benchmarks") &&
    !html.includes('id="interaction-matrix"'),
  true,
  "server markup should include every remaining graph panel and omit the removed interaction matrix",
);
assert.equal(
  matchCount(html, 'data-column-key="model"'),
  2,
  "server-readable dashboard markup should include the sticky and source table headers",
);
assert.equal(
  loadingHtml.includes("Loading stats"),
  false,
  "initial loading markup should use structured placeholders instead of a single table message",
);
assert.equal(
  matchCount(loadingHtml, 'class="loading-row"'),
  12,
  "initial loading markup should preserve table density with skeleton rows",
);
assert.equal(
  loadingHtml.includes("benchmark-chip-loading"),
  true,
  "initial loading markup should include benchmark placeholder chips",
);
assert.equal(
  benchmarkCoverageHtml.includes('benchmark-chip-coverage">50%</span>'),
  true,
  "benchmark chips should show observed coverage for the current model view",
);
assert.equal(
  benchmarkCoverageHtml.includes("50% coverage in current model view"),
  true,
  "benchmark coverage should be explained in the chip's accessible label",
);
assert.deepEqual(
  [...displayedBenchmarkKeys].filter((key) => benchmarkLabels[key] == null),
  [],
  "every displayed benchmark should have a human-readable label",
);
assert.deepEqual(
  [...displayedBenchmarkKeys].filter((key) => benchmarkTooltips[key] == null),
  [],
  "every displayed benchmark should have tooltip content",
);
assert.deepEqual(
  tableColumnKeys.filter((key) => tableColumnTooltip(key, COLUMN_TOOLTIPS) == null),
  [],
  "every dashboard table column should resolve tooltip content",
);
const confidenceTooltip = tableColumnTooltip("confidence", COLUMN_TOOLTIPS);
assert.ok(confidenceTooltip);
const confidenceTooltipHtml = renderToStaticMarkup(
  React.createElement(ColumnTooltip, {
    content: confidenceTooltip,
    left: 0,
    top: 0,
  }),
);
assert.equal(
  [
    "Evidence support",
    "weighted share of each score",
    "Intelligence evidence support",
    "Agentic evidence support",
    "Speed evidence support",
    "Value evidence support",
    "literal weighted share of active inputs",
    "regularized toward 50 through 10% of the aggregate-index median evidence breadth",
    "unadjusted from that median",
    "source-default variant",
  ].every((text) => confidenceTooltipHtml.includes(text)),
  true,
  "confidence tooltip should explain both dimensions and the evidence scale",
);
assert.deepEqual(
  [...displayedBenchmarkKeys].filter(
    (key) => !benchmarkMetricColumns.some((column) => column.benchmark === key),
  ),
  [],
  "every displayed benchmark should have a leaderboard table column",
);
const indexBenchmarkKeys = new Set<string>(INDEX_BENCHMARK_KEYS);
const benchmarkDisplayGroups = benchmarkMetricColumns.map((column) =>
  BENCHMARK_PORTFOLIO[column.benchmark].group === "frontier"
    ? 0
    : indexBenchmarkKeys.has(column.benchmark)
      ? 1
      : 2,
);
assert.deepEqual(
  benchmarkDisplayGroups,
  [...benchmarkDisplayGroups].sort(),
  "table benchmark columns should place frontier benchmarks before indexes and remaining baselines",
);
assert.deepEqual(
  benchmarkMetricColumns
    .filter((column) => indexBenchmarkKeys.has(column.benchmark))
    .map((column) => column.benchmark),
  INDEX_BENCHMARK_KEYS,
  "index benchmark columns should remain one ordered group",
);
for (const group of ["frontier", "baseline"] as const) {
  const labels = benchmarkMetricColumns
    .filter(
      (column) =>
        BENCHMARK_PORTFOLIO[column.benchmark].group === group &&
        !indexBenchmarkKeys.has(column.benchmark),
    )
    .map((column) => benchmarkLabels[column.benchmark] ?? column.benchmark);
  assert.deepEqual(
    labels,
    [...labels].sort((left, right) => left.localeCompare(right, "en")),
    `${group} table benchmark columns should be alphabetical`,
  );
}
const dashboardMetricColumnKeys = dashboardMetricColumns.map((column) => column.key);
assert.equal(
  dashboardMetricColumns.find((column) => column.key === "modalities")?.label,
  "Modality",
  "the input-modality column should use the agreed compact header",
);
const allTableRuleKeys = tableColumnRuleKeys(ALL_TABLE_COLUMN_KEYS);
const artificialAnalysisColumnIndex = dashboardMetricColumnKeys.indexOf("aaIntelligenceIndex");
assert.deepEqual(
  dashboardMetricColumnKeys.slice(artificialAnalysisColumnIndex, artificialAnalysisColumnIndex + 4),
  [
    "aaIntelligenceIndex",
    "artificialAnalysisCost",
    "artificialAnalysisSeconds",
    "artificialAnalysisTokens",
  ],
  "Artificial Analysis score and resource evidence should remain one benchmark column group",
);
assert.equal(
  allTableRuleKeys.has("effectiveOutputPrice"),
  true,
  "effective output price should close the pricing group",
);
assert.equal(
  allTableRuleKeys.has("terminalBench3"),
  true,
  "the final frontier benchmark should mark the index transition",
);
assert.equal(
  allTableRuleKeys.has("valsIndex"),
  true,
  "the final index benchmark should mark the remaining baseline transition",
);
assert.equal(
  allTableRuleKeys.has("openWeights"),
  true,
  "open weights should close the profile group before confidence",
);
assert.equal(
  allTableRuleKeys.has("weirdMl"),
  true,
  "the final benchmark should close the benchmark group before release",
);
assert.equal(
  allTableRuleKeys.has("context"),
  false,
  "context should no longer close the headline metric group",
);
assert.equal(
  benchmarkOrderHtml.indexOf("Agents&#x27; Last Exam") <
    benchmarkOrderHtml.indexOf("Riemann-bench") &&
    benchmarkOrderHtml.indexOf("Riemann-bench") < benchmarkOrderHtml.indexOf("WeirdML"),
  true,
  "benchmark chips should be alphabetical within frontier and baseline groups",
);
assert.equal(
  benchmarkOrderHtml.includes('class="benchmark-tier-label">Frontier</h3>') &&
    benchmarkOrderHtml.includes('class="benchmark-tier-label">Baseline</h3>'),
  true,
  "benchmark chips should label both frontier and baseline tiers",
);
assert.equal(
  formatBenchmarkMetric(161.77, "number"),
  "161.8",
  "raw benchmark indexes should not be labeled as percentages",
);
assert.equal(
  formatBenchmarkMetric(-0.153, "number"),
  "-0.2",
  "signed benchmark effects should not be labeled as percentages",
);
assert.equal(
  formatBenchmarkMetric(10_936.76, "currency"),
  "$10,936.8",
  "currency benchmarks should retain their unit in the table",
);
const visibleRankRows: TableRow[] = [
  tableRow("provider/seven", "Seven", 7, 0),
  tableRow("provider/eight", "Eight", 8, 1),
  tableRow("provider/ten", "Ten", 10, 2),
];
const rankHtml = renderToStaticMarkup(
  React.createElement(ModelTable, {
    sortState: { key: "rank", direction: "ascending" },
    fitColumnContent: false,
    visibleColumnKeys: ["rank", "model"],
    visibleRows: visibleRankRows,
    emptyMessage: "No models",
    isLoading: false,
    metricColumns: [],
    onScoreChange: () => {},
    onSort: () => {},
    onTooltip: () => {},
    onTooltipEnd: () => {},
  }),
);

assert.deepEqual(
  rankCells(rankHtml),
  ["07", "08", "10"],
  "rendered rank cells should preserve each model's intelligence rank",
);

const changedRow = tableRow("provider/change", "Changed Model", 2, 0);
changedRow.model.latest_change = {
  refresh_id: 200,
  dimension: "intelligence",
  score_before: 79.2,
  score_after: 81,
  score_delta: 1.8,
  rank_before: 3,
  rank_after: 2,
  confidence_before: 64,
  confidence_after: 78,
  causes: [{ kind: "evidence", label: "Evidence: HLE" }],
  rank_drivers: [
    {
      benchmark_key: "hle",
      label: "HLE",
      benchmark_rank: 2,
      benchmark_model_count: 29,
      rank_correlation: 0.77,
    },
  ],
};
const changeHtml = renderToStaticMarkup(
  React.createElement(ModelTable, {
    sortState: { key: "rank", direction: "ascending" },
    fitColumnContent: false,
    visibleColumnKeys: ["rank", "model", "change"],
    visibleRows: [changedRow],
    emptyMessage: "No models",
    isLoading: false,
    metricColumns: [],
    onScoreChange: () => {},
    onSort: () => {},
    onTooltip: () => {},
    onTooltipEnd: () => {},
  }),
);
assert.equal(
  changeHtml.includes('aria-haspopup="dialog"') && changeHtml.includes("I +1.8"),
  true,
  "changed rows should render one compact final-column popover trigger",
);
assert.equal(
  scoreChangeTooltip(changedRow.model).body.includes("Spearman ρ"),
  true,
  "rank-driver evidence should explain its model-balanced correlation method",
);
assert.equal(
  scoreChangeTooltip({
    ...changedRow.model,
    latest_change: { ...changedRow.model.latest_change!, rank_drivers: [] },
  }).body.includes("Spearman ρ"),
  false,
  "changes without rank drivers should not claim correlation evidence",
);

const versionedModelHtml = renderToStaticMarkup(
  React.createElement(ModelTable, {
    sortState: { key: "rank", direction: "ascending" },
    fitColumnContent: false,
    visibleColumnKeys: ["rank", "model"],
    visibleRows: [tableRow("deepseek/deepseek-v4-flash-0731", "DeepSeek V4 Flash", 1, 0)],
    emptyMessage: "No models",
    isLoading: false,
    metricColumns: [],
    onScoreChange: () => {},
    onSort: () => {},
    onTooltip: () => {},
    onTooltipEnd: () => {},
  }),
);
assert.equal(
  versionedModelHtml.includes('class="model" title="DeepSeek V4 Flash">DeepSeek V4 Flash</div>') &&
    versionedModelHtml.includes(
      'class="id" title="deepseek/deepseek-v4-flash-0731">deepseek-v4-flash-0731</div>',
    ),
  true,
  "release identifiers should remain in model slugs without polluting product names",
);

function matchCount(text: string, value: string): number {
  return text.split(value).length - 1;
}

function tableRow(
  id: string,
  name: string,
  intelligenceRank: number,
  originalIndex: number,
): TableRow {
  return {
    model: minimalModelAtlasModel({ id, name }),
    intelligenceRank,
    originalIndex,
    aliasPriority: 0,
    benchmarkDisplayScores: {},
  };
}

function rankCells(html: string) {
  return [...html.matchAll(/class="rank">(\d+)<\/td>/g)].map((match) => match[1]);
}
