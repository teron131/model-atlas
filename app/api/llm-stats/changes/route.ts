/** One model variant's updates in the change-history window, read from the published change-history artifact. */

import { readChangeHistory } from "../../../../src/model-atlas/database/runtime-snapshot";
import { NO_STORE_HEADERS, SNAPSHOT_CACHE_HEADERS } from "../../cache-headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `model` names the variant's model id and `effort` its reasoning effort, omitted for a model without one; a variant with no updates in the window answers an empty list. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const modelId = params.get("model");
  if (!modelId) {
    return Response.json({ error: "Name a model with ?model=" }, { status: 400 });
  }
  const effort = params.get("effort") || null;
  try {
    const variant = (await readChangeHistory()).find(
      ({ model_id, reasoning_effort }) => model_id === modelId && reasoning_effort === effort,
    );
    return Response.json(
      { model_id: modelId, reasoning_effort: effort, updates: variant?.updates ?? [] },
      { headers: SNAPSHOT_CACHE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Unable to read change history" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
