/** Public LLM stats API for Model Atlas: the ranked scores, one row per model or with `efforts=all` per reasoning effort, with the other slices under their own paths. */

import { leaderboardDisplay, publicJsonResponse } from "../../leaderboard/public-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return publicJsonResponse(request, { kind: "scores", display: leaderboardDisplay(request) });
}
