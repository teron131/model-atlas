/**
 * Mercor APEX-Agents scraper owns embedded leaderboard normalization for Loop Pass@1 scores.
 *
 * Page source: https://www.mercor.com/apex/apex-agents-leaderboard/
 */

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

const DEFAULT_LEADERBOARD_URL =
	"https://www.mercor.com/apex/apex-agents-leaderboard/";
const DEFAULT_TIMEOUT_MS = 30_000;
const RESULT_OBJECT_MARKER = '{"model":{"_id":';
const LOOP_HARNESS = "loop_truncated_tools_agent";
const PASS_METRIC = "pass-1";

export type MercorApexAgentsRow = {
	model_id: string;
	source_model: string;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	organization: string;
	score: number;
};

type MercorApexAgentsPayload = {
	fetched_at_epoch_seconds: number | null;
	data: MercorApexAgentsRow[];
};

export type MercorApexAgentsRowsByModelName = Map<string, MercorApexAgentsRow>;

type MercorApexAgentsOptions = {
	url?: string;
	timeoutMs?: number;
};

function atlasBaseModel(sourceModel: string): string {
	const withoutConfiguration = sourceModel
		.replace(/\s+\([^)]*\)\s*$/, "")
		.trim();
	const providerQualified = /^(?:Opus|Sonnet|Fable)\b/.test(
		withoutConfiguration,
	)
		? `Claude ${withoutConfiguration}`
		: withoutConfiguration;
	return providerQualified.replace(/^GPT\s+(\d)/, "GPT-$1");
}

function mercorEffort(sourceModel: string): string | null {
	const normalized = sourceModel.toLowerCase();
	if (normalized.includes("max + pro")) {
		return "max";
	}
	if (normalized.includes("(thinking)")) {
		return "max";
	}
	return benchmarkModelEffort(sourceModel).reasoningEffort;
}

function mercorModelIdentity(sourceModel: string): {
	model: string;
	baseModel: string;
	reasoningEffort: string | null;
} {
	const reasoningEffort = mercorEffort(sourceModel);
	const baseModel = atlasBaseModel(sourceModel);
	if (sourceModel.toLowerCase().includes("max + pro")) {
		return {
			model: `${baseModel} (Max + Pro)`,
			baseModel: `${baseModel} Pro`,
			reasoningEffort,
		};
	}
	return {
		model:
			reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
		baseModel,
		reasoningEffort,
	};
}

function loopPassScore(value: unknown): number | null {
	const passScore = (Array.isArray(value) ? value : []).find(
		(candidate) => asRecord(candidate).pass === PASS_METRIC,
	);
	const rawHarnessScores = asRecord(passScore).harnessScores;
	const harnessScores: unknown[] = Array.isArray(rawHarnessScores)
		? rawHarnessScores
		: [];
	const harnessScore = harnessScores.find(
		(candidate) => asRecord(candidate).harness === LOOP_HARNESS,
	);
	const row = asRecord(harnessScore);
	const score = asFiniteNumber(row.score);
	return score == null || score < 0 || score > 100
		? null
		: Number((score / 100).toFixed(6));
}

function parseResultRow(value: unknown): MercorApexAgentsRow | null {
	const row = asRecord(value);
	const sourceModel = asRecord(row.model);
	const provider = asRecord(sourceModel.provider);
	const modelId = stringValue(sourceModel.modelId);
	const sourceModelName = stringValue(sourceModel.modelName);
	const organization =
		stringValue(provider.name) ?? stringValue(provider.providerId);
	const loopScore = loopPassScore(row.passScores);
	if (
		modelId == null ||
		sourceModelName == null ||
		organization == null ||
		loopScore == null
	) {
		return null;
	}
	const identity = mercorModelIdentity(sourceModelName);
	return {
		model_id: modelId,
		source_model: sourceModelName,
		model: identity.model,
		base_model: identity.baseModel,
		reasoning_effort: identity.reasoningEffort,
		organization,
		score: loopScore,
	};
}

function parseResultRows(corpus: string): MercorApexAgentsRow[] {
	const rows = new Map<string, MercorApexAgentsRow>();
	for (
		let startIndex = corpus.indexOf(RESULT_OBJECT_MARKER);
		startIndex !== -1;
		startIndex = corpus.indexOf(RESULT_OBJECT_MARKER, startIndex + 1)
	) {
		const endIndex = findObjectEnd(corpus, startIndex);
		if (endIndex === -1) {
			continue;
		}
		const payload = parseFlightJsonObject(
			corpus.slice(startIndex, endIndex + 1),
		);
		const row = payload == null ? null : parseResultRow(payload);
		if (row != null) {
			rows.set(`${row.base_model}\u001f${row.reasoning_effort ?? ""}`, row);
		}
	}
	return [...rows.values()];
}

export function processMercorApexAgentsPageHtml(
	pageHtml: string,
): MercorApexAgentsRow[] {
	return parseResultRows(`${pageHtml}\n${extractNextFlightCorpus(pageHtml)}`);
}

export async function getMercorApexAgentsStats(
	options: MercorApexAgentsOptions = {},
): Promise<MercorApexAgentsPayload> {
	try {
		const response = await fetchWithTimeout(
			options.url ?? DEFAULT_LEADERBOARD_URL,
			{},
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok) {
			throw new Error(`Mercor APEX-Agents scrape failed: ${response.status}`);
		}
		const data = processMercorApexAgentsPageHtml(await response.text());
		return {
			fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
			data,
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
