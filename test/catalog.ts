/** Verifies model-catalog identity, inclusion, alias collapse, and basic-spec admission. */

import assert from "node:assert/strict";

import { STAGE_CONFIG } from "../src/model-atlas/constants";
import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import { canonicalModelKey } from "../src/model-atlas/shared";
import { buildModelCatalogRows } from "../src/model-atlas/stats/catalog";
import {
	hasRequiredBasicSpecs,
	hasRequiredBenchmarkCoverage,
	hasRequiredPublicScore,
} from "../src/model-atlas/stats/selection/builder";
import type {
	BenchmarkPortfolio,
	ScoringConfig,
} from "../src/model-atlas/stats/types";
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
			overall_score: 1,
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
			overall_score: 100,
		},
	}),
	false,
	"overall score should not satisfy the public score floor",
);

const coveragePortfolio = {
	intelligence_observed: {
		group: "baseline",
		benchmarkImportance: 0.35,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	intelligence_missing: {
		group: "baseline",
		benchmarkImportance: 0.65,
		dimensionLoadings: { intelligence: 1, agentic: 0 },
	},
	agentic_observed: {
		group: "baseline",
		benchmarkImportance: 0.35,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
	agentic_missing: {
		group: "baseline",
		benchmarkImportance: 0.65,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
	},
} satisfies BenchmarkPortfolio;
const coverageScoringConfig = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys: ["intelligence_observed", "intelligence_missing"],
	agenticBenchmarkKeys: ["agentic_observed", "agentic_missing"],
	benchmarkPortfolio: coveragePortfolio,
} satisfies ScoringConfig;
const coverageAdmissionConfig = {
	minimumObservedWeight: 0.35,
	minimumObservedBenchmarks: 2,
} as const;
const minimumCoverageModel = {
	...minimalLlmStatsModel({ id: "provider/model", name: "Model" }),
	evaluations: {
		intelligence_observed: 0.5,
		agentic_observed: 0.5,
	},
};
assert.equal(
	hasRequiredBenchmarkCoverage(
		minimumCoverageModel,
		coverageScoringConfig,
		coverageAdmissionConfig,
	),
	true,
	"two observed benchmarks covering 35% of portfolio importance should be visible",
);
assert.equal(
	hasRequiredBenchmarkCoverage(
		minimumCoverageModel,
		{
			...coverageScoringConfig,
			benchmarkPortfolio: {
				...coveragePortfolio,
				intelligence_observed: {
					...coveragePortfolio.intelligence_observed,
					benchmarkImportance: 0.349,
				},
				intelligence_missing: {
					...coveragePortfolio.intelligence_missing,
					benchmarkImportance: 0.651,
				},
				agentic_observed: {
					...coveragePortfolio.agentic_observed,
					benchmarkImportance: 0.349,
				},
				agentic_missing: {
					...coveragePortfolio.agentic_missing,
					benchmarkImportance: 0.651,
				},
			},
		},
		coverageAdmissionConfig,
	),
	false,
	"portfolio coverage below 35% should be hidden",
);
assert.equal(
	hasRequiredBenchmarkCoverage(minimumCoverageModel, coverageScoringConfig, {
		...coverageAdmissionConfig,
		minimumObservedBenchmarks: 3,
	}),
	false,
	"weighted coverage should not replace the minimum benchmark count",
);
assert.equal(
	hasRequiredBenchmarkCoverage(
		minimumCoverageModel,
		{
			...coverageScoringConfig,
			benchmarkPortfolio: Object.fromEntries(
				Object.entries(coveragePortfolio).map(([key, entry]) => [
					key,
					{
						...entry,
						dimensionLoadings: { intelligence: 1, agentic: 0 },
					},
				]),
			) as BenchmarkPortfolio,
		},
		coverageAdmissionConfig,
	),
	true,
	"dimension loadings should not affect benchmark data sufficiency",
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
