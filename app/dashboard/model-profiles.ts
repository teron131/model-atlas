/** Browser profiles persist only global model filters; matching and save validation stay independent of chart coordinates and local table controls. */

import type { ModelAtlasModel } from "../../src/model-atlas/stats/types";
import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  modelCount,
  modelsForVariantDisplay,
} from "./shared/model-display";
import { readUrlValue } from "./url-state";

export type ModelProfile = { id: string; name: string; filters: GlobalModelFilters };
export const MODEL_PROFILES_STORAGE_KEY = "model-atlas:model-profiles";
export const DEFAULT_PROFILE_FILTERS: GlobalModelFilters = {
  q: "",
  provider: [],
  "max-cost": "all",
  rank: "all",
  days: "all",
};

/** Count visible canonical families matching the full global configuration, including variants that lack plot coordinates. */
export function matchingProfileModelCount(
  models: ModelAtlasModel[],
  filters: GlobalModelFilters,
  fetchedAt: number | null,
): number {
  return modelCount(
    filterByGlobalModelFilters(modelsForVariantDisplay(models, true), (model) => model, filters, {
      observedAtEpochSeconds: fetchedAt,
      rankingModels: models,
    }),
  );
}

/** Read validated browser data without deleting unrelated settings or silently discarding malformed profiles. */
export function readModelProfiles(storage: Pick<Storage, "getItem">): ModelProfile[] {
  const stored = storage.getItem(MODEL_PROFILES_STORAGE_KEY);
  if (stored == null) return [];
  const profiles: unknown = JSON.parse(stored);
  if (!Array.isArray(profiles)) throw new Error("Saved profiles could not be read.");
  const ids = new Set<string>();
  return profiles.map((profile: unknown) => {
    if (profile == null || typeof profile !== "object")
      throw new Error("Saved profiles could not be read.");
    const { id, name, filters } = profile as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      !id ||
      ids.has(id) ||
      typeof name !== "string" ||
      !name.trim() ||
      filters == null ||
      typeof filters !== "object"
    )
      throw new Error("Saved profiles could not be read.");
    const values = filters as Record<string, unknown>;
    if (
      typeof values.q !== "string" ||
      !Array.isArray(values.provider) ||
      !values.provider.every((p) => typeof p === "string")
    )
      throw new Error("Saved profiles could not be read.");
    const params = new URLSearchParams();
    params.set("q", values.q);
    for (const provider of values.provider) params.append("provider", provider);
    for (const key of ["max-cost", "rank", "days"] as const) params.set(key, String(values[key]));
    const parsed: GlobalModelFilters = {
      q: readUrlValue(params, "q"),
      provider: readUrlValue(params, "provider"),
      "max-cost": readUrlValue(params, "max-cost"),
      rank: readUrlValue(params, "rank"),
      days: readUrlValue(params, "days"),
    };
    if (!sameProfileFilters(parsed, values as GlobalModelFilters))
      throw new Error("Saved profiles could not be read.");
    ids.add(id);
    return { id, name: name.trim(), filters: parsed };
  });
}

/** Reject empty matches and duplicate names before writing; a failed storage write never reports a profile as saved. */
export function saveModelProfile(
  storage: Pick<Storage, "setItem">,
  profiles: ModelProfile[],
  profile: ModelProfile,
  matchedCount: number,
): ModelProfile[] {
  if (!Number.isFinite(matchedCount) || matchedCount <= 0)
    throw new Error("No models match these filters.");
  const name = profile.name.trim();
  if (!name) throw new Error("Enter a profile name.");
  if (
    profiles.some(
      (p) => p.id !== profile.id && p.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    throw new Error("A profile with that name already exists.");
  const saved = { ...profile, name };
  const next = profiles.some((p) => p.id === profile.id)
    ? profiles.map((p) => (p.id === profile.id ? saved : p))
    : [...profiles, saved];
  storage.setItem(MODEL_PROFILES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Removing a saved profile does not depend on its current matches or alter the active dashboard filters. */
export function removeModelProfile(
  storage: Pick<Storage, "setItem">,
  profiles: ModelProfile[],
  id: string,
): ModelProfile[] {
  const next = profiles.filter((profile) => profile.id !== id);
  storage.setItem(MODEL_PROFILES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Provider order carries no selection meaning, so equivalent filters remain unmodified after URL normalization. */
export function sameProfileFilters(left: GlobalModelFilters, right: GlobalModelFilters): boolean {
  return (
    left.q === right.q &&
    left.provider.length === right.provider.length &&
    left.provider.every((p) => right.provider.includes(p)) &&
    left["max-cost"] === right["max-cost"] &&
    left.rank === right.rank &&
    left.days === right.days
  );
}
