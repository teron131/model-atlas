/** Verifies ALE-Bench raw evidence, source-default scoring, and normalized resource persistence. */

import assert from "node:assert/strict";
import { processAleBenchSakanaPayload } from "../src/model-atlas/benchmarks/scrapers/ale-bench";
import { readDatabasePayload } from "../src/model-atlas/database";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import { readAleBenchRawCache } from "../src/model-atlas/ingest/cache";
import { SNAPSHOT_TABLES } from "../src/model-atlas/ingest/source-registry";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import {
	insertBenchmarkRawRows,
	insertModelBenchmarks,
	insertModels,
	insertModelTaskMetrics,
} from "../src/model-atlas/ingest/writers";
import { benchmarkRowsFromDb } from "../src/model-atlas/pipeline/benchmark-rows";
import { benchmarkObservationRowGroups } from "./model-atlas-fixtures";

function statistics(mean: number) {
	return {
		all: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
		short: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
		long: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
	};
}

function configuration(numSelfRefine: number, performance: number) {
	return {
		num_self_refine: numSelfRefine,
		rank: statistics(10),
		performance: statistics(performance),
		input_tokens: statistics(1_000),
		output_tokens: statistics(2_000),
		total_tokens: statistics(3_000),
		cost: statistics(0.3),
		results: [
			{
				problem_id: "ahc001",
				code_language: "cpp20",
				overall_judge_result: "ACCEPTED",
				overall_absolute_score: 1,
				overall_relative_score: 2,
				max_execution_time_ms: 3,
				max_memory_usage_kib: 4,
				rank: 5,
				performance,
				input_tokens: 1_000,
				output_tokens: 2_000,
				total_tokens: 3_000,
				cost: 0.3,
			},
		],
	};
}

const rows = processAleBenchSakanaPayload([
	{
		model_name: "example-model-high",
		detail_path: "data/example-model-high.json",
		overall_results: [configuration(1, 700), configuration(2, 750)],
	},
]);
const snapshots = {
	aleBenchConfigurationRows: rows,
	fetchedAt: { aleBench: 1_800_000_000 },
} satisfies Pick<SourceSnapshots, "aleBenchConfigurationRows"> & {
	fetchedAt: Pick<SourceSnapshots["fetchedAt"], "aleBench">;
};
const databasePath = ".cache/test-database-ale-bench.sqlite";

await removeDatabaseFiles(databasePath);
try {
	const db = await openDatabase(databasePath);
	try {
		db.prepare(
			"INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)",
		).run(1_800_000_001);
		insertBenchmarkRawRows(
			db,
			snapshots as unknown as SourceSnapshots,
			SNAPSHOT_TABLES.ale_bench,
		);
		const rawRows = db
			.prepare("SELECT * FROM ale_bench_raw_rows ORDER BY row_index")
			.all();
		assert.equal(rawRows.length, 2);
		assert.equal(rawRows[0]?.base_model, "example-model");
		assert.equal(rawRows[0]?.reasoning_effort, "high");
		assert.equal(rawRows[0]?.performance_mean, 700);
		assert.equal(rawRows[0]?.performance_median, 699);
		assert.equal(rawRows[0]?.cost_per_task_usd, 0.3);
		assert.equal(rawRows[0]?.tokens_per_task, 3_000);
		assert.deepEqual(readAleBenchRawCache(db), {
			rows,
			fetchedAt: 1_800_000_000,
		});

		const benchmarkRows = benchmarkRowsFromDb({
			artificialAnalysisRows: [],
			agentArenaRows: [],
			agentsLastExamRows: [],
			aleBenchRows: rawRows,
			blueprintBenchRows: [],
			...benchmarkObservationRowGroups(),
			cursorBenchRows: [],
			deepSWERows: [],
			frontierCodeRows: [],
			gdpPdfRows: [],
			harveyLabRows: [],
			riemannBenchRows: [],
			terminalBenchRows: [],
			valsIndexRows: [],
			vendingBench2Rows: [],
		});
		assert.deepEqual(benchmarkRows.ale_bench, [
			{
				id: "example-model",
				label: "example-model",
				provider: null,
				value: 700,
			},
		]);

		const finalRows = [
			{
				id: "example/example-model",
				provider: "example",
				name: "Example Model",
				reasoning_effort: "high",
				logo: "https://example.com/logo.svg",
				modalities: { input: ["text"] },
				benchmarks: { ale_bench: 700 },
				task_metrics: {
					ale_bench: {
						cost: 0.3,
						tokens: 3_000,
						input_tokens: 1_000,
						output_tokens: 2_000,
					},
				},
				component_scores: {
					intelligence_score: 70,
					agentic_score: 80,
					speed_score: 60,
				},
				scores: {
					intelligence_score: 70,
					agentic_score: 80,
					speed_score: 60,
					value_score: 65,
				},
			},
		];
		insertModels(db, finalRows);
		insertModelBenchmarks(db, finalRows);
		insertModelTaskMetrics(db, finalRows);
	} finally {
		db.close();
	}

	const payload = readDatabasePayload(databasePath);
	const model = payload.models[0];
	assert.equal(model?.benchmarks?.ale_bench, 700);
	assert.deepEqual(model?.task_metrics?.ale_bench, {
		cost: 0.3,
		tokens: 3_000,
		input_tokens: 1_000,
		output_tokens: 2_000,
	});
	assert.deepEqual(payload.metadata.scoring.benchmark_portfolio.ale_bench, {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0.4, agentic: 0.6 },
		resourcePolicy: {
			source: "benchmark",
			unit: "per_task",
			tokenMeasure: "tokens",
			qualityCoordinate: "linear",
		},
	});
	assert.equal(
		payload.metadata.scoring.selected_benchmark_keys.includes("ale_bench"),
		true,
	);
} finally {
	await removeDatabaseFiles(databasePath);
}
