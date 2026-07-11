/** Snapshot refresh API for Model Atlas. */

import { refreshStoredSnapshot } from "../snapshot-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
	return refreshSnapshot(request);
}

export async function POST(request: Request) {
	return refreshSnapshot(request);
}

async function refreshSnapshot(request: Request) {
	if (!isAuthorized(request)) {
		return new Response("Unauthorized", {
			status: 401,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/plain; charset=utf-8",
			},
		});
	}
	const payload = await refreshStoredSnapshot();
	return Response.json(
		{
			status: "ok",
			model_count: payload.models.length,
			fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		},
		{
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}

function isAuthorized(request: Request): boolean {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret) {
		return process.env.VERCEL !== "1";
	}
	return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
