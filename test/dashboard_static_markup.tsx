import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Dashboard } from "../app/dashboard/index";
import {
	minimalSelectedModel,
	minimalSelectedPayload,
} from "./model_stats_fixtures";

const payload = minimalSelectedPayload({
	fetchedAt: 900,
	models: [
		minimalSelectedModel({
			id: "openai/gpt-5.5",
			name: "GPT-5.5",
		}),
	],
});

const html = renderToStaticMarkup(
	React.createElement(Dashboard, { initialPayload: payload }),
);

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
	matchCount(html, 'data-column-key="model"'),
	2,
	"server-readable dashboard markup should include the sticky and source table headers",
);

function matchCount(text: string, value: string): number {
	return text.split(value).length - 1;
}
