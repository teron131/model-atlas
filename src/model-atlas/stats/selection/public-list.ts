/** Public model selection owns score gating, sparse-field pruning, and OpenRouter free-route collapse. */

import {
	hasPublicFreeRouteLabel,
	isOpenRouterFreeRouteId,
	publicOpenRouterModelId,
	publicOpenRouterModelName,
} from "../../openrouter-routes";
import {
	asFiniteNumber,
	asRecord,
	canonicalModelKey,
	type JsonObject,
} from "../../shared";
import type {
	FinalStageConfig,
	LlmStatsModel,
	LlmStatsNullableComponentScores,
	LlmStatsScoredCandidate,
	ScoringConfig,
} from "../types";

const STABLE_TOP_LEVEL_KEYS = new Set<string>([
	"id",
	"name",
	"provider",
	"logo",
	"attachment",
	"reasoning",
	"reasoning_effort",
	"release_date",
	"modalities",
	"open_weights",
	"cost",
	"context_window",
	"speed",
	"intelligence",
	"intelligence_index_cost",
	"task_metrics",
	"evaluations",
	"component_scores",
	"scores",
]);
const REQUIRED_QUALITY_SCORE_KEYS = [
	"intelligence_score",
	"agentic_score",
] as const;

/** Select the highest-intelligence variant as the representative row for each model. */
export function strongestModelVariants(
	models: readonly LlmStatsModel[],
): LlmStatsModel[] {
	const strongestByModel = new Map<string, LlmStatsModel>();
	for (const model of models) {
		const key = canonicalModelKey(model);
		const existing = strongestByModel.get(key);
		if (
			existing == null ||
			model.scores.intelligence_score > existing.scores.intelligence_score
		) {
			strongestByModel.set(key, model);
		}
	}
	return [...strongestByModel.values()];
}

function isFreeRouteModel(model: LlmStatsModel): boolean {
	return (
		isOpenRouterFreeRouteId(model.id) || hasPublicFreeRouteLabel(model.name)
	);
}

function sortModelsByIntelligenceScore(
	models: LlmStatsModel[],
): LlmStatsModel[] {
	return [...models].sort((left, right) => {
		const leftIntelligence = left.scores.intelligence_score;
		const rightIntelligence = right.scores.intelligence_score;
		if (leftIntelligence !== rightIntelligence) {
			return rightIntelligence - leftIntelligence;
		}
		const leftKey = left.id ?? "";
		const rightKey = right.id ?? "";
		return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
	});
}

/** Public rows need finite core quality scores; evidence sufficiency is enforced separately. */
export function hasRequiredQualityScores(
	model: LlmStatsScoredCandidate,
): model is LlmStatsScoredCandidate & LlmStatsModel {
	const componentScores: LlmStatsNullableComponentScores | null =
		model.component_scores;
	if (componentScores == null) {
		return false;
	}
	const hasRequiredComponentScores = REQUIRED_QUALITY_SCORE_KEYS.every(
		(key) => {
			const value = componentScores[key];
			return value != null;
		},
	);
	if (!hasRequiredComponentScores) {
		return false;
	}
	const scores = model.scores;
	return REQUIRED_QUALITY_SCORE_KEYS.every(
		(key) => asFiniteNumber(scores[key]) != null,
	);
}

/** Project scored candidates onto the public contract before pruning can preserve internal fields. */
function toPublicModel(
	model: LlmStatsScoredCandidate & LlmStatsModel,
): LlmStatsModel {
	return {
		id: model.id,
		name: model.name,
		provider: model.provider,
		logo: model.logo,
		attachment: model.attachment,
		reasoning: model.reasoning,
		reasoning_effort: model.reasoning_effort,
		release_date: model.release_date,
		modalities: model.modalities,
		open_weights: model.open_weights,
		cost: model.cost,
		context_window: model.context_window,
		speed: model.speed,
		intelligence: model.intelligence,
		intelligence_index_cost: model.intelligence_index_cost,
		task_metrics: model.task_metrics,
		evaluations: model.evaluations,
		component_scores: {
			intelligence_score: model.component_scores.intelligence_score,
			agentic_score: model.component_scores.agentic_score,
			speed_score: model.component_scores.speed_score,
		},
		scores: {
			intelligence_score: model.scores.intelligence_score,
			agentic_score: model.scores.agentic_score,
			speed_score: model.scores.speed_score,
			value_score: model.scores.value_score,
		},
	};
}

/** Validate and project one scored candidate onto the exact public model contract. */
export function publicModelFromCandidate(
	model: LlmStatsScoredCandidate,
): LlmStatsModel | null {
	return hasRequiredQualityScores(model) ? toPublicModel(model) : null;
}

function isPlainObject(value: unknown): value is JsonObject {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function isWithinRecentLookback(
	releaseDate: string | null,
	lookbackDays: number,
): boolean {
	if (typeof releaseDate !== "string" || releaseDate.length === 0) {
		return false;
	}
	const releaseTimestampMs = Date.parse(releaseDate);
	if (!Number.isFinite(releaseTimestampMs)) {
		return false;
	}
	const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
	return releaseTimestampMs >= cutoffMs;
}

function selectPruneSampleModels(
	models: LlmStatsModel[],
	finalConfig: FinalStageConfig,
): LlmStatsModel[] {
	const recentModels = models.filter((model) =>
		isWithinRecentLookback(
			model.release_date,
			finalConfig.nullFieldPruneRecentLookbackDays,
		),
	);
	return recentModels.length > 0 ? recentModels : models;
}

/** Null-heavy optional fields are pruned from recent public rows while stable contract fields remain fixed. */
function pruneSparseFields(
	models: LlmStatsModel[],
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): LlmStatsModel[] {
	if (models.length === 0) {
		return models;
	}

	const selectedBenchmarkKeys = new Set([
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	]);
	const sampleModels = selectPruneSampleModels(models, finalConfig);
	const sampleTotal = sampleModels.length;
	const topLevelKeys = new Set<string>();
	const nestedKeysByParent = new Map<string, Set<string>>();

	for (const model of models) {
		for (const [key, value] of Object.entries(model)) {
			topLevelKeys.add(key);
			if (!isPlainObject(value)) {
				continue;
			}
			const nestedKeys = nestedKeysByParent.get(key) ?? new Set<string>();
			for (const nestedKey of Object.keys(value)) {
				nestedKeys.add(nestedKey);
			}
			nestedKeysByParent.set(key, nestedKeys);
		}
	}

	const topLevelKeysToPrune = new Set<string>();
	for (const key of topLevelKeys) {
		if (STABLE_TOP_LEVEL_KEYS.has(key)) {
			continue;
		}
		const nullCount = sampleModels.reduce((count, model) => {
			const modelRecord = asRecord(model);
			return modelRecord[key] == null ? count + 1 : count;
		}, 0);
		if (nullCount / sampleTotal > finalConfig.nullFieldPruneThreshold) {
			topLevelKeysToPrune.add(key);
		}
	}

	const nestedKeysToPruneByParent = new Map<string, Set<string>>();
	for (const [parentKey, nestedKeys] of nestedKeysByParent) {
		if (parentKey !== "evaluations") {
			continue;
		}
		const keysToPrune = new Set<string>();
		for (const nestedKey of nestedKeys) {
			if (selectedBenchmarkKeys.has(nestedKey)) {
				continue;
			}
			const nullCount = sampleModels.reduce((count, model) => {
				const modelRecord = asRecord(model);
				const parentValue = modelRecord[parentKey];
				if (!isPlainObject(parentValue) || parentValue[nestedKey] == null) {
					return count + 1;
				}
				return count;
			}, 0);
			if (nullCount / sampleTotal > finalConfig.nullFieldPruneThreshold) {
				keysToPrune.add(nestedKey);
			}
		}
		if (keysToPrune.size > 0) {
			nestedKeysToPruneByParent.set(parentKey, keysToPrune);
		}
	}

	return models.map((model) => {
		const nextModel: JsonObject = { ...model };
		for (const key of topLevelKeysToPrune) {
			delete nextModel[key];
		}
		for (const [parentKey, nestedKeysToPrune] of nestedKeysToPruneByParent) {
			const parentValue = nextModel[parentKey];
			if (!isPlainObject(parentValue)) {
				continue;
			}
			const nextParentValue: JsonObject = { ...parentValue };
			for (const nestedKey of nestedKeysToPrune) {
				delete nextParentValue[nestedKey];
			}
			nextModel[parentKey] = nextParentValue;
		}
		return nextModel as LlmStatsModel;
	});
}

/** Free routes collapse within each reasoning variant so the dashboard can expand variants without duplicate routes. */
function collapseOpenRouterFreeRoutesByVariant(
	models: LlmStatsModel[],
): LlmStatsModel[] {
	const modelByPublicId = new Map<
		string,
		{ model: LlmStatsModel; isFreeRoute: boolean }
	>();
	const passthrough: LlmStatsModel[] = [];

	for (const model of models) {
		const publicId = publicOpenRouterModelId(model.id);
		const publicName = publicOpenRouterModelName(model.name, publicId);
		const normalizedModel: LlmStatsModel = {
			...model,
			id: publicId,
			name: publicName,
		};
		if (!publicId) {
			passthrough.push(normalizedModel);
			continue;
		}
		const candidateIsFreeRoute = isFreeRouteModel(model);
		const variantId = `${publicId}\u0000${model.reasoning_effort ?? ""}`;
		const existing = modelByPublicId.get(variantId);
		if (!existing || (existing.isFreeRoute && !candidateIsFreeRoute)) {
			modelByPublicId.set(variantId, {
				model: normalizedModel,
				isFreeRoute: candidateIsFreeRoute,
			});
		}
	}

	return sortModelsByIntelligenceScore([
		...passthrough,
		...[...modelByPublicId.values()].map(({ model }) => model),
	]);
}

export function selectPublicModels(
	scoredCandidates: LlmStatsScoredCandidate[],
	id: string | null | undefined,
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): LlmStatsModel[] {
	const signalModels = scoredCandidates.flatMap((model) => {
		const publicModel = publicModelFromCandidate(model);
		return publicModel == null ? [] : [publicModel];
	});
	const sortedModels = sortModelsByIntelligenceScore(signalModels);
	const prunedModels = pruneSparseFields(
		sortedModels,
		finalConfig,
		scoringConfig,
	);
	const normalizedModels = collapseOpenRouterFreeRoutesByVariant(prunedModels);
	const normalizedId = publicOpenRouterModelId(id ?? null);
	return normalizedId == null
		? normalizedModels
		: normalizedModels.filter(
				(model) => publicOpenRouterModelId(model.id) === normalizedId,
			);
}
