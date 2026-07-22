/** Model-row aggregation merges route aliases, evidence fields, and reasoning variants. */

import { claudeIdentityKey, parseClaudeIdentity } from "../../identity/claude";
import {
	canonicalReasoningEffort,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
	PRIMARY_PROVIDER_ID,
} from "../../identity/normalization";
import {
	publicOpenRouterModelId,
	reasoningEffortSelectionPriority,
	stripCatalogAliasSuffixes,
} from "../../identity/openrouter";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";

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
	const artificialAnalysisIdentityBoost =
		typeof row.artificial_analysis_id === "string" ? 4_000_000 : 0;
	const openRouterBoost =
		row.provider_id === PRIMARY_PROVIDER_ID ? 1_000_000 : 0;
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
		openRouterBoost +
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

function primaryRouteIdForGroup(group: readonly JsonObject[]): string | null {
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

function catalogRowRouteId(row: JsonObject): string | null {
	const openRouterId = row.openrouter_id;
	if (
		typeof openRouterId === "string" &&
		openRouterId.length > 0 &&
		openRouterId.includes("/")
	) {
		return openRouterId;
	}
	if (typeof row.id === "string" && row.id.length > 0) {
		return row.id;
	}
	return typeof openRouterId === "string" && openRouterId.length > 0
		? openRouterId
		: null;
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
		primaryRouteIdForGroup(group) ??
		publicOpenRouterModelId(catalogRowRouteId(merged));
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
