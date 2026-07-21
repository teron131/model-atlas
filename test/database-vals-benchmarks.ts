/** Verifies independent Vals benchmark cache round-trips and task-aware row identity. */

import assert from "node:assert/strict";

import {
	readCodeMigrationRawCache,
	readCyberBenchRawCache,
	readEmbRawCache,
	readFinanceAgentV2RawCache,
	readLegalResearchRawCache,
	readMedCodeRawCache,
	readProgramBenchRawCache,
	readPublicBenefitsBenchRawCache,
	readVibeCodeRawCache,
} from "../src/model-atlas/database/cache";
import { PAYLOAD_ROW_GROUPS } from "../src/model-atlas/database/payload";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import { benchmarkScoreRowKey } from "../src/model-atlas/database/source-snapshots/model-score";
import {
	RAW_SOURCE_TABLES,
	SOURCE_URLS,
	type SourceSnapshots,
} from "../src/model-atlas/database/types";
import {
	insertCodeMigrationRawRows,
	insertCyberBenchRawRows,
	insertEmbRawRows,
	insertFinanceAgentV2RawRows,
	insertLegalResearchRawRows,
	insertMedCodeRawRows,
	insertProgramBenchRawRows,
	insertPublicBenefitsBenchRawRows,
	insertVibeCodeRawRows,
	SnapshotRowCollector,
} from "../src/model-atlas/database/writers";
import type { BenchmarkScoreRow } from "../src/model-atlas/scrapers/benchmark-score";

const BENCHMARK_KEYS_BY_SOURCE = {
	code_migration: "code_migration",
	cyberbench: "cyberbench",
	emb: "emb",
	finance_agent_v2: "finance_agent_v2",
	legal_research: "legal_research",
	medcode: "medcode",
	programbench: "programbench",
	public_benefits_bench: "public_benefits_bench",
	vibe_code: "vibe_code",
} as const;

type SourceName = keyof typeof BENCHMARK_KEYS_BY_SOURCE;
const SOURCE_NAMES = Object.keys(BENCHMARK_KEYS_BY_SOURCE) as SourceName[];
const SOURCE_CASES = [
	{
		source: "code_migration",
		read: readCodeMigrationRawCache,
		write: insertCodeMigrationRawRows,
	},
	{
		source: "cyberbench",
		read: readCyberBenchRawCache,
		write: insertCyberBenchRawRows,
	},
	{ source: "emb", read: readEmbRawCache, write: insertEmbRawRows },
	{
		source: "finance_agent_v2",
		read: readFinanceAgentV2RawCache,
		write: insertFinanceAgentV2RawRows,
	},
	{
		source: "legal_research",
		read: readLegalResearchRawCache,
		write: insertLegalResearchRawRows,
	},
	{ source: "medcode", read: readMedCodeRawCache, write: insertMedCodeRawRows },
	{
		source: "programbench",
		read: readProgramBenchRawCache,
		write: insertProgramBenchRawRows,
	},
	{
		source: "public_benefits_bench",
		read: readPublicBenefitsBenchRawCache,
		write: insertPublicBenefitsBenchRawRows,
	},
	{
		source: "vibe_code",
		read: readVibeCodeRawCache,
		write: insertVibeCodeRawRows,
	},
] as const;

function benchmarkRow(
	source: SourceName,
	task: string,
	scoreEligible = true,
): BenchmarkScoreRow {
	return {
		benchmark_key: BENCHMARK_KEYS_BY_SOURCE[source],
		source: "vals",
		source_url: SOURCE_URLS[source],
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
	SOURCE_NAMES.map((source) => [source, [benchmarkRow(source, "overall")]]),
) as Record<SourceName, BenchmarkScoreRow[]>;
rows.legal_research.push(benchmarkRow("legal_research", "diagnostic", false));
const fetchedAtBySource = Object.fromEntries(
	SOURCE_NAMES.map((source, index) => [source, 1_800_000_000 + index]),
) as Record<SourceName, number>;
const snapshots = {
	codeMigrationRows: rows.code_migration,
	cyberBenchRows: rows.cyberbench,
	embRows: rows.emb,
	financeAgentV2Rows: rows.finance_agent_v2,
	legalResearchRows: rows.legal_research,
	medCodeRows: rows.medcode,
	programBenchRows: rows.programbench,
	publicBenefitsBenchRows: rows.public_benefits_bench,
	vibeCodeRows: rows.vibe_code,
	fetchedAt: {
		codeMigration: fetchedAtBySource.code_migration,
		cyberBench: fetchedAtBySource.cyberbench,
		emb: fetchedAtBySource.emb,
		financeAgentV2: fetchedAtBySource.finance_agent_v2,
		legalResearch: fetchedAtBySource.legal_research,
		medCode: fetchedAtBySource.medcode,
		programBench: fetchedAtBySource.programbench,
		publicBenefitsBench: fetchedAtBySource.public_benefits_bench,
		vibeCode: fetchedAtBySource.vibe_code,
	},
} as SourceSnapshots;
const collector = new SnapshotRowCollector();

assert.deepEqual(
	PAYLOAD_ROW_GROUPS.filter(({ table }) =>
		SOURCE_NAMES.some((source) => RAW_SOURCE_TABLES[source] === table),
	).map(({ key }) => key),
	[
		"codeMigrationRows",
		"cyberBenchRows",
		"embRows",
		"financeAgentV2Rows",
		"legalResearchRows",
		"medCodeRows",
		"programBenchRows",
		"publicBenefitsBenchRows",
		"vibeCodeRows",
	],
);

for (const { source, read, write } of SOURCE_CASES) {
	write(collector, snapshots);
	assert.deepEqual(read(collector.records(RAW_SOURCE_TABLES[source])), {
		rows: rows[source],
		fetchedAt: fetchedAtBySource[source],
	});
}

assert.notEqual(
	benchmarkScoreRowKey(rows.legal_research[0]!),
	benchmarkScoreRowKey(rows.legal_research[1]!),
	"task rows for the same model and effort must retain distinct cache identities",
);
assert.equal(
	readLegalResearchRawCache(collector.records(RAW_SOURCE_TABLES.legal_research))
		?.rows[1]?.score_eligible,
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
