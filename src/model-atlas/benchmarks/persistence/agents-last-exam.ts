/** Agents Last Exam persistence owns raw-cache reconstruction, snapshot refresh, and raw-row serialization. */

import {
	type CacheRowSource,
	firstEpochSecond,
	sourceCacheRows,
	stringValue,
} from "../../ingest/cache/rows";
import { SNAPSHOT_TABLES, SOURCE_URLS } from "../../ingest/source-registry";
import {
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
	type AgentsLastExamHarnessRow,
	type AgentsLastExamModelScoreRow,
	getAgentsLastExamHarnessStats,
	summarizeAgentsLastExamModelScores,
} from "../scrapers/agents-last-exam";

export function readAgentsLastExamRawCache(cache: CacheRowSource): {
	rows: AgentsLastExamHarnessRow[];
	fetchedAt: number | null;
} | null {
	const cacheRows = sourceCacheRows(
		cache,
		"SELECT * FROM agents_last_exam_raw_rows WHERE row_kind = 'harness_score' ORDER BY row_index",
	);
	if (cacheRows.length === 0) {
		return null;
	}
	return {
		rows: cacheRows.flatMap((row) => {
			const split = stringValue(row.split);
			const harness = stringValue(row.harness);
			const model = stringValue(row.model);
			const runs = asFiniteNumber(row.runs);
			const tasks = asFiniteNumber(row.tasks);
			const splitTasks = asFiniteNumber(row.split_tasks);
			const passes = asFiniteNumber(row.passes);
			const accuracy = asFiniteNumber(row.accuracy);
			const score = asFiniteNumber(row.score);
			const totalDurationSeconds = asFiniteNumber(row.total_duration_seconds);
			const totalInputTokens = asFiniteNumber(row.total_input_tokens);
			const totalOutputTokens = asFiniteNumber(row.total_output_tokens);
			const totalCostUsd = asFiniteNumber(row.total_cost_usd);
			return split != null &&
				harness != null &&
				model != null &&
				runs != null &&
				tasks != null &&
				splitTasks != null &&
				passes != null &&
				accuracy != null &&
				score != null &&
				totalDurationSeconds != null &&
				totalInputTokens != null &&
				totalOutputTokens != null
				? [
						{
							split,
							harness,
							model,
							harness_variant: stringValue(row.harness_variant),
							runs,
							tasks,
							split_tasks: splitTasks,
							passes,
							accuracy,
							score,
							total_duration_seconds: totalDurationSeconds,
							total_input_tokens: totalInputTokens,
							total_output_tokens: totalOutputTokens,
							total_cost_usd: totalCostUsd,
							cost_source: stringValue(row.cost_source),
						},
					]
				: [];
		}),
		fetchedAt: firstEpochSecond(cacheRows),
	};
}

type AgentsLastExamSnapshot = {
	agentsLastExamRows: AgentsLastExamHarnessRow[];
	agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
	sourceStatus: SourceSnapshotStatus;
};

/** Preserves Agents Last Exam harness rows while returning summarized model scores. */
async function agentsLastExamSnapshot(
	cached: ReturnType<typeof readAgentsLastExamRawCache>,
	status: RawSourceCacheStatus,
	options: DatabaseBuildOptions,
	previousMissingSince: ReadonlyMap<string, number>,
	nowEpochSeconds: number,
): Promise<AgentsLastExamSnapshot> {
	if (
		status.cache_hit &&
		cached != null &&
		options.replaceSourceRows !== true
	) {
		const cachedSnapshot = snapshotRowsWithStates({
			source: "agents_last_exam",
			cachedRows: cached.rows,
			fetchedRows: [],
			fetchedAtEpochSeconds: null,
			options,
			rowKey: (row) =>
				sourceKey(row.split, row.harness, row.model, row.harness_variant),
			rowLabel: (row) => `${row.model} ${row.split}`,
			previousMissingSince,
			nowEpochSeconds,
		});
		return {
			agentsLastExamRows: cachedSnapshot.rows,
			agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
				cachedSnapshot.rows,
			),
			sourceStatus: {
				source: "agents_last_exam",
				fetchedAt: cached.fetchedAt,
				sourceInputCount: cachedSnapshot.rows.length,
				sourceRowStates: cachedSnapshot.states,
				fetchedAtKey: "agentsLastExam",
			},
		};
	}
	const fetched = await getAgentsLastExamHarnessStats();
	const hasUsableFetchedRows = shouldUseFetchedRows(
		fetched.fetched_at_epoch_seconds,
		fetched.data.length,
	);
	const snapshot = snapshotRowsWithStates({
		source: "agents_last_exam",
		cachedRows: cached?.rows,
		fetchedRows: fetched.data,
		fetchedAtEpochSeconds: fetched.fetched_at_epoch_seconds,
		options,
		rowKey: (row) =>
			sourceKey(row.split, row.harness, row.model, row.harness_variant),
		rowLabel: (row) => `${row.model} ${row.split}`,
		previousMissingSince,
		nowEpochSeconds,
	});
	const fetchedAt = snapshotFetchedAt(
		hasUsableFetchedRows,
		cached?.fetchedAt,
		fetched.fetched_at_epoch_seconds,
	);
	return {
		agentsLastExamRows: snapshot.rows,
		agentsLastExamModelScores: summarizeAgentsLastExamModelScores(
			snapshot.rows,
		),
		sourceStatus: {
			source: "agents_last_exam",
			fetchedAt,
			sourceInputCount: snapshot.rows.length,
			sourceRowStates: snapshot.states,
			fetchedAtKey: "agentsLastExam",
		},
	};
}

/** Insert Agents' Last Exam raw harness rows and summarized model rows in one source table. */
function insertAgentsLastExamRawRows(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO agents_last_exam_raw_rows (
			row_index, fetched_at_epoch_seconds, url, split, harness, model,
			harness_variant, runs, tasks, split_tasks, passes, accuracy, score,
			total_duration_seconds, total_input_tokens, total_output_tokens,
			total_cost_usd, cost_source,
			median_accuracy, mean_accuracy, median_score, mean_score,
			median_total_duration_seconds, mean_total_duration_seconds,
			median_total_input_tokens, mean_total_input_tokens,
			median_total_output_tokens, mean_total_output_tokens,
			median_duration_seconds_per_task, mean_duration_seconds_per_task,
			median_input_tokens_per_task, mean_input_tokens_per_task,
			median_output_tokens_per_task, mean_output_tokens_per_task,
			median_cost_usd_per_task, mean_cost_usd_per_task,
			frequency, row_kind
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	let rowIndex = 0;
	for (const row of snapshots.agentsLastExamRows) {
		statement.run(
			rowIndex,
			snapshots.fetchedAt.agentsLastExam,
			SOURCE_URLS.agents_last_exam,
			row.split,
			row.harness,
			row.model,
			row.harness_variant,
			row.runs,
			row.tasks,
			row.split_tasks,
			row.passes,
			row.accuracy,
			row.score,
			row.total_duration_seconds,
			row.total_input_tokens,
			row.total_output_tokens,
			row.total_cost_usd,
			row.cost_source,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			"harness_score",
		);
		rowIndex += 1;
	}
	for (const row of snapshots.agentsLastExamModelScores) {
		statement.run(
			rowIndex,
			snapshots.fetchedAt.agentsLastExam,
			SOURCE_URLS.agents_last_exam,
			row.split,
			null,
			row.model,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			row.median_accuracy,
			row.mean_accuracy,
			row.median_score,
			row.mean_score,
			row.median_total_duration_seconds,
			row.mean_total_duration_seconds,
			row.median_total_input_tokens,
			row.mean_total_input_tokens,
			row.median_total_output_tokens,
			row.mean_total_output_tokens,
			row.median_duration_seconds_per_task,
			row.mean_duration_seconds_per_task,
			row.median_input_tokens_per_task,
			row.mean_input_tokens_per_task,
			row.median_output_tokens_per_task,
			row.mean_output_tokens_per_task,
			row.median_cost_usd_per_task,
			row.mean_cost_usd_per_task,
			row.frequency,
			"model_score",
		);
		rowIndex += 1;
	}
}

export const agentsLastExamPersistence = {
	cacheKey: "agentsLastExam",
	source: "agents_last_exam",
	table: SNAPSHOT_TABLES.agents_last_exam,
	readCache: readAgentsLastExamRawCache,
	snapshot: agentsLastExamSnapshot,
	write: insertAgentsLastExamRawRows,
} as const;
