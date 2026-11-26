/** The Timeline's chart points come from the published historical dataset: each model family contributes one representative, named by its reconciled family label, at its published anchored score; nothing is refit here. */

import {
  canonicalModelKey,
  withoutConfigurationLabel,
} from "../../../../src/model-atlas/identity/normalization";
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

export const DAY_MS = 86_400_000;

// Release dates in UTC, as they are recorded: "Mar 14, 2023" and "Mar 2023".
export const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
export const MONTH_FORMAT = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

// A trailing release month in brackets: "GPT-4 Turbo (Jan 2024)" → "GPT-4 Turbo".
const RELEASE_MONTH = / \((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\)$/;

/** A point's chart label: GPT-4, the Timeline's landmark, goes by its short name, and a compact plot drops a bracketed release month, which the star's place on the time axis already shows. */
export function timelinePointLabel(point: Pick<TimelinePoint, "name">, compact: boolean): string {
  const name = point.name === "GPT-4 (Mar 2023)" ? "GPT-4" : point.name;
  return compact ? name.replace(RELEASE_MONTH, "") : name;
}

/** The Timeline plot pads its scores out to 20-point gridlines, with a fixed range when no points are shown. */
export function timelineScoreDomain(scores: readonly number[]): [number, number] {
  if (scores.length === 0) return [60, 200];
  return [
    Math.floor((Math.min(...scores) - 5) / 20) * 20,
    Math.ceil((Math.max(...scores) + 8) / 20) * 20,
  ];
}

/** Models scoring under 70, released before the Timeline's start, or hidden from display are left out; `listed` maps the Timeline id of each configuration the leaderboard lists to its leaderboard Intelligence score. */
export function timelineChartPoints(
  data: HistoricalDataset,
  listed: ReadonlyMap<string, number>,
): TimelinePoint[] {
  const calibration = data.prepared?.calibrations.intelligence;
  if (!calibration || !data.displayAnchors) throw new Error("Missing published calibration.");
  const scores = anchorTimeline(calibration, data, data.displayAnchors, "intelligence");
  const coverage = timelineCoverage(data, "intelligence", calibration.estimates);
  const estimates = new Map(calibration.estimates.map((estimate) => [estimate.modelId, estimate]));
  return modelRepresentatives(
    data.models.map((model) => ({
      ...model,
      listedScore: listed.get(model.id) ?? null,
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
  /** The configuration's leaderboard Intelligence score, `null` when the leaderboard does not list it. */
  listedScore: number | null;
  /** The configuration's Timeline estimate, `null` when the Timeline cannot place it. */
  representativeScore: number | null;
};

/** A family the leaderboard lists is represented by the placed configuration the leaderboard rates strongest, so both views name the same effort and an unlisted, sparsely measured one cannot stand for the model; any other family takes its strongest Timeline estimate, current configurations first. */
export function modelRepresentatives<T extends Candidate>(models: T[]): T[] {
  const families = new Map<string, T[]>();
  for (const model of models) {
    const variants = families.get(model.family) ?? [];
    variants.push(model);
    families.set(model.family, variants);
  }
  return [...families.values()].map((variants) => {
    const scored = variants.filter((model) => model.representativeScore != null);
    const listed = scored.filter((model) => model.listedScore != null);
    const current = scored.filter((model) => model.current);
    const candidates = listed.length ? listed : current.length ? current : variants;
    return strongestModelVariants(
      candidates.map((model) => ({
        id: model.id,
        name: model.name,
        model,
        scores: {
          intelligence_score: listed.length
            ? model.listedScore!
            : (model.representativeScore ?? -Infinity),
        },
      })),
    )[0]!.model;
  });
}

/** A point stands for its whole family, so it drops a configuration label as the leaderboard's public names do: `GPT-6 Sol (Fast)` → `GPT-6 Sol`. */
export function timelineModelName(model: HistoricalModel): string {
  const name = withoutConfigurationLabel(displayName(model));
  return modelName({ id: model.id, name, reasoning_effort: null });
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
