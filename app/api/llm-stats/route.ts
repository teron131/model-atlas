/** Public LLM stats API for Model Atlas. */

import type { LlmStatsPayload } from "../../../src/model-atlas/stats/types";
import { publicCacheHeaders } from "../cache-headers";
import { publicJsonPayload } from "./public-json";
import { readDisplaySnapshotPayload } from "./snapshot-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const PUBLIC_SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 60,
	cdnMaxAgeSeconds: 300,
	staleWhileRevalidateSeconds: 3600,
});

export async function GET(request: Request) {
	const view =
		new URL(request.url).searchParams.get("view") ??
		request.headers.get("x-model-atlas-view");
	try {
		const deployedSnapshot = await readDisplaySnapshotPayload();
		if (deployedSnapshot != null) {
			return jsonPayloadResponse(deployedSnapshot, view);
		}
		return unavailableSnapshotResponse();
	} catch {
		return new Response("Unable to read stats", {
			status: 500,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/plain; charset=utf-8",
			},
		});
	}
}

function unavailableSnapshotResponse(): Response {
	return new Response("Stats snapshot unavailable", {
		status: 503,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}

function jsonPayloadResponse(payload: LlmStatsPayload, view: string | null) {
	return Response.json(publicJsonPayload(payload, view), {
		headers: PUBLIC_SNAPSHOT_CACHE_HEADERS,
	});
}
