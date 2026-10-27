/**
 * AA-Omniscience accuracy from Artificial Analysis.
 *
 * Page source: https://artificialanalysis.ai/evaluations/omniscience
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../parsing";
import { fetchSource } from "../request-scheduler";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "./model-labels";

const DEFAULT_TIMEOUT_MS = 30_000;

const DATASET_NAME = "AA-Omniscience Accuracy";

const ROW_DETECTION_KEY = "omniscienceBreakdown";

const MODEL_SEARCH_BACKTRACK_CHARS = 70_000;

type ArtificialAnalysisOmniscienceOptions = {
  benchmarkKey: string;
  sourceUrl: string;
  timeoutMs?: number;
};

export async function getArtificialAnalysisOmniscienceStats(
  options: ArtificialAnalysisOmniscienceOptions,
): Promise<BenchmarkObservationPayload> {
  return await fetchSource(
    options.sourceUrl,
    {},
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    async (response) => {
      if (!response.ok) {
        throw new Error(`Artificial Analysis Omniscience scrape failed: ${response.status}`);
      }
      const data = processArtificialAnalysisOmnisciencePage(await response.text(), options);
      return {
        fetched_at_epoch_seconds: data.length === 0 ? null : nowEpochSeconds(),
        data,
      };
    },
  );
}

/**
 * Normalize model-level accuracy from the page's Flight data into shared benchmark observations.
 * Resource telemetry for this benchmark comes from the shared evaluation-page scraper instead.
 */
export function processArtificialAnalysisOmnisciencePage(
  pageHtml: string,
  options: Omit<ArtificialAnalysisOmniscienceOptions, "timeoutMs">,
): BenchmarkObservationRow[] {
  return modelRows(pageHtml)
    .flatMap((sourceRow) => {
      const row = asRecord(sourceRow);
      const label = typeof row.name === "string" ? row.name : null;
      const slug = typeof row.slug === "string" ? row.slug : null;
      const value = asFiniteNumber(asRecord(row.omniscienceBreakdown).accuracy);
      if (label == null || slug == null || value == null) {
        return [];
      }
      const model = cleanArtificialAnalysisModelName(label) ?? label;
      const parsedModel = parseModelEffort(model);
      return [
        {
          benchmark_key: options.benchmarkKey,
          source_url: options.sourceUrl,
          model_id: slug,
          model,
          base_model: parsedModel.baseModel,
          reasoning_effort:
            parseArtificialAnalysisReasoningEffort(label) ?? parsedModel.reasoningEffort,
          model_creator: null,
          rank: null,
          canonical_value: value,
          observed_at: null,
          metadata: {
            dataset_name: DATASET_NAME,
            details_url: `/models/${slug}`,
          },
        },
      ];
    })
    .sort((left, right) => right.canonical_value - left.canonical_value)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

/** Flight repeats model objects across chunks, so keep one complete Omniscience row per slug. */
function modelRows(pageHtml: string): Record<string, unknown>[] {
  const flightCorpus = extractNextFlightCorpus(pageHtml);
  const rowsBySlug = new Map<string, Record<string, unknown>>();
  let cursor = 0;
  while (true) {
    const hitIndex = flightCorpus.indexOf(`"${ROW_DETECTION_KEY}":`, cursor);
    if (hitIndex === -1) {
      break;
    }
    cursor = hitIndex + 1;
    const searchStart = Math.max(0, hitIndex - MODEL_SEARCH_BACKTRACK_CHARS);
    for (let backIndex = hitIndex; backIndex >= searchStart; backIndex -= 1) {
      if (flightCorpus[backIndex] !== "{") {
        continue;
      }
      const endIndex = findObjectEnd(flightCorpus, backIndex);
      if (endIndex < hitIndex) {
        continue;
      }
      const row = parseFlightJsonObject(flightCorpus.slice(backIndex, endIndex + 1));
      if (typeof row?.slug === "string" && row.omniscienceBreakdown != null) {
        rowsBySlug.set(row.slug, row);
        break;
      }
    }
  }
  return [...rowsBySlug.values()];
}
