/** Cache reconstruction for VALS task and aggregate benchmark rows. */

import { asFiniteNumber } from "../../../runtime";
import type {
	HarveyLabMetric,
	HarveyLabModelScoreRow,
	HarveyLabTaskRow,
} from "../../../scrapers/vals/harvey-lab";
import type {
	ValsIndexModelScoreRow,
	ValsIndexTaskScoreRow,
} from "../../../scrapers/vals/index-benchmark";
import type {
	TerminalBenchModelHarnessRow,
	TerminalBenchTaskRow,
} from "../../../scrapers/vals/terminal-bench";
import { SOURCE_URLS } from "../../types";
import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../rows";

function harveyLabMetric(value: unknown): HarveyLabMetric | null {
	return value === "criterion_pass" || value === "task_resolution"
		? value
		: null;
}

/** Reconstruct Harvey LAB rows without losing scoring configuration or resource fields. */
export function readHarveyLabRawCache(cache: CacheRowSource): {
	rows: HarveyLabTaskRow[];
	modelScores: HarveyLabModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM vals_harvey_lab_raw_rows ORDER BY row_index",
	);
	if (
		cacheRows.length === 0 ||
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.vals_harvey_lab,
		)
	) {
		return null;
	}
	const rows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const metric = harveyLabMetric(row.metric);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const baseModel = stringValue(row.base_model);
		const score = asFiniteNumber(row.score);
		if (
			task == null ||
			taskLabel == null ||
			metric == null ||
			modelId == null ||
			model == null ||
			baseModel == null ||
			score == null
		) {
			return [];
		}
		return [
			{
				task,
				task_label: taskLabel,
				metric,
				model_id: modelId,
				model,
				base_model: baseModel,
				reasoning_effort: stringValue(row.reasoning_effort),
				provider: stringValue(row.provider),
				rank: asFiniteNumber(row.rank),
				score,
				criterion_pass: asFiniteNumber(row.criterion_pass),
				standard_error: asFiniteNumber(row.standard_error),
				cost_per_task_usd: asFiniteNumber(row.cost_per_task_usd),
				seconds_per_task: asFiniteNumber(row.seconds_per_task),
				temperature: asFiniteNumber(row.temperature),
				top_p: asFiniteNumber(row.top_p),
				max_output_tokens: asFiniteNumber(row.max_output_tokens),
				verbosity: stringValue(row.verbosity),
				compute_effort: stringValue(row.compute_effort),
				harness: stringValue(row.harness),
			},
		];
	});
	if (rows.length === 0) {
		return null;
	}
	return {
		rows,
		modelScores: rows.filter(
			(row): row is HarveyLabModelScoreRow =>
				row.task === "overall" && row.metric === "task_resolution",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readTerminalBenchRawCache(cache: CacheRowSource): {
	rows: TerminalBenchTaskRow[];
	modelScores: TerminalBenchModelHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM vals_terminal_bench_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some(
			(row) => stringValue(row.url) !== SOURCE_URLS.vals_terminal_bench,
		)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		if (
			task == null ||
			taskLabel == null ||
			modelId == null ||
			model == null ||
			score == null
		) {
			return [];
		}
		return [
			{
				task,
				task_label: taskLabel,
				source_model_id: stringValue(row.source_model_id) ?? modelId,
				model_id: modelId,
				model,
				provider: stringValue(row.provider),
				harness: stringValue(row.harness),
				score,
				cost_per_task_usd: asFiniteNumber(row.cost_per_task_usd),
				seconds_per_task: asFiniteNumber(row.seconds_per_task),
			},
		];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		modelScores: cachedRows.filter(
			(row): row is TerminalBenchModelHarnessRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

export function readValsIndexRawCache(cache: CacheRowSource): {
	rows: ValsIndexTaskScoreRow[];
	modelScores: ValsIndexModelScoreRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM vals_index_raw_rows ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	if (
		cacheRows.some((row) => stringValue(row.url) !== SOURCE_URLS.vals_index)
	) {
		return null;
	}
	const cachedRows = cacheRows.flatMap((row) => {
		const task = stringValue(row.task);
		const taskLabel = stringValue(row.task_label);
		const modelId = stringValue(row.model_id);
		const model = stringValue(row.model);
		const score = asFiniteNumber(row.score);
		return task != null &&
			taskLabel != null &&
			modelId != null &&
			model != null &&
			score != null
			? [
					{
						task,
						task_label: taskLabel,
						model_id: modelId,
						model,
						provider: stringValue(row.provider),
						score,
					},
				]
			: [];
	});
	if (cachedRows.length === 0) {
		return null;
	}
	return {
		rows: cachedRows,
		modelScores: cachedRows.filter(
			(row): row is ValsIndexModelScoreRow => row.task === "overall",
		),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}
