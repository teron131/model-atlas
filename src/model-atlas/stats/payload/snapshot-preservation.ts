/** Preserve high-signal snapshot rows when a refresh loses source evidence. */

import {
	AGENTIC_INDEX_KEYS,
	INTELLIGENCE_INDEX_KEYS,
} from "../../benchmarks/field-keys";
import type {
	ScoringConfig,
	SnapshotPreservationConfig,
} from "../../config/stage";
import {
	canonicalReasoningEffort,
	normalizeModelToken,
} from "../../identity/normalization";
import { asFiniteNumber, asRecord } from "../../runtime";
import type { ModelAtlasModel, ModelAtlasPayload } from "../types";

export const SNAPSHOT_PRESERVATION_VERSION = 2;
const DEFAULT_EFFORT_KEY = "\u0000default";
const MODEL_EFFORT_SEPARATOR = "\u001f";

function modelKeys(model: ModelAtlasModel): string[] {
	const keys = new Set<string>();
	const effort =
		canonicalReasoningEffort(model.reasoning_effort) ?? DEFAULT_EFFORT_KEY;
	for (const value of [model.id, model.name]) {
		if (typeof value !== "string" || value.length === 0) {
			continue;
		}
		const normalizedValue = normalizeModelToken(value);
		if (normalizedValue.length > 0) {
			keys.add(`${normalizedValue}${MODEL_EFFORT_SEPARATOR}${effort}`);
		}
		const slug = value.split("/").at(-1);
		if (slug != null && slug.length > 0) {
			const normalizedSlug = normalizeModelToken(slug);
			if (normalizedSlug.length > 0) {
				keys.add(`${normalizedSlug}${MODEL_EFFORT_SEPARATOR}${effort}`);
			}
		}
	}
	return [...keys];
}

function previousModelByKey(
	previousPayload: ModelAtlasPayload,
): Map<string, ModelAtlasModel> {
	const models = new Map<string, ModelAtlasModel>();
	for (const model of previousPayload.models) {
		for (const key of modelKeys(model)) {
			const existing = models.get(key);
			if (
				existing == null ||
				model.scores.intelligence_score > existing.scores.intelligence_score
			) {
				models.set(key, model);
			}
		}
	}
	return models;
}

function scoreSignalCount(
	model: ModelAtlasModel,
	scoringConfig: ScoringConfig,
): number {
	const speed = model.speed;
	const intelligence = asRecord(model.intelligence);
	const benchmarks = asRecord(model.benchmarks);
	const benchmarkKeys = [
		...INTELLIGENCE_INDEX_KEYS,
		...AGENTIC_INDEX_KEYS,
		...scoringConfig.intelligenceBenchmarkKeys,
		...scoringConfig.agenticBenchmarkKeys,
	];
	return [
		...benchmarkKeys.flatMap((key) => [intelligence[key], benchmarks[key]]),
		model.scores.speed_score,
		speed.throughput_tokens_per_second_median,
		speed.latency_seconds_median,
		speed.e2e_latency_seconds_median,
	].filter((value) => asFiniteNumber(value) != null).length;
}

function shouldPreservePreviousModel(
	current: ModelAtlasModel,
	previous: ModelAtlasModel,
	policy: SnapshotPreservationConfig,
	scoringConfig: ScoringConfig,
): boolean {
	const previousIntelligence = previous.scores.intelligence_score;
	const currentIntelligence = current.scores.intelligence_score;
	return (
		previousIntelligence >= policy.minPreviousIntelligenceScore &&
		previousIntelligence - currentIntelligence >=
			policy.minIntelligenceScoreDrop &&
		scoreSignalCount(previous, scoringConfig) >
			scoreSignalCount(current, scoringConfig)
	);
}

function sortByIntelligence(models: ModelAtlasModel[]): ModelAtlasModel[] {
	return [...models].sort((left, right) => {
		const scoreDelta =
			right.scores.intelligence_score - left.scores.intelligence_score;
		if (scoreDelta !== 0) {
			return scoreDelta;
		}
		return (left.id ?? "").localeCompare(right.id ?? "");
	});
}

/** Carry forward only stronger prior rows when a refresh loses evidence, keeping vanished-source protection narrow. */
export function preserveHighSignalSnapshotModels(
	payload: ModelAtlasPayload,
	previousPayload: ModelAtlasPayload | null,
	policy: SnapshotPreservationConfig,
	scoringConfig: ScoringConfig,
): ModelAtlasPayload {
	if (previousPayload == null || previousPayload.models.length === 0) {
		return payload;
	}
	if (
		previousPayload.metadata.scoring.snapshot_preservation_version !==
		SNAPSHOT_PRESERVATION_VERSION
	) {
		return payload;
	}
	const previousByKey = previousModelByKey(previousPayload);
	let replaced = false;
	const models = payload.models.map((model) => {
		const previous = modelKeys(model)
			.map((key) => previousByKey.get(key))
			.find((candidate): candidate is ModelAtlasModel => candidate != null);
		if (
			previous == null ||
			!shouldPreservePreviousModel(model, previous, policy, scoringConfig)
		) {
			return model;
		}
		replaced = true;
		return previous;
	});
	return replaced
		? { ...payload, models: sortByIntelligence(models) }
		: payload;
}
