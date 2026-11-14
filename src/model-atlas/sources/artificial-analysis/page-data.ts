/**
 * Complete model datasets from Artificial Analysis public pages, read from each page's dataset manifest or, on a page without one, from its own model records.
 *
 * Page source: https://artificialanalysis.ai
 */

import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { asNonEmptyString, asRecord, type JsonObject } from "../../runtime";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../parsing";
import { fetchSource, fetchSourceText } from "../request-scheduler";

const RECORD_SEARCH_BACKTRACK_CHARS = 70_000;

type ArtificialAnalysisPage = {
  title: string | null;
  models: JsonObject[];
};

/**
 * Read a page's title and complete model dataset, never the limited preview or a provider-inference table.
 * Pages with a manifest carry only a preview in their own records, so `inPageRecordKey` reads the page's records carrying that key only when it publishes no manifest at all.
 */
export async function getArtificialAnalysisPage(
  url: string,
  inPageRecordKey?: string,
): Promise<ArtificialAnalysisPage> {
  const html = await fetchSourceText(url);
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null;
  const corpus = extractNextFlightCorpus(html);
  // A manifest is a flat object: `"manifest":{"path":"/api/data/abc.bin","key":"00ff"}` → `{"path":"/api/data/abc.bin","key":"00ff"}`.
  const manifests = [...corpus.matchAll(/"manifest":(\{[^}]+\})/g)];
  for (const match of manifests) {
    const manifest = asRecord(JSON.parse(match[1]!));
    const path = asNonEmptyString(manifest.path);
    if (path == null) throw new Error("Missing Artificial Analysis page-data path");
    const dataUrl = new URL(path, url);
    if (dataUrl.origin !== new URL(url).origin)
      throw new Error("Unexpected Artificial Analysis page-data origin");
    const data = await fetchSource(dataUrl, {}, async (response) => {
      if (!response.ok) throw new Error(`Artificial Analysis page data failed: ${response.status}`);
      // A keyed manifest serves gzipped JSON sealed with AES-256-GCM: the hex `key` is the key, the nonce is the first 12 bytes of its SHA-256, and the last 16 bytes of the body are the auth tag.
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
    if (Array.isArray(models) && models.length > 0) return { title, models: models.map(asRecord) };
  }
  if (manifests.length === 0 && inPageRecordKey != null) {
    const models = inPageRecords(corpus, inPageRecordKey);
    if (models.length > 0) return { title, models };
  }
  throw new Error("Missing complete Artificial Analysis model dataset");
}

/** Flight repeats model records across chunks, so keep one complete record per slug. */
function inPageRecords(corpus: string, key: string): JsonObject[] {
  const records = new Map<string, JsonObject>();
  let cursor = 0;
  while (true) {
    const hit = corpus.indexOf(`"${key}":`, cursor);
    if (hit === -1) break;
    cursor = hit + 1;
    const searchStart = Math.max(0, hit - RECORD_SEARCH_BACKTRACK_CHARS);
    for (let start = hit; start >= searchStart; start -= 1) {
      if (corpus[start] !== "{") continue;
      const end = findObjectEnd(corpus, start);
      if (end < hit) continue;
      const record = parseFlightJsonObject(corpus.slice(start, end + 1));
      if (typeof record?.slug === "string" && record[key] != null) {
        records.set(record.slug, record);
        break;
      }
    }
  }
  return [...records.values()];
}
