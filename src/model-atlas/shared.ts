/** Shared LLM stats normalization helpers used before source rows reach matcher and scoring policy. */
import { asFiniteNumber, asRecord, type JsonObject } from "./utils";

export { asFiniteNumber, asRecord, type JsonObject };

export const PRIMARY_PROVIDER_ID = "openrouter" as const;
export const SECONDARY_PROVIDER_ID = "vercel" as const;
export const TERTIARY_PROVIDER_IDS = ["openai", "google", "anthropic"] as const;
export const FALLBACK_PROVIDER_IDS: ReadonlySet<string> = new Set([
	SECONDARY_PROVIDER_ID,
	...TERTIARY_PROVIDER_IDS,
]);

export function normalizeProviderId(providerId: string): string {
	return providerId.toLowerCase().replace(/^~+/, "");
}

/** Return the provider preference rank used by the stats matcher and source stage. */
export function providerPreferenceRank(providerId: string): number | null {
	const normalizedProviderId = normalizeProviderId(providerId);
	if (normalizedProviderId === PRIMARY_PROVIDER_ID) {
		return 0;
	}
	if (normalizedProviderId === SECONDARY_PROVIDER_ID) {
		return 1;
	}
	if (
		TERTIARY_PROVIDER_IDS.includes(
			normalizedProviderId as (typeof TERTIARY_PROVIDER_IDS)[number],
		)
	) {
		return 2;
	}
	return null;
}

export function normalizeModelToken(value: string): string {
	return value
		.toLowerCase()
		.replace(/[._:\s]+/g, "-")
		.replace(/[^a-z0-9/-]+/g, "")
		.replace(/-+/g, "-")
		.replace(/^[-/]+|[-/]+$/g, "");
}

export function modelSlugFromModelId(modelId: unknown): string | null {
	if (typeof modelId !== "string" || modelId.length === 0) {
		return null;
	}
	const slug = modelId.split("/").at(-1);
	return slug && slug.length > 0 ? slug : null;
}

export function normalizeProviderModelId(modelId: string): string {
	const slashIndex = modelId.indexOf("/");
	if (slashIndex <= 0) {
		return modelId.toLowerCase().replace(/\./g, "-").replace(/-+/g, "-");
	}
	const provider = normalizeProviderId(modelId.slice(0, slashIndex));
	const baseModelId = modelId
		.slice(slashIndex + 1)
		.toLowerCase()
		.replace(/\./g, "-")
		.replace(/-+/g, "-");
	return `${provider}/${baseModelId}`;
}
