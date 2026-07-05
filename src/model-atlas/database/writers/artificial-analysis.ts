/** SQLite writer for Artificial Analysis raw rows, selected benchmark fields, and source metadata. */

import type { DatabaseSync } from "node:sqlite";

import {
	cleanArtificialAnalysisModelName,
	parseArtificialAnalysisReasoningEffort,
} from "../../scrapers/artificial-analysis/common";
import { asFiniteNumber, asRecord, type JsonObject } from "../../shared";
import { SOURCE_URLS, type SourceSnapshots } from "../types";
import {
	booleanValue,
	firstNumber,
	firstString,
	type SqlValue,
} from "./shared";

const ARTIFICIAL_ANALYSIS_ORIGIN = "https://artificialanalysis.ai";

function artificialAnalysisRawRowKey(row: JsonObject): string | null {
	const explicitModelId = firstString(row, ["model_id", "model_url", "id"]);
	if (explicitModelId != null) {
		return explicitModelId;
	}
	const slug = firstString(row, ["slug"]);
	if (slug == null) {
		return null;
	}
	const creator = {
		...asRecord(row.creator),
		...asRecord(row.model_creators),
	};
	const creatorSlug =
		firstString(row, ["modelCreatorSlug"]) ??
		firstString(creator, ["slug"]) ??
		firstString(row, ["modelCreatorName"]);
	return creatorSlug == null ? slug : `${creatorSlug}/${slug}`;
}

function artificialAnalysisSelectedRowsByKey(
	rows: readonly JsonObject[],
): Map<string, JsonObject> {
	const rowsByKey = new Map<string, JsonObject>();
	for (const row of rows) {
		for (const key of [
			firstString(row, ["model_id"]),
			firstString(row, ["model_url"]),
		]) {
			if (key != null) {
				rowsByKey.set(key, row);
			}
		}
	}
	return rowsByKey;
}

function absoluteArtificialAnalysisUrl(value: string | null): string | null {
	if (value == null) {
		return null;
	}
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return value;
	}
	return value.startsWith("/")
		? `${ARTIFICIAL_ANALYSIS_ORIGIN}${value}`
		: `${ARTIFICIAL_ANALYSIS_ORIGIN}/${value}`;
}

function artificialAnalysisIdentityValues(
	row: JsonObject,
	selectedRow: JsonObject,
	creator: JsonObject,
): SqlValue[] {
	const modelId =
		typeof selectedRow.model_id === "string"
			? selectedRow.model_id
			: firstString(row, ["model_id", "model_url", "id"]);
	const sourceName =
		firstString(row, ["shortName", "short_name", "name"]) ??
		firstString(selectedRow, ["name"]);
	return [
		modelId,
		cleanArtificialAnalysisModelName(
			firstString(row, ["name"]) ?? firstString(selectedRow, ["name"]),
		),
		cleanArtificialAnalysisModelName(sourceName),
		firstString(creator, ["name"]) ?? firstString(row, ["modelCreatorName"]),
		absoluteArtificialAnalysisUrl(
			firstString(selectedRow, ["model_url"]) ??
				firstString(row, ["model_url"]),
		),
		firstString(row, ["releaseDate", "release_date"]),
		booleanValue(row.deprecated),
		booleanValue(row.reasoningModel),
		firstString(selectedRow, ["reasoning_effort"]) ??
			parseArtificialAnalysisReasoningEffort(sourceName),
		booleanValue(row.isOpenWeights),
		booleanValue(row.commercialAllowed),
	];
}

function artificialAnalysisModalityValues(row: JsonObject): SqlValue[] {
	return [
		booleanValue(row.input_modality_text ?? row.inputModalityText),
		booleanValue(row.input_modality_image ?? row.inputModalityImage),
		booleanValue(row.input_modality_video ?? row.inputModalityVideo),
		booleanValue(row.input_modality_speech ?? row.inputModalitySpeech),
		booleanValue(row.output_modality_text ?? row.outputModalityText),
		booleanValue(row.output_modality_image ?? row.outputModalityImage),
		booleanValue(row.output_modality_video ?? row.outputModalityVideo),
		booleanValue(row.output_modality_speech ?? row.outputModalitySpeech),
	];
}

function artificialAnalysisBenchmarkValues(
	row: JsonObject,
	selectedRow: JsonObject,
): SqlValue[] {
	const intelligence = asRecord(selectedRow.intelligence);
	const evaluations = asRecord(selectedRow.evaluations);
	return [
		firstNumber(row, ["median_output_speed", "medianOutputTokensPerSecond"]),
		firstNumber(row, [
			"median_time_to_first_chunk",
			"medianTimeToFirstTokenSeconds",
		]),
		firstNumber(selectedRow, ["median_end_to_end_response_time"]) ??
			firstNumber(row, [
				"median_end_to_end_response_time",
				"medianEndToEndResponseTimeSeconds",
			]),
		asFiniteNumber(intelligence.intelligence_index),
		asFiniteNumber(intelligence.agentic_index),
		asFiniteNumber(intelligence.coding_index),
		asFiniteNumber(intelligence.omniscience_index),
		asFiniteNumber(intelligence.omniscience_accuracy),
		asFiniteNumber(evaluations.apex_agents),
		asFiniteNumber(evaluations.critpt),
		asFiniteNumber(evaluations.gdpval_normalized),
		asFiniteNumber(evaluations.gpqa),
		asFiniteNumber(evaluations.hle),
		asFiniteNumber(evaluations.lcr),
		asFiniteNumber(evaluations.mmmu_pro),
		asFiniteNumber(evaluations.scicode),
		asFiniteNumber(evaluations.tau_banking),
		asFiniteNumber(evaluations.terminalbench_v21),
	];
}

function artificialAnalysisCostAndLogoValues(
	row: JsonObject,
	selectedRow: JsonObject,
	creator: JsonObject,
): SqlValue[] {
	const intelligenceIndexCost = asRecord(selectedRow.intelligence_index_cost);
	const tokenCounts = asRecord(row.intelligenceIndexTokenCounts);
	return [
		asFiniteNumber(intelligenceIndexCost.input_cost),
		asFiniteNumber(intelligenceIndexCost.reasoning_cost),
		asFiniteNumber(intelligenceIndexCost.output_cost),
		asFiniteNumber(intelligenceIndexCost.total_cost),
		asFiniteNumber(tokenCounts.inputTokens),
		asFiniteNumber(tokenCounts.reasoningTokens),
		asFiniteNumber(tokenCounts.answerTokens),
		asFiniteNumber(tokenCounts.outputTokens),
		asFiniteNumber(intelligenceIndexCost.total_tokens),
		asFiniteNumber(intelligenceIndexCost.cost_per_task),
		asFiniteNumber(intelligenceIndexCost.seconds_per_task),
		asFiniteNumber(intelligenceIndexCost.output_tokens_per_task),
		firstString(selectedRow, ["logo"]) ??
			firstString(row, [
				"logo_small_url",
				"logo_url",
				"logoSmall",
				"logo_small",
				"modelCreatorLogo",
			]) ??
			firstString(creator, [
				"logo_small_url",
				"logo_url",
				"logo_small",
				"logo",
			]),
	];
}

export function insertArtificialAnalysisRawModels(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const selectedRowsByKey = artificialAnalysisSelectedRowsByKey(
		snapshots.artificialAnalysisSelectedRows,
	);
	const statement = db.prepare(`
		INSERT INTO artificial_analysis_raw_models (
			run_id, row_index, fetched_at_epoch_seconds, url, model_id, name,
			short_name, creator_name, model_url, release_date, deprecated,
			reasoning_model, reasoning_effort, open_weights, commercial_allowed,
			input_modality_text, input_modality_image, input_modality_video, input_modality_speech,
			output_modality_text, output_modality_image, output_modality_video,
			output_modality_speech,
			median_output_tokens_per_second,
			median_time_to_first_token_seconds,
			median_end_to_end_response_time_seconds, intelligence_index,
			agentic_index, coding_index, omniscience_index, omniscience_accuracy,
			apex_agents, critpt, gdpval_normalized, gpqa, hle, lcr, mmmu_pro,
			scicode, tau_banking, terminalbench_v21, input_cost, reasoning_cost,
			output_cost, total_cost, input_tokens, reasoning_tokens, answer_tokens,
			output_tokens, total_tokens, cost_per_task, seconds_per_task,
			output_tokens_per_task, logo_url
		) VALUES (${Array.from({ length: 54 }, () => "?").join(", ")})
	`);
	for (const [index, row] of snapshots.artificialAnalysisRawRows.entries()) {
		const selectedRow =
			selectedRowsByKey.get(artificialAnalysisRawRowKey(row) ?? "") ??
			snapshots.artificialAnalysisSelectedRows[index] ??
			{};
		const creator = {
			...asRecord(row.creator),
			...asRecord(row.model_creators),
		};
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.artificialAnalysis,
			SOURCE_URLS.artificial_analysis,
			...artificialAnalysisIdentityValues(row, selectedRow, creator),
			...artificialAnalysisModalityValues(row),
			...artificialAnalysisBenchmarkValues(row, selectedRow),
			...artificialAnalysisCostAndLogoValues(row, selectedRow, creator),
		);
	}
}

export function insertArtificialAnalysisEvaluationResourceRawRows(
	db: DatabaseSync,
	runId: number,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO artificial_analysis_evaluations_raw_rows (
			run_id, row_index, fetched_at_epoch_seconds, url, benchmark_key, model_id,
			model, provider, provider_id, reasoning_effort, score, task_run_count,
			cost_per_task_usd, seconds_per_task, tokens_per_task,
			input_tokens_per_task, output_tokens_per_task, answer_tokens_per_task,
			reasoning_tokens_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [
		index,
		row,
	] of snapshots.artificialAnalysisEvaluationResourceRows.entries()) {
		statement.run(
			runId,
			index,
			snapshots.fetchedAt.artificialAnalysisEvaluationResources,
			row.source_url,
			row.benchmark_key,
			row.model_id,
			row.model,
			row.provider,
			row.provider_id,
			row.reasoning_effort,
			row.score,
			row.task_run_count,
			row.cost_per_task_usd,
			row.seconds_per_task,
			row.tokens_per_task,
			row.input_tokens_per_task,
			row.output_tokens_per_task,
			row.answer_tokens_per_task,
			row.reasoning_tokens_per_task,
		);
	}
}
