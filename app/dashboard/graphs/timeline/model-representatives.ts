/** Select each family's strongest published Timeline position while retaining other configurations as evidence. */

import { strongestModelVariants } from "../../../../src/model-atlas/stats/model-variants";
import type {
  HistoricalCalibration,
  HistoricalModel,
} from "../../../../src/model-atlas/timeline/schemas";

type Candidate = HistoricalModel & {
  representativeScore: number | null;
};

/** Use published Timeline estimates to select a representative that matches the plotted coordinate. */
export function representativeScores(
  intelligence: HistoricalCalibration | undefined,
): Map<string, number | null> {
  return new Map(intelligence?.estimates.map((estimate) => [estimate.modelId, estimate.value]));
}

/** Prefer current configurations when present, then select the strongest supported Timeline estimate. */
export function modelRepresentatives<T extends Candidate>(models: T[]): T[] {
  const families = new Map<string, T[]>();
  for (const model of models) {
    const variants = families.get(model.family) ?? [];
    variants.push(model);
    families.set(model.family, variants);
  }
  return [...families.values()].map((variants) => {
    const current = variants.filter((model) => model.current && model.representativeScore != null);
    const candidates = current.length ? current : variants;
    return strongestModelVariants(
      candidates.map((model) => ({
        id: model.id,
        name: model.name,
        model,
        scores: { intelligence_score: model.representativeScore ?? -Infinity },
      })),
    )[0]!.model;
  });
}
