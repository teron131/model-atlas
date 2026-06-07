import { publicCacheHeaders } from "../cache-headers";
import { readSnapshotPayload, refreshRequestPayload } from "./snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const PUBLIC_SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 60,
	cdnMaxAgeSeconds: 300,
	staleWhileRevalidateSeconds: 3600,
});

type RefreshState = {
	payload: unknown | null;
	refreshInFlight: Promise<unknown> | null;
};

const refreshState = globalThis as typeof globalThis & {
	__modelAtlasRefreshState?: RefreshState;
};

export async function GET() {
	try {
		const deployedSnapshot = await readSnapshotPayload();
		if (deployedSnapshot != null) {
			return Response.json(deployedSnapshot, {
				headers: PUBLIC_SNAPSHOT_CACHE_HEADERS,
			});
		}

		const state = getRefreshState();
		state.refreshInFlight ??= refreshRequestPayload().finally(() => {
			state.refreshInFlight = null;
		});
		const payload = await state.refreshInFlight;
		state.payload = payload;
		return Response.json(payload, {
			headers: PUBLIC_SNAPSHOT_CACHE_HEADERS,
		});
	} catch {
		const fallbackPayload = getRefreshState().payload;
		if (fallbackPayload != null) {
			return Response.json(fallbackPayload, {
				headers: PUBLIC_SNAPSHOT_CACHE_HEADERS,
			});
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

function getRefreshState(): RefreshState {
	refreshState.__modelAtlasRefreshState ??= {
		payload: null,
		refreshInFlight: null,
	};
	return refreshState.__modelAtlasRefreshState;
}
