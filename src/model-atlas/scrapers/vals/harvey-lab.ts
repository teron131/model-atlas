/**
 * Harvey LAB scraper owns Vals leaderboard extraction and strict task-resolution normalization.
 *
 * Page source: https://www.vals.ai/benchmarks/hlab
 */

import { positiveFiniteNumber } from "../../math-utils";
import {
	asFiniteNumber,
	asRecord,
	buildBenchmarkModelMap,
	canonicalReasoningEffort,
	normalizeModelToken,
} from "../../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { htmlAttribute, stringValue } from "../parsing";

export const HARVEY_LAB_URL = "https://www.vals.ai/benchmarks/hlab";
const DEFAULT_TIMEOUT_MS = 30_000;
const OVERALL_TASK_KEY = "overall";
const CRITERION_PASS_TASK_KEY = "criteria_pass_rate";

type HarveyLabScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

type HarveyLabMetadata = {
	benchmark: string | null;
	slug: string | null;
	version: string | null;
	updated: string | null;
	dataset_type: string | null;
	industry: string | null;
	task_labels: Record<string, string>;
};

export type HarveyLabMetric = "criterion_pass" | "task_resolution";

export type HarveyLabTaskRow = {
	task: string;
	task_label: string;
	metric: HarveyLabMetric;
	model_id: string;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	provider: string | null;
	rank: number | null;
	score: number;
	criterion_pass: number | null;
	standard_error: number | null;
	cost_per_task_usd: number | null;
	seconds_per_task: number | null;
	temperature: number | null;
	top_p: number | null;
	max_output_tokens: number | null;
	verbosity: string | null;
	compute_effort: string | null;
	harness: string | null;
};

export type HarveyLabModelScoreRow = HarveyLabTaskRow & {
	task: "overall";
	metric: "task_resolution";
};

export type HarveyLabRowsByModelName = Map<string, HarveyLabModelScoreRow>;

type HarveyLabParsedPage = {
	metadata: HarveyLabMetadata | null;
	task_rows: HarveyLabTaskRow[];
	model_scores: HarveyLabModelScoreRow[];
};

type HarveyLabPayload = HarveyLabParsedPage & {
	fetched_at_epoch_seconds: number | null;
};

function reviveAstroValue(value: unknown): unknown {
	if (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "number"
	) {
		if (value[0] === 0) {
			return reviveAstroValue(value[1]);
		}
		if (value[0] === 1) {
			return Array.isArray(value[1])
				? value[1].map((item) => reviveAstroValue(item))
				: [];
		}
	}
	if (Array.isArray(value)) {
		return value.map((item) => reviveAstroValue(item));
	}
	if (value != null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, reviveAstroValue(item)]),
		);
	}
	return value;
}

function benchmarkViewProps(pageHtml: string): unknown {
	const island = pageHtml.match(
		/<astro-island\b(?=[^>]*component-url="\/_astro\/BenchmarkView[^"]*")[^>]*>/,
	)?.[0];
	const props = island == null ? null : htmlAttribute(island, "props");
	return props == null ? null : reviveAstroValue(JSON.parse(props));
}

function taskLabelsFromMetadata(metadata: unknown): Record<string, string> {
	const labels: Record<string, string> = {};
	for (const [key, value] of Object.entries(asRecord(metadata))) {
		if (typeof value === "string" && value.length > 0) {
			labels[key] = value;
		}
	}
	return labels;
}

function harveyLabMetadata(value: unknown): HarveyLabMetadata {
	const metadata = asRecord(value);
	return {
		benchmark: stringValue(metadata.benchmark),
		slug: stringValue(metadata.slug),
		version: stringValue(metadata.version),
		updated: stringValue(metadata.updated),
		dataset_type: stringValue(metadata.dataset_type),
		industry: stringValue(metadata.industry),
		task_labels: taskLabelsFromMetadata(metadata.tasks),
	};
}

function percentToUnitScore(value: unknown): number | null {
	const percent = asFiniteNumber(value);
	if (percent == null || percent < 0 || percent > 100) {
		return null;
	}
	return Number((percent / 100).toFixed(6));
}

function nonNegativeNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number >= 0 ? number : null;
}

function modelSlug(modelId: string): string {
	return modelId.split("/").at(-1) ?? modelId;
}

function taskMetric(task: string): HarveyLabMetric {
	return task === CRITERION_PASS_TASK_KEY ||
		task.startsWith(`${CRITERION_PASS_TASK_KEY}__`)
		? "criterion_pass"
		: "task_resolution";
}

function sourceReasoningEffort(row: Record<string, unknown>): string | null {
	return canonicalReasoningEffort(row.reasoning_effort ?? row.compute_effort);
}

function harveyLabTaskRow(
	task: string,
	taskLabel: string,
	modelId: string,
	value: unknown,
): HarveyLabTaskRow | null {
	const row = asRecord(value);
	const score = percentToUnitScore(row.accuracy);
	if (score == null || modelId.length === 0) {
		return null;
	}
	const baseModel = modelSlug(modelId);
	const reasoningEffort = sourceReasoningEffort(row);
	return {
		task,
		task_label: taskLabel,
		metric: taskMetric(task),
		model_id: modelId,
		model:
			reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
		base_model: baseModel,
		reasoning_effort: reasoningEffort,
		provider: stringValue(row.provider),
		rank: null,
		score,
		criterion_pass: null,
		standard_error: percentToUnitScore(row.stderr),
		cost_per_task_usd: nonNegativeNumber(row.cost_per_test),
		seconds_per_task: positiveFiniteNumber(row.latency),
		temperature: nonNegativeNumber(row.temperature),
		top_p: nonNegativeNumber(row.top_p),
		max_output_tokens: positiveFiniteNumber(row.max_output_tokens),
		verbosity: stringValue(row.verbosity),
		compute_effort: stringValue(row.compute_effort),
		harness: stringValue(row.harness),
	};
}

function isOverallRow(row: HarveyLabTaskRow): row is HarveyLabModelScoreRow {
	return row.task === OVERALL_TASK_KEY && row.metric === "task_resolution";
}

function sortRows<T extends HarveyLabTaskRow>(rows: T[]): T[] {
	return [...rows].sort(
		(left, right) =>
			left.task.localeCompare(right.task) ||
			right.score - left.score ||
			left.model_id.localeCompare(right.model_id),
	);
}

export function processHarveyLabPageHtml(
	pageHtml: string,
): HarveyLabParsedPage {
	const props = asRecord(benchmarkViewProps(pageHtml));
	const benchmarkView = asRecord(props.benchmarkView);
	const view = asRecord(asRecord(benchmarkView.default));
	const metadataRecord = asRecord(view.metadata);
	const metadata =
		Object.keys(metadataRecord).length === 0
			? null
			: harveyLabMetadata(metadataRecord);
	const taskLabels = metadata?.task_labels ?? {};
	const taskRows: HarveyLabTaskRow[] = [];
	for (const [task, taskValue] of Object.entries(asRecord(view.tasks))) {
		for (const [modelId, rowValue] of Object.entries(asRecord(taskValue))) {
			const row = harveyLabTaskRow(
				task,
				taskLabels[task] ?? task,
				modelId,
				rowValue,
			);
			if (row != null) {
				taskRows.push(row);
			}
		}
	}
	const criterionPassByModelId = new Map(
		taskRows
			.filter((row) => row.task === CRITERION_PASS_TASK_KEY)
			.map((row) => [row.model_id, row.score]),
	);
	const rankedOverallRows = taskRows
		.filter(isOverallRow)
		.sort(
			(left, right) =>
				right.score - left.score || left.model_id.localeCompare(right.model_id),
		)
		.map((row, index) => ({
			...row,
			rank: index + 1,
			criterion_pass: criterionPassByModelId.get(row.model_id) ?? null,
		}));
	const overallByModelId = new Map(
		rankedOverallRows.map((row) => [row.model_id, row]),
	);
	const enrichedTaskRows = taskRows.map((row) =>
		row.task === OVERALL_TASK_KEY
			? (overallByModelId.get(row.model_id) ?? row)
			: row,
	);
	return {
		metadata,
		task_rows: sortRows(enrichedTaskRows),
		model_scores: rankedOverallRows,
	};
}

export function buildHarveyLabMap(
	rows: readonly HarveyLabModelScoreRow[],
): HarveyLabRowsByModelName {
	const rowsByModelName = buildBenchmarkModelMap(rows);
	for (const row of rows) {
		for (const candidate of [row.model_id, modelSlug(row.model_id)]) {
			const key = normalizeModelToken(candidate);
			if (key.length > 0 && !rowsByModelName.has(key)) {
				rowsByModelName.set(key, row);
			}
		}
	}
	return rowsByModelName;
}

export async function getHarveyLabStats(
	options: HarveyLabScraperOptions = {},
): Promise<HarveyLabPayload> {
	try {
		const response = await fetchWithTimeout(
			options.url ?? HARVEY_LAB_URL,
			{},
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok) {
			throw new Error(`Harvey LAB scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			...processHarveyLabPageHtml(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			metadata: null,
			task_rows: [],
			model_scores: [],
		};
	}
}
