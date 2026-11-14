/** How the dashboard names and marks a model; counts and variant groups key on the canonical model family, so every reasoning effort of one model counts once. */

import {
  canonicalModelKey,
  reasoningEffortRank,
} from "../../../src/model-atlas/identity/normalization";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { providerLogo } from "./provider-theme";

export function modelCount(models: ModelAtlasModel[]): number {
  return new Set(models.map(canonicalModelKey)).size;
}

export function modelDisplayName(
  model: Pick<ModelAtlasModel, "id" | "name" | "reasoning_effort">,
): string {
  const baseName = model.name ?? model.id ?? "Unknown model";
  return model.reasoning_effort == null ? baseName : `${baseName} (${model.reasoning_effort})`;
}

/** The display name with provider spellings unified: "GPT 6.1 Sol" → "GPT-6.1 Sol", and a bare "Fable 5" → "Claude Fable 5". */
export function modelName(model: Pick<ModelAtlasModel, "id" | "name" | "reasoning_effort">) {
  return modelDisplayName(model)
    .replace(/\bGPT\s+(?=\d)/g, "GPT-")
    .replace(/\bFable\s+(?=\d)/g, prefixBareFableModelName);
}

export function shortLabel(model: Pick<ModelAtlasModel, "id" | "name" | "reasoning_effort">) {
  return modelName(model).replace(" Preview", "");
}

export function modelLogo(model: ModelAtlasModel) {
  const logo = providerLogo(model.provider);
  if (logo.length > 0) {
    return logo;
  }
  return typeof model.logo === "string" ? model.logo : "";
}

/** Group items by model family, each group's variants in ascending effort order with an unlabeled sibling included; a family with only one variant forms no group. */
export function reasoningVariantGroups<T>(
  items: readonly T[],
  getModel: (item: T) => ModelAtlasModel,
) {
  const variantsByModel = new Map<string, T[]>();
  for (const item of items) {
    const model = getModel(item);
    const key = canonicalModelKey(model);
    const variants = variantsByModel.get(key) ?? [];
    variants.push(item);
    variantsByModel.set(key, variants);
  }
  return [...variantsByModel]
    .map(([key, variants]) => ({
      key,
      variants: variants.sort((left, right) => {
        const leftEffort = getModel(left).reasoning_effort;
        const rightEffort = getModel(right).reasoning_effort;
        return (
          reasoningEffortRank(leftEffort) - reasoningEffortRank(rightEffort) ||
          String(leftEffort).localeCompare(String(rightEffort))
        );
      }),
    }))
    .filter((group) => group.variants.length > 1);
}

function prefixBareFableModelName(match: string, offset: number, name: string) {
  const previousToken = name.slice(Math.max(0, offset - "Claude ".length), offset);
  return previousToken === "Claude " ? match : `Claude ${match}`;
}
