/** Model aggregation and OpenRouter enrichment own effort collapse, route stats, and free-route cost continuity. */

import { claudeIdentityKey, parseClaudeIdentity } from "../claude-identity";
import {
	isOpenRouterFreeRouteId,
	nonFreeOpenRouterModelId,
	publicOpenRouterModelId,
	reasoningEffortSelectionPriority,
	stripCatalogAliasSuffixes,
} from "../openrouter-routes";
import {
	getOpenRouterRawScrapedStats,
	type OpenRouterRawScrapedPayload,
	processOpenRouterModelStats,
} from "../scrapers/openrouter";
import {
	asFiniteNumber,
	asRecord,
	canonicalReasoningEffort,
	type JsonObject,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
	PRIMARY_PROVIDER_ID,
} from "../shared";

import { deriveSpeedOutputTokenAnchors } from "./scores";
import type {
	LlmStatsEnrichmentResult,
	OpenRouterConfig,
	ScoringConfig,
} from "./types";

const CATALOG_MERGED_OBJECT_FIELDS = ["cost", "limit", "modalities"] as const;
const ALIAS_MERGED_OBJECT_FIELDS = [
	...CATALOG_MERGED_OBJECT_FIELDS,
	"evaluations",
	"intelligence",
	"intelligence_index_cost",
	"scoring_sources",
	"component_scores",
] as const;
type MergedObjectField = (typeof ALIAS_MERGED_OBJECT_FIELDS)[number];

type VariantAggregation = "expand" | "collapse";

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

function normalizeOpenRouterPricing(pricing: unknown): JsonObject {
	const parsed = asRecord(pricing);
	return {
		weighted_input: asFiniteNumber(parsed.weighted_input_price_per_1m),
		weighted_output: asFiniteNumber(parsed.weighted_output_price_per_1m),
	};
}

function hasIntelligenceCost(row: JsonObject): boolean {
	const intelligenceIndexCost = asRecord(row.intelligence_index_cost);
	return asFiniteNumber(intelligenceIndexCost.total_cost) != null;
}

function hasComponentScoreSignal(row: JsonObject): boolean {
	const componentScores = asRecord(row.component_scores);
	return (
		asFiniteNumber(componentScores.intelligence_score) != null ||
		asFiniteNumber(componentScores.agentic_score) != null ||
		asFiniteNumber(componentScores.speed_score) != null
	);
}

function hasBenchmarkSignal(row: JsonObject): boolean {
	const intelligence = asRecord(row.intelligence);
	const evaluations = asRecord(row.evaluations);
	return [...Object.values(intelligence), ...Object.values(evaluations)].some(
		(value) => asFiniteNumber(value) != null,
	);
}

/** Duplicate resolution favors benchmark-bearing rows first, then OpenRouter-backed rows with usable public scoring data. */
function rowPriority(row: JsonObject, normalizedId: string): number {
	const providerId = row.provider_id;
	const artificialAnalysisIdentityBoost =
		typeof row.artificial_analysis_id === "string" ? 4_000_000 : 0;
	const openrouterBoost = providerId === PRIMARY_PROVIDER_ID ? 1_000_000 : 0;
	const benchmarkBoost = hasBenchmarkSignal(row) ? 2_000_000 : 0;
	const intelligenceCostBoost = hasIntelligenceCost(row) ? 1_000 : 0;
	const componentScoreBoost = hasComponentScoreSignal(row) ? 10 : 0;
	const artificialAnalysisSlug =
		typeof row.artificial_analysis_slug === "string"
			? row.artificial_analysis_slug
			: null;
	const canonicalSlug = canonicalSlugFromDedupeKey(normalizedId);
	const reasoningEffortBoost =
		reasoningEffortSelectionPriority(
			row.reasoning_effort,
			artificialAnalysisSlug,
			canonicalSlug,
		) * 10_000_000;
	return (
		reasoningEffortBoost +
		artificialAnalysisIdentityBoost +
		benchmarkBoost +
		openrouterBoost +
		intelligenceCostBoost +
		componentScoreBoost
	);
}

function canonicalSlugFromDedupeKey(dedupeKey: string): string | null {
	return dedupeKey.startsWith("artificial_analysis:")
		? dedupeKey.slice("artificial_analysis:".length)
		: modelSlugFromModelId(dedupeKey);
}

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

function versionKeyForRow(row: JsonObject): string | null {
	const artificialAnalysisSlug =
		typeof row.artificial_analysis_slug === "string"
			? row.artificial_analysis_slug
			: null;
	const id = typeof row.id === "string" ? row.id : null;
	const slug =
		artificialAnalysisSlug ?? (id == null ? null : modelSlugFromModelId(id));
	if (slug == null) {
		return null;
	}
	const claudeIdentity = parseClaudeIdentity(slug);
	return claudeIdentity == null
		? stripCatalogAliasSuffixes(normalizeModelToken(slug))
		: claudeIdentityKey(claudeIdentity);
}

/** Benchmark-version keys keep Artificial Analysis rows attached while provider suffixes collapse into one public route. */
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
		return `artificial_analysis:${versionKey}`;
	}
	return dedupeKeyForRowId(id);
}

function mergeObjectField(
	target: JsonObject,
	field: MergedObjectField,
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

function mergeDuplicateRows(
	winner: JsonObject,
	group: readonly JsonObject[],
	objectFields: readonly MergedObjectField[],
): JsonObject {
	const merged: JsonObject = { ...winner };
	for (const field of objectFields) {
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

function mergeCollapsedVariantRows(
	winner: JsonObject,
	group: readonly JsonObject[],
): JsonObject {
	const aggregate = mergeDuplicateRows(
		winner,
		group,
		CATALOG_MERGED_OBJECT_FIELDS,
	);
	delete aggregate.reasoning_effort;
	return aggregate;
}

/** Preserve one Artificial Analysis observation per explicit effort while sharing route-owned catalog fields. */
function mergeReasoningVariants(
	group: readonly JsonObject[],
	normalizedId: string,
): JsonObject[] {
	const rowsByEffort = new Map<string | null, JsonObject[]>();
	for (const row of group) {
		const effort = canonicalReasoningEffort(row.reasoning_effort);
		const effortRows = rowsByEffort.get(effort) ?? [];
		effortRows.push(row);
		rowsByEffort.set(effort, effortRows);
	}
	return [...rowsByEffort].map(([effort, effortRows]) => {
		const winner = [...effortRows].sort(
			(left, right) =>
				rowPriority(right, normalizedId) - rowPriority(left, normalizedId),
		)[0] as JsonObject;
		return {
			...mergeDuplicateRows(winner, group, CATALOG_MERGED_OBJECT_FIELDS),
			reasoning_effort: effort,
		};
	});
}

function hasSpeedData(speed: JsonObject): boolean {
	return (
		asFiniteNumber(speed.throughput_tokens_per_second_median) != null ||
		asFiniteNumber(speed.latency_seconds_median) != null ||
		asFiniteNumber(speed.e2e_latency_seconds_median) != null
	);
}

function hasPricingData(pricing: JsonObject): boolean {
	return (
		(asFiniteNumber(pricing.weighted_input) ?? 0) > 0 ||
		(asFiniteNumber(pricing.weighted_output) ?? 0) > 0
	);
}

function setMapValuePreferPopulated(
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

function getMapValueByExactOrNormalizedId(
	map: Map<string, JsonObject>,
	modelId: string,
): JsonObject | null {
	return map.get(modelId) ?? map.get(normalizeProviderModelId(modelId)) ?? null;
}

function setMapValueForExactAndNormalizedId(
	map: Map<string, JsonObject>,
	modelId: string,
	value: JsonObject,
	hasData: (value: JsonObject) => boolean,
): void {
	setMapValuePreferPopulated(map, modelId, value, hasData);
	const normalizedId = normalizeProviderModelId(modelId);
	if (normalizedId !== modelId) {
		setMapValuePreferPopulated(map, normalizedId, value, hasData);
	}
}

function setMapValueForOpenRouterRoute(
	map: Map<string, JsonObject>,
	modelId: string,
	value: JsonObject,
	hasData: (value: JsonObject) => boolean,
): void {
	setMapValueForExactAndNormalizedId(map, modelId, value, hasData);
	const publicId = publicOpenRouterModelId(modelId);
	if (publicId != null && publicId !== modelId) {
		setMapValueForExactAndNormalizedId(map, publicId, value, hasData);
	}
}

function rowModelId(row: Record<string, unknown>): string | null {
	const id = asRecord(row).id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

function rowOpenRouterModelId(row: Record<string, unknown>): string | null {
	const rowRecord = asRecord(row);
	const openRouterId = rowRecord.openrouter_id;
	if (
		typeof openRouterId === "string" &&
		openRouterId.length > 0 &&
		openRouterId.includes("/")
	) {
		return openRouterId;
	}
	return (
		rowModelId(row) ??
		(typeof openRouterId === "string" && openRouterId.length > 0
			? openRouterId
			: null)
	);
}

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
				hasSpeedData,
			);
		}
		const pricing = getMapValueByExactOrNormalizedId(pricingById, openRouterId);
		if (pricing != null) {
			setMapValueForExactAndNormalizedId(
				pricingById,
				publicId,
				pricing,
				hasPricingData,
			);
		}
	}
}

function aggregateRows(
	rows: Record<string, unknown>[],
	variantAggregation: VariantAggregation,
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
		if (normalizedId.startsWith("artificial_analysis:")) {
			dedupedRows.push(
				...(variantAggregation === "expand"
					? mergeReasoningVariants(group, normalizedId)
					: [mergeCollapsedVariantRows(winner, group)]),
			);
			continue;
		}
		dedupedRows.push(
			mergeDuplicateRows(winner, group, ALIAS_MERGED_OBJECT_FIELDS),
		);
	}

	return [...passthrough, ...dedupedRows];
}

/** Collapse route aliases while preserving Artificial Analysis reasoning variants as distinct model rows. */
export function aggregateExpandedModelRows(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return aggregateRows(rows, "expand");
}

/** Collapse route aliases and reasoning variants into one representative row per model. */
export function aggregateCollapsedModelRows(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return aggregateRows(rows, "collapse");
}

function hasPositiveCostFields(cost: JsonObject): boolean {
	const input = asFiniteNumber(cost.input);
	const output = asFiniteNumber(cost.output);
	return input != null && input > 0 && output != null && output > 0;
}

/** Free OpenRouter routes inherit the paid route's base costs so price comparisons keep a realistic fallback. */
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
			setMapValueForOpenRouterRoute(speedById, model.id, speed, hasSpeedData);
			setMapValueForOpenRouterRoute(
				pricingById,
				model.id,
				pricing,
				hasPricingData,
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

/** Enrich matched rows with route-level OpenRouter speed and pricing without making the source snapshot depend on live route stats. */
export async function enrichModelRowsWithOpenRouter(
	rows: Record<string, unknown>[],
	openrouterConfig: OpenRouterConfig,
	scoringConfig: ScoringConfig,
	cachedOpenRouterRawPayload?: OpenRouterRawScrapedPayload | null,
): Promise<LlmStatsEnrichmentResult> {
	const costBackfilledRows = backfillFreeModelCosts(rows);
	const {
		speedById: openRouterSpeedById,
		pricingById: openRouterPricingById,
		rawPayload: openRouterRawPayload,
	} = await buildOpenRouterDataById(
		costBackfilledRows,
		openrouterConfig.speedConcurrency,
		cachedOpenRouterRawPayload,
	);
	const speedOutputTokenAnchors = deriveSpeedOutputTokenAnchors(
		openRouterSpeedById,
		scoringConfig,
	);
	return {
		rows: costBackfilledRows,
		openRouterSpeedById,
		openRouterPricingById,
		speedOutputTokenAnchors,
		openRouterRawPayload,
	};
}
