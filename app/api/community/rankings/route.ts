/** Forward authenticated submissions to the Cloud Run writer that owns SQLite checkpoint publication. */

import { NO_STORE_HEADERS } from "../../cache-headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const writerUrl = process.env.MODEL_ATLAS_COMMUNITY_WRITER_URL;
  if (!writerUrl) {
    return Response.json(
      { errors: ["Community index submissions are not configured"] },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  // The writer's own answer to a request without a bearer token, given here so an anonymous caller cannot make this route buffer a body and call the writer; the writer still verifies the token.
  if (!/^Bearer\s+.+$/i.test(authorization)) {
    return Response.json(
      { errors: ["A valid bearer token is required"] },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const response = await fetch(new URL("/api/community/rankings", writerUrl), {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: await request.text(),
      signal: AbortSignal.timeout(280_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { errors: ["Unable to confirm ranking publication; retry the identical submission"] },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
