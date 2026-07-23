/** Runtime snapshot loading reads and refreshes Cloudflare D1 without a SQLite fallback. */

import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import type { ModelAtlasPayload } from "../stats/types";
import { d1Configured, missingD1Environment, readD1Payload } from "./d1";
import { publishD1Snapshot } from "./d1-publish";

type SnapshotReadState = {
	readInFlight: Promise<ModelAtlasPayload | null> | null;
	cachedPayload: ModelAtlasPayload | null;
	cacheExpiresAt: number;
};

type SnapshotRuntime = {
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

/** Collapse concurrent reads and keep a short in-memory result for repeated server renders. */
export async function readDisplaySnapshotPayload(): Promise<ModelAtlasPayload | null> {
	const state = getSnapshotReadState();
	if (state.cachedPayload != null && Date.now() < state.cacheExpiresAt) {
		return state.cachedPayload;
	}
	state.readInFlight ??= readDisplayPayloadUncached().finally(() => {
		state.readInFlight = null;
	});
	return state.readInFlight;
}

/** Display reads never trigger writes; refresh is owned by the authenticated refresh route. */
async function readDisplayPayloadUncached(): Promise<ModelAtlasPayload | null> {
	const runtime = snapshotRuntime();
	if (!runtime.requiresD1 && runtime.remoteSnapshotUrl) {
		const payload = await fetchRemoteSnapshot(runtime.remoteSnapshotUrl).catch(
			() => null,
		);
		cacheDisplayPayload(payload);
		return payload;
	}
	assertD1Configured(runtime);
	const storedPayload = await readD1Payload();
	const payload =
		storedPayload == null ? null : withCurrentMetadata(storedPayload);
	cacheDisplayPayload(payload);
	return payload;
}

function cacheDisplayPayload(payload: ModelAtlasPayload | null): void {
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
): Promise<ModelAtlasPayload> {
	assertD1Configured(runtime);
	const { payload } = await publishD1Snapshot();
	return withCurrentMetadata(payload);
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

async function fetchRemoteSnapshot(url: string): Promise<ModelAtlasPayload> {
	const response = await fetch(url, {
		cache: "no-store",
	});
	if (!response.ok) {
		throw new Error(
			`Unable to fetch Model Atlas snapshot: HTTP ${response.status}`,
		);
	}
	return withCurrentMetadata(await response.json());
}

/** Keep cached payload rows, but rebuild metadata from current code-owned benchmark and scoring policy. */
function withCurrentMetadata(payload: ModelAtlasPayload): ModelAtlasPayload {
	return {
		...payload,
		metadata: buildCurrentModelAtlasMetadata({
			models: payload.models,
			healthModels: payload.models,
			artificialAnalysis: payload.metadata?.artificial_analysis,
			sourceHealth: payload.metadata?.source_health,
			benchmarkUpdateHealth: payload.metadata?.benchmark_update_health,
			availabilitySource: "artificial_analysis",
		}),
	};
}
