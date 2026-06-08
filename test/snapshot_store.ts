import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
	type DisplaySnapshotRefreshMode,
	displaySnapshotRefreshMode,
	localDatabaseReadPath,
	runtimeDatabasePath,
} from "../app/api/llm-stats/snapshot-store";
import type { ModelStatsSelectedPayload } from "../src/model-atlas/llm/llm-stats/types";
import { minimalSelectedPayload } from "./model_stats_fixtures";

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
	payload: ModelStatsSelectedPayload | null,
	hasRuntimeSnapshotStore: boolean,
	now: number,
): DisplaySnapshotRefreshMode {
	return displaySnapshotRefreshMode(payload, now, hasRuntimeSnapshotStore, 300);
}

function payloadAt(fetchedAt: number): ModelStatsSelectedPayload {
	return minimalSelectedPayload({ fetchedAt });
}
