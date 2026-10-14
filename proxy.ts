/** JSON-friendly root routes that rewrite API-shaped requests to the stats endpoint while leaving browser navigation on the app shell. */

import { type NextRequest, NextResponse } from "next/server";

import type { ModelAtlasJsonView } from "./app/leaderboard/public-json";

type RoutedJsonView = Exclude<ModelAtlasJsonView, "dashboard">;

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

  if (!wantsJsonResponse(request.headers)) {
    return request.nextUrl.pathname === "/"
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
  }

  const url = request.nextUrl.clone();
  setModelAtlasApiUrl(url, view);
  const headers = new Headers(request.headers);
  headers.set("x-model-atlas-view", view);
  return NextResponse.rewrite(url, {
    request: {
      headers,
    },
  });
}

function setModelAtlasApiUrl(
  url: Pick<URL, "pathname" | "search" | "searchParams">,
  view: RoutedJsonView,
): void {
  url.pathname = "/api/llm-stats";
  url.search = "";
  if (view !== "score") {
    url.searchParams.set("view", view);
  }
}

/**
 * Decide between the JSON view and the app shell for one of the root routes.
 *
 * The app router fetches a route's payload with a wildcard Accept, and Next removes `rsc` and its other router headers before this proxy runs.
 * It leaves `next-url`, which only the app router sends, so that header marks the router's own fetches without changing the answer for any other client.
 * Answering those fetches with JSON made every in-app return to the leaderboard a full page reload.
 */
function wantsJsonResponse(headers: Headers): boolean {
  const accept = (headers.get("accept") ?? "").toLowerCase();
  if (accept.includes("text/html") || headers.has("next-url")) {
    return false;
  }
  return accept.length === 0 || accept.includes("application/json") || accept.includes("*/*");
}
