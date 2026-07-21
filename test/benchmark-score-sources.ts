/** Exercises benchmark CSV, Astro, HTML, matching, eligibility, and domain-owned persistence. */

import assert from "node:assert/strict";

import {
	readChartographyRawCache,
	readChessPuzzlesRawCache,
	readEbrBenchRawCache,
	readEnterpriseBenchCoreCraftRawCache,
	readEpochCapabilitiesIndexRawCache,
	readFrontierMathTier4RawCache,
	readHandbookMdRawCache,
	readProofBenchRawCache,
	readWeirdMlRawCache,
} from "../src/model-atlas/database/cache";
import type { SourceSnapshots } from "../src/model-atlas/database/types";
import {
	insertChartographyRawRows,
	insertChessPuzzlesRawRows,
	insertEbrBenchRawRows,
	insertEnterpriseBenchCoreCraftRawRows,
	insertEpochCapabilitiesIndexRawRows,
	insertFrontierMathTier4RawRows,
	insertHandbookMdRawRows,
	insertProofBenchRawRows,
	insertWeirdMlRawRows,
	SnapshotRowCollector,
} from "../src/model-atlas/database/writers";
import {
	buildBenchmarkScoreMap,
	findBenchmarkScoreRow,
} from "../src/model-atlas/scrapers/benchmark-score";
import { parseCsvRecords } from "../src/model-atlas/scrapers/csv-parser";
import { processEpochCapabilitiesIndexCsv } from "../src/model-atlas/scrapers/epoch/capabilities-index";
import { epochFrontierMathTier4Rows } from "../src/model-atlas/scrapers/epoch/frontiermath-tier-4";
import { processSurgeBenchmarkPageHtml } from "../src/model-atlas/scrapers/surge/common";
import { processProofBenchPageHtml } from "../src/model-atlas/scrapers/vals/proofbench";
import { processWeirdMlCsv } from "../src/model-atlas/scrapers/weirdml";

assert.deepEqual(
	parseCsvRecords('name,note\r\n"A, B","line 1\nline ""2"""\r\n'),
	[{ name: "A, B", note: 'line 1\nline "2"' }],
);

const eci = processEpochCapabilitiesIndexCsv(
	"Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization,Country (of organization),Model accessibility,Accessibility group,model_versions\n" +
		"gpt-5.6-sol,GPT-5.6 Sol,161.77,159.26,166.01,2026-07-09,OpenAI,US,API,Hosted,v1\n",
);
assert.equal(eci[0]?.score, 161.77);
assert.equal(eci[0]?.confidence_low, 159.26);

const epochRuns = parseCsvRecords(
	"id_runs,task,model,Best score (across scorers),started_at,Status,task version,id_model_version,Display name,Unique display name,Organization,mean_score,stderr,best_score,original_task_name,Scores\n" +
		"new,FrontierMath-Tier-4-v2-Private,gpt,0.56,2026-07-01T00:00:00Z,Success,2.0.0,gpt-5.6,GPT-5.6 Sol,GPT-5.6 Sol (max),OpenAI,0.561,0.02,0.56,frontiermath,[]\n" +
		"old,FrontierMath-Tier-4-2025-07-01-Private,gpt,0.31,2025-07-01T00:00:00Z,Success,1.0.0,gpt-5.6,GPT-5.6 Sol,GPT-5.6 Sol (max),OpenAI,0.3125,0.02,0.31,frontiermath,[]\n",
);
const frontierMath = epochFrontierMathTier4Rows(epochRuns);
assert.equal(frontierMath.length, 1);
assert.equal(frontierMath[0]?.score, 0.561);
assert.equal(frontierMath[0]?.metadata.task_version, "2.0.0");

const weirdMl = processWeirdMlCsv(
	"internal_model_name,display_name,model_slug,shapes_easy_acc,shapes_hard_acc,digits_unsup_acc,chess_winners_acc,kolmo_shuffle_acc,classify_sentences_acc,classify_shuffled_acc,insert_patches_acc,blunders_easy_acc,blunders_hard_acc,digits_generalize_acc,shapes_variable_acc,xor_easy_acc,xor_hard_acc,splash_easy_acc,splash_hard_acc,number_patterns_acc,avg_acc,avg_acc_standard_error,cost_per_run_usd,mean_total_output_tokens,code_len_p10,code_len_p50,code_len_p90,exec_time_median_s,release_date,API source\n" +
		"claude,Claude Fable 5 (max),claude-fable-5,0.95,0.94,0.93,0.92,0.91,0.90,0.89,0.88,0.87,0.86,0.85,0.84,0.83,0.82,0.81,0.80,0.79,0.91,0.01,1.2,1000,10,20,30,4.5,2026-06-09,Anthropic\n",
);
assert.equal(weirdMl[0]?.reasoning_effort, "max");
assert.equal(weirdMl[0]?.metadata.shapes_easy_acc, 0.95);

function astro(value: unknown): unknown[] {
	return [0, value];
}

const proofHtml = `<astro-island component-url="/_astro/BenchmarkView.hash.js" props="${JSON.stringify(
	{
		benchmarkView: astro({
			default: astro({
				metadata: astro({ updated: astro("2026-07-17"), version: astro("1") }),
				tasks: astro({
					overall: astro({
						"openai/gpt-5.6-sol": astro({
							accuracy: astro(77),
							provider: astro("OpenAI"),
							reasoning_effort: astro("max"),
							stderr: astro(4.2),
						}),
						"aristotle/aristotle": astro({
							accuracy: astro(71),
							provider: astro("Aristotle"),
						}),
					}),
				}),
			}),
		}),
	},
).replace(/"/g, "&quot;")}"></astro-island>`;
const proof = processProofBenchPageHtml(proofHtml);
assert.equal(proof.length, 2);
assert.equal(
	proof.find((row) => row.model_id === "aristotle/aristotle")?.score_eligible,
	false,
);

const surge = processSurgeBenchmarkPageHtml(
	`
	<div>Model Rankings</div>
	<div role="listitem" data-score="45"><img alt="OpenAI Logo"><div class="head-rank-table-brand">OpenAI</div><div class="head-rank-table-name">GPT 5.6 Sol (Max reasoning)</div></div>
	<section></section>
`,
	"chartography",
	"https://surgehq.ai/benchmarks/chartography",
);
assert.equal(surge[0]?.reasoning_effort, "max");
assert.equal(surge[0]?.score, 0.45);

const frontierMathMap = buildBenchmarkScoreMap(frontierMath);
assert.equal(
	findBenchmarkScoreRow(["GPT-5.6 Sol"], "max", frontierMathMap)?.score,
	0.561,
);
assert.equal(
	findBenchmarkScoreRow(["GPT-5.6 Sol"], "high", frontierMathMap),
	null,
);
assert.equal(buildBenchmarkScoreMap(proof).has("aristotle"), false);

const collector = new SnapshotRowCollector();
const chess = frontierMath.map((row) => ({
	...row,
	benchmark_key: "chess_puzzles",
}));
const ebr = frontierMath.map((row) => ({
	...row,
	benchmark_key: "ebr_bench",
}));
const handbook = surge.map((row) => ({
	...row,
	benchmark_key: "handbook_md",
}));
const coreCraft = surge.map((row) => ({
	...row,
	benchmark_key: "enterprisebench_corecraft",
}));
insertChartographyRawRows(collector, {
	chartographyRows: surge,
	fetchedAt: { chartography: 1_784_000_004 },
} as unknown as SourceSnapshots);
insertChessPuzzlesRawRows(collector, {
	chessPuzzleRows: chess,
	fetchedAt: { chessPuzzles: 1_784_000_002 },
} as unknown as SourceSnapshots);
insertEbrBenchRawRows(collector, {
	ebrBenchRows: ebr,
	fetchedAt: { ebrBench: 1_784_000_003 },
} as unknown as SourceSnapshots);
insertEnterpriseBenchCoreCraftRawRows(collector, {
	enterpriseBenchCoreCraftRows: coreCraft,
	fetchedAt: { enterpriseBenchCoreCraft: 1_784_000_006 },
} as unknown as SourceSnapshots);
insertEpochCapabilitiesIndexRawRows(collector, {
	epochCapabilitiesIndexRows: eci,
	fetchedAt: { epochCapabilitiesIndex: 1_784_000_000 },
} as unknown as SourceSnapshots);
insertFrontierMathTier4RawRows(collector, {
	frontierMathTier4Rows: frontierMath,
	fetchedAt: { frontierMathTier4: 1_784_000_001 },
} as unknown as SourceSnapshots);
insertHandbookMdRawRows(collector, {
	handbookMdRows: handbook,
	fetchedAt: { handbookMd: 1_784_000_005 },
} as unknown as SourceSnapshots);
insertProofBenchRawRows(collector, {
	proofBenchRows: proof,
	fetchedAt: { proofBench: 1_784_000_007 },
} as unknown as SourceSnapshots);
insertWeirdMlRawRows(collector, {
	weirdMlRows: weirdMl,
	fetchedAt: { weirdMl: 1_784_000_008 },
} as unknown as SourceSnapshots);
assert.deepEqual(
	readChartographyRawCache(collector.records("chartography_raw_rows")),
	{ rows: surge, fetchedAt: 1_784_000_004 },
);
assert.deepEqual(
	readChessPuzzlesRawCache(collector.records("chess_puzzles_raw_rows")),
	{ rows: chess, fetchedAt: 1_784_000_002 },
);
assert.deepEqual(
	readEbrBenchRawCache(collector.records("ebr_bench_raw_rows")),
	{ rows: ebr, fetchedAt: 1_784_000_003 },
);
assert.deepEqual(
	readEnterpriseBenchCoreCraftRawCache(
		collector.records("enterprisebench_corecraft_raw_rows"),
	),
	{ rows: coreCraft, fetchedAt: 1_784_000_006 },
);
assert.deepEqual(
	readEpochCapabilitiesIndexRawCache(
		collector.records("epoch_capabilities_index_raw_rows"),
	),
	{ rows: eci, fetchedAt: 1_784_000_000 },
);
assert.deepEqual(
	readFrontierMathTier4RawCache(
		collector.records("frontiermath_tier_4_raw_rows"),
	),
	{ rows: frontierMath, fetchedAt: 1_784_000_001 },
);
assert.deepEqual(
	readHandbookMdRawCache(collector.records("handbook_md_raw_rows")),
	{ rows: handbook, fetchedAt: 1_784_000_005 },
);
assert.deepEqual(
	readProofBenchRawCache(collector.records("proofbench_raw_rows")),
	{ rows: proof, fetchedAt: 1_784_000_007 },
);
assert.deepEqual(readWeirdMlRawCache(collector.records("weirdml_raw_rows")), {
	rows: weirdMl,
	fetchedAt: 1_784_000_008,
});
