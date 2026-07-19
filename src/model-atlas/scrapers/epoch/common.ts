/** Epoch common benchmark-run parsing preserves private task versions and run-level metadata. */

import { benchmarkModelEffort } from "../../shared";
import { asFiniteNumber, fetchWithTimeout, nowEpochSeconds } from "../../utils";
import type {
	BenchmarkScoreMetadata,
	BenchmarkScoreRow,
} from "../benchmark-score";
import { parseCsvRecords } from "../csv-parser";

const EPOCH_BENCHMARKS_CSV_URL = "https://epoch.ai/data/benchmarks.csv";
const DEFAULT_TIMEOUT_MS = 30_000;
let pendingBenchmarkRows: Promise<EpochBenchmarkRowsPayload> | null = null;

export type EpochBenchmarkCsvRow = Record<string, string>;
type EpochBenchmarkRowsPayload = {
	fetched_at_epoch_seconds: number | null;
	data: EpochBenchmarkCsvRow[];
};

function cleanMetadata(row: EpochBenchmarkCsvRow): BenchmarkScoreMetadata {
	return {
		run_id: row.id_runs || null,
		task: row.task || null,
		task_version: row["task version"] || null,
		status: row.Status || null,
		scores: row.Scores || null,
		best_score: asFiniteNumber(row.best_score),
		original_task_name: row.original_task_name || null,
	};
}

/** Normalize one successful Epoch run while retaining its exact task/version identity. */
export function epochRunScoreRow(
	row: EpochBenchmarkCsvRow,
	benchmarkKey: BenchmarkScoreRow["benchmark_key"],
): BenchmarkScoreRow | null {
	if (row.Status !== "Success") return null;
	const score =
		asFiniteNumber(row.mean_score) ??
		asFiniteNumber(row["Best score (across scorers)"]) ??
		asFiniteNumber(row.best_score);
	const model =
		row["Unique display name"] ||
		row["Display name"] ||
		row.Model ||
		row.model ||
		"";
	if (score == null || model.length === 0) return null;
	const parsed = benchmarkModelEffort(model);
	return {
		benchmark_key: benchmarkKey,
		source: "epoch",
		source_url: EPOCH_BENCHMARKS_CSV_URL,
		model_id: row.id_model_version || row.model || null,
		model,
		base_model: parsed.baseModel,
		reasoning_effort: parsed.reasoningEffort,
		provider: row.Organization || null,
		rank: null,
		score,
		score_eligible: true,
		standard_error: asFiniteNumber(row.stderr),
		confidence_low: null,
		confidence_high: null,
		observed_at: row.started_at || null,
		metadata: cleanMetadata(row),
	};
}

export function processEpochBenchmarkCsv(csv: string): EpochBenchmarkCsvRow[] {
	return parseCsvRecords(csv);
}

async function requestEpochBenchmarkRows(): Promise<EpochBenchmarkRowsPayload> {
	try {
		const response = await fetchWithTimeout(
			EPOCH_BENCHMARKS_CSV_URL,
			{},
			DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok)
			throw new Error(`Epoch benchmark scrape failed: ${response.status}`);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processEpochBenchmarkCsv(await response.text()),
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}

/** Shares only an in-flight CSV request while each Epoch benchmark keeps an independent lifecycle. */
export function fetchEpochBenchmarkRows(): Promise<EpochBenchmarkRowsPayload> {
	if (pendingBenchmarkRows == null) {
		pendingBenchmarkRows = requestEpochBenchmarkRows().finally(() => {
			pendingBenchmarkRows = null;
		});
	}
	return pendingBenchmarkRows;
}
