/** Verify shareable dashboard selections, sparse defaults, malformed links, and section precedence. */

import assert from "node:assert/strict";

import { dashboardUrlSection, patchDashboardUrl, readUrlValue } from "../app/dashboard/url-state";

const base = new URL("https://model-atlas.test/");
assert.equal(patchDashboardUrl(base, {}).href, base.href);
assert.equal(readUrlValue(base.searchParams, "view"), "all");
assert.equal(readUrlValue(base.searchParams, "rank"), 50);
assert.equal(readUrlValue(base.searchParams, "days"), 180);
assert.equal(dashboardUrlSection(base), null);
assert.equal(readUrlValue(base.searchParams, "performance"), "intelligence");
assert.equal(readUrlValue(base.searchParams, "axes"), "cost");
for (const axis of ["cost", "time", "tokens", "speed", "value"] as const) {
  assert.equal(readUrlValue(patchDashboardUrl(base, { axes: axis }).searchParams, "axes"), axis);
}
assert.equal(readUrlValue(new URLSearchParams("axes=speedValue"), "axes"), "cost");

const cost = patchDashboardUrl(base, { view: "cost" });
assert.equal(cost.search, "?view=cost");
assert.equal(cost.hash, "#leaderboard");
assert.equal(patchDashboardUrl(base, { view: "all" }).search, "?view=all");
assert.equal(patchDashboardUrl(base, { "table-variants": false }).search, "?table-variants=0");
assert.equal(patchDashboardUrl(base, { rank: 50 }).search, "?rank=50");

const selections = patchDashboardUrl(new URL("?campaign=test#leaderboard", base), {
  q: "reason* *max & + test",
  provider: ["openai", "anthropic"],
  "max-cost": 2,
  rank: "all",
  days: 90,
});
assert.equal(selections.hash, "#leaderboard");
assert.equal(selections.searchParams.get("campaign"), "test");
assert.equal(readUrlValue(selections.searchParams, "q"), "reason* *max & + test");
assert.deepEqual(readUrlValue(selections.searchParams, "provider"), ["openai", "anthropic"]);
assert.equal(readUrlValue(selections.searchParams, "max-cost"), 2);
assert.equal(readUrlValue(selections.searchParams, "rank"), "all");
assert.equal(readUrlValue(selections.searchParams, "days"), 90);
assert.deepEqual(
  readUrlValue(patchDashboardUrl(selections, { provider: [] }).searchParams, "provider"),
  [],
);

const table = patchDashboardUrl(cost, {
  view: "time",
  columns: "",
  sort: { key: "speed", direction: "descending" },
});
assert.equal(readUrlValue(table.searchParams, "view"), "time");
assert.deepEqual(readUrlValue(table.searchParams, "sort"), {
  key: "speed",
  direction: "descending",
});
assert.equal(table.searchParams.get("sort"), "speed.desc");
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
  assert.equal(readUrlValue(params, "rank"), 50);
  assert.equal(readUrlValue(params, "days"), 180);
  assert.equal(readUrlValue(params, "max-cost"), "all");
}
const malformed = new URLSearchParams(
  "view=bad&sort=__proto__.asc&performance=unknown&axes=bad&column-order=bad&benchmark=unknown",
);
assert.equal(readUrlValue(malformed, "view"), "all");
assert.deepEqual(readUrlValue(malformed, "sort"), { key: "intelligence", direction: "descending" });
assert.equal(readUrlValue(malformed, "performance"), "intelligence");
assert.equal(readUrlValue(malformed, "axes"), "cost");
assert.equal(readUrlValue(malformed, "column-order"), "portfolio");
assert.equal(readUrlValue(malformed, "benchmark"), null);
assert.deepEqual(readUrlValue(new URLSearchParams("benchmark=none"), "benchmark"), []);
assert.deepEqual(
  readUrlValue(
    new URLSearchParams("benchmark=terminal_bench_4&benchmark=unknown&benchmark=terminal_bench_4"),
    "benchmark",
  ),
  ["terminal_bench_4"],
);
assert.deepEqual(
  readUrlValue(patchDashboardUrl(base, { benchmark: [] }).searchParams, "benchmark"),
  [],
);
assert.equal(
  readUrlValue(patchDashboardUrl(base, { benchmark: null }).searchParams, "benchmark"),
  null,
);
assert.equal(dashboardUrlSection(new URL("?view=cost", base)), "leaderboard");
assert.equal(
  dashboardUrlSection(new URL("?performance=benchmarks&axes=cost", base)),
  "pareto-analysis",
);
assert.equal(
  dashboardUrlSection(new URL("?view=cost&performance=benchmarks#leaderboard", base)),
  "leaderboard",
);
assert.equal(patchDashboardUrl(base, { benchmark: null }).searchParams.get("benchmark"), "all");
console.log("Dashboard URL contract checks passed.");
