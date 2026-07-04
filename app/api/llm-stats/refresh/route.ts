/** Snapshot refresh API for Model Atlas. */

import {
	d1SnapshotConfigured,
	missingD1SnapshotEnvironment,
	refreshD1StoredSnapshot,
} from "../snapshot-store";

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
	if (!d1SnapshotConfigured()) {
		return Response.json(
			{
				status: "error",
				error: `Cloudflare D1 is not configured. Add ${missingD1SnapshotEnvironment().join(", ")}.`,
			},
			{
				status: 503,
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	}

	const payload = await refreshD1StoredSnapshot();
	if (payload == null) {
		return Response.json(
			{
				status: "error",
				error:
					"Cloudflare D1 refresh completed without a readable Model Atlas snapshot.",
			},
			{
				status: 404,
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	}
	return Response.json(
		{
			status: "ok",
			storage: "cloudflare_d1",
			model_count: payload.models.length,
			fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
			database_id: process.env.D1_DATABASE_ID,
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
