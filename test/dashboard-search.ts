/** Verify model search boundaries, wildcard alternatives, and relevance before global provider and cost filters. */

import assert from "node:assert/strict";

import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
} from "../app/dashboard/shared/model-display";
import { filterSearchDocuments, hasSearchQuery } from "../app/dashboard/shared/search";
import {
  ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  tableColumnView,
} from "../app/dashboard/table/column-views";
import {
  dashboardMetricColumns,
  dashboardMetricValue,
  tableColumnRuns,
} from "../app/dashboard/table/models";
import { DEFAULT_GLOBAL_MODEL_FILTERS } from "../app/dashboard/url-state";
import { minimalModelAtlasModel } from "./model-atlas-fixtures";

const documents = [
  { value: "sol", primary: ["GPT-6 Sol"] },
  { value: "solar", primary: ["GPT-6 Solar"] },
  { value: "other", primary: ["Grok-6 Sol"] },
];

assert.deepEqual(filterSearchDocuments("gpt*so", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("gpt*sol", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("gpt*so, grok", documents), ["sol", "solar", "other"]);
assert.deepEqual(filterSearchDocuments("sol", documents), ["sol", "solar", "other"]);
assert.deepEqual(filterSearchDocuments("ola", documents), []);
assert.deepEqual(filterSearchDocuments("gpt*xy", documents), []);
assert.deepEqual(filterSearchDocuments("gpt-", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("gpt-6", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("pt-", documents), []);

assert.equal(hasSearchQuery(" , \n , "), false);
assert.equal(hasSearchQuery(" , gpt- , "), true);
assert.equal(hasSearchQuery("*"), true);

// Always-visible columns participate in the same relevance ranking as optional columns.
assert.deepEqual(tableColumnView("all", "change", {}), {
  searchQuery: "change",
  searchMatchCount: 1,
  keys: [...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS, "change"],
});
assert.deepEqual(tableColumnView("all", "intel", {}), {
  searchQuery: "intel",
  searchMatchCount: 3,
  keys: [
    ...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
    "aaIntelligenceIndex",
    "surgeIntelligenceIndex",
    "change",
  ],
});
assert.deepEqual(
  tableColumnView("cost", "unfindable-column", {}),
  tableColumnView("cost", "", {}),
  "A search without column matches retains the selected preset",
);

const communityTooltips = {
  tmbIndex: { title: "Trust Me Bro Index", body: "Overall practical capability." },
  slopIndex: { title: "Slop Index", body: "Visual quality of frontend design and animation." },
};
assert.deepEqual(
  tableColumnView("scores", "", communityTooltips).keys.filter(
    (key) => key === "tmbIndex" || key === "slopIndex",
  ),
  ["tmbIndex", "slopIndex"],
);
assert.equal(tableColumnView("all", "", {}).keys.includes("slopIndex"), false);
assert.equal(
  tableColumnView("all", "", { slopIndex: communityTooltips.slopIndex }).keys.includes("tmbIndex"),
  false,
);
assert.deepEqual(tableColumnView("all", "slop", communityTooltips).keys, [
  ...ALWAYS_VISIBLE_TABLE_COLUMN_KEYS,
  "slopIndex",
  "change",
]);
assert.equal(
  tableColumnView("all", "animation", communityTooltips).keys.includes("slopIndex"),
  true,
);
assert.deepEqual(tableColumnRuns(["tmbIndex", "slopIndex"]), [
  { group: "indexes", first: 0, benchmarks: 2 },
]);
const slopColumn = dashboardMetricColumns.find((column) => column.key === "slopIndex")!;
const unrankedModel = minimalModelAtlasModel({ id: "test/model", name: "Test model" });
assert.equal(slopColumn.direction, "ascending");
assert.equal(
  dashboardMetricValue(
    { ...unrankedModel, community_indexes: { slop: { best: 3, worst: 5 } } },
    slopColumn,
  ),
  3,
);
assert.equal(dashboardMetricValue(unrankedModel, slopColumn), null);

// Narrowing provider or cost must not promote a weak fuzzy match after an exact match is excluded.
const models = [
  {
    ...minimalModelAtlasModel({ id: "openai/gpt-5-mini", name: "GPT-5 mini" }),
    provider: "OpenAI",
    cost: { blended_price: 2 },
  },
  {
    ...minimalModelAtlasModel({ id: "google/gemini-3-flash", name: "Gemini 3 Flash" }),
    provider: "Google",
    cost: { blended_price: 1 },
  },
];
// The fixtures carry no release dates, so these checks look across every date.
const everyDate: GlobalModelFilters = { ...DEFAULT_GLOBAL_MODEL_FILTERS, days: "all" };
const scope = { observedAtEpochSeconds: null, rankingModels: models };
for (const filters of [
  { ...everyDate, q: "mini", provider: ["google"] },
  { ...everyDate, q: "mini", "max-cost": 1 },
]) {
  assert.deepEqual(
    filterByGlobalModelFilters(models, (model) => model, filters, scope),
    [],
  );
  const rows = models.map((model) => ({ model }));
  assert.deepEqual(
    filterByGlobalModelFilters(rows, (row) => row.model, filters, scope),
    [],
  );
}

// A family the dashboard never shows cannot take a Top-N slot from one it does.
const rankedModels = Array.from({ length: 31 }, (_, index) => ({
  ...minimalModelAtlasModel({ id: `openai/gpt-${index}`, name: `GPT-${index}` }),
  provider: "OpenAI",
  scores: {
    intelligence_score: 50 - index,
    agentic_score: 50,
    speed_score: null,
    value_score: null,
  },
}));
const hiddenModel = {
  ...minimalModelAtlasModel({ id: "openai/gpt-6-pro", name: "GPT-6 Pro" }),
  provider: "OpenAI",
  scores: { intelligence_score: 99, agentic_score: 99, speed_score: null, value_score: null },
};
assert.deepEqual(
  filterByGlobalModelFilters(
    rankedModels,
    (model) => model,
    { ...everyDate, rank: 30 },
    { observedAtEpochSeconds: null, rankingModels: [hiddenModel, ...rankedModels] },
  ),
  rankedModels.slice(0, 30),
);
