/** Verifies the benchmark factory's canonical projections and domain validation. */

import assert from "node:assert/strict";
import {
	type BenchmarkDefinitions,
	defineBenchmarks,
} from "../src/model-atlas/benchmarks/factory";
import {
	ARTIFICIAL_ANALYSIS_EVALUATION_KEY_BY_ALIAS,
	ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES,
	BENCHMARK_CATALOG,
	BENCHMARK_DISPLAY_KEYS,
	BENCHMARK_KEYS,
	BENCHMARK_OBSERVATION_BINDINGS,
	BENCHMARK_OBSERVATION_RAW_TABLE,
	BENCHMARK_RUNTIME_KEYS,
	transformBenchmarkSourceValue,
} from "../src/model-atlas/benchmarks/registry";
import {
	RAW_SOURCE_NAMES,
	RAW_SOURCE_TABLES,
} from "../src/model-atlas/ingest/source-registry";
import { BENCHMARK_RAW_WRITERS } from "../src/model-atlas/ingest/writers";

const definitions = {
	quality: {
		source: {
			inputs: [
				{
					group: "artificial_analysis",
					id: "artificial_analysis",
					roles: ["observation", "resource"],
				},
			],
		},
		processing: {
			transform: { kind: "identity" },
			aggregation: { kind: "direct" },
		},
		persistence: {
			location: { kind: "evaluation" },
			exposure: "public",
		},
		presentation: {
			title: "Quality Benchmark",
			label: "Quality",
			description: "Measures benchmark quality.",
			order: 20,
			column: {
				key: "quality",
				label: "Quality",
				format: "percent",
				defaultSort: "descending",
			},
		},
		scoring: {
			group: "frontier",
			benchmarkImportance: 1,
			dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
			normalization: { kind: "min_max", output: [0, 100] },
			imputation: { kind: "contextual" },
		},
		resources: {
			source: "artificial_analysis",
			unit: "per_task",
			tokenMeasure: "output_tokens",
		},
	},
	cost: {
		source: {
			inputs: [
				{ group: "sparse", id: "cost_creator", roles: ["observation"] },
				{ group: "epoch", id: "cost_mirror", roles: ["validation"] },
			],
		},
		processing: {
			transform: {
				kind: "linear",
				input: [0, 1_000],
				output: [0, 1],
				clamp: true,
			},
			aggregation: { kind: "mean" },
			sourceCrosswalk: { kind: "validated_merge" },
		},
		persistence: {
			location: { kind: "intelligence", field: "cost_index" },
			exposure: "internal",
		},
		presentation: {
			title: "Cost Benchmark",
			label: "Cost",
			description: "Measures benchmark cost.",
			order: 10,
			column: {
				key: "cost",
				label: "Cost",
				format: "currency",
				defaultSort: "ascending",
			},
		},
	},
} as const satisfies BenchmarkDefinitions;

const factory = defineBenchmarks(definitions);

assert.deepEqual(factory.scoredKeys, ["quality"]);
assert.deepEqual(factory.orderedKeys, ["cost", "quality"]);
assert.deepEqual(factory.portfolio, {
	quality: {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.75, agentic: 0.25 },
		resourcePolicy: {
			source: "artificial_analysis",
			unit: "per_task",
			tokenMeasure: "output_tokens",
		},
	},
});

assert.throws(
	() =>
		defineBenchmarks({
			invalid: {
				...definitions.quality,
				scoring: {
					...definitions.quality.scoring,
					dimensionLoadings: { intelligence: 0.8, agentic: 0.3 },
				},
			},
		}),
	/Dimension loadings must be finite, non-negative, and sum to one for invalid/,
);
assert.throws(
	() =>
		defineBenchmarks({
			invalid: {
				...definitions.quality,
				source: {
					inputs: [{ group: "sparse", id: "validator", roles: ["validation"] }],
				},
			},
		}),
	/Benchmark must declare an observation source for invalid/,
);
assert.throws(
	() =>
		defineBenchmarks({
			quality: {
				...definitions.quality,
				source: {
					inputs: [
						{
							...definitions.quality.source.inputs[0],
							runtime: { key: "shared_runtime", publicRows: true },
						},
					],
				},
			},
			cost: {
				...definitions.cost,
				source: {
					inputs: [
						{
							...definitions.cost.source.inputs[0],
							runtime: { key: "shared_runtime", publicRows: true },
						},
						definitions.cost.source.inputs[1],
					],
				},
			},
		}),
	/Benchmark source runtime key must be unique: shared_runtime/,
);
assert.throws(
	() =>
		defineBenchmarks({
			invalid: {
				...definitions.quality,
				scoring: {
					...definitions.quality.scoring,
					imputation: {
						kind: "additive_crosswalk",
						fallbackEvidenceKey: "missing_evidence",
						minimumModels: 3,
						maximumMedianAbsoluteError: 0.02,
						fallback: "contextual",
					},
				},
			},
		}),
	/Benchmark additive crosswalk requires a matching imputation source for invalid/,
);
assert.throws(
	() =>
		defineBenchmarks({
			invalid: {
				...definitions.quality,
				persistence: {
					location: { kind: "intelligence", field: "" },
					exposure: "public",
				},
			},
		}),
	/Benchmark intelligence field cannot be empty for invalid/,
);

assert.deepEqual(
	BENCHMARK_CATALOG.terminalbench_v21.source.inputs.map(
		({ group, id, roles }) => ({
			group,
			id,
			roles,
		}),
	),
	[
		{
			group: "artificial_analysis",
			id: "artificial_analysis",
			roles: ["observation", "resource"],
		},
		{ group: "vals", id: "vals", roles: ["observation", "resource"] },
	],
);
assert.deepEqual(BENCHMARK_CATALOG.ale_bench.source.inputs, [
	{
		group: "sparse",
		id: "sakana",
		roles: ["observation", "resource"],
		runtime: { key: "ale_bench", publicRows: true },
	},
	{ group: "epoch", id: "epoch", roles: ["validation"] },
]);
assert.deepEqual(
	BENCHMARK_CATALOG.apex_agents.source.inputs.map(
		({ group, id, roles, evidenceKey, runtime }) => ({
			group,
			id,
			roles,
			...(evidenceKey == null ? {} : { evidenceKey }),
			...(runtime == null ? {} : { runtime }),
		}),
	),
	[
		{
			group: "artificial_analysis",
			id: "artificial_analysis",
			roles: ["observation", "resource"],
		},
		{
			group: "sparse",
			id: "mercor",
			roles: ["imputation"],
			evidenceKey: "apex_agents_mercor",
			runtime: { key: "mercor_apex_agents", publicRows: false },
		},
	],
);
assert.deepEqual(
	BENCHMARK_CATALOG.weirdml.source.inputs.map(({ group, id, roles }) => ({
		group,
		id,
		roles,
	})),
	[
		{ group: "sparse", id: "weirdml", roles: ["observation"] },
		{
			group: "epoch",
			id: "epoch",
			roles: ["observation", "validation"],
		},
	],
);
assert.deepEqual(BENCHMARK_CATALOG.briefcase.processing, {
	transform: {
		kind: "linear",
		input: [500, 2_500],
		output: [0, 1],
		clamp: true,
	},
	aggregation: { kind: "direct" },
});
assert.equal(transformBenchmarkSourceValue("briefcase", 500), 0);
assert.equal(transformBenchmarkSourceValue("briefcase", 1_500), 0.5);
assert.equal(transformBenchmarkSourceValue("briefcase", 3_000), 1);
assert.deepEqual(BENCHMARK_CATALOG.terminalbench_v21.processing.aggregation, {
	kind: "custom",
});
assert.deepEqual(BENCHMARK_CATALOG.ale_bench.processing.sourceCrosswalk, {
	kind: "custom",
});
assert.deepEqual(BENCHMARK_CATALOG.weirdml.processing.sourceCrosswalk, {
	kind: "validated_merge",
});
assert.deepEqual(BENCHMARK_CATALOG.apex_agents.scoring.imputation, {
	kind: "additive_crosswalk",
	fallbackEvidenceKey: "apex_agents_mercor",
	minimumModels: 3,
	maximumMedianAbsoluteError: 0.02,
	clamp: [0, 1],
	fallback: "contextual",
});
assert.deepEqual(BENCHMARK_CATALOG.aa_intelligence_index.persistence, {
	location: { kind: "intelligence", field: "intelligence_index" },
	exposure: "public",
});
assert.deepEqual(BENCHMARK_CATALOG.agent_arena.persistence, {
	location: { kind: "evaluation" },
	exposure: "public",
});
assert.deepEqual(BENCHMARK_CATALOG.omniscience_accuracy.persistence, {
	location: { kind: "intelligence", field: "omniscience_accuracy" },
	exposure: "public",
});
assert.equal(
	ARTIFICIAL_ANALYSIS_EVALUATION_KEY_BY_ALIAS.terminalbenchV21,
	"terminalbench_v21",
);
assert.equal(
	ARTIFICIAL_ANALYSIS_EVALUATION_RESOURCE_PAGES.find(
		(page) => page.benchmarkKey === "briefcase",
	)?.secondsProcessor,
	"briefcase",
);
assert.deepEqual(
	BENCHMARK_OBSERVATION_BINDINGS.find(
		(binding) => binding.benchmark === "chartography",
	),
	{
		benchmark: "chartography",
		loader: {
			kind: "surge",
			sourceUrl: "https://surgehq.ai/benchmarks/chartography",
		},
		rawSourceKey: "chartography",
		rawTable: BENCHMARK_OBSERVATION_RAW_TABLE,
		source: "surge",
		sourceDataKey: "chartography",
		sourceRowsKey: "chartographyRows",
	},
);
assert.equal(BENCHMARK_DISPLAY_KEYS[0], "agent_arena");
assert.equal(BENCHMARK_DISPLAY_KEYS.at(-1), "weirdml");
assert.deepEqual(
	BENCHMARK_CATALOG.deep_swe.presentation.taskMetricColumns.map(
		({ key, metric }) => ({ key, metric }),
	),
	[
		{ key: "deepSWECost", metric: "cost" },
		{ key: "deepSWESeconds", metric: "seconds" },
		{ key: "deepSWETokens", metric: "output_tokens" },
	],
);
for (const key of BENCHMARK_KEYS) {
	assert.deepEqual(BENCHMARK_CATALOG[key].scoring.normalization, {
		kind: "min_max",
		output: [0, 100],
	});
}

for (const runtimeKey of BENCHMARK_RUNTIME_KEYS) {
	assert.ok(
		RAW_SOURCE_NAMES.includes(runtimeKey),
		`${runtimeKey} should be registered as a raw source`,
	);
	assert.equal(RAW_SOURCE_TABLES[runtimeKey], `${runtimeKey}_raw_rows`);
}
assert.equal(
	BENCHMARK_OBSERVATION_BINDINGS.find(
		({ benchmark }) => benchmark === "frontiermath_tier_4",
	)?.loader.kind,
	"epoch_runs",
);

const benchmarkRawWriterTables = BENCHMARK_RAW_WRITERS.map(
	({ table }) => table,
);
assert.equal(
	new Set(benchmarkRawWriterTables).size,
	benchmarkRawWriterTables.length,
	"benchmark raw tables should have one writer each",
);
assert.equal(
	benchmarkRawWriterTables.filter(
		(table) => table === BENCHMARK_OBSERVATION_RAW_TABLE,
	).length,
	1,
	"generic benchmark sources should share one raw-table writer",
);
