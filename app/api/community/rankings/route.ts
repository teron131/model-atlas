/** One authenticated submission publishes the TMB and Slop graphs atomically; status codes and the shared contract are in .agents/skills/community-indexes/SKILL.md. */

import { createHash, timingSafeEqual } from "node:crypto";

import { communityCandidates } from "../../../../src/model-atlas/community/rankings";
import { readPublishedSnapshot } from "../../../../src/model-atlas/database/runtime-snapshot";
import {
  CommunityRankingStorage,
  submitCommunityRanking,
} from "../../../../src/model-atlas/database/snapshots/community-rankings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const token = process.env.MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN;
  if (!token || (process.env.VERCEL && !process.env.MODEL_ATLAS_COMMUNITY_WRITER_CREDENTIALS)) {
    return Response.json(
      { errors: ["Community index submissions are not configured"] },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!hasBearerToken(request.headers.get("authorization"), token)) {
    return Response.json(
      { errors: ["A valid bearer token is required"] },
      { status: 401, headers: NO_STORE },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { errors: ["The body must be a JSON ranking"] },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const now = new Date();
    const result = await submitCommunityRanking(new CommunityRankingStorage(), body, {
      candidates: async () =>
        communityCandidates(await readPublishedSnapshot(), now.toISOString().slice(0, 10)),
      now,
    });
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch {
    return Response.json(
      { errors: ["Unable to save the ranking; the active ranking is unchanged"] },
      { status: 500, headers: NO_STORE },
    );
  }
}

/** Constant-time comparison of fixed-length digests. */
function hasBearerToken(header: string | null, token: string) {
  const presented = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (presented == null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(token));
}
