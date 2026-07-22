/** Verifies model-catalog identity, inclusion, alias collapse, and basic-spec admission. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/config";
import type { ScoringConfig } from "../src/model-atlas/config/stage";
import { canonicalModelKey } from "../src/model-atlas/identity/normalization";
import { buildModelCatalogRows } from "../src/model-atlas/pipeline/model-catalog";
import {
	hasRequiredBasicSpecs,
	hasRequiredBenchmarkEvidence,
	hasRequiredPublicScore,
} from "../src/model-atlas/pipeline/selection/builder";
import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import type { BenchmarkPortfolio } from "../src/model-atlas/stats/types";
import { minimalLlmStatsModel } from "./llm-stats-fixtures";

const sourceData = {
	modelsDev: {
		rows: [
			catalogModel("provider/family-1", "Family 1", "family"),
			catalogModel("provider/family-latest", "Family Latest", "family"),
			catalogModel("other", "Other", "other"),
			catalogModel("provider/other-image", "Other Image", "other-image"),
		],
		byId: new Map<string, ModelsDevFlatModel>(),
	},
};
const catalogRows = buildModelCatalogRows(sourceData, [
	{
		id: "provider/matched",
		name: "Matched",
		modalities: { output: ["text"] },
	},
	{
		id: "provider/matched-image",
		name: "Matched Image",
		modalities: { output: ["text"] },
	},
]);

assert.deepEqual(
	catalogRows.map((row) => row.id),
	["provider/matched", "provider/family-1", "provider/other"],
	"catalog policy should keep text models while excluding image labels and redundant latest aliases",
);

assert.equal(
	canonicalModelKey({ id: "alibaba/qwen3.6-plus", name: "Qwen 3.6 Plus" }),
	canonicalModelKey({ id: "qwen/qwen3.6-plus", name: "Qwen 3.6 Plus" }),
	"provider aliases with the same public model identity should share calibration mass",
);
assert.equal(
	canonicalModelKey({
		id: "anthropic/claude-opus-4.7",
		name: "Claude Opus 4.7",
	}),
	canonicalModelKey({
		id: "anthropic/claude-opus-4.7-fast",
		name: "Claude Opus 4.7 (Fast)",
	}),
	"configuration labels should remain variants of the same model",
);

const completeBasicSpecs = {
	id: "provider/model",
	name: "Model",
	release_date: "2026-01-01",
	modalities: { output: ["text"] },
	cost: { input: 1, output: 2 },
	context_window: { context: 100_000, output: 10_000 },
	speed: {
		throughput_tokens_per_second_median: 50,
		latency_seconds_median: 1,
		e2e_latency_seconds_median: 2,
	},
};
assert.equal(hasRequiredBasicSpecs(completeBasicSpecs), true);
assert.equal(
	hasRequiredBasicSpecs({
		...completeBasicSpecs,
		speed: {
			throughput_tokens_per_second_median: null,
			latency_seconds_median: null,
			e2e_latency_seconds_median: null,
		},
	}),
	false,
	"sparse core specs should not form a leaderboard model",
);

assert.equal(
	hasRequiredPublicScore({
		scores: {
			intelligence_score: 9,
			agentic_score: 9,
			speed_score: 10,
			value_score: 9,
		},
	}),
	true,
	"one qualifying primary score should satisfy the public score floor",
);
assert.equal(
	hasRequiredPublicScore({
		scores: {
			intelligence_score: 9,
			agentic_score: 9,
			speed_score: 9,
			value_score: 9,
		},
	}),
	false,
	"scores below the public floor should not qualify",
);

const evidencePortfolio = {
	intelligence_observed: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	intelligence_missing: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	agentic_observed: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	agentic_missing: {
		group: "baseline",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
} satisfies BenchmarkPortfolio;
const evidenceScoringConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["intelligence_observed", "intelligence_missing"],
	agenticBenchmarkKeys: ["agentic_observed", "agentic_missing"],
	benchmarkPortfolio: evidencePortfolio,
} satisfies ScoringConfig;
const benchmarkAdmissionConfig = {
	indexBenchmarkKeys: ["intelligence_observed"],
	minimumObservedBenchmarks: 2,
	minimumObservedBenchmarksPerDimension: 1,
} as const;
const minimumEvidenceModel = {
	...minimalLlmStatsModel({ id: "provider/model", name: "Model" }),
	evaluations: {
		intelligence_observed: 0.5,
		agentic_observed: 0.5,
	},
};
assert.equal(
	hasRequiredBenchmarkEvidence(
		minimumEvidenceModel,
		evidenceScoringConfig,
		benchmarkAdmissionConfig,
	),
	true,
	"observed evidence in both dimensions should be visible",
);
assert.equal(
	hasRequiredBenchmarkEvidence(
		{
			...minimumEvidenceModel,
			evaluations: { intelligence_observed: 0.5 },
		},
		evidenceScoringConfig,
		{ ...benchmarkAdmissionConfig, minimumObservedBenchmarks: 1 },
	),
	false,
	"intelligence-only evidence should be hidden",
);
assert.equal(
	hasRequiredBenchmarkEvidence(minimumEvidenceModel, evidenceScoringConfig, {
		...benchmarkAdmissionConfig,
		minimumObservedBenchmarks: 3,
	}),
	false,
	"dimension coverage should not replace the minimum benchmark count",
);
assert.equal(
	hasRequiredBenchmarkEvidence(
		{
			...minimumEvidenceModel,
			evaluations: { agentic_observed: 0.5 },
		},
		evidenceScoringConfig,
		{ ...benchmarkAdmissionConfig, minimumObservedBenchmarks: 1 },
	),
	false,
	"agentic-only evidence should be hidden",
);
assert.equal(
	hasRequiredBenchmarkEvidence(
		{
			...minimumEvidenceModel,
			evaluations: {
				intelligence_missing: 0.5,
				agentic_observed: 0.5,
			},
		},
		evidenceScoringConfig,
		benchmarkAdmissionConfig,
	),
	false,
	"models without an aggregate index should be hidden",
);
assert.equal(
	catalogRows.find((row) => row.id === "provider/other")?.openrouter_id,
	"provider/other",
	"catalog rows should carry the canonical qualified route into aggregation",
);

function catalogModel(
	id: string,
	name: string,
	family: string,
): ModelsDevFlatModel {
	return {
		provider_id: "provider",
		provider_name: "Provider",
		model_id: id,
		model: {
			id,
			name,
			family,
			modalities: { output: ["text"] },
		},
	};
}
