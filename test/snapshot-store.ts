/** Verifies D1-only runtime reads, refresh guards, and batched database access. */

import assert from "node:assert/strict";
import { queryD1Batch, readD1Payload } from "../src/model-atlas/database/d1";
import {
	readDisplaySnapshotPayload,
	refreshStoredSnapshot,
	snapshotRuntime,
} from "../src/model-atlas/database/runtime-snapshot";

const originalDatabasePath = process.env.MODEL_ATLAS_DATABASE_PATH;
const originalVercel = process.env.VERCEL;
const originalD1AccountId = process.env.D1_ACCOUNT_ID;
const originalD1DatabaseId = process.env.D1_DATABASE_ID;
const originalD1ApiToken = process.env.D1_API_TOKEN;
const originalSnapshotUrl = process.env.MODEL_ATLAS_SNAPSHOT_URL;
const originalFetch = globalThis.fetch;
try {
	delete process.env.MODEL_ATLAS_DATABASE_PATH;
	delete process.env.VERCEL;
	process.env.VERCEL = "1";
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
		/Cloudflare D1 is required by the runtime/,
		"Vercel display reads must not fall back when D1 is unavailable",
	);
	await assert.rejects(
		() => refreshStoredSnapshot(),
		/Cloudflare D1 is required by the runtime/,
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
	const requestBodies: unknown[] = [];
	let completedRunVisible = false;
	globalThis.fetch = async (_input, init) => {
		const body = JSON.parse(String(init?.body)) as {
			sql?: string;
			batch?: { sql?: string }[];
		};
		requestBodies.push(body);
		return Response.json({
			success: true,
			result:
				body.batch == null
					? [
							{
								success: true,
								results: completedRunVisible
									? [
											{
												payload_json: JSON.stringify({
													fetched_at_epoch_seconds: 1_800_000_000,
													models: [],
													metadata: {},
												}),
											},
										]
									: [],
							},
						]
					: body.batch.map(() => ({
							success: true,
							results: [],
						})),
		});
	};
	assert.equal(
		await readDisplaySnapshotPayload(),
		null,
		"production reads should return an empty D1 snapshot without starting a refresh",
	);
	assert.equal(
		requestBodies.length,
		1,
		"production display reads should issue only the completed-run query",
	);
	completedRunVisible = true;
	assert.deepEqual(
		(await readD1Payload())?.models,
		[],
		"D1 payload reads should assemble an empty completed snapshot",
	);
	assert.deepEqual(
		requestBodies[1],
		{
			sql: "SELECT payload_json FROM snapshot_payloads WHERE snapshot_key = 'public' LIMIT 1",
			params: [],
		},
		"D1 payload reads should fetch the completed materialized snapshot in one statement",
	);
	await queryD1Batch([
		{ sql: "DELETE FROM example" },
		{ sql: "INSERT example" },
	]);
	assert.deepEqual(
		requestBodies[2],
		{
			batch: [
				{ sql: "DELETE FROM example", params: [] },
				{ sql: "INSERT example", params: [] },
			],
		},
		"D1 publications should use one transactional REST batch",
	);
} finally {
	globalThis.fetch = originalFetch;
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

function restoreEnv(key: string, value: string | undefined): void {
	if (value == null) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}
