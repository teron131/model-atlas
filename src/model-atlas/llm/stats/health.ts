/** Operational health checks for source freshness and benchmark update signals. */

import type { NumberOrNull } from "../../utils";
import { splitBaseModelTokens, splitTokens } from "../matcher/name-tokens";
import {
	compareCandidates,
	hasFirstTokenMatch,
	scoreCandidate,
} from "../matcher/scoring";
import { normalizeModelToken, normalizeProviderModelId } from "../shared";
import { hasVariantConflict } from "./matching";
import type {
	LlmStatsBenchmarkUpdateEntry,
	LlmStatsBenchmarkUpdateHealth,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsModel,
	LlmStatsNullableRelativeScores,
	MatcherConfig,
	ModelAtlasStageConfig,
} from "./types";

const BENCHMARK_TOP_LIMIT = 5;
const REFERENCE_TOP_LIMIT = 10;
export const ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS = [
	"apex_agents",
	"critpt",
	"gdpval_normalized",
	"gpqa",
	"hle",
	"lcr",
	"mmmu_pro",
	"scicode",
	"tau_banking",
	"terminalbench_v21",
] as const;
const COVERAGE_IGNORED_TOKENS = new Set([
	"preview",
	"high",
	"xhigh",
	"medium",
	"low",
	"minimal",
]);

type BenchmarkHealthModel = Pick<
	LlmStatsModel,
	"id" | "name" | "evaluations" | "intelligence"
> & {
	relative_scores?: LlmStatsNullableRelativeScores | null;
};

type RankedModel = {
	id: string;
	label: string;
	referenceRank: number | null;
	value: number;
};

export type BenchmarkUpdateOfficialRow = {
	id: string | null;
	label: string;
	provider: string | null;
	value: number;
};

export type BenchmarkUpdateOfficialRowsByKey = Readonly<
	Record<string, readonly BenchmarkUpdateOfficialRow[]>
>;

export function appendBenchmarkUpdateOfficialRow(
	rowsByKey: Record<string, BenchmarkUpdateOfficialRow[]>,
	key: string,
	row: BenchmarkUpdateOfficialRow,
): void {
	rowsByKey[key] ??= [];
	rowsByKey[key].push(row);
}

function finiteNumber(value: NumberOrNull | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function modelIdentity(
	model: Pick<LlmStatsModel, "id" | "name">,
): string | null {
	return model.id ?? model.name ?? null;
}

function benchmarkValue(
	model: BenchmarkHealthModel,
	key: string,
): number | null {
	const evaluations = model.evaluations as LlmStatsEvaluations | null;
	const intelligence = model.intelligence as LlmStatsIntelligence | null;
	return finiteNumber(evaluations?.[key] ?? intelligence?.[key]);
}

function referenceRankByModel(
	models: readonly BenchmarkHealthModel[],
): Map<string, number> {
	const ranked = models
		.flatMap((model) => {
			const id = modelIdentity(model);
			const score = finiteNumber(model.relative_scores?.overall_score);
			return id == null || score == null ? [] : [{ id, score }];
		})
		.sort((left, right) => right.score - left.score)
		.slice(0, REFERENCE_TOP_LIMIT);
	return new Map(ranked.map((model, index) => [model.id, index + 1]));
}

function officialRowSourceSlug(row: BenchmarkUpdateOfficialRow): string {
	if (row.id != null) {
		const slug = row.id.split("/").at(-1);
		if (slug != null) {
			return normalizeModelToken(slug);
		}
	}
	return normalizeModelToken(row.label);
}

function hasSourceTokenCoverage(
	sourceSlug: string,
	model: Pick<LlmStatsModel, "id" | "name">,
): boolean {
	const sourceTokens = splitTokens(sourceSlug).filter(
		(token) => !COVERAGE_IGNORED_TOKENS.has(token),
	);
	if (sourceTokens.length === 0) {
		return false;
	}
	const candidateTokenSets = [
		model.id == null ? [] : splitBaseModelTokens(model.id),
		model.name == null ? [] : splitTokens(model.name),
	];
	return candidateTokenSets.some((candidateTokens) => {
		const candidateTokenSet = new Set(candidateTokens);
		return sourceTokens.every((token) => candidateTokenSet.has(token));
	});
}

function matchedOfficialRowId(
	row: BenchmarkUpdateOfficialRow,
	models: readonly BenchmarkHealthModel[],
	matcherConfig: MatcherConfig | undefined,
): string | null {
	if (matcherConfig == null) {
		return null;
	}
	const sourceSlug = officialRowSourceSlug(row);
	const candidates = models
		.flatMap((model) => {
			const id = modelIdentity(model);
			const name = model.name ?? "";
			if (
				id == null ||
				!hasFirstTokenMatch(sourceSlug, id, name) ||
				!hasSourceTokenCoverage(sourceSlug, model) ||
				hasVariantConflict(sourceSlug, id, matcherConfig)
			) {
				return [];
			}
			const score = scoreCandidate(sourceSlug, id, name);
			return score > 0
				? [
						{
							model_id: id,
							provider_id: id.split("/")[0] ?? "",
							provider_name: "",
							model_name: name || null,
							score,
						},
					]
				: [];
		})
		.sort(compareCandidates);
	return candidates[0]?.model_id ?? null;
}

function benchmarkRankedModels(
	models: readonly BenchmarkHealthModel[],
	key: string,
	referenceRanks: ReadonlyMap<string, number>,
): RankedModel[] {
	return models
		.flatMap((model) => {
			const id = modelIdentity(model);
			const value = benchmarkValue(model, key);
			return id == null || value == null
				? []
				: [
						{
							id,
							label: model.name ?? id,
							referenceRank: referenceRanks.get(id) ?? null,
							value,
						},
					];
		})
		.sort((left, right) => right.value - left.value);
}

function officialRankedModels(
	rows: readonly BenchmarkUpdateOfficialRow[],
	models: readonly BenchmarkHealthModel[],
	referenceRanks: ReadonlyMap<string, number>,
	matcherConfig: MatcherConfig | undefined,
): RankedModel[] {
	return rows
		.map((row) => {
			const id = matchedOfficialRowId(row, models, matcherConfig);
			return {
				id,
				label: row.label,
				referenceRank: id == null ? null : (referenceRanks.get(id) ?? null),
				value: row.value,
			};
		})
		.sort((left, right) => right.value - left.value)
		.flatMap((row) =>
			row.id == null
				? []
				: [
						{
							id: row.id,
							label: row.label,
							referenceRank: row.referenceRank,
							value: row.value,
						},
					],
		);
}

function officialTopRows(
	rows: readonly BenchmarkUpdateOfficialRow[] | undefined,
): BenchmarkUpdateOfficialRow[] {
	return [...(rows ?? [])]
		.sort((left, right) => right.value - left.value)
		.slice(0, BENCHMARK_TOP_LIMIT);
}

function officialRowOutputId(row: BenchmarkUpdateOfficialRow): string {
	if (row.id != null) {
		return row.id;
	}
	if (row.provider != null) {
		return normalizeProviderModelId(
			`${row.provider}/${normalizeModelToken(row.label)}`,
		);
	}
	return normalizeModelToken(row.label);
}

function updateStatus({
	checkedTopCount,
	overlapCount,
	unrepresentedTopCount = 0,
}: {
	checkedTopCount: number;
	overlapCount: number;
	unrepresentedTopCount?: number;
}): LlmStatsBenchmarkUpdateEntry["status"] {
	if (checkedTopCount === 0) {
		return "missing";
	}
	if (overlapCount >= requiredOverlap(checkedTopCount, unrepresentedTopCount)) {
		return "current";
	}
	return overlapCount > 0 ? "watch" : "stale_possible";
}

function requiredOverlap(
	checkedTopCount: number,
	unrepresentedTopCount: number,
): number {
	if (unrepresentedTopCount >= 2) {
		return 1;
	}
	return Math.max(1, Math.ceil(checkedTopCount / 2));
}

export function buildBenchmarkUpdateHealth(
	models: readonly BenchmarkHealthModel[],
	scoringConfig: ModelAtlasStageConfig["scoring"],
	officialRowsByKey: BenchmarkUpdateOfficialRowsByKey = {},
	matcherConfig?: MatcherConfig,
): LlmStatsBenchmarkUpdateHealth {
	const referenceRanks = referenceRankByModel(models);
	const selectedBenchmarkKeys = [
		...new Set([
			...scoringConfig.intelligenceBenchmarkKeys,
			...scoringConfig.agenticBenchmarkKeys,
		]),
	].sort((left, right) => left.localeCompare(right));
	return Object.fromEntries(
		selectedBenchmarkKeys.map((key) => {
			const officialRows = officialRowsByKey[key];
			const officialTopSourceRows = officialTopRows(officialRows);
			const rankedModels =
				officialRows == null
					? benchmarkRankedModels(models, key, referenceRanks)
					: officialRankedModels(
							officialTopSourceRows,
							models,
							referenceRanks,
							matcherConfig,
						);
			const topModels = rankedModels.slice(0, BENCHMARK_TOP_LIMIT);
			const overlapModels = topModels.filter(
				(model) => model.referenceRank != null,
			);
			const unrepresentedTopSourceRows = officialTopSourceRows.filter(
				(row) => matchedOfficialRowId(row, models, matcherConfig) == null,
			);
			const entry: LlmStatsBenchmarkUpdateEntry = {
				status: updateStatus({
					checkedTopCount: topModels.length,
					overlapCount: overlapModels.length,
					unrepresentedTopCount: unrepresentedTopSourceRows.length,
				}),
				observed_count: officialRows?.length ?? rankedModels.length,
				checked_top_count: topModels.length,
				reference_top_count: referenceRanks.size,
				overlap_count: overlapModels.length,
				overlap_model_ids: overlapModels.map((model) => model.id),
				top_model_ids:
					officialTopSourceRows.length > 0
						? officialTopSourceRows.map(officialRowOutputId)
						: topModels.map((model) => model.id),
				checked_model_ids: topModels.map((model) => model.id),
				top_model_labels:
					officialTopSourceRows.length > 0
						? officialTopSourceRows.map((model) => model.label)
						: topModels.map((model) => model.label),
				unrepresented_top_model_labels: unrepresentedTopSourceRows.map(
					(row) => row.label,
				),
				top_model_reference_rank: topModels[0]?.referenceRank ?? null,
				reference_metric: "relative_overall_score",
			};
			return [key, entry];
		}),
	);
}
