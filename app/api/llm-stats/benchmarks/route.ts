/** The portfolio's benchmark keys, names, and classes, which the per-benchmark slice accepts. */

import { publicJsonResponse } from "../../public-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  return publicJsonResponse(request, { kind: "benchmarks" });
}
