/** Dashboard row shaping and sort semantics for LLM stats payloads. */

import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";

const artificialAnalysisTaskMetricColumns = [
	{
		key: "aaCost",
		group: "tasks",
		source: "artificial_analysis",
		metric: "cost",
		direction: "ascending",
		type: "number",
		label: "AA$",
	},
	{
		key: "aaSeconds",
		group: "tasks",
		source: "artificial_analysis",
		metric: "seconds",
		direction: "ascending",
		type: "number",
		label: "AA Sec",
	},
	{
		key: "aaTokens",
		group: "tasks",
		source: "artificial_analysis",
		metric: "output_tokens",
		direction: "descending",
		type: "number",
		label: "AA Tok",
	},
] as const;

const deepSWETaskMetricColumns = [
	{
		key: "deepSWECost",
		group: "tasks",
		source: "deep_swe",
		metric: "cost",
		direction: "ascending",
		type: "number",
		label: "DSWE$",
	},
	{
		key: "deepSWESeconds",
		group: "tasks",
		source: "deep_swe",
		metric: "seconds",
		direction: "ascending",
		type: "number",
		label: "DSWE Sec",
	},
	{
		key: "deepSWETokens",
		group: "tasks",
		source: "deep_swe",
		metric: "output_tokens",
		direction: "descending",
		type: "number",
		label: "DSWE Tok",
	},
] as const;

const agentsLastExamTaskMetricColumns = [
	{
		key: "agentsLastExamSeconds",
		group: "tasks",
		source: "agents_last_exam",
		metric: "seconds",
		direction: "ascending",
		type: "number",
		label: "ALE Sec",
	},
	{
		key: "agentsLastExamInputTokens",
		group: "tasks",
		source: "agents_last_exam",
		metric: "input_tokens",
		direction: "ascending",
		type: "number",
		label: "ALE In",
	},
	{
		key: "agentsLastExamOutputTokens",
		group: "tasks",
		source: "agents_last_exam",
		metric: "output_tokens",
		direction: "ascending",
		type: "number",
		label: "ALE Out",
	},
] as const;

export const taskMetricColumns = [
	...artificialAnalysisTaskMetricColumns,
	...deepSWETaskMetricColumns,
	...agentsLastExamTaskMetricColumns,
] as const;

const profileMetricColumns = [
	{
		key: "release",
		group: "profile",
		field: "release",
		direction: "descending",
		type: "text",
		label: "Release",
	},
	{
		key: "openWeights",
		group: "profile",
		field: "open_weights",
		direction: "descending",
		type: "number",
		label: "Open",
	},
	{
		key: "modalities",
		group: "profile",
		field: "modalities",
		direction: "ascending",
		type: "text",
		label: "Inputs",
	},
] as const;

const costMetricColumns = [
	{
		key: "inputCost",
		group: "costs",
		field: "input",
		direction: "ascending",
		type: "number",
		label: "In$",
	},
	{
		key: "outputCost",
		group: "costs",
		field: "output",
		direction: "ascending",
		type: "number",
		label: "Out$",
	},
	{
		key: "cacheReadCost",
		group: "costs",
		field: "cache_read",
		direction: "ascending",
		type: "number",
		label: "Cache$",
	},
] as const;

const speedMetricColumns = [
	{
		key: "throughput",
		group: "speed",
		field: "throughput_tokens_per_second_median",
		direction: "descending",
		type: "number",
		label: "TPS",
	},
	{
		key: "latency",
		group: "speed",
		field: "latency_seconds_median",
		direction: "ascending",
		type: "number",
		label: "Latency",
	},
	{
		key: "e2eLatency",
		group: "speed",
		field: "e2e_latency_seconds_median",
		direction: "ascending",
		type: "number",
		label: "E2E",
	},
] as const;

export const benchmarkMetricColumns = [
	{
		key: "gpqa",
		group: "benchmarks",
		benchmark: "gpqa",
		direction: "descending",
		type: "number",
		label: "GPQA",
	},
	{
		key: "hle",
		group: "benchmarks",
		benchmark: "hle",
		direction: "descending",
		type: "number",
		label: "HLE",
	},
	{
		key: "terminalBench",
		group: "benchmarks",
		benchmark: "terminalbench_hard",
		direction: "descending",
		type: "number",
		label: "TBench",
	},
	{
		key: "automationBench",
		group: "benchmarks",
		benchmark: "automation_bench",
		direction: "descending",
		type: "number",
		label: "Auto",
	},
	{
		key: "blueprintBench",
		group: "benchmarks",
		benchmark: "blueprint_bench_2",
		direction: "descending",
		type: "number",
		label: "BB2",
	},
	{
		key: "gdpPdf",
		group: "benchmarks",
		benchmark: "gdp_pdf",
		direction: "descending",
		type: "number",
		label: "GDP.pdf",
	},
	{
		key: "riemannBench",
		group: "benchmarks",
		benchmark: "riemann_bench",
		direction: "descending",
		type: "number",
		label: "Riemann",
	},
	{
		key: "cursorBench",
		group: "benchmarks",
		benchmark: "cursorbench",
		direction: "descending",
		type: "number",
		label: "Cursor",
	},
	{
		key: "deepSWE",
		group: "benchmarks",
		benchmark: "deep_swe",
		direction: "descending",
		type: "number",
		label: "DSWE",
	},
	{
		key: "agentsLastExam",
		group: "benchmarks",
		benchmark: "agents_last_exam",
		direction: "descending",
		type: "number",
		label: "ALE",
	},
] as const;

export type Direction = "ascending" | "descending";
export type TaskMetricColumn = (typeof taskMetricColumns)[number];
export type ProfileMetricColumn = (typeof profileMetricColumns)[number];
export type CostMetricColumn = (typeof costMetricColumns)[number];
export type SpeedMetricColumn = (typeof speedMetricColumns)[number];
export type BenchmarkMetricColumn = (typeof benchmarkMetricColumns)[number];
export type DashboardMetricColumn =
	| ProfileMetricColumn
	| CostMetricColumn
	| SpeedMetricColumn
	| BenchmarkMetricColumn
	| TaskMetricColumn;
export type SortKey =
	| "rank"
	| "model"
	| "overall"
	| "intelligence"
	| "agentic"
	| "speed"
	| "value"
	| "blend"
	| "context"
	| ProfileMetricColumn["key"]
	| CostMetricColumn["key"]
	| SpeedMetricColumn["key"]
	| TaskMetricColumn["key"]
	| BenchmarkMetricColumn["key"];

export const dashboardMetricColumns: DashboardMetricColumn[] = [
	...profileMetricColumns,
	...costMetricColumns,
	...speedMetricColumns,
	...benchmarkMetricColumns,
	...taskMetricColumns,
];

export type SortState = {
	key: SortKey;
	direction: Direction;
};

export type TableRow = {
	model: LlmStatsModel;
	intelligenceRank: number;
	originalIndex: number;
	priority: number;
};

type UnrankedTableRow = Omit<TableRow, "intelligenceRank">;

type Sorter = {
	direction: Direction;
	type: "number" | "text";
	value: (row: TableRow) => number | string | null | undefined;
};

const dashboardMetricSorters = Object.fromEntries(
	dashboardMetricColumns.map((column) => [
		column.key,
		{
			direction: column.direction,
			type: column.type,
			value: (row: TableRow) => dashboardMetricValue(row.model, column),
		},
	]),
) as Record<DashboardMetricColumn["key"], Sorter>;

export const sorters: Record<SortKey, Sorter> = {
	rank: {
		direction: "ascending",
		type: "number",
		value: (row) => row.intelligenceRank,
	},
	model: {
		direction: "ascending",
		type: "text",
		value: (row) => row.model.name ?? row.model.id ?? "",
	},
	overall: {
		direction: "descending",
		type: "number",
		value: (row) => row.model.relative_scores?.overall_score,
	},
	intelligence: {
		direction: "descending",
		type: "number",
		value: intelligenceScore,
	},
	agentic: {
		direction: "descending",
		type: "number",
		value: (row) => row.model.relative_scores?.agentic_score,
	},
	speed: {
		direction: "descending",
		type: "number",
		value: (row) => row.model.relative_scores?.speed_score,
	},
	value: {
		direction: "descending",
		type: "number",
		value: (row) => row.model.relative_scores?.value_score,
	},
	blend: {
		direction: "ascending",
		type: "number",
		value: (row) => row.model.cost?.blended_price,
	},
	context: {
		direction: "descending",
		type: "number",
		value: (row) => contextWindowValue(row.model),
	},
	...dashboardMetricSorters,
};

/** Filter and sort rows with source order as the final stable tie-breaker. */
export function sortedRows(
	rows: TableRow[],
	filterQuery: string,
	sortState: SortState,
) {
	const sorter = sorters[sortState.key] ?? sorters.rank;
	const direction = sortState.direction === "descending" ? -1 : 1;
	return filteredRows(rows, filterQuery).sort((left, right) => {
		const leftValue = sorter.value(left);
		const rightValue = sorter.value(right);
		const missingCompared = compareMissingValues(sorter, leftValue, rightValue);
		if (missingCompared !== 0) {
			return missingCompared;
		}
		const compared = compareSortValues(sorter, leftValue, rightValue);
		if (compared !== 0) {
			return compared * direction;
		}
		return left.originalIndex - right.originalIndex;
	});
}

/** Collapse duplicate model routes before assigning display ranks. */
export function dedupeDisplayModels(models: LlmStatsModel[]) {
	const byDisplayId = new Map<string, UnrankedTableRow>();
	for (const [originalIndex, model] of models.entries()) {
		const key = canonicalDisplayModelId(model);
		const candidate = {
			model,
			originalIndex,
			priority: displayAliasPriority(model),
		};
		const existing = byDisplayId.get(key);
		if (!existing || candidate.priority < existing.priority) {
			byDisplayId.set(key, candidate);
		}
	}
	return attachIntelligenceRanks([...byDisplayId.values()]).sort(
		(left, right) => left.originalIndex - right.originalIndex,
	);
}

export function taskMetricValue(
	model: LlmStatsModel,
	column: TaskMetricColumn,
) {
	return model.task_metrics?.[column.source]?.[column.metric];
}

export function benchmarkMetricValue(
	model: LlmStatsModel,
	column: BenchmarkMetricColumn,
) {
	return model.evaluations?.[column.benchmark];
}

export function contextWindowValue(model: LlmStatsModel) {
	const contextWindow = model.context_window as
		| ({ total?: number | null } & NonNullable<LlmStatsModel["context_window"]>)
		| null;
	return contextWindow?.context ?? contextWindow?.total;
}

export function dashboardMetricValue(
	model: LlmStatsModel,
	column: DashboardMetricColumn,
) {
	if ("source" in column) {
		return taskMetricValue(model, column);
	}
	if ("benchmark" in column) {
		return benchmarkMetricValue(model, column);
	}
	if (column.group === "costs") {
		return model.cost?.[column.field];
	}
	if (column.group === "speed") {
		return model.speed?.[column.field];
	}
	return profileMetricValue(model, column);
}

function profileMetricValue(model: LlmStatsModel, column: ProfileMetricColumn) {
	if (column.field === "release") {
		return model.release_date;
	}
	if (column.field === "modalities") {
		return inputModalityLabel(model);
	}
	return booleanSortValue(model[column.field]);
}

function booleanSortValue(value: boolean | null | undefined) {
	if (value == null) {
		return null;
	}
	return value ? 1 : 0;
}

function inputModalityLabel(model: LlmStatsModel) {
	const input = modalityTokens(model.modalities?.input);
	if (input.length === 0) {
		return null;
	}
	return input.join("+");
}

function modalityTokens(values: string[] | undefined) {
	return (values ?? [])
		.map((value) => value.slice(0, 1).toUpperCase())
		.filter((value) => value.length > 0);
}

function filteredRows(rows: TableRow[], filterQuery: string) {
	const query = filterQuery.trim().toLowerCase();
	if (!query) {
		return [...rows];
	}
	return rows.filter(({ model }) => {
		const searchable = [model.name, model.id, model.provider]
			.join(" ")
			.toLowerCase();
		return searchable.includes(query);
	});
}

function attachIntelligenceRanks(rows: UnrankedTableRow[]): TableRow[] {
	const rankedRows = [...rows].sort(compareIntelligenceRank);
	const rankByOriginalIndex = new Map<number, number>();
	for (const [rankIndex, row] of rankedRows.entries()) {
		rankByOriginalIndex.set(row.originalIndex, rankIndex + 1);
	}
	return rows.map((row) => ({
		...row,
		intelligenceRank: rankByOriginalIndex.get(row.originalIndex) ?? rows.length,
	}));
}

function compareIntelligenceRank(
	left: UnrankedTableRow,
	right: UnrankedTableRow,
) {
	const leftScore = intelligenceScore(left);
	const rightScore = intelligenceScore(right);
	const missingCompared = compareMissingNumbers(leftScore, rightScore);
	if (missingCompared !== 0) {
		return missingCompared;
	}
	if (
		typeof leftScore === "number" &&
		typeof rightScore === "number" &&
		leftScore !== rightScore
	) {
		return rightScore - leftScore;
	}
	return left.originalIndex - right.originalIndex;
}

function intelligenceScore(row: Pick<TableRow, "model">) {
	return row.model.relative_scores?.intelligence_score;
}

function compareMissingValues(sorter: Sorter, left: unknown, right: unknown) {
	if (sorter.type !== "number") {
		return 0;
	}
	return compareMissingNumbers(left, right);
}

function compareMissingNumbers(left: unknown, right: unknown) {
	const leftMissing = typeof left !== "number" || !Number.isFinite(left);
	const rightMissing = typeof right !== "number" || !Number.isFinite(right);
	if (leftMissing && rightMissing) {
		return 0;
	}
	if (leftMissing) {
		return 1;
	}
	if (rightMissing) {
		return -1;
	}
	return 0;
}

function compareSortValues(sorter: Sorter, left: unknown, right: unknown) {
	if (sorter.type === "text") {
		return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
			sensitivity: "base",
		});
	}
	return Number(left) - Number(right);
}

function canonicalDisplayModelId(model: LlmStatsModel) {
	const id = typeof model.id === "string" ? model.id : "";
	const slashIndex = id.indexOf("/");
	if (slashIndex <= 0) {
		return id.toLowerCase().replace(/\./g, "-").replace(/-+/g, "-");
	}
	const slug = id
		.slice(slashIndex + 1)
		.toLowerCase()
		.replace(/\./g, "-")
		.replace(/-+/g, "-")
		.replace(/-\d{8}$/, "")
		.replace(/-fast$/, "");
	const provider = canonicalProviderId(id.slice(0, slashIndex), slug);
	return `${provider}/${slug}`;
}

function canonicalProviderId(provider: string, slug: string) {
	const normalizedProvider = provider.toLowerCase().replace(/^~+/, "");
	const providerWithoutAiSuffix = normalizedProvider.replace(/ai$/, "");
	const familyToken = slug.split("-", 1)[0] ?? "";
	return providerWithoutAiSuffix.length > 0 &&
		familyToken === providerWithoutAiSuffix
		? providerWithoutAiSuffix
		: normalizedProvider;
}

function displayAliasPriority(model: LlmStatsModel) {
	const id = typeof model.id === "string" ? model.id.toLowerCase() : "";
	if (id.includes("latest")) {
		return 3;
	}
	if (id.replace(/\./g, "-").endsWith("-fast")) {
		return 2;
	}
	if (/-\d{8}$/.test(id)) {
		return 1;
	}
	return 0;
}
