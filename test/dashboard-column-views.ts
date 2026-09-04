/** Verify leaderboard column presets and full-metadata search behavior. */

import assert from "node:assert/strict";

import { filterSearchDocuments } from "../app/dashboard/shared/search";
import {
  ALL_TABLE_COLUMN_KEYS,
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  tableColumnKeysByCoverage,
  tableColumnKeysForView,
  tableColumnSearchMatchCount,
  tableColumnSortKey,
} from "../app/dashboard/table/column-views";
import {
  benchmarkMetricColumns,
  dedupeDisplayModels,
  tableColumnRuleKeys,
} from "../app/dashboard/table/models";
import { COLUMN_TOOLTIPS } from "../src/model-atlas/config";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const scoreKeys = tableColumnKeysForView("scores", "", COLUMN_TOOLTIPS);
assert.equal(scoreKeys.includes("intelligence"), true, "Scores should include headline scores");
assert.equal(scoreKeys.includes("aaIntelligenceIndex"), true, "Scores should include indexes");
assert.equal(scoreKeys.includes("agentsLastExam"), true, "Scores should include benchmark results");
assert.equal(
  scoreKeys.includes("agentsLastExamCost"),
  false,
  "Scores should omit resource evidence",
);

const costKeys = tableColumnKeysForView("cost", "", COLUMN_TOOLTIPS);
assert.deepEqual(
  costKeys.slice(0, ALWAYS_VISIBLE_TABLE_COLUMN_KEYS.length),
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  "Cost should preserve all headline scores",
);
assert.equal(costKeys.includes("value"), true, "Cost should include Value");
assert.equal(costKeys.includes("effectiveInputPrice"), true, "Cost should include input price");
assert.equal(costKeys.includes("agentsLastExamCost"), true, "Cost should include benchmark costs");
assert.equal(costKeys.includes("terminalBench4Cost"), true, "Cost should include TB4 cost");
assert.equal(
  costKeys.includes("agentsLastExamSeconds"),
  false,
  "Cost should omit benchmark runtimes",
);

const timeKeys = tableColumnKeysForView("time", "", COLUMN_TOOLTIPS);
assert.deepEqual(
  timeKeys.slice(0, ALWAYS_VISIBLE_TABLE_COLUMN_KEYS.length),
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  "Time should preserve all headline scores",
);
assert.equal(timeKeys.includes("speed"), true, "Time should include Speed");
assert.equal(timeKeys.includes("latency"), true, "Time should include provider latency");
assert.equal(
  timeKeys.includes("agentsLastExamSeconds"),
  true,
  "Time should include benchmark runtimes",
);
assert.equal(timeKeys.includes("agentsLastExamCost"), false, "Time should omit benchmark costs");

const allKeys = tableColumnKeysForView("all", "", COLUMN_TOOLTIPS);
assert.equal(allKeys.includes("terminalBench4Tokens"), true, "All should include TB4 tokens");

const costRuleKeys = tableColumnRuleKeys(costKeys, "portfolio");
assert.equal(costRuleKeys.has("value"), true, "Cost should separate Value from pricing");
assert.equal(costRuleKeys.has("effectiveOutputPrice"), true, "Cost should close provider pricing");
assert.equal(
  costRuleKeys.has("terminalBenchScienceCost"),
  true,
  "Cost should close its visible frontier evidence",
);
assert.equal(
  costRuleKeys.has("artificialAnalysisCost"),
  true,
  "Cost should close its visible index evidence",
);
assert.equal(
  costRuleKeys.has("riemannBench"),
  false,
  "Cost should not depend on a hidden score column",
);

const timeRuleKeys = tableColumnRuleKeys(timeKeys, "portfolio");
assert.equal(timeRuleKeys.has("value"), true, "Time should separate scores from provider timing");
assert.equal(timeRuleKeys.has("e2eLatency"), true, "Time should close provider timing");
assert.equal(
  timeRuleKeys.has("hleSeconds"),
  true,
  "Time should close its visible frontier evidence",
);
assert.equal(
  timeRuleKeys.has("artificialAnalysisSeconds"),
  true,
  "Time should close its visible index evidence",
);
assert.equal(
  timeRuleKeys.has("riemannBench"),
  false,
  "Time should not depend on a hidden score column",
);

assert.deepEqual(
  tableColumnKeysForView("all", "", COLUMN_TOOLTIPS),
  ALL_TABLE_COLUMN_KEYS,
  "All should preserve the complete canonical table",
);

const benchmarkSearchKeys = tableColumnKeysForView("scores", "Agents Last Exam", COLUMN_TOOLTIPS);
assert.deepEqual(
  benchmarkSearchKeys.slice(0, ALWAYS_VISIBLE_TABLE_COLUMN_KEYS.length),
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  "Search should preserve all headline scores",
);
assert.equal(
  benchmarkSearchKeys.includes("agentsLastExam"),
  true,
  "Search should match full benchmark names",
);
assert.equal(
  benchmarkSearchKeys.includes("agentsLastExamCost"),
  true,
  "Search should ignore preset membership",
);

const financeColumn = benchmarkMetricColumns.find(
  (column) => column.benchmark === "finance_agent_v2",
);
assert.ok(financeColumn);
for (const query of ["fin", "financ", "finace", "finanxe", "finnance", "finacne", "finace ag"]) {
  assert.equal(
    tableColumnKeysForView("scores", query, COLUMN_TOOLTIPS).includes(financeColumn.key),
    true,
    `Search should find Finance Agent V2 for the partial or mistyped query ${query}`,
  );
}

const critptColumn = benchmarkMetricColumns.find((column) => column.benchmark === "critpt");
assert.ok(critptColumn);
assert.equal(
  tableColumnKeysForView("scores", "crit", COLUMN_TOOLTIPS).includes(critptColumn.key),
  true,
  "Search should retain a benchmark prefix when exact resource aliases also match",
);

const searchDocuments = [
  { value: "finance", primary: "Finance Agent V2" },
  { value: "context", primary: "Other", context: "Finance workflows" },
  { value: "unrelated", primary: "Final exam" },
];
assert.deepEqual(
  filterSearchDocuments("finace", searchDocuments),
  ["finance", "context"],
  "Typo matching should search names and descriptions while preserving display order",
);
for (const query of ["fnce", "fin.*", "fiz"]) {
  assert.deepEqual(
    filterSearchDocuments(query, searchDocuments),
    [],
    "Search should keep regex punctuation literal and avoid broad or short-word typo matches",
  );
}
assert.deepEqual(
  filterSearchDocuments("5.7", [{ value: "model", primary: "GPT 5.6" }]),
  [],
  "Typo tolerance should not blur distinct model versions",
);
assert.deepEqual(
  filterSearchDocuments("inteligance", [{ value: "intelligence", primary: "Intelligence" }]),
  ["intelligence"],
  "Fuzzy search should tolerate multiple small typos in longer words",
);

const tooltipSearchKeys = tableColumnKeysForView("scores", "first output token", COLUMN_TOOLTIPS);
assert.equal(
  tooltipSearchKeys.includes("latency"),
  true,
  "Search should match tooltip descriptions",
);
assert.equal(
  tableColumnKeysForView("scores", "first*token", COLUMN_TOOLTIPS).includes("latency"),
  true,
  "Search should support safe wildcard matching across tooltip descriptions",
);
assert.deepEqual(
  filterSearchDocuments("agent coding tool", [
    { value: "exact", primary: "Agent Coding Tool" },
    { value: "partial", primary: "Other", context: ["agent", "coding"] },
  ]),
  ["exact"],
  "Search should remove partial candidates below the best result's relevance threshold",
);

const noMatchKeys = tableColumnKeysForView("all", "no such column evidence", COLUMN_TOOLTIPS);
assert.deepEqual(
  noMatchKeys,
  [...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS, "change"],
  "No-match search should preserve identity, headline scores, and the final change column",
);

assert.equal(
  tableColumnSearchMatchCount("Agents Last Exam", COLUMN_TOOLTIPS),
  9,
  "Search result counts should include every matching score and evidence column",
);
assert.equal(
  tableColumnSearchMatchCount("rank", COLUMN_TOOLTIPS),
  2,
  "Search result counts should include fixed columns whose tooltip text matches",
);

assert.equal(
  tableColumnSortKey("cost", "", costKeys),
  "value",
  "Cost should default to a visible cost-oriented sort",
);
assert.equal(
  tableColumnSortKey("all", "confidence", [...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS, "confidence"]),
  "intelligence",
  "Search should fall back to the first visible headline score when its match is not sortable",
);

const agentArenaColumn = benchmarkMetricColumns.find(
  (column) => column.benchmark === "agent_arena",
);
const aleBenchColumn = benchmarkMetricColumns.find((column) => column.benchmark === "ale_bench");
assert.ok(agentArenaColumn);
assert.ok(aleBenchColumn);
const coverageRows = dedupeDisplayModels([
  {
    ...minimalModelAtlasModel({ id: "provider/complete", name: "Complete" }),
    benchmarks: { agent_arena: 0.7, ale_bench: 0.6 },
  },
  {
    ...minimalModelAtlasModel({ id: "provider/partial", name: "Partial" }),
    benchmarks: { agent_arena: 0.5 },
  },
]);
const coverageOrderedKeys = tableColumnKeysByCoverage(
  [...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS, aleBenchColumn.key, agentArenaColumn.key, "change"],
  coverageRows,
);
assert.deepEqual(
  coverageOrderedKeys,
  [...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS, agentArenaColumn.key, aleBenchColumn.key, "change"],
  "coverage ordering should move denser benchmarks first without moving fixed columns",
);
const coverageOrderedScoreKeys = tableColumnKeysByCoverage(scoreKeys, coverageRows);
const coverageRuleKeys = tableColumnRuleKeys(coverageOrderedScoreKeys, "coverage");
const finalBenchmarkKey = coverageOrderedScoreKeys.at(-2);
assert.ok(finalBenchmarkKey);
assert.deepEqual(
  [...coverageRuleKeys],
  ["value", finalBenchmarkKey],
  "Coverage order should rule only the outer benchmark block boundaries",
);
