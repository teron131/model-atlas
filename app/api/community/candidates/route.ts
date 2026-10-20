/** Shared TMB and Slop candidates for one research run, without scores or previous index positions. */

import { communityCandidates } from "../../../../src/model-atlas/community/rankings";
import { readPublishedSnapshot } from "../../../../src/model-atlas/database/runtime-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const asOf = new Date().toISOString().slice(0, 10);
    return Response.json(
      { as_of: asOf, models: communityCandidates(await readPublishedSnapshot(), asOf) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { errors: ["Unable to read the benchmark snapshot"] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
