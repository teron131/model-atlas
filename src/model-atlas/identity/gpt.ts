/** GPT identity rules distinguish product configurations from reasoning-effort labels. */

/** `gpt` as a whole token between separators or string ends: `"openai/gpt-5.1"` matches, `"chatgpt-4o-latest"` does not. */
const GPT_MODEL_PATTERN = /(?:^|[\s._:/-])gpt(?:[\s._:/-]|$)/i;

/** Recognize GPT model identities without depending on one source's separator normalization. */
export function isGptModelIdentity(value: string): boolean {
  return GPT_MODEL_PATTERN.test(value);
}
