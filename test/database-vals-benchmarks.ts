/** Verifies independent Vals benchmark cache round-trips and task-aware row identity. */

import assert from "node:assert/strict";
import type { BenchmarkObservationRow } from "../src/model-atlas/benchmarks/observation";
import {
	BENCHMARK_OBSERVATION_BINDINGS,
	BENCHMARK_OBSERVATION_RAW_TABLE,
	type BenchmarkObservationBinding,
} from "../src/model-atlas/benchmarks/registry";
import { PAYLOAD_ROW_GROUPS } from "../src/model-atlas/database/payload-rows";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import { readBenchmarkObservationRawCache } from "../src/model-atlas/ingest/cache";
import { benchmarkObservationRowKey } from "../src/model-atlas/ingest/source-snapshots/row-snapshot";
import {
	RAW_SOURCE_TABLES,
	type SourceSnapshots,
} from "../src/model-atlas/ingest/types";
import {
	insertBenchmarkRawRows,
	SnapshotRowCollector,
} from "../src/model-atlas/ingest/writers";

const SOURCE_CASES = BENCHMARK_OBSERVATION_BINDINGS.filter(
	(binding) => binding.loader.kind === "vals",
).map((binding) => ({ source: binding.rawSourceKey, binding }));
type SourceName = (typeof SOURCE_CASES)[number]["source"];
const SOURCE_NAMES = SOURCE_CASES.map(({ source }) => source);

function benchmarkRow(
	binding: BenchmarkObservationBinding,
	task: string,
	scoreEligible = true,
): BenchmarkObservationRow {
	if (binding.loader.kind !== "vals") {
		throw new Error(`Expected a Vals binding for ${binding.benchmark}`);
	}
	return {
		benchmark_key: binding.benchmark,
		source_url: binding.loader.sourceUrl,
		model_id: "example/model",
		model: "Example Model",
		base_model: "Example Model",
		reasoning_effort: "high",
		model_creator_id: null,
		model_creator: "Example",
		inference_provider: null,
		rank: 1,
		reported_value: 75,
		reported_unit: "percent",
		canonical_value: 0.75,
		canonical_unit: "proportion",
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
) as Record<SourceName, BenchmarkObservationRow[]>;
const legalResearch = SOURCE_CASES.find(
	({ source }) => source === "legal_research",
);
assert.ok(legalResearch);
rows.legal_research.push(
	benchmarkRow(legalResearch.binding, "diagnostic", false),
);
const legalResearchOverall = rows.legal_research[0];
const legalResearchDiagnostic = rows.legal_research[1];
assert.ok(legalResearchOverall);
assert.ok(legalResearchDiagnostic);
const fetchedAtBySource = Object.fromEntries(
	SOURCE_NAMES.map((source, index) => [source, 1_800_000_000 + index]),
) as Record<SourceName, number>;
const snapshots = {
	...Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
			binding.sourceRowsKey,
			SOURCE_NAMES.includes(binding.rawSourceKey as SourceName)
				? rows[binding.rawSourceKey as SourceName]
				: [],
		]),
	),
	fetchedAt: Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
			binding.sourceDataKey,
			SOURCE_NAMES.includes(binding.rawSourceKey as SourceName)
				? fetchedAtBySource[binding.rawSourceKey as SourceName]
				: null,
		]),
	),
} as SourceSnapshots;
const collector = new SnapshotRowCollector();

assert.deepEqual(
	PAYLOAD_ROW_GROUPS.filter(
		({ sourceKey }) =>
			sourceKey != null && SOURCE_NAMES.includes(sourceKey as SourceName),
	).map(({ key }) => key),
	SOURCE_CASES.map(({ binding }) => binding.sourceRowsKey),
);

insertBenchmarkRawRows(collector, snapshots, BENCHMARK_OBSERVATION_RAW_TABLE);
for (const { source, binding } of SOURCE_CASES) {
	assert.deepEqual(
		readBenchmarkObservationRawCache(
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
	benchmarkObservationRowKey(legalResearchOverall),
	benchmarkObservationRowKey(legalResearchDiagnostic),
	"task rows for the same model and effort must retain distinct cache identities",
);
assert.equal(
	readBenchmarkObservationRawCache(
		collector.records(RAW_SOURCE_TABLES.legal_research),
		legalResearch.binding,
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
		assert.equal(tableNames.has(BENCHMARK_OBSERVATION_RAW_TABLE), true);
		assert.equal(tableNames.has("legal_research_raw_rows"), false);
	} finally {
		db.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
