/** The ranked table slice: each listed model's strongest-Intelligence effort with its selection columns, or with `efforts=all` every listed reasoning effort. */

import { leaderboardDisplay, publicJsonResponse } from "../../../leaderboard/public-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return publicJsonResponse(request, { kind: "models", display: leaderboardDisplay(request) });
}
