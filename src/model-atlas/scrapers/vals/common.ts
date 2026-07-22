/**
 * Hydrated BenchmarkView data is scraped from VALS benchmark pages.
 *
 * Page source: https://www.vals.ai/benchmarks
 */

import { canonicalReasoningEffort } from "../../identity/normalization";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../../runtime";
import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../benchmark-score";
import { htmlAttribute, stringValue } from "../parsing";

const DEFAULT_TIMEOUT_MS = 30_000;

type ValsScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type ValsBenchmarkMetadata = {
	dataset_type: string | null;
	industry: string | null;
	mode: string | null;
	runner: string | null;
	task_labels: Record<string, string>;
	updated: string | null;
	version: string | null;
};

export type ValsBenchmarkView = {
	metadata: ValsBenchmarkMetadata;
	tasks: Record<string, Record<string, Record<string, unknown>>>;
};

export type ValsBenchmarkDefinition = {
	benchmarkKey: string;
	canonicalTask: string;
	includeReasoningEffortInModel?: boolean;
	isScoreEligible?: (task: string, modelId: string) => boolean;
	sourceUrl: string;
};

function reviveAstroValue(value: unknown): unknown {
	if (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "number"
	) {
		if (value[0] === 0) return reviveAstroValue(value[1]);
		if (value[0] === 1) {
			return Array.isArray(value[1])
				? value[1].map((item) => reviveAstroValue(item))
				: [];
		}
	}
	if (Array.isArray(value)) return value.map((item) => reviveAstroValue(item));
	if (value != null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, reviveAstroValue(item)]),
		);
	}
	return value;
}

function taskLabels(value: unknown): Record<string, string> {
	return Object.fromEntries(
		Object.entries(asRecord(value)).flatMap(([task, label]) =>
			typeof label === "string" && label.length > 0 ? [[task, label]] : [],
		),
	);
}

function metadataFromValue(value: unknown): ValsBenchmarkMetadata {
	const metadata = asRecord(value);
	return {
		dataset_type: stringValue(metadata.dataset_type),
		industry: stringValue(metadata.industry),
		mode: stringValue(metadata.mode),
		runner: stringValue(metadata.runner),
		task_labels: taskLabels(metadata.tasks),
		updated: stringValue(metadata.updated),
		version: stringValue(metadata.version),
	};
}

/** Decode one VALS BenchmarkView island without letting malformed hydration abort a refresh. */
function parseValsBenchmarkView(pageHtml: string): ValsBenchmarkView | null {
	try {
		const island = pageHtml.match(
			/<astro-island\b(?=[^>]*component-url="\/_astro\/BenchmarkView[^"]*")[^>]*>/,
		)?.[0];
		const props = island == null ? null : htmlAttribute(island, "props");
		if (props == null) return null;
		const decoded = asRecord(reviveAstroValue(JSON.parse(props)));
		const view = asRecord(asRecord(decoded.benchmarkView).default);
		const metadataValue = asRecord(view.metadata);
		if (Object.keys(metadataValue).length === 0) return null;
		const tasks = Object.fromEntries(
			Object.entries(asRecord(view.tasks)).map(([task, taskValue]) => [
				task,
				Object.fromEntries(
					Object.entries(asRecord(taskValue)).map(([modelId, row]) => [
						modelId,
						asRecord(row),
					]),
				),
			]),
		);
		return { metadata: metadataFromValue(metadataValue), tasks };
	} catch {
		return null;
	}
}

function percentScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	return score != null && score >= 0 && score <= 100
		? Number((score / 100).toFixed(6))
		: null;
}

function nonNegativeNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number >= 0 ? number : null;
}

function jsonString(value: unknown): string | null {
	if (value == null) return null;
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

function modelSlug(modelId: string): string {
	return modelId.split("/").at(-1) ?? modelId;
}

function scoreRow(
	definition: ValsBenchmarkDefinition,
	view: ValsBenchmarkView,
	task: string,
	modelId: string,
	value: Record<string, unknown>,
): BenchmarkScoreRow | null {
	const score = percentScore(value.accuracy);
	if (score == null || modelId.length === 0) return null;
	const baseModel = modelSlug(modelId);
	const reasoningEffort = canonicalReasoningEffort(
		value.reasoning_effort ?? value.compute_effort,
	);
	return {
		benchmark_key: definition.benchmarkKey,
		source: "vals",
		source_url: definition.sourceUrl,
		model_id: modelId,
		model:
			reasoningEffort == null ||
			definition.includeReasoningEffortInModel === false
				? baseModel
				: `${baseModel} (${reasoningEffort})`,
		base_model: baseModel,
		reasoning_effort: reasoningEffort,
		provider: stringValue(value.provider),
		rank: null,
		score,
		score_eligible:
			task === definition.canonicalTask &&
			(definition.isScoreEligible?.(task, modelId) ?? true),
		standard_error: nonNegativeNumber(value.stderr),
		confidence_low: null,
		confidence_high: null,
		observed_at: view.metadata.updated,
		metadata: {
			task,
			task_label: view.metadata.task_labels[task] ?? task,
			benchmark_version: view.metadata.version,
			benchmark_updated: view.metadata.updated,
			dataset_type: view.metadata.dataset_type,
			industry: view.metadata.industry,
			runner: view.metadata.runner,
			mode: view.metadata.mode,
			cost_per_test_usd: nonNegativeNumber(value.cost_per_test),
			latency_seconds: nonNegativeNumber(value.latency),
			temperature: nonNegativeNumber(value.temperature),
			top_p: nonNegativeNumber(value.top_p),
			max_output_tokens: nonNegativeNumber(value.max_output_tokens),
			reasoning: stringValue(value.reasoning) ?? jsonString(value.reasoning),
			verbosity: stringValue(value.verbosity),
			compute_effort: stringValue(value.compute_effort),
			harness: stringValue(value.harness),
			task_results: jsonString(value.task_results),
			usage: jsonString(value.usage),
		},
	};
}

/** Preserve every valid task row while marking only the source-specific canonical task eligible. */
export function processValsBenchmarkPageHtml(
	pageHtml: string,
	definition: ValsBenchmarkDefinition,
): BenchmarkScoreRow[] {
	const view = parseValsBenchmarkView(pageHtml);
	if (view == null) return [];
	return Object.entries(view.tasks).flatMap(([task, models]) =>
		Object.entries(models)
			.flatMap(([modelId, value]) => {
				const row = scoreRow(definition, view, task, modelId, value);
				return row == null ? [] : [row];
			})
			.sort(
				(left, right) =>
					right.score - left.score ||
					(left.model_id ?? "").localeCompare(right.model_id ?? ""),
			)
			.map((row, index) => ({ ...row, rank: index + 1 })),
	);
}

/** Fetch one VALS source independently and fail quietly to an empty evidence payload. */
export async function getValsSourceStats(
	definition: ValsBenchmarkDefinition,
	options: ValsScraperOptions = {},
): Promise<BenchmarkScorePayload> {
	try {
		const response = await fetchWithTimeout(
			options.url ?? definition.sourceUrl,
			{},
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok) return { fetched_at_epoch_seconds: null, data: [] };
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processValsBenchmarkPageHtml(await response.text(), definition),
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
