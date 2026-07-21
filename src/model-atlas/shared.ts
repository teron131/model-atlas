/** Shared normalization defines provider preference and model-token identity before matching and scoring. */
import { asFiniteNumber, asRecord, type JsonObject } from "./utils";

export { asFiniteNumber, asRecord, type JsonObject };

export const PRIMARY_PROVIDER_ID = "openrouter" as const;
const SECONDARY_PROVIDER_ID = "vercel" as const;
const TERTIARY_PROVIDER_IDS = ["openai", "google", "anthropic"] as const;
export const FALLBACK_PROVIDER_IDS: ReadonlySet<string> = new Set([
	SECONDARY_PROVIDER_ID,
	...TERTIARY_PROVIDER_IDS,
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
const MODEL_CONFIGURATION_LABEL_PATTERN =
	/\s+\((?:fast|free|online|reasoning|thinking)\)\s*$/i;
const BENCHMARK_EFFORT_SUFFIX_PATTERN =
	/^(.*?)(?:\s+\(([^()]*)\)|\s+-\s+([^()]+))\s*$/i;
const BENCHMARK_EFFORT_LABELS = new Set([
	"xhigh",
	"extra-high",
	"max",
	"high",
	"medium",
	"low",
	"none",
	"adaptive",
]);

type BenchmarkModelEffort = {
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
export function canonicalProviderModelId(
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

/** Canonicalize source effort labels while preserving actual null for unknown or unreported values. */
export function canonicalReasoningEffort(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = normalizeModelToken(value);
	if (normalized.length === 0 || normalized === "null") {
		return null;
	}
	return normalized === "non-reasoning" ? "none" : normalized;
}

/** Strip only recognized effort suffixes so configuration names such as Thinking remain distinct models. */
export function benchmarkModelEffort(value: string): BenchmarkModelEffort {
	const match = BENCHMARK_EFFORT_SUFFIX_PATTERN.exec(value);
	if (match == null) {
		return { baseModel: value, reasoningEffort: null };
	}
	const baseModel = match[1]?.trim();
	const rawLabel = (match[2] ?? match[3] ?? "").toLowerCase().trim();
	if (rawLabel === "default") {
		return baseModel == null || baseModel.length === 0
			? { baseModel: value, reasoningEffort: null }
			: { baseModel, reasoningEffort: null };
	}
	const labelTokens = rawLabel
		.replace(/reasoning/g, "")
		.split(/[,/]+/)
		.map((label) => canonicalReasoningEffort(label.trim()))
		.filter(
			(label): label is string =>
				label != null && BENCHMARK_EFFORT_LABELS.has(label),
		);
	const reasoningEffort =
		labelTokens.sort(
			(left, right) => reasoningEffortRank(right) - reasoningEffortRank(left),
		)[0] ?? null;
	return baseModel == null || baseModel.length === 0 || reasoningEffort == null
		? { baseModel: value, reasoningEffort: null }
		: { baseModel, reasoningEffort };
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
		if (baseKey.length === 0) {
			continue;
		}
		const currentDefault = defaultRowsByBaseModel.get(baseKey);
		if (
			currentDefault == null ||
			reasoningEffortRank(row.reasoning_effort) >
				reasoningEffortRank(currentDefault.reasoning_effort)
		) {
			defaultRowsByBaseModel.set(baseKey, row);
		}
	}
	for (const [baseKey, row] of defaultRowsByBaseModel) {
		rowsByModel.set(baseKey, row);
	}
	return rowsByModel;
}

/** Unlabelled rows are the source's default highest-effort configuration. */
export function reasoningEffortRank(value: unknown): number {
	if (
		value == null ||
		(typeof value === "string" && value.trim().length === 0)
	) {
		return Object.keys(REASONING_EFFORT_RANK).length;
	}
	if (typeof value !== "string") {
		return -1;
	}
	const normalized = canonicalReasoningEffort(value);
	if (normalized == null) {
		return Object.keys(REASONING_EFFORT_RANK).length;
	}
	return (
		REASONING_EFFORT_RANK[normalized as keyof typeof REASONING_EFFORT_RANK] ??
		-1
	);
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

/** Group reasoning-effort variants under one canonical model identity. */
export function canonicalModelKey(model: {
	id?: unknown;
	name?: unknown;
}): string {
	if (typeof model.name === "string" && model.name.length > 0) {
		return `name:${normalizeModelToken(
			model.name.replace(MODEL_CONFIGURATION_LABEL_PATTERN, ""),
		)}`;
	}
	if (typeof model.id === "string" && model.id.length > 0) {
		return normalizeProviderModelId(model.id);
	}
	return "name:";
}
