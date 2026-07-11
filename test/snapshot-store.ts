import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
	type DisplaySnapshotRefreshMode,
	displaySnapshotRefreshMode,
	readDisplaySnapshotPayload,
	refreshStoredSnapshot,
	snapshotRuntime,
} from "../app/api/llm-stats/snapshot-store";
import type { LlmStatsPayload } from "../src/model-atlas/stats/types";
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
	"fresh display snapshots without D1 should render from cache",
);
assert.equal(
	mode(stalePayload, false, 1000),
	"live",
	"stale display snapshots without D1 should refresh from the live runtime payload",
);
assert.equal(
	mode(stalePayload, true, 1000),
	"stored",
	"stale display snapshots with D1 should refresh the stored snapshot",
);

const originalDatabasePath = process.env.MODEL_ATLAS_DATABASE_PATH;
const originalVercel = process.env.VERCEL;
const originalD1AccountId = process.env.D1_ACCOUNT_ID;
const originalD1DatabaseId = process.env.D1_DATABASE_ID;
const originalD1ApiToken = process.env.D1_API_TOKEN;
const originalSnapshotUrl = process.env.MODEL_ATLAS_SNAPSHOT_URL;
try {
	delete process.env.MODEL_ATLAS_DATABASE_PATH;
	delete process.env.VERCEL;
	assert.equal(
		snapshotRuntime().buildDatabasePath,
		undefined,
		"local runtime refreshes should use the normal database default",
	);
	assert.equal(
		snapshotRuntime().readDatabasePath,
		resolve(".cache/database.sqlite"),
		"local display reads should use the normal repo SQLite snapshot",
	);
	process.env.MODEL_ATLAS_DATABASE_PATH = "custom.sqlite";
	assert.equal(
		snapshotRuntime().buildDatabasePath,
		resolve("custom.sqlite"),
		"explicit runtime database paths should still be honored",
	);
	assert.equal(
		snapshotRuntime().readDatabasePath,
		resolve("custom.sqlite"),
		"explicit database paths should also control local snapshot reads",
	);
	delete process.env.MODEL_ATLAS_DATABASE_PATH;
	process.env.VERCEL = "1";
	assert.equal(
		snapshotRuntime().buildDatabasePath,
		resolve(tmpdir(), "model-atlas/database.sqlite"),
		"Vercel runtime refreshes should use the writable temp database path",
	);
	assert.equal(
		snapshotRuntime().readDatabasePath,
		undefined,
		"Vercel display reads should not expose the temporary build database",
	);
	delete process.env.D1_ACCOUNT_ID;
	delete process.env.D1_DATABASE_ID;
	delete process.env.D1_API_TOKEN;
	assert.equal(
		snapshotRuntime().hasD1SnapshotStore,
		false,
		"runtime D1 storage should be disabled when required Cloudflare settings are absent",
	);
	assert.equal(
		snapshotRuntime().requiresD1,
		true,
		"Vercel runtime should reject non-D1 snapshot fallbacks",
	);
	assert.deepEqual(
		snapshotRuntime().missingD1Environment,
		["D1_ACCOUNT_ID", "D1_DATABASE_ID", "D1_API_TOKEN"],
		"missing D1 environment should report the canonical variable names",
	);
	process.env.MODEL_ATLAS_SNAPSHOT_URL = "https://example.com/snapshot.json";
	await assert.rejects(
		readDisplaySnapshotPayload,
		/Cloudflare D1 is required in production/,
		"Vercel display reads must not fall back when D1 is unavailable",
	);
	await assert.rejects(
		() => refreshStoredSnapshot(),
		/Cloudflare D1 is required in production/,
		"Vercel refreshes must not rebuild a local-only snapshot when D1 is unavailable",
	);
	process.env.D1_ACCOUNT_ID = "account";
	process.env.D1_DATABASE_ID = "database";
	process.env.D1_API_TOKEN = "token";
	assert.equal(
		snapshotRuntime().hasD1SnapshotStore,
		true,
		"runtime D1 storage should accept canonical D1 variable names",
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
	restoreEnv("D1_ACCOUNT_ID", originalD1AccountId);
	restoreEnv("D1_DATABASE_ID", originalD1DatabaseId);
	restoreEnv("D1_API_TOKEN", originalD1ApiToken);
	restoreEnv("MODEL_ATLAS_SNAPSHOT_URL", originalSnapshotUrl);
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

function restoreEnv(key: string, value: string | undefined): void {
	if (value == null) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}
