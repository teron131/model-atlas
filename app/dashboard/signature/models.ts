/** Select the established frontier roles and translate the displayed models into stars for the frontier sky. */

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { clamp01, medianOfFinite } from "../../../src/model-atlas/math-utils";
import { type ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { paretoFrontier } from "../graphs/plot/pareto-frontier";
import { modelsForVariantDisplay, modelVariantKey, shortLabel } from "../shared/model-display";
import {
  providerChartColor,
  providerDisplayName,
  providerFilterKey,
  providerLogo,
} from "../shared/provider-theme";
import type { SkyStar } from "./sky-scene";

// Star tint when a provider's colour is theme-dependent; the sky is dark in both themes.
const SKY_INK = "#eef2ff";

export type SignaturePopulation = {
  models: ModelAtlasModel[];
  paretoModels: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
};

/** The score that earned a frontier role; Pareto roles add the Value score and blended price behind the choice. */
export type SignatureMetric = {
  kind: "intelligence" | "agentic";
  score: number;
  value?: number;
  price?: number;
};

type SignatureModel = {
  key: string;
  family: string;
  role: string;
  metric: SignatureMetric;
  name: string;
  logo: string;
  color: string;
};

/**
 * Each displayed model family becomes one star: release date runs across the sky, and Intelligence sets height and brightness.
 *
 * Positions are scaled across the full reference population, so filters remove stars without moving the rest and a lone model keeps its true place.
 */
export function signatureStars(
  models: ModelAtlasModel[],
  referenceModels: ModelAtlasModel[],
  frontierNames: ReadonlyMap<string, string>,
): SkyStar[] {
  const dated = datedModels(models);
  const reference = datedModels(referenceModels);
  if (dated.length === 0 || reference.length === 0) return [];
  // Release order rather than raw dates spreads the crowded recent years across the sky.
  const releases = reference.map(({ released }) => released).sort((left, right) => left - right);
  const scores = reference.map(({ model }) => intelligenceScore(model));
  const lowestScore = Math.min(...scores);
  const scoreSpan = Math.max(1, Math.max(...scores) - lowestScore);
  return dated.map(({ model, released }) => {
    const family = canonicalModelKey(model);
    const colour = providerChartColor(model.provider);
    const before = releases.filter((reference) => reference < released).length;
    return {
      key: family,
      across: clamp01(before / Math.max(1, releases.length - 1)),
      altitude: clamp01((intelligenceScore(model) - lowestScore) / scoreSpan),
      colour: colour.startsWith("#") ? colour : SKY_INK,
      label: frontierNames.get(family) ?? null,
      name: shortLabel({ ...model, reasoning_effort: null }),
      provider: providerDisplayName(model),
      intelligence: intelligenceScore(model),
      released: new Date(released).toISOString().slice(0, 10),
    };
  });
}

/** Model families with an Intelligence score and a dated release, the only models the sky can place. */
function datedModels(models: ModelAtlasModel[]) {
  return modelsForVariantDisplay(
    models.filter(
      (model) => model.name != null && Number.isFinite(model.scores.intelligence_score),
    ),
    false,
  ).flatMap((model) => {
    const released = Date.parse(`${model.release_date?.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(released) ? [{ model, released }] : [];
  });
}

/** Select visible role leaders and display-limit-independent Pareto choices against a global Intelligence median. */
export function signatureModels({
  models,
  paretoModels,
  referenceModels,
}: SignaturePopulation): SignatureModel[] {
  const variants = modelsForVariantDisplay(
    models.filter(
      (model) => model.name != null && Number.isFinite(model.scores.intelligence_score),
    ),
    true,
  );
  const baseModels = modelsForVariantDisplay(variants, false);
  const valueModels = intelligenceValueModels(paretoModels);
  const medianIntelligence = medianOfFinite(
    intelligenceValueModels(referenceModels).map(intelligenceScore),
  );
  const frontier = paretoFrontier(valueModels, {
    x: { get: (model) => Number(model.scores.value_score), goal: "maximize" },
    y: { get: intelligenceScore, goal: "maximize" },
  });
  const intelligenceRanking = rankModels(baseModels, intelligenceScore);
  const agenticRanking = rankModels(
    variants.filter((model) => Number.isFinite(model.scores.agentic_score)),
    (model) => Number(model.scores.agentic_score),
  );
  const representedLabs = new Set(
    [intelligenceRanking[0], agenticRanking[0]]
      .filter((model): model is ModelAtlasModel => model != null)
      .map((model) => providerFilterKey(model.provider)),
  );
  const anotherLab = intelligenceRanking.find(
    (model) => !representedLabs.has(providerFilterKey(model.provider)),
  );
  const selectedModels = selectRolesWithTopFiveFallback(
    [
      {
        label: "Best Intelligence",
        model: intelligenceRanking[0],
        metric: intelligenceMetric,
      },
      {
        label: "Best Agentic",
        allowRepeat: true,
        model: agenticRanking[0],
        metric: (model) => ({ kind: "agentic", score: Number(model.scores.agentic_score) }),
      },
      {
        label: "Another Lab",
        model: anotherLab,
        metric: intelligenceMetric,
      },
      {
        label: "Best Open Weight",
        allowRepeat: true,
        model: intelligenceRanking.find((model) => model.open_weights === true),
        metric: intelligenceMetric,
      },
      {
        label: "Pareto Balance",
        allowRepeat: true,
        allowFallback: false,
        model: rankModels(
          frontier,
          (model) => intelligenceScore(model) * Number(model.scores.value_score),
        )[0],
        metric: intelligenceValueMetric,
      },
      {
        label: "Pareto Value",
        allowRepeat: true,
        allowFallback: false,
        model: rankModels(
          frontier.filter(
            (model) => medianIntelligence != null && intelligenceScore(model) > medianIntelligence,
          ),
          (model) => Number(model.scores.value_score),
        )[0],
        metric: intelligenceValueMetric,
      },
    ],
    intelligenceRanking.slice(0, 5),
  );
  return selectedModels.map(({ model, role, metric }) => ({
    key: `${modelVariantKey(model)}:${role}`,
    family: canonicalModelKey(model),
    role,
    metric,
    name: shortLabel({ ...model, reasoning_effort: null }),
    logo: providerLogo(model.provider) || model.logo,
    color: providerChartColor(model.provider),
  }));
}

type SignatureRole = {
  label: string;
  allowRepeat?: boolean;
  allowFallback?: boolean;
  model: ModelAtlasModel | undefined;
  metric: (model: ModelAtlasModel) => SignatureMetric;
};

function selectRolesWithTopFiveFallback(
  roles: SignatureRole[],
  intelligenceTopFive: ModelAtlasModel[],
) {
  const selectedModelKeys = new Set<string>();
  const selected = roles.map((role) => {
    const model = role.model;
    if (
      model == null ||
      (role.allowRepeat !== true && selectedModelKeys.has(canonicalModelKey(model)))
    ) {
      return null;
    }
    selectedModelKeys.add(canonicalModelKey(model));
    return {
      model,
      role: role.label,
      metric: role.metric(model),
    };
  });
  const fallbacks = intelligenceTopFive.filter(
    (model) => !selectedModelKeys.has(canonicalModelKey(model)),
  );
  return selected.flatMap((selection, index) => {
    if (selection != null) {
      return [selection];
    }
    if (roles[index]?.allowFallback === false) {
      return [];
    }
    const model = fallbacks.shift();
    if (model == null) {
      return [];
    }
    const intelligenceRank = intelligenceTopFive.indexOf(model) + 1;
    return [
      {
        model,
        role: `Intelligence #${intelligenceRank}`,
        metric: intelligenceMetric(model),
      },
    ];
  });
}

function rankModels(
  models: ModelAtlasModel[],
  metric: (model: ModelAtlasModel) => number,
): ModelAtlasModel[] {
  return [...models].sort(
    (left, right) =>
      metric(right) - metric(left) ||
      intelligenceScore(right) - intelligenceScore(left) ||
      shortLabel(left).localeCompare(shortLabel(right)),
  );
}

function intelligenceScore(model: ModelAtlasModel): number {
  return Number(model.scores.intelligence_score);
}

function intelligenceMetric(model: ModelAtlasModel): SignatureMetric {
  return { kind: "intelligence", score: intelligenceScore(model) };
}

function intelligenceValueMetric(model: ModelAtlasModel): SignatureMetric {
  const price = model.cost?.blended_price;
  return {
    ...intelligenceMetric(model),
    value: Number(model.scores.value_score),
    ...(typeof price === "number" && Number.isFinite(price) && price >= 0 ? { price } : {}),
  };
}

function intelligenceValueModels(models: ModelAtlasModel[]): ModelAtlasModel[] {
  return modelsForVariantDisplay(
    models.filter(
      (model) => model.name != null && Number.isFinite(model.scores.intelligence_score),
    ),
    false,
  ).filter((model) => Number.isFinite(model.scores.value_score));
}
