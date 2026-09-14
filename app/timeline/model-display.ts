/** Adapt model labels and explicit Timeline visibility choices without changing calibration or source evidence. */
import { canonicalModelKey } from "../../src/model-atlas/identity/normalization";
import { providerIdentityKey } from "../../src/model-atlas/identity/provider";
import { historicalReleaseName } from "../../src/model-atlas/timeline/model-identity";
import type { HistoricalModel } from "../../src/model-atlas/timeline/types";
import { modelName, shortLabel } from "../dashboard/shared/model-display";

export function timelineModelName(model: HistoricalModel, showEffort = false): string {
  return modelName({
    id: model.id,
    name: displayName(model),
    reasoning_effort: showEffort ? model.effort : null,
  });
}

export function timelineModelLabel(model: HistoricalModel): string {
  return shortLabel({ id: model.id, name: displayName(model), reasoning_effort: null });
}

/** Follow reconciled family labels while preserving original source names in evidence and genuinely distinct preview releases. */
function displayName(model: HistoricalModel): string {
  const name = model.name
    .replace(/\bpreview\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .trim();
  if (canonicalModelKey({ name }) === model.family) return name;
  const dated = model.releaseDate ? historicalReleaseName(name, model.releaseDate) : null;
  return dated && canonicalModelKey({ name: dated }) === model.family ? dated : model.name;
}

/** These named families are hidden by the default display policy; this is not a claim about evidence quality or a scoring exclusion. */
export function timelineDisplayExclusion(
  model: Pick<HistoricalModel, "name" | "provider">,
): "OpenAI Pro" | "Gemini Deep Think" | "Claude Mythos" | null {
  const provider = providerIdentityKey(model.provider);
  const name = canonicalModelKey({ name: model.name }).replace(/^name:/, "");
  if (provider === "openai" && /^(?:gpt-\d+(?:-\d+)*|o\d+)-pro(?:-|$)/.test(name))
    return "OpenAI Pro";
  if (provider === "google" && /^gemini-.*deep-think(?:-|$)/.test(name)) return "Gemini Deep Think";
  if (provider === "anthropic" && /^claude-mythos(?:-|$)/.test(name)) return "Claude Mythos";
  return null;
}
