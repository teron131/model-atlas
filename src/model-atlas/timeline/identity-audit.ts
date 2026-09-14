/** Audit every retained identity and observation before publication; unresolved source ambiguity is reported separately from confirmed defects. */
import { providerIdentityKey } from "../identity/provider";
import {
  historicalNameKey,
  resolveHistoricalModelIdentities,
  validHistoricalReleaseDate,
} from "./model-identity";
import type { HistoricalDataset, HistoricalModel } from "./types";

/** Check identity idempotence, release metadata, observation integrity, and all same-name groups without relying on a screenshot or score ranking. */
export function auditHistoricalIdentities(data: HistoricalDataset) {
  const models = new Map(data.models.map((model) => [model.id, model]));
  const versions = new Map<string, Set<string>>();
  const cells = new Set<string>();
  const errors: { kind: string; modelId: string; detail: string }[] = [];
  const modelIds = new Set<string>();
  for (const model of data.models) {
    if (modelIds.has(model.id))
      errors.push({ kind: "duplicate-model-id", modelId: model.id, detail: model.name });
    modelIds.add(model.id);
  }
  for (const observation of data.observations) {
    const key = `${observation.modelId}\0${observation.benchmarkId}`;
    if (!models.has(observation.modelId))
      errors.push({
        kind: "missing-model",
        modelId: observation.modelId,
        detail: observation.benchmarkId,
      });
    if (!Number.isFinite(observation.value))
      errors.push({
        kind: "nonfinite-measurement",
        modelId: observation.modelId,
        detail: observation.benchmarkId,
      });
    if (cells.has(key))
      errors.push({
        kind: "duplicate-measurement",
        modelId: observation.modelId,
        detail: observation.benchmarkId,
      });
    cells.add(key);
    if (observation.sourceModelVersion) {
      const set = versions.get(observation.modelId) ?? new Set<string>();
      set.add(observation.sourceModelVersion);
      versions.set(observation.modelId, set);
    }
  }
  const groups = new Map<string, HistoricalModel[]>();
  for (const model of data.models) {
    if (model.releaseDate && !validHistoricalReleaseDate(model))
      errors.push({
        kind: "contradictory-release-date",
        modelId: model.id,
        detail: `${model.name}: ${model.releaseDate}`,
      });
    const key = `${providerIdentityKey(model.provider)}\0${historicalNameKey(model.name)}\0${model.effort}`;
    const group = groups.get(key) ?? [];
    group.push(model);
    groups.set(key, group);
  }
  const resolved = resolveHistoricalModelIdentities(data.models, data.observations);
  const resolvedIds = new Set(resolved.models.map((model) => model.id));
  for (const model of data.models) {
    if (!resolvedIds.has(model.id))
      errors.push({ kind: "unresolved-alias", modelId: model.id, detail: model.name });
  }
  if (resolved.observations.length !== data.observations.length)
    errors.push({
      kind: "unstable-observations",
      modelId: "",
      detail: "Identity replay changes the measurement count",
    });
  const reviewGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const dates = new Set(group.flatMap((model) => model.releaseDate ?? []));
      const reason = group.some((model) => !model.id.startsWith("name:"))
        ? "explicit-source-configurations"
        : dates.size > 1
          ? "different-or-conflicting-release-dates"
          : group.some((model) => (versions.get(model.id)?.size ?? 0) > 1)
            ? "multiple-source-versions"
            : "unconfirmed-identity";
      return {
        reason,
        models: group.map((model) => ({
          ...model,
          versions: [...(versions.get(model.id) ?? [])].sort(),
        })),
      };
    });
  return {
    models: data.models.length,
    observations: data.observations.length,
    errors,
    reviewGroups,
    undatedModels: data.models
      .filter((model) => !model.releaseDate)
      .map((model) => ({ id: model.id, name: model.name })),
  };
}
