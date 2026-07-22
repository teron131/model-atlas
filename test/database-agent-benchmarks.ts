/** Agent benchmark persistence fixtures protect raw storage, cache restoration, and health-row reconstruction. */

import assert from "node:assert/strict";
import {
	readAgentArenaRawCache,
	readMercorApexAgentsRawCache,
	readVendingBench2RawCache,
} from "../src/model-atlas/ingest/cache";
import {
	SNAPSHOT_TABLES,
	type SourceSnapshots,
} from "../src/model-atlas/ingest/types";
import {
	insertBenchmarkRawRows,
	SnapshotRowCollector,
} from "../src/model-atlas/ingest/writers";
import { benchmarkRowsFromDb } from "../src/model-atlas/pipeline/benchmark-rows";
import type { AgentArenaModelScoreRow } from "../src/model-atlas/scrapers/agent-arena";
import type { MercorApexAgentsRow } from "../src/model-atlas/scrapers/mercor-apex-agents";
import type { VendingBench2ModelScoreRow } from "../src/model-atlas/scrapers/vending-bench-2";
import { benchmarkScoreRowGroups } from "./llm-stats-fixtures";

const agentArenaRow: AgentArenaModelScoreRow = {
	rank: 1,
	contender_name: "contenders/example-agent",
	model: "Example Agent (High)",
	base_model: "Example Agent",
	reasoning_effort: "high",
	organization: "Example Lab",
	score: 0.14,
};
const vendingBench2Row: VendingBench2ModelScoreRow = {
	rank: 1,
	model: "Example Agent (High)",
	base_model: "Example Agent",
	reasoning_effort: "high",
	run_count: 6,
	final_balance_usd: 10_936.76,
	daily_balance_usd: [500, 700, 10_936.76],
};
const mercorApexRow: MercorApexAgentsRow = {
	model_id: "example-agent-high",
	source_model: "Example Agent (High)",
	model: "Example Agent (high)",
	base_model: "Example Agent",
	reasoning_effort: "high",
	organization: "Example Lab",
	score: 0.4,
};
const snapshots = {
	agentArenaModelScoreRows: [agentArenaRow],
	mercorApexAgentsRows: [mercorApexRow],
	vendingBench2ModelScoreRows: [vendingBench2Row],
	vendingBench2DataUrl:
		"https://andonlabs.com/_app/immutable/chunks/example-data.js",
	fetchedAt: {
		agentArena: 1_784_000_000,
		mercorApexAgents: 1_784_000_002,
		vendingBench2: 1_784_000_001,
	},
} as unknown as SourceSnapshots;
const collector = new SnapshotRowCollector();

insertBenchmarkRawRows(collector, snapshots, SNAPSHOT_TABLES.agent_arena);
insertBenchmarkRawRows(
	collector,
	snapshots,
	SNAPSHOT_TABLES.mercor_apex_agents,
);
insertBenchmarkRawRows(collector, snapshots, SNAPSHOT_TABLES.vending_bench_2);

const agentArenaRows = collector.records("agent_arena_raw_rows");
const mercorApexRows = collector.records("mercor_apex_agents_raw_rows");
const vendingBench2Rows = collector.records("vending_bench_2_raw_rows");
assert.equal(agentArenaRows.length, 1);
assert.equal(agentArenaRows[0]?.contender_name, "contenders/example-agent");
assert.equal(agentArenaRows[0]?.organization, "Example Lab");
assert.equal(agentArenaRows[0]?.score, 0.14);
assert.equal(mercorApexRows.length, 1);
assert.equal(mercorApexRows[0]?.model_id, "example-agent-high");
assert.equal(mercorApexRows[0]?.score, 0.4);
assert.equal(vendingBench2Rows.length, 1);
assert.equal(
	vendingBench2Rows[0]?.daily_balance_usd_json,
	"[500,700,10936.76]",
);
assert.equal(vendingBench2Rows[0]?.reasoning_effort, "high");

assert.deepEqual(readAgentArenaRawCache(agentArenaRows), {
	rows: [agentArenaRow],
	fetchedAt: 1_784_000_000,
});
assert.deepEqual(readMercorApexAgentsRawCache(mercorApexRows), {
	rows: [mercorApexRow],
	fetchedAt: 1_784_000_002,
});
assert.deepEqual(readVendingBench2RawCache(vendingBench2Rows), {
	rows: [vendingBench2Row],
	fetchedAt: 1_784_000_001,
	sourceUrl: "https://andonlabs.com/_app/immutable/chunks/example-data.js",
});

const sourceRows = benchmarkRowsFromDb({
	artificialAnalysisRows: [],
	agentArenaRows,
	agentsLastExamRows: [],
	aleBenchRows: [],
	blueprintBenchRows: [],
	...benchmarkScoreRowGroups(),
	cursorBenchRows: [],
	deepSWERows: [],
	frontierCodeRows: [],
	gdpPdfRows: [],
	harveyLabRows: [],
	riemannBenchRows: [],
	terminalBenchRows: [],
	valsIndexRows: [],
	vendingBench2Rows,
});
assert.equal(sourceRows.agent_arena?.[0]?.value, 0.14);
assert.equal(sourceRows.vending_bench_2?.[0]?.value, 10_936.76);
