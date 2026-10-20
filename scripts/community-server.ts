/** Cloud Run accepts bearer-authenticated research records and publishes them through the shared SQLite checkpoint. */

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { submitCommunityRanking } from "../src/model-atlas/database/snapshots/community-rankings";
import { configuredSnapshotStorage } from "../src/model-atlas/database/snapshots/publish";

const token = process.env.MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN;
if (!token) throw new Error("MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN is required");
const expectedTokenHash = createHash("sha256").update(token).digest();
const store = configuredSnapshotStorage();
const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function handle(request: IncomingMessage, response: ServerResponse) {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST" || request.url !== "/api/community/rankings") {
    send(404, { errors: ["Unknown endpoint"] });
    return;
  }
  const presented = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (
    !presented ||
    !timingSafeEqual(createHash("sha256").update(presented).digest(), expectedTokenHash)
  ) {
    send(401, { errors: ["A valid bearer token is required"] });
    return;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      send(413, { errors: ["The ranking exceeds the 4 MiB submission limit"] });
      return;
    }
    chunks.push(chunk);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    send(400, { errors: ["The body must be a JSON ranking"] });
    return;
  }
  const result = await submitCommunityRanking(store, value, new Date());
  send(result.status, result.body);
}

createServer((request, response) => {
  void handle(request, response).catch(() => {
    response.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(
      JSON.stringify({
        errors: ["Unable to confirm ranking publication; retry the identical submission"],
      }),
    );
  });
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
