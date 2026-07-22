/** JSON-friendly root routes that rewrite API-shaped requests to the stats endpoint while leaving browser navigation on the app shell. */

import { type NextRequest, NextResponse } from "next/server";

import type { LlmStatsJsonView } from "./src/model-atlas/stats/payload/public-json";

type RoutedJsonView = Exclude<LlmStatsJsonView, "full">;

const jsonViewByPath = new Map<string, RoutedJsonView>([
	["/", "score"],
	["/score", "score"],
	["/scores", "score"],
	["/core", "core"],
	["/benchmarks", "benchmarks"],
	["/all", "all"],
]);

export function proxy(request: NextRequest) {
	const view = jsonViewByPath.get(request.nextUrl.pathname);
	if (view == null) {
		return NextResponse.next();
	}

	const accept = request.headers.get("accept") ?? "";
	if (!wantsJsonResponse(accept)) {
		return request.nextUrl.pathname === "/"
			? NextResponse.next()
			: NextResponse.redirect(new URL("/", request.url));
	}

	const url = request.nextUrl.clone();
	setLlmStatsApiUrl(url, view);
	const headers = new Headers(request.headers);
	headers.set("x-model-atlas-view", view);
	return NextResponse.rewrite(url, {
		request: {
			headers,
		},
	});
}

export function jsonViewForPath(pathname: string): RoutedJsonView | null {
	return jsonViewByPath.get(pathname) ?? null;
}

export function setLlmStatsApiUrl(
	url: Pick<URL, "pathname" | "search" | "searchParams">,
	view: RoutedJsonView,
): void {
	url.pathname = "/api/llm-stats";
	url.search = "";
	if (view !== "score") {
		url.searchParams.set("view", view);
	}
}

export function wantsJsonResponse(accept: string): boolean {
	const normalizedAccept = accept.toLowerCase();
	if (normalizedAccept.includes("text/html")) {
		return false;
	}
	return (
		normalizedAccept.length === 0 ||
		normalizedAccept.includes("application/json") ||
		normalizedAccept.includes("*/*")
	);
}
