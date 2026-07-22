/** Shared Surge leaderboard parsing and fetching for benchmark-specific adapters. */

import { benchmarkModelEffort } from "../../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import type {
	BenchmarkObservationPayload,
	BenchmarkObservationRow,
} from "../benchmark-observation";
import {
	htmlAttribute,
	percentToUnitScore,
	providerFromLogoAlt,
	stripHtmlTags,
} from "../parsing";

const DEFAULT_TIMEOUT_MS = 30_000;
const LIST_ITEM_PATTERN =
	/<div\b[^>]*\brole\s*=\s*["']listitem["'][\s\S]*?(?=<div\b[^>]*\brole\s*=\s*["']listitem["']|<section\b|$)/gi;
const MODEL_RANKINGS_PATTERN = />\s*Model Rankings\s*</i;

type SurgeLeaderboardScoreRow = {
	provider: string | null;
	model: string;
	score: number;
	last_updated: string | null;
};

type SurgeLeaderboardObservation = SurgeLeaderboardScoreRow & {
	reportedValue: number;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classText(html: string, className: string): string | null {
	const classPattern = escapeRegExp(className);
	const match = html.match(
		new RegExp(
			`<[^>]*class\\s*=\\s*["'](?:[^"']*\\s)?${classPattern}(?:\\s[^"']*)?["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
			"i",
		),
	);
	const text = match == null ? null : stripHtmlTags(match[1] ?? "");
	return text != null && text.length > 0 ? text : null;
}

function normalizedLabel(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Combines brand and model text without duplicating provider names. */
function combinedModelName(
	brand: string | null,
	name: string | null,
	provider: string | null,
): string | null {
	if (name == null || name.length === 0) {
		return null;
	}
	if (brand == null || brand.length === 0) {
		return name;
	}
	if (
		provider != null &&
		normalizedLabel(provider) === normalizedLabel(brand)
	) {
		return name;
	}
	return name.toLowerCase().startsWith(brand.toLowerCase())
		? name
		: `${brand} ${name}`;
}

/** Limits parsing to the Model Rankings section when present. */
function surgeLeaderboardSegment(pageHtml: string): string {
	const markerMatch = pageHtml.match(MODEL_RANKINGS_PATTERN);
	const start = markerMatch?.index ?? -1;
	if (start === -1) {
		return pageHtml;
	}
	const nextSectionStart = pageHtml.indexOf("<section", start + 1);
	return nextSectionStart === -1
		? pageHtml.slice(start)
		: pageHtml.slice(start, nextSectionStart);
}

function surgeLeaderboardRows(pageHtml: string): string[] {
	return [...surgeLeaderboardSegment(pageHtml).matchAll(LIST_ITEM_PATTERN)].map(
		(match) => match[0] ?? "",
	);
}

function surgeLastUpdated(pageHtml: string): string | null {
	const match = stripHtmlTags(pageHtml).match(
		/Last updated\s+(\d{2}\/\d{2}\/\d{4})/i,
	);
	return match?.[1] ?? null;
}

function surgeModelName(rowHtml: string): string | null {
	const legacyModel = classText(rowHtml, "corecraft-model");
	if (legacyModel != null) {
		return legacyModel;
	}
	return combinedModelName(
		classText(rowHtml, "head-rank-table-brand"),
		classText(rowHtml, "head-rank-table-name"),
		surgeProvider(rowHtml),
	);
}

function surgeProvider(rowHtml: string): string | null {
	return providerFromLogoAlt(htmlAttribute(rowHtml, "alt"));
}

function surgeScorePercent(rowHtml: string): string | null {
	const attributeScore = htmlAttribute(rowHtml, "data-score");
	if (attributeScore != null && attributeScore.length > 0) {
		return attributeScore;
	}
	const scoreMatch = rowHtml.match(
		/<div[^>]*(?:data-score|fs-list-field\s*=\s*["']foundational-score["'])[^>]*>([\s\S]*?)<\/div>/i,
	);
	const score = scoreMatch == null ? null : stripHtmlTags(scoreMatch[1] ?? "");
	return score != null && score.length > 0 ? score : null;
}

function surgeLeaderboardScoreRow(
	rowHtml: string,
	lastUpdated: string | null,
): SurgeLeaderboardObservation | null {
	const model = surgeModelName(rowHtml);
	const reportedValue = Number(surgeScorePercent(rowHtml));
	const canonicalValue = percentToUnitScore(surgeScorePercent(rowHtml));
	if (
		model == null ||
		!Number.isFinite(reportedValue) ||
		canonicalValue == null
	) {
		return null;
	}
	return {
		provider: surgeProvider(rowHtml),
		model,
		reportedValue,
		score: canonicalValue,
		last_updated: lastUpdated,
	};
}

export function surgeLeaderboardScoreRows(
	pageHtml: string,
): SurgeLeaderboardScoreRow[] {
	const lastUpdated = surgeLastUpdated(pageHtml);
	return surgeLeaderboardRows(pageHtml)
		.map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated))
		.filter((row): row is SurgeLeaderboardObservation => row != null)
		.map(({ reportedValue: _, ...row }) => row);
}

export function processSurgeBenchmarkPageHtml(
	pageHtml: string,
	benchmarkKey: string,
	sourceUrl: string,
): BenchmarkObservationRow[] {
	const lastUpdated = surgeLastUpdated(pageHtml);
	return surgeLeaderboardRows(pageHtml)
		.map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated))
		.filter((row): row is SurgeLeaderboardObservation => row != null)
		.map((row, index) => {
			const parsed = benchmarkModelEffort(row.model);
			return {
				benchmark_key: benchmarkKey,
				source_url: sourceUrl,
				model_id: null,
				model: row.model,
				base_model: parsed.baseModel,
				reasoning_effort: parsed.reasoningEffort,
				model_creator_id: null,
				model_creator: row.provider,
				inference_provider: null,
				rank: index + 1,
				reported_value: row.reportedValue,
				reported_unit: "percent",
				canonical_value: row.score,
				canonical_unit: "proportion",
				score_eligible: true,
				standard_error: null,
				confidence_low: null,
				confidence_high: null,
				observed_at: row.last_updated ?? null,
				metadata: {},
			};
		});
}

export async function getSurgeLeaderboardStats(
	benchmarkKey: string,
	sourceUrl: string,
): Promise<BenchmarkObservationPayload> {
	try {
		const response = await fetchWithTimeout(sourceUrl, {}, DEFAULT_TIMEOUT_MS);
		if (!response.ok)
			throw new Error(
				`Surge ${benchmarkKey} scrape failed: ${response.status}`,
			);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processSurgeBenchmarkPageHtml(
				await response.text(),
				benchmarkKey,
				sourceUrl,
			),
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
