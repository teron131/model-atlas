/** Submit both dated graphs and verify the stored record, with authentication from the environment or Secret Manager. */

import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { isDeepStrictEqual } from "node:util";

import { Storage } from "@google-cloud/storage";

import { parseCommunityRanking } from "../src/model-atlas/community/rankings";

const [file] = process.argv.slice(2);
if (existsSync(".env")) loadEnvFile(".env");
let token = process.env.MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN;
const tokenSecretName = process.env.MODEL_ATLAS_COMMUNITY_TOKEN_SECRET;
if (!token && tokenSecretName) {
  try {
    const response = await new Storage().authClient.request<{ payload: { data: string } }>({
      url: `https://secretmanager.googleapis.com/v1/${tokenSecretName}:access`,
      timeout: 15_000,
    });
    token = Buffer.from(response.data.payload.data, "base64").toString("utf8");
  } catch {
    console.error("Unable to read the community submission token from Secret Manager");
    process.exit(1);
  }
}
const baseUrl = (
  process.env.MODEL_ATLAS_COMMUNITY_BASE_URL ?? "https://llmstats.vercel.app"
).replace(/\/+$/, "");
if (!file || !token) {
  console.error(
    "Usage: pnpm community:submit <ranking.json> with MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN or MODEL_ATLAS_COMMUNITY_TOKEN_SECRET configured",
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
  signal: AbortSignal.timeout(300_000),
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
