/** Shared graph-series policy for preview visibility, labels, reference populations, and display limits. */

import {
  isPreviewModel,
  type ModelAtlasPublishedModel,
} from "../../../src/model-atlas/stats/types";
import { shortLabel } from "../shared/model-display";

/** Every graph requires available Value; quality-qualified rows without it remain table-only. */
export function isGraphEligible(model: ModelAtlasPublishedModel): boolean {
  return finiteNumber(model.scores?.value_score) != null;
}

/** Prefix preview graph labels with the marker explained by the graph legend. */
export function graphModelLabel(
  model: ModelAtlasPublishedModel,
  label = shortLabel(model),
): string {
  return isPreviewModel(model) ? `* ${label}` : label;
}

/** Use official rows for graph references while keeping preview-only views usable. */
export function graphReferenceItems<T>(
  items: T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
): T[] {
  const officialItems = items.filter((item) => !isPreviewModel(getModel(item)));
  return officialItems.length > 0 ? officialItems : items;
}

/** Label the Pareto frontier plus every preview row without duplicating frontier previews. */
export function graphLabeledItems<T>(
  items: T[],
  frontierItems: T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
): T[] {
  const frontierSet = new Set(frontierItems);
  return [
    ...frontierItems,
    ...items.filter((item) => isPreviewModel(getModel(item)) && !frontierSet.has(item)),
  ];
}

/** Remove graph-only previews that fall below the displayed official Intelligence floor. */
export function filterGraphPreviewsByIntelligenceFloor<T>(
  items: T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
): T[] {
  const officialScores = items.flatMap((item) => {
    const model = getModel(item);
    const score = finiteNumber(model.scores?.intelligence_score);
    return isPreviewModel(model) || score == null ? [] : [score];
  });
  if (officialScores.length === 0) {
    return items;
  }
  const floor = Math.min(...officialScores);
  return items.filter((item) => {
    const model = getModel(item);
    return (
      !isPreviewModel(model) ||
      (finiteNumber(model.scores?.intelligence_score) ?? Number.NEGATIVE_INFINITY) >= floor
    );
  });
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
