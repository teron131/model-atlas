/** Forward authenticated submissions to the Cloud Run writer that owns SQLite checkpoint publication. */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const writerUrl = process.env.MODEL_ATLAS_COMMUNITY_WRITER_URL;
  if (!writerUrl) {
    return Response.json(
      { errors: ["Community index submissions are not configured"] },
      { status: 503, headers: NO_STORE },
    );
  }
  try {
    const response = await fetch(new URL("/api/community/rankings", writerUrl), {
      method: "POST",
      headers: {
        Authorization: request.headers.get("authorization") ?? "",
        "Content-Type": "application/json",
      },
      body: await request.text(),
      signal: AbortSignal.timeout(280_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { ...NO_STORE, "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { errors: ["Unable to confirm ranking publication; retry the identical submission"] },
      { status: 502, headers: NO_STORE },
    );
  }
}
