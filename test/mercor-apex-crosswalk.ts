/** Mercor APEX crosswalk fixtures protect overlap calibration, validation, and AA-first fallback. */

import assert from "node:assert/strict";
import { buildAdditiveSourceCrosswalk } from "../src/model-atlas/benchmarks/source-crosswalk";
import { STAGE_CONFIG } from "../src/model-atlas/config";
import { buildBenchmarkImputationByModel } from "../src/model-atlas/pipeline/scores";
import { asFiniteNumber, asRecord } from "../src/model-atlas/runtime";

function model(
	name: string,
	reasoningEffort: string | null,
	artificialAnalysis: number | null,
	mercor: number,
) {
	return {
		id: `test/${name.toLowerCase().replace(/\s+/g, "-")}`,
		name,
		reasoning_effort: reasoningEffort,
		benchmarks:
			artificialAnalysis == null ? {} : { apex_agents: artificialAnalysis },
		scoring_sources: {
			apex_agents_mercor: { score: mercor },
		},
	};
}

type TestModel = ReturnType<typeof model>;

function artificialAnalysisValue(candidate: TestModel): number | null {
	return asFiniteNumber(asRecord(candidate.benchmarks).apex_agents);
}

function mercorValue(candidate: TestModel): number | null {
	return asFiniteNumber(
		asRecord(asRecord(candidate.scoring_sources).apex_agents_mercor).score,
	);
}

const crosswalkOptions = {
	primaryValue: artificialAnalysisValue,
	fallbackValue: mercorValue,
	minimumEffectiveModels: 3,
	maximumMedianAbsoluteError: 0.02,
};

const glm = model("GLM-5.2", "max", 0.337020648967552, 0.356);
const gpt54 = model("GPT-5.4", "xhigh", 0.33259587020649, 0.349);
const gemini = model("Gemini 3.1 Pro", null, 0.320058997050148, 0.334);
const gpt55 = model("GPT-5.5", "xhigh", 0.376843657817109, 0.385);
const gpt56Max = model("GPT-5.6 Sol", "max", null, 0.399);
const lowMissing = model("Low Missing", null, null, 0);
const models = [glm, gpt54, gemini, gpt55, gpt56Max, lowMissing];
const crosswalk = buildAdditiveSourceCrosswalk(models, crosswalkOptions);

assert.equal(crosswalk.diagnostic.overlapModelCount, 4);
assert.equal(crosswalk.diagnostic.validationModelCount, 4);
assert.equal(crosswalk.diagnostic.imputationAllowed, true);
assert.ok(
	Math.abs((crosswalk.diagnostic.medianOffset ?? 0) - 0.015172566371681) <
		1e-12,
);
assert.ok(
	(crosswalk.diagnostic.validationMedianAbsoluteError ?? Infinity) < 0.005,
);
assert.ok(
	Math.abs(
		(crosswalk.projectionByItem.get(gpt56Max) ?? 0) - 0.383827433628319,
	) < 1e-12,
);
assert.equal(crosswalk.projectionByItem.has(glm), false);
assert.ok((crosswalk.projectionByItem.get(lowMissing) ?? 0) < 0);
assert.ok(Math.abs((crosswalk.confidence ?? 0) - 0.7695427728613522) < 1e-12);
const duplicatedFamilyCrosswalk = buildAdditiveSourceCrosswalk(
	[...models, model("GPT-5.5", "high", 0.376843657817109, 0.385)],
	crosswalkOptions,
);
assert.equal(duplicatedFamilyCrosswalk.diagnostic.overlapModelCount, 4);
assert.ok(
	Math.abs(
		(duplicatedFamilyCrosswalk.diagnostic.medianOffset ?? 0) -
			(crosswalk.diagnostic.medianOffset ?? 0),
	) < 1e-12,
);
const apexImputation = buildBenchmarkImputationByModel(
	models,
	STAGE_CONFIG.scoring,
);
assert.ok(
	Math.abs(
		(apexImputation.get(gpt56Max)?.get("apex_agents") ?? 0) - 0.383827433628319,
	) < 1e-12,
);
assert.equal(apexImputation.get(lowMissing)?.get("apex_agents"), 0);
const benchmarkPortfolioWithoutApex = Object.fromEntries(
	Object.entries(STAGE_CONFIG.scoring.benchmarkPortfolio).filter(
		([key]) => key !== "apex_agents",
	),
);
const scoringWithoutApex = {
	...STAGE_CONFIG.scoring,
	intelligenceBenchmarkKeys:
		STAGE_CONFIG.scoring.intelligenceBenchmarkKeys.filter(
			(key) => key !== "apex_agents",
		),
	agenticBenchmarkKeys: STAGE_CONFIG.scoring.agenticBenchmarkKeys.filter(
		(key) => key !== "apex_agents",
	),
	benchmarkPortfolio: benchmarkPortfolioWithoutApex,
};
assert.equal(
	buildBenchmarkImputationByModel(models, scoringWithoutApex)
		.get(gpt56Max)
		?.has("apex_agents") ?? false,
	false,
);

const rejected = buildAdditiveSourceCrosswalk(
	[
		model("Anchor A", "max", 0.1, 0.1),
		model("Anchor B", "max", 0.2, 0.22),
		model("Anchor C", "max", 0.3, 0.5),
		model("Missing", "max", null, 0.4),
	],
	crosswalkOptions,
);
assert.equal(rejected.diagnostic.imputationAllowed, false);
assert.equal(rejected.projectionByItem.size, 0);
