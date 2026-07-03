/**
 * Vals Index benchmark page scraper helpers.
 *
 * Page source: https://www.vals.ai/benchmarks/vals_index
 */

import { normalizeModelToken } from "../../shared";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../../utils";
import { htmlAttribute, stringValue } from "../parsing";

const DEFAULT_LEADERBOARD_URL = "https://www.vals.ai/benchmarks/vals_index";
const DEFAULT_TIMEOUT_MS = 30_000;
const OVERALL_TASK_KEY = "overall";

export type ValsIndexScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type ValsIndexMetadata = {
	benchmark: string | null;
	slug: string | null;
	version: string | null;
	updated: string | null;
	dataset_type: string | null;
	industry: string | null;
	task_labels: Record<string, string>;
};

export type ValsIndexTaskScoreRow = {
	task: string;
	task_label: string;
	model_id: string;
	model: string;
	provider: string | null;
	score: number;
};

export type ValsIndexModelScoreRow = ValsIndexTaskScoreRow & {
	task: "overall";
};

export type ValsIndexScoreByModelName = Map<string, ValsIndexModelScoreRow>;

export type ValsIndexParsedPage = {
	metadata: ValsIndexMetadata | null;
	task_rows: ValsIndexTaskScoreRow[];
	model_scores: ValsIndexModelScoreRow[];
};

export type ValsIndexModelScorePayload = ValsIndexParsedPage & {
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
	if (props == null) {
		return null;
	}
	return reviveAstroValue(decodeAstroProps(props));
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

function valsIndexMetadata(value: unknown): ValsIndexMetadata {
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

function valsIndexTaskScoreRow(
	task: string,
	taskLabel: string,
	modelId: string,
	value: unknown,
): ValsIndexTaskScoreRow | null {
	const row = asRecord(value);
	const score = percentToUnitScore(row.accuracy);
	if (score == null || modelId.length === 0) {
		return null;
	}
	return {
		task,
		task_label: taskLabel,
		model_id: modelId,
		model: modelSlug(modelId),
		provider: stringValue(row.provider),
		score,
	};
}

function isOverallRow(
	row: ValsIndexTaskScoreRow,
): row is ValsIndexModelScoreRow {
	return row.task === OVERALL_TASK_KEY;
}

function sortValsIndexRows<T extends ValsIndexTaskScoreRow>(rows: T[]): T[] {
	return [...rows].sort(
		(left, right) =>
			right.score - left.score ||
			left.task.localeCompare(right.task) ||
			left.model_id.localeCompare(right.model_id),
	);
}

export function processValsIndexPageHtml(
	pageHtml: string,
): ValsIndexParsedPage {
	const props = asRecord(benchmarkViewProps(pageHtml));
	const benchmarkView = asRecord(props.benchmarkView);
	const view = asRecord(benchmarkView.default);
	const metadataRecord = asRecord(view.metadata);
	const metadata =
		Object.keys(metadataRecord).length === 0
			? null
			: valsIndexMetadata(metadataRecord);
	const taskLabels = metadata?.task_labels ?? {};
	const tasks = asRecord(view.tasks);
	const taskRows: ValsIndexTaskScoreRow[] = [];
	for (const [task, taskValue] of Object.entries(tasks)) {
		const taskLabel = taskLabels[task] ?? task;
		for (const [modelId, rowValue] of Object.entries(asRecord(taskValue))) {
			const row = valsIndexTaskScoreRow(task, taskLabel, modelId, rowValue);
			if (row != null) {
				taskRows.push(row);
			}
		}
	}
	const sortedTaskRows = sortValsIndexRows(taskRows);
	return {
		metadata,
		task_rows: sortedTaskRows,
		model_scores: sortValsIndexRows(sortedTaskRows.filter(isOverallRow)),
	};
}

function modelKeyCandidates(row: ValsIndexModelScoreRow): string[] {
	const slug = modelSlug(row.model_id);
	return [row.model_id, row.model, slug]
		.map(normalizeModelToken)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

export function buildValsIndexMap(
	rows: ValsIndexModelScoreRow[],
): ValsIndexScoreByModelName {
	const scoreByModelName: ValsIndexScoreByModelName = new Map();
	for (const row of rows) {
		for (const key of modelKeyCandidates(row)) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

export function findValsIndexScore(
	candidateNames: unknown[],
	valsIndexScoreByModelName: ValsIndexScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = valsIndexScoreByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

export async function getValsIndexStats(
	options: ValsIndexScraperOptions = {},
): Promise<ValsIndexModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Vals Index scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			...processValsIndexPageHtml(await response.text()),
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
