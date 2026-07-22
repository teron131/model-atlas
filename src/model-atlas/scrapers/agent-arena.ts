/** Agent Arena scraper extracts the ranked model identity and causal effect used by Model Atlas. */

import { benchmarkModelEffort } from "../identity/normalization";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../runtime";
import {
	extractNextFlightCorpus,
	findObjectEnd,
	parseFlightJsonObject,
	stringValue,
} from "./parsing";

const DEFAULT_LEADERBOARD_URL = "https://arena.ai/leaderboard/agent";
const DEFAULT_TIMEOUT_MS = 30_000;
const AGENT_ARENA_OBJECT_MARKER = '{"arena":{"slug":"agent"';

export type AgentArenaModelScoreRow = {
	rank: number;
	contender_name: string;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	organization: string;
	score: number;
};

export type AgentArenaRowsByModelName = Map<string, AgentArenaModelScoreRow>;

type AgentArenaPayload = {
	fetched_at_epoch_seconds: number | null;
	data: AgentArenaModelScoreRow[];
};

type AgentArenaScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

function integerValue(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && Number.isInteger(number) ? number : null;
}

function agentArenaRow(value: unknown): AgentArenaModelScoreRow | null {
	const row = asRecord(value);
	const avgScore = asRecord(row.avgScore);
	const rank = integerValue(row.rank);
	const contenderName = stringValue(row.contenderName);
	const model = stringValue(row.model);
	const organization = stringValue(row.modelOrganization);
	const score = asFiniteNumber(avgScore.value);
	if (
		rank == null ||
		contenderName == null ||
		model == null ||
		organization == null ||
		score == null
	) {
		return null;
	}
	const { baseModel, reasoningEffort } = benchmarkModelEffort(model);
	return {
		rank,
		contender_name: contenderName,
		model,
		base_model: baseModel,
		reasoning_effort: reasoningEffort,
		organization,
		score,
	};
}

export function processAgentArenaPageHtml(
	pageHtml: string,
): AgentArenaModelScoreRow[] {
	const corpus = extractNextFlightCorpus(pageHtml);
	for (
		let startIndex = corpus.indexOf(AGENT_ARENA_OBJECT_MARKER);
		startIndex !== -1;
		startIndex = corpus.indexOf(AGENT_ARENA_OBJECT_MARKER, startIndex + 1)
	) {
		const endIndex = findObjectEnd(corpus, startIndex);
		if (endIndex === -1) {
			continue;
		}
		const payload = parseFlightJsonObject(
			corpus.slice(startIndex, endIndex + 1),
		);
		if (payload == null) {
			continue;
		}
		const snapshot = asRecord(payload.snapshot);
		const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
		const parsedRows = rows.flatMap((row) => {
			const parsed = agentArenaRow(row);
			return parsed == null ? [] : [parsed];
		});
		if (parsedRows.length > 0) {
			return parsedRows;
		}
	}
	return [];
}

export async function getAgentArenaStats(
	options: AgentArenaScraperOptions = {},
): Promise<AgentArenaPayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const response = await fetchWithTimeout(
			url,
			{},
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok) {
			throw new Error(`Agent Arena scrape failed: ${response.status}`);
		}
		const data = processAgentArenaPageHtml(await response.text());
		return {
			fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
			data,
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
