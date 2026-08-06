/** Qwen identity rules preserve product tiers that resemble reasoning-effort suffixes. */

import { normalizeModelToken } from "./normalization";

const QWEN_MODEL_PATTERN = /^qwen(?:\d|-)/;

/** Identify a Qwen Max product tier, including routes that still carry a preview label. */
export function hasQwenMaxTier(value: string): boolean {
  const slug = (normalizeModelToken(value).split("/").at(-1) ?? "").replace(/-preview$/, "");
  return QWEN_MODEL_PATTERN.test(slug) && slug.endsWith("-max");
}
