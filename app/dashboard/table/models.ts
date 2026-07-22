/** Dashboard row shaping and sort semantics for LLM stats payloads. */

import {
	BENCHMARK_COLUMNS,
	BENCHMARK_DISPLAY_ORDER,
	BENCHMARK_TASK_METRIC_COLUMNS,
	type BenchmarkKey,
} from "../../../src/model-atlas/benchmarks/catalog";
import {
	clampScore,
	minMaxScale,
} from "../../../src/model-atlas/pipeline/scores/normalization";
import { benchmarkMetricValue as modelBenchmarkMetricValue } from "../../../src/model-atlas/pipeline/scores/resource-metrics";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import { compareBenchmarkDisplayKeys } from "../shared/constants";
import { modelDisplayName, modelMatchesQuery } from "../shared/model-display";

export type SortDirection = "ascending" | "descending";

type TaskMetricColumnInput = {
	key: string;
	metric: string;
	direction: SortDirection;
	label: string;
};

type TaskMetricColumns<
	TSource extends string,
	TColumns extends readonly TaskMetricColumnInput[],
> = {
	readonly [Index in keyof TColumns]: TColumns[Index] & {
		readonly group: "tasks";
		readonly source: TSource;
		readonly type: "number";
	};
};

function defineTaskMetricColumns<
	const TSource extends string,
	const TColumns extends readonly TaskMetricColumnInput[],
>(source: TSource, columns: TColumns): TaskMetricColumns<TSource, TColumns> {
	return columns.map((column) => ({
		...column,
		group: "tasks" as const,
		source,
		type: "number" as const,
	})) as TaskMetricColumns<TSource, TColumns>;
}

const artificialAnalysisTaskMetricColumns = defineTaskMetricColumns(
	"artificial_analysis",
	[
		{
			key: "artificialAnalysisCost",
			metric: "cost",
			direction: "ascending",
			label: "AA$",
		},
		{
			key: "artificialAnalysisSeconds",
			metric: "seconds",
			direction: "ascending",
			label: "AA Time",
		},
		{
			key: "artificialAnalysisTokens",
			metric: "output_tokens",
			direction: "descending",
			label: "AA Out",
		},
	] as const,
);

type CatalogTaskMetricColumn =
	(typeof BENCHMARK_TASK_METRIC_COLUMNS)[keyof typeof BENCHMARK_TASK_METRIC_COLUMNS][number] & {
		group: "tasks";
		source: BenchmarkKey;
		type: "number";
	};

const benchmarkTaskMetricColumns =
	BENCHMARK_DISPLAY_ORDER.flatMap<CatalogTaskMetricColumn>((benchmark) => [
		...defineTaskMetricColumns(
			benchmark,
			BENCHMARK_TASK_METRIC_COLUMNS[
				benchmark as keyof typeof BENCHMARK_TASK_METRIC_COLUMNS
			] ?? [],
		),
	]);

export const taskMetricColumns = [
	...artificialAnalysisTaskMetricColumns,
	...benchmarkTaskMetricColumns,
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
		direction: "descending",
		type: "number",
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

const inputModalityScores = [
	["text", 8],
	["image", 4],
	["audio", 2],
	["video", 1],
] as const;

const unsortedBenchmarkMetricColumns = BENCHMARK_DISPLAY_ORDER.map(
	(benchmark) => {
		const column = BENCHMARK_COLUMNS[benchmark];
		return {
			key: column.key,
			group: "benchmarks" as const,
			benchmark,
			direction: column.defaultSort,
			type: "number" as const,
			label: column.label,
			format: column.format,
		};
	},
);

export const benchmarkMetricColumns = [...unsortedBenchmarkMetricColumns].sort(
	(left, right) => compareBenchmarkDisplayKeys(left.benchmark, right.benchmark),
);
const scoreBenchmarkMetricColumns = benchmarkMetricColumns.filter(
	(column) => column.format === "score",
);

export type TaskMetricColumn = (typeof taskMetricColumns)[number];
type ProfileMetricColumn = (typeof profileMetricColumns)[number];
type CostMetricColumn = (typeof costMetricColumns)[number];
type SpeedMetricColumn = (typeof speedMetricColumns)[number];
type BenchmarkMetricColumn = (typeof benchmarkMetricColumns)[number];
export type DashboardMetricColumn =
	| ProfileMetricColumn
	| CostMetricColumn
	| SpeedMetricColumn
	| BenchmarkMetricColumn
	| TaskMetricColumn;
export type SortKey =
	| "rank"
	| "model"
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

export type SortState = {
	key: SortKey;
	direction: SortDirection;
};

const taskMetricColumnsByBenchmark = new Map<string, TaskMetricColumn[]>();
for (const column of benchmarkTaskMetricColumns) {
	const columns = taskMetricColumnsByBenchmark.get(column.source) ?? [];
	columns.push(column);
	taskMetricColumnsByBenchmark.set(column.source, columns);
}

export const dashboardMetricColumns: DashboardMetricColumn[] = [
	...profileMetricColumns,
	...costMetricColumns,
	...speedMetricColumns,
	...artificialAnalysisTaskMetricColumns,
	...benchmarkMetricColumns.flatMap((column) => [
		column,
		...(taskMetricColumnsByBenchmark.get(column.benchmark) ?? []),
	]),
];

export type TableRow = {
	model: LlmStatsModel;
	intelligenceRank: number;
	originalIndex: number;
	aliasPriority: number;
	benchmarkDisplayScores: Partial<
		Record<BenchmarkMetricColumn["key"], number | null>
	>;
};

type UnrankedTableRow = Omit<TableRow, "intelligenceRank">;

type Sorter = {
	direction: SortDirection;
	type: "number" | "text";
	get: (row: TableRow) => number | string | null | undefined;
};

const dashboardMetricSorters = Object.fromEntries(
	dashboardMetricColumns.map((column) => [
		column.key,
		{
			direction: column.direction,
			type: column.type,
			get: (row: TableRow) => dashboardMetricValue(row.model, column),
		},
	]),
) as Record<DashboardMetricColumn["key"], Sorter>;

export const sorters: Record<SortKey, Sorter> = {
	rank: {
		direction: "ascending",
		type: "number",
		get: (row) => row.intelligenceRank,
	},
	model: {
		direction: "ascending",
		type: "text",
		get: (row) => modelDisplayName(row.model),
	},
	intelligence: {
		direction: "descending",
		type: "number",
		get: intelligenceScore,
	},
	agentic: {
		direction: "descending",
		type: "number",
		get: (row) => row.model.scores?.agentic_score,
	},
	speed: {
		direction: "descending",
		type: "number",
		get: (row) => row.model.scores?.speed_score,
	},
	value: {
		direction: "descending",
		type: "number",
		get: (row) => row.model.scores?.value_score,
	},
	blend: {
		direction: "ascending",
		type: "number",
		get: (row) => row.model.cost?.blended_price,
	},
	context: {
		direction: "descending",
		type: "number",
		get: (row) => contextWindowValue(row.model),
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
	return rows
		.filter(({ model }) => modelMatchesQuery(model, filterQuery))
		.sort((left, right) => {
			const leftValue = sorter.get(left);
			const rightValue = sorter.get(right);
			const missingCompared = compareMissingValues(
				sorter,
				leftValue,
				rightValue,
			);
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
	const benchmarkDisplayScoreValues = Object.fromEntries(
		scoreBenchmarkMetricColumns.map((column) => [
			column.key,
			models.map((model) => benchmarkMetricValue(model, column)),
		]),
	) as Partial<Record<BenchmarkMetricColumn["key"], Array<number | null>>>;
	const rowsByIdentity = new Map<string, UnrankedTableRow>();
	for (const [originalIndex, model] of models.entries()) {
		const key = displayKey(model);
		const candidate = {
			model,
			originalIndex,
			aliasPriority: displayAliasPriority(model),
			benchmarkDisplayScores: Object.fromEntries(
				scoreBenchmarkMetricColumns.map((column) => {
					const value = benchmarkMetricValue(model, column);
					const normalized = minMaxScale(
						benchmarkDisplayScoreValues[column.key] ?? [],
						value,
					);
					return [
						column.key,
						normalized == null ? null : clampScore(normalized),
					];
				}),
			),
		};
		const existing = rowsByIdentity.get(key);
		if (!existing || candidate.aliasPriority < existing.aliasPriority) {
			rowsByIdentity.set(key, candidate);
		}
	}
	return attachIntelligenceRanks([...rowsByIdentity.values()]).sort(
		(left, right) => left.originalIndex - right.originalIndex,
	);
}

export function benchmarkMetricValue(
	model: LlmStatsModel,
	column: BenchmarkMetricColumn,
) {
	return modelBenchmarkMetricValue(model, column.benchmark);
}

/** Return a benchmark's normalized display score when its source scale is not directly comparable. */
export function benchmarkDisplayValue(
	row: TableRow,
	column: BenchmarkMetricColumn,
) {
	return column.format === "score"
		? row.benchmarkDisplayScores[column.key]
		: benchmarkMetricValue(row.model, column);
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
		return model.task_metrics?.[column.source]?.[column.metric];
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
		return inputModalityRank(model);
	}
	const value = model[column.field];
	if (value == null) {
		return null;
	}
	return value ? 1 : 0;
}

function inputModalityRank(model: LlmStatsModel) {
	const input = new Set(
		(model.modalities?.input ?? []).map((value) => value.toLowerCase()),
	);
	if (input.size === 0) {
		return null;
	}
	return inputModalityScores.reduce(
		(total, [modality, score]) => total + (input.has(modality) ? score : 0),
		0,
	);
}

function attachIntelligenceRanks(rows: UnrankedTableRow[]): TableRow[] {
	const rankedRows = [...rows].sort(compareIntelligenceRank);
	const rankByOriginalIndex = new Map<number, number>();
	for (const [rankIndex, row] of rankedRows.entries()) {
		const previousRow = rankedRows[rankIndex - 1];
		const score = intelligenceScore(row);
		const previousScore =
			previousRow == null ? null : intelligenceScore(previousRow);
		const previousRank =
			previousRow == null
				? 0
				: (rankByOriginalIndex.get(previousRow.originalIndex) ?? 0);
		const rank =
			typeof score === "number" &&
			Number.isFinite(score) &&
			score === previousScore
				? previousRank
				: rankIndex + 1;
		rankByOriginalIndex.set(row.originalIndex, rank);
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
	return row.model.scores?.intelligence_score;
}

function compareMissingValues(sorter: Sorter, left: unknown, right: unknown) {
	if (sorter.type !== "number") {
		return 0;
	}
	return compareMissingNumbers(left, right);
}

function compareMissingNumbers(left: unknown, right: unknown) {
	const isLeftMissing = typeof left !== "number" || !Number.isFinite(left);
	const isRightMissing = typeof right !== "number" || !Number.isFinite(right);
	if (isLeftMissing && isRightMissing) {
		return 0;
	}
	if (isLeftMissing) {
		return 1;
	}
	if (isRightMissing) {
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

function displayKey(model: LlmStatsModel) {
	const id = typeof model.id === "string" ? model.id : "";
	const slashIndex = id.indexOf("/");
	if (slashIndex <= 0) {
		return `${id.toLowerCase().replace(/\./g, "-").replace(/-+/g, "-")}\u0000${model.reasoning_effort ?? ""}`;
	}
	const slug = id
		.slice(slashIndex + 1)
		.toLowerCase()
		.replace(/\./g, "-")
		.replace(/-+/g, "-")
		.replace(/-\d{8}$/, "")
		.replace(/-fast$/, "");
	const provider = canonicalProviderId(id.slice(0, slashIndex), slug);
	return `${provider}/${slug}\u0000${model.reasoning_effort ?? ""}`;
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
