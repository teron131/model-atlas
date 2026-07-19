/** Verify server-rendered dashboard markup for key loading and interaction states. */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compactDashboardPayload } from "../app/dashboard/payload";
import { ColumnTooltip } from "../app/dashboard/shared/ColumnTooltip";
import {
	benchmarkLabels,
	benchmarkTooltips,
} from "../app/dashboard/shared/constants";
import { formatBenchmarkMetric } from "../app/dashboard/shared/format";
import {
	benchmarkMetricColumns,
	type TableRow,
} from "../app/dashboard/table/models";
import {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	BENCHMARK_PORTFOLIO,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
} from "../src/model-atlas/config/benchmark-portfolio";
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
const { BenchmarkStrip } = await import(
	"../app/dashboard/benchmarks/BenchmarkStrip"
);
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
const compactInteractionPayload = compactDashboardPayload(
	minimalLlmStatsPayload({
		fetchedAt: 901,
		models: [
			{
				...minimalLlmStatsModel({
					id: "openai/gpt-5.5",
					name: "GPT-5.5",
				}),
				task_metrics: {
					artificial_analysis: {
						cost: 0.42,
					},
				},
				evaluations: {
					deep_swe: 0.6,
				},
				scores: {
					intelligence_score: 90,
					agentic_score: 80,
					speed_score: 70,
					value_score: 65,
				},
			},
		],
	}),
);

const html = renderToStaticMarkup(
	React.createElement(Dashboard, { initialPayload: payload }),
);
const loadingHtml = renderToStaticMarkup(
	React.createElement(Dashboard, { initialPayload: null }),
);
const compactInteractionHtml = renderToStaticMarkup(
	React.createElement(Dashboard, { initialPayload: compactInteractionPayload }),
);

const coverageModels = [
	{
		...minimalLlmStatsModel({
			id: "openai/gpt-5.5",
			name: "GPT-5.5",
		}),
		evaluations: { deep_swe: 0.6 },
	},
	minimalLlmStatsModel({
		id: "anthropic/claude-opus-4.6",
		name: "Claude Opus 4.6",
	}),
];
const coveragePayload = minimalLlmStatsPayload({
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
const benchmarkOrderPayload = minimalLlmStatsPayload({
	fetchedAt: 903,
	models: coverageModels,
});
benchmarkOrderPayload.metadata.scoring.intelligence_benchmark_display_keys = [
	"weirdml",
	"riemann_bench",
	"lcr",
	"agents_last_exam",
];
benchmarkOrderPayload.metadata.scoring.benchmark_portfolio = {
	agents_last_exam: BENCHMARK_PORTFOLIO.agents_last_exam,
	lcr: BENCHMARK_PORTFOLIO.lcr,
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
	html.includes("Reasoning variant display") &&
		html.includes("Collapsed") &&
		html.includes("Expanded"),
	true,
	"the always-visible variant switch should expose both display modes",
);
assert.equal(
	html.includes("data-capture-theme"),
	true,
	"graph exports should have a stable theme boundary independent of CSS-module class names",
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
	[...displayedBenchmarkKeys].filter(
		(key) => !benchmarkMetricColumns.some((column) => column.benchmark === key),
	),
	[],
	"every displayed benchmark should have a leaderboard table column",
);
assert.deepEqual(
	benchmarkMetricColumns.map((column) =>
		BENCHMARK_PORTFOLIO[column.benchmark].group === "frontier" ? 0 : 1,
	),
	benchmarkMetricColumns
		.map((column) =>
			BENCHMARK_PORTFOLIO[column.benchmark].group === "frontier" ? 0 : 1,
		)
		.sort(),
	"table benchmark columns should place frontier benchmarks before baseline benchmarks",
);
for (const group of ["frontier", "baseline"] as const) {
	const labels = benchmarkMetricColumns
		.filter((column) => BENCHMARK_PORTFOLIO[column.benchmark].group === group)
		.map((column) => benchmarkLabels[column.benchmark] ?? column.benchmark);
	assert.deepEqual(
		labels,
		[...labels].sort((left, right) => left.localeCompare(right, "en")),
		`${group} table benchmark columns should be alphabetical`,
	);
}
assert.equal(
	benchmarkOrderHtml.indexOf("Agents&#x27; Last Exam") <
		benchmarkOrderHtml.indexOf("Riemann-bench") &&
		benchmarkOrderHtml.indexOf("Riemann-bench") <
			benchmarkOrderHtml.indexOf("LCR") &&
		benchmarkOrderHtml.indexOf("LCR") < benchmarkOrderHtml.indexOf("WeirdML"),
	true,
	"benchmark chips should be alphabetical within frontier and baseline groups",
);
assert.equal(
	benchmarkOrderHtml.includes('class="benchmark-baseline-divider"'),
	true,
	"benchmark chips should mark the frontier-to-baseline boundary",
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
assert.equal(
	compactInteractionHtml.includes("AA cost"),
	true,
	"compact dashboard payload should expose the AA task-cost interaction field immediately",
);
assert.equal(
	compactInteractionHtml.includes("Frontier"),
	true,
	"compact dashboard payload should expose the frontier benchmark interaction field immediately",
);
assert.equal(
	compactInteractionHtml.includes("CORR"),
	true,
	"compact dashboard payload should render field correlation labels immediately",
);
assert.equal(
	compactInteractionHtml.includes("Loading full metric payload"),
	false,
	"compact dashboard payload should not show a loading card for interaction metrics it already carries",
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
		aliasPriority: 0,
	};
}

function rankCells(html: string) {
	return [...html.matchAll(/class="rank">(\d+)<\/td>/g)].map(
		(match) => match[1],
	);
}
