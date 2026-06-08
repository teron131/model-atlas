import type { ModelStatsSelectedModel } from "../../src/model-atlas/llm/llm-stats/types";

const artificialAnalysisTaskMetricColumns = [
	{
		key: "aaCost",
		source: "artificial_analysis",
		metric: "cost",
		direction: "ascending",
		label: "AA$",
	},
	{
		key: "aaSeconds",
		source: "artificial_analysis",
		metric: "seconds",
		direction: "ascending",
		label: "AA Sec",
	},
	{
		key: "aaTokens",
		source: "artificial_analysis",
		metric: "output_tokens",
		direction: "descending",
		label: "AA Tok",
	},
] as const;

const deepSWETaskMetricColumns = [
	{
		key: "deepSWECost",
		source: "deep_swe",
		metric: "cost",
		direction: "ascending",
		label: "DSWE$",
	},
	{
		key: "deepSWESeconds",
		source: "deep_swe",
		metric: "seconds",
		direction: "ascending",
		label: "DSWE Sec",
	},
	{
		key: "deepSWETokens",
		source: "deep_swe",
		metric: "output_tokens",
		direction: "descending",
		label: "DSWE Tok",
	},
] as const;

const agentsLastExamTaskMetricColumns = [
	{
		key: "agentsLastExamSeconds",
		source: "agents_last_exam",
		metric: "seconds",
		direction: "ascending",
		label: "ALE Sec",
	},
	{
		key: "agentsLastExamInputTokens",
		source: "agents_last_exam",
		metric: "input_tokens",
		direction: "ascending",
		label: "ALE In",
	},
	{
		key: "agentsLastExamOutputTokens",
		source: "agents_last_exam",
		metric: "output_tokens",
		direction: "ascending",
		label: "ALE Out",
	},
] as const;

export const taskMetricColumns = [
	...artificialAnalysisTaskMetricColumns,
	...deepSWETaskMetricColumns,
	...agentsLastExamTaskMetricColumns,
] as const;

const deepSWEBenchmarkColumn = {
	key: "deepSWE",
	metric: "deep_swe",
	direction: "descending",
	label: "DSWE",
} as const;

const agentsLastExamBenchmarkColumn = {
	key: "agentsLastExam",
	metric: "agents_last_exam",
	direction: "descending",
	label: "ALE",
} as const;

export const benchmarkMetricColumns = [
	deepSWEBenchmarkColumn,
	agentsLastExamBenchmarkColumn,
] as const;

export type Direction = "ascending" | "descending";
export type TaskMetricColumn = (typeof taskMetricColumns)[number];
export type BenchmarkMetricColumn = (typeof benchmarkMetricColumns)[number];
export type DashboardMetricColumn = TaskMetricColumn | BenchmarkMetricColumn;
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
	| TaskMetricColumn["key"]
	| BenchmarkMetricColumn["key"];

export const dashboardMetricColumns: DashboardMetricColumn[] = [
	...artificialAnalysisTaskMetricColumns,
	deepSWEBenchmarkColumn,
	...deepSWETaskMetricColumns,
	agentsLastExamBenchmarkColumn,
	...agentsLastExamTaskMetricColumns,
];

export type SortState = {
	key: SortKey;
	direction: Direction;
};

export type TableRow = {
	model: ModelStatsSelectedModel;
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

const taskMetricSorters = Object.fromEntries(
	taskMetricColumns.map((column) => [
		column.key,
		{
			direction: column.direction,
			type: "number",
			value: (row: TableRow) => taskMetricValue(row.model, column),
		},
	]),
) as Record<TaskMetricColumn["key"], Sorter>;

const benchmarkMetricSorters = Object.fromEntries(
	benchmarkMetricColumns.map((column) => [
		column.key,
		{
			direction: column.direction,
			type: "number",
			value: (row: TableRow) => benchmarkMetricValue(row.model, column),
		},
	]),
) as Record<BenchmarkMetricColumn["key"], Sorter>;

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
	...taskMetricSorters,
	...benchmarkMetricSorters,
};

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

export function dedupeDisplayModels(models: ModelStatsSelectedModel[]) {
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
	model: ModelStatsSelectedModel,
	column: TaskMetricColumn,
) {
	return model.task_metrics?.[column.source]?.[column.metric];
}

export function benchmarkMetricValue(
	model: ModelStatsSelectedModel,
	column: BenchmarkMetricColumn,
) {
	return model.evaluations?.[column.metric];
}

export function contextWindowValue(model: ModelStatsSelectedModel) {
	const contextWindow = model.context_window as
		| ({ total?: number | null } & NonNullable<
				ModelStatsSelectedModel["context_window"]
		  >)
		| null;
	return contextWindow?.context ?? contextWindow?.total;
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

function canonicalDisplayModelId(model: ModelStatsSelectedModel) {
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

function displayAliasPriority(model: ModelStatsSelectedModel) {
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
