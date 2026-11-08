/**
 * AA-3D Elo ratings from Artificial Analysis.
 *
 * Page source: https://artificialanalysis.ai/evaluations/aa-3d
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, type JsonObject, nowEpochSeconds } from "../../runtime";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "./model-labels";
import { getArtificialAnalysisPage } from "./page-data";

/** The page publishes no dataset manifest, so its rated board comes from the page's own model records. */
const RATING_KEY = "aa3dElo";

export async function getAa3dStats(sourceUrl: string): Promise<BenchmarkObservationPayload> {
  const { models } = await getArtificialAnalysisPage(sourceUrl, RATING_KEY);
  const data = processAa3dRows(models, sourceUrl);
  return { fetched_at_epoch_seconds: data.length === 0 ? null : nowEpochSeconds(), data };
}

export function processAa3dRows(rows: JsonObject[], sourceUrl: string): BenchmarkObservationRow[] {
  return rows
    .flatMap((row) => {
      const slug = asNonEmptyString(row.slug);
      const label = asNonEmptyString(row.shortName);
      const elo = asFiniteNumber(row[RATING_KEY]);
      return slug == null || label == null || elo == null ? [] : [{ slug, label, elo }];
    })
    .sort((left, right) => right.elo - left.elo)
    .map(({ slug, label, elo }, index) => {
      const model = cleanArtificialAnalysisModelName(label) ?? label;
      const parsedModel = parseModelEffort(model);
      return {
        benchmark_key: "aa_3d",
        source_url: sourceUrl,
        model_id: slug,
        model,
        base_model: parsedModel.baseModel,
        reasoning_effort:
          parseArtificialAnalysisReasoningEffort(label) ?? parsedModel.reasoningEffort,
        model_creator: null,
        rank: index + 1,
        canonical_value: elo,
        observed_at: null,
        metadata: {},
      };
    });
}
