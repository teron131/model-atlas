import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ColumnTooltip } from "../app/dashboard/ColumnTooltip";
import { Dashboard } from "../app/dashboard/index";
import { COLUMN_TOOLTIPS } from "../src/model-atlas/constants";
import {
	minimalSelectedModel,
	minimalSelectedPayload,
} from "./model-stats-fixtures";

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
const loadingHtml = renderToStaticMarkup(
	React.createElement(Dashboard, { initialPayload: null }),
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
assert.equal(
	loadingHtml.includes("Loading stats"),
	false,
	"initial loading markup should use structured placeholders instead of a single table message",
);
assert.equal(
	matchCount(loadingHtml, 'class="loading-row"'),
	9,
	"initial loading markup should preserve table density with skeleton rows",
);
assert.equal(
	loadingHtml.includes("benchmark-chip-loading"),
	true,
	"initial loading markup should include benchmark placeholder chips",
);

const speedTooltipHtml = renderToStaticMarkup(
	React.createElement(ColumnTooltip, {
		content: COLUMN_TOOLTIPS.speed,
		left: 0,
		top: 0,
	}),
);

assert.equal(
	speedTooltipHtml.includes("column-tooltip-workflow-table"),
	true,
	"speed tooltip should render workflow simulation rows as a structured table",
);
assert.equal(
	speedTooltipHtml.includes("column-tooltip-workflow-scenario"),
	true,
	"speed tooltip should split workflow simulation labels into scenario/calls/input/output cells",
);

function matchCount(text: string, value: string): number {
	return text.split(value).length - 1;
}
