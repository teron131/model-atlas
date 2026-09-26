/** Project published historical evidence into the small, fixed-scale series used by the dashboard. */

import { modelDisplayExclusion } from "../../../../src/model-atlas/stats/model-visibility";
import { anchorTimeline } from "../../../../src/model-atlas/timeline/calibration";
import { timelineCoverage } from "../../../../src/model-atlas/timeline/coverage";
import type { HistoricalDataset } from "../../../../src/model-atlas/timeline/schemas";
import { providerFilterKey } from "../../shared/provider-theme";
import { TIMELINE_START_DATE } from "./frontier";
import { timelineModelName } from "./model-display";
import { modelRepresentatives, representativeScores } from "./model-representatives";

export type TimelinePoint = {
  id: string;
  name: string;
  provider: string;
  releaseDate: string;
  score: number;
  coverage: number | null;
  indexOnly: boolean;
};

/** Select the same family representatives, visibility floor and evidence support as the detailed explorer; never refit scores. */
export function timelineChartPoints(data: HistoricalDataset): TimelinePoint[] {
  const calibration = data.prepared?.calibrations.intelligence;
  if (!calibration || !data.displayAnchors) throw new Error("Missing published calibration.");
  const scores = anchorTimeline(calibration, data, data.displayAnchors, "intelligence");
  const coverage = timelineCoverage(data, "intelligence", calibration.estimates);
  const representatives = representativeScores(calibration);
  const estimates = new Map(calibration.estimates.map((estimate) => [estimate.modelId, estimate]));
  return modelRepresentatives(
    data.models.map((model) => ({
      ...model,
      representativeScore: representatives.get(model.id) ?? null,
    })),
  )
    .flatMap((model) => {
      const score = scores.get(model.id);
      const estimate = estimates.get(model.id);
      if (
        score == null ||
        score < 70 ||
        !estimate ||
        !model.releaseDate ||
        model.releaseDate < TIMELINE_START_DATE ||
        modelDisplayExclusion(model) != null
      )
        return [];
      return [
        {
          id: model.id,
          name: timelineModelName(model),
          provider: providerFilterKey(model.provider),
          releaseDate: model.releaseDate,
          score,
          coverage: coverage.get(model.id)?.fraction ?? null,
          indexOnly: estimate.indexOnly && !estimate.reference,
        },
      ];
    })
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || b.score - a.score);
}
