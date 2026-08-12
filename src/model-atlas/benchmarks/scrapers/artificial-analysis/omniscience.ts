/** Parses the dedicated Artificial Analysis Omniscience page's JSON-LD score dataset into benchmark observations while resource telemetry remains owned by the shared evaluation-page scraper. */

import { benchmarkModelEffort } from "../../../identity/normalization";
import { asFiniteNumber, asRecord, fetchWithTimeout, nowEpochSeconds } from "../../../runtime";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "../../../scrapers/artificial-analysis/model-labels";
import type { BenchmarkObservationPayload, BenchmarkObservationRow } from "../../observation";

const DEFAULT_TIMEOUT_MS = 30_000;
const DATASET_NAME = "AA-Omniscience Accuracy";
const JSON_LD_SCRIPT_PATTERN =
  /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const VALUE_FIELD = "omniscienceAccuracy";

export type ArtificialAnalysisOmniscienceOptions = {
  benchmarkKey: string;
  sourceUrl: string;
  timeoutMs?: number;
};

function datasetRows(pageHtml: string): unknown[] {
  for (const match of pageHtml.matchAll(JSON_LD_SCRIPT_PATTERN)) {
    try {
      const dataset = asRecord(JSON.parse(match[1] ?? ""));
      if (dataset.name === DATASET_NAME && Array.isArray(dataset.data)) {
        return dataset.data;
      }
    } catch {
      continue;
    }
  }
  return [];
}

function modelSlug(detailsUrl: unknown): string | null {
  if (typeof detailsUrl !== "string") {
    return null;
  }
  const slug = detailsUrl.split("?")[0]?.split("/").filter(Boolean).at(-1);
  return slug == null || slug.length === 0 ? null : slug;
}

/** Normalize the declared Omniscience JSON-LD dataset into shared benchmark observations. */
export function processArtificialAnalysisOmnisciencePage(
  pageHtml: string,
  options: Omit<ArtificialAnalysisOmniscienceOptions, "timeoutMs">,
): BenchmarkObservationRow[] {
  return datasetRows(pageHtml).flatMap((sourceRow, index) => {
    const row = asRecord(sourceRow);
    const label = typeof row.label === "string" ? row.label : null;
    const value = asFiniteNumber(row[VALUE_FIELD]);
    if (label == null || value == null) {
      return [];
    }
    const model = cleanArtificialAnalysisModelName(label) ?? label;
    const parsedModel = benchmarkModelEffort(model);
    return [
      {
        benchmark_key: options.benchmarkKey,
        source_url: options.sourceUrl,
        model_id: modelSlug(row.detailsUrl),
        model,
        base_model: parsedModel.baseModel,
        reasoning_effort:
          parseArtificialAnalysisReasoningEffort(label) ?? parsedModel.reasoningEffort,
        model_creator: null,
        rank: index + 1,
        canonical_value: value,
        observed_at: null,
        metadata: {
          dataset_name: DATASET_NAME,
          ...(typeof row.detailsUrl === "string" ? { details_url: row.detailsUrl } : {}),
        },
      },
    ];
  });
}

/** Fetch the Artificial Analysis Omniscience page and select its declared benchmark dataset. */
export async function getArtificialAnalysisOmniscienceStats(
  options: ArtificialAnalysisOmniscienceOptions,
): Promise<BenchmarkObservationPayload> {
  const response = await fetchWithTimeout(
    options.sourceUrl,
    {},
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`Artificial Analysis Omniscience scrape failed: ${response.status}`);
  }
  const data = processArtificialAnalysisOmnisciencePage(await response.text(), options);
  return {
    fetched_at_epoch_seconds: data.length === 0 ? null : nowEpochSeconds(),
    data,
  };
}
