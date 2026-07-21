/** Dashboard provider labels, brand assets, and chart colors. */

import { safeSlug } from "./format";
import { providerAssets } from "./provider-assets.generated";

type ProviderLike = { provider?: string | null };

type ProviderColorMap = Record<string, string>;
type ProviderAssetKey = keyof typeof providerAssets;

const providerColorOverrides: ProviderColorMap = {
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
	"nex-agi": "#5cc8c8",
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
	moonshotai: "Moonshot AI",
	"nex-agi": "Nex AGI",
	nvidia: "NVIDIA",
	openai: "OpenAI",
	qwen: "Qwen",
	tencent: "Tencent",
	upstage: "Upstage",
	xai: "xAI",
	xiaomi: "Xiaomi",
	zai: "Z AI",
};

const providerFilterAliases: Record<string, string> = {
	"meta-llama": "meta",
	mistralai: "mistral",
	"x-ai": "xai",
	"z-ai": "zai",
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

export function providerDisplayName(source: ProviderLike | string | null) {
	const provider = typeof source === "string" ? source : source?.provider;
	const key = providerFilterKey(provider);
	return providerLabels[key] ?? provider ?? "Unknown";
}

export function providerFilterKey(provider: string | null | undefined) {
	const key = String(provider ?? "unknown")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return providerFilterAliases[key] ?? key;
}

function providerAssetKey(provider: string | null | undefined) {
	return safeSlug(provider);
}

export function providerChartColor(provider: string | null | undefined) {
	const key = providerFilterKey(provider);
	if (providerColorOverrides[key]) {
		return providerColorOverrides[key];
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

export function providerBrandColor(provider: string | null | undefined) {
	return (
		providerColorOverrides[providerAssetKey(provider)] ??
		providerAsset(provider)?.color
	);
}

export function providerLogo(provider: string | null | undefined) {
	return providerAsset(provider)?.logo ?? "";
}

function providerAsset(provider: string | null | undefined) {
	const key = providerAssetKey(provider);
	if (!key) {
		return undefined;
	}
	return providerAssets[key as ProviderAssetKey];
}
