import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import {
	hasPublicFreeRouteLabel,
	isOpenRouterFreeRouteId,
	publicModelDisplayName,
	publicOpenRouterModelId,
} from "../model-aliases";
import type {
	FinalStageConfig,
	ModelStatsNullableScores,
	ModelStatsScoredCandidate,
	ModelStatsSelectedModel,
	ScoringConfig,
} from "../types";

const MIN_REQUIRED_RELATIVE_SCORE = 10;
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
	"scores",
	"relative_scores",
]);
const REQUIRED_SCORE_KEYS = ["intelligence_score", "agentic_score"] as const;
const REQUIRED_RELATIVE_SCORE_KEYS = [
	"overall_score",
	"intelligence_score",
	"agentic_score",
] as const;

function modelSortKey(model: ModelStatsSelectedModel): string {
	return model.id ?? "";
}

function isFreeRouteModel(model: ModelStatsSelectedModel): boolean {
	return (
		isOpenRouterFreeRouteId(model.id) || hasPublicFreeRouteLabel(model.name)
	);
}

/** Sort the models by intelligence relative score. */
export function sortModelsByIntelligenceRelativeScore(
	models: ModelStatsSelectedModel[],
): ModelStatsSelectedModel[] {
	return [...models].sort((left, right) => {
		const leftIntelligence = left.relative_scores.intelligence_score;
		const rightIntelligence = right.relative_scores.intelligence_score;
		if (leftIntelligence !== rightIntelligence) {
			return rightIntelligence - leftIntelligence;
		}
		return modelSortKey(left).localeCompare(modelSortKey(right));
	});
}

function hasMinimumScoreSignal(
	model: ModelStatsScoredCandidate,
): model is ModelStatsSelectedModel {
	const scores: ModelStatsNullableScores | null = model.scores;
	if (scores == null) {
		return false;
	}
	const hasRequiredRawScores = REQUIRED_SCORE_KEYS.every((key) => {
		const value = scores[key];
		return value != null;
	});
	if (!hasRequiredRawScores) {
		return false;
	}
	const relativeScores = model.relative_scores;
	return REQUIRED_RELATIVE_SCORE_KEYS.every((key) => {
		const value = asFiniteNumber(relativeScores[key]);
		return value != null && value >= MIN_REQUIRED_RELATIVE_SCORE;
	});
}

/** Filter out low-signal models from the public list. */
export function filterLowSignalModels(
	models: ModelStatsScoredCandidate[],
): ModelStatsSelectedModel[] {
	return models.filter(hasMinimumScoreSignal);
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
	models: ModelStatsSelectedModel[],
	finalConfig: FinalStageConfig,
): ModelStatsSelectedModel[] {
	const recentModels = models.filter((model) =>
		isWithinRecentLookback(
			model.release_date,
			finalConfig.nullFieldPruneRecentLookbackDays,
		),
	);
	return recentModels.length > 0 ? recentModels : models;
}

function countNullishTopLevelKey(
	models: ModelStatsSelectedModel[],
	key: string,
): number {
	return models.reduce((count, model) => {
		const modelRecord = asRecord(model);
		return modelRecord[key] == null ? count + 1 : count;
	}, 0);
}

function countNullishNestedKey(
	models: ModelStatsSelectedModel[],
	parentKey: string,
	nestedKey: string,
): number {
	return models.reduce((count, model) => {
		const modelRecord = asRecord(model);
		const parentValue = modelRecord[parentKey];
		if (!isPlainObject(parentValue) || parentValue[nestedKey] == null) {
			return count + 1;
		}
		return count;
	}, 0);
}

/** Prune the sparse fields. */
export function pruneSparseFields(
	models: ModelStatsSelectedModel[],
	finalConfig: FinalStageConfig,
	scoringConfig: ScoringConfig,
): ModelStatsSelectedModel[] {
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
		const nullCount = countNullishTopLevelKey(sampleModels, key);
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
			const nullCount = countNullishNestedKey(
				sampleModels,
				parentKey,
				nestedKey,
			);
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
		return nextModel as ModelStatsSelectedModel;
	});
}

/** Filter the models by id. */
export function filterModelsById(
	models: ModelStatsSelectedModel[],
	id: string | null | undefined,
): ModelStatsSelectedModel[] {
	const normalizedId = publicOpenRouterModelId(id ?? null);
	return normalizedId == null
		? models
		: models.filter(
				(model) => publicOpenRouterModelId(model.id) === normalizedId,
			);
}

/** Normalize free-route public identifiers and collapse paid/free duplicate rows. */
export function normalizePublicFreeRoutes(
	models: ModelStatsSelectedModel[],
): ModelStatsSelectedModel[] {
	const modelByPublicId = new Map<
		string,
		{ model: ModelStatsSelectedModel; isFreeRoute: boolean }
	>();
	const passthrough: ModelStatsSelectedModel[] = [];

	for (const model of models) {
		const publicId = publicOpenRouterModelId(model.id);
		const publicName = publicModelDisplayName(model.name);
		const normalizedModel: ModelStatsSelectedModel = {
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

	return sortModelsByIntelligenceRelativeScore([
		...passthrough,
		...[...modelByPublicId.values()].map(({ model }) => model),
	]);
}
