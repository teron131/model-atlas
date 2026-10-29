/**
 * FrontierCode leaderboard results from Cognition.
 *
 * Page source: https://cognition.com/frontiercode
 * JSON source: https://cognition.com/data/frontier-code-2.0/data.json
 */

import { canonicalReasoningEffort, reasoningEffortRank } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import { fetchSource } from "../request-scheduler";

const FRONTIER_CODE_DATA_URL = "https://cognition.com/data/frontier-code-2.0/data.json";

/** The 2.0 artifact carries no revision key, so this keeps the `v<major>_<minor>` form of the 1.x artifact's keys that persisted rows and `frontierCodeVersion` read. */
const FRONTIER_CODE_REVISION = "v2_0";

export const FRONTIER_CODE_LEADERBOARD_URL = "https://cognition.com/frontiercode";

const DEFAULT_TIMEOUT_MS = 30_000;

const EXPECTED_MAIN_TASK_COUNT = 132;

const NON_GENERAL_MODEL_SYSTEMS = new Set(["SWE-1.6", "SWE-1.7", "SWE-2"]);

export type FrontierCodeSubsetMetrics = {
  pass_rate: number;
  score: number;
  cost_per_task_usd: number | null;
  tokens_per_task: number | null;
  tool_calls_per_task: number | null;
  output_token_equivalent_per_task: number | null;
};

export type FrontierCodeModelEffortRow = {
  revision: string;
  model: string;
  base_model: string;
  source_effort: string;
  reasoning_effort: string | null;
  harness: string;
  score_eligible: boolean;
  official_rank: number;
  official_best_effort: boolean;
  main: FrontierCodeSubsetMetrics;
  score: number;
  cost_per_task_usd: number | null;
  tokens_per_task: number | null;
};

export type FrontierCodeRowsByModelName = Map<string, FrontierCodeModelEffortRow>;

type FrontierCodePayload = {
  fetched_at_epoch_seconds: number | null;
  data: FrontierCodeModelEffortRow[];
};

type FrontierCodeScraperOptions = {
  url?: string;
  timeoutMs?: number;
};

type ParsedEffortRow = Omit<
  FrontierCodeModelEffortRow,
  "revision" | "official_rank" | "official_best_effort"
>;

/** Fetch Cognition's versioned structured artifact rather than scraping the rendered leaderboard. */
export async function getFrontierCodeStats(
  options: FrontierCodeScraperOptions = {},
): Promise<FrontierCodePayload> {
  try {
    return await fetchSource(
      options.url ?? FRONTIER_CODE_DATA_URL,
      {},
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          throw new Error(`FrontierCode scrape failed: ${response.status}`);
        }
        const data = processFrontierCodePayload(await response.json());
        if (data.length === 0) {
          throw new Error("FrontierCode scrape returned no rows");
        }
        return { fetched_at_epoch_seconds: nowEpochSeconds(), data };
      },
    );
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Parse one subset aggregate while keeping nullable resource fields distinct from required quality metrics. */
export function processFrontierCodeSubsetMetrics(value: unknown): FrontierCodeSubsetMetrics | null {
  const row = asRecord(value);
  const passRate = asFiniteNumber(row.correct);
  const score = asFiniteNumber(row.new_score);
  if (passRate == null || score == null || passRate < 0 || passRate > 1 || score < 0 || score > 1) {
    return null;
  }
  return {
    pass_rate: passRate,
    score,
    cost_per_task_usd: optionalNonNegativeNumber(row.cost),
    tokens_per_task: optionalNonNegativeNumber(row.tokens),
    tool_calls_per_task: optionalNonNegativeNumber(row.tool_calls),
    output_token_equivalent_per_task: optionalNonNegativeNumber(row.ote),
  };
}

/** Parse every model-effort observation of the 2.0 artifact and reproduce Cognition's best-effort model ranks without collapsing rows; an artifact whose subsets are not exactly the 132-task Main yields none. */
export function processFrontierCodePayload(value: unknown): FrontierCodeModelEffortRow[] {
  const root = asRecord(value);
  const subsets = asRecord(root.subsets);
  if (
    Object.keys(subsets).length !== 1 ||
    asFiniteNumber(subsets.main) !== EXPECTED_MAIN_TASK_COUNT
  ) {
    return [];
  }
  const models = Array.isArray(root.models) ? root.models : [];
  const effortsByModel = asRecord(root.efforts);
  const harnessByModel = asRecord(root.harness);
  const dataByModel = asRecord(root.data);
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
      const parsed = processEffortRow(baseModel, effortValue, harness, rowsByEffort[effortValue]);
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
    revision: FRONTIER_CODE_REVISION,
    ...row,
    official_rank: officialRankByModel.get(row.base_model) as number,
    official_best_effort: bestRowByModel.get(row.base_model) === row,
  }));
}

/** Revisions read as dotted versions, dropping the `v` prefix and joining parts with dots. */
export function frontierCodeVersion(revision: string): string {
  return revision.replace(/^v/, "").replaceAll("_", ".");
}

function optionalNonNegativeNumber(value: unknown): number | null {
  const number = asFiniteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function processEffortRow(
  baseModel: string,
  sourceEffort: string,
  harness: string,
  value: unknown,
): ParsedEffortRow | null {
  const row = asRecord(value);
  const main = processFrontierCodeSubsetMetrics(row.main);
  if (main == null) {
    return null;
  }
  const reasoningEffort = frontierCodeReasoningEffort(sourceEffort);
  return {
    model: reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
    base_model: baseModel,
    source_effort: sourceEffort,
    reasoning_effort: reasoningEffort,
    harness,
    score_eligible: !NON_GENERAL_MODEL_SYSTEMS.has(baseModel),
    main,
    score: main.score,
    cost_per_task_usd: main.cost_per_task_usd,
    tokens_per_task: main.tokens_per_task,
  };
}

function frontierCodeReasoningEffort(sourceEffort: string): string | null {
  const effort = canonicalReasoningEffort(sourceEffort);
  return reasoningEffortRank(effort) >= 0 ? effort : null;
}
