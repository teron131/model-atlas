import { safeSlug } from "./format";
import { providerAssets } from "./providerAssets.generated";

type ProviderLike = { provider?: string | null };

type ProviderColorMap = Record<string, string>;
type ProviderAssetKey = keyof typeof providerAssets;

export const fixedProviderColors: ProviderColorMap = {
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
	openai: "var(--provider-openai-color)",
	qwen: "#ff7018",
	tencent: "#1820a8",
	upstage: "#8058f8",
	xai: "#7070d0",
	"x-ai": "#7070d0",
	xiaomi: "#ff6800",
	zai: "#2080f8",
	"z-ai": "#2080f8",
};

const providerLabels: Record<string, string> = {
	alibaba: "Alibaba",
	anthropic: "Anthropic",
	amazon: "Amazon",
	aws: "AWS",
	deepseek: "DeepSeek",
	google: "Google",
	kimi: "Kimi",
	meta: "Meta",
	minimax: "MiniMax",
	mistral: "Mistral",
	mistralai: "Mistral",
	moonshotai: "Moonshot AI",
	nvidia: "NVIDIA",
	openai: "OpenAI",
	qwen: "Qwen",
	tencent: "Tencent",
	upstage: "Upstage",
	xai: "xAI",
	"x-ai": "xAI",
	xiaomi: "Xiaomi",
	zai: "Z AI",
	"z-ai": "Z AI",
};

const fallbackProviderColors = [
	"#ff5a46",
	"#f6b44b",
	"#7cc69b",
	"#7aa7ff",
	"#d078ff",
	"#5cc8c8",
	"#d7d46a",
];

export function providerName(model: ProviderLike | string | null) {
	const rawProvider = typeof model === "string" ? model : model?.provider;
	const key = providerFilterKey(rawProvider);
	return providerLabels[key] ?? rawProvider ?? "Unknown";
}

export function providerFilterKey(provider: string | null | undefined) {
	return String(provider ?? "unknown")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function providerColorKey(provider: string | null | undefined) {
	return safeSlug(provider);
}

export function providerPaletteColor(provider: string | null | undefined) {
	const key = providerFilterKey(provider);
	if (fixedProviderColors[key]) {
		return fixedProviderColors[key];
	}
	const assetColor = providerAsset(provider)?.color;
	if (assetColor != null) {
		return assetColor;
	}
	let hash = 0;
	for (const char of key) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return (
		fallbackProviderColors[hash % fallbackProviderColors.length] ?? "#ff5a46"
	);
}

export function providerDisplayColor(provider: string | null | undefined) {
	return (
		fixedProviderColors[providerColorKey(provider)] ??
		providerAsset(provider)?.color
	);
}

export function providerAssetLogo(provider: string | null | undefined) {
	return providerAsset(provider)?.logo ?? "";
}

function providerAsset(provider: string | null | undefined) {
	const key = providerColorKey(provider);
	if (!key) {
		return undefined;
	}
	return providerAssets[key as ProviderAssetKey];
}
