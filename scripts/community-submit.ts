/** Validate and submit the dated TMB and Slop graphs together, then verify the complete stored record; the token comes only from the environment. */

import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { parseCommunityRanking } from "../src/model-atlas/community/rankings";

const [file] = process.argv.slice(2);
const token = process.env.MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN;
const baseUrl = (
  process.env.MODEL_ATLAS_COMMUNITY_BASE_URL ?? "https://llmstats.vercel.app"
).replace(/\/+$/, "");
if (!file || !token) {
  console.error(
    "Usage: MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN=<token> pnpm community:submit <ranking.json>",
  );
  process.exit(2);
}

const body = readFileSync(file, "utf8");
const { ranking: sent, errors } = parseCommunityRanking(JSON.parse(body));
if (sent == null) {
  console.error(`Invalid ranking: ${errors.join("; ")}`);
  process.exit(1);
}
const response = await fetch(`${baseUrl}/api/community/rankings`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body,
  signal: AbortSignal.timeout(60_000),
});
const receipt = (await response.json()) as { ranked_at?: string; errors?: string[] };
if (response.status !== 200 && response.status !== 201) {
  console.error(`Submission rejected (HTTP ${response.status}):`);
  console.error(JSON.stringify(receipt, null, 2));
  process.exit(1);
}

const readBackUrl = `${baseUrl}/api/community/rankings/${encodeURIComponent(sent.ranked_at)}`;
const readBack = await fetch(readBackUrl, { signal: AbortSignal.timeout(30_000) });
const stored = (await readBack.json()) as { ranking?: unknown };
if (!readBack.ok || !isDeepStrictEqual(stored.ranking, sent)) {
  console.error(
    `Read-back from ${readBackUrl} does not match what was sent; treat the run as unverified.`,
  );
  process.exit(1);
}
console.log(JSON.stringify({ ...receipt, verified: true }, null, 2));
