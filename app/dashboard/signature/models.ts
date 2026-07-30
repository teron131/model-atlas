/** Normalize live model evidence into the shared parameter system used by every signature mode. */

import { meanOfFinite, quantileFromSorted } from "../../../src/model-atlas/numeric";
import { strongestModelVariants } from "../../../src/model-atlas/pipeline/selection/public-list";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelDisplayName, modelVariantKey } from "../shared/model-display";
import { providerChartColor, providerDisplayName, providerLogo } from "../shared/provider-theme";

export type SignatureMode = "field" | "phase" | "type";

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

const QUALITY_PERCENTILE = 0.8;

export function signatureModels(models: ModelAtlasModel[], limit = 5): SignatureModel[] {
  const baseModels = strongestModelVariants(
    models.filter(
      (model) => model.name != null && Number.isFinite(model.scores.intelligence_score),
    ),
  );
  const qualityThreshold =
    quantileFromSorted(
      baseModels
        .map((model) => model.scores.intelligence_score)
        .sort((left, right) => left - right),
      QUALITY_PERCENTILE,
    ) ?? -Infinity;
  const qualityFrontier = baseModels.filter(
    (model) => model.scores.intelligence_score >= qualityThreshold,
  );
  const intelligenceRanking = rankModels(baseModels, (model) => model.scores.intelligence_score);
  const selectedModels = selectRolesWithTopFiveFallback(
    [
      {
        label: "Best Intelligence",
        candidates: intelligenceRanking.slice(0, 1),
        metric: (model) => `INT ${model.scores.intelligence_score.toFixed(1)}`,
      },
      {
        label: "Best Agentic",
        candidates: rankModels(
          baseModels.filter((model) => Number.isFinite(model.scores.agentic_score)),
          (model) => Number(model.scores.agentic_score),
        ).slice(0, 1),
        metric: (model) => `AGT ${Number(model.scores.agentic_score).toFixed(1)}`,
      },
      {
        label: "Another Top 3",
        candidates: intelligenceRanking.slice(0, 3),
        metric: (model) =>
          `INT #${intelligenceRanking.indexOf(model) + 1} · ${model.scores.intelligence_score.toFixed(1)}`,
      },
      {
        label: "Best Open Weight",
        candidates: rankModels(
          baseModels.filter((model) => model.open_weights === true),
          (model) => model.scores.intelligence_score,
        ).slice(0, 1),
        metric: (model) => `INT ${model.scores.intelligence_score.toFixed(1)}`,
      },
      {
        label: "Pareto Frontier",
        candidates: rankModels(
          qualityFrontier.filter(
            (model) =>
              Number.isFinite(model.cost?.blended_price) && Number(model.cost?.blended_price) >= 0,
          ),
          (model) => Number(model.cost?.blended_price),
          "ascending",
        ).slice(0, 1),
        metric: (model) =>
          `INT ${model.scores.intelligence_score.toFixed(1)} · ${formatPrice(Number(model.cost?.blended_price))} / 1M`,
      },
    ],
    intelligenceRanking.slice(0, 5),
    limit,
  );
  return selectedModels.map(({ model, role, selectionMetric }, index) => ({
    key: modelVariantKey(model),
    rank: index + 1,
    role,
    selectionMetric,
    name: modelDisplayName(model),
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
  candidates: ModelAtlasModel[];
  metric: (model: ModelAtlasModel) => string;
};

function selectRolesWithTopFiveFallback(
  roles: SignatureRole[],
  intelligenceTopFive: ModelAtlasModel[],
  limit: number,
) {
  const selectedModels = new Set<ModelAtlasModel>();
  const selected = roles.slice(0, limit).map((role) => {
    const model = role.candidates.find((candidate) => !selectedModels.has(candidate));
    if (model == null) {
      return null;
    }
    selectedModels.add(model);
    return {
      model,
      role: role.label,
      selectionMetric: role.metric(model),
    };
  });
  const fallbacks = intelligenceTopFive.filter((model) => !selectedModels.has(model));
  return selected.flatMap((selection) => {
    if (selection != null) {
      return [selection];
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
        selectionMetric: `INT ${model.scores.intelligence_score.toFixed(1)}`,
      },
    ];
  });
}

function rankModels(
  models: ModelAtlasModel[],
  metric: (model: ModelAtlasModel) => number,
  direction: "ascending" | "descending" = "descending",
): ModelAtlasModel[] {
  const directionFactor = direction === "ascending" ? 1 : -1;
  return [...models].sort(
    (left, right) =>
      (metric(left) - metric(right)) * directionFactor ||
      right.scores.intelligence_score - left.scores.intelligence_score ||
      modelDisplayName(left).localeCompare(modelDisplayName(right)),
  );
}

function formatPrice(value: number): string {
  if (value < 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value < 10) {
    return `$${value.toFixed(1)}`;
  }
  return `$${value.toFixed(0)}`;
}

/** Translate published scores into the normalized parameter vocabulary owned by signature renderers. */
function signatureScoreParameters(model: Pick<ModelAtlasModel, "scores">) {
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
