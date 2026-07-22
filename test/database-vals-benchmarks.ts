/** Verifies independent Vals benchmark cache round-trips and task-aware row identity. */

import assert from "node:assert/strict";

import {
	BENCHMARK_SCORE_SOURCE_BINDINGS,
	type BenchmarkScoreSourceBinding,
} from "../src/model-atlas/benchmarks/registry";
import { PAYLOAD_ROW_GROUPS } from "../src/model-atlas/database/payload-rows";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import { readBenchmarkScoreRawCache } from "../src/model-atlas/ingest/cache";
import { benchmarkScoreRowKey } from "../src/model-atlas/ingest/source-snapshots/model-score";
import {
	RAW_SOURCE_TABLES,
	type SourceSnapshots,
} from "../src/model-atlas/ingest/types";
import {
	insertBenchmarkRawRows,
	SnapshotRowCollector,
} from "../src/model-atlas/ingest/writers";
import type { BenchmarkScoreRow } from "../src/model-atlas/scrapers/benchmark-score";

const SOURCE_CASES = BENCHMARK_SCORE_SOURCE_BINDINGS.filter(
	(binding) => binding.loader.kind === "vals",
).map((binding) => ({ source: binding.rawSource, binding }));
type SourceName = (typeof SOURCE_CASES)[number]["source"];
const SOURCE_NAMES = SOURCE_CASES.map(({ source }) => source);

function benchmarkRow(
	binding: BenchmarkScoreSourceBinding,
	task: string,
	scoreEligible = true,
): BenchmarkScoreRow {
	if (binding.loader.kind !== "vals") {
		throw new Error(`Expected a Vals binding for ${binding.benchmark}`);
	}
	return {
		benchmark_key: binding.benchmark,
		source: "vals",
		source_url: binding.loader.sourceUrl,
		model_id: "example/model",
		model: "Example Model",
		base_model: "Example Model",
		reasoning_effort: "high",
		provider: "Example",
		rank: 1,
		score: 0.75,
		score_eligible: scoreEligible,
		standard_error: null,
		confidence_low: null,
		confidence_high: null,
		observed_at: null,
		metadata: { task },
	};
}

const rows = Object.fromEntries(
	SOURCE_CASES.map(({ source, binding }) => [
		source,
		[benchmarkRow(binding, "overall")],
	]),
) as Record<SourceName, BenchmarkScoreRow[]>;
const legalResearch = SOURCE_CASES.find(
	({ source }) => source === "legal_research",
);
assert.ok(legalResearch);
rows.legal_research.push(
	benchmarkRow(legalResearch.binding, "diagnostic", false),
);
const fetchedAtBySource = Object.fromEntries(
	SOURCE_NAMES.map((source, index) => [source, 1_800_000_000 + index]),
) as Record<SourceName, number>;
const snapshots = {
	...Object.fromEntries(
		SOURCE_CASES.map(({ source, binding }) => [
			binding.sourceRowsKey,
			rows[source],
		]),
	),
	fetchedAt: Object.fromEntries(
		SOURCE_CASES.map(({ source, binding }) => [
			binding.sourceDataKey,
			fetchedAtBySource[source],
		]),
	),
} as SourceSnapshots;
const collector = new SnapshotRowCollector();

assert.deepEqual(
	PAYLOAD_ROW_GROUPS.filter(({ table }) =>
		SOURCE_NAMES.some((source) => RAW_SOURCE_TABLES[source] === table),
	).map(({ key }) => key),
	SOURCE_CASES.map(({ binding }) => binding.sourceRowsKey),
);

for (const { source, binding } of SOURCE_CASES) {
	insertBenchmarkRawRows(collector, snapshots, binding.rawTable);
	assert.deepEqual(
		readBenchmarkScoreRawCache(
			collector.records(RAW_SOURCE_TABLES[source]),
			binding,
		),
		{
			rows: rows[source],
			fetchedAt: fetchedAtBySource[source],
		},
	);
}

assert.notEqual(
	benchmarkScoreRowKey(rows.legal_research[0]!),
	benchmarkScoreRowKey(rows.legal_research[1]!),
	"task rows for the same model and effort must retain distinct cache identities",
);
assert.equal(
	readBenchmarkScoreRawCache(
		collector.records(RAW_SOURCE_TABLES.legal_research),
		SOURCE_CASES.find(({ source }) => source === "legal_research")!.binding,
	)?.rows[1]?.score_eligible,
	false,
	"ineligible diagnostic rows must remain persisted",
);

const databasePath = ".cache/test-database-vals-benchmarks.sqlite";
await removeDatabaseFiles(databasePath);
try {
	const db = await openDatabase(databasePath);
	try {
		const tableNames = new Set(
			(
				db
					.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
					.all() as {
					name: string;
				}[]
			).map(({ name }) => name),
		);
		for (const source of SOURCE_NAMES) {
			assert.equal(tableNames.has(RAW_SOURCE_TABLES[source]), true);
		}
	} finally {
		db.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
