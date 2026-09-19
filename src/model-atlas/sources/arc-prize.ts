/**
 * ARC Prize results from the official verified leaderboards.
 *
 * Page source: https://arcprize.org/leaderboard
 * ARC-AGI-2 JSON source: https://arcprize.org/media/data/leaderboard/v2.json
 * ARC-AGI-3 JSON source: https://arcprize.org/media/data/leaderboard/v3.json
 */

import { BENCHMARK_RESOURCE_PROFILES } from "../benchmarks/catalog/portfolio";
import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  resourcePerTaskRun,
} from "../benchmarks/observation";
import {
  BENCHMARK_RESOURCE_SOURCE_LABELS,
  RESOURCE_SOURCE_AGREEMENT_POLICY,
} from "../benchmarks/resource-sources";
import {
  benchmarkModelEffort,
  modelNameWithoutCreatorPrefix,
  normalizeModelToken,
} from "../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../runtime";
import { stringValue } from "./parsing";
import { fetchSource } from "./request-scheduler";

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

/** Fetch current official ARC Prize evidence without mutating persisted data. */
export async function getArcPrizeStats(
  options: ArcPrizeFetchOptions,
): Promise<BenchmarkObservationPayload> {
  try {
    return await fetchSource(
      options.sourceUrl,
      {},
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          throw new Error(`ARC Prize ${options.benchmarkKey} scrape failed: ${response.status}`);
        }
        return {
          fetched_at_epoch_seconds: nowEpochSeconds(),
          data: processArcPrizeLeaderboardJson(await response.json(), options),
        };
      },
    );
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
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

/** Accept cached ARC-AGI-3 resources only when harness counts and normalized costs match the active task contract. */
export function arcPrizeCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  benchmarkKey: "arc_agi_2" | "arc_agi_3",
): boolean {
  if (benchmarkKey !== "arc_agi_3") return true;
  return rows.every((row) => {
    const harnessCount = arcAgi3HarnessCount(row);
    if (
      harnessCount == null ||
      row.task_run_count !== BENCHMARK_RESOURCE_PROFILES.arc_agi_3.taskRunCount * harnessCount
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

function canonicalArcModelId(
  row: Record<string, unknown>,
  modelId: string,
  harness: ArcPrizeHarness | null,
): string {
  if (harness == null) return modelId;
  const modelGroup = stringValue(row.modelGroup) ?? modelId;
  return modelGroup.replace(/-provider-adapter$/i, "");
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
  const costAgreement = arcAgi3CostAgreement(aggregates);

  let rank = 0;
  let previousScore: number | null = null;
  const canonicalRows = aggregates.map(({ row, components: orderedComponents }, index) => {
    if (previousScore !== row.score) rank = index + 1;
    previousScore = row.score;
    const harnesses = orderedComponents
      .map((component) => component.harness)
      .filter((harness): harness is ArcPrizeHarness => harness != null);
    const standard = orderedComponents.find((component) => component.harness === "standard");
    const providerAdapter = orderedComponents.find(
      (component) => component.harness === "provider_adapter",
    );
    return {
      ...arcObservationRow(row, options, observedAt, rank),
      metadata: {
        observation_role: "canonical",
        aggregation: harnesses.length > 1 ? "equal_harness_mean" : "single_harness",
        harnesses,
        component_model_ids: orderedComponents.map((component) => component.model_id),
        component_scores: orderedComponents.map((component) => component.score),
        source_a_label: BENCHMARK_RESOURCE_SOURCE_LABELS.arc_agi_3.source_a,
        source_b_label: BENCHMARK_RESOURCE_SOURCE_LABELS.arc_agi_3.source_b,
        source_a_score: standard?.score ?? null,
        source_b_score: providerAdapter?.score ?? null,
        source_a_cost: standard?.cost ?? null,
        source_b_cost: providerAdapter?.cost ?? null,
        fusion_cost_accounting_compatible: true,
        fusion_cost_comparable: costAgreement.comparable,
        fusion_cost_paired_models: costAgreement.modelCount,
        fusion_cost_within_5_percent_share: costAgreement.withinToleranceShare,
        fusion_cost_estimated: false,
        fusion_cost_confidence: costAgreement.comparable ? 1 : 0,
      },
    } satisfies BenchmarkObservationRow;
  });
  return [
    ...canonicalRows,
    ...components.map((row) => arcObservationRow(row, options, observedAt, null)),
  ];
}

/** ARC harness costs share one accounting contract but still need model-balanced agreement on their absolute scale. */
function arcAgi3CostAgreement(aggregates: readonly ArcPrizeAggregate[]): {
  comparable: boolean;
  modelCount: number;
  withinToleranceShare: number;
} {
  const pairedByModel = new Map<string, Array<{ standard: number; providerAdapter: number }>>();
  for (const aggregate of aggregates) {
    const standard = aggregate.components.find(
      (component) => component.harness === "standard",
    )?.cost;
    const providerAdapter = aggregate.components.find(
      (component) => component.harness === "provider_adapter",
    )?.cost;
    if (standard == null || standard <= 0 || providerAdapter == null || providerAdapter <= 0)
      continue;
    const pairs = pairedByModel.get(aggregate.row.base_model) ?? [];
    pairs.push({ standard, providerAdapter });
    pairedByModel.set(aggregate.row.base_model, pairs);
  }
  let agreeingWeight = 0;
  for (const pairs of pairedByModel.values()) {
    const pairWeight = 1 / pairs.length;
    for (const pair of pairs) {
      if (
        Math.max(pair.standard, pair.providerAdapter) /
          Math.min(pair.standard, pair.providerAdapter) <=
        RESOURCE_SOURCE_AGREEMENT_POLICY.maximumRatio
      ) {
        agreeingWeight += pairWeight;
      }
    }
  }
  const modelCount = pairedByModel.size;
  const withinToleranceShare = modelCount === 0 ? 0 : agreeingWeight / modelCount;
  return {
    comparable:
      modelCount >= RESOURCE_SOURCE_AGREEMENT_POLICY.minimumModels &&
      withinToleranceShare >= RESOURCE_SOURCE_AGREEMENT_POLICY.minimumShare,
    modelCount,
    withinToleranceShare,
  };
}

function arcConfigurationKey(row: ParsedArcPrizeRow): string {
  return JSON.stringify([
    row.canonical_model_id,
    row.base_model,
    row.reasoning_effort,
    row.model_creator,
  ]);
}

function arcHarnessOrder(harness: ArcPrizeHarness | null): number {
  return harness === "standard" ? 0 : harness === "provider_adapter" ? 1 : 2;
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

function arcAgi3HarnessCount(row: BenchmarkObservationRow): number | null {
  if (row.metadata.observation_role === "component") {
    return row.metadata.harness === "standard" || row.metadata.harness === "provider_adapter"
      ? 1
      : null;
  }
  if (row.metadata.observation_role !== "canonical") return null;
  const harnesses = row.metadata.harnesses;
  const validHarnesses = Array.isArray(harnesses)
    ? harnesses.filter(
        (harness): harness is "standard" | "provider_adapter" =>
          harness === "standard" || harness === "provider_adapter",
      )
    : [];
  if (
    !Array.isArray(harnesses) ||
    validHarnesses.length === 0 ||
    validHarnesses.length !== harnesses.length ||
    new Set(validHarnesses).size !== validHarnesses.length
  ) {
    return null;
  }
  return validHarnesses.length;
}
