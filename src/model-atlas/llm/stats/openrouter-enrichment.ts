/** OpenRouter enrichment helpers for Model Atlas selection. */

import {
	getOpenRouterRawScrapedStats,
	type OpenRouterRawScrapedPayload,
	processOpenRouterModelStats,
} from "../scrapers/openrouter";
import {
	asFiniteNumber,
	asRecord,
	type JsonObject,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
	PRIMARY_PROVIDER_ID,
} from "../shared";

import {
	isOpenRouterFreeRouteId,
	nonFreeOpenRouterModelId,
	publicOpenRouterModelId,
	reasoningEffortPriority,
	stripCatalogAliasSuffixes,
} from "./model-aliases";
import { deriveSpeedOutputTokenAnchors } from "./scores";
import type { EnrichedRows, OpenRouterConfig, ScoringConfig } from "./types";

/** OpenRouter enrichment for Model Atlas: dedupe rows, backfill free costs, and fetch speed/pricing enrichments. */
const MERGED_OBJECT_FIELDS = [
	"cost",
	"evaluations",
	"intelligence",
	"intelligence_index_cost",
	"limit",
	"modalities",
	"scoring_sources",
	"scores",
] as const;

/** Normalize OpenRouter speed values. */
function normalizeOpenRouterSpeed(performance: unknown): JsonObject {
	const parsed = asRecord(performance);
	return {
		throughput_tokens_per_second_median: asFiniteNumber(
			parsed.throughput_tokens_per_second_median,
		),
		latency_seconds_median: asFiniteNumber(parsed.latency_seconds_median),
		e2e_latency_seconds_median: asFiniteNumber(
			parsed.e2e_latency_seconds_median,
		),
	};
}

/** Normalize OpenRouter pricing values. */
function normalizeOpenRouterPricing(pricing: unknown): JsonObject {
	const parsed = asRecord(pricing);
	return {
		weighted_input: asFiniteNumber(parsed.weighted_input_price_per_1m),
		weighted_output: asFiniteNumber(parsed.weighted_output_price_per_1m),
	};
}

/** Return whether a row carries usable Artificial Analysis cost telemetry. */
function hasIntelligenceCost(row: JsonObject): boolean {
	const intelligenceIndexCost = asRecord(row.intelligence_index_cost);
	return asFiniteNumber(intelligenceIndexCost.total_cost) != null;
}

/** Return whether a row already has any computed score signal. */
function hasScoreSignal(row: JsonObject): boolean {
	const scores = asRecord(row.scores);
	return (
		asFiniteNumber(scores.intelligence_score) != null ||
		asFiniteNumber(scores.agentic_score) != null ||
		asFiniteNumber(scores.speed_score) != null ||
		asFiniteNumber(scores.value_score) != null
	);
}

/** Return whether a row carries benchmark telemetry that should win display identity. */
function hasBenchmarkSignal(row: JsonObject): boolean {
	const intelligence = asRecord(row.intelligence);
	const evaluations = asRecord(row.evaluations);
	return [...Object.values(intelligence), ...Object.values(evaluations)].some(
		(value) => asFiniteNumber(value) != null,
	);
}

/** Score duplicate candidate rows before choosing the canonical row. */
function rowPriority(row: JsonObject, normalizedId: string): number {
	const providerId = row.provider_id;
	const aaIdentityBoost = typeof row.aa_id === "string" ? 4_000_000 : 0;
	const openrouterBoost = providerId === PRIMARY_PROVIDER_ID ? 1_000_000 : 0;
	const benchmarkBoost = hasBenchmarkSignal(row) ? 2_000_000 : 0;
	const intelligenceCostBoost = hasIntelligenceCost(row) ? 1_000 : 0;
	const scoreSignalBoost = hasScoreSignal(row) ? 10 : 0;
	const aaSlug = typeof row.aa_slug === "string" ? row.aa_slug : null;
	const canonicalSlug = canonicalSlugFromDedupeKey(normalizedId);
	const reasoningEffortBoost =
		reasoningEffortPriority(aaSlug, canonicalSlug) * 10_000_000;
	return (
		reasoningEffortBoost +
		aaIdentityBoost +
		benchmarkBoost +
		openrouterBoost +
		intelligenceCostBoost +
		scoreSignalBoost
	);
}

/** Extracts the canonical model slug stored in an OpenRouter dedupe key. */
function canonicalSlugFromDedupeKey(dedupeKey: string): string | null {
	return dedupeKey.startsWith("aa:")
		? dedupeKey.slice("aa:".length)
		: modelSlugFromModelId(dedupeKey);
}

/** Builds a stable dedupe key from an OpenRouter row ID. */
function dedupeKeyForRowId(modelId: string): string {
	const normalizedId = normalizeProviderModelId(modelId);
	if (!normalizedId.includes("/")) {
		return normalizedId;
	}
	const slashIndex = normalizedId.indexOf("/");
	const provider = normalizedId.slice(0, slashIndex);
	const slug = stripCatalogAliasSuffixes(normalizedId.slice(slashIndex + 1));
	return `${provider}/${slug}`;
}

/** Groups OpenRouter rows that differ only by provider version label. */
function versionKeyForRow(row: JsonObject): string | null {
	const aaSlug = typeof row.aa_slug === "string" ? row.aa_slug : null;
	const id = typeof row.id === "string" ? row.id : null;
	const slug = aaSlug ?? (id == null ? null : modelSlugFromModelId(id));
	return slug == null
		? null
		: stripCatalogAliasSuffixes(normalizeModelToken(slug));
}

/** Builds the merge key for duplicate OpenRouter rows. */
function dedupeKeyForRow(
	row: JsonObject,
	benchmarkVersionKeys: ReadonlySet<string>,
): string | null {
	const id = typeof row.id === "string" ? row.id : null;
	if (id == null) {
		return null;
	}
	const versionKey = versionKeyForRow(row);
	if (versionKey != null && benchmarkVersionKeys.has(versionKey)) {
		return `aa:${versionKey}`;
	}
	return dedupeKeyForRowId(id);
}

/** Merges object field for OpenRouter enrichment. */
function mergeObjectField(
	target: JsonObject,
	field: (typeof MERGED_OBJECT_FIELDS)[number],
	candidates: readonly JsonObject[],
): void {
	const merged: JsonObject = { ...asRecord(target[field]) };
	for (const candidate of candidates) {
		const candidateValue = asRecord(candidate[field]);
		for (const [key, value] of Object.entries(candidateValue)) {
			if (merged[key] == null && value != null) {
				merged[key] = value;
			}
		}
	}
	if (Object.keys(merged).length > 0) {
		target[field] = merged;
	}
}

/** Chooses the paid public OpenRouter ID for a merged model group. */
function primaryOpenRouterIdForGroup(
	group: readonly JsonObject[],
): string | null {
	for (const candidate of group) {
		if (candidate.provider_id !== PRIMARY_PROVIDER_ID) {
			continue;
		}
		const openRouterId = candidate.openrouter_id ?? candidate.id;
		if (typeof openRouterId === "string" && openRouterId.length > 0) {
			return publicOpenRouterModelId(openRouterId);
		}
	}
	return null;
}

/** Merges duplicate rows for OpenRouter enrichment. */
function mergeDuplicateRows(
	winner: JsonObject,
	group: readonly JsonObject[],
): JsonObject {
	const merged: JsonObject = { ...winner };
	for (const field of MERGED_OBJECT_FIELDS) {
		mergeObjectField(merged, field, group);
	}
	const openRouterId =
		primaryOpenRouterIdForGroup(group) ??
		publicOpenRouterModelId(rowOpenRouterModelId(merged));
	if (openRouterId != null) {
		merged.id = openRouterId;
		merged.openrouter_id = openRouterId;
	}
	return merged;
}

/** Checks whether an OpenRouter speed row has usable latency or throughput. */
function speedHasData(speed: JsonObject): boolean {
	return (
		asFiniteNumber(speed.throughput_tokens_per_second_median) != null ||
		asFiniteNumber(speed.latency_seconds_median) != null ||
		asFiniteNumber(speed.e2e_latency_seconds_median) != null
	);
}

/** Checks whether an OpenRouter pricing row has non-zero token prices. */
function pricingHasData(pricing: JsonObject): boolean {
	return (
		(asFiniteNumber(pricing.weighted_input) ?? 0) > 0 ||
		(asFiniteNumber(pricing.weighted_output) ?? 0) > 0
	);
}

/** Stores map value prefer data for OpenRouter enrichment. */
function setMapValuePreferData(
	map: Map<string, JsonObject>,
	key: string,
	value: JsonObject,
	hasData: (value: JsonObject) => boolean,
): void {
	const existing = map.get(key);
	if (existing == null || (!hasData(existing) && hasData(value))) {
		map.set(key, value);
	}
}

/** Reads map entries through exact and normalized model IDs. */
function getMapValueByExactOrNormalizedId(
	map: Map<string, JsonObject>,
	modelId: string,
): JsonObject | null {
	return map.get(modelId) ?? map.get(normalizeProviderModelId(modelId)) ?? null;
}

/** Stores map value for exact and normalized ID for OpenRouter enrichment. */
function setMapValueForExactAndNormalizedId(
	map: Map<string, JsonObject>,
	modelId: string,
	value: JsonObject,
	hasData: (value: JsonObject) => boolean,
): void {
	setMapValuePreferData(map, modelId, value, hasData);
	const normalizedId = normalizeProviderModelId(modelId);
	if (normalizedId !== modelId) {
		setMapValuePreferData(map, normalizedId, value, hasData);
	}
}

/** Reads the public model ID from an OpenRouter enrichment row. */
function rowModelId(row: Record<string, unknown>): string | null {
	const id = asRecord(row).id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

/** Reads the original OpenRouter route ID from an enrichment row. */
function rowOpenRouterModelId(row: Record<string, unknown>): string | null {
	const rowRecord = asRecord(row);
	const openRouterId = rowRecord.openrouter_id;
	if (typeof openRouterId === "string" && openRouterId.length > 0) {
		return openRouterId;
	}
	return rowModelId(row);
}

/** Copies OpenRouter enrichment from route aliases onto public rows. */
function aliasOpenRouterDataToPublicRows(
	rows: Record<string, unknown>[],
	speedById: Map<string, JsonObject>,
	pricingById: Map<string, JsonObject>,
): void {
	for (const row of rows) {
		const publicId = rowModelId(row);
		const openRouterId = rowOpenRouterModelId(row);
		if (publicId == null || openRouterId == null || publicId === openRouterId) {
			continue;
		}
		const speed = getMapValueByExactOrNormalizedId(speedById, openRouterId);
		if (speed != null) {
			setMapValueForExactAndNormalizedId(
				speedById,
				publicId,
				speed,
				speedHasData,
			);
		}
		const pricing = getMapValueByExactOrNormalizedId(pricingById, openRouterId);
		if (pricing != null) {
			setMapValueForExactAndNormalizedId(
				pricingById,
				publicId,
				pricing,
				pricingHasData,
			);
		}
	}
}

/** Deduplicate OpenRouter enrichment Model Atlas selection rows while preferring OpenRouter data. */
function dedupeRowsPreferOpenRouter(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	const groupedByNormalizedId = new Map<string, JsonObject[]>();
	const passthrough: Record<string, unknown>[] = [];
	const benchmarkVersionKeys = new Set(
		rows
			.map(asRecord)
			.filter(hasBenchmarkSignal)
			.map(versionKeyForRow)
			.filter((key): key is string => key != null),
	);

	for (const row of rows) {
		const rowRecord = asRecord(row);
		const key = dedupeKeyForRow(rowRecord, benchmarkVersionKeys);
		if (key == null) {
			passthrough.push(row);
			continue;
		}
		const group = groupedByNormalizedId.get(key) ?? [];
		group.push(rowRecord);
		groupedByNormalizedId.set(key, group);
	}

	const dedupedRows: JsonObject[] = [];
	for (const [normalizedId, group] of groupedByNormalizedId.entries()) {
		const winner = [...group].sort(
			(left, right) =>
				rowPriority(right, normalizedId) - rowPriority(left, normalizedId),
		)[0] as JsonObject;
		dedupedRows.push(mergeDuplicateRows(winner, group));
	}

	return [...passthrough, ...dedupedRows];
}

/** Return whether both input and output costs are positive. */
function hasPositiveCostFields(cost: JsonObject): boolean {
	const input = asFiniteNumber(cost.input);
	const output = asFiniteNumber(cost.output);
	return input != null && input > 0 && output != null && output > 0;
}

/** Backfill missing free-model costs for OpenRouter enrichment Model Atlas selection. */
function backfillFreeModelCosts(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	const nonFreeCostById = new Map<string, JsonObject>();
	for (const row of rows) {
		const rowRecord = asRecord(row);
		const id = typeof rowRecord.id === "string" ? rowRecord.id : null;
		if (!id || isOpenRouterFreeRouteId(id)) {
			continue;
		}
		const cost = asRecord(rowRecord.cost);
		if (hasPositiveCostFields(cost)) {
			nonFreeCostById.set(id, cost);
		}
	}

	return rows.map((row) => {
		const rowRecord = asRecord(row);
		const id = typeof rowRecord.id === "string" ? rowRecord.id : null;
		if (!id) {
			return row;
		}
		const baseId = nonFreeOpenRouterModelId(id);
		if (!baseId) {
			return row;
		}
		const baseCost = nonFreeCostById.get(baseId);
		if (!baseCost) {
			return row;
		}
		return {
			...rowRecord,
			cost: {
				...baseCost,
			},
		};
	});
}

/** Fetch normalized OpenRouter speed and pricing maps keyed by model id. */
async function buildOpenRouterDataById(
	rows: Record<string, unknown>[],
	speedConcurrency: number,
	cachedRawPayload?: OpenRouterRawScrapedPayload | null,
): Promise<{
	speedById: Map<string, JsonObject>;
	pricingById: Map<string, JsonObject>;
	rawPayload: Awaited<ReturnType<typeof getOpenRouterRawScrapedStats>> | null;
}> {
	const modelIds = [
		...new Set(
			rows
				.map(rowOpenRouterModelId)
				.filter((id): id is string => id != null && id.length > 0),
		),
	];
	if (modelIds.length === 0) {
		return {
			speedById: new Map(),
			pricingById: new Map(),
			rawPayload: null,
		};
	}

	try {
		const rawPayload =
			cachedRawPayload === undefined
				? await getOpenRouterRawScrapedStats({
						modelIds,
						concurrency: speedConcurrency,
					})
				: cachedRawPayload;
		if (rawPayload == null) {
			return {
				speedById: new Map(),
				pricingById: new Map(),
				rawPayload: null,
			};
		}
		const models = rawPayload.models.map((model) =>
			processOpenRouterModelStats(model.id, model.performance, model.pricing),
		);
		const speedById = new Map<string, JsonObject>();
		const pricingById = new Map<string, JsonObject>();
		for (const model of models) {
			const speed = normalizeOpenRouterSpeed(model.performance);
			const pricing = normalizeOpenRouterPricing(model.pricing);
			setMapValueForExactAndNormalizedId(
				speedById,
				model.id,
				speed,
				speedHasData,
			);
			setMapValueForExactAndNormalizedId(
				pricingById,
				model.id,
				pricing,
				pricingHasData,
			);
		}
		aliasOpenRouterDataToPublicRows(rows, speedById, pricingById);
		return { speedById, pricingById, rawPayload };
	} catch {
		return {
			speedById: new Map(),
			pricingById: new Map(),
			rawPayload: null,
		};
	}
}

/** Fetch OpenRouter enrichments for the matched rows and return the late-bound speed/pricing maps. */
export async function enrichModelRowsWithOpenRouter(
	matchedRows: Record<string, unknown>[],
	openrouterConfig: OpenRouterConfig,
	scoringConfig: ScoringConfig,
	cachedOpenRouterRawPayload?: OpenRouterRawScrapedPayload | null,
): Promise<EnrichedRows> {
	const dedupedRows = dedupeRowsPreferOpenRouter(matchedRows);
	const rows = backfillFreeModelCosts(dedupedRows);
	const {
		speedById: openRouterSpeedById,
		pricingById: openRouterPricingById,
		rawPayload: openRouterRawPayload,
	} = await buildOpenRouterDataById(
		rows,
		openrouterConfig.speedConcurrency,
		cachedOpenRouterRawPayload,
	);
	const speedOutputTokenAnchors = deriveSpeedOutputTokenAnchors(
		openRouterSpeedById,
		scoringConfig,
	);
	return {
		rows,
		openRouterSpeedById,
		openRouterPricingById,
		speedOutputTokenAnchors,
		openRouterRawPayload,
	};
}
