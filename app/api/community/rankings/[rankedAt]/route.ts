/** Read back both graphs and their research log by shared `ranked_at`, or the active record at `current`. */

import { readCommunityRanking } from "../../../../../src/model-atlas/database/runtime-snapshot";
import { NO_STORE_HEADERS } from "../../../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rankedAt: string }> },
) {
  const { rankedAt } = await params;
  try {
    const stored = await readCommunityRanking(rankedAt);
    return stored == null
      ? Response.json(
          { errors: [rankedAt === "current" ? "No ranking is active" : "Unknown ranking"] },
          { status: 404, headers: NO_STORE_HEADERS },
        )
      : Response.json(stored, { headers: NO_STORE_HEADERS });
  } catch {
    return Response.json(
      { errors: ["Unable to read the ranking"] },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
