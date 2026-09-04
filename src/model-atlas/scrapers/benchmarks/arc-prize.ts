/**
 * ARC Prize results from the official verified leaderboards.
 *
 * Page source: https://arcprize.org/leaderboard
 * ARC-AGI-2 JSON source: https://arcprize.org/media/data/leaderboard/v2.json
 * ARC-AGI-3 JSON source: https://arcprize.org/media/data/leaderboard/v3.json
 */

import { BENCHMARK_RESOURCE_PROFILES } from "../../benchmarks/catalog/portfolio";
import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  resourcePerTaskRun,
} from "../../benchmarks/observation";
import {
  benchmarkModelEffort,
  modelNameWithoutCreatorPrefix,
  normalizeModelToken,
} from "../../identity/normalization";
import { asFiniteNumber, asRecord, fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { stringValue } from "../parsing";

const DEFAULT_TIMEOUT_MS = 30_000;
const SCORE_ELIGIBLE_MODEL_TYPES = new Set(["Base LLM", "CoT"]);
type ArcPrizeHarness = "standard" | "provider_adapter";

type ArcPrizeLeaderboardOptions = {
  benchmarkKey: "arc_agi_2" | "arc_agi_3";
  datasetId: "v2_Semi_Private" | "v3_Semi_Private";
  sourceUrl: string;
};

type ArcPrizeFetchOptions = ArcPrizeLeaderboardOptions & {
  timeoutMs?: number;
};

type ParsedArcPrizeRow = {
  model_id: string;
  canonical_model_id: string;
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

type ArcPrizeAggregate = {
  row: ParsedArcPrizeRow;
  components: ParsedArcPrizeRow[];
};

function arcHarnessOrder(harness: ArcPrizeHarness | null): number {
  return harness === "standard" ? 0 : harness === "provider_adapter" ? 1 : 2;
}

function arcConfigurationKey(row: ParsedArcPrizeRow): string {
  return JSON.stringify([
    row.canonical_model_id,
    row.base_model,
    row.reasoning_effort,
    row.model_creator,
  ]);
}

function arcPrizeHarness(
  row: Record<string, unknown>,
  datasetId: ArcPrizeLeaderboardOptions["datasetId"],
): ArcPrizeHarness | null {
  if (datasetId === "v2_Semi_Private") return null;
  const modelId = stringValue(row.modelId) ?? "";
  const model = stringValue(row.modelDisplayName) ?? "";
  const modelGroup = stringValue(row.modelGroup) ?? "";
  const displayUsesProviderAdapter = /\s-\sProvider Adapter(?:\s*\(|$)/i.test(model);
  const idUsesProviderAdapter = /-provider-adapter$/i.test(modelId);
  const groupUsesProviderAdapter = /-provider-adapter$/i.test(modelGroup);
  if (displayUsesProviderAdapter && idUsesProviderAdapter && groupUsesProviderAdapter) {
    return "provider_adapter";
  }
  if (!/adapter/i.test(`${modelId} ${model} ${modelGroup}`)) return "standard";
  return null;
}

function canonicalArcModelId(
  row: Record<string, unknown>,
  modelId: string,
  harness: ArcPrizeHarness | null,
): string {
  if (harness == null) return modelId;
  const modelGroup = stringValue(row.modelGroup) ?? modelId;
  return modelGroup.replace(/-provider-adapter$/i, "");
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

/** Normalize ARC's Anthropic shorthand while preserving every displayed configuration in model. */
function arcModelIdentity(
  model: string,
  creator: string,
): {
  baseModel: string;
  reasoningEffort: string | null;
} {
  const parsed = benchmarkModelEffort(model);
  let baseModel = modelNameWithoutCreatorPrefix(parsed.baseModel, creator);
  if (
    normalizeModelToken(creator) === "anthropic" &&
    /^(?:opus|sonnet|haiku|fable)\b/i.test(baseModel)
  ) {
    baseModel = `Claude ${baseModel}`;
  }
  return { baseModel, reasoningEffort: parsed.reasoningEffort };
}

/** Keep one displayed, comparable general-model evaluation and its scoring provenance. */
function arcPrizeObservation(
  value: unknown,
  sourceIndex: number,
  options: ArcPrizeLeaderboardOptions,
): ParsedArcPrizeRow | null {
  const row = asRecord(value);
  if (row.datasetId !== options.datasetId || row.display === false || row.modelGroup === "Human") {
    return null;
  }

  const modelId = stringValue(row.modelId);
  const displayName = stringValue(row.modelDisplayName);
  const creator = stringValue(row.providerDisplayName) ?? stringValue(row.providerId);
  const modelType = stringValue(row.modelType);
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

  const model = displayName.replace(/\s*[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, "").trim();
  const identityModel =
    harness === "provider_adapter"
      ? model.replace(/\s-\sProvider Adapter(?=\s*(?:\(|$))/i, "")
      : model;
  const identity = arcModelIdentity(identityModel, creator);
  const resource = arcPrizeResource(row, options.datasetId);

  return {
    model_id: modelId,
    canonical_model_id: canonicalArcModelId(row, modelId, harness),
    model,
    base_model: identity.baseModel,
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
        : {
            observation_role: "component",
            harness: row.harness,
          },
  };
}

function canonicalArcAgi3Rows(
  components: ParsedArcPrizeRow[],
  options: ArcPrizeLeaderboardOptions,
  observedAt: string | null,
): BenchmarkObservationRow[] {
  const groups = new Map<string, ParsedArcPrizeRow[]>();
  for (const component of components) {
    const key = arcConfigurationKey(component);
    const rows = groups.get(key) ?? [];
    rows.push(component);
    groups.set(key, rows);
  }
  const aggregates = [...groups.values()]
    .map((rows): ArcPrizeAggregate => {
      const orderedComponents = [...new Map(rows.map((row) => [row.harness, row])).values()].sort(
        (left, right) =>
          arcHarnessOrder(left.harness) - arcHarnessOrder(right.harness) ||
          left.source_index - right.source_index,
      );
      const first = orderedComponents[0]!;
      const completeResources = orderedComponents.every(
        (row) => row.task_run_count != null && row.total_cost_usd != null,
      );
      const taskRunCount = completeResources
        ? orderedComponents.reduce((total, row) => total + (row.task_run_count ?? 0), 0)
        : undefined;
      const totalCostUsd = completeResources
        ? orderedComponents.reduce((total, row) => total + (row.total_cost_usd ?? 0), 0)
        : undefined;
      return {
        row: {
          ...first,
          model_id: first.canonical_model_id,
          model: first.model.replace(/\s-\sProvider Adapter(?=\s*(?:\(|$))/i, ""),
          harness: null,
          score:
            orderedComponents.reduce((total, row) => total + row.score, 0) /
            orderedComponents.length,
          cost:
            taskRunCount == null || totalCostUsd == null
              ? null
              : resourcePerTaskRun(totalCostUsd, taskRunCount),
          task_run_count: taskRunCount,
          total_cost_usd: totalCostUsd,
          source_index: Math.min(...orderedComponents.map((row) => row.source_index)),
        },
        components: orderedComponents,
      };
    })
    .sort(
      (left, right) =>
        right.row.score - left.row.score || left.row.source_index - right.row.source_index,
    );

  let rank = 0;
  let previousScore: number | null = null;
  const canonicalRows = aggregates.map(({ row, components: orderedComponents }, index) => {
    if (previousScore !== row.score) rank = index + 1;
    previousScore = row.score;
    const harnesses = orderedComponents
      .map((component) => component.harness)
      .filter((harness): harness is ArcPrizeHarness => harness != null);
    return {
      ...arcObservationRow(row, options, observedAt, rank),
      metadata: {
        observation_role: "canonical",
        aggregation: harnesses.length > 1 ? "equal_harness_mean" : "single_harness",
        harnesses,
        component_model_ids: orderedComponents.map((component) => component.model_id),
        component_scores: orderedComponents.map((component) => component.score),
      },
    } satisfies BenchmarkObservationRow;
  });
  return [
    ...canonicalRows,
    ...components.map((row) => arcObservationRow(row, options, observedAt, null)),
  ];
}

/** Parse one official leaderboard and rank displayed model rows by score, retaining ties. */
export function processArcPrizeLeaderboardJson(
  payload: unknown,
  options: ArcPrizeLeaderboardOptions,
): BenchmarkObservationRow[] {
  const root = asRecord(payload);
  const observedAt = stringValue(root.generatedAt);
  const evaluations = Array.isArray(root.evaluations) ? root.evaluations : [];
  const seenRows = new Set<string>();
  const rows = evaluations
    .map((value, sourceIndex) => arcPrizeObservation(value, sourceIndex, options))
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

  if (options.datasetId === "v3_Semi_Private") {
    return canonicalArcAgi3Rows(rows, options, observedAt);
  }

  let rank = 0;
  let previousScore: number | null = null;
  return rows.map((row, index) => {
    if (previousScore !== row.score) rank = index + 1;
    previousScore = row.score;
    return arcObservationRow(row, options, observedAt, rank);
  });
}

/** Fetch current official ARC Prize evidence without mutating persisted data. */
export async function getArcPrizeStats(
  options: ArcPrizeFetchOptions,
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(
      options.sourceUrl,
      {},
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`ARC Prize ${options.benchmarkKey} scrape failed: ${response.status}`);
    }
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processArcPrizeLeaderboardJson(await response.json(), options),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
