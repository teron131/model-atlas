/** Verify leaderboard column presets and full-metadata search behavior. */

import assert from "node:assert/strict";

import {
  ALL_TABLE_COLUMN_KEYS,
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  tableColumnKeysForView,
  tableColumnSearchMatchCount,
  tableColumnSortKey,
} from "../app/dashboard/table/column-views";
import { tableColumnRuleKeys } from "../app/dashboard/table/models";
import { COLUMN_TOOLTIPS } from "../src/model-atlas/config";

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

const costRuleKeys = tableColumnRuleKeys(costKeys);
assert.equal(costRuleKeys.has("value"), true, "Cost should separate Value from pricing");
assert.equal(costRuleKeys.has("effectiveOutputPrice"), true, "Cost should close provider pricing");
assert.equal(costRuleKeys.has("hleCost"), true, "Cost should close its visible frontier evidence");
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

const timeRuleKeys = tableColumnRuleKeys(timeKeys);
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

const tooltipSearchKeys = tableColumnKeysForView("scores", "first output token", COLUMN_TOOLTIPS);
assert.equal(
  tooltipSearchKeys.includes("latency"),
  true,
  "Search should match tooltip descriptions",
);

const noMatchKeys = tableColumnKeysForView("all", "no such column evidence", COLUMN_TOOLTIPS);
assert.deepEqual(
  noMatchKeys,
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  "No-match search should preserve identity and headline scores",
);

assert.equal(
  tableColumnSearchMatchCount("Agents Last Exam", COLUMN_TOOLTIPS),
  9,
  "Search result counts should include every matching score and evidence column",
);
assert.equal(
  tableColumnSearchMatchCount("rank", COLUMN_TOOLTIPS),
  1,
  "Search result counts should include fixed column headers",
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
