/**
 * Complete model datasets from Artificial Analysis public page manifests.
 *
 * Page source: https://artificialanalysis.ai
 */

import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { asRecord, type JsonObject, stringValue } from "../../runtime";
import { extractNextFlightCorpus } from "../parsing";
import { fetchSource } from "../request-scheduler";

/** Read the complete model dataset, never the limited preview or a provider-inference table. */
export async function getArtificialAnalysisPageModels(
  url: string,
  timeoutMs: number,
): Promise<JsonObject[]> {
  const html = await fetchSource(url, {}, timeoutMs, async (response) => {
    if (!response.ok) throw new Error(`Artificial Analysis page failed: ${response.status}`);
    return response.text();
  });
  const corpus = extractNextFlightCorpus(html);
  for (const match of corpus.matchAll(/"manifest":(\{[^}]+\})/g)) {
    const manifest = asRecord(JSON.parse(match[1]!));
    const path = stringValue(manifest.path);
    if (path == null) throw new Error("Missing Artificial Analysis page-data path");
    const dataUrl = new URL(path, url);
    if (dataUrl.origin !== new URL(url).origin)
      throw new Error("Unexpected Artificial Analysis page-data origin");
    const data = await fetchSource(dataUrl, {}, timeoutMs, async (response) => {
      if (!response.ok) throw new Error(`Artificial Analysis page data failed: ${response.status}`);
      if (typeof manifest.key !== "string") return response.json();
      const encrypted = Buffer.from(await response.arrayBuffer());
      const key = Buffer.from(manifest.key, "hex");
      const iv = createHash("sha256").update(key).digest().subarray(0, 12);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(encrypted.subarray(-16));
      return JSON.parse(
        gunzipSync(
          Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]),
        ).toString(),
      );
    });
    const models = asRecord(data).models;
    if (Array.isArray(models) && models.length > 0) return models.map(asRecord);
  }
  throw new Error("Missing complete Artificial Analysis model dataset");
}
