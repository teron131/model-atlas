import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../scrapers/agents-last-exam";
import { findAutomationBenchScore } from "../scrapers/automation-bench";
import { findBlueprintBenchScore } from "../scrapers/blueprint-bench";
import { findBrowseCompScore } from "../scrapers/browsecomp";
import { findCursorBenchScore } from "../scrapers/cursorbench";
import { findDeepSWEModelScore } from "../scrapers/deep-swe";
import type { ModelsDevFlatModel } from "../scrapers/models-dev";
import { findTerminalBenchMedianAccuracy } from "../scrapers/terminal-bench";
import { findToolathlonScore } from "../scrapers/toolathlon";
import {
	asRecord,
	modelSlugFromModelId,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../shared";
import type { LlmStatsSourceData } from "../stats/types";

function canonicalModelId(
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

function normalizedRowId(row: Record<string, unknown>): string | null {
	const id = typeof row.id === "string" ? row.id : null;
	return id == null ? null : normalizeProviderModelId(id);
}

function normalizedRowProvider(row: Record<string, unknown>): string | null {
	const normalizedId = normalizedRowId(row);
	const provider =
		normalizedId?.split("/")[0] ??
		(typeof row.provider_id === "string" ? row.provider_id : null);
	return provider == null ? null : normalizeProviderId(provider);
}

function normalizedRowFamily(row: Record<string, unknown>): string | null {
	if (typeof row.family !== "string" || row.family.length === 0) {
		return null;
	}
	return row.family
		.toLowerCase()
		.replace(/[._:\s]+/g, "-")
		.replace(/-+/g, "-");
}

function catalogFamilyKey(row: Record<string, unknown>): string | null {
	const provider = normalizedRowProvider(row);
	const family = normalizedRowFamily(row);
	return provider == null || family == null ? null : `${provider}/${family}`;
}

function rowText(
	row: Record<string, unknown>,
	keys: readonly string[],
): string {
	return keys
		.map((key) => row[key])
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
}

function rowHasExplicitTextOutput(row: Record<string, unknown>): boolean {
	const modalities = asRecord(row.modalities);
	return Array.isArray(modalities.output) && modalities.output.includes("text");
}

function hasObviousImageModelLabel(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id", "name", "family"]).includes(
		"image",
	);
}

function isTextLlmCatalogRow(row: Record<string, unknown>): boolean {
	return rowHasExplicitTextOutput(row) && !hasObviousImageModelLabel(row);
}

function isLatestAliasRow(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id"]).includes("latest");
}

function isDatedAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-\d{8}$/.test(normalizedId);
}

function isFastAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-fast$/.test(normalizedId);
}

function catalogAliasPriority(row: Record<string, unknown>): number {
	if (isLatestAliasRow(row)) {
		return 3;
	}
	if (isFastAliasRow(row)) {
		return 2;
	}
	if (isDatedAliasRow(row)) {
		return 1;
	}
	return 0;
}

/** Keep processed DB stages scoped to text-output LLM rows and exclude obvious image models. */
export function filterDatabaseTextLlmRows(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return rows.filter(isTextLlmCatalogRow);
}

function normalizedCatalogIds(row: Record<string, unknown>): string[] {
	return [row.id, row.openrouter_id]
		.filter((id): id is string => typeof id === "string" && id.length > 0)
		.map(normalizeProviderModelId);
}

function modelsDevCatalogRow(
	modelsDevModel: ModelsDevFlatModel,
	sourceData: LlmStatsSourceData,
): Record<string, unknown> | null {
	const modelFields = asRecord(modelsDevModel.model);
	const canonicalId = canonicalModelId(
		modelsDevModel.model.id ?? modelsDevModel.model_id,
		modelsDevModel.provider_id,
		modelsDevModel.model_id,
	);
	if (canonicalId == null) {
		return null;
	}
	const {
		id: _matchedId,
		name: _matchedName,
		family: matchedFamily,
		model_id: _matchedModelId,
		slug: _matchedSlug,
		...modelMetadata
	} = modelFields;
	const modelNameCandidates = [
		modelsDevModel.model.name,
		modelsDevModel.model_id,
		modelsDevModel.model.id,
		canonicalId,
		modelSlugFromModelId(canonicalId),
	];
	const evaluations: Record<string, unknown> = {};
	const deepSWEScore = findDeepSWEModelScore(
		modelNameCandidates,
		sourceData.deepSWEScoreByModelName,
	);
	if (deepSWEScore != null) {
		evaluations.deep_swe = deepSWEScore.pass_at_1;
	}
	const terminalBenchAccuracy = findTerminalBenchMedianAccuracy(
		modelNameCandidates,
		sourceData.terminalBenchAccuracyByModelName,
	);
	if (terminalBenchAccuracy != null) {
		evaluations.terminal_bench_2 = terminalBenchAccuracy;
	}
	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		sourceData.agentsLastExamScoreByModelName,
	);
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
	}
	const automationBenchScore = findAutomationBenchScore(
		modelNameCandidates,
		sourceData.automationBenchScoreByModelName,
	);
	if (automationBenchScore != null) {
		evaluations.automation_bench = automationBenchScore;
	}
	const blueprintBenchScore = findBlueprintBenchScore(
		modelNameCandidates,
		sourceData.blueprintBenchScoreByModelName,
	);
	if (blueprintBenchScore != null) {
		evaluations.blueprint_bench_2 = blueprintBenchScore;
	}
	const browseCompScore = findBrowseCompScore(
		modelNameCandidates,
		sourceData.browseCompScoreByModelName,
	);
	if (browseCompScore != null) {
		evaluations.browsecomp = browseCompScore;
	}
	const toolathlonScore = findToolathlonScore(
		modelNameCandidates,
		sourceData.toolathlonScoreByModelName,
	);
	if (toolathlonScore != null) {
		evaluations.toolathlon = toolathlonScore;
	}
	const cursorBenchScore = findCursorBenchScore(
		modelNameCandidates,
		sourceData.cursorBenchScoreByModelName,
	);
	if (cursorBenchScore != null) {
		evaluations.cursorbench = cursorBenchScore;
	}
	return {
		id: canonicalId,
		provider_id: modelsDevModel.provider_id,
		openrouter_id: modelsDevModel.model.id ?? modelsDevModel.model_id,
		name:
			typeof modelsDevModel.model.name === "string"
				? modelsDevModel.model.name
				: modelsDevModel.model_id,
		aa_id: null,
		family: matchedFamily,
		...modelMetadata,
		...(deepSWEScore == null && agentsLastExamScore == null
			? {}
			: {
					scoring_sources: {
						...(deepSWEScore == null ? {} : { deep_swe: deepSWEScore }),
						...(agentsLastExamScore == null
							? {}
							: { agents_last_exam: agentsLastExamScore }),
					},
				}),
		...(Object.keys(evaluations).length === 0 ? {} : { evaluations }),
	};
}

/** Add preferred recent models.dev catalog rows that have no AA-matched row. */
export function buildDatabaseCatalogRows(
	sourceData: LlmStatsSourceData,
	matchedRows: Record<string, unknown>[],
): Record<string, unknown>[] {
	const existingNormalizedIds = new Set<string>();
	const existingConcreteFamilyKeys = new Set<string>();
	const rememberCatalogRow = (row: Record<string, unknown>) => {
		for (const normalizedId of normalizedCatalogIds(row)) {
			existingNormalizedIds.add(normalizedId);
		}
		const familyKey = catalogFamilyKey(row);
		if (familyKey != null && !isLatestAliasRow(row)) {
			existingConcreteFamilyKeys.add(familyKey);
		}
	};
	for (const row of matchedRows) {
		rememberCatalogRow(row);
	}
	const catalogRows = filterDatabaseTextLlmRows(matchedRows);
	const modelsDevCatalogRows = sourceData.preferredModelsDevModels
		.map((modelsDevModel) => modelsDevCatalogRow(modelsDevModel, sourceData))
		.filter((row): row is Record<string, unknown> => row != null)
		.sort(
			(left, right) => catalogAliasPriority(left) - catalogAliasPriority(right),
		);
	for (const row of modelsDevCatalogRows) {
		const normalizedId = normalizedRowId(row);
		const latestFamilyKey = isLatestAliasRow(row)
			? catalogFamilyKey(row)
			: null;
		if (
			normalizedId == null ||
			!isTextLlmCatalogRow(row) ||
			existingNormalizedIds.has(normalizedId) ||
			(latestFamilyKey != null &&
				existingConcreteFamilyKeys.has(latestFamilyKey))
		) {
			continue;
		}
		rememberCatalogRow(row);
		catalogRows.push(row);
	}
	return catalogRows;
}
