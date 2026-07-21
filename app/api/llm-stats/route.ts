/** Public LLM stats API for Model Atlas. */

import { readDisplaySnapshotPayload } from "../../../src/model-atlas/database/runtime-snapshot";
import { publicJsonPayload } from "../../../src/model-atlas/stats/public-json";
import { publicCacheHeaders } from "../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const SNAPSHOT_CACHE_HEADERS = publicCacheHeaders({
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
			return Response.json(publicJsonPayload(deployedSnapshot, view), {
				headers: SNAPSHOT_CACHE_HEADERS,
			});
		}
		return new Response("Stats snapshot unavailable", {
			status: 503,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/plain; charset=utf-8",
			},
		});
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
