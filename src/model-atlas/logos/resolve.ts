/** Resolves where a model's logo comes from: the creator logo Artificial Analysis publishes, else the Models.dev logo of the model's provider; caching drops a source that cannot be fetched. */
const ARTIFICIAL_ANALYSIS_LOGO_BASE_URL = "https://artificialanalysis.ai/img/logos";
const MODELS_DEV_LOGO_BASE_URL = "https://models.dev/logos";

// Model creators whose Models.dev provider id differs from their own slug.
const MODELS_DEV_PROVIDER_BY_CREATOR: Record<string, string> = {
  "meta-llama": "meta",
  mistralai: "mistral",
  qwen: "alibaba",
  "x-ai": "xai",
  "z-ai": "zai",
};

function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeProvider(provider: string | null | undefined): string | null {
  const providerValue = nonEmptyString(provider);
  if (!providerValue) {
    return null;
  }
  const normalizedProvider = providerValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalizedProvider.length > 0 ? normalizedProvider : null;
}

function absoluteLogoUrl(logoUrl: string | null | undefined): string | null {
  const logoValue = nonEmptyString(logoUrl);
  if (!logoValue) {
    return null;
  }
  if (logoValue.startsWith("http://") || logoValue.startsWith("https://")) {
    return logoValue;
  }
  if (logoValue.startsWith("/")) {
    return `https://artificialanalysis.ai${logoValue}`;
  }
  if (logoValue.includes("/")) {
    return `https://artificialanalysis.ai/${logoValue}`;
  }
  return `${ARTIFICIAL_ANALYSIS_LOGO_BASE_URL}/${logoValue}`;
}

/** The logo a model shows before caching: the source's own logo, else its provider's Models.dev logo, else none. */
export function resolveModelLogo(options: {
  provider?: string | null;
  explicitLogo?: string | null;
}): string {
  return absoluteLogoUrl(options.explicitLogo) ?? modelsDevLogoUrl(options.provider) ?? "";
}

/**
 * The Models.dev logo URL for a provider.
 * Models.dev answers any provider id it does not list with one shared placeholder, so the cache compares fetched logos against `modelsDevPlaceholderFor()` rather than trusting a successful response.
 */
export function modelsDevLogoUrl(provider: string | null | undefined): string | null {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) {
    return null;
  }
  const modelsDevProvider =
    MODELS_DEV_PROVIDER_BY_CREATOR[normalizedProvider] ?? normalizedProvider;
  return `${MODELS_DEV_LOGO_BASE_URL}/${modelsDevProvider}.svg`;
}

/** For a Models.dev logo URL, the URL of the placeholder it serves for providers it does not list; `null` for any other source. */
export function modelsDevPlaceholderFor(source: string): string | null {
  return source.startsWith(`${MODELS_DEV_LOGO_BASE_URL}/`)
    ? `${MODELS_DEV_LOGO_BASE_URL}/model-atlas-unlisted-provider.svg`
    : null;
}
