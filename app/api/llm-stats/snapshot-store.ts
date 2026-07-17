/** Runtime snapshot loading reads and refreshes Cloudflare D1 without a SQLite fallback. */

import {
	d1Configured,
	missingD1Environment,
	readD1Payload,
} from "../../../src/model-atlas/database/d1";
import { publishD1Snapshot } from "../../../src/model-atlas/database/d1-publish";
import { buildCurrentLlmStatsMetadata } from "../../../src/model-atlas/stats/metadata";
import type { LlmStatsPayload } from "../../../src/model-atlas/stats/types";

type SnapshotReadState = {
	readInFlight: Promise<LlmStatsPayload | null> | null;
	cachedPayload: LlmStatsPayload | null;
	cacheExpiresAt: number;
};

export type SnapshotRuntime = {
	remoteSnapshotUrl?: string;
	requiresD1: boolean;
	hasD1SnapshotStore: boolean;
	missingD1Environment: string[];
};

const snapshotReadState = globalThis as typeof globalThis & {
	__modelAtlasSnapshotReadState?: SnapshotReadState;
};
const DISPLAY_SNAPSHOT_CACHE_MS = 30_000;

export function snapshotRuntime(): SnapshotRuntime {
	return {
		remoteSnapshotUrl: process.env.MODEL_ATLAS_SNAPSHOT_URL,
		requiresD1: process.env.VERCEL === "1",
		hasD1SnapshotStore: d1Configured(),
		missingD1Environment: missingD1Environment(),
	};
}

/** Runtime reads use D1; local development may explicitly point to a remote JSON snapshot. */
async function readBestSnapshotCache(
	runtime: SnapshotRuntime,
): Promise<LlmStatsPayload | null> {
	assertD1Configured(runtime);
	return readD1Snapshot();
}

/** Collapse concurrent reads and keep a short in-memory result for repeated server renders. */
export async function readDisplaySnapshotPayload(): Promise<LlmStatsPayload | null> {
	const state = getSnapshotReadState();
	if (state.cachedPayload != null && Date.now() < state.cacheExpiresAt) {
		return state.cachedPayload;
	}
	state.readInFlight ??= readDisplaySnapshotPayloadUncached().finally(() => {
		state.readInFlight = null;
	});
	return state.readInFlight;
}

/** Display reads never trigger writes; refresh is owned by the authenticated refresh route. */
async function readDisplaySnapshotPayloadUncached(): Promise<LlmStatsPayload | null> {
	const runtime = snapshotRuntime();
	if (!runtime.requiresD1 && runtime.remoteSnapshotUrl) {
		const payload = await fetchRemoteSnapshot(runtime.remoteSnapshotUrl).catch(
			() => null,
		);
		cacheDisplayPayload(payload);
		return payload;
	}
	const payload = await readBestSnapshotCache(runtime);
	cacheDisplayPayload(payload);
	return payload;
}

function cacheDisplayPayload(payload: LlmStatsPayload | null): void {
	if (payload == null) {
		return;
	}
	const state = getSnapshotReadState();
	state.cachedPayload = payload;
	state.cacheExpiresAt = Date.now() + DISPLAY_SNAPSHOT_CACHE_MS;
}

/** Refreshes the runtime D1 snapshot directly. */
export async function refreshStoredSnapshot(
	runtime = snapshotRuntime(),
): Promise<LlmStatsPayload> {
	assertD1Configured(runtime);
	const { payload } = await publishD1Snapshot();
	return withCurrentSnapshotMetadata(payload);
}

/** D1 stores completed run payloads; readers overlay current metadata so old snapshots follow today’s scoring portfolio. */
export async function readD1Snapshot(): Promise<LlmStatsPayload | null> {
	const payload = await readD1Payload();
	return payload == null ? null : withCurrentSnapshotMetadata(payload);
}

/** Prevent runtime reads from silently substituting a build-time or local snapshot for D1. */
function assertD1Configured(runtime: SnapshotRuntime): void {
	if (!runtime.hasD1SnapshotStore) {
		throw new Error(
			`Cloudflare D1 is required by the runtime. Missing ${runtime.missingD1Environment.join(", ")}.`,
		);
	}
}

function getSnapshotReadState(): SnapshotReadState {
	snapshotReadState.__modelAtlasSnapshotReadState ??= {
		cachedPayload: null,
		cacheExpiresAt: 0,
		readInFlight: null,
	};
	return snapshotReadState.__modelAtlasSnapshotReadState;
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
