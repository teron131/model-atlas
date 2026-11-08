/** Select the established frontier roles and translate the displayed models into stars for the frontier sky. */

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { providerIdentityKey } from "../../../src/model-atlas/identity/provider";
import { clamp01, medianOfFinite } from "../../../src/model-atlas/math-utils";
import { type ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { paretoFrontier } from "../graphs/plot/pareto-frontier";
import type { ModelSheetModel } from "../model-sheet/open";
import { collapsedModels, modelsForVariantDisplay, shortLabel } from "../shared/model-display";
import { providerChartColor, providerDisplayName, providerLogo } from "../shared/provider-theme";
import type { SkyStar } from "./sky-scene";

// Star tint when a provider's colour is theme-dependent; the sky is dark in both themes.
const SKY_INK = "#eef2ff";
const ROLE_LIST = new Intl.ListFormat("en", { style: "short", type: "conjunction" });

export type SignaturePopulation = {
  models: ModelAtlasModel[];
  paretoModels: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
};

/** Expanded variants are drawn as filtered, while a collapsed row stands for every variant of its family, so the sky picks each family's strongest variant itself. */
export function signaturePopulation({
  shownModels,
  paretoCandidates,
  referenceModels,
  showVariants,
}: {
  shownModels: readonly ModelAtlasModel[];
  paretoCandidates: readonly ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
}): SignaturePopulation {
  const shown = shownModels
    .filter(isNamedAndScored)
    .sort((left, right) => right.scores.intelligence_score - left.scores.intelligence_score);
  const placeable = referenceModels.filter(isNamedAndScored);
  return {
    models: showVariants ? shown : modelsInFamilies(placeable, shown),
    paretoModels: modelsInFamilies(placeable, paretoCandidates),
    referenceModels,
  };
}

function modelsInFamilies(
  models: readonly ModelAtlasModel[],
  members: readonly ModelAtlasModel[],
): ModelAtlasModel[] {
  const families = new Set(members.map(canonicalModelKey));
  return models.filter((model) => families.has(canonicalModelKey(model)));
}

function isNamedAndScored(model: ModelAtlasModel): boolean {
  return model.name != null && Number.isFinite(model.scores.intelligence_score);
}

/** The scores that earned a model its frontier roles; Pareto roles add the Value score and blended price behind the choice. */
export type SignatureMetric = {
  intelligence?: number;
  agentic?: number;
  value?: number;
  price?: number;
};

type SignatureModel = {
  family: string;
  /**
   * The model the first role was chosen from, a reasoning variant when that role compared variants, so its sheet shows the score the register names.
   * A model holding several roles opens this one sheet, so a later role's score can come from another effort of the same model.
   */
  sheet: ModelSheetModel;
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
  return collapsedModels(models.filter(isNamedAndScored)).flatMap((model) => {
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
  const variants = modelsForVariantDisplay(models, true);
  const baseModels = collapsedModels(variants);
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
      .map((model) => providerIdentityKey(model.provider)),
  );
  const anotherLab = intelligenceRanking.find(
    (model) => !representedLabs.has(providerIdentityKey(model.provider)),
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
        metric: (model) => ({ agentic: Number(model.scores.agentic_score) }),
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
  // A model holding several roles is one entry, named by every role it holds.
  const entries = new Map<
    string,
    { model: ModelAtlasModel; roles: string[]; metric: SignatureMetric }
  >();
  for (const { model, role, metric } of selectedModels) {
    const family = canonicalModelKey(model);
    const entry = entries.get(family);
    if (entry == null) {
      entries.set(family, { model, roles: [role], metric });
    } else {
      entry.roles.push(role);
      entry.metric = { ...metric, ...entry.metric };
    }
  }
  return [...entries].map(([family, { model, roles, metric }]) => ({
    family,
    sheet: { id: model.id, name: model.name, reasoning_effort: model.reasoning_effort },
    role: roleLabel(roles),
    metric,
    name: shortLabel({ ...model, reasoning_effort: null }),
    logo: providerLogo(model.provider) || model.logo,
    color: providerChartColor(model.provider),
  }));
}

/** Join a model's roles, dropping the leading word a role shares with the one before it. */
function roleLabel(roles: string[]) {
  return ROLE_LIST.format(
    roles.map((role, index) => {
      const [lead, ...rest] = role.split(" ");
      return index > 0 && rest.length > 0 && roles[index - 1]?.split(" ")[0] === lead
        ? rest.join(" ")
        : role;
    }),
  );
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
  return { intelligence: intelligenceScore(model) };
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
  return collapsedModels(models.filter(isNamedAndScored)).filter((model) =>
    Number.isFinite(model.scores.value_score),
  );
}
