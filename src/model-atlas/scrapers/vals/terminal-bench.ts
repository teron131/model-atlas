/**
 * Vals Terminal-Bench scraper helpers.
 *
 * This benchmark-specific page is scraped separately because it contributes Terminal-Bench task stats and harness context outside the Artificial Analysis main model table.
 */

import { normalizeModelToken } from "../../shared";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../../utils";
import { htmlAttribute, stringValue } from "../parsing";

const DEFAULT_LEADERBOARD_URL =
	"https://www.vals.ai/benchmarks/terminal-bench-2-1";
const DEFAULT_TIMEOUT_MS = 30_000;
const OVERALL_TASK_KEY = "overall";

export type TerminalBenchValsScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type TerminalBenchValsMetadata = {
	benchmark: string | null;
	slug: string | null;
	version: string | null;
	updated: string | null;
	dataset_type: string | null;
	industry: string | null;
	task_labels: Record<string, string>;
};

export type TerminalBenchValsTaskRow = {
	task: string;
	task_label: string;
	raw_model_id: string;
	model_id: string;
	model: string;
	provider: string | null;
	harness: string | null;
	score: number;
	cost_per_task_usd: number | null;
	seconds_per_task: number | null;
};

export type TerminalBenchValsModelHarnessRow = TerminalBenchValsTaskRow & {
	task: "overall";
};

export type TerminalBenchValsByModelName = Map<
	string,
	TerminalBenchValsModelHarnessRow[]
>;

export type TerminalBenchValsParsedPage = {
	metadata: TerminalBenchValsMetadata | null;
	task_rows: TerminalBenchValsTaskRow[];
	model_scores: TerminalBenchValsModelHarnessRow[];
};

export type TerminalBenchValsPayload = TerminalBenchValsParsedPage & {
	fetched_at_epoch_seconds: number | null;
};

function decodeAstroProps(value: string): unknown {
	return JSON.parse(value);
}

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
	return props == null ? null : reviveAstroValue(decodeAstroProps(props));
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

function terminalBenchValsMetadata(value: unknown): TerminalBenchValsMetadata {
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

function modelSlug(modelId: string): string {
	return modelId.split("/").at(-1) ?? modelId;
}

const MODEL_ID_SUFFIX_BY_HARNESS = new Map([
	["Claude Code", "claude-code"],
	["Codex", "codex"],
	["Factory", "factory"],
]);

function normalizedModelId(
	rawModelId: string,
	harness: string | null,
	modelIds: ReadonlySet<string>,
): string {
	const suffix =
		harness == null ? null : MODEL_ID_SUFFIX_BY_HARNESS.get(harness);
	if (suffix == null) {
		return rawModelId;
	}
	const [provider, ...slugParts] = rawModelId.split("/");
	const slug = slugParts.join("/");
	if (provider == null || !slug.endsWith(`-${suffix}`)) {
		return rawModelId;
	}
	const baseModelId = `${provider}/${slug.slice(0, -suffix.length - 1)}`;
	return modelIds.has(baseModelId) ? baseModelId : rawModelId;
}

function nonNegativeNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number >= 0 ? number : null;
}

function positiveNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number > 0 ? number : null;
}

function terminalBenchValsTaskRow(
	task: string,
	taskLabel: string,
	rawModelId: string,
	value: unknown,
	modelIds: ReadonlySet<string>,
): TerminalBenchValsTaskRow | null {
	const row = asRecord(value);
	const score = percentToUnitScore(row.accuracy);
	if (score == null || rawModelId.length === 0) {
		return null;
	}
	const harness = stringValue(row.harness);
	const modelId = normalizedModelId(rawModelId, harness, modelIds);
	return {
		task,
		task_label: taskLabel,
		raw_model_id: rawModelId,
		model_id: modelId,
		model: modelSlug(modelId),
		provider: stringValue(row.provider),
		harness,
		score,
		cost_per_task_usd: nonNegativeNumber(row.cost_per_test),
		seconds_per_task: positiveNumber(row.latency),
	};
}

function isOverallRow(
	row: TerminalBenchValsTaskRow,
): row is TerminalBenchValsModelHarnessRow {
	return row.task === OVERALL_TASK_KEY;
}

function sortTerminalBenchValsRows<T extends TerminalBenchValsTaskRow>(
	rows: T[],
): T[] {
	return [...rows].sort(
		(left, right) =>
			right.score - left.score ||
			left.task.localeCompare(right.task) ||
			(left.harness ?? "").localeCompare(right.harness ?? "") ||
			left.model_id.localeCompare(right.model_id),
	);
}

export function processTerminalBenchValsPageHtml(
	pageHtml: string,
): TerminalBenchValsParsedPage {
	const props = asRecord(benchmarkViewProps(pageHtml));
	const benchmarkView = asRecord(props.benchmarkView);
	const view = asRecord(benchmarkView.default);
	const metadataRecord = asRecord(view.metadata);
	const metadata =
		Object.keys(metadataRecord).length === 0
			? null
			: terminalBenchValsMetadata(metadataRecord);
	const taskLabels = metadata?.task_labels ?? {};
	const tasks = asRecord(view.tasks);
	const taskRows: TerminalBenchValsTaskRow[] = [];
	for (const [task, taskValue] of Object.entries(tasks)) {
		const taskLabel = taskLabels[task] ?? task;
		const taskModels = asRecord(taskValue);
		const taskModelIds = new Set(Object.keys(taskModels));
		for (const [rawModelId, rowValue] of Object.entries(taskModels)) {
			const row = terminalBenchValsTaskRow(
				task,
				taskLabel,
				rawModelId,
				rowValue,
				taskModelIds,
			);
			if (row != null) {
				taskRows.push(row);
			}
		}
	}
	const sortedTaskRows = sortTerminalBenchValsRows(taskRows);
	return {
		metadata,
		task_rows: sortedTaskRows,
		model_scores: sortTerminalBenchValsRows(
			sortedTaskRows.filter(isOverallRow),
		),
	};
}

function modelKeyCandidates(row: TerminalBenchValsModelHarnessRow): string[] {
	const slug = modelSlug(row.model_id);
	return [row.model_id, row.raw_model_id, row.model, slug]
		.map(normalizeModelToken)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

export function buildTerminalBenchValsMap(
	rows: TerminalBenchValsModelHarnessRow[],
): TerminalBenchValsByModelName {
	const rowsByModelName: TerminalBenchValsByModelName = new Map();
	for (const row of rows) {
		for (const key of modelKeyCandidates(row)) {
			const existingRows = rowsByModelName.get(key) ?? [];
			existingRows.push(row);
			rowsByModelName.set(key, existingRows);
		}
	}
	return rowsByModelName;
}

export function findTerminalBenchValsRows(
	candidateNames: unknown[],
	rowsByModelName: TerminalBenchValsByModelName,
): TerminalBenchValsModelHarnessRow[] {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const rows = rowsByModelName.get(normalizeModelToken(candidateName));
		if (rows != null) {
			return rows;
		}
	}
	return [];
}

export async function getTerminalBenchValsStats(
	options: TerminalBenchValsScraperOptions = {},
): Promise<TerminalBenchValsPayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Vals Terminal-Bench scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			...processTerminalBenchValsPageHtml(await response.text()),
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
