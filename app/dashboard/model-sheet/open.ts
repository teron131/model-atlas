/** Every dashboard surface opens and closes the model sheet through the URL, so a sheet is shareable and Back leaves it. */

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { replaceDashboardUrl, updateDashboardUrl } from "../use-url-state";

export type ModelSheetModel = Pick<ModelAtlasModel, "id" | "name" | "reasoning_effort">;

/**
 * Open the model sheet for a displayed model: a collapsed row opens its collapsed model, and a reasoning variant opens that variant.
 * Opening adds one history entry; switching models while the sheet is open replaces it, so Back closes the sheet in one step.
 */
export function openModelSheet(model: ModelSheetModel) {
  const patch = { model: model.id ?? model.name, effort: model.reasoning_effort ?? null };
  if (new URL(window.location.href).searchParams.has("model")) replaceDashboardUrl(patch);
  else updateDashboardUrl(patch);
}

export function closeModelSheet() {
  replaceDashboardUrl({ model: null, effort: null });
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
