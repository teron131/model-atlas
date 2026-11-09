/** One model's slice: every scored effort with all its public fields, addressed by an id that keeps its provider slash. */

import { publicJsonResponse } from "../../../../leaderboard/public-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string[] }> }) {
  return publicJsonResponse(request, { kind: "model", id: (await params).id.join("/") });
}
