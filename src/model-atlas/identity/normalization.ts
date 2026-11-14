/** Model identity normalization owns provider, model-token, and reasoning-effort rules used across ingestion and scoring. */

import { isGptModelIdentity } from "./gpt";
import { canonicalMuseToken } from "./muse";
import { hasQwenMaxTier } from "./qwen";

export const OPENROUTER_PROVIDER_ID = "openrouter" as const;
export const VERCEL_PROVIDER_ID = "vercel" as const;
const FIRST_PARTY_PROVIDER_IDS = ["openai", "google", "anthropic"] as const;
export const FALLBACK_PROVIDER_IDS: ReadonlySet<string> = new Set([
  VERCEL_PROVIDER_ID,
  ...FIRST_PARTY_PROVIDER_IDS,
]);
const REASONING_EFFORT_RANK = {
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  "extra-high": 5,
  xhigh: 5,
  adaptive: 6,
  max: 7,
  ultra: 8,
} as const satisfies Readonly<Record<string, number>>;
const MODEL_CONFIGURATION_LABEL_PATTERN = /\s+\((?:fast|free|online|reasoning|thinking)\)\s*$/i;
const BENCHMARK_EFFORT_SUFFIX_PATTERN = /^(.*?)(?:\s+\(([^()]*)\)|\s+-\s+([^()]+))\s*$/i;
const REASONING_MODE_LABELS = new Set(["default", "thinking", "reasoning", "thinking-on"]);
const SLUG_EFFORT_SUFFIX_PATTERN =
  /^(.+?)-(none|non?-(?:reasoning|thinking)|minimal|low|medium|high|extra-high|xhigh|adaptive|max|ultra)$/i;
const BENCHMARK_EFFORT_LABELS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "extra-high",
  "xhigh",
  "adaptive",
  "max",
]);

type ParsedModelEffort = {
  baseModel: string;
  reasoningEffort: string | null;
};

export type BenchmarkModelRow = {
  model: string;
  base_model: string;
  reasoning_effort: string | null;
};

export function normalizeProviderId(providerId: string): string {
  return providerId.toLowerCase().replace(/^~+/, "");
}

/** Preserve qualified model IDs; otherwise qualify the usable primary or fallback ID with its provider. */
export function qualifyModelId(
  modelId: unknown,
  providerId: unknown,
  fallbackModelId: unknown,
): string | null {
  if (typeof modelId === "string" && modelId.includes("/")) {
    return modelId;
  }
  if (typeof providerId === "string" && typeof modelId === "string") {
    return `${providerId}/${modelId}`;
  }
  if (typeof providerId === "string" && typeof fallbackModelId === "string") {
    return `${providerId}/${fallbackModelId}`;
  }
  return typeof modelId === "string" ? modelId : null;
}

/** Provider preference is OpenRouter first, Vercel second, then trusted first-party fallbacks. */
export function providerPreferenceRank(providerId: string): number | null {
  const normalizedProviderId = normalizeProviderId(providerId);
  if (normalizedProviderId === OPENROUTER_PROVIDER_ID) {
    return 0;
  }
  if (normalizedProviderId === VERCEL_PROVIDER_ID) {
    return 1;
  }
  if (
    FIRST_PARTY_PROVIDER_IDS.includes(
      normalizedProviderId as (typeof FIRST_PARTY_PROVIDER_IDS)[number],
    )
  ) {
    return 2;
  }
  return null;
}

/** Lowercases, turns `.`, `_`, `:`, and whitespace into hyphens, drops other characters outside `a-z0-9/-`, collapses hyphen runs, and trims edge hyphens and slashes: `"Google: Gemini 2.5 Pro (Preview)"` → `"google-gemini-2-5-pro-preview"`. */
export function normalizeModelToken(value: string): string {
  const token = value
    .toLowerCase()
    .replace(/[._:\s]+/g, "-")
    .replace(/[^a-z0-9/-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return canonicalMuseToken(token);
}

/**
 * Canonicalize source effort labels while preserving actual null for unknown or unreported values.
 * `"Extra High"` → `"xhigh"`, `"Non-reasoning"` and `"No thinking"` → `"none"`, `"thinking-high"` → `"high"`, and `"null"` → `null`.
 */
export function canonicalReasoningEffort(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeModelToken(value);
  if (normalized.length === 0 || normalized === "null") {
    return null;
  }
  // A thinking or reasoning mode prefix only qualifies a known effort; budget labels such as "thinking-16k" keep it.
  const unprefixed = normalized.replace(/^(?:thinking|reasoning)-/, "");
  const label = Object.hasOwn(REASONING_EFFORT_RANK, unprefixed) ? unprefixed : normalized;
  if (label === "extra-high") return "xhigh";
  return /^non?-(?:reasoning|thinking)$/.test(label) ? "none" : label;
}

/**
 * Strip effort suffixes; GPT product qualifiers beside an effort remain part of GPT identity, while thinking or reasoning mode labels do not.
 * `"GPT-5.2 (Pro, xhigh)"` → `{ baseModel: "GPT-5.2 Pro", reasoningEffort: "xhigh" }`, while `"Claude Sonnet 4.5 (Thinking, high)"` → `{ baseModel: "Claude Sonnet 4.5", reasoningEffort: "high" }`.
 */
export function parseModelEffort(value: string): ParsedModelEffort {
  const match = BENCHMARK_EFFORT_SUFFIX_PATTERN.exec(value);
  if (match == null) {
    return { baseModel: value, reasoningEffort: null };
  }
  const baseModel = match[1]?.trim();
  if (baseModel == null || baseModel.length === 0) {
    return { baseModel: value, reasoningEffort: null };
  }
  const rawLabel = (match[2] ?? match[3] ?? "").trim();
  if (isReasoningModeLabel(rawLabel)) {
    return { baseModel, reasoningEffort: null };
  }
  const labels = rawLabel
    .split(/[,/+]+/)
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
  const reasoningEffort = qualifierReasoningEffort(labels);
  if (reasoningEffort == null) {
    return { baseModel: value, reasoningEffort: null };
  }
  const configuration = isGptModelIdentity(baseModel)
    ? labels
        .filter(
          (label) => qualifierReasoningEffort([label]) == null && !isReasoningModeLabel(label),
        )
        .join(" ")
    : "";
  return {
    baseModel: configuration.length === 0 ? baseModel : `${baseModel} ${configuration}`,
    reasoningEffort,
  };
}

/** The inverse of `parseModelEffort` for a canonical effort: a model's base name with its effort in parentheses. */
export function modelEffortLabel(baseModel: string, reasoningEffort: string | null): string {
  return reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`;
}

/** A bare thinking or reasoning label names a hybrid model's reasoning mode, which Atlas lists as that model's default variant rather than an effort. */
export function isReasoningModeLabel(label: string): boolean {
  return REASONING_MODE_LABELS.has(normalizeModelToken(label));
}

/** The strongest effort a source's qualifiers name, reading labels such as "No thinking" as none; adaptive yields to any explicit effort beside it. */
export function qualifierReasoningEffort(labels: readonly string[]): string | null {
  const efforts = labels.flatMap((label) =>
    label
      .toLowerCase()
      .replace(/\bnon?[- ](?:thinking|reasoning)\b/g, "none")
      .replace(/\b(?:effort|reasoning)\b/g, "")
      .replace(/\badaptive\s+max\b/g, "adaptive/max")
      .split("/")
      .map((token) => canonicalReasoningEffort(token.trim()))
      .filter((token): token is string => token != null && BENCHMARK_EFFORT_LABELS.has(token)),
  );
  return (
    efforts
      .filter((effort) => effort !== "adaptive" || efforts.every((other) => other === "adaptive"))
      .sort((left, right) => reasoningEffortRank(right) - reasoningEffortRank(left))[0] ?? null
  );
}

/** Read a slug's trailing effort, as in `"gpt-5-high"` → `{ baseModel: "gpt-5", reasoningEffort: "high" }`; a Qwen Max product tier is not an effort. */
export function parseSlugEffort(slug: string): ParsedModelEffort {
  const match = SLUG_EFFORT_SUFFIX_PATTERN.exec(slug);
  return match?.[1] == null || hasQwenMaxTier(normalizeModelToken(slug))
    ? { baseModel: slug, reasoningEffort: null }
    : { baseModel: match[1], reasoningEffort: canonicalReasoningEffort(match[2]) };
}

/** Index effort-labelled benchmark rows while making the highest effort the base-model default. */
export function buildBenchmarkModelMap<Row extends BenchmarkModelRow>(
  rows: readonly Row[],
): Map<string, Row> {
  const rowsByModel = new Map<string, Row>();
  const defaultRowsByBaseModel = new Map<string, Row>();
  for (const row of rows) {
    const modelKey = normalizeModelToken(row.model);
    if (modelKey.length > 0) {
      rowsByModel.set(modelKey, row);
    }
    const baseKey = normalizeModelToken(row.base_model);
    const rank = defaultConfigurationRank(row.reasoning_effort);
    if (baseKey.length === 0 || rank == null) {
      continue;
    }
    const currentDefault = defaultRowsByBaseModel.get(baseKey);
    if (currentDefault == null || rank > reasoningEffortRank(currentDefault.reasoning_effort)) {
      defaultRowsByBaseModel.set(baseKey, row);
    }
  }
  for (const [baseKey, row] of defaultRowsByBaseModel) {
    rowsByModel.set(baseKey, row);
  }
  return rowsByModel;
}

/** A row's claim to stand in for its base model's default configuration: the highest effort wins, and a reasoning-off row never qualifies. */
export function defaultConfigurationRank(reasoningEffort: string | null): number | null {
  return reasoningEffort === "none" ? null : reasoningEffortRank(reasoningEffort);
}

/** Unlabelled rows are the source's default highest-effort configuration. */
export function reasoningEffortRank(value: unknown): number {
  if (value == null || (typeof value === "string" && value.trim().length === 0)) {
    return Object.keys(REASONING_EFFORT_RANK).length;
  }
  if (typeof value !== "string") {
    return -1;
  }
  const normalized = canonicalReasoningEffort(value);
  if (normalized == null) {
    return Object.keys(REASONING_EFFORT_RANK).length;
  }
  return REASONING_EFFORT_RANK[normalized as keyof typeof REASONING_EFFORT_RANK] ?? -1;
}

export function modelSlugFromModelId(modelId: unknown): string | null {
  if (typeof modelId !== "string" || modelId.length === 0) {
    return null;
  }
  const slug = modelId.split("/").at(-1);
  return slug && slug.length > 0 ? slug : null;
}

/** Lowercases the provider and drops its leading `~`, and in the model part turns dots into hyphens and collapses hyphen runs: `"~Google/Gemini-2.5--Pro"` → `"google/gemini-2-5-pro"`. */
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

/**
 * Group reasoning-effort variants under one canonical model identity, preferring the name over the id.
 * `{ name: "Claude 4.5 Sonnet (Reasoning)" }` → `"name:claude-4-5-sonnet"` and `{ id: "openai/gpt-5.1" }` → `"openai/gpt-5-1"`.
 */
export function canonicalModelKey(model: { id?: unknown; name?: unknown }): string {
  if (typeof model.name === "string" && model.name.length > 0) {
    return `name:${normalizeModelToken(model.name.replace(MODEL_CONFIGURATION_LABEL_PATTERN, ""))}`;
  }
  if (typeof model.id === "string" && model.id.length > 0) {
    return normalizeProviderModelId(model.id);
  }
  return "name:";
}

/** The canonical model key and canonical effort joined by a NUL, which no name or effort contains: `{ id: "openai/gpt-5.1", reasoning_effort: "Extra High" }` → `"openai/gpt-5-1\u0000xhigh"`. */
export function canonicalVariantKey(model: {
  id?: unknown;
  name?: unknown;
  reasoning_effort?: unknown;
}): string {
  return `${canonicalModelKey(model)}\u0000${canonicalReasoningEffort(model.reasoning_effort) ?? ""}`;
}
