/** Runtime snapshot loading for Model Atlas. */

import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
	buildDatabase,
	d1Configured,
	missingD1Environment,
	readD1Payload,
	readDatabasePayload,
	refreshD1Snapshot,
} from "../../../src/model-atlas/database";
import {
	DEFAULT_DATABASE_PATH,
	RAW_SOURCE_CACHE_SECONDS,
} from "../../../src/model-atlas/database/types";
import { buildCurrentLlmStatsMetadata } from "../../../src/model-atlas/stats/metadata";
import type { LlmStatsPayload } from "../../../src/model-atlas/stats/types";

type DisplayRefreshState = {
	refreshInFlight: Promise<LlmStatsPayload | null> | null;
	readInFlight: Promise<LlmStatsPayload | null> | null;
	cachedPayload: LlmStatsPayload | null;
	cacheExpiresAt: number;
};

export type DisplaySnapshotRefreshMode = "none" | "stored" | "live";

export type SnapshotRuntime = {
	remoteSnapshotUrl?: string;
	buildDatabasePath?: string;
	readDatabasePath: string | undefined;
	requiresD1: boolean;
	hasD1SnapshotStore: boolean;
	missingD1Environment: string[];
	replaceSourceRows: boolean;
	displayRefreshIntervalSeconds: number;
};

const displayRefreshState = globalThis as typeof globalThis & {
	__modelAtlasDisplayRefreshState?: DisplayRefreshState;
};
const DISPLAY_SNAPSHOT_CACHE_MS = 30_000;

export function snapshotRuntime(): SnapshotRuntime {
	return {
		remoteSnapshotUrl: process.env.MODEL_ATLAS_SNAPSHOT_URL,
		buildDatabasePath: resolveBuildDatabasePath(),
		readDatabasePath: resolveReadDatabasePath(),
		requiresD1: process.env.VERCEL === "1",
		hasD1SnapshotStore: d1Configured(),
		missingD1Environment: missingD1Environment(),
		replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
		displayRefreshIntervalSeconds: displayRefreshIntervalSeconds(),
	};
}

/** Production reads require D1; local development reads its SQLite database. */
async function readBestSnapshotCache(
	runtime: SnapshotRuntime,
): Promise<LlmStatsPayload | null> {
	assertD1Configured(runtime);
	if (runtime.requiresD1) {
		return readD1Snapshot();
	}
	return readLocalDatabaseSnapshot(runtime).catch(() => null);
}

/** Collapse concurrent dashboard reads onto one refresh and keep a short in-memory result for repeated server renders. */
export async function readDisplaySnapshotPayload(): Promise<LlmStatsPayload | null> {
	const state = getDisplayRefreshState();
	if (state.cachedPayload != null && Date.now() < state.cacheExpiresAt) {
		return state.cachedPayload;
	}
	state.readInFlight ??= readDisplaySnapshotPayloadUncached().finally(() => {
		state.readInFlight = null;
	});
	return state.readInFlight;
}

/** Display reads use D1 in production and retain local snapshot fallbacks only outside Vercel. */
async function readDisplaySnapshotPayloadUncached(): Promise<LlmStatsPayload | null> {
	const runtime = snapshotRuntime();
	if (!runtime.requiresD1 && runtime.remoteSnapshotUrl) {
		const payload = await fetchRemoteSnapshot(runtime.remoteSnapshotUrl).catch(
			() => null,
		);
		cacheDisplayPayload(payload);
		return payload;
	}
	const payload = await refreshDisplaySnapshotIfStale(
		await readBestSnapshotCache(runtime),
		runtime,
	);
	cacheDisplayPayload(payload);
	return payload;
}

function cacheDisplayPayload(payload: LlmStatsPayload | null): void {
	if (payload == null) {
		return;
	}
	const state = getDisplayRefreshState();
	state.cachedPayload = payload;
	state.cacheExpiresAt = Date.now() + DISPLAY_SNAPSHOT_CACHE_MS;
}

/** Only one stale-display refresh may run per process, and failure must not erase the last usable payload. */
function startDisplayRefresh(
	refreshMode: Exclude<DisplaySnapshotRefreshMode, "none">,
	runtime: SnapshotRuntime,
): Promise<LlmStatsPayload | null> {
	const state = getDisplayRefreshState();
	state.refreshInFlight ??= (
		refreshMode === "stored"
			? refreshStoredSnapshot(runtime)
			: refreshRuntimePayload(runtime)
	)
		.then((payload) => {
			cacheDisplayPayload(payload);
			return payload;
		})
		.catch((error) => {
			console.error("Unable to refresh display snapshot", error);
			return null;
		})
		.finally(() => {
			state.refreshInFlight = null;
		});
	return state.refreshInFlight;
}

async function refreshDisplaySnapshotIfStale(
	payload: LlmStatsPayload | null,
	runtime: SnapshotRuntime,
): Promise<LlmStatsPayload | null> {
	const refreshMode = displaySnapshotRefreshMode(
		payload,
		Math.floor(Date.now() / 1000),
		runtime.requiresD1,
		runtime.displayRefreshIntervalSeconds,
	);
	if (refreshMode === "none") {
		return payload;
	}
	const refreshPromise = startDisplayRefresh(refreshMode, runtime);
	return (await refreshPromise) ?? payload;
}

/** Refreshes production D1; local development rebuilds directly through SQLite. */
export async function refreshStoredSnapshot(
	runtime = snapshotRuntime(),
): Promise<LlmStatsPayload> {
	assertD1Configured(runtime);
	if (runtime.requiresD1) {
		const payload = await refreshD1SnapshotPayload(runtime);
		if (payload != null) {
			return payload;
		}
		throw new Error("D1 refresh completed without a readable snapshot");
	}
	return refreshRuntimePayload(runtime);
}

/** Rebuild and publish the runtime D1 snapshot before reading it back for display. */
async function refreshD1SnapshotPayload(
	runtime = snapshotRuntime(),
): Promise<LlmStatsPayload | null> {
	await refreshD1Snapshot(runtime.buildDatabasePath);
	return readD1Snapshot();
}

async function refreshRuntimePayload(
	runtime: SnapshotRuntime,
): Promise<LlmStatsPayload> {
	const database = await buildDatabase(runtime.buildDatabasePath, {
		replaceSourceRows: runtime.replaceSourceRows,
	});
	return readDatabasePayload(database.path);
}

/** D1 stores completed run payloads; readers overlay current metadata so old snapshots follow today’s scoring portfolio. */
export async function readD1Snapshot(): Promise<LlmStatsPayload | null> {
	const payload = await readD1Payload();
	return payload == null ? null : withCurrentSnapshotMetadata(payload);
}

/** Prevent production reads from silently substituting a build-time or local snapshot for D1. */
function assertD1Configured(runtime: SnapshotRuntime): void {
	if (runtime.requiresD1 && !runtime.hasD1SnapshotStore) {
		throw new Error(
			`Cloudflare D1 is required in production. Missing ${runtime.missingD1Environment.join(", ")}.`,
		);
	}
}

async function readLocalDatabaseSnapshot(
	runtime: SnapshotRuntime,
): Promise<LlmStatsPayload> {
	return withCurrentSnapshotMetadata(
		readDatabasePayload(runtime.readDatabasePath),
	);
}

export function displaySnapshotRefreshMode(
	payload: LlmStatsPayload | null,
	now: number,
	usesStoredRefresh: boolean,
	refreshIntervalSeconds: number,
): DisplaySnapshotRefreshMode {
	if (payload == null) {
		return usesStoredRefresh ? "stored" : "live";
	}
	const fetchedAt = payload.fetched_at_epoch_seconds ?? 0;
	if (fetchedAt !== 0 && now - fetchedAt < refreshIntervalSeconds) {
		return "none";
	}
	return usesStoredRefresh ? "stored" : "live";
}

function displayRefreshIntervalSeconds(): number {
	const configured = Number.parseInt(
		process.env.MODEL_ATLAS_DISPLAY_REFRESH_INTERVAL_SECONDS ?? "",
		10,
	);
	return Number.isFinite(configured) && configured >= 0
		? configured
		: RAW_SOURCE_CACHE_SECONDS;
}

function getDisplayRefreshState(): DisplayRefreshState {
	displayRefreshState.__modelAtlasDisplayRefreshState ??= {
		cachedPayload: null,
		cacheExpiresAt: 0,
		readInFlight: null,
		refreshInFlight: null,
	};
	return displayRefreshState.__modelAtlasDisplayRefreshState;
}

async function fetchRemoteSnapshot(url: string): Promise<LlmStatsPayload> {
	const response = await fetch(url, {
		cache: "no-store",
	});
	if (!response.ok) {
		throw new Error(
			`Unable to fetch Model Atlas snapshot: HTTP ${response.status}`,
		);
	}
	return withCurrentSnapshotMetadata(await response.json());
}

/** Keep cached payload rows, but rebuild metadata from current code-owned benchmark and scoring policy. */
function withCurrentSnapshotMetadata(
	payload: LlmStatsPayload,
): LlmStatsPayload {
	return {
		...payload,
		metadata: buildCurrentLlmStatsMetadata({
			models: payload.models,
			healthModels: payload.models,
			artificialAnalysis: payload.metadata?.artificial_analysis,
			sourceHealth: payload.metadata?.source_health,
			benchmarkUpdateHealth: payload.metadata?.benchmark_update_health,
			availabilitySource: "artificial_analysis",
		}),
	};
}

function resolveBuildDatabasePath(): string | undefined {
	if (process.env.MODEL_ATLAS_DATABASE_PATH) {
		return resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	}
	if (process.env.VERCEL === "1") {
		return resolve(tmpdir(), "model-atlas/database.sqlite");
	}
	return undefined;
}

function resolveReadDatabasePath(): string | undefined {
	if (process.env.MODEL_ATLAS_DATABASE_PATH) {
		return resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	}
	if (process.env.VERCEL === "1") {
		return undefined;
	}
	return resolve(DEFAULT_DATABASE_PATH);
}
