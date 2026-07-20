/** Verifies FrontierCode raw effort evidence, eligible Main scoring, and normalized resource persistence. */

import assert from "node:assert/strict";

import { readDatabasePayload } from "../src/model-atlas/database";
import { readFrontierCodeRawCache } from "../src/model-atlas/database/cache";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import type { SourceSnapshots } from "../src/model-atlas/database/types";
import {
	insertFrontierCodeRawRows,
	insertModelEvaluations,
	insertModels,
	insertModelTaskMetrics,
} from "../src/model-atlas/database/writers";
import { processFrontierCodePayload } from "../src/model-atlas/scrapers/frontier-code";
import { benchmarkRowsFromDb } from "../src/model-atlas/stats/benchmarks";

function metrics(score: number, cost: number, tokens: number) {
	return {
		correct: score + 0.05,
		new_score: score,
		cost,
		tokens,
		tool_calls: 18,
		steps: 12,
		ote: 2_000,
	};
}

const rows = processFrontierCodePayload({
	v1_1: {
		models: ["Claude Fable 5", "SWE-1.7"],
		efforts: {
			"Claude Fable 5": ["xhigh", "max"],
			"SWE-1.7": ["none"],
		},
		harness: {
			"Claude Fable 5": "claude-code",
			"SWE-1.7": "devin",
		},
		subsets: { main: 100, extended: 150 },
		data: {
			"Claude Fable 5": {
				xhigh: {
					main: metrics(0.535, 0.75, 4_500),
					extended: metrics(0.649, 0.9, 5_500),
				},
				max: {
					main: metrics(0.516, 0.8, 4_800),
					extended: metrics(0.636, 0.95, 5_800),
				},
			},
			"SWE-1.7": {
				none: {
					main: metrics(0.423, 0.5, 3_000),
					extended: metrics(0.546, 0.6, 3_500),
				},
			},
		},
	},
});
const snapshots = {
	frontierCodeRows: rows,
	fetchedAt: { frontierCode: 1_800_000_000 },
} satisfies Pick<SourceSnapshots, "frontierCodeRows"> & {
	fetchedAt: Pick<SourceSnapshots["fetchedAt"], "frontierCode">;
};
const databasePath = ".cache/test-database-frontier-code.sqlite";

await removeDatabaseFiles(databasePath);
try {
	const db = await openDatabase(databasePath);
	try {
		db.prepare(
			"INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)",
		).run(1_800_000_001);
		insertFrontierCodeRawRows(db, snapshots);
		const rawRows = db
			.prepare("SELECT * FROM frontier_code_raw_rows ORDER BY row_index")
			.all();
		assert.equal(rawRows.length, 3);
		assert.equal(rawRows[0]?.revision, "v1_1");
		assert.equal(rawRows[0]?.base_model, "Claude Fable 5");
		assert.equal(rawRows[0]?.reasoning_effort, "xhigh");
		assert.equal(rawRows[0]?.harness, "claude-code");
		assert.equal(rawRows[0]?.main_score, 0.535);
		assert.equal(rawRows[0]?.main_cost_per_task_usd, 0.75);
		assert.equal(rawRows[0]?.main_tokens_per_task, 4_500);
		assert.equal(rawRows[2]?.score_eligible, 0);
		assert.deepEqual(readFrontierCodeRawCache(db), {
			rows,
			fetchedAt: 1_800_000_000,
		});

		const benchmarkRows = benchmarkRowsFromDb({
			artificialAnalysisRows: [],
			agentArenaRows: [],
			agentsLastExamRows: [],
			aleBenchRows: [],
			blueprintBenchRows: [],
			browseCompRows: [],
			chartographyRows: [],
			chessPuzzleRows: [],
			cursorBenchRows: [],
			deepSWERows: [],
			ebrBenchRows: [],
			enterpriseBenchCoreCraftRows: [],
			epochCapabilitiesIndexRows: [],
			frontierCodeRows: rawRows,
			frontierMathTier4Rows: [],
			gdpPdfRows: [],
			handbookMdRows: [],
			proofBenchRows: [],
			riemannBenchRows: [],
			valsTerminalBenchRows: [],
			toolathlonRows: [],
			valsIndexRows: [],
			vendingBench2Rows: [],
			weirdMlRows: [],
		});
		assert.deepEqual(benchmarkRows.frontier_code, [
			{
				id: "Claude Fable 5",
				label: "Claude Fable 5 (max)",
				provider: null,
				value: 0.516,
			},
		]);

		const finalRows = [
			{
				id: "anthropic/claude-fable-5",
				provider: "anthropic",
				name: "Claude Fable 5",
				reasoning_effort: "xhigh",
				logo: "https://example.com/logo.svg",
				modalities: { input: ["text"] },
				evaluations: { frontier_code: 0.535 },
				task_metrics: {
					frontier_code: { cost: 0.75, tokens: 4_500 },
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
		insertModelEvaluations(db, finalRows);
		insertModelTaskMetrics(db, finalRows);
	} finally {
		db.close();
	}

	const payload = readDatabasePayload(databasePath);
	const model = payload.models[0];
	assert.equal(model?.evaluations?.frontier_code, 0.535);
	assert.deepEqual(model?.task_metrics?.frontier_code, {
		cost: 0.75,
		tokens: 4_500,
	});
	assert.deepEqual(payload.metadata.scoring.benchmark_portfolio.frontier_code, {
		group: "frontier",
		benchmarkImportance: 1,
		dimensionLoadings: { intelligence: 0, agentic: 1 },
		resourcePolicy: {
			source: "benchmark",
			unit: "per_task",
			tokenMeasure: "tokens",
		},
	});
	assert.equal(
		payload.metadata.scoring.selected_benchmark_keys.includes("frontier_code"),
		true,
	);
} finally {
	await removeDatabaseFiles(databasePath);
}
