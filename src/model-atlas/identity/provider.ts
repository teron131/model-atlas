/** Canonical organization aliases shared by identity matching and presentation; service-route IDs remain separate. */

const PROVIDER_ALIASES: Record<string, string> = {
  "google-deepmind": "google",
  deepmind: "google",
  "google-research": "google",
  "google-deepmind-google": "google",
  "google-google-deepmind": "google",
  "meta-ai": "meta",
  "mistral-ai": "mistral",
  "microsoft-research": "microsoft",
  kimi: "moonshotai",
  moonshot: "moonshotai",
  "z-ai-zhipu-ai": "zai",
  "xiaomi-corp": "xiaomi",
  "meta-llama": "meta",
  mistralai: "mistral",
  "x-ai": "xai",
  "z-ai": "zai",
  qwen: "alibaba",
  spacexai: "xai",
  thinkingmachines: "thinking-machines",
  nex: "nex-agi",
  longcat: "meituan",
  kwaipilot: "kwaikat",
  "ibm-granite": "ibm",
  "arcee-ai": "arcee",
  aws: "amazon",
  liquid: "liquidai",
  "liquid-ai": "liquidai",
  rekaai: "reka-ai",
  nousresearch: "nous-research",
  azure: "microsoft",
};

/** Map publisher names to one organization without changing model or service-route identities. */
export function providerIdentityKey(provider: string | null | undefined) {
  const key = String(provider ?? "unknown")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return PROVIDER_ALIASES[key] ?? key;
}

/** Qualified catalog IDs carry the publisher namespace; an unqualified gateway route does not establish ownership. */
export function modelProviderIdentity(modelId: string, providerId?: string | null): string | null {
  const namespace = modelId.includes("/") ? modelId.split("/")[0] : providerId;
  if (!namespace || ["openrouter", "vercel"].includes(namespace)) return null;
  return providerIdentityKey(namespace);
}
