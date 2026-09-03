/** Normalize live model evidence into the shared parameter system used by every signature mode. */

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { meanOfFinite, medianOfFinite } from "../../../src/model-atlas/math-utils";
import {
  isPreviewModel,
  type ModelAtlasPublishedModel,
} from "../../../src/model-atlas/stats/types";
import { graphModelLabel } from "../graphs/model-series";
import { paretoFrontier } from "../graphs/plot/ParetoEnvelope";
import { modelsForVariantDisplay, modelVariantKey } from "../shared/model-display";
import {
  providerChartColor,
  providerDisplayName,
  providerFilterKey,
  providerLogo,
} from "../shared/provider-theme";
import { formatCost } from "../table/format";

export type SignatureMode = "field" | "phase" | "type";

export type SignaturePopulation = {
  models: ModelAtlasPublishedModel[];
  paretoModels: ModelAtlasPublishedModel[];
  referenceModels: ModelAtlasPublishedModel[];
};

type SignatureParameters = {
  intelligence: number;
  agentic: number;
  speed: number;
  value: number;
  mean: number;
  context: number;
};

export type SignatureModel = {
  key: string;
  rank: number;
  preview: boolean;
  role: string;
  selectionMetric: string;
  name: string;
  provider: string;
  logo: string;
  color: string;
  parameters: SignatureParameters;
};

export const signatureModeLabels: Record<SignatureMode, string> = {
  field: "Evidence Field",
  phase: "Phase Ledger",
  type: "Signal Type",
};

/** Select visible role leaders and display-limit-independent Pareto choices against a global Intelligence median. */
export function signatureModels(
  { models, paretoModels, referenceModels }: SignaturePopulation,
  limit = 6,
): SignatureModel[] {
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
      .filter((model): model is ModelAtlasPublishedModel => model != null)
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
        metric: (model) => `INT ${intelligenceScore(model).toFixed(1)}`,
      },
      {
        label: "Best Agentic",
        allowRepeat: true,
        model: agenticRanking[0],
        metric: (model) => `AGT ${Number(model.scores.agentic_score).toFixed(1)}`,
      },
      {
        label: "Another Lab",
        model: anotherLab,
        metric: (model) => `INT ${intelligenceScore(model).toFixed(1)}`,
      },
      {
        label: "Best Open Weight",
        allowRepeat: true,
        model: intelligenceRanking.find((model) => model.open_weights === true),
        metric: (model) => `INT ${intelligenceScore(model).toFixed(1)}`,
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
    limit,
  );
  return selectedModels.map(({ model, role, selectionMetric }, index) => ({
    key: `${modelVariantKey(model)}:${role}`,
    rank: index + 1,
    preview: isPreviewModel(model),
    role,
    selectionMetric,
    name: graphModelLabel({ ...model, reasoning_effort: null }),
    provider: providerDisplayName(model),
    logo: providerLogo(model.provider) || model.logo,
    color: providerChartColor(model.provider),
    parameters: {
      ...signatureScoreParameters(model),
      context: contextUnit(model.context_window?.context),
    },
  }));
}

type SignatureRole = {
  label: string;
  allowRepeat?: boolean;
  allowFallback?: boolean;
  model: ModelAtlasPublishedModel | undefined;
  metric: (model: ModelAtlasPublishedModel) => string;
};

function selectRolesWithTopFiveFallback(
  roles: SignatureRole[],
  intelligenceTopFive: ModelAtlasPublishedModel[],
  limit: number,
) {
  const selectedModelKeys = new Set<string>();
  const selected = roles.slice(0, limit).map((role) => {
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
      selectionMetric: role.metric(model),
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
        selectionMetric: `INT ${intelligenceScore(model).toFixed(1)}`,
      },
    ];
  });
}

function rankModels(
  models: ModelAtlasPublishedModel[],
  metric: (model: ModelAtlasPublishedModel) => number,
): ModelAtlasPublishedModel[] {
  return [...models].sort(
    (left, right) =>
      metric(right) - metric(left) ||
      intelligenceScore(right) - intelligenceScore(left) ||
      graphModelLabel(left).localeCompare(graphModelLabel(right)),
  );
}

function intelligenceScore(model: ModelAtlasPublishedModel): number {
  return Number(model.scores.intelligence_score);
}

function intelligenceValueMetric(model: ModelAtlasPublishedModel): string {
  const scores = `INT ${intelligenceScore(model).toFixed(1)} · VAL ${Number(model.scores.value_score).toFixed(1)}`;
  const price = model.cost?.blended_price;
  return typeof price === "number" && Number.isFinite(price) && price >= 0
    ? `${scores} · BLEND ${formatCost(price)}/M`
    : scores;
}

function intelligenceValueModels(models: ModelAtlasPublishedModel[]): ModelAtlasPublishedModel[] {
  return modelsForVariantDisplay(
    models.filter(
      (model) => model.name != null && Number.isFinite(model.scores.intelligence_score),
    ),
    false,
  ).filter((model) => Number.isFinite(model.scores.value_score));
}

/** Translate published scores into the normalized parameter vocabulary owned by signature renderers. */
function signatureScoreParameters(model: Pick<ModelAtlasPublishedModel, "scores">) {
  const rawScores = [
    model.scores.intelligence_score,
    model.scores.agentic_score,
    model.scores.speed_score,
    model.scores.value_score,
  ];
  const fallbackScore = meanOfFinite(rawScores) ?? 0;
  return {
    intelligence: scoreUnit(model.scores.intelligence_score, fallbackScore),
    agentic: scoreUnit(model.scores.agentic_score, fallbackScore),
    speed: scoreUnit(model.scores.speed_score, fallbackScore),
    value: scoreUnit(model.scores.value_score, fallbackScore),
    mean: scoreUnit(fallbackScore, 0),
  };
}

function scoreUnit(value: number | null | undefined, fallback: number): number {
  return clamp((Number.isFinite(value) ? Number(value) : fallback) / 100);
}

function contextUnit(value: number | null | undefined): number {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return 0.35;
  }
  return clamp((Math.log10(Number(value)) - 4) / 3);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
