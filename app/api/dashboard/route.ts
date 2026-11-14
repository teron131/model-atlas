/** The dashboard's own feed: the whole display snapshot the page renders from, kept apart from the sliced public stats API. */

import { publicJsonResponse } from "../public-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return publicJsonResponse(request, { kind: "dashboard" });
}
