/** Dashboard provider labels, brand assets, and chart colors. */

import { providerIdentityKey as providerFilterKey } from "../../../src/model-atlas/identity/provider";
export { providerIdentityKey as providerFilterKey } from "../../../src/model-atlas/identity/provider";

import { providerIcons } from "../../../src/model-atlas/logos/provider-icons.generated";

type ProviderLike = { provider?: string | null };

type ProviderColorMap = Record<string, string>;
type ProviderIconKey = keyof typeof providerIcons;

// Artificial Analysis's creator colours, so a provider reads the same here as on its charts; OpenAI's near-black follows the theme's ink instead, and providers missing here take their icon's colour.
const providerColorOverrides: ProviderColorMap = {
  ai9star: "#795bcf",
  alibaba: "#ff7018",
  amazon: "#ff9900",
  anthropic: "#cc785c",
  aws: "#ff9900",
  deepseek: "#2243e6",
  google: "#34a853",
  inclusionai: "#4fb5ff",
  kimi: "#047afe",
  lg: "#ff7018",
  meta: "#0089f4",
  microsoft: "#0078d5",
  minimax: "#eb3568",
  mistral: "#f32e02",
  mistralai: "#f32e02",
  moonshotai: "#047afe",
  multiversecomputing: "#1b818e",
  "nex-agi": "#0351bc",
  nvidia: "#76b900",
  openai: "var(--provider-openai-color)",
  qwen: "#ff7018",
  spacexai: "#736cd3",
  stepfun: "#00f5e7",
  tencent: "#5cb9ff",
  thinkingmachines: "#676767",
  upstage: "#7c59f5",
  "x-ai": "#736cd3",
  xai: "#736cd3",
  xiaomi: "#ff6900",
  "z-ai": "#1c7ff8",
  zai: "#1c7ff8",
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

function providerAssetKey(provider: string | null | undefined) {
  return String(provider ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function providerIcon(provider: string | null | undefined) {
  const key = providerFilterKey(provider);
  const assetKey = key === "xai" ? "x-ai" : key === "zai" ? "z-ai" : key;
  return providerIcons[assetKey as ProviderIconKey];
}

export function providerChartColor(provider: string | null | undefined) {
  const key = providerFilterKey(provider);
  if (providerColorOverrides[key]) {
    return providerColorOverrides[key];
  }
  const iconColor = providerIcon(provider)?.color;
  if (iconColor != null) {
    return iconColor;
  }
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return fallbackProviderColors[hash % fallbackProviderColors.length] ?? "#ff5a46";
}

export function providerBrandColor(provider: string | null | undefined) {
  return providerColorOverrides[providerAssetKey(provider)] ?? providerIcon(provider)?.color;
}

export function providerLogo(provider: string | null | undefined) {
  return providerIcon(provider)?.logo ?? "";
}
