/** Use the main app's strongest-Intelligence representative for current families while retaining historical configurations as evidence. */

import { strongestModelVariants } from "../../../../src/model-atlas/stats/model-variants";
import type {
  HistoricalCalibration,
  HistoricalDataset,
  HistoricalModel,
} from "../../../../src/model-atlas/timeline/schemas";

type Candidate = HistoricalModel & {
  representativeScore: number | null;
};

/** Current families keep the main app's published representative; historical families use Intelligence in both chart dimensions. */
export function representativeScores(
  data: HistoricalDataset,
  intelligence: HistoricalCalibration | undefined,
): Map<string, number | null> {
  const scores = new Map(
    intelligence?.estimates.map((estimate) => [estimate.modelId, estimate.value]),
  );
  for (const observation of data.observations)
    if (observation.benchmarkId === data.rootBenchmarkIds.intelligence)
      scores.set(observation.modelId, observation.value);
  return scores;
}

/** A historical estimate cannot replace an existing current score; historical-only families use their strongest available estimate. */
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
