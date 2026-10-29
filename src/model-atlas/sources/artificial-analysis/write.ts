/** SQLite writer for Artificial Analysis leaderboard models and evaluation-page resource rows. */

import {
  type DatabaseWriter,
  firstString,
  sqliteBooleanValue,
  type SqlValue,
} from "../../database/writers/database";
import { asFiniteNumber, asRecord, type JsonObject } from "../../runtime";
import { SOURCE_URLS } from "../registry";
import type { SourceSnapshots } from "../types";
import { artificialAnalysisModelId } from "./leaderboard";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "./model-labels";

const ARTIFICIAL_ANALYSIS_ORIGIN = "https://artificialanalysis.ai";

export function insertArtificialAnalysisRawModels(
  db: DatabaseWriter,
  snapshots: SourceSnapshots,
): void {
  const selectedRows = selectedRowsByKey(snapshots.artificialAnalysisSelectedRows);
  const statement = db.prepare(`
		INSERT INTO artificial_analysis_raw_models (
			row_index, fetched_at_epoch_seconds, url, model_id, name,
			short_name, creator_name, model_url, release_date, deprecated,
			reasoning_model, reasoning_effort, open_weights,
			input_modality_text, input_modality_image, input_modality_video, input_modality_speech,
			output_modality_text, output_modality_image, output_modality_video,
			output_modality_speech,
			median_output_tokens_per_second,
			median_time_to_first_token_seconds,
			median_end_to_end_response_time_seconds, intelligence_index, intelligence_index_version,
			intelligence_index_components, omniscience_index,
			price_1m_input_tokens, price_1m_output_tokens,
			cost_per_task, seconds_per_task, output_tokens_per_task, logo_url
		) VALUES (${Array.from({ length: 34 }, () => "?").join(", ")})
	`);
  for (const [index, row] of snapshots.artificialAnalysisRawRows.entries()) {
    const selectedRow = selectedRows.get(artificialAnalysisModelId(row) ?? "") ?? {};
    statement.run(
      index,
      snapshots.fetchedAt.artificialAnalysis,
      SOURCE_URLS.artificial_analysis,
      ...identityValues(row, selectedRow),
      ...modalityValues(row),
      ...timingAndIndexValues(row, selectedRow),
      ...costAndLogoValues(selectedRow),
    );
  }
}

export function insertArtificialAnalysisBenchmarkResourceRawRows(
  db: DatabaseWriter,
  snapshots: SourceSnapshots,
): void {
  const statement = db.prepare(`
		INSERT INTO artificial_analysis_benchmarks_raw_rows (
			row_index, fetched_at_epoch_seconds, url, benchmark_key, benchmark_version,
			model_id, model, provider, provider_id, reasoning_effort, score, task_run_count,
			cost_per_task_usd, seconds_per_task, tokens_per_task,
			input_tokens_per_task, output_tokens_per_task, answer_tokens_per_task,
			reasoning_tokens_per_task
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const [index, row] of snapshots.artificialAnalysisBenchmarkResourceRows.entries()) {
    statement.run(
      index,
      snapshots.fetchedAt.artificialAnalysisBenchmarkResources,
      row.source_url,
      row.benchmark_key,
      row.benchmark_version,
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

function selectedRowsByKey(rows: readonly JsonObject[]): Map<string, JsonObject> {
  const rowsByKey = new Map<string, JsonObject>();
  for (const row of rows) {
    const key = artificialAnalysisModelId(row);
    if (key != null) {
      rowsByKey.set(key, row);
    }
  }
  return rowsByKey;
}

function identityValues(row: JsonObject, selectedRow: JsonObject): SqlValue[] {
  const fullName = firstString(row, ["name"]) ?? firstString(selectedRow, ["name"]);
  const sourceName = firstString(row, ["shortName", "name"]) ?? firstString(selectedRow, ["name"]);
  return [
    firstString(selectedRow, ["model_id"]),
    cleanArtificialAnalysisModelName(fullName),
    cleanArtificialAnalysisModelName(sourceName),
    firstString(asRecord(row.creator), ["name"]),
    absoluteArtificialAnalysisUrl(firstString(selectedRow, ["model_url"])),
    firstString(row, ["releaseDate"]),
    sqliteBooleanValue(row.deprecated),
    sqliteBooleanValue(selectedRow.reasoning),
    firstString(selectedRow, ["reasoning_effort"]) ??
      parseArtificialAnalysisReasoningEffort(fullName, sourceName),
    sqliteBooleanValue(row.isOpenWeights),
  ];
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

function modalityValues(row: JsonObject): SqlValue[] {
  return [
    sqliteBooleanValue(row.inputModalityText),
    sqliteBooleanValue(row.inputModalityImage),
    sqliteBooleanValue(row.inputModalityVideo),
    sqliteBooleanValue(row.inputModalitySpeech),
    sqliteBooleanValue(row.outputModalityText),
    sqliteBooleanValue(row.outputModalityImage),
    sqliteBooleanValue(row.outputModalityVideo),
    sqliteBooleanValue(row.outputModalitySpeech),
  ];
}

function timingAndIndexValues(row: JsonObject, selectedRow: JsonObject): SqlValue[] {
  const intelligence = asRecord(selectedRow.intelligence);
  return [
    asFiniteNumber(selectedRow.median_speed),
    asFiniteNumber(selectedRow.median_time),
    asFiniteNumber(selectedRow.median_end_to_end_response_time),
    asFiniteNumber(intelligence.intelligence_index),
    firstString(row, ["intelligenceIndexVersion"]),
    Array.isArray(row.intelligenceIndexComponents)
      ? JSON.stringify(row.intelligenceIndexComponents)
      : null,
    asFiniteNumber(intelligence.omniscience_index),
  ];
}

function costAndLogoValues(selectedRow: JsonObject): SqlValue[] {
  const cost = asRecord(selectedRow.cost);
  const intelligenceIndexCost = asRecord(selectedRow.intelligence_index_cost);
  return [
    asFiniteNumber(cost.input),
    asFiniteNumber(cost.output),
    asFiniteNumber(intelligenceIndexCost.cost_per_task),
    asFiniteNumber(intelligenceIndexCost.seconds_per_task),
    asFiniteNumber(intelligenceIndexCost.output_tokens_per_task),
    firstString(selectedRow, ["logo"]),
  ];
}
