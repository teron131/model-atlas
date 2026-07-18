/** Verify cached source preservation merges equivalent live rows without duplicating model identities. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import {
	mergeCachedSourceRows,
	snapshotRows,
	snapshotRowsWithStates,
} from "../src/model-atlas/database/policy";
import { mergeArtificialAnalysisRow } from "../src/model-atlas/database/source-snapshots/artificial-analysis";
import { artificialAnalysisEvaluationResourceSourceKey } from "../src/model-atlas/database/source-snapshots/sparse-benchmarks";
import type { ArtificialAnalysisEvaluationResourceRow } from "../src/model-atlas/scrapers/artificial-analysis/benchmark-resources";
import { artificialAnalysisModelId } from "../src/model-atlas/scrapers/artificial-analysis/leaderboard";

type ArtificialAnalysisFixtureRow = {
	model_id: string;
	name: string;
	intelligenceIndex?: number;
	deprecated?: boolean;
};

const cachedRows: ArtificialAnalysisFixtureRow[] = [
	{
		model_id: "anthropic/claude-fable-5",
		name: "Claude Fable 5",
		intelligenceIndex: 64.9,
	},
	{
		model_id: "anthropic/claude-opus-4-6",
		name: "Claude Opus 4.6",
		intelligenceIndex: 61.4,
	},
];

const fetchedRows: ArtificialAnalysisFixtureRow[] = [
	{
		model_id: "anthropic/claude-fable-5",
		name: "Claude Fable 5 (not currently available)",
		deprecated: true,
	},
	{
		model_id: "openai/gpt-5-5",
		name: "GPT-5.5 (xHigh)",
		intelligenceIndex: 60.2,
	},
];

const rowKey = (row: ArtificialAnalysisFixtureRow) => row.model_id;
const mergeArtificialAnalysisFixtureRow = (
	cachedRow: ArtificialAnalysisFixtureRow,
	fetchedRow: ArtificialAnalysisFixtureRow,
) =>
	mergeArtificialAnalysisRow(
		cachedRow as Record<string, unknown>,
		fetchedRow as Record<string, unknown>,
		STAGE_CONFIG.scoring,
	) as ArtificialAnalysisFixtureRow;

const cachedArtificialAnalysisRow = {
	model_id: "openai/gpt-5-6-sol",
	name: "GPT-5.6 Sol",
	intelligence_index: 58.8,
};
const liveArtificialAnalysisRow = {
	id: "live-page-uuid",
	slug: "gpt-5-6-sol",
	modelCreatorSlug: "openai",
	name: "GPT-5.6 Sol (Adaptive Reasoning, Max Effort)",
	intelligenceIndex: 58.9,
};
const mergedArtificialAnalysisShapes = mergeCachedSourceRows(
	[cachedArtificialAnalysisRow],
	[liveArtificialAnalysisRow],
	artificialAnalysisModelId,
);
assert.equal(
	mergedArtificialAnalysisShapes.length,
	1,
	"Persisted and live Artificial Analysis shapes for one model must merge into one source row",
);

const mergedRows = mergeCachedSourceRows(
	cachedRows,
	fetchedRows,
	rowKey,
	mergeArtificialAnalysisFixtureRow,
);

assert.deepEqual(
	mergedRows.map((row) => row.model_id),
	["anthropic/claude-fable-5", "anthropic/claude-opus-4-6", "openai/gpt-5-5"],
	"Fetched rows should fill matching rows, append new rows, and preserve cached rows missing from the fetch",
);
assert.equal(
	mergedRows[0]?.name,
	"Claude Fable 5",
	"AA unavailable shell rows should not overwrite cached score-bearing rows with the same model id",
);
assert.equal(mergedRows[0]?.deprecated, undefined);
assert.equal(mergedRows[0]?.intelligenceIndex, 64.9);
assert.equal(
	mergedRows[1]?.name,
	"Claude Opus 4.6",
	"Rows missing from a refreshed source should remain cached by default",
);

assert.deepEqual(
	snapshotRows(cachedRows, [], null, {}, rowKey),
	cachedRows,
	"Unavailable sources with no usable fetched rows should keep cached rows",
);
assert.deepEqual(
	snapshotRows(
		cachedRows,
		fetchedRows,
		1_800_000_000,
		{},
		rowKey,
		mergeArtificialAnalysisFixtureRow,
	).map((row) => row.model_id),
	["anthropic/claude-fable-5", "anthropic/claude-opus-4-6", "openai/gpt-5-5"],
	"Normal refreshes should not remove cached rows absent from the fetch",
);
assert.deepEqual(
	snapshotRows(
		cachedRows,
		fetchedRows,
		1_800_000_000,
		{ replaceSourceRows: true },
		rowKey,
	).map((row) => row.model_id),
	["anthropic/claude-fable-5", "openai/gpt-5-5"],
	"Manual replace mode should allow pruning rows absent from the source",
);

const quarantinedSnapshot = snapshotRowsWithStates({
	source: "artificial_analysis",
	cachedRows,
	fetchedRows,
	fetchedAtEpochSeconds: 1_800_000_000,
	options: {},
	rowKey,
	rowLabel: (row) => row.name,
	mergeRow: mergeArtificialAnalysisFixtureRow,
	previousMissingSince: new Map(),
	nowEpochSeconds: 1_800_000_123,
});

assert.deepEqual(
	quarantinedSnapshot.states.map((row) => ({
		key: row.row_key,
		status: row.status,
		missingSince: row.missing_from_source_since_epoch_seconds,
	})),
	[
		{
			key: "anthropic/claude-fable-5",
			status: "active",
			missingSince: null,
		},
		{
			key: "anthropic/claude-opus-4-6",
			status: "quarantined_missing_from_source",
			missingSince: 1_800_000_123,
		},
		{
			key: "openai/gpt-5-5",
			status: "active",
			missingSince: null,
		},
	],
);

const continuedQuarantineSnapshot = snapshotRowsWithStates({
	source: "artificial_analysis",
	cachedRows,
	fetchedRows: [],
	fetchedAtEpochSeconds: null,
	options: {},
	rowKey,
	rowLabel: (row) => row.name,
	previousMissingSince: new Map([["anthropic/claude-opus-4-6", 1_800_000_123]]),
	nowEpochSeconds: 1_800_000_999,
});

assert.equal(
	continuedQuarantineSnapshot.states.find(
		(row) => row.row_key === "anthropic/claude-opus-4-6",
	)?.missing_from_source_since_epoch_seconds,
	1_800_000_123,
	"Existing quarantine timestamps should survive source outages",
);

const effortResourceRow = (
	reasoningEffort: string,
	secondsPerTask: number,
): ArtificialAnalysisEvaluationResourceRow => ({
	benchmark_key: "terminalbench_v21",
	source_url: "https://example.com/terminalbench",
	model_id: "openai/gpt-test",
	model: `GPT Test (${reasoningEffort})`,
	provider: "OpenAI",
	provider_id: "openai",
	reasoning_effort: reasoningEffort,
	score: 0.8,
	task_run_count: 10,
	cost_per_task_usd: 1,
	seconds_per_task: secondsPerTask,
	tokens_per_task: 1_000,
	input_tokens_per_task: 500,
	output_tokens_per_task: 500,
	answer_tokens_per_task: null,
	reasoning_tokens_per_task: null,
});
const cachedEffortResources = [
	effortResourceRow("high", 100),
	effortResourceRow("low", 50),
];
const refreshedEffortResources = [effortResourceRow("high", 90)];
const preservedEffortResources = mergeCachedSourceRows(
	cachedEffortResources,
	refreshedEffortResources,
	artificialAnalysisEvaluationResourceSourceKey,
);
assert.deepEqual(
	preservedEffortResources.map((row) => [
		row.reasoning_effort,
		row.seconds_per_task,
	]),
	[
		["high", 100],
		["low", 50],
	],
	"AA resource refreshes should preserve known telemetry and sibling effort rows",
);
