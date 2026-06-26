/** Surge leaderboard scraping for Model Atlas. */

import {
	htmlAttribute,
	percentToUnitScore,
	providerFromLogoAlt,
	stripHtmlTags,
} from "./parsing";

export type SurgeLeaderboardScoreRow = {
	provider: string | null;
	model: string;
	score: number;
	last_updated: string | null;
};

const LIST_ITEM_PATTERN =
	/<div\b[^>]*\brole\s*=\s*["']listitem["'][\s\S]*?(?=<div\b[^>]*\brole\s*=\s*["']listitem["']|<section\b|$)/gi;
const MODEL_RANKINGS_PATTERN = />\s*Model Rankings\s*</i;

/** Escapes class names before building markup-matching regexes. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extracts visible text from an element with the requested class. */
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

/** Normalizes provider labels for brand/provider comparisons. */
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

/** Splits the leaderboard section into list-item fragments. */
function surgeLeaderboardRows(pageHtml: string): string[] {
	return [...surgeLeaderboardSegment(pageHtml).matchAll(LIST_ITEM_PATTERN)].map(
		(match) => match[0] ?? "",
	);
}

/** Reads the leaderboard's visible last-updated date. */
function surgeLastUpdated(pageHtml: string): string | null {
	const match = pageHtml.match(/Last updated\s+(\d{2}\/\d{2}\/\d{4})/i);
	return match?.[1] ?? null;
}

/** Reads the model name across current and legacy Surge markup. */
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

/** Reads the provider from the row logo alt text. */
function surgeProvider(rowHtml: string): string | null {
	return providerFromLogoAlt(htmlAttribute(rowHtml, "alt"));
}

/** Reads the score percentage from attribute or visible row text. */
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

/** Converts one Surge leaderboard item into a benchmark score row. */
function surgeLeaderboardScoreRow(
	rowHtml: string,
	lastUpdated: string | null,
): SurgeLeaderboardScoreRow | null {
	const model = surgeModelName(rowHtml);
	const score = percentToUnitScore(surgeScorePercent(rowHtml));
	if (model == null || score == null) {
		return null;
	}
	return {
		provider: surgeProvider(rowHtml),
		model,
		score,
		last_updated: lastUpdated,
	};
}

/** Converts Surge leaderboard markup into Model Atlas score rows. */
export function surgeLeaderboardScoreRows(
	pageHtml: string,
): SurgeLeaderboardScoreRow[] {
	const lastUpdated = surgeLastUpdated(pageHtml);
	return surgeLeaderboardRows(pageHtml)
		.map((rowHtml) => surgeLeaderboardScoreRow(rowHtml, lastUpdated))
		.filter((row): row is SurgeLeaderboardScoreRow => row != null);
}
