/** The site root answers JSON clients with the ranked scores while leaving browser navigation on the app shell. */

import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/" || !wantsJsonResponse(request.headers)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/api/llm-stats";
  url.search = "";
  return NextResponse.rewrite(url);
}

/**
 * The app router fetches a route's payload with a wildcard Accept, and Next removes `rsc` and its other router headers before this proxy runs.
 * It leaves `next-url`, which only the app router sends, so that header marks the router's own fetches without changing the answer for any other client.
 * Answering those fetches with JSON would turn every in-app return to the leaderboard into a full page reload.
 */
function wantsJsonResponse(headers: Headers): boolean {
  const accept = (headers.get("accept") ?? "").toLowerCase();
  if (accept.includes("text/html") || headers.has("next-url")) {
    return false;
  }
  return accept.length === 0 || accept.includes("application/json") || accept.includes("*/*");
}
