/** Shared public display policy hides specialized configurations without changing evidence, scores, or calibration. */

import { canonicalModelKey } from "../identity/normalization";
import { providerIdentityKey } from "../identity/provider";

/** These named families are hidden by the default display policy; this is not a claim about evidence quality or a scoring exclusion. */
export function modelDisplayExclusion(model: {
  name: string | null;
  provider: string | null;
}): "OpenAI Pro" | "Gemini Deep Think" | "Claude Mythos" | null {
  const provider = providerIdentityKey(model.provider);
  const name = canonicalModelKey({ name: model.name ?? "" }).replace(/^name:/, "");
  if (provider === "openai" && /^(?:gpt-\d+(?:-\d+)*|o\d+)-pro(?:-|$)/.test(name))
    return "OpenAI Pro";
  if (provider === "google" && /^gemini-.*deep-think(?:-|$)/.test(name)) return "Gemini Deep Think";
  if (provider === "anthropic" && /^claude-mythos(?:-|$)/.test(name)) return "Claude Mythos";
  return null;
}
