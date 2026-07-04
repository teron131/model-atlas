/** Runtime snapshot loading for Model Atlas. */

import { readFile } from "node:fs/promises";
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

const STATIC_SNAPSHOT_PATH = resolve(
	process.cwd(),
	"public/model-atlas-snapshot.json",
);

type DisplayRefreshState = {
	refreshInFlight: Promise<LlmStatsPayload | null> | null;
	readInFlight: Promise<LlmStatsPayload | null> | null;
	cachedPayload: LlmStatsPayload | null;
	cacheExpiresAt: number;
};

export type DisplaySnapshotRefreshMode = "none" | "stored" | "live";

const displayRefreshState = globalThis as typeof globalThis & {
	__modelAtlasDisplayRefreshState?: DisplayRefreshState;
};
const DISPLAY_SNAPSHOT_MEMORY_CACHE_MILLISECONDS = 30_000;

export function d1SnapshotStoreConfigured(): boolean {
	return d1Configured();
}

export function missingD1SnapshotEnvironment(): string[] {
	return missingD1Environment();
}

/** Remote snapshot URLs override local storage so deployed readers can be pointed at a single known-good artifact. */
export async function readBestStoredSnapshotPayload(): Promise<LlmStatsPayload | null> {
	if (process.env.MODEL_ATLAS_SNAPSHOT_URL) {
		return fetchRemoteSnapshot(process.env.MODEL_ATLAS_SNAPSHOT_URL);
	}
	return readBestSnapshotCache();
}

/** Prefer D1 when available, then choose between local SQLite and static JSON by benchmark coverage before freshness. */
async function readBestSnapshotCache(): Promise<LlmStatsPayload | null> {
	const [d1Snapshot, localDatabaseSnapshot, staticSnapshot] = await Promise.all(
		[
			shouldReadD1Snapshot()
				? readD1Snapshot().catch(() => null)
				: Promise.resolve(null),
			shouldReadStaticSnapshot()
				? Promise.resolve(null)
				: readLocalDatabaseSnapshot().catch(() => null),
			readStaticSnapshot().catch(() => null),
		],
	);
	return (
		d1Snapshot ?? bestSnapshotPayload(localDatabaseSnapshot, staticSnapshot)
	);
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

/** Display reads may trigger a background-quality refresh, but they still return the best stored payload on failure. */
async function readDisplaySnapshotPayloadUncached(): Promise<LlmStatsPayload | null> {
	if (process.env.MODEL_ATLAS_SNAPSHOT_URL) {
		const payload = await fetchRemoteSnapshot(
			process.env.MODEL_ATLAS_SNAPSHOT_URL,
		).catch(() => null);
		cacheDisplayPayload(payload);
		return payload;
	}
	const payload = await refreshDisplaySnapshotIfStale(
		await readBestSnapshotCache(),
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
	state.cacheExpiresAt =
		Date.now() + DISPLAY_SNAPSHOT_MEMORY_CACHE_MILLISECONDS;
}

/** Only one stale-display refresh may run per process, and failure must not erase the last usable payload. */
function startDisplayRefresh(
	refreshMode: Exclude<DisplaySnapshotRefreshMode, "none">,
): Promise<LlmStatsPayload | null> {
	const state = getDisplayRefreshState();
	state.refreshInFlight ??= (
		refreshMode === "stored"
			? refreshD1StoredSnapshot()
			: refreshLocalSnapshotPayload()
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
): Promise<LlmStatsPayload | null> {
	const refreshMode = displaySnapshotRefreshMode(
		payload,
		nowEpochSeconds(),
		d1SnapshotStoreConfigured(),
		displayRefreshIntervalSeconds(),
	);
	if (refreshMode === "none") {
		return payload;
	}
	const refreshPromise = startDisplayRefresh(refreshMode);
	return (await refreshPromise) ?? payload;
}

/** Explicit refreshes rebuild through the runtime database path instead of reading a stale static artifact. */
export async function refreshLocalSnapshotPayload(): Promise<LlmStatsPayload> {
	return refreshRuntimePayload(runtimeDatabasePath());
}

/** Rebuild and publish the runtime D1 snapshot before reading it back for display. */
export async function refreshD1StoredSnapshot(): Promise<LlmStatsPayload | null> {
	await refreshD1Snapshot(runtimeDatabasePath());
	return readD1Snapshot();
}

async function refreshRuntimePayload(
	databasePath?: string,
): Promise<LlmStatsPayload> {
	const database = await buildDatabase(databasePath, {
		replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
	});
	return readDatabasePayload(database.path);
}

/** D1 stores completed run payloads; readers overlay current metadata so old snapshots follow today’s scoring portfolio. */
export async function readD1Snapshot(): Promise<LlmStatsPayload | null> {
	const payload = await readD1Payload();
	return payload == null ? null : withCurrentSnapshotMetadata(payload);
}

async function readStaticSnapshot(): Promise<LlmStatsPayload> {
	return withCurrentSnapshotMetadata(
		JSON.parse(await readFile(STATIC_SNAPSHOT_PATH, "utf-8")),
	);
}

async function readLocalDatabaseSnapshot(): Promise<LlmStatsPayload> {
	return withCurrentSnapshotMetadata(
		readDatabasePayload(localDatabaseReadPath()),
	);
}

function shouldReadD1Snapshot(): boolean {
	return process.env.VERCEL === "1" || process.env.MODEL_ATLAS_USE_D1 === "1";
}

function shouldReadStaticSnapshot(): boolean {
	return (
		process.env.VERCEL === "1" ||
		process.env.MODEL_ATLAS_STATIC_SNAPSHOT === "1"
	);
}

export function bestSnapshotPayload(
	left: LlmStatsPayload | null,
	right: LlmStatsPayload | null,
): LlmStatsPayload | null {
	if (left == null) {
		return right;
	}
	if (right == null) {
		return left;
	}
	const leftCoverage = selectedBenchmarkCoverage(left);
	const rightCoverage = selectedBenchmarkCoverage(right);
	if (leftCoverage !== rightCoverage) {
		return rightCoverage > leftCoverage ? right : left;
	}
	return snapshotFetchedAt(right) > snapshotFetchedAt(left) ? right : left;
}

function snapshotFetchedAt(payload: LlmStatsPayload): number {
	return payload.fetched_at_epoch_seconds ?? 0;
}

function selectedBenchmarkCoverage(payload: LlmStatsPayload): number {
	const selectedKeys = payload.metadata.scoring.selected_benchmark_keys;
	if (selectedKeys.length === 0) {
		return 0;
	}
	const availableKeys = new Set([
		...payload.metadata.artificial_analysis.available_benchmark_keys,
		...payload.metadata.artificial_analysis.available_evaluation_keys,
		...payload.metadata.artificial_analysis.available_intelligence_keys,
	]);
	return selectedKeys.filter((key) => availableKeys.has(key)).length;
}

export function displaySnapshotRefreshMode(
	payload: LlmStatsPayload | null,
	now: number,
	hasRuntimeSnapshotStore: boolean,
	refreshIntervalSeconds: number,
): DisplaySnapshotRefreshMode {
	if (payload == null) {
		return hasRuntimeSnapshotStore ? "stored" : "live";
	}
	if (!hasRuntimeSnapshotStore) {
		return "none";
	}
	const fetchedAt = snapshotFetchedAt(payload);
	return fetchedAt === 0 || now - fetchedAt >= refreshIntervalSeconds
		? "stored"
		: "none";
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

function nowEpochSeconds(): number {
	return Math.floor(Date.now() / 1000);
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

export function runtimeDatabasePath(): string | undefined {
	if (process.env.MODEL_ATLAS_DATABASE_PATH) {
		return resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	}
	if (process.env.VERCEL === "1") {
		return resolve(tmpdir(), "model-atlas/database.sqlite");
	}
	return undefined;
}

export function localDatabaseReadPath(): string | undefined {
	if (process.env.MODEL_ATLAS_DATABASE_PATH) {
		return resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	}
	if (process.env.VERCEL === "1") {
		return resolve(tmpdir(), "model-atlas/database.sqlite");
	}
	return resolve(DEFAULT_DATABASE_PATH);
}
