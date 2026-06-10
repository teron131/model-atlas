/** Provider color selection for dashboard rows and logos. */

import { safeSlug } from "./format";

export type ProviderThemeColors = Record<string, string>;

const selectedProviderThemeColors: ProviderThemeColors = {
	alibaba: "#ff7018",
	anthropic: "#d07860",
	amazon: "#ff9800",
	aws: "#ff9800",
	deepseek: "#2040e8",
	google: "#38a850",
	kimi: "#0878ff",
	meta: "#0088f8",
	minimax: "#e83868",
	mistral: "#ff6800",
	mistralai: "#ff6800",
	moonshotai: "#0878ff",
	nvidia: "#88b838",
	openai: "#eeeeea",
	qwen: "#ff7018",
	tencent: "#1820a8",
	upstage: "#8058f8",
	xai: "#7070d0",
	"x-ai": "#7070d0",
	xiaomi: "#ff6800",
	zai: "#2080f8",
	"z-ai": "#2080f8",
};

export const providerThemeSlug = (provider: string | null | undefined) =>
	safeSlug(provider);

export function hasSelectedProviderThemeColor(
	provider: string | null | undefined,
) {
	const slug = providerThemeSlug(provider);
	return slug.length > 0 && selectedProviderThemeColors[slug] != null;
}

export function providerThemeColor(
	provider: string | null | undefined,
	iconDerivedColors: ProviderThemeColors,
) {
	const slug = providerThemeSlug(provider);
	if (!slug) {
		return undefined;
	}
	return selectedProviderThemeColors[slug] ?? iconDerivedColors[slug];
}
