/** Qwen identity rules reconcile source name spacing and preserve product tiers that resemble reasoning-effort suffixes. */

const QWEN_MODEL_PATTERN = /^qwen(?:\d|-)/;

export function canonicalQwenName(value: string): string {
  return value.replace(/^qwen\s+(?=\d)/i, "Qwen");
}

/** Identify a Qwen Max product tier in a normalized model token, including routes that still carry a preview label; a mode word before Max, as in `qwen3-8-reasoning-max`, makes it an effort. */
export function hasQwenMaxTier(token: string): boolean {
  const slug = (token.split("/").at(-1) ?? "").replace(/-preview$/, "");
  return (
    QWEN_MODEL_PATTERN.test(slug) &&
    slug.endsWith("-max") &&
    !/-(?:reasoning|thinking)-max$/.test(slug)
  );
}
