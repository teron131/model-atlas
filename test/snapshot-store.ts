import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
	bestSnapshotPayload,
	type DisplaySnapshotRefreshMode,
	displaySnapshotRefreshMode,
	localDatabaseReadPath,
	runtimeDatabasePath,
} from "../app/api/llm-stats/snapshot-store";
import type { LlmStatsPayload } from "../src/model-atlas/llm/stats/types";
import { minimalLlmStatsPayload } from "./llm-stats-fixtures";

const freshPayload = payloadAt(900);
const stalePayload = payloadAt(100);

assert.equal(
	mode(null, false, 1000),
	"live",
	"missing display snapshots should use the live server payload fallback",
);
assert.equal(
	mode(freshPayload, false, 1000),
	"none",
	"fresh display snapshots without Blob should render from cache",
);
assert.equal(
	mode(stalePayload, false, 1000),
	"none",
	"stale display snapshots without Blob should not force live refresh",
);
assert.equal(
	mode(stalePayload, true, 1000),
	"stored",
	"stale display snapshots with Blob should refresh the stored snapshot",
);

const olderCompleteSnapshot = payloadWithBenchmarks(100, [
	"gdp_pdf",
	"deep_swe",
]);
const newerIncompleteSnapshot = payloadWithBenchmarks(900, ["gdp_pdf"]);
assert.equal(
	bestSnapshotPayload(newerIncompleteSnapshot, olderCompleteSnapshot),
	olderCompleteSnapshot,
	"snapshot selection should keep richer benchmark coverage over a newer incomplete local database",
);
const newerEquallyCompleteSnapshot = payloadWithBenchmarks(900, [
	"gdp_pdf",
	"deep_swe",
]);
assert.equal(
	bestSnapshotPayload(olderCompleteSnapshot, newerEquallyCompleteSnapshot),
	newerEquallyCompleteSnapshot,
	"snapshot selection should use freshness when selected benchmark coverage is equal",
);

const originalDatabasePath = process.env.MODEL_ATLAS_DATABASE_PATH;
const originalVercel = process.env.VERCEL;
try {
	delete process.env.MODEL_ATLAS_DATABASE_PATH;
	delete process.env.VERCEL;
	assert.equal(
		runtimeDatabasePath(),
		undefined,
		"local runtime refreshes should use the normal database default",
	);
	assert.equal(
		localDatabaseReadPath(),
		resolve(".cache/database.sqlite"),
		"local display reads should use the normal repo SQLite snapshot",
	);
	process.env.MODEL_ATLAS_DATABASE_PATH = "custom.sqlite";
	assert.equal(
		runtimeDatabasePath(),
		resolve("custom.sqlite"),
		"explicit runtime database paths should still be honored",
	);
	assert.equal(
		localDatabaseReadPath(),
		resolve("custom.sqlite"),
		"explicit database paths should also control local snapshot reads",
	);
	delete process.env.MODEL_ATLAS_DATABASE_PATH;
	process.env.VERCEL = "1";
	assert.equal(
		runtimeDatabasePath(),
		resolve(tmpdir(), "model-atlas/database.sqlite"),
		"Vercel runtime refreshes should use the writable temp database path",
	);
	assert.equal(
		localDatabaseReadPath(),
		resolve(tmpdir(), "model-atlas/database.sqlite"),
		"Vercel display reads should use the writable temp database path",
	);
} finally {
	if (originalDatabasePath == null) {
		delete process.env.MODEL_ATLAS_DATABASE_PATH;
	} else {
		process.env.MODEL_ATLAS_DATABASE_PATH = originalDatabasePath;
	}
	if (originalVercel == null) {
		delete process.env.VERCEL;
	} else {
		process.env.VERCEL = originalVercel;
	}
}

function mode(
	payload: LlmStatsPayload | null,
	hasRuntimeSnapshotStore: boolean,
	now: number,
): DisplaySnapshotRefreshMode {
	return displaySnapshotRefreshMode(payload, now, hasRuntimeSnapshotStore, 300);
}

function payloadAt(fetchedAt: number): LlmStatsPayload {
	return minimalLlmStatsPayload({ fetchedAt });
}

function payloadWithBenchmarks(
	fetchedAt: number,
	availableBenchmarkKeys: string[],
): LlmStatsPayload {
	const payload = payloadAt(fetchedAt);
	return {
		...payload,
		metadata: {
			...payload.metadata,
			artificial_analysis: {
				...payload.metadata.artificial_analysis,
				available_benchmark_keys: availableBenchmarkKeys,
			},
			scoring: {
				...payload.metadata.scoring,
				selected_benchmark_keys: ["gdp_pdf", "deep_swe"],
			},
		},
	};
}
