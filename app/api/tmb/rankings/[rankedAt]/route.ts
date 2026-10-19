/** Trust Me Bro Index read-back by `ranked_at`, or the active ranking at `current`. */

import {
  readActiveTmbRanking,
  readTmbRanking,
} from "../../../../../src/model-atlas/database/snapshots/tmb-rankings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rankedAt: string }> },
) {
  const { rankedAt } = await params;
  try {
    if (rankedAt === "current") {
      const ranking = await readActiveTmbRanking();
      return ranking == null
        ? Response.json({ errors: ["No ranking is active"] }, { status: 404, headers: NO_STORE })
        : Response.json({ active: true, ranking }, { headers: NO_STORE });
    }
    const stored = await readTmbRanking(rankedAt);
    return stored == null
      ? Response.json({ errors: ["Unknown ranking"] }, { status: 404, headers: NO_STORE })
      : Response.json(stored, { headers: NO_STORE });
  } catch {
    return Response.json(
      { errors: ["Unable to read the ranking"] },
      { status: 500, headers: NO_STORE },
    );
  }
}
