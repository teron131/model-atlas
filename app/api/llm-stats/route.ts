/** Public LLM stats API for Model Atlas. */

import type { LlmStatsPayload } from "../../../src/model-atlas/stats/types";
import { publicCacheHeaders } from "../cache-headers";
import { publicJsonPayload } from "./public-json";
import {
	readBestStoredSnapshotPayload,
	refreshLocalSnapshotPayload,
} from "./snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const PUBLIC_SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 60,
	cdnMaxAgeSeconds: 300,
	staleWhileRevalidateSeconds: 3600,
});

type RefreshState = {
	payload: LlmStatsPayload | null;
	refreshInFlight: Promise<LlmStatsPayload> | null;
};

const refreshState = globalThis as typeof globalThis & {
	__modelAtlasRefreshState?: RefreshState;
};

export async function GET(request: Request) {
	const view = jsonViewForRequest(request);
	try {
		const deployedSnapshot = await readBestStoredSnapshotPayload();
		if (deployedSnapshot != null) {
			return jsonPayloadResponse(deployedSnapshot, view);
		}

		const state = getRefreshState();
		state.refreshInFlight ??= refreshLocalSnapshotPayload().finally(() => {
			state.refreshInFlight = null;
		});
		const payload = await state.refreshInFlight;
		state.payload = payload;
		return jsonPayloadResponse(payload, view);
	} catch {
		const fallbackPayload = getRefreshState().payload;
		if (fallbackPayload != null) {
			return jsonPayloadResponse(fallbackPayload, view);
		}
		return new Response("Unable to refresh stats", {
			status: 500,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/plain; charset=utf-8",
			},
		});
	}
}

function jsonViewForRequest(request: Request): string | null {
	return (
		new URL(request.url).searchParams.get("view") ??
		request.headers.get("x-model-atlas-view")
	);
}

function jsonPayloadResponse(payload: LlmStatsPayload, view: string | null) {
	return Response.json(publicJsonPayload(payload, view), {
		headers: PUBLIC_SNAPSHOT_CACHE_HEADERS,
	});
}

function getRefreshState(): RefreshState {
	refreshState.__modelAtlasRefreshState ??= {
		payload: null,
		refreshInFlight: null,
	};
	return refreshState.__modelAtlasRefreshState;
}
