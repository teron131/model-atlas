/**
 * AutomationBench leaderboard scraper helpers.
 *
 * Page source: https://zapier.com/benchmarks
 */
import { medianOfFinite } from "../../math-utils";
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";
import { htmlTextLines } from "./parsing";

const DEFAULT_LEADERBOARD_URL = "https://zapier.com/benchmarks";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_START = "Leaderboard";
const DOMAIN_START = "By domain";
const DOMAIN_END_PREFIX = "Try the latest models in Zapier";
const REASONING_EFFORT_RANKS: Readonly<Record<string, number>> = {
	low: 1,
	medium: 2,
	high: 3,
	xhigh: 4,
	max: 5,
};

export type AutomationBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type AutomationBenchOverallRow = {
	model: string;
	reasoning_effort: string | null;
	score: number;
	cost_per_task_usd: number;
};

export type AutomationBenchModelScoreRow = AutomationBenchOverallRow & {
	domain_lead_scores: number[];
	domain_lead_score_median: number | null;
	adjusted_score: number;
};

export type AutomationBenchDomainModel = {
	model: string;
	reasoning_effort: string | null;
	provider: string | null;
};

export type AutomationBenchDomainRow = {
	domain: string;
	top_model: string;
	top_reasoning_effort: string | null;
	top_provider: string | null;
	score: number;
	second_place_models: AutomationBenchDomainModel[];
	second_place_score: number | null;
	second_place_tie: boolean;
	second_place_raw: string;
};

export type AutomationBenchScoreByModelName = Map<
	string,
	AutomationBenchModelScoreRow
>;

export type AutomationBenchLeaderboardPayload = {
	fetched_at_epoch_seconds: number | null;
	overall: AutomationBenchOverallRow[];
	domains: AutomationBenchDomainRow[];
	model_scores: AutomationBenchModelScoreRow[];
};

/** Converts AutomationBench percentage strings onto the 0-1 scoring scale. */
function parseScorePercent(value: string): number {
	return Number((Number(value) / 100).toFixed(6));
}

/** Parses per-task dollar amounts with stable decimal precision. */
function parseMoney(value: string): number {
	return Number(Number(value).toFixed(6));
}

/** Applies the bounded domain-leadership lift to a leaderboard score. */
function adjustedScore(
	leaderboardScore: number,
	domainLeadScoreMedian: number | null,
): number {
	const domainLift =
		domainLeadScoreMedian == null
			? 0
			: Math.max(0, domainLeadScoreMedian - leaderboardScore) * 0.25;
	return Number((leaderboardScore + domainLift).toFixed(6));
}

/** Extracts a trailing reasoning-effort label from the model name. */
function parseReasoningEffort(model: string): string | null {
	const match = model.match(/\(([^()]+)\)\s*$/);
	return match?.[1]?.trim() ?? null;
}

/** Removes reasoning-effort suffixes from AutomationBench model names. */
function baseModelName(model: string): string {
	return model.replace(/\s*\([^()]+\)\s*$/, "").trim();
}

/** Builds lookup aliases for model labels that drift across sources. */
function normalizedModelAliases(model: string): string[] {
	const aliases = new Set<string>();
	/** Adds a non-empty normalized alias plus common version variants. */
	const addAlias = (value: string) => {
		const key = normalizeModelToken(value);
		if (key.length > 0) {
			aliases.add(key);
			const noTrailingZeroVersion = key.replace(/(\d+)-0\b/g, "$1");
			if (noTrailingZeroVersion.length > 0) {
				aliases.add(noTrailingZeroVersion);
			}
		}
	};
	addAlias(model);
	for (const key of [...aliases]) {
		if (key.startsWith("fable-")) {
			aliases.add(`claude-${key}`);
		}
		if (key.startsWith("claude-fable-")) {
			aliases.add(key.replace(/^claude-/, ""));
		}
	}
	return [...aliases];
}

/** Orders duplicate rows by preferred reasoning-effort tier. */
function reasoningEffortRank(row: AutomationBenchModelScoreRow): number {
	const key = row.reasoning_effort?.toLowerCase().replace(/[^a-z0-9]+/g, "");
	return key == null ? 0 : (REASONING_EFFORT_RANKS[key] ?? 0);
}

/** Chooses the stronger duplicate AutomationBench score row. */
function prefersAutomationBenchRow(
	existing: AutomationBenchModelScoreRow | undefined,
	row: AutomationBenchModelScoreRow,
	preferHigherEffort: boolean,
): boolean {
	if (existing == null) {
		return true;
	}
	if (preferHigherEffort) {
		const existingRank = reasoningEffortRank(existing);
		const rowRank = reasoningEffortRank(row);
		if (existingRank !== rowRank) {
			return rowRank > existingRank;
		}
	}
	return row.adjusted_score > existing.adjusted_score;
}

/** Stores preferred score row for AutomationBench scraping. */
function setPreferredScoreRow(
	scoreByModelName: AutomationBenchScoreByModelName,
	key: string,
	row: AutomationBenchModelScoreRow,
	preferHigherEffort: boolean,
): void {
	const existing = scoreByModelName.get(key);
	if (prefersAutomationBenchRow(existing, row, preferHigherEffort)) {
		scoreByModelName.set(key, row);
	}
}

/** Returns page-text lines inside a labeled AutomationBench section. */
function linesBetween(
	lines: string[],
	startMarker: string,
	endMarker: string | null,
): string[] {
	const startIndex = lines.indexOf(startMarker);
	if (startIndex === -1) {
		return [];
	}
	const bodyStart = startIndex + 1;
	const endIndex =
		endMarker == null
			? -1
			: lines.findIndex(
					(line, index) => index >= bodyStart && line === endMarker,
				);
	return endIndex === -1
		? lines.slice(bodyStart)
		: lines.slice(bodyStart, endIndex);
}

/** Parse the public top-10 AutomationBench leaderboard rows from page text. */
export function processAutomationBenchOverallText(
	leaderboardText: string,
): AutomationBenchOverallRow[] {
	return processAutomationBenchOverallLines(
		leaderboardText
			.split(/\n+/)
			.map((line) => line.replace(/\s+/g, " ").trim())
			.filter((line) => line.length > 0),
	);
}

/** Parse the public top-10 AutomationBench leaderboard rows from table cells. */
export function processAutomationBenchOverallLines(
	lines: string[],
): AutomationBenchOverallRow[] {
	const rows: AutomationBenchOverallRow[] = [];
	const startIndex = lines.findIndex(
		(line, index) =>
			line === "Rank" &&
			lines[index + 1] === "Model" &&
			lines[index + 2] === "Score" &&
			lines[index + 3] === "Cost / task",
	);
	if (startIndex === -1) {
		return [];
	}
	for (let index = startIndex + 4; index + 3 < lines.length; index += 4) {
		const rank = Number(lines[index]);
		const model = lines[index + 1];
		const score = lines[index + 2]?.replace(/%$/, "");
		const cost = lines[index + 3]?.replace(/^\$/, "");
		if (
			model == null ||
			score == null ||
			cost == null ||
			!Number.isInteger(rank)
		) {
			continue;
		}
		rows.push({
			model,
			reasoning_effort: parseReasoningEffort(model),
			score: parseScorePercent(score),
			cost_per_task_usd: parseMoney(cost),
		});
	}
	return rows;
}

/** Splits a domain-table model label into model, effort, and provider fields. */
function splitModelProvider(value: string): AutomationBenchDomainModel {
	const separator = " \u2014 ";
	const separatorIndex = value.lastIndexOf(separator);
	if (separatorIndex === -1) {
		return {
			model: value.trim(),
			reasoning_effort: parseReasoningEffort(value.trim()),
			provider: null,
		};
	}
	const model = value.slice(0, separatorIndex).trim();
	return {
		model,
		reasoning_effort: parseReasoningEffort(model),
		provider: value.slice(separatorIndex + separator.length).trim(),
	};
}

/** Parses second-place domain winners, scores, and tie markers. */
function parseSecondPlace(value: string): {
	models: AutomationBenchDomainModel[];
	score: number | null;
	tie: boolean;
	raw: string;
} {
	const match = value.match(/\((tie at )?(\d+(?:\.\d+)?)%\)\s*$/);
	const modelText = match ? value.slice(0, match.index).trim() : value.trim();
	return {
		models: modelText
			.split(" / ")
			.map((item) => splitModelProvider(item))
			.filter((item) => item.model.length > 0),
		score: match?.[2] == null ? null : parseScorePercent(match[2]),
		tie: match?.[1] != null,
		raw: value.trim(),
	};
}

/** Parse the public AutomationBench domain-winner table rows from page text. */
export function processAutomationBenchDomainText(
	domainText: string,
): AutomationBenchDomainRow[] {
	return processAutomationBenchDomainLines(
		domainText
			.split(/\n+/)
			.map((line) => line.replace(/\s+/g, " ").trim())
			.filter((line) => line.length > 0),
	);
}

/** Parse the public AutomationBench domain-winner table rows from table cells. */
export function processAutomationBenchDomainLines(
	lines: string[],
): AutomationBenchDomainRow[] {
	const rows: AutomationBenchDomainRow[] = [];
	const startIndex = lines.findIndex(
		(line, index) =>
			line === "Domain" &&
			lines[index + 1] === "Top Model" &&
			lines[index + 2] === "Score" &&
			lines[index + 3] === "2nd Place model",
	);
	if (startIndex === -1) {
		return [];
	}
	for (let index = startIndex + 4; index + 3 < lines.length; index += 4) {
		const domain = lines[index];
		const topModelText = lines[index + 1];
		const score = lines[index + 2]?.replace(/%$/, "");
		const secondPlaceText = lines[index + 3];
		if (
			domain == null ||
			topModelText == null ||
			score == null ||
			secondPlaceText == null
		) {
			continue;
		}
		const topModel = splitModelProvider(topModelText);
		const secondPlace = parseSecondPlace(secondPlaceText);
		rows.push({
			domain,
			top_model: topModel.model,
			top_reasoning_effort: topModel.reasoning_effort,
			top_provider: topModel.provider,
			score: parseScorePercent(score),
			second_place_models: secondPlace.models,
			second_place_score: secondPlace.score,
			second_place_tie: secondPlace.tie,
			second_place_raw: secondPlace.raw,
		});
	}
	return rows;
}

/** Collects domain-winning scores by normalized top-model alias. */
function domainLeadScoresByModel(
	rows: AutomationBenchDomainRow[],
): Map<string, number[]> {
	const scoresByModel = new Map<string, number[]>();
	for (const row of rows) {
		const key = normalizeModelToken(row.top_model);
		if (key.length === 0) {
			continue;
		}
		const scores = scoresByModel.get(key) ?? [];
		scores.push(row.score);
		scoresByModel.set(key, scores);
	}
	return scoresByModel;
}

/** Build AutomationBench model scores with a bounded domain-leadership lift. */
export function summarizeAutomationBenchModelScores(
	overallRows: AutomationBenchOverallRow[],
	domainRows: AutomationBenchDomainRow[],
): AutomationBenchModelScoreRow[] {
	const leadScoresByModel = domainLeadScoresByModel(domainRows);
	return overallRows.map((row) => {
		const domainLeadScores =
			leadScoresByModel.get(normalizeModelToken(row.model)) ?? [];
		const domainLeadScoreMedian = medianOfFinite(domainLeadScores);
		return {
			...row,
			domain_lead_scores: domainLeadScores,
			domain_lead_score_median: domainLeadScoreMedian,
			adjusted_score: adjustedScore(row.score, domainLeadScoreMedian),
		};
	});
}

/** Parse AutomationBench leaderboard rows from the rendered page HTML. */
export function processAutomationBenchPageHtml(
	pageHtml: string,
): Pick<
	AutomationBenchLeaderboardPayload,
	"overall" | "domains" | "model_scores"
> {
	const lines = htmlTextLines(pageHtml);
	const overall = processAutomationBenchOverallLines(
		linesBetween(lines, LEADERBOARD_START, DOMAIN_START),
	);
	const domainLines = linesBetween(lines, DOMAIN_START, null);
	const domainEndIndex = domainLines.findIndex((line) =>
		line.startsWith(DOMAIN_END_PREFIX),
	);
	const domains = processAutomationBenchDomainLines(
		domainEndIndex === -1 ? domainLines : domainLines.slice(0, domainEndIndex),
	);
	return {
		overall,
		domains,
		model_scores: summarizeAutomationBenchModelScores(overall, domains),
	};
}

/** Build AutomationBench public top-10 score rows by normalized model name. */
export function buildAutomationBenchMap(
	rows: AutomationBenchModelScoreRow[],
): AutomationBenchScoreByModelName {
	const scoreByModelName: AutomationBenchScoreByModelName = new Map();
	for (const row of rows) {
		for (const key of normalizedModelAliases(row.model)) {
			setPreferredScoreRow(scoreByModelName, key, row, false);
		}
		for (const key of normalizedModelAliases(baseModelName(row.model))) {
			setPreferredScoreRow(scoreByModelName, key, row, true);
		}
	}
	return scoreByModelName;
}

/** Find an AutomationBench public score from model labels that may differ by punctuation. */
export function findAutomationBenchScoreRow(
	candidateNames: unknown[],
	scoreByModelName: AutomationBenchScoreByModelName,
): AutomationBenchModelScoreRow | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		for (const key of normalizedModelAliases(candidateName)) {
			const row = scoreByModelName.get(key);
			if (row) {
				return row;
			}
		}
		for (const key of normalizedModelAliases(baseModelName(candidateName))) {
			const row = scoreByModelName.get(key);
			if (row) {
				return row;
			}
		}
	}
	return null;
}

/** Find an AutomationBench public score from model labels that may differ by punctuation. */
export function findAutomationBenchScore(
	candidateNames: unknown[],
	scoreByModelName: AutomationBenchScoreByModelName,
): number | null {
	return (
		findAutomationBenchScoreRow(candidateNames, scoreByModelName)
			?.adjusted_score ?? null
	);
}

/** Fetch AutomationBench public top-10 and domain-winner leaderboard rows. */
export async function getAutomationBenchStats(
	options: AutomationBenchScraperOptions = {},
): Promise<AutomationBenchLeaderboardPayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`AutomationBench scrape failed: ${response.status}`);
		}
		const rows = processAutomationBenchPageHtml(await response.text());
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			...rows,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			overall: [],
			domains: [],
			model_scores: [],
		};
	}
}
