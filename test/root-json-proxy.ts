/** Verifies root proxy routing and JSON content negotiation. */

import assert from "node:assert/strict";

import {
	jsonViewForPath,
	setModelAtlasApiUrl,
	wantsJsonResponse,
} from "../proxy";

assert.equal(wantsJsonResponse("text/html,application/xhtml+xml"), false);
assert.equal(wantsJsonResponse("application/json"), true);
assert.equal(wantsJsonResponse("*/*"), true);
assert.equal(wantsJsonResponse(""), true);

assert.equal(jsonViewForPath("/"), "score");
assert.equal(jsonViewForPath("/score"), "score");
assert.equal(jsonViewForPath("/scores"), "score");
assert.equal(jsonViewForPath("/core"), "core");
assert.equal(jsonViewForPath("/benchmarks"), "benchmarks");
assert.equal(jsonViewForPath("/all"), "all");
assert.equal(jsonViewForPath("/api/llm-stats"), null);

assert.equal(apiPathForView("score"), "/api/llm-stats");
assert.equal(apiPathForView("core"), "/api/llm-stats?view=core");
assert.equal(apiPathForView("benchmarks"), "/api/llm-stats?view=benchmarks");
assert.equal(apiPathForView("all"), "/api/llm-stats?view=all");

function apiPathForView(view: "score" | "core" | "benchmarks" | "all"): string {
	const url = new URL("https://example.com/");
	setModelAtlasApiUrl(url, view);
	return `${url.pathname}${url.search}`;
}
