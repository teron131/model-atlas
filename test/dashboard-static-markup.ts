import assert from "node:assert/strict";
import { registerHooks } from "node:module";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ColumnTooltip } from "../app/dashboard/shared/ColumnTooltip";
import type { TableRow } from "../app/dashboard/table/models";
import { COLUMN_TOOLTIPS } from "../src/model-atlas/constants";
import {
	minimalLlmStatsModel,
	minimalLlmStatsPayload,
} from "./llm-stats-fixtures";

registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith(".css")) {
			return {
				format: "module",
				shortCircuit: true,
				source:
					"export default new Proxy({}, { get: (_, key) => String(key) });",
			};
		}
		return nextLoad(url, context);
	},
});

const { Dashboard } = await import("../app/dashboard/index");
const { ModelTable } = await import("../app/dashboard/table/ModelTable");

const payload = minimalLlmStatsPayload({
	fetchedAt: 900,
	models: [
		minimalLlmStatsModel({
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
	12,
	"initial loading markup should preserve table density with skeleton rows",
);
assert.equal(
	loadingHtml.includes("benchmark-chip-loading"),
	true,
	"initial loading markup should include benchmark placeholder chips",
);

const visibleRankRows: TableRow[] = [
	tableRow("provider/seven", "Seven", 7, 0),
	tableRow("provider/eight", "Eight", 8, 1),
	tableRow("provider/ten", "Ten", 10, 2),
];
const rankHtml = renderToStaticMarkup(
	React.createElement(ModelTable, {
		sortState: { key: "rank", direction: "ascending" },
		visibleRows: visibleRankRows,
		emptyMessage: "No models",
		isLoading: false,
		metricColumns: [],
		providerColors: {},
		onSort: () => {},
		onTooltip: () => {},
		onTooltipEnd: () => {},
	}),
);

assert.deepEqual(
	rankCells(rankHtml),
	["01", "02", "03"],
	"rendered rank cells should follow visible table order without gaps",
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

function tableRow(
	id: string,
	name: string,
	intelligenceRank: number,
	originalIndex: number,
): TableRow {
	return {
		model: minimalLlmStatsModel({ id, name }),
		intelligenceRank,
		originalIndex,
		priority: 0,
	};
}

function rankCells(html: string) {
	return [...html.matchAll(/class="rank">(\d+)<\/td>/g)].map(
		(match) => match[1],
	);
}
