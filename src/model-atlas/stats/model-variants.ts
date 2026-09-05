/** Choose one strongest scored variant per canonical model for backend health checks and application projections. */

import { canonicalModelKey } from "../identity/normalization";

type IntelligenceScoredModel = {
  id?: unknown;
  name?: unknown;
  scores: {
    intelligence_score: number;
  };
};

/** Select the highest-intelligence variant as the representative row for each model. */
export function strongestModelVariants<Model extends IntelligenceScoredModel>(
  models: readonly Model[],
): Model[] {
  const strongestByModel = new Map<string, Model>();
  for (const model of models) {
    const key = canonicalModelKey(model);
    const existing = strongestByModel.get(key);
    if (existing == null || model.scores.intelligence_score > existing.scores.intelligence_score) {
      strongestByModel.set(key, model);
    }
  }
  return [...strongestByModel.values()];
}
