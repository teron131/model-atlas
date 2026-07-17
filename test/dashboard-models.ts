import assert from "node:assert/strict";
import {
	filterByModelControls,
	limitByIntelligenceScore,
	providerOptions,
} from "../app/dashboard/graphs/models";
import { cacheBustedPath } from "../app/dashboard/shared/format";
import {
	modelDisplayName,
	modelMatchesQuery,
	modelsForVariantDisplay,
	toggleProviderFilter,
} from "../app/dashboard/shared/modelDisplay";
import {
	dedupeDisplayModels,
	type SortState,
	sortedRows,
} from "../app/dashboard/table/models";
import { canonicalReasoningEffort } from "../src/model-atlas/shared";
import type { LlmStatsModel } from "../src/model-atlas/stats/types";
import { minimalLlmStatsModel } from "./llm-stats-fixtures";

const intelligenceRows = dedupeDisplayModels([
	rankedModel("provider/third", "Third", 30),
	rankedModel("provider/first", "First", 90),
	rankedModel("provider/second", "Second", 60),
]);

assert.deepEqual(
	intelligenceRows.map((row) => [row.model.id, row.intelligenceRank]),
	[
		["provider/third", 3],
		["provider/first", 1],
		["provider/second", 2],
	],
	"row ranks should be tied to intelligence score, not source/display order",
);

const tiedIntelligenceRows = dedupeDisplayModels([
	rankedModel("provider/first", "First", 100),
	rankedModel("provider/second-a", "Second A", 90),
	rankedModel("provider/second-b", "Second B", 90),
	rankedModel("provider/fourth", "Fourth", 80),
]);
assert.deepEqual(
	tiedIntelligenceRows.map((row) => [row.model.id, row.intelligenceRank]),
	[
		["provider/first", 1],
		["provider/second-a", 2],
		["provider/second-b", 2],
		["provider/fourth", 4],
	],
	"equal intelligence scores should share competition ranks",
);

assert.deepEqual(
	sortedRows(intelligenceRows, "", sortState("model", "ascending")).map(
		(row) => [row.model.id, row.intelligenceRank],
	),
	[
		["provider/first", 1],
		["provider/second", 2],
		["provider/third", 3],
	],
	"model sort should not renumber intelligence ranks",
);

assert.deepEqual(
	sortedRows(intelligenceRows, "", sortState("rank", "ascending")).map(
		(row) => row.model.id,
	),
	["provider/first", "provider/second", "provider/third"],
	"rank sort should follow intelligence rank",
);

assert.deepEqual(
	limitByIntelligenceScore(
		[
			rankedModel("provider/high", "High", 90),
			rankedModel("provider/mid", "Mid", 60),
			...Array.from({ length: 29 }, (_, index) =>
				rankedModel(`provider/low-${index}`, `Low ${index}`, 30 - index),
			),
		],
		(model) => model,
		30,
	)
		.slice(0, 2)
		.map((model) => model.id),
	["provider/high", "provider/mid"],
	"model limit should prefer the highest intelligence scores",
);

const modelLimitedVariants = limitByIntelligenceScore(
	[
		{ ...rankedModel("provider/a", "A", 90), reasoning_effort: "max" },
		{ ...rankedModel("provider/a", "A", 80), reasoning_effort: "high" },
		...Array.from({ length: 29 }, (_, index) =>
			rankedModel(
				`provider/included-${index}`,
				`Included ${index}`,
				70 - index,
			),
		),
		rankedModel("provider/excluded", "Excluded", 1),
	],
	(model) => model,
	30,
);
assert.equal(
	modelLimitedVariants.length,
	31,
	"model limits should select models before expanding their variants",
);
assert.deepEqual(
	modelLimitedVariants.slice(0, 2).map((model) => modelDisplayName(model)),
	["A (max)", "A (high)"],
);
assert.equal(
	modelLimitedVariants.some((model) => model.id === "provider/excluded"),
	false,
);

const providerModelOptions = providerOptions([
	{
		...rankedModel("openai/reasoner", "Reasoner", 100),
		provider: "OpenAI",
		reasoning_effort: "max",
	},
	{
		...rankedModel("openai/reasoner", "Reasoner", 95),
		provider: "OpenAI",
		reasoning_effort: "high",
	},
	{
		...rankedModel("openai/utility", "Utility", 0),
		provider: "OpenAI",
	},
	{ ...rankedModel("anthropic/first", "First", 60), provider: "Anthropic" },
	{ ...rankedModel("anthropic/second", "Second", 55), provider: "Anthropic" },
]);
assert.equal(
	providerModelOptions.find((option) => option.slug === "openai")?.count,
	2,
	"provider counts should count models instead of variants",
);

const providerAliasOptions = providerOptions([
	{ ...rankedModel("meta/llama-alpha", "Llama Alpha", 80), provider: "Meta" },
	{
		...rankedModel("meta-llama/llama-beta", "Llama Beta", 70),
		provider: "Meta-Llama",
	},
	{
		...rankedModel("mistral/large", "Mistral Large", 75),
		provider: "Mistral",
	},
	{
		...rankedModel("mistralai/small", "Mistral Small", 65),
		provider: "MistralAI",
	},
]);
assert.deepEqual(
	providerAliasOptions
		.filter((option) => option.slug === "meta" || option.slug === "mistral")
		.map(({ slug, label, count }) => ({ slug, label, count }))
		.sort((left, right) => left.slug.localeCompare(right.slug)),
	[
		{ slug: "meta", label: "Meta", count: 2 },
		{ slug: "mistral", label: "Mistral", count: 2 },
	],
	"provider aliases should share one filter option and canonical label",
);
assert.equal(
	providerModelOptions[0]?.slug,
	"anthropic",
	"provider ordering should score each model once instead of overweighting variants",
);

assert.deepEqual(toggleProviderFilter([], "openai"), ["openai"]);
assert.deepEqual(toggleProviderFilter(["openai"], "anthropic"), [
	"openai",
	"anthropic",
]);
assert.deepEqual(toggleProviderFilter(["openai", "anthropic"], "openai"), [
	"anthropic",
]);
assert.deepEqual(
	filterByModelControls(
		[
			{ ...rankedModel("openai/first", "First", 90), provider: "OpenAI" },
			{
				...rankedModel("anthropic/second", "Second", 80),
				provider: "Anthropic",
			},
			{ ...rankedModel("google/third", "Third", 70), provider: "Google" },
		],
		(model) => model,
		{ providers: ["openai", "anthropic"], maxCost: "all" },
	).map((model) => model.id),
	["openai/first", "anthropic/second"],
	"provider filtering should include the union of every selected provider",
);

const modalityRows = dedupeDisplayModels([
	modalityModel("provider/text", "Text", ["text"]),
	modalityModel("provider/vision", "Vision", ["text", "image"]),
	modalityModel("provider/all", "All", ["text", "image", "audio", "video"]),
]);

assert.deepEqual(
	sortedRows(modalityRows, "", sortState("modalities", "descending")).map(
		(row) => row.model.id,
	),
	["provider/all", "provider/vision", "provider/text"],
	"input modality sort should order by capability coverage, not icon label text",
);

assert.deepEqual(
	dedupeDisplayModels([
		rankedModel("mistral/mistral-medium-3.5", "Mistral Medium Latest", 90),
		rankedModel("mistralai/mistral-medium-3.5", "Mistral Medium 3.5", 60),
	]).map((row) => row.model.id),
	["mistral/mistral-medium-3.5"],
	"display dedupe should collapse provider ids that only differ by a trailing ai suffix when the slug family matches",
);

assert.equal(
	cacheBustedPath("/api/llm-stats?view=dashboard").startsWith(
		"/api/llm-stats?view=dashboard&reload=",
	),
	true,
	"cache busting should preserve existing query params",
);

const effortVariants = [
	{
		...rankedModel("provider/reasoner", "Reasoner", 80),
		reasoning_effort: "high",
	},
	{
		...rankedModel("provider/reasoner", "Reasoner", 90),
		reasoning_effort: "max",
	},
];
assert.equal(canonicalReasoningEffort("null"), null);
assert.equal(canonicalReasoningEffort(null), null);
assert.equal(canonicalReasoningEffort("non-reasoning"), "none");
assert.equal(
	modelDisplayName({
		...rankedModel("provider/reasoner", "Reasoner", 80),
		reasoning_effort: "none",
	}),
	"Reasoner (none)",
	"none should remain the canonical display label",
);
assert.deepEqual(
	modelsForVariantDisplay(effortVariants, false).map((model) => [
		modelDisplayName(model),
		model.scores.intelligence_score,
	]),
	[["Reasoner", 90]],
	"collapsed mode should keep the strongest variant and omit its effort label",
);
const searchableVariant = {
	...rankedModel("provider/reasoner", "Reasoner", 90),
	provider: "Example Provider",
	reasoning_effort: "max",
};
assert.equal(
	modelMatchesQuery(searchableVariant, "reasoner max"),
	true,
	"model search should include the visible reasoning variant label",
);
assert.equal(
	modelMatchesQuery(searchableVariant, "unrelated"),
	false,
	"model search should reject unrelated identity text",
);
assert.deepEqual(
	dedupeDisplayModels(modelsForVariantDisplay(effortVariants, true)).map(
		(row) => modelDisplayName(row.model),
	),
	["Reasoner (high)", "Reasoner (max)"],
	"expanded mode should preserve and label each reasoning effort as a model variant",
);
assert.deepEqual(
	modelsForVariantDisplay(
		[
			rankedModel("alibaba/qwen3.6-plus", "Qwen 3.6 Plus", 40),
			rankedModel("qwen/qwen3.6-plus", "Qwen 3.6 Plus", 50),
		],
		true,
	).map((model) => model.id),
	["qwen/qwen3.6-plus"],
	"expanded mode should not present provider aliases as model variants",
);

function rankedModel(
	id: string,
	name: string,
	intelligenceScore: number,
): LlmStatsModel {
	const model = minimalLlmStatsModel({ id, name });
	return {
		...model,
		scores: {
			...model.scores,
			intelligence_score: intelligenceScore,
		},
	};
}

function modalityModel(
	id: string,
	name: string,
	input: string[],
): LlmStatsModel {
	return {
		...minimalLlmStatsModel({ id, name }),
		modalities: {
			input,
		},
	};
}

function sortState(key: SortState["key"], direction: SortState["direction"]) {
	return { key, direction };
}
