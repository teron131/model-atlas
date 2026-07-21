/** Dashboard row shaping and sort semantics for LLM stats payloads. */

import { BENCHMARK_PORTFOLIO } from "../../../src/model-atlas/config/benchmark-portfolio";
import { clampScore, minMaxScale } from "../../../src/model-atlas/math-utils";
import { benchmarkMetricValue as modelBenchmarkMetricValue } from "../../../src/model-atlas/stats/resource-metrics";
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

const agentsLastExamTaskMetricColumns = defineTaskMetricColumns(
	"agents_last_exam",
	[
		{
			key: "agentsLastExamCost",
			metric: "cost",
			direction: "ascending",
			label: "ALE$",
		},
		{
			key: "agentsLastExamSeconds",
			metric: "seconds",
			direction: "ascending",
			label: "ALE Sec",
		},
		{
			key: "agentsLastExamInputTokens",
			metric: "input_tokens",
			direction: "ascending",
			label: "ALE In",
		},
		{
			key: "agentsLastExamOutputTokens",
			metric: "output_tokens",
			direction: "ascending",
			label: "ALE Out",
		},
	] as const,
);

const automationBenchTaskMetricColumns = defineTaskMetricColumns(
	"automation_bench",
	[
		{
			key: "automationBenchCost",
			metric: "cost",
			direction: "ascending",
			label: "Auto$",
		},
	] as const,
);

const critptTaskMetricColumns = defineTaskMetricColumns("critpt", [
	{
		key: "critptCost",
		metric: "cost",
		direction: "ascending",
		label: "Crit$",
	},
	{
		key: "critptSeconds",
		metric: "seconds",
		direction: "ascending",
		label: "Crit Sec",
	},
	{
		key: "critptTokens",
		metric: "tokens",
		direction: "ascending",
		label: "Crit Tok",
	},
] as const);

const cursorBenchTaskMetricColumns = defineTaskMetricColumns("cursorbench", [
	{
		key: "cursorBenchCost",
		metric: "cost",
		direction: "ascending",
		label: "Cursor$",
	},
	{
		key: "cursorBenchTokens",
		metric: "tokens",
		direction: "ascending",
		label: "Cursor Tok",
	},
] as const);

const deepSweTaskMetricColumns = defineTaskMetricColumns("deep_swe", [
	{
		key: "deepSWECost",
		metric: "cost",
		direction: "ascending",
		label: "DSWE$",
	},
	{
		key: "deepSWESeconds",
		metric: "seconds",
		direction: "ascending",
		label: "DSWE Sec",
	},
	{
		key: "deepSWETokens",
		metric: "output_tokens",
		direction: "descending",
		label: "DSWE Tok",
	},
] as const);

const frontierCodeTaskMetricColumns = defineTaskMetricColumns("frontier_code", [
	{
		key: "frontierCodeCost",
		metric: "cost",
		direction: "ascending",
		label: "FC$",
	},
	{
		key: "frontierCodeTokens",
		metric: "tokens",
		direction: "ascending",
		label: "FC Tok",
	},
] as const);

const gdpvalTaskMetricColumns = defineTaskMetricColumns("gdpval_normalized", [
	{
		key: "gdpvalCost",
		metric: "cost",
		direction: "ascending",
		label: "GDP$",
	},
	{
		key: "gdpvalSeconds",
		metric: "seconds",
		direction: "ascending",
		label: "GDP Sec",
	},
	{
		key: "gdpvalTokens",
		metric: "tokens",
		direction: "ascending",
		label: "GDP Tok",
	},
] as const);

const harveyLabTaskMetricColumns = defineTaskMetricColumns("harvey_lab", [
	{
		key: "harveyLabCost",
		metric: "cost",
		direction: "ascending",
		label: "HLAB$",
	},
	{
		key: "harveyLabSeconds",
		metric: "seconds",
		direction: "ascending",
		label: "HLAB Sec",
	},
	{
		key: "harveyLabTokens",
		metric: "tokens",
		direction: "ascending",
		label: "HLAB Tok",
	},
] as const);

const hleTaskMetricColumns = defineTaskMetricColumns("hle", [
	{
		key: "hleCost",
		metric: "cost",
		direction: "ascending",
		label: "HLE$",
	},
	{
		key: "hleSeconds",
		metric: "seconds",
		direction: "ascending",
		label: "HLE Sec",
	},
	{
		key: "hleTokens",
		metric: "tokens",
		direction: "ascending",
		label: "HLE Tok",
	},
] as const);

const tauBankingTaskMetricColumns = defineTaskMetricColumns("tau_banking", [
	{
		key: "tauBankingCost",
		metric: "cost",
		direction: "ascending",
		label: "tau3$",
	},
	{
		key: "tauBankingSeconds",
		metric: "seconds",
		direction: "ascending",
		label: "tau3 Sec",
	},
	{
		key: "tauBankingTokens",
		metric: "tokens",
		direction: "ascending",
		label: "tau3 Tok",
	},
] as const);

const terminalBenchTaskMetricColumns = defineTaskMetricColumns(
	"terminalbench_v21",
	[
		{
			key: "terminalBenchCost",
			metric: "cost",
			direction: "ascending",
			label: "TB$",
		},
		{
			key: "terminalBenchSeconds",
			metric: "seconds",
			direction: "ascending",
			label: "TB Sec",
		},
		{
			key: "terminalBenchTokens",
			metric: "tokens",
			direction: "ascending",
			label: "TB Tok",
		},
	] as const,
);

export const taskMetricColumns = [
	...artificialAnalysisTaskMetricColumns,
	...agentsLastExamTaskMetricColumns,
	...automationBenchTaskMetricColumns,
	...critptTaskMetricColumns,
	...cursorBenchTaskMetricColumns,
	...deepSweTaskMetricColumns,
	...frontierCodeTaskMetricColumns,
	...gdpvalTaskMetricColumns,
	...harveyLabTaskMetricColumns,
	...hleTaskMetricColumns,
	...tauBankingTaskMetricColumns,
	...terminalBenchTaskMetricColumns,
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

type BenchmarkMetricFormat = "percent" | "score" | "number" | "currency";

function defineBenchmarkMetricColumn<
	const TKey extends string,
	const TBenchmark extends string,
>(
	key: TKey,
	benchmark: TBenchmark,
	label: string,
	format: BenchmarkMetricFormat = "percent",
) {
	return {
		key,
		group: "benchmarks" as const,
		benchmark,
		direction: "descending" as const,
		type: "number" as const,
		label,
		format,
	};
}

const unsortedBenchmarkMetricColumns = [
	defineBenchmarkMetricColumn(
		"aaIntelligenceIndex",
		"aa_intelligence_index",
		"AA Index",
		"number",
	),
	defineBenchmarkMetricColumn("agentArena", "agent_arena", "Arena", "score"),
	defineBenchmarkMetricColumn("agentsLastExam", "agents_last_exam", "ALE"),
	defineBenchmarkMetricColumn("aleBench", "ale_bench", "ALE-B", "score"),
	defineBenchmarkMetricColumn("apexAgents", "apex_agents", "APEX"),
	defineBenchmarkMetricColumn("automationBench", "automation_bench", "Auto"),
	defineBenchmarkMetricColumn("blueprintBench", "blueprint_bench_2", "BB2"),
	defineBenchmarkMetricColumn("briefcase", "briefcase", "Briefcase"),
	defineBenchmarkMetricColumn("browseComp", "browsecomp", "Browse"),
	defineBenchmarkMetricColumn("chartography", "chartography", "Chart"),
	defineBenchmarkMetricColumn("chessPuzzles", "chess_puzzles", "Chess"),
	defineBenchmarkMetricColumn("codeMigration", "code_migration", "Migration"),
	defineBenchmarkMetricColumn("critpt", "critpt", "CritPt"),
	defineBenchmarkMetricColumn("cursorBench", "cursorbench", "Cursor"),
	defineBenchmarkMetricColumn("cyberBench", "cyberbench", "Cyber"),
	defineBenchmarkMetricColumn("deepSWE", "deep_swe", "DSWE"),
	defineBenchmarkMetricColumn("ebrBench", "ebr_bench", "EBR"),
	defineBenchmarkMetricColumn("emb", "emb", "EMB"),
	defineBenchmarkMetricColumn(
		"enterpriseBenchCoreCraft",
		"enterprisebench_corecraft",
		"CoreCraft",
	),
	defineBenchmarkMetricColumn(
		"epochCapabilitiesIndex",
		"epoch_capabilities_index",
		"ECI",
		"number",
	),
	defineBenchmarkMetricColumn("financeAgentV2", "finance_agent_v2", "Finance"),
	defineBenchmarkMetricColumn("frontierCode", "frontier_code", "FCode"),
	defineBenchmarkMetricColumn(
		"frontierMathTier4",
		"frontiermath_tier_4",
		"FM T4",
	),
	defineBenchmarkMetricColumn("gdpPdf", "gdp_pdf", "GDP.pdf"),
	defineBenchmarkMetricColumn("gdpval", "gdpval_normalized", "GDPval"),
	defineBenchmarkMetricColumn("handbookMd", "handbook_md", "Handbook"),
	defineBenchmarkMetricColumn("harveyLab", "harvey_lab", "HLAB"),
	defineBenchmarkMetricColumn("hle", "hle", "HLE"),
	defineBenchmarkMetricColumn("itBench", "itbench_sre", "ITBench"),
	defineBenchmarkMetricColumn("lcr", "lcr", "LCR"),
	defineBenchmarkMetricColumn("legalResearch", "legal_research", "Legal"),
	defineBenchmarkMetricColumn("medCode", "medcode", "MedCode"),
	defineBenchmarkMetricColumn("omniscience", "omniscience_accuracy", "Omni"),
	defineBenchmarkMetricColumn("programBench", "programbench", "Program"),
	defineBenchmarkMetricColumn("proofBench", "proofbench", "Proof"),
	defineBenchmarkMetricColumn(
		"publicBenefitsBench",
		"public_benefits_bench",
		"Benefits",
	),
	defineBenchmarkMetricColumn("riemannBench", "riemann_bench", "Riemann"),
	defineBenchmarkMetricColumn("scicode", "scicode", "SciCode"),
	defineBenchmarkMetricColumn("tauBanking", "tau_banking", "tau3"),
	defineBenchmarkMetricColumn("terminalBench", "terminalbench_v21", "TBench"),
	defineBenchmarkMetricColumn("toolathlon", "toolathlon", "Toolathlon"),
	defineBenchmarkMetricColumn("valsIndex", "vals_index", "Vals"),
	defineBenchmarkMetricColumn(
		"vendingBench2",
		"vending_bench_2",
		"Vending",
		"currency",
	),
	defineBenchmarkMetricColumn("vibeCode", "vibe_code", "Vibe"),
	defineBenchmarkMetricColumn("weirdMl", "weirdml", "WeirdML"),
] as const;

export const benchmarkMetricColumns = [...unsortedBenchmarkMetricColumns].sort(
	(left, right) =>
		compareBenchmarkDisplayKeys(
			left.benchmark,
			right.benchmark,
			BENCHMARK_PORTFOLIO,
		),
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

const taskMetricColumnsByBenchmark: Partial<
	Record<BenchmarkMetricColumn["key"], readonly TaskMetricColumn[]>
> = {
	agentsLastExam: agentsLastExamTaskMetricColumns,
	automationBench: automationBenchTaskMetricColumns,
	critpt: critptTaskMetricColumns,
	cursorBench: cursorBenchTaskMetricColumns,
	deepSWE: deepSweTaskMetricColumns,
	frontierCode: frontierCodeTaskMetricColumns,
	gdpval: gdpvalTaskMetricColumns,
	harveyLab: harveyLabTaskMetricColumns,
	hle: hleTaskMetricColumns,
	tauBanking: tauBankingTaskMetricColumns,
	terminalBench: terminalBenchTaskMetricColumns,
};

export const dashboardMetricColumns: DashboardMetricColumn[] = [
	...profileMetricColumns,
	...costMetricColumns,
	...speedMetricColumns,
	...artificialAnalysisTaskMetricColumns,
	...benchmarkMetricColumns.flatMap((column) => [
		column,
		...(taskMetricColumnsByBenchmark[column.key] ?? []),
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
	return booleanSortValue(model[column.field]);
}

function booleanSortValue(value: boolean | null | undefined) {
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
