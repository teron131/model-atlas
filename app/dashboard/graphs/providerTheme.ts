import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";

const providerThemeColors: Record<string, string> = {
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

const providerDisplayLabels: Record<string, string> = {
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

export function providerName(model: LlmStatsModel | string | null) {
	const rawProvider = typeof model === "string" ? model : model?.provider;
	const slug = providerSlug(rawProvider);
	return providerDisplayLabels[slug] ?? rawProvider ?? "Unknown";
}

export function providerSlug(provider: string | null | undefined) {
	return String(provider ?? "unknown")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function providerColor(provider: string | null | undefined) {
	const slug = providerSlug(provider);
	if (providerThemeColors[slug]) {
		return providerThemeColors[slug];
	}
	let hash = 0;
	for (const char of slug) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	return (
		fallbackProviderColors[hash % fallbackProviderColors.length] ?? "#ff5a46"
	);
}
