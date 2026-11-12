/** Project published historical evidence into the small, fixed-scale series used by the dashboard. */

import { providerIdentityKey } from "../../../../src/model-atlas/identity/provider";
import { modelDisplayExclusion } from "../../../../src/model-atlas/stats/model-visibility";
import { anchorTimeline } from "../../../../src/model-atlas/timeline/calibration";
import { timelineCoverage } from "../../../../src/model-atlas/timeline/coverage";
import type { HistoricalDataset } from "../../../../src/model-atlas/timeline/schemas";
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

/** A point's chart label: GPT-4, the Timeline's landmark, goes by its short name. */
export function timelinePointLabel(point: Pick<TimelinePoint, "name">): string {
  return point.name === "GPT-4 (Mar 2023)" ? "GPT-4" : point.name;
}

/** Gaps between a Timeline name and its star: names sit right beside their stars, so where the field is too crowded a lower-priority name gives way instead of hanging on a long leader. */
export const TIMELINE_LABEL_GAPS = [5, 12];

/** Both Timeline plots pad their scores out to 20-point gridlines, with a fixed range when a view has no points. */
export function timelineScoreDomain(scores: readonly number[]): [number, number] {
  if (scores.length === 0) return [60, 200];
  return [
    Math.floor((Math.min(...scores) - 5) / 20) * 20,
    Math.ceil((Math.max(...scores) + 8) / 20) * 20,
  ];
}

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
          provider: providerIdentityKey(model.provider),
          releaseDate: model.releaseDate,
          score,
          coverage: coverage.get(model.id)?.fraction ?? null,
          indexOnly: estimate.indexOnly && !estimate.reference,
        },
      ];
    })
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || b.score - a.score);
}
