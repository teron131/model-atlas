/** Trust Me Bro Index candidates for a research run, without scores or any earlier TMB order. */

import { readPublishedSnapshot } from "../../../../src/model-atlas/database/runtime-snapshot";
import { tmbCandidates } from "../../../../src/model-atlas/stats/tmb-index";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const asOf = new Date().toISOString().slice(0, 10);
    return Response.json(
      { as_of: asOf, models: tmbCandidates(await readPublishedSnapshot(), asOf) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { errors: ["Unable to read the benchmark snapshot"] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
