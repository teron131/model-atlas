/** One benchmark's slice: its results for the ranked models, best first, in the source's units. */

import { publicJsonResponse } from "../../../../leaderboard/public-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  return publicJsonResponse(request, { kind: "benchmark", key: (await params).key });
}
