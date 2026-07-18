/** Verify snapshot preservation retains evidence only for the same runnable model effort. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { preserveHighSignalSnapshotModels } from "../src/model-atlas/stats/snapshot-preservation";
import {
	minimalLlmStatsModel,
	minimalLlmStatsPayload,
} from "./llm-stats-fixtures";

const preservedFable = {
	...minimalLlmStatsModel({
		id: "anthropic/claude-fable-5",
		name: "Claude Fable 5",
	}),
	speed: {
		throughput_tokens_per_second_median: 47.25,
		latency_seconds_median: 5.4,
		e2e_latency_seconds_median: 16.22,
	},
	intelligence: {
		intelligence_index: 59.8,
		agentic_index: 80.5,
	},
	evaluations: {
		gpqa: 0.92,
		hle: 0.53,
		lcr: 0.7,
		terminalbench_v21: 0.84,
	},
	scores: {
		intelligence_score: 97.4,
		agentic_score: 91.6,
		speed_score: 57.9,
		value_score: 61,
	},
};

const degradedFable = {
	...minimalLlmStatsModel({
		id: "claude-fable-5",
		name: "Claude Fable 5",
	}),
	intelligence: {
		intelligence_index: 59.8,
		agentic_index: 80.5,
	},
	scores: {
		intelligence_score: 78.5,
		agentic_score: 81.6,
		speed_score: null,
		value_score: 50,
	},
};

const preserved = preserveHighSignalSnapshotModels(
	minimalLlmStatsPayload({
		fetchedAt: 2,
		models: [
			degradedFable,
			{
				...minimalLlmStatsModel({ id: "openai/gpt-5-5", name: "GPT-5.5" }),
				scores: {
					intelligence_score: 93,
					agentic_score: 87,
					speed_score: 58,
					value_score: 63,
				},
			},
		],
	}),
	minimalLlmStatsPayload({
		fetchedAt: 1,
		models: [preservedFable],
	}),
	STAGE_CONFIG.snapshotPreservation,
	STAGE_CONFIG.scoring,
);

assert.equal(preserved.models[0]?.id, "anthropic/claude-fable-5");
assert.equal(
	preserved.models[0]?.scores.intelligence_score,
	97.4,
	"previous high-signal top models should survive cold snapshot degradation",
);

const incompatiblePreviousPayload = minimalLlmStatsPayload({
	fetchedAt: 1,
	models: [preservedFable],
});
delete (
	incompatiblePreviousPayload.metadata.scoring as Partial<
		typeof incompatiblePreviousPayload.metadata.scoring
	>
).snapshot_preservation_version;
const incompatiblePreserved = preserveHighSignalSnapshotModels(
	minimalLlmStatsPayload({
		fetchedAt: 2,
		models: [degradedFable],
	}),
	incompatiblePreviousPayload,
	STAGE_CONFIG.snapshotPreservation,
	STAGE_CONFIG.scoring,
);

assert.equal(
	incompatiblePreserved.models[0]?.id,
	"claude-fable-5",
	"previous snapshots without the current preservation version should not replace current rows",
);

const normalUpdate = preserveHighSignalSnapshotModels(
	minimalLlmStatsPayload({
		fetchedAt: 2,
		models: [
			{
				...preservedFable,
				scores: {
					...preservedFable.scores,
					intelligence_score: 95,
				},
			},
		],
	}),
	minimalLlmStatsPayload({ fetchedAt: 1, models: [preservedFable] }),
	STAGE_CONFIG.snapshotPreservation,
	STAGE_CONFIG.scoring,
);

assert.equal(
	normalUpdate.models[0]?.scores.intelligence_score,
	95,
	"normal small score changes should not be frozen to the previous snapshot",
);

const effortSpecificPreservation = preserveHighSignalSnapshotModels(
	minimalLlmStatsPayload({
		fetchedAt: 2,
		models: [{ ...degradedFable, reasoning_effort: "low" }],
	}),
	minimalLlmStatsPayload({
		fetchedAt: 1,
		models: [{ ...preservedFable, reasoning_effort: "max" }],
	}),
	STAGE_CONFIG.snapshotPreservation,
	STAGE_CONFIG.scoring,
);

assert.equal(
	effortSpecificPreservation.models[0]?.scores.intelligence_score,
	78.5,
	"snapshot preservation must not replace a lower-effort row with a previous max-effort row",
);
