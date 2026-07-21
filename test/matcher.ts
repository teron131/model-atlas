/** Verifies model identity matching, provider preference, and benchmark attachment. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { buildDebugTraceRows } from "../src/model-atlas/database/debug-trace";
import type { SourceSnapshots } from "../src/model-atlas/database/types";
import { buildMatchDiagnostics } from "../src/model-atlas/matcher";
import { modelNameIdentityKey } from "../src/model-atlas/matcher/name-tokens";
import { runMatcher } from "../src/model-atlas/matcher/pipeline";
import type {
	MatcherSourceModel,
	ModelsDevModel,
	PreferredProviderPools,
} from "../src/model-atlas/matcher/types";
import {
	type ArtificialAnalysisEvaluationResourceRow,
	buildArtificialAnalysisDefaultEffortResourceMap,
	buildArtificialAnalysisObservationResourceMap,
} from "../src/model-atlas/scrapers/artificial-analysis/benchmark-resources";
import { buildBlueprintBenchMap } from "../src/model-atlas/scrapers/blueprint-bench";
import { buildCursorBenchMap } from "../src/model-atlas/scrapers/cursorbench";
import { buildGdpPdfMap } from "../src/model-atlas/scrapers/surge/gdp-pdf";
import { buildRiemannBenchMap } from "../src/model-atlas/scrapers/surge/riemann-bench";
import { buildToolathlonMap } from "../src/model-atlas/scrapers/toolathlon";
import {
	buildValsIndexMap,
	type ValsIndexModelScoreRow,
} from "../src/model-atlas/scrapers/vals/index-benchmark";
import { buildTerminalBenchMap } from "../src/model-atlas/scrapers/vals/terminal-bench";
import { enrichModelRowsWithBenchmarks } from "../src/model-atlas/stats/benchmarks";
import { deriveModelStats } from "../src/model-atlas/stats/derivation";
import { modelRowsFromMatchDiagnostics } from "../src/model-atlas/stats/matching";
import { aggregateCollapsedModelRows } from "../src/model-atlas/stats/openrouter-enrichment";
import type { LlmStatsSourceData } from "../src/model-atlas/stats/types";

const sourceRows: MatcherSourceModel[] = [
	source("example-medium-3-5", "Example Medium 3.5"),
	source("example-medium-3", "Example Medium 3"),
];

assert.equal(
	modelNameIdentityKey("google/gemini-3-flash-preview"),
	modelNameIdentityKey("Gemini 3 Flash"),
);
assert.notEqual(
	modelNameIdentityKey("google/gemini-3.1-pro-preview"),
	modelNameIdentityKey("Gemini 3.5 Pro"),
);

const providerPools: PreferredProviderPools = {
	primary: [
		model("openrouter", "example/example-medium-3-5", "Example Medium 3.5"),
		model("openrouter", "example/example-medium-3.1", "Example Medium 3.1"),
	],
	fallback: [
		model("fallback", "example/example-medium-3.5", "Example Medium Latest"),
	],
};

const preferredProviderOutput = runMatcher(
	sourceRows,
	providerPools,
	5,
	STAGE_CONFIG.matcher,
);

assert.equal(
	preferredProviderOutput.models[0]?.best_match?.provider_id,
	"openrouter",
	"OpenRouter should remain the preferred identity even when fallback providers expose an exact slug",
);
assert.equal(
	preferredProviderOutput.models[0]?.best_match?.model_id,
	"example/example-medium-3-5",
);
assert.equal(
	preferredProviderOutput.models[1]?.best_match,
	null,
	"an older numeric version should not match a newer OpenRouter sibling when the exact row is absent",
);

const exactFallbackOutput = runMatcher(
	[source("claude-fable-5", "anthropic/claude-fable-5")],
	{
		primary: [
			model(
				"openrouter",
				"~anthropic/claude-fable-latest",
				"Claude Fable Latest",
			),
		],
		fallback: [model("anthropic", "claude-fable-5", "Claude Fable 5")],
	},
	5,
	STAGE_CONFIG.matcher,
);

assert.equal(
	exactFallbackOutput.models[0]?.best_match?.provider_id,
	"anthropic",
	"an exact trusted-provider row should beat a weak OpenRouter latest alias",
);
assert.equal(
	exactFallbackOutput.models[0]?.best_match?.model_id,
	"claude-fable-5",
);

const unsafeVersionOutput = runMatcher(
	[source("grok-4-20-0309", "Grok 4.20")],
	{
		primary: [model("openrouter", "x-ai/grok-4.5", "Grok 4.5")],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	unsafeVersionOutput.models[0]?.best_match,
	null,
	"different secondary version numbers must not attach to a nearby model",
);

const reorderedClaudeOutput = runMatcher(
	[source("claude-3-opus", "Claude 3 Opus")],
	{
		primary: [
			model("openrouter", "anthropic/claude-3-haiku", "Claude 3 Haiku"),
			model("openrouter", "anthropic/claude-opus-3", "Claude Opus 3"),
		],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	reorderedClaudeOutput.models[0]?.best_match?.model_id,
	"anthropic/claude-opus-3",
	"Claude tier and version identity should survive historical token reordering",
);

const compactClaudeVersionOutput = runMatcher(
	[source("claude-35-sonnet", "Claude 3.5 Sonnet")],
	{
		primary: [
			model("openrouter", "anthropic/claude-sonnet-3.5", "Claude Sonnet 3.5"),
		],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	compactClaudeVersionOutput.models[0]?.best_match?.model_id,
	"anthropic/claude-sonnet-3.5",
	"Claude's legacy compact 35 token should normalize to version 3.5",
);

const missingClaudeTierOutput = runMatcher(
	[source("claude-3-opus", "Claude 3 Opus")],
	{
		primary: [
			model("openrouter", "anthropic/claude-3-haiku", "Claude 3 Haiku"),
		],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	missingClaudeTierOutput.models[0]?.best_match,
	null,
	"Claude rows should remain unmatched when only a different tier is available",
);

const missingScaleOutput = runMatcher(
	[source("qwen3-5-2b", "Qwen3.5 2B")],
	{
		primary: [model("openrouter", "alibaba/qwen3.5-plus", "Qwen3.5 Plus")],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	missingScaleOutput.models[0]?.best_match,
	null,
	"parameter-scale source rows must not attach to an unscaled catalog model",
);

const lowerValidVariantOutput = runMatcher(
	[source("example-3-flash", "Example 3 Flash")],
	{
		primary: [
			model("openrouter", "google/example-3", "Example 3 Flash"),
			model("openrouter", "google/example-3-flash-preview", "Example Preview"),
		],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.deepEqual(
	lowerValidVariantOutput.models[0]?.candidates.map(
		(candidate) => candidate.model_id,
	),
	["google/example-3", "google/example-3-flash-preview"],
	"diagnostics should retain the higher-ranked variant conflict",
);
assert.equal(
	lowerValidVariantOutput.models[0]?.best_match?.model_id,
	"google/example-3-flash-preview",
	"the matcher should select the first variant-compatible candidate",
);
assert.equal(lowerValidVariantOutput.matchedCount, 1);

const effortDiagnostics = buildMatchDiagnostics({
	matcherConfig: STAGE_CONFIG.matcher,
	scrapedRows: [
		{
			model_id: "example/example-3-max",
			name: "Example 3 Max Effort",
		},
	],
	modelsDevModels: [
		model("openrouter", "example/example-3", "Example 3"),
		model("openrouter", "example/example-3-preview", "Example 3 Preview"),
	],
});
const effortDiagnostic = effortDiagnostics.models[0];
assert.equal(
	effortDiagnostic?.best_match?.model_id,
	"example/example-3",
	"reasoning-effort suffixes should not be treated as model-variant labels",
);
assert.equal(effortDiagnostic?.artificial_analysis_id, "example/example-3-max");
assert.equal(
	effortDiagnostic?.artificial_analysis_name,
	"Example 3 Max Effort",
);
const effortTraceRows = buildDebugTraceRows(
	{
		artificialAnalysisSelectedRows: [
			{
				model_id: "example/example-3-max",
				name: "Example 3 Max Effort",
			},
		],
		modelsDevPayload: {},
	} as unknown as SourceSnapshots,
	null,
	effortDiagnostics,
	STAGE_CONFIG.matcher,
);
assert.equal(
	effortTraceRows.find(
		(row) => row.candidate_model_id === "example/example-3-preview",
	)?.rejection_reason,
	"lower_rank",
	"debug traces should use the same effort-normalized variant identity as selection",
);
assert.equal(
	effortTraceRows[0]?.artificial_analysis_id,
	"example/example-3-max",
);
assert.equal(
	effortTraceRows[0]?.artificial_analysis_name,
	"Example 3 Max Effort",
);

const allVariantConflictsOutput = runMatcher(
	[source("example-3-pro", "Example 3 Pro")],
	{
		primary: [model("openrouter", "google/example-3", "Example 3 Pro")],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	allVariantConflictsOutput.models[0]?.best_match,
	null,
	"the matcher decision must agree with downstream selection when every candidate has a variant conflict",
);
assert.equal(allVariantConflictsOutput.preVoidMatchedCount, 0);
assert.equal(allVariantConflictsOutput.matchedCount, 0);
assert.equal(allVariantConflictsOutput.unmatchedCount, 1);
assert.equal(
	allVariantConflictsOutput.models[0]?.candidates.length,
	1,
	"rejected candidates should remain available for diagnostics",
);

for (const [sourceSlug, sourceName, candidateId, candidateName] of [
	[
		"qwen3-30b-a3b-instruct",
		"Qwen3 30B A3B Instruct",
		"qwen/qwen3-vl-30b-a3b-instruct",
		"Qwen3 VL 30B A3B Instruct",
	],
	[
		"qwen2-5-32b-instruct",
		"Qwen2.5 32B Instruct",
		"qwen/qwen-2.5-coder-32b-instruct",
		"Qwen2.5 Coder 32B Instruct",
	],
	[
		"granite-4-0-h-small",
		"Granite 4.0 H Small",
		"ibm-granite/granite-4.0-h-micro",
		"Granite 4.0 H Micro",
	],
	[
		"deepseek-v3-2-0925",
		"DeepSeek V3.2 0925",
		"deepseek/deepseek-v3",
		"DeepSeek V3 0324",
	],
] as const) {
	const conflictOutput = runMatcher(
		[source(sourceSlug, sourceName)],
		{
			primary: [model("openrouter", candidateId, candidateName)],
			fallback: [],
		},
		5,
		STAGE_CONFIG.matcher,
	);
	assert.equal(
		conflictOutput.models[0]?.best_match,
		null,
		`${sourceSlug} must not match a different model configuration or version`,
	);
}

const exactVisionLanguageOutput = runMatcher(
	[source("qwen3-vl-30b-a3b-instruct", "Qwen3 VL 30B A3B Instruct")],
	{
		primary: [
			model(
				"openrouter",
				"qwen/qwen3-vl-30b-a3b-instruct",
				"Qwen3 VL 30B A3B Instruct",
			),
		],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	exactVisionLanguageOutput.models[0]?.best_match?.model_id,
	"qwen/qwen3-vl-30b-a3b-instruct",
	"an exact vision-language identity should remain matchable",
);

const unversionedCurrentModelOutput = runMatcher(
	[
		source("alpha-beta-charlie-delta", "Alpha Beta Charlie Delta"),
		source("muse-spark", "Muse Spark"),
		source("claude-fable-5", "Claude Fable 5"),
	],
	{
		primary: [
			model("openrouter", "test/alpha-z", "Alpha Z"),
			model("vercel", "meta/muse-spark-1.1", "Muse Spark 1.1"),
			model("openrouter", "anthropic/claude-fable-5", "Claude Fable 5"),
		],
		fallback: [],
	},
	5,
	STAGE_CONFIG.matcher,
);
assert.equal(
	unversionedCurrentModelOutput.models[1]?.best_match?.model_id,
	"meta/muse-spark-1.1",
	"an unversioned source family should match its current versioned catalog row",
);

const sourceData = modelStatsSourceData([
	sourceModel("google/example-2-5-flash", 20, "high", 0.4),
	sourceModel("google/example-2-5-flash-non-reasoning", 10, "none", 0.1),
	sourceModel("google/example-3-pro", 50),
]);
const matchDiagnostics = buildMatchDiagnostics({
	matcherConfig: STAGE_CONFIG.matcher,
	scrapedRows: sourceData.artificialAnalysis.rows,
	modelsDevModels: sourceData.modelsDev.rows,
});
const sharedDerivation = await deriveModelStats(sourceData, {
	loadOpenRouter: async (modelIds) => {
		assert.deepEqual(modelIds, [
			"google/example-2.5-flash",
			"google/example-2.5-flash-lite",
			"~google/example-pro-latest",
		]);
		return {
			rawPayload: null,
			cacheStatus: "cached",
		};
	},
});
assert.deepEqual(
	sharedDerivation.matchDiagnostics,
	matchDiagnostics,
	"live and persisted derivation should consume the same finalized matcher decisions",
);
assert.equal(sharedDerivation.openRouterLoad.cacheStatus, "cached");
const unmatchedProDiagnostics = matchDiagnostics.models.find(
	(model) => model.artificial_analysis_slug === "example-3-pro",
);
assert.equal(
	unmatchedProDiagnostics?.best_match,
	null,
	"diagnostics must not count a row that stats selection rejects for variant conflicts",
);
assert.equal(matchDiagnostics.matched_count, 2);
assert.equal(matchDiagnostics.unmatched_count, 1);
assert.ok(
	unmatchedProDiagnostics != null &&
		unmatchedProDiagnostics.candidates.length > 0,
	"variant-rejected candidates should remain inspectable",
);
const unmatchedProTraceRows = buildDebugTraceRows(
	{
		artificialAnalysisSelectedRows: [],
		modelsDevPayload: {},
	} as unknown as SourceSnapshots,
	null,
	matchDiagnostics,
	STAGE_CONFIG.matcher,
).filter((row) => row.artificial_analysis_slug === "example-3-pro");
assert.ok(unmatchedProTraceRows.length > 0);
assert.equal(
	unmatchedProTraceRows.some((row) => row.selected),
	false,
	"debug traces should consume the finalized matcher decision",
);
assert.equal(
	unmatchedProTraceRows.every(
		(row) => row.rejection_reason === "variant_conflict",
	),
	true,
	"debug traces should explain matcher-owned variant rejections",
);
const matchedRows = modelRowsFromMatchDiagnostics(sourceData, matchDiagnostics);
const matchedFlashRow = matchedRows.find(
	(row) => row.artificial_analysis_id === "google/example-2-5-flash",
);
const aggregatedFlashModel = enrichModelRowsWithBenchmarks(
	aggregateCollapsedModelRows(matchedRows),
	sourceData,
).find((row) => row.id === "google/example-2.5-flash");
const noneEffortObservation = matchedRows.find(
	(row) =>
		row.artificial_analysis_id === "google/example-2-5-flash-non-reasoning",
);

assert.equal(
	matchedFlashRow?.id,
	"google/example-2.5-flash",
	"an exact OpenRouter route should win over flash-lite or image siblings",
);
assert.equal(
	matchedRows.some(
		(row) => row.artificial_analysis_id === "google/example-3-pro",
	),
	false,
	"image and latest routes should not stand in for a base source row",
);
assert.equal(
	asEvaluations(matchedFlashRow).toolathlon,
	undefined,
	"aggregate benchmarks should not enter effort observations",
);
assert.equal(
	asEvaluations(aggregatedFlashModel).toolathlon,
	0.42,
	"Toolathlon scores should attach through the aggregate benchmark layer",
);
assert.equal(
	asEvaluations(aggregatedFlashModel).cursorbench,
	0.58,
	"CursorBench scores should attach through the benchmark lookup path",
);
assert.equal(
	asEvaluations(aggregatedFlashModel).blueprint_bench_2,
	0.36,
	"Blueprint-Bench 2 scores should attach through display-name matching",
);
assert.equal(
	asEvaluations(aggregatedFlashModel).gdp_pdf,
	0.25,
	"GDP.pdf scores should attach through normalized display-name matching",
);
assert.equal(
	asEvaluations(aggregatedFlashModel).riemann_bench,
	0.31,
	"Riemann-bench scores should attach through normalized display-name matching",
);
assert.equal(
	asEvaluations(aggregatedFlashModel).vals_index,
	0.64,
	"Vals Index scores should attach through normalized model-id matching",
);
assert.equal(
	asScoringSources(matchedFlashRow).hle?.cost_per_task_usd,
	2,
	"AA resource rows should prefer exact source model id over a generic display-name match",
);
assert.equal(noneEffortObservation?.reasoning_effort, "none");
assert.equal(
	asScoringSources(noneEffortObservation).hle?.cost_per_task_usd,
	0.1,
	"matched effort rows should retain their exact resource observation",
);
assert.equal(asEvaluations(aggregatedFlashModel).hle, 0.4);
assert.equal(aggregatedFlashModel?.reasoning_effort, undefined);

function source(sourceSlug: string, sourceName: string): MatcherSourceModel {
	return {
		sourceId: sourceSlug,
		sourceSlug,
		sourceName,
		sourceReleaseDate: null,
	};
}

function model(
	providerId: string,
	modelId: string,
	modelName: string,
): ModelsDevModel {
	return {
		provider_id: providerId,
		provider_name: providerId,
		model_id: modelId,
		model: {
			id: modelId,
			name: modelName,
			modalities: {
				output: ["text"],
			},
		},
	} as ModelsDevModel;
}

function sourceModel(
	modelId: string,
	intelligenceIndex: number,
	reasoningEffort: string | null = null,
	hle = 0.4,
): Record<string, unknown> {
	return {
		model_id: modelId,
		reasoning_effort: reasoningEffort,
		intelligence: { intelligence_index: intelligenceIndex },
		evaluations: { hle },
		intelligence_index_cost: {},
	};
}

function modelStatsSourceData(
	artificialAnalysisRows: Record<string, unknown>[],
): LlmStatsSourceData {
	const toolathlonModelScoreRows = [
		{
			rank: 1,
			model: "Example 2.5 Flash",
			provider: "google",
			provider_name: "Google",
			score: 0.42,
			source_url: null,
			analysis_method: null,
			verified: false,
			self_reported: true,
			announcement_date: null,
		},
	];
	const cursorBenchModelScoreRows = [
		{
			rank: 1,
			model: "Example 2.5 Flash",
			base_model: "Example 2.5 Flash",
			reasoning_effort: null,
			score_eligible: true,
			score: 0.58,
			cost_per_task_usd: 1.25,
			tokens_per_task: 12_000,
			steps_per_task: 42,
		},
	];
	const blueprintBenchModelScoreRows = [
		{
			model: "Example 2.5 Flash",
			score: 0.36,
		},
	];
	const gdpPdfModelScoreRows = [
		{
			provider: "Google",
			model: "Example 2.5 Flash (High reasoning)",
			score: 0.25,
			last_updated: "06/06/2026",
		},
	];
	const riemannBenchModelScoreRows = [
		{
			provider: "Google",
			model: "Example 2.5 Flash (High reasoning)",
			score: 0.31,
			last_updated: "05/27/2026",
		},
	];
	const valsIndexModelScoreRows: ValsIndexModelScoreRow[] = [
		{
			task: "overall",
			task_label: "Overall",
			model_id: "google/example-2.5-flash",
			model: "example-2.5-flash",
			provider: "Google",
			score: 0.64,
		},
	];
	const artificialAnalysisResourceRows: ArtificialAnalysisEvaluationResourceRow[] =
		[
			{
				benchmark_key: "hle",
				source_url:
					"https://artificialanalysis.ai/evaluations/humanitys-last-exam",
				model_id: "google/example-2-5-flash",
				model: "Example 2.5 Flash (high)",
				provider: "Google",
				provider_id: "google",
				reasoning_effort: "high",
				score: 0.4,
				task_run_count: 2,
				cost_per_task_usd: 2,
				seconds_per_task: 20,
				tokens_per_task: 200,
				input_tokens_per_task: 80,
				output_tokens_per_task: 120,
				answer_tokens_per_task: 40,
				reasoning_tokens_per_task: 80,
			},
			{
				benchmark_key: "hle",
				source_url:
					"https://artificialanalysis.ai/evaluations/humanitys-last-exam",
				model_id: "google/example-2-5-flash-non-reasoning",
				model: "Example 2.5 Flash",
				provider: "Google",
				provider_id: "google",
				reasoning_effort: "none",
				score: 0.1,
				task_run_count: 2,
				cost_per_task_usd: 0.1,
				seconds_per_task: 2,
				tokens_per_task: 20,
				input_tokens_per_task: 8,
				output_tokens_per_task: 12,
				answer_tokens_per_task: 12,
				reasoning_tokens_per_task: 0,
			},
		];
	const modelsDevModels = [
		model(
			"openrouter",
			"google/example-2.5-flash-lite",
			"Example 2.5 Flash Lite",
		),
		model("openrouter", "google/example-2.5-flash-image", "Example Image"),
		model("openrouter", "google/example-2.5-flash", "Example 2.5 Flash"),
		model(
			"openrouter",
			"google/example-3-pro-image-preview",
			"Example Pro Image",
		),
		model("openrouter", "~google/example-pro-latest", "Example Pro Latest"),
	];
	const artificialAnalysisBySlug = new Map<string, Record<string, unknown>>();
	for (const row of artificialAnalysisRows) {
		const modelId = row.model_id;
		if (typeof modelId === "string") {
			artificialAnalysisBySlug.set(modelId.split("/").at(-1) ?? modelId, row);
		}
	}

	return {
		artificialAnalysis: {
			rows: artificialAnalysisRows,
			bySlug: artificialAnalysisBySlug,
		},
		artificialAnalysisEvaluationResources: {
			rows: artificialAnalysisResourceRows,
			observationByModelName: buildArtificialAnalysisObservationResourceMap(
				artificialAnalysisResourceRows,
			),
			defaultEffortByModelName: buildArtificialAnalysisDefaultEffortResourceMap(
				artificialAnalysisResourceRows,
			),
		},
		modelsDev: {
			rows: modelsDevModels,
			byId: new Map(
				modelsDevModels.map((modelsDevModel) => [
					modelsDevModel.model_id,
					modelsDevModel,
				]),
			),
		},
		agentArena: {
			rows: [],
			rowsByModelName: new Map(),
		},
		agentsLastExam: {
			rows: [],
			rowsByModelName: new Map(),
		},
		aleBench: {
			configurationRows: [],
			sourceDefaultRows: [],
			rowsByModelName: new Map(),
		},
		blueprintBench: {
			rows: blueprintBenchModelScoreRows,
			rowsByModelName: buildBlueprintBenchMap(blueprintBenchModelScoreRows),
		},
		browseComp: {
			rows: [],
			rowsByModelName: new Map(),
		},
		chartography: { rows: [], rowsByModelName: new Map() },
		chessPuzzles: { rows: [], rowsByModelName: new Map() },
		cursorBench: {
			rows: cursorBenchModelScoreRows,
			rowsByModelName: buildCursorBenchMap(cursorBenchModelScoreRows),
		},
		deepSWE: {
			effortRows: [],
			defaultEffortRows: [],
			rowsByModelName: new Map(),
		},
		ebrBench: { rows: [], rowsByModelName: new Map() },
		enterpriseBenchCoreCraft: { rows: [], rowsByModelName: new Map() },
		epochCapabilitiesIndex: { rows: [], rowsByModelName: new Map() },
		frontierCode: { rows: [], rowsByModelName: new Map() },
		frontierMathTier4: { rows: [], rowsByModelName: new Map() },
		gdpPdf: {
			rows: gdpPdfModelScoreRows,
			rowsByModelName: buildGdpPdfMap(gdpPdfModelScoreRows),
		},
		handbookMd: { rows: [], rowsByModelName: new Map() },
		harveyLab: { rows: [], rowsByModelName: new Map() },
		mercorApexAgents: {
			rows: [],
			rowsByModelName: new Map(),
		},
		proofBench: { rows: [], rowsByModelName: new Map() },
		riemannBench: {
			rows: riemannBenchModelScoreRows,
			rowsByModelName: buildRiemannBenchMap(riemannBenchModelScoreRows),
		},
		terminalBench: {
			rows: [],
			rowsByModelName: buildTerminalBenchMap([]),
		},
		toolathlon: {
			rows: toolathlonModelScoreRows,
			rowsByModelName: buildToolathlonMap(toolathlonModelScoreRows),
		},
		valsIndex: {
			rows: valsIndexModelScoreRows,
			rowsByModelName: buildValsIndexMap(valsIndexModelScoreRows),
		},
		vendingBench2: {
			rows: [],
			rowsByModelName: new Map(),
		},
		weirdMl: { rows: [], rowsByModelName: new Map() },
	};
}

function asEvaluations(
	row: Record<string, unknown> | undefined,
): Record<string, unknown> {
	return row?.evaluations && typeof row.evaluations === "object"
		? (row.evaluations as Record<string, unknown>)
		: {};
}

function asScoringSources(
	row: Record<string, unknown> | undefined,
): Record<string, ArtificialAnalysisEvaluationResourceRow> {
	return row?.scoring_sources && typeof row.scoring_sources === "object"
		? (row.scoring_sources as Record<
				string,
				ArtificialAnalysisEvaluationResourceRow
			>)
		: {};
}
