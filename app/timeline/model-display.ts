/** Format model labels while preserving canonical family and release identity. */
import { canonicalModelKey } from "../../src/model-atlas/identity/normalization";
import { historicalReleaseName } from "../../src/model-atlas/timeline/model-identity";
import type { HistoricalModel } from "../../src/model-atlas/timeline/types";
import { modelName, shortLabel } from "../dashboard/shared/model-display";

export function timelineModelName(model: HistoricalModel, showEffort = false): string {
  return modelName({
    id: model.id,
    name: displayName(model),
    reasoning_effort: showEffort ? model.effort : null,
  });
}

export function timelineModelLabel(model: HistoricalModel): string {
  return shortLabel({ id: model.id, name: displayName(model), reasoning_effort: null });
}

/** Follow reconciled family labels while preserving original source names in evidence and genuinely distinct preview releases. */
function displayName(model: HistoricalModel): string {
  const name = model.name
    .replace(/\bpreview\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .trim();
  if (canonicalModelKey({ name }) === model.family) return name;
  const dated = model.releaseDate ? historicalReleaseName(name, model.releaseDate) : null;
  return dated && canonicalModelKey({ name: dated }) === model.family ? dated : model.name;
}
