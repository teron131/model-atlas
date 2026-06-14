import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { NextRequest } from "next/server";

import { statsLogoCacheDir } from "../../../../src/model-atlas/logo-cache";
import { publicCacheHeaders } from "../../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const LOGO_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 3600,
	cdnMaxAgeSeconds: 86400,
	staleWhileRevalidateSeconds: 604800,
	contentType: "image/png",
});
const LOGO_NOT_FOUND_CACHE_HEADERS = publicCacheHeaders({
	browserMaxAgeSeconds: 300,
	cdnMaxAgeSeconds: 3600,
	contentType: "text/plain; charset=utf-8",
});

export async function GET(request: NextRequest) {
	const logo = request.nextUrl.pathname.split("/").at(-1) ?? "";
	if (!/^[a-z0-9._-]+\.png$/.test(logo)) {
		return notFoundResponse();
	}

	try {
		const file = await readFile(resolve(statsLogoCacheDir(), logo));
		return new Response(file, {
			headers: LOGO_CACHE_HEADERS,
		});
	} catch {
		return notFoundResponse();
	}
}

function notFoundResponse() {
	return new Response("Not found", {
		status: 404,
		headers: LOGO_NOT_FOUND_CACHE_HEADERS,
	});
}
