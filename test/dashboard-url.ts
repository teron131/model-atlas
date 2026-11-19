/** Verify shareable dashboard selections: section paths with short names, sparse defaults, malformed links, and state kept off a link but in its history entry. */

import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  dashboardHistoryEntry,
  type DashboardState,
  dashboardUrl,
  type DashboardUrlPatch,
  modelLinkId,
  patchDashboardState,
  readDashboardUrl,
  readUrlValue,
  savedDashboardState,
  sectionRegion,
} from "../app/dashboard/url-state";
import { DashboardUrlProvider, useUrlState } from "../app/dashboard/use-url-state";

/** Both table and graph controls must use the request URL before browser hydration. */
function InitialSelections() {
  const [providers] = useUrlState("provider");
  const [query] = useUrlState("table-q");
  const [variants] = useUrlState("graph-variants");
  const [rank] = useUrlState("rank");
  return createElement("output", null, `${providers.join(",")}|${query}|${variants}|${rank}`);
}

assert.equal(
  renderToStaticMarkup(
    createElement(DashboardUrlProvider, {
      url: "/leaderboard?search=Grok&provider=openai,xai&graph-variants=1&rank=30",
      children: createElement(InitialSelections),
    }),
  ),
  "<output>openai,xai|Grok|true|30</output>",
  "The initial table and chart must not render with defaults before switching to URL filters",
);

const base = new URL("https://model-atlas.test/");
const empty = readDashboardUrl(base);
const at = (href: string) => readDashboardUrl(new URL(href, base));
const patched = (patch: DashboardUrlPatch, from: DashboardState = empty) =>
  patchDashboardState(from, patch);
const address = (state: DashboardState, from = base) => {
  const url = dashboardUrl(state, from);
  return `${url.pathname}${url.search}`;
};

assert.equal(address(empty), "/");
assert.equal(empty.section, null);
assert.equal(readUrlValue(empty.params, "view"), "all");
assert.equal(readUrlValue(empty.params, "rank"), "all");
assert.equal(readUrlValue(empty.params, "days"), 180);
assert.equal(
  readUrlValue(patched({ days: "all" }).params, "days"),
  "all",
  "Choosing every release date must survive a reload, since the default window is narrower",
);
assert.equal(readUrlValue(empty.params, "performance"), "intelligence");
assert.equal(readUrlValue(empty.params, "axes"), "cost");
for (const axis of ["cost", "time", "tokens", "speed", "value"] as const) {
  assert.equal(readUrlValue(patched({ axes: axis }).params, "axes"), axis);
}
assert.equal(readUrlValue(new URLSearchParams("axes=speedValue"), "axes"), "cost");

const cost = patched({ view: "cost" });
assert.equal(
  address(cost),
  "/leaderboard?view=cost",
  "A table control moves the link to the table",
);
assert.equal(address(patched({ view: "all" })), "/leaderboard");
assert.equal(address(patched({ "table-variants": false })), "/leaderboard");
assert.equal(address(patched({ rank: "all" })), "/", "A page-wide control leaves the section");

const campaign = new URL("/leaderboard?campaign=test", base);
const selections = patched(
  {
    q: "reason* *max & + test",
    provider: ["openai", "anthropic"],
    "max-cost": 0.25,
    rank: "all",
    days: 90,
  },
  readDashboardUrl(campaign),
);
assert.equal(selections.section, "leaderboard");
assert.equal(dashboardUrl(selections, campaign).searchParams.get("campaign"), "test");
assert.equal(readUrlValue(selections.params, "q"), "reason* *max & + test");
assert.deepEqual(readUrlValue(selections.params, "provider"), ["openai", "anthropic"]);
assert.equal(readUrlValue(selections.params, "max-cost"), 0.25);
assert.equal(readUrlValue(selections.params, "rank"), "all");
assert.equal(readUrlValue(selections.params, "days"), 90);
assert.deepEqual(readUrlValue(patched({ provider: [] }, selections).params, "provider"), []);

const table = patched({ view: "time", sort: { key: "speed", direction: "descending" } }, cost);
assert.equal(address(table), "/leaderboard?view=time&sort=speed.desc");
assert.deepEqual(readUrlValue(table.params, "sort"), { key: "speed", direction: "descending" });
assert.deepEqual(readUrlValue(new URLSearchParams("sort=value.asc"), "sort"), {
  key: "value",
  direction: "ascending",
});

for (const query of [
  "rank=bad&days=0&max-cost=-1",
  "rank=&days=&max-cost=",
  "rank=Infinity&days=NaN&max-cost=3",
]) {
  const params = new URLSearchParams(query);
  assert.equal(readUrlValue(params, "rank"), "all");
  assert.equal(readUrlValue(params, "days"), 180);
  assert.equal(readUrlValue(params, "max-cost"), "all");
}
const malformed = new URLSearchParams(
  "view=bad&sort=__proto__.asc&performance=unknown&axes=bad&benchmark=unknown",
);
assert.equal(readUrlValue(malformed, "view"), "all");
assert.deepEqual(readUrlValue(malformed, "sort"), { key: "intelligence", direction: "descending" });
assert.equal(readUrlValue(malformed, "performance"), "intelligence");
assert.equal(readUrlValue(malformed, "axes"), "cost");
assert.equal(readUrlValue(malformed, "benchmark"), null);
assert.deepEqual(readUrlValue(new URLSearchParams("benchmark=none"), "benchmark"), []);
assert.deepEqual(
  readUrlValue(
    new URLSearchParams("benchmark=terminal_bench&benchmark=unknown&benchmark=terminal_bench"),
    "benchmark",
  ),
  ["terminal_bench"],
);
assert.deepEqual(readUrlValue(patched({ benchmark: [] }).params, "benchmark"), []);
assert.equal(readUrlValue(patched({ benchmark: null }).params, "benchmark"), null);

const pareto = at("/pareto?performance=benchmarks&axes=cost&find=claude-opus-5.5");
assert.equal(pareto.section, "pareto");
assert.equal(readUrlValue(pareto.params, "performance"), "benchmarks");
assert.deepEqual(readUrlValue(pareto.params, "pareto-find"), ["claude-opus-5.5"]);
assert.equal(address(pareto), "/pareto?performance=benchmarks&find=claude-opus-5.5");
assert.equal(
  readUrlValue(at("/?view=cost").params, "view"),
  "all",
  "A section's control counts only on its section's path",
);
assert.equal(at("/nowhere?find=x").section, null);

const timelineLink = patched({
  "timeline-period": "year",
  "timeline-provider": ["openai", "anthropic"],
});
assert.equal(address(timelineLink), "/timeline?period=year&lab=openai,anthropic");
assert.deepEqual(readUrlValue(at(address(timelineLink)).params, "timeline-provider"), [
  "openai",
  "anthropic",
]);
assert.equal(
  readUrlValue(new URLSearchParams("timeline-period=invalid"), "timeline-period"),
  "all",
);
assert.deepEqual(
  readUrlValue(patched({ "timeline-provider": [] }).params, "timeline-provider"),
  [],
);
assert.equal(
  readUrlValue(patched({ "timeline-provider": null }).params, "timeline-provider"),
  null,
);

const duels = at("/duels?find=gemini-3.7-flash");
assert.equal(duels.section, "duels");
assert.equal(sectionRegion("duels"), "leaderboard");
assert.equal(
  readUrlValue(duels.params, "leaderboard-chart"),
  "duels",
  "A chart's path shows the chart",
);
assert.deepEqual(readUrlValue(duels.params, "duels-find"), ["gemini-3.7-flash"]);
assert.equal(address(duels), "/duels?find=gemini-3.7-flash");
const spectra = patched({ "leaderboard-chart": "spectra" }, duels);
assert.equal(address(spectra), "/spectra", "Another chart's controls stay off the link");
assert.deepEqual(
  readUrlValue(spectra.params, "duels-find"),
  ["gemini-3.7-flash"],
  "A hidden chart keeps its controls, so showing it again restores them",
);
assert.equal(address(patched({ "leaderboard-chart": "leaderboard" }, spectra)), "/leaderboard");
assert.equal(
  address(patched({ model: "claude-opus-5.5", effort: "high" }, duels)),
  "/duels?find=gemini-3.7-flash&model=claude-opus-5.5&effort=high",
  "The model sheet stays open on any section",
);
assert.deepEqual(readUrlValue(at("/duels?find=x,+x+,").params, "duels-find"), ["x"]);
assert.equal(address(patched({ "duels-find": [] }, duels)), "/duels");

assert.equal(
  address(patched({ "timeline-find": ["openai/gpt-6.2-astra", "GPT-4 (Mar 2023)"] })),
  "/timeline?find=openai/gpt-6.2-astra,GPT-4+(Mar+2023)",
  "Ids and names keep their slashes and brackets in a link",
);

const lists = at("/spectra?find=gemini-4-argon,muse-wonder-full");
assert.deepEqual(readUrlValue(lists.params, "spectra-find"), [
  "gemini-4-argon",
  "muse-wonder-full",
]);
assert.equal(
  address(lists),
  "/spectra?find=gemini-4-argon,muse-wonder-full",
  "A list joins its values with commas",
);
assert.equal(
  address(patched({ provider: ["openai", "anthropic"] })),
  "/?provider=openai,anthropic",
);
assert.equal(
  address(patched({ benchmark: ["terminal_bench", "gdp_pdf"] })),
  "/pareto?benchmark=terminal_bench,gdp_pdf",
);
assert.equal(address(patched({ q: "claude, gpt" })), "/?q=claude,+gpt");
assert.equal(
  readUrlValue(at("/?q=claude,+gpt").params, "q"),
  "claude, gpt",
  "A free-text search keeps its commas",
);

assert.equal(modelLinkId("google/gemini-3.7-flash"), "gemini-3.7-flash");

const saved = savedDashboardState({ __NA: true, dashboard: dashboardHistoryEntry(spectra) });
assert.equal(saved?.section, "spectra");
assert.equal(saved?.params.toString(), spectra.params.toString());
assert.equal(savedDashboardState(null), null);
assert.equal(savedDashboardState({ dashboard: { search: "", section: "nowhere" } }), null);

const effortLink = patched({ "table-variants": true, "table-effort": ["max"] });
assert.equal(address(effortLink), "/leaderboard?variants=1&efforts=max");
assert.deepEqual(readUrlValue(effortLink.params, "table-effort"), ["max"]);
assert.equal(readUrlValue(empty.params, "table-effort"), null);
assert.deepEqual(
  readUrlValue(patched({ "table-effort": [] }, effortLink).params, "table-effort"),
  [],
  "An emptied effort basket keeps no variant rows rather than every one",
);
assert.equal(
  patched({ "table-variants": false }, effortLink).params.has("table-effort"),
  false,
  "An effort choice leaves with the variant rows it filters",
);

const withDefaults = new URL(
  "/pareto?performance=benchmarks&benchmark=all&rank=all&campaign=test",
  base,
);
assert.equal(
  address(readDashboardUrl(withDefaults), withDefaults),
  "/pareto?performance=benchmarks&campaign=test",
);
assert.equal(
  address(patched({ performance: "intelligence" }, readDashboardUrl(withDefaults)), withDefaults),
  "/pareto?campaign=test",
);
assert.equal(address(patched({ "graph-variants": false })), "/?graph-variants=0");
assert.equal(address(patched({ "table-q": "cost", q: "GPT*" })), "/leaderboard?search=cost&q=GPT*");

console.log("Dashboard URL contract checks passed.");
