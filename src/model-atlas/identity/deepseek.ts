/** DeepSeek identity rules reconcile sources that write a version without its V with DeepSeek's own spelling, since DeepSeek names every numbered release that way. */

/** Restores the V between a leading "DeepSeek" and its version number: `"DeepSeek 4.1 Flash"` → `"DeepSeek V4.1 Flash"`. */
export function canonicalDeepSeekName(value: string): string {
  return value.replace(/^deepseek\s+(?=\d)/i, "DeepSeek V");
}
