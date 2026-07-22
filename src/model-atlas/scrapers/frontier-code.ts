/**
 * FrontierCode scraper preserves revision 1.1 effort rows, subset metrics, harnesses, and official-best provenance.
 *
 * Page source: https://cognition.com/frontiercode
 * JSON source: https://cognition.com/data/frontiercode-leaderboard/data.json
 */

import {
	canonicalReasoningEffort,
	reasoningEffortRank,
} from "../identity/normalization";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../runtime";

const FRONTIER_CODE_DATA_URL =
	"https://cognition.com/data/frontiercode-leaderboard/data.json";
export const FRONTIER_CODE_SOURCE_REVISION = "v1_1";

const DEFAULT_TIMEOUT_MS = 30_000;
const EXPECTED_SUBSET_TASK_COUNTS = { main: 100, extended: 150 } as const;
const NON_GENERAL_MODEL_SYSTEMS = new Set(["Composer 2.5", "SWE-1.7"]);
const SUBSETS = ["main", "extended"] as const;

export type FrontierCodeSubsetMetrics = {
	pass_rate: number;
	score: number;
	cost_per_task_usd: number | null;
	tokens_per_task: number | null;
	tool_calls_per_task: number | null;
	steps_per_task: number | null;
	output_token_equivalent_per_task: number | null;
};

export type FrontierCodeModelEffortRow = {
	revision: typeof FRONTIER_CODE_SOURCE_REVISION;
	model: string;
	base_model: string;
	source_effort: string;
	reasoning_effort: string | null;
	harness: string;
	score_eligible: boolean;
	official_rank: number;
	official_best_effort: boolean;
	main: FrontierCodeSubsetMetrics;
	extended: FrontierCodeSubsetMetrics;
	score: number;
	cost_per_task_usd: number | null;
	tokens_per_task: number | null;
};

export type FrontierCodeRowsByModelName = Map<
	string,
	FrontierCodeModelEffortRow
>;

type FrontierCodePayload = {
	fetched_at_epoch_seconds: number | null;
	data: FrontierCodeModelEffortRow[];
};

type FrontierCodeScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

function optionalNonNegativeNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number >= 0 ? number : null;
}

/** Parse one subset aggregate while keeping nullable resource fields distinct from required quality metrics. */
export function processFrontierCodeSubsetMetrics(
	value: unknown,
): FrontierCodeSubsetMetrics | null {
	const row = asRecord(value);
	const passRate = asFiniteNumber(row.correct);
	const score = asFiniteNumber(row.new_score);
	if (
		passRate == null ||
		score == null ||
		passRate < 0 ||
		passRate > 1 ||
		score < 0 ||
		score > 1
	) {
		return null;
	}
	return {
		pass_rate: passRate,
		score,
		cost_per_task_usd: optionalNonNegativeNumber(row.cost),
		tokens_per_task: optionalNonNegativeNumber(row.tokens),
		tool_calls_per_task: optionalNonNegativeNumber(row.tool_calls),
		steps_per_task: optionalNonNegativeNumber(row.steps),
		output_token_equivalent_per_task: optionalNonNegativeNumber(row.ote),
	};
}

function frontierCodeReasoningEffort(sourceEffort: string): string | null {
	const effort = canonicalReasoningEffort(sourceEffort);
	return reasoningEffortRank(effort) >= 0 ? effort : null;
}

type ParsedEffortRow = Omit<
	FrontierCodeModelEffortRow,
	"official_rank" | "official_best_effort"
>;

function processEffortRow(
	baseModel: string,
	sourceEffort: string,
	harness: string,
	value: unknown,
): ParsedEffortRow | null {
	const row = asRecord(value);
	const main = processFrontierCodeSubsetMetrics(row.main);
	const extended = processFrontierCodeSubsetMetrics(row.extended);
	if (main == null || extended == null) {
		return null;
	}
	const reasoningEffort = frontierCodeReasoningEffort(sourceEffort);
	return {
		revision: FRONTIER_CODE_SOURCE_REVISION,
		model:
			reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
		base_model: baseModel,
		source_effort: sourceEffort,
		reasoning_effort: reasoningEffort,
		harness,
		score_eligible: !NON_GENERAL_MODEL_SYSTEMS.has(baseModel),
		main,
		extended,
		score: main.score,
		cost_per_task_usd: main.cost_per_task_usd,
		tokens_per_task: main.tokens_per_task,
	};
}

/** Parse every current model-effort observation and reproduce Cognition's best-effort model ranks without collapsing rows. */
export function processFrontierCodePayload(
	value: unknown,
): FrontierCodeModelEffortRow[] {
	const root = asRecord(value);
	const revision = asRecord(root[FRONTIER_CODE_SOURCE_REVISION]);
	const subsets = asRecord(revision.subsets);
	if (
		SUBSETS.some(
			(subset) =>
				asFiniteNumber(subsets[subset]) !== EXPECTED_SUBSET_TASK_COUNTS[subset],
		)
	) {
		return [];
	}
	const models = Array.isArray(revision.models) ? revision.models : [];
	const effortsByModel = asRecord(revision.efforts);
	const harnessByModel = asRecord(revision.harness);
	const dataByModel = asRecord(revision.data);
	const parsedRows: ParsedEffortRow[] = [];
	for (const modelValue of models) {
		if (typeof modelValue !== "string" || modelValue.trim().length === 0) {
			continue;
		}
		const baseModel = modelValue.trim();
		const harness = harnessByModel[baseModel];
		const efforts = effortsByModel[baseModel];
		const rowsByEffort = asRecord(dataByModel[baseModel]);
		if (typeof harness !== "string" || !Array.isArray(efforts)) {
			continue;
		}
		for (const effortValue of efforts) {
			if (typeof effortValue !== "string" || effortValue.length === 0) {
				continue;
			}
			const parsed = processEffortRow(
				baseModel,
				effortValue,
				harness,
				rowsByEffort[effortValue],
			);
			if (parsed != null) {
				parsedRows.push(parsed);
			}
		}
	}
	const bestRowByModel = new Map<string, ParsedEffortRow>();
	for (const row of parsedRows) {
		const best = bestRowByModel.get(row.base_model);
		if (best == null || row.score > best.score) {
			bestRowByModel.set(row.base_model, row);
		}
	}
	const officialRankByModel = new Map(
		[...bestRowByModel.values()]
			.sort((left, right) => right.score - left.score)
			.map((row, index) => [row.base_model, index + 1]),
	);
	return parsedRows.map((row) => ({
		...row,
		official_rank: officialRankByModel.get(row.base_model) as number,
		official_best_effort: bestRowByModel.get(row.base_model) === row,
	}));
}

/** Fetch Cognition's versioned structured artifact rather than scraping the rendered leaderboard. */
export async function getFrontierCodeStats(
	options: FrontierCodeScraperOptions = {},
): Promise<FrontierCodePayload> {
	try {
		const response = await fetchWithTimeout(
			options.url ?? FRONTIER_CODE_DATA_URL,
			{},
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok) {
			throw new Error(`FrontierCode scrape failed: ${response.status}`);
		}
		const data = processFrontierCodePayload(await response.json());
		if (data.length === 0) {
			throw new Error("FrontierCode scrape returned no revision 1.1 rows");
		}
		return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
