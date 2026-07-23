/** Harvey LAB persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../../ingest/cache/rows";
import { SNAPSHOT_TABLES, SOURCE_URLS } from "../../ingest/source-registry";
import {
	snapshotRows,
	snapshotRowsWithStates,
	sourceKey,
} from "../../ingest/source-snapshots/policy";
import {
	shouldUseFetchedRows,
	snapshotFetchedAt,
} from "../../ingest/source-snapshots/row-snapshot";
import type {
	DatabaseBuildOptions,
	RawSourceCacheStatus,
	SourceSnapshotStatus,
	SourceSnapshots,
} from "../../ingest/types";
import type { DatabaseWriter } from "../../ingest/writers/database";
import { asFiniteNumber } from "../../runtime";
import {
	getHarveyLabStats,
	type HarveyLabMetric,
	type HarveyLabModelScoreRow,
	type HarveyLabTaskRow,
} from "../scrapers/vals/harvey-lab";

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

type HarveyLabSnapshot = {
	harveyLabRows: HarveyLabTaskRow[];
	harveyLabModelScoreRows: HarveyLabModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Loads Harvey LAB rows while using strict overall task resolution for scoring. */
async function harveyLabSnapshot(
	cached: ReturnType<typeof readHarveyLabRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<HarveyLabSnapshot> {
	const fetched =
		status.cache_hit && cached != null && options.replaceSourceRows !== true
			? null
			: await getHarveyLabStats();
	const fetchedRows = fetched?.task_rows ?? [];
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched?.fetched_at_epoch_seconds ?? null,
		fetchedRows.length,
	);
	const rows = snapshotRows(
		cached?.rows,
		fetchedRows,
		fetched?.fetched_at_epoch_seconds ?? null,
		options,
		(row) => sourceKey(row.task, row.model_id, row.reasoning_effort),
	);
	const modelScores = rows.filter(
		(row): row is HarveyLabModelScoreRow =>
			row.task === "overall" && row.metric === "task_resolution",
	);
	const states = snapshotRowsWithStates({
		source: "vals_harvey_lab",
		cachedRows: cached?.modelScores,
		fetchedRows: fetched?.model_scores ?? [],
		fetchedAtEpochSeconds: fetched?.fetched_at_epoch_seconds ?? null,
		options,
		rowKey: (row) => sourceKey(row.model_id, row.reasoning_effort),
		rowLabel: (row) => row.model,
		previousMissingSince,
		nowEpochSeconds,
	}).states;
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched?.fetched_at_epoch_seconds ?? null,
	);
	return {
		harveyLabRows: rows,
		harveyLabModelScoreRows: modelScores,
		sourceStatus: {
			source: "vals_harvey_lab",
			fetchedAt,
			sourceInputCount: modelScores.length,
			sourceRowStates: states,
			fetchedAtKey: "harveyLab",
		},
	};
}

function insertHarveyLabRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO vals_harvey_lab_raw_rows (
			row_index, fetched_at_epoch_seconds, url, task, task_label, metric,
			row_kind, model_id, model, base_model, reasoning_effort, provider,
			rank, score, criterion_pass, standard_error, cost_per_task_usd,
			seconds_per_task, temperature, top_p, max_output_tokens, verbosity,
			compute_effort, harness
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	for (const [index, row] of snapshots.harveyLabRows.entries()) {
		statement.run(
			index,
			snapshots.fetchedAt.harveyLab,
			SOURCE_URLS.vals_harvey_lab,
			row.task,
			row.task_label,
			row.metric,
			row.task === "overall" ? "overall" : "component",
			row.model_id,
			row.model,
			row.base_model,
			row.reasoning_effort,
			row.provider,
			row.rank,
			row.score,
			row.criterion_pass,
			row.standard_error,
			row.cost_per_task_usd,
			row.seconds_per_task,
			row.temperature,
			row.top_p,
			row.max_output_tokens,
			row.verbosity,
			row.compute_effort,
			row.harness,
		);
	}
}

export const harveyLabPersistence = {
	cacheKey: "harveyLab",
	source: "vals_harvey_lab",
	table: SNAPSHOT_TABLES.vals_harvey_lab,
	readCache: readHarveyLabRawCache,
	snapshot: harveyLabSnapshot,
	write: insertHarveyLabRawRows,
} as const;
