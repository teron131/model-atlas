/** Preserve benchmark-source identities when catalogs lag, while applying catalog metadata only to accepted matches. */

import type { MatchDiagnosticsPayload } from "../identity";
import {
  benchmarkModelEffort,
  canonicalProviderModelId,
  canonicalReasoningEffort,
  modelSlugFromModelId,
} from "../identity/normalization";
import { publicOpenRouterModelId } from "../identity/openrouter";
import type { ArtificialAnalysisModel, ModelAtlasSourceData } from "../ingest/assembly";
import { asFiniteNumber, asRecord } from "../runtime";
import { type BenchmarkAssignmentLookups, buildObservationBenchmarks } from "./benchmark-rows";

type MatchedRowLookups = Pick<ModelAtlasSourceData, "modelsDev"> & BenchmarkAssignmentLookups;

/** Keep the source's exact-effort observations separate from its accepted catalog metadata and shared display identity. */
function buildMatchedRow(
  source: ArtificialAnalysisModel,
  matchedModelId: string | null,
  lookups: MatchedRowLookups,
): Record<string, unknown> {
  const sourceId = typeof source.model_id === "string" ? source.model_id : null;
  const sourceSlug = modelSlugFromModelId(sourceId);
  const benchmarks = { ...asRecord(source.benchmarks) };
  const intelligence = asRecord(source.intelligence);
  const intelligenceIndexCost = asRecord(source.intelligence_index_cost);
  const logo = typeof source.logo === "string" ? source.logo : null;
  const matchedModelsDev =
    matchedModelId == null ? null : (lookups.modelsDev.byId.get(matchedModelId) ?? null);
  const matchedModelFields = asRecord(matchedModelsDev?.model);
  let name = sourceId;
  if (typeof matchedModelsDev?.model?.name === "string") {
    name = matchedModelsDev.model.name;
  } else if (matchedModelId == null && typeof source.name === "string") {
    name = benchmarkModelEffort(
      source.name.replace(/\s+\((?:non[- ]reasoning|no reasoning)\)\s*$/i, ""),
    ).baseModel;
  }
  const observationNameCandidates = [sourceId, sourceSlug, source.name];
  const observationBenchmarks = buildObservationBenchmarks(
    observationNameCandidates,
    lookups,
    benchmarks,
    source.reasoning_effort,
  );
  Object.assign(benchmarks, observationBenchmarks.benchmarks);
  const canonicalId = canonicalProviderModelId(
    matchedModelsDev?.model?.id ?? matchedModelId ?? sourceId,
    matchedModelsDev?.provider_id ?? source.provider,
    matchedModelsDev?.model_id ?? sourceId,
  );
  const {
    id: _matchedId,
    name: _matchedName,
    family: matchedFamily,
    model_id: _matchedModelId,
    slug: _matchedSlug,
    ...modelMetadata
  } = matchedModelFields;
  const medianSpeed = asFiniteNumber(source.median_speed);
  const medianTime = asFiniteNumber(source.median_time);
  const medianEndToEndResponseTime = asFiniteNumber(source.median_end_to_end_response_time);

  return {
    id: matchedModelId == null ? publicOpenRouterModelId(canonicalId) : canonicalId,
    name,
    artificial_analysis_id: sourceId,
    artificial_analysis_slug: sourceSlug,
    provider_id: matchedModelsDev?.provider_id ?? source.provider ?? null,
    openrouter_id: canonicalId,
    reasoning_effort: canonicalReasoningEffort(source.reasoning_effort),
    family: matchedFamily,
    logo,
    ...(matchedModelId == null
      ? {
          release_date: source.release_date,
          modalities: {
            input: source.input_modalities,
            output: source.output_modalities,
          },
          reasoning: source.reasoning,
        }
      : {}),
    ...modelMetadata,
    artificial_analysis_cost: asRecord(source.cost),
    ...(medianSpeed == null ? {} : { median_output_tokens_per_second: medianSpeed }),
    ...(medianTime == null ? {} : { median_time_to_first_token_seconds: medianTime }),
    ...(medianEndToEndResponseTime == null
      ? {}
      : {
          median_end_to_end_response_time_seconds: medianEndToEndResponseTime,
        }),
    ...(Object.keys(observationBenchmarks.scoringSources).length === 0
      ? {}
      : { scoring_sources: observationBenchmarks.scoringSources }),
    benchmarks,
    intelligence,
    intelligence_index_cost: intelligenceIndexCost,
  };
}

export function modelRowsFromMatchDiagnostics(
  sourceData: ModelAtlasSourceData,
  matchDiagnostics: MatchDiagnosticsPayload,
): Record<string, unknown>[] {
  return matchDiagnostics.models.flatMap((match) => {
    const matchedModelId = match.best_match?.model_id ?? null;
    const source = sourceData.artificialAnalysis.bySlug.get(match.artificial_analysis_slug);
    if (!source) {
      return [];
    }
    // A rejected catalog association must not erase a qualified source identity or borrow its rejected candidate's metadata.
    if (
      matchedModelId == null &&
      (typeof source.model_id !== "string" ||
        !/^[^/\s]+\/[^/\s]+$/.test(source.model_id) ||
        typeof source.name !== "string" ||
        source.name.trim().length === 0)
    ) {
      return [];
    }
    return [buildMatchedRow(source, matchedModelId, sourceData)];
  });
}
