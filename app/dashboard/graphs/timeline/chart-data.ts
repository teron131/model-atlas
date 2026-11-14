/** The Timeline's chart points come from the published historical dataset: each model family contributes one representative, named by its reconciled family label, at its published anchored score; nothing is refit here. */

import { canonicalModelKey } from "../../../../src/model-atlas/identity/normalization";
import { providerIdentityKey } from "../../../../src/model-atlas/identity/provider";
import { strongestModelVariants } from "../../../../src/model-atlas/stats/model-variants";
import { modelDisplayExclusion } from "../../../../src/model-atlas/stats/model-visibility";
import { anchorTimeline } from "../../../../src/model-atlas/timeline/calibration";
import { timelineCoverage } from "../../../../src/model-atlas/timeline/coverage";
import { historicalReleaseName } from "../../../../src/model-atlas/timeline/model-identity";
import type {
  HistoricalDataset,
  HistoricalModel,
} from "../../../../src/model-atlas/timeline/schemas";
import { modelName } from "../../shared/model-display";
import { TIMELINE_START_DATE } from "./frontier";

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

/** The Timeline plot pads its scores out to 20-point gridlines, with a fixed range when no points are shown. */
export function timelineScoreDomain(scores: readonly number[]): [number, number] {
  if (scores.length === 0) return [60, 200];
  return [
    Math.floor((Math.min(...scores) - 5) / 20) * 20,
    Math.ceil((Math.max(...scores) + 8) / 20) * 20,
  ];
}

/** Models scoring under 70, released before the Timeline's start, or hidden from display are left out. */
export function timelineChartPoints(data: HistoricalDataset): TimelinePoint[] {
  const calibration = data.prepared?.calibrations.intelligence;
  if (!calibration || !data.displayAnchors) throw new Error("Missing published calibration.");
  const scores = anchorTimeline(calibration, data, data.displayAnchors, "intelligence");
  const coverage = timelineCoverage(data, "intelligence", calibration.estimates);
  const estimates = new Map(calibration.estimates.map((estimate) => [estimate.modelId, estimate]));
  // Representatives are ranked by their published Timeline estimate, so the chosen variant is the one whose coordinate is plotted.
  return modelRepresentatives(
    data.models.map((model) => ({
      ...model,
      representativeScore: estimates.get(model.id)?.value ?? null,
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

type Candidate = HistoricalModel & {
  representativeScore: number | null;
};

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

export function timelineModelName(model: HistoricalModel): string {
  return modelName({ id: model.id, name: displayName(model), reasoning_effort: null });
}

/**
 * Follow reconciled family labels, keeping the source name for genuinely distinct preview releases.
 * The word "preview" and any parentheses it leaves empty are dropped before matching the family: `Gemini 2.5 Pro (Preview)` → `Gemini 2.5 Pro`.
 */
function displayName(model: HistoricalModel): string {
  const name = model.name
    .replace(/\bpreview\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .trim();
  if (canonicalModelKey({ name }) === model.family) return name;
  const dated = model.releaseDate ? historicalReleaseName(name, model.releaseDate) : null;
  return dated && canonicalModelKey({ name: dated }) === model.family ? dated : model.name;
}
