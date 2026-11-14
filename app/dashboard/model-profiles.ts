/** Browser profiles persist only global model filters; matching and save validation stay independent of chart coordinates and local table controls. */

import { useEffect, useState } from "react";

import { modelsForVariantDisplay } from "../../src/model-atlas/stats/model-variants";
import type { ModelAtlasModel } from "../../src/model-atlas/stats/types";
import { modelCount } from "./shared/model-display";
import {
  type CostFilter,
  filterByGlobalModelFilters,
  type GlobalModelFilters,
} from "./shared/model-filters";
import { readGlobalModelFilters } from "./url-state";

export type ModelProfile = { id: string; name: string; filters: GlobalModelFilters };
export const MODEL_PROFILES_STORAGE_KEY = "model-atlas:model-profiles";

// Profiles saved under the effective-price blend hold max-cost steps on that scale; each maps to the step at the same position, which cuts the leaderboard at a similar point. Its $1 step reads the same as the current $1.00, so it is not remapped.
const LEGACY_COST_FILTERS = new Map<unknown, CostFilter>([
  [2, 0.1],
  [5, 0.25],
  [10, 0.5],
  [25, 1],
]);

/** Browser profile state for the filter rail: storage is reread when another tab writes it and before every write here, so concurrent edits are retained. */
export function useModelProfiles(filters: GlobalModelFilters, matchedCount: number) {
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const read = () => {
      try {
        setProfiles(readModelProfiles(window.localStorage));
        setStorageReady(true);
        setStorageError("");
      } catch {
        setStorageReady(false);
        setStorageError(
          "Browser profiles are unavailable. Check that site storage is enabled and saved profiles are valid.",
        );
      }
    };
    read();
    const changed = (event: StorageEvent) => {
      if (event.key === MODEL_PROFILES_STORAGE_KEY || event.key === null) read();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const activeProfile = profiles.find((profile) => profile.id === activeId);
  const canSave = storageReady && matchedCount > 0;

  const clearFeedback = () => {
    setMessage("");
    setSaveError("");
  };

  /** Save the current filters as a new profile named `name`, or as the active profile when updating; returns whether it saved. */
  const save = (updating: boolean, name: string): boolean => {
    if (!canSave) return false;
    setSaveError("");
    try {
      const stored = readModelProfiles(window.localStorage);
      const existing = updating ? stored.find((profile) => profile.id === activeId) : undefined;
      if (updating && !existing)
        throw new Error("This profile was removed. Save it with a new name.");
      const profile: ModelProfile = {
        id: existing?.id ?? window.crypto.randomUUID(),
        name: existing?.name ?? name,
        filters,
      };
      setProfiles(saveModelProfile(window.localStorage, stored, profile, matchedCount));
      setActiveId(profile.id);
      setMessage(updating ? "Profile updated." : "Profile saved.");
      return true;
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "The profile could not be saved in this browser.",
      );
      return false;
    }
  };

  /** Remove the active profile, keeping the current filters; returns whether it removed one. */
  const remove = (): boolean => {
    if (!storageReady || activeProfile == null) return false;
    setSaveError("");
    try {
      const stored = readModelProfiles(window.localStorage);
      setProfiles(removeModelProfile(window.localStorage, stored, activeProfile.id));
      setActiveId("");
      setMessage("Profile removed. Current filters kept.");
      return true;
    } catch {
      setSaveError("The profile could not be removed from this browser.");
      return false;
    }
  };

  return {
    profiles,
    activeProfile,
    modified: activeProfile != null && !sameProfileFilters(activeProfile.filters, filters),
    setActiveId,
    storageReady,
    storageError,
    saveError,
    message,
    canSave,
    clearFeedback,
    save,
    remove,
  };
}

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
    const values = { ...(filters as Record<string, unknown>) };
    values["max-cost"] = LEGACY_COST_FILTERS.get(values["max-cost"]) ?? values["max-cost"];
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
    const parsed = readGlobalModelFilters(params);
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
