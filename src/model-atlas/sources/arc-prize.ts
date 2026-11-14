/**
 * ARC Prize results from the official verified leaderboards.
 *
 * Page source: https://arcprize.org/leaderboard
 * ARC-AGI-2 JSON source: https://arcprize.org/media/data/leaderboard/v2.json
 * ARC-AGI-3 JSON source: https://arcprize.org/media/data/leaderboard/v3.json
 */

import { BENCHMARK_RESOURCE_PROFILES } from "../benchmarks/catalog";
import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  resourcePerTaskRun,
} from "../benchmarks/observation";
import { withClaudeFamily } from "../identity/claude";
import { parseModelEffort } from "../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord, nowEpochSeconds } from "../runtime";
import { mapWithCompetitionRank } from "./parsing";
import { fetchSourceJson } from "./request-scheduler";

const SCORE_ELIGIBLE_MODEL_TYPES = new Set(["Base LLM", "CoT"]);

type ArcPrizeHarness = "standard" | "provider_adapter";

type ArcPrizeLeaderboardOptions = {
  benchmarkKey: "arc_agi_2" | "arc_agi_3";
  datasetId: "v2_Semi_Private" | "v3_Semi_Private";
  sourceUrl: string;
};

type ParsedArcPrizeRow = {
  model_id: string;
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  model_creator: string;
  harness: ArcPrizeHarness | null;
  score: number;
  cost: number | null;
  task_run_count?: number;
  total_cost_usd?: number;
  source_index: number;
};

export async function getArcPrizeStats(
  options: ArcPrizeLeaderboardOptions,
): Promise<BenchmarkObservationPayload> {
  const payload = await fetchSourceJson(options.sourceUrl);
  return {
    fetched_at_epoch_seconds: nowEpochSeconds(),
    data: processArcPrizeLeaderboardJson(payload, options),
  };
}

/** Parse one official leaderboard and rank displayed model rows by score, retaining ties. ARC-AGI-3 scores only Standard runs: Provider Adapter runs use each provider's own context handling, score far higher for the same model, and stay as unscored provenance. */
function processArcPrizeLeaderboardJson(
  payload: unknown,
  options: ArcPrizeLeaderboardOptions,
): BenchmarkObservationRow[] {
  const root = asRecord(payload);
  const observedAt = asNonEmptyString(root.generatedAt);
  const evaluations = Array.isArray(root.evaluations) ? root.evaluations : [];
  const seenRows = new Set<string>();
  const rows = evaluations
    .map((value, sourceIndex) => parseArcPrizeEvaluation(value, sourceIndex, options))
    .filter((row): row is ParsedArcPrizeRow => row != null)
    .filter((row) => {
      const key = JSON.stringify([
        row.model_id,
        row.model,
        row.base_model,
        row.reasoning_effort,
        row.model_creator,
        row.harness,
        row.score,
        row.cost,
        row.task_run_count,
        row.total_cost_usd,
      ]);
      if (seenRows.has(key)) return false;
      seenRows.add(key);
      return true;
    })
    .sort((left, right) => right.score - left.score || left.source_index - right.source_index);

  const scored = rows.filter((row) => row.harness !== "provider_adapter");
  return [
    ...mapWithCompetitionRank(
      scored,
      (row) => row.score,
      (row, rank) => arcObservationRow(row, options, observedAt, rank),
    ),
    ...rows
      .filter((row) => row.harness === "provider_adapter")
      .map((row) => arcObservationRow(row, options, observedAt, null)),
  ];
}

/** Accept cached ARC-AGI-3 rows only when Standard rows score, Provider Adapter rows are provenance, and costs match the active task contract. */
export function arcPrizeCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  benchmarkKey: "arc_agi_2" | "arc_agi_3",
): boolean {
  if (benchmarkKey !== "arc_agi_3") return true;
  return rows.every((row) => {
    const { harness, observation_role: role } = row.metadata;
    if (
      !(
        (harness === "standard" && role == null) ||
        (harness === "provider_adapter" && role === "component")
      ) ||
      row.task_run_count !== BENCHMARK_RESOURCE_PROFILES.arc_agi_3.taskRunCount
    ) {
      return false;
    }
    if (row.cost == null) return row.total_cost_usd == null;
    return (
      row.cost >= 0 &&
      row.total_cost_usd != null &&
      row.total_cost_usd >= 0 &&
      row.cost === resourcePerTaskRun(row.total_cost_usd, row.task_run_count)
    );
  });
}

/** Keep one displayed, comparable general-model evaluation and its scoring provenance. */
function parseArcPrizeEvaluation(
  value: unknown,
  sourceIndex: number,
  options: ArcPrizeLeaderboardOptions,
): ParsedArcPrizeRow | null {
  const row = asRecord(value);
  if (row.datasetId !== options.datasetId || row.display === false || row.modelGroup === "Human") {
    return null;
  }

  const modelId = asNonEmptyString(row.modelId);
  const displayName = asNonEmptyString(row.modelDisplayName);
  const creator = asNonEmptyString(row.providerDisplayName) ?? asNonEmptyString(row.providerId);
  const modelType = asNonEmptyString(row.modelType);
  const score = asFiniteNumber(row.score);
  const harness = arcPrizeHarness(row, options.datasetId);
  if (
    modelId == null ||
    displayName == null ||
    creator == null ||
    modelType == null ||
    !SCORE_ELIGIBLE_MODEL_TYPES.has(modelType) ||
    score == null ||
    score < 0 ||
    score > 1 ||
    (options.datasetId === "v3_Semi_Private" && harness == null)
  ) {
    return null;
  }

  // Drop trailing superscript footnote digits: `GPT-5.2 (High)²` → `GPT-5.2 (High)`.
  const model = displayName.replace(/\s*[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, "").trim();
  // The adapter label sits before any effort parenthetical: `Claude Opus 4.5 - Provider Adapter (High)` → `Claude Opus 4.5 (High)`.
  const identityModel =
    harness === "provider_adapter"
      ? model.replace(/\s-\sProvider Adapter(?=\s*(?:\(|$))/i, "")
      : model;
  const identity = parseModelEffort(identityModel);
  const resource = arcPrizeResource(row, options.datasetId);

  return {
    model_id: modelId,
    model,
    base_model: withClaudeFamily(identity.baseModel),
    reasoning_effort: identity.reasoningEffort,
    model_creator: creator,
    harness,
    score,
    cost: resource.cost,
    task_run_count: resource.task_run_count,
    total_cost_usd: resource.total_cost_usd,
    source_index: sourceIndex,
  };
}

function arcPrizeHarness(
  row: Record<string, unknown>,
  datasetId: ArcPrizeLeaderboardOptions["datasetId"],
): ArcPrizeHarness | null {
  if (datasetId === "v2_Semi_Private") return null;
  const modelId = asNonEmptyString(row.modelId) ?? "";
  const model = asNonEmptyString(row.modelDisplayName) ?? "";
  const modelGroup = asNonEmptyString(row.modelGroup) ?? "";
  const displayUsesProviderAdapter = /\s-\sProvider Adapter(?:\s*\(|$)/i.test(model);
  const idUsesProviderAdapter = /-provider-adapter$/i.test(modelId);
  const groupUsesProviderAdapter = /-provider-adapter$/i.test(modelGroup);
  if (displayUsesProviderAdapter && idUsesProviderAdapter && groupUsesProviderAdapter) {
    return "provider_adapter";
  }
  if (!/adapter/i.test(`${modelId} ${model} ${modelGroup}`)) return "standard";
  return null;
}

/** Normalize ARC-AGI-2's reported task cost and ARC-AGI-3's 55-environment semi-private total into the shared per-task contract. */
function arcPrizeResource(
  row: Record<string, unknown>,
  datasetId: ArcPrizeLeaderboardOptions["datasetId"],
): Pick<ParsedArcPrizeRow, "cost" | "task_run_count" | "total_cost_usd"> {
  if (datasetId === "v2_Semi_Private") {
    const cost = asFiniteNumber(row.costPerTask);
    return { cost: cost != null && cost >= 0 ? cost : null };
  }

  const totalCostUsd = asFiniteNumber(row.cost);
  const taskRunCount = BENCHMARK_RESOURCE_PROFILES.arc_agi_3.taskRunCount;
  return {
    cost:
      totalCostUsd != null && totalCostUsd >= 0
        ? resourcePerTaskRun(totalCostUsd, taskRunCount)
        : null,
    task_run_count: taskRunCount,
    ...(totalCostUsd != null && totalCostUsd >= 0 ? { total_cost_usd: totalCostUsd } : {}),
  };
}

function arcObservationRow(
  row: ParsedArcPrizeRow,
  options: ArcPrizeLeaderboardOptions,
  observedAt: string | null,
  rank: number | null,
): BenchmarkObservationRow {
  return {
    benchmark_key: options.benchmarkKey,
    source_url: options.sourceUrl,
    model_id: row.model_id,
    model: row.model,
    base_model: row.base_model,
    reasoning_effort: row.reasoning_effort,
    model_creator: row.model_creator,
    rank,
    canonical_value: row.score,
    ...(row.cost == null ? {} : { cost: row.cost }),
    ...(row.task_run_count == null ? {} : { task_run_count: row.task_run_count }),
    ...(row.total_cost_usd == null ? {} : { total_cost_usd: row.total_cost_usd }),
    observed_at: observedAt,
    metadata:
      row.harness == null
        ? {}
        : row.harness === "provider_adapter"
          ? { observation_role: "component", harness: row.harness }
          : { harness: row.harness },
  };
}
