/** Operational health checks for source freshness and benchmark update signals. */

import type { NumberOrNull } from "../../utils";
import type {
	LlmStatsBenchmarkUpdateEntry,
	LlmStatsBenchmarkUpdateHealth,
	LlmStatsEvaluations,
	LlmStatsIntelligence,
	LlmStatsModel,
	LlmStatsNullableRelativeScores,
	ModelAtlasStageConfig,
} from "./types";

const BENCHMARK_TOP_LIMIT = 5;
const REFERENCE_TOP_LIMIT = 10;

type BenchmarkHealthModel = Pick<
	LlmStatsModel,
	"id" | "name" | "evaluations" | "intelligence"
> & {
	relative_scores?: LlmStatsNullableRelativeScores | null;
};

type RankedModel = {
	id: string;
	referenceRank: number | null;
	value: number;
};

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
							referenceRank: referenceRanks.get(id) ?? null,
							value,
						},
					];
		})
		.sort((left, right) => right.value - left.value);
}

function updateStatus({
	checkedTopCount,
	overlapCount,
}: {
	checkedTopCount: number;
	overlapCount: number;
}): LlmStatsBenchmarkUpdateEntry["status"] {
	if (checkedTopCount === 0) {
		return "missing";
	}
	const currentOverlap = Math.max(1, Math.ceil(checkedTopCount / 2));
	if (overlapCount >= currentOverlap) {
		return "current";
	}
	return overlapCount > 0 ? "watch" : "stale_possible";
}

export function buildBenchmarkUpdateHealth(
	models: readonly BenchmarkHealthModel[],
	scoringConfig: ModelAtlasStageConfig["scoring"],
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
			const rankedModels = benchmarkRankedModels(models, key, referenceRanks);
			const topModels = rankedModels.slice(0, BENCHMARK_TOP_LIMIT);
			const overlapModels = topModels.filter(
				(model) => model.referenceRank != null,
			);
			const entry: LlmStatsBenchmarkUpdateEntry = {
				status: updateStatus({
					checkedTopCount: topModels.length,
					overlapCount: overlapModels.length,
				}),
				observed_count: rankedModels.length,
				checked_top_count: topModels.length,
				reference_top_count: referenceRanks.size,
				overlap_count: overlapModels.length,
				overlap_model_ids: overlapModels.map((model) => model.id),
				top_model_ids: topModels.map((model) => model.id),
				top_model_reference_rank: topModels[0]?.referenceRank ?? null,
				reference_metric: "relative_overall_score",
			};
			return [key, entry];
		}),
	);
}
