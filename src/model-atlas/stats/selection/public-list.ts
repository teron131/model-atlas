/** Public model selection owns score gating, sparse-field pruning, and OpenRouter free-route collapse. */

import {
	hasPublicFreeRouteLabel,
	isOpenRouterFreeRouteId,
	publicOpenRouterModelId,
	publicOpenRouterModelName,
} from "../../openrouter-routes";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import type {
	FinalStageConfig,
	LlmStatsModel,
	LlmStatsNullableComponentScores,
	LlmStatsScoredCandidate,
	ScoringConfig,
} from "../types";

const MIN_REQUIRED_SCORE = 10;
const STABLE_TOP_LEVEL_KEYS = new Set<string>([
	"id",
	"name",
	"provider",
	"logo",
	"attachment",
	"reasoning",
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
const REQUIRED_COMPONENT_SCORE_KEYS = [
	"intelligence_score",
	"agentic_score",
] as const;
const REQUIRED_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;

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

/** Public rows need both core component scores and a minimum public score floor. */
function hasMinimumScoreSignal(
	model: LlmStatsScoredCandidate,
): model is LlmStatsModel {
	const componentScores: LlmStatsNullableComponentScores | null =
		model.component_scores;
	if (componentScores == null) {
		return false;
	}
	const hasRequiredComponentScores = REQUIRED_COMPONENT_SCORE_KEYS.every(
		(key) => {
			const value = componentScores[key];
			return value != null;
		},
	);
	if (!hasRequiredComponentScores) {
		return false;
	}
	const scores = model.scores;
	return REQUIRED_SCORE_KEYS.every((key) => {
		const value = asFiniteNumber(scores[key]);
		return value != null && value >= MIN_REQUIRED_SCORE;
	});
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

/** Free-route variants collapse into the canonical paid route unless they are the only available public row. */
function collapseOpenRouterFreeRoutes(
	models: LlmStatsModel[],
): LlmStatsModel[] {
	const modelByPublicId = new Map<
		string,
		{ model: LlmStatsModel; isFreeRoute: boolean }
	>();
	const passthrough: LlmStatsModel[] = [];

	for (const model of models) {
		const publicId = publicOpenRouterModelId(model.id);
		const publicName = publicOpenRouterModelName(model.name);
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
		const existing = modelByPublicId.get(publicId);
		if (!existing || (existing.isFreeRoute && !candidateIsFreeRoute)) {
			modelByPublicId.set(publicId, {
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
	const signalModels = scoredCandidates.filter(hasMinimumScoreSignal);
	const sortedModels = sortModelsByIntelligenceScore(signalModels);
	const prunedModels = pruneSparseFields(
		sortedModels,
		finalConfig,
		scoringConfig,
	);
	const normalizedModels = collapseOpenRouterFreeRoutes(prunedModels);
	const normalizedId = publicOpenRouterModelId(id ?? null);
	return normalizedId == null
		? normalizedModels
		: normalizedModels.filter(
				(model) => publicOpenRouterModelId(model.id) === normalizedId,
			);
}
