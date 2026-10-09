/** Every dashboard surface opens and closes the model sheet through the URL, so a sheet, or a comparison of two, is shareable and Back leaves it. */

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { replaceDashboardUrl, updateDashboardUrl } from "../use-url-state";

export type ModelSheetModel = Pick<ModelAtlasModel, "id" | "name" | "reasoning_effort">;

/** Which URL fields name a sheet model: the opened model (`model`, `effort`) or the one pinned beside it (`compare`, `compare-effort`). */
export type ModelSheetSlot = "model" | "compare";

// When a surface last asked for a sheet, so a click that opened or switched it is never mistaken for a click elsewhere.
let lastOpenedAt = Number.NEGATIVE_INFINITY;

/**
 * Open the model sheet for a displayed model: a collapsed row opens its collapsed model, and a reasoning variant opens that variant.
 * Opening adds one history entry; switching models while the sheet is open replaces it, so Back closes the sheet in one step.
 * A pinned model stays beside whichever model opens next.
 */
export function openModelSheet(model: ModelSheetModel) {
  lastOpenedAt = performance.now();
  const patch = { model: model.id ?? model.name, effort: model.reasoning_effort ?? null };
  if (new URL(window.location.href).searchParams.has("model")) replaceDashboardUrl(patch);
  else updateDashboardUrl(patch);
}

/** Closing the sheet also lets go of a pinned model, so the next sheet opens alone. */
export function closeModelSheet() {
  replaceDashboardUrl({ model: null, effort: null, compare: null, "compare-effort": null });
}

/** Hiding the sheet, as a click elsewhere does, keeps a pinned model, so the next model opened from any surface appears beside it. */
export function dismissModelSheet() {
  replaceDashboardUrl({ model: null, effort: null });
}

/** Whether any surface opened or switched the sheet at or after `time`, an event's timestamp on the page's clock. */
export function modelSheetOpenedSince(time: number) {
  return lastOpenedAt >= time;
}

/** Switch one sheet model between its collapsed row (`null`) and a reasoning variant in place. */
export function selectModelSheetEffort(slot: ModelSheetSlot, effort: string | null) {
  replaceDashboardUrl(slot === "model" ? { effort } : { "compare-effort": effort });
}

/** Pin the sheet's model so the next model opened from any surface appears beside it for comparison. */
export function pinModelSheet(key: string, effort: string | null) {
  replaceDashboardUrl({ compare: key, "compare-effort": effort });
}

export function unpinModelSheet() {
  replaceDashboardUrl({ compare: null, "compare-effort": null });
}

/** Whether a displayed model is the one a sheet URL names; without an effort, any variant's collapsed row matches. */
export function isModelSheetModel(model: ModelSheetModel, key: string, effort: string | null) {
  return (
    (model.id === key || model.name === key) &&
    (effort == null || model.reasoning_effort === effort)
  );
}

/** Whether a leaderboard row belongs to the open sheet: a collapsed row stands for every variant of its model, a variant row only for itself. */
export function rowShowsModelSheet(model: ModelSheetModel, key: string, effort: string | null) {
  return (
    (model.id === key || model.name === key) &&
    (model.reasoning_effort == null || model.reasoning_effort === effort)
  );
}
