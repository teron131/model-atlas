/** Exercises WeirdML's current creator schema, Epoch unit conversion, and conservative crosswalk merge. */

import assert from "node:assert/strict";

import {
	processEpochWeirdMlCsv,
	type WeirdMlEpochRow,
} from "../src/model-atlas/scrapers/epoch/weirdml";
import {
	mergeWeirdMlRows,
	processWeirdMlCsv,
} from "../src/model-atlas/scrapers/weirdml";

const taskColumns = [
	"shapes_easy_acc",
	"shapes_hard_acc",
	"digits_unsup_acc",
	"chess_winners_acc",
	"kolmo_shuffle_acc",
	"classify_sentences_acc",
	"classify_shuffled_acc",
	"insert_patches_acc",
	"blunders_easy_acc",
	"blunders_hard_acc",
	"digits_generalize_acc",
	"shapes_variable_acc",
	"xor_easy_acc",
	"xor_hard_acc",
	"splash_easy_acc",
	"splash_hard_acc",
	"number_patterns_acc",
] as const;
const creatorHeaders = [
	"internal_model_name",
	"display_name",
	"model_slug",
	...taskColumns,
	"avg_acc",
	"avg_acc_standard_error",
	"cost_per_run_usd",
	"mean_total_output_tokens",
	"code_len_p10",
	"code_len_p50",
	"code_len_p90",
	"exec_time_median_s",
	"release_date",
	"API source",
];

function creatorRow(options: {
	internalName: string;
	displayName: string;
	modelSlug: string;
	score: number;
	cost: number;
	codeLength: number;
}): string {
	return [
		options.internalName,
		options.displayName,
		options.modelSlug,
		...taskColumns.map(() => "0.5"),
		options.score,
		0.01,
		options.cost,
		1_000,
		10,
		options.codeLength,
		30,
		4.5,
		"2026-01-01",
		"Test API",
	].join(",");
}

const creatorCsv = [
	creatorHeaders.join(","),
	creatorRow({
		internalName: "alpha:high",
		displayName: "Alpha (high)",
		modelSlug: "test/alpha",
		score: 0.9,
		cost: 1,
		codeLength: 100,
	}),
	creatorRow({
		internalName: "beta-creator:high",
		displayName: "Beta Creator (high)",
		modelSlug: "test/beta-creator",
		score: 0.8,
		cost: 2,
		codeLength: 200,
	}),
	creatorRow({
		internalName: "gamma:high",
		displayName: "Gamma (high)",
		modelSlug: "test/gamma",
		score: 0.7,
		cost: 3,
		codeLength: 300,
	}),
	creatorRow({
		internalName: "epsilon:high",
		displayName: "Epsilon (high)",
		modelSlug: "test/epsilon",
		score: 0.6,
		cost: 4,
		codeLength: 400,
	}),
	creatorRow({
		internalName: "creator-only:high",
		displayName: "Creator Only (high)",
		modelSlug: "test/creator-only",
		score: 0.5,
		cost: 5,
		codeLength: 500,
	}),
].join("\n");

const primaryRows = processWeirdMlCsv(creatorCsv);
assert.equal(primaryRows.length, 5);
assert.equal(primaryRows[0]?.metadata.digits_unsup_acc, 0.5);
assert.equal(primaryRows[0]?.metadata.number_patterns_acc, 0.5);
assert.equal(primaryRows[0]?.metadata.mnist_acc, undefined);
assert.deepEqual(
	processWeirdMlCsv(
		"internal_model_name,display_name,model_slug,avg_acc,mnist_acc\nold,Old,old,0.5,0.5\n",
	),
	[],
);

const epochParsed = processEpochWeirdMlCsv(
	"id,Model version,Accuracy,Cost per run,Median code length (lines),Accuracy SE,id_model_version,Model,Display name,Unique display name,Organization,Version release date\n" +
		"epoch-alpha,alpha_high,0.9,1,100,0.0001,alpha_high,Alpha,Alpha (high),Alpha (high),Test Org,2026-01-01\n",
);
assert.equal(epochParsed[0]?.standard_error, 0.01);
assert.equal(epochParsed[0]?.reasoning_effort, "high");

function epochRow(options: {
	modelVersion: string;
	displayName: string;
	score: number;
	cost: number;
	codeLength: number;
}): WeirdMlEpochRow {
	return {
		model_version: options.modelVersion,
		name: options.displayName,
		aliases: [options.modelVersion, options.displayName],
		base_model: options.displayName.replace(/ \([^)]*\)$/, ""),
		reasoning_effort: options.displayName.includes("(high)") ? "high" : null,
		provider: "Test Org",
		accuracy: options.score,
		cost_per_run_usd: options.cost,
		code_len_p50: options.codeLength,
		standard_error: 0.01,
		observed_at: "2026-01-01",
	};
}

const epochRows: WeirdMlEpochRow[] = [
	epochRow({
		modelVersion: "alpha_high",
		displayName: "Alpha (high)",
		score: 0.9,
		cost: 1,
		codeLength: 100,
	}),
	epochRow({
		modelVersion: "beta-mirror_high",
		displayName: "Beta Mirror (high)",
		score: 0.8,
		cost: 2,
		codeLength: 200,
	}),
	epochRow({
		modelVersion: "gamma_high",
		displayName: "Gamma (high)",
		score: 0.7,
		cost: 3,
		codeLength: 300,
	}),
	epochRow({
		modelVersion: "epsilon_high",
		displayName: "Epsilon (high)",
		score: 0.6,
		cost: 40,
		codeLength: 400,
	}),
	epochRow({
		modelVersion: "delta_high",
		displayName: "Delta (high)",
		score: 0.65,
		cost: 6,
		codeLength: 600,
	}),
	epochRow({
		modelVersion: "alpha-alias_high",
		displayName: "Alpha Alias (high)",
		score: 0.9,
		cost: 1,
		codeLength: 100,
	}),
	{
		...epochRow({
			modelVersion: "alpha-stale_high",
			displayName: "Alpha Stale (high)",
			score: 0.9,
			cost: 1,
			codeLength: 100,
		}),
		observed_at: "2025-12-31",
	},
];

const merged = mergeWeirdMlRows(primaryRows, epochRows);
assert.equal(merged.crosswalk.accepted, true);
assert.equal(merged.crosswalk.identityMatchCount, 2);
assert.equal(merged.crosswalk.sharedEvidenceMatchCount, 1);
assert.deepEqual(merged.crosswalk.conflictingEpochModels, [
	"epsilon_high",
	"alpha-stale_high",
]);
assert.deepEqual(merged.crosswalk.ambiguousEpochModels, ["alpha-alias_high"]);
assert.equal(merged.crosswalk.addedEpochRowCount, 1);
assert.equal(merged.data.length, 6);
assert.equal(
	merged.data.find((row) => row.metadata.epoch_model_version === "delta_high")
		?.source_url,
	"https://epoch.ai/data/external_benchmarks/weirdml.csv",
);
assert.equal(
	merged.data.find((row) => row.model === "Epsilon (high)")?.canonical_value,
	0.6,
);
assert.equal(
	merged.data.some(
		(row) => row.metadata.epoch_model_version === "epsilon_high",
	),
	false,
);

const rejected = mergeWeirdMlRows(primaryRows, [
	epochRows[0] as WeirdMlEpochRow,
]);
assert.equal(rejected.crosswalk.accepted, false);
assert.equal(rejected.data.length, primaryRows.length);

const dateMismatch = mergeWeirdMlRows(primaryRows, [
	{
		...(epochRows[0] as WeirdMlEpochRow),
		observed_at: "2025-12-31",
	},
]);
assert.deepEqual(dateMismatch.crosswalk.conflictingEpochModels, ["alpha_high"]);

const reorderedClaudePrimary = {
	...(primaryRows[0] as (typeof primaryRows)[number]),
	model: "claude-4-opus (thinking 16k)",
	base_model: "claude-4-opus (thinking 16k)",
	reasoning_effort: null,
	metadata: {
		...(primaryRows[0] as (typeof primaryRows)[number]).metadata,
		internal_model_name: "claude-4-opus:16k",
	},
};
const reorderedClaudeEpoch = {
	...epochRow({
		modelVersion: "claude-opus-4-20250522_16K",
		displayName: "Claude Opus 4 (16k thinking)",
		score: 0.1,
		cost: 1,
		codeLength: 100,
	}),
	base_model: "Claude Opus 4 (16k thinking)",
	reasoning_effort: null,
};
const reorderedClaude = mergeWeirdMlRows(
	[reorderedClaudePrimary],
	[reorderedClaudeEpoch],
);
assert.deepEqual(reorderedClaude.crosswalk.conflictingEpochModels, [
	"claude-opus-4-20250522_16K",
]);
