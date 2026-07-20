/**
 * ProofBench scraper owns Vals AI leaderboard extraction and verified-proof score normalization.
 *
 * Page source: https://epoch.ai/benchmarks/proofbench?tab=leaderboard
 * HTML source: https://www.vals.ai/benchmarks/proof_bench
 * Epoch CSV fallback: https://epoch.ai/data/benchmark_data.zip#proofbench_external.csv
 */

import { canonicalReasoningEffort } from "../../shared";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../../utils";
import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../benchmark-score";
import { htmlAttribute, stringValue } from "../parsing";

const PROOFBENCH_URL = "https://www.vals.ai/benchmarks/proof_bench";
const DEFAULT_TIMEOUT_MS = 30_000;

function reviveAstroValue(value: unknown): unknown {
	if (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "number"
	) {
		if (value[0] === 0) return reviveAstroValue(value[1]);
		if (value[0] === 1)
			return Array.isArray(value[1]) ? value[1].map(reviveAstroValue) : [];
	}
	if (Array.isArray(value)) return value.map(reviveAstroValue);
	if (value != null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, reviveAstroValue(item)]),
		);
	}
	return value;
}

function benchmarkView(pageHtml: string): Record<string, unknown> {
	const island = pageHtml.match(
		/<astro-island\b(?=[^>]*component-url="\/_astro\/BenchmarkView[^"]*")[^>]*>/,
	)?.[0];
	const props = island == null ? null : htmlAttribute(island, "props");
	if (props == null) return {};
	try {
		const decoded = asRecord(reviveAstroValue(JSON.parse(props)));
		return asRecord(asRecord(decoded.benchmarkView).default);
	} catch {
		return {};
	}
}

function percentScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	return score != null && score >= 0 && score <= 100
		? Number((score / 100).toFixed(6))
		: null;
}

export function processProofBenchPageHtml(
	pageHtml: string,
): BenchmarkScoreRow[] {
	const view = benchmarkView(pageHtml);
	const metadata = asRecord(view.metadata);
	const overall = asRecord(asRecord(view.tasks).overall);
	return Object.entries(overall)
		.flatMap(([modelId, value]) => {
			const row = asRecord(value);
			const score = percentScore(row.accuracy);
			if (score == null) return [];
			const model = modelId.split("/").at(-1) ?? modelId;
			const reasoningEffort = canonicalReasoningEffort(
				row.reasoning_effort ?? row.compute_effort,
			);
			return [
				{
					benchmark_key: "proofbench",
					source: "vals" as const,
					source_url: PROOFBENCH_URL,
					model_id: modelId,
					model,
					base_model: model,
					reasoning_effort: reasoningEffort,
					provider: stringValue(row.provider),
					rank: null,
					score,
					score_eligible: modelId.toLowerCase() !== "aristotle/aristotle",
					standard_error: asFiniteNumber(row.stderr),
					confidence_low: null,
					confidence_high: null,
					observed_at: stringValue(metadata.updated),
					metadata: {
						benchmark_version: stringValue(metadata.version),
						dataset_type: stringValue(metadata.dataset_type),
						latency_seconds: asFiniteNumber(row.latency),
						cost_per_test_usd: asFiniteNumber(row.cost_per_test),
						temperature: asFiniteNumber(row.temperature),
						top_p: asFiniteNumber(row.top_p),
						max_output_tokens: asFiniteNumber(row.max_output_tokens),
						harness: stringValue(row.harness),
						compute_effort: stringValue(row.compute_effort),
					},
				},
			];
		})
		.sort(
			(left, right) =>
				right.score - left.score || left.model.localeCompare(right.model),
		)
		.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getProofBenchStats(): Promise<BenchmarkScorePayload> {
	try {
		const response = await fetchWithTimeout(
			PROOFBENCH_URL,
			{},
			DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok)
			throw new Error(`ProofBench scrape failed: ${response.status}`);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processProofBenchPageHtml(await response.text()),
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
