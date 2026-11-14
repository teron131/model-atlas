/** The shared research pool and full catalog identity context exclude scores and previous community positions. */

import { communityCandidates } from "../../../../src/model-atlas/community/rankings";
import { readPublishedPayload } from "../../../../src/model-atlas/database/runtime-snapshot";
import { NO_STORE_HEADERS } from "../../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const asOf = new Date().toISOString().slice(0, 10);
    const payload = await readPublishedPayload();
    const catalog = new Map<
      string,
      { model_id: string; name: string; release_date: string | null }
    >();
    for (const model of payload.models) {
      if (model.id == null) continue;
      catalog.set(model.id, {
        model_id: model.id,
        name: model.name ?? model.id,
        release_date: model.release_date,
      });
    }
    return Response.json(
      {
        as_of: asOf,
        models: communityCandidates(payload, asOf),
        catalog: [...catalog.values()].sort((left, right) =>
          left.model_id.localeCompare(right.model_id),
        ),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { errors: ["Unable to read the benchmark snapshot"] },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
