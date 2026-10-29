/** Preserve benchmark-source identities when catalogs lag, while applying catalog metadata only to accepted matches. */

import type { MatchDiagnosticsPayload } from "../identity";
import {
  canonicalReasoningEffort,
  modelSlugFromModelId,
  parseModelEffort,
  qualifyModelId,
} from "../identity/normalization";
import { publicOpenRouterModelId } from "../identity/openrouter";
import { asFiniteNumber, asRecord } from "../runtime";
import type { ArtificialAnalysisModel, ModelAtlasSourceData } from "../sources/assembly";
import { type BenchmarkAssignmentLookups, buildObservationBenchmarks } from "./benchmark-rows";
import { modelsDevRowFields } from "./model-catalog";
import type { ModelRow } from "./model-types";

type MatchedRowLookups = Pick<ModelAtlasSourceData, "modelsDev"> & BenchmarkAssignmentLookups;

/** Keep the source's exact-effort observations separate from its accepted catalog metadata and shared display identity. */
function buildMatchedRow(
  artificialAnalysisModel: ArtificialAnalysisModel,
  matchedModelId: string | null,
  lookups: MatchedRowLookups,
): ModelRow {
  const artificialAnalysisId =
    typeof artificialAnalysisModel.model_id === "string" ? artificialAnalysisModel.model_id : null;
  const artificialAnalysisSlug = modelSlugFromModelId(artificialAnalysisId);
  const matchedModelsDev =
    matchedModelId == null ? null : (lookups.modelsDev.byId.get(matchedModelId) ?? null);
  let name = artificialAnalysisId;
  if (typeof matchedModelsDev?.model?.name === "string") {
    name = matchedModelsDev.model.name;
  } else if (matchedModelId == null && typeof artificialAnalysisModel.name === "string") {
    name = parseModelEffort(
      artificialAnalysisModel.name.replace(/\s+\((?:non[- ]reasoning|no reasoning)\)\s*$/i, ""),
    ).baseModel;
  }
  const observationNameCandidates = [
    artificialAnalysisId,
    artificialAnalysisSlug,
    artificialAnalysisModel.name,
  ];
  const observationBenchmarks = buildObservationBenchmarks(
    observationNameCandidates,
    lookups,
    {},
    artificialAnalysisModel.reasoning_effort,
  );
  const providerId = matchedModelsDev?.provider_id ?? artificialAnalysisModel.provider;
  const canonicalId = qualifyModelId(
    matchedModelsDev?.model?.id ?? matchedModelId ?? artificialAnalysisId,
    providerId,
    matchedModelsDev?.model_id ?? artificialAnalysisId,
  );
  const medianOutputTokensPerSecond = asFiniteNumber(artificialAnalysisModel.median_speed);
  const medianTimeToFirstTokenSeconds = asFiniteNumber(artificialAnalysisModel.median_time);
  const medianEndToEndResponseTimeSeconds = asFiniteNumber(
    artificialAnalysisModel.median_end_to_end_response_time,
  );

  return {
    id: matchedModelId == null ? publicOpenRouterModelId(canonicalId) : canonicalId,
    name,
    artificial_analysis_id: artificialAnalysisId,
    artificial_analysis_slug: artificialAnalysisSlug,
    provider_id: typeof providerId === "string" ? providerId : null,
    openrouter_id: canonicalId,
    reasoning_effort: canonicalReasoningEffort(artificialAnalysisModel.reasoning_effort),
    logo: typeof artificialAnalysisModel.logo === "string" ? artificialAnalysisModel.logo : null,
    ...(matchedModelId == null
      ? {
          release_date:
            typeof artificialAnalysisModel.release_date === "string"
              ? artificialAnalysisModel.release_date
              : null,
          modalities: {
            input: artificialAnalysisModel.input_modalities,
            output: artificialAnalysisModel.output_modalities,
          },
          reasoning:
            typeof artificialAnalysisModel.reasoning === "boolean"
              ? artificialAnalysisModel.reasoning
              : null,
        }
      : modelsDevRowFields(matchedModelsDev?.model)),
    artificial_analysis_cost: asRecord(artificialAnalysisModel.cost),
    ...(medianOutputTokensPerSecond == null
      ? {}
      : { median_output_tokens_per_second: medianOutputTokensPerSecond }),
    ...(medianTimeToFirstTokenSeconds == null
      ? {}
      : { median_time_to_first_token_seconds: medianTimeToFirstTokenSeconds }),
    ...(medianEndToEndResponseTimeSeconds == null
      ? {}
      : {
          median_end_to_end_response_time_seconds: medianEndToEndResponseTimeSeconds,
        }),
    ...(Object.keys(observationBenchmarks.scoringSources).length === 0
      ? {}
      : { scoring_sources: observationBenchmarks.scoringSources }),
    benchmarks: observationBenchmarks.benchmarks,
    intelligence: asRecord(artificialAnalysisModel.intelligence),
    intelligence_index_cost: asRecord(artificialAnalysisModel.intelligence_index_cost),
  };
}

export function modelRowsFromMatchDiagnostics(
  sourceData: ModelAtlasSourceData,
  matchDiagnostics: MatchDiagnosticsPayload,
): ModelRow[] {
  return matchDiagnostics.models.flatMap((match) => {
    const matchedModelId = match.best_match?.model_id ?? null;
    const artificialAnalysisModel = sourceData.artificialAnalysis.byId.get(
      match.artificial_analysis_id ?? "",
    );
    if (!artificialAnalysisModel) {
      return [];
    }
    // A rejected catalog association must not erase a qualified source identity or borrow its rejected candidate's metadata.
    if (
      matchedModelId == null &&
      (typeof artificialAnalysisModel.model_id !== "string" ||
        !/^[^/\s]+\/[^/\s]+$/.test(artificialAnalysisModel.model_id) ||
        typeof artificialAnalysisModel.name !== "string" ||
        artificialAnalysisModel.name.trim().length === 0)
    ) {
      return [];
    }
    return [buildMatchedRow(artificialAnalysisModel, matchedModelId, sourceData)];
  });
}
