/** Benchmark assignment attaches exact-effort results to observations and model-level results to one default variant. */

import {
  type BenchmarkObservationLookup,
  findBenchmarkObservation,
} from "../../benchmarks/observation";
import {
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES,
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationDataKey,
  type BenchmarkRuntimeKeyFor,
  transformBenchmarkSourceValue,
} from "../../benchmarks/registry";
import { modelNameIdentityKey } from "../../identity";
import {
  benchmarkModelEffort,
  type BenchmarkModelRow,
  canonicalModelKey,
  canonicalReasoningEffort,
  modelSlugFromModelId,
  normalizeModelToken,
  reasoningEffortRank,
} from "../../identity/normalization";
import type { ModelAtlasSourceData } from "../../ingest/assembly";
import { asRecord } from "../../runtime";
import {
  agentsLastExamBenchmarkScore,
  findAgentsLastExamModelScore,
} from "../../scrapers/benchmarks/agents-last-exam";
import {
  type ArtificialAnalysisBenchmarkResourceLookup,
  findArtificialAnalysisBenchmarkResourceRow,
} from "../../scrapers/benchmarks/artificial-analysis/results";
import { findBlueprintBenchScore } from "../../scrapers/benchmarks/blueprint-bench";
import { findRiemannBenchScore } from "../../scrapers/benchmarks/surge/riemann-bench";
import { findValsIndexScore } from "../../scrapers/benchmarks/vals/index-benchmark";
import type { ModelAtlasScoringSources } from "../model-types";

type BenchmarkObservationLookups = {
  [Key in BenchmarkObservationDataKey]: Pick<ModelAtlasSourceData[Key], "rowsByModelName">;
};

export type BenchmarkAssignmentLookups = BenchmarkObservationLookups & {
  artificialAnalysisBenchmarkResources: Pick<
    ModelAtlasSourceData["artificialAnalysisBenchmarkResources"],
    "observationLookup" | "sourceDefaultLookup"
  >;
  agentArena: Pick<ModelAtlasSourceData["agentArena"], "rowsByModelName">;
  agentsLastExam: Pick<ModelAtlasSourceData["agentsLastExam"], "rowsByModelName">;
  aleBench: Pick<ModelAtlasSourceData["aleBench"], "rowsByModelName">;
  blueprintBench: Pick<ModelAtlasSourceData["blueprintBench"], "rowsByModelName">;
  cursorBench: Pick<ModelAtlasSourceData["cursorBench"], "rowsByModelName">;
  deepSWE: Pick<ModelAtlasSourceData["deepSWE"], "rowsByModelName">;
  frontierCode: Pick<ModelAtlasSourceData["frontierCode"], "rowsByModelName">;
  mercorApexAgents: Pick<ModelAtlasSourceData["mercorApexAgents"], "rowsByModelName">;
  riemannBench: Pick<ModelAtlasSourceData["riemannBench"], "rowsByModelName">;
  terminalBench4: Pick<ModelAtlasSourceData["terminalBench4"], "rowsByModelName">;
  valsIndex: Pick<ModelAtlasSourceData["valsIndex"], "rowsByModelName">;
  vendingBench2: Pick<ModelAtlasSourceData["vendingBench2"], "rowsByModelName">;
};

type AssignedBenchmarks = {
  benchmarks: Record<string, unknown>;
  scoringSources: NonNullable<ModelAtlasScoringSources>;
};

type StandaloneSourceRowResolver = <T extends BenchmarkModelRow>(
  rowsByModelName: ReadonlyMap<string, T>,
) => T | null;

type StandaloneBenchmarkContext = {
  assignedBenchmarks: AssignedBenchmarks;
  lookups: BenchmarkAssignmentLookups;
  modelNameCandidates: unknown[];
  resolveSourceRow: StandaloneSourceRowResolver;
};

type StandaloneBenchmarkOperation = (context: StandaloneBenchmarkContext) => void;

type StandaloneBenchmarkAdapter = {
  defaultVariant: StandaloneBenchmarkOperation;
  observation?: StandaloneBenchmarkOperation;
};

function benchmarkObservationLookup(
  lookups: BenchmarkAssignmentLookups,
  sourceDataKey: string,
): BenchmarkObservationLookup {
  const lookup = lookups[sourceDataKey as keyof BenchmarkAssignmentLookups] as
    | { rowsByModelName?: BenchmarkObservationLookup }
    | undefined;
  if (lookup?.rowsByModelName == null) {
    throw new Error(`Benchmark observation source-data lookup is missing: ${sourceDataKey}`);
  }
  return lookup.rowsByModelName;
}

function modelNameCandidates(row: Record<string, unknown>): unknown[] {
  return typeof row.artificial_analysis_id === "string"
    ? [
        row.id,
        row.openrouter_id,
        modelSlugFromModelId(row.id),
        row.name,
        row.artificial_analysis_id,
        row.artificial_analysis_slug,
      ]
    : [row.name];
}

/** Fill model-level benchmark gaps while preserving exact variant observations and direct source rows. */
function mergeVariantBenchmarkFields(
  baseFields: Record<string, unknown>,
  defaultVariantFields: Record<string, unknown>,
  benchmarkSources: NonNullable<ModelAtlasScoringSources>,
): Record<string, unknown> {
  const fields = { ...defaultVariantFields, ...baseFields };
  for (const [key, sourceRow] of Object.entries(benchmarkSources)) {
    if (asRecord(sourceRow).benchmark_key === key && key in defaultVariantFields) {
      fields[key] = defaultVariantFields[key];
    }
  }
  return fields;
}

function findSourceRow<T>(
  candidateNames: unknown[],
  rowsByModelName: ReadonlyMap<string, T>,
): T | null {
  const identityKeys = new Set<string>();
  for (const candidateName of candidateNames) {
    if (typeof candidateName !== "string" || candidateName.length === 0) {
      continue;
    }
    const row = rowsByModelName.get(normalizeModelToken(candidateName));
    if (row != null) {
      return row;
    }
    const identityKey = modelNameIdentityKey(candidateName);
    if (identityKey.length > 0) {
      identityKeys.add(identityKey);
    }
  }
  for (const [sourceName, row] of rowsByModelName) {
    const identityKey = modelNameIdentityKey(sourceName);
    if (identityKey.length > 0 && identityKeys.has(identityKey)) {
      return row;
    }
  }
  return null;
}

function findBaseModelSourceRow<T>(
  candidateNames: unknown[],
  rowsByModelName: ReadonlyMap<string, T>,
): T | null {
  const baseModelCandidates = candidateNames.map((candidateName) =>
    typeof candidateName === "string"
      ? benchmarkModelEffort(candidateName).baseModel
      : candidateName,
  );
  return findSourceRow(baseModelCandidates, rowsByModelName);
}

function findEffortSourceRow<T extends BenchmarkModelRow>(
  candidateNames: unknown[],
  targetReasoningEffort: unknown,
  rowsByModelName: ReadonlyMap<string, T>,
): T | null {
  const effort = canonicalReasoningEffort(targetReasoningEffort);
  if (effort == null) {
    return findSourceRow(candidateNames, rowsByModelName);
  }
  const effortCandidates = candidateNames.flatMap((candidateName) => {
    if (typeof candidateName !== "string") {
      return [];
    }
    const baseModel = benchmarkModelEffort(candidateName).baseModel;
    return [`${baseModel} (${effort})`];
  });
  const row = findSourceRow(effortCandidates, rowsByModelName);
  return row?.reasoning_effort === effort ? row : null;
}

/** Resolve an exact effort first, then allow only an effort-unspecified source row as its default fallback. */
function findDefaultSourceRow<T extends BenchmarkModelRow>(
  candidateNames: unknown[],
  targetReasoningEffort: unknown,
  rowsByModelName: ReadonlyMap<string, T>,
): T | null {
  const effort = canonicalReasoningEffort(targetReasoningEffort);
  if (effort == null) {
    return findBaseModelSourceRow(candidateNames, rowsByModelName);
  }
  const exactRow = findEffortSourceRow(candidateNames, effort, rowsByModelName);
  if (exactRow != null) {
    return exactRow;
  }
  const sourceDefaultRow = findBaseModelSourceRow(candidateNames, rowsByModelName);
  return canonicalReasoningEffort(sourceDefaultRow?.reasoning_effort) == null
    ? sourceDefaultRow
    : null;
}

function matchesExactReasoningEffort<T extends { reasoning_effort?: unknown }>(
  row: T | null,
  exactReasoningEffort: string | null | undefined,
): row is T {
  return (
    row != null &&
    (exactReasoningEffort === undefined ||
      canonicalReasoningEffort(row.reasoning_effort) === exactReasoningEffort)
  );
}

function buildArtificialAnalysisBenchmarks(
  modelNameCandidates: unknown[],
  resourceLookup: ArtificialAnalysisBenchmarkResourceLookup,
  baseBenchmarks: Record<string, unknown> = {},
  exactReasoningEffort?: string | null,
): AssignedBenchmarks {
  const benchmarks: Record<string, unknown> = {};
  const scoringSources: NonNullable<ModelAtlasScoringSources> = {};
  for (const key of Object.keys(baseBenchmarks)) {
    const resourceRow = findArtificialAnalysisBenchmarkResourceRow(
      key,
      modelNameCandidates,
      resourceLookup,
    );
    if (matchesExactReasoningEffort(resourceRow, exactReasoningEffort)) {
      scoringSources[key] = resourceRow;
    }
  }
  for (const { benchmarkKey: key } of ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES) {
    const row = findArtificialAnalysisBenchmarkResourceRow(
      key,
      modelNameCandidates,
      resourceLookup,
    );
    if (!matchesExactReasoningEffort(row, exactReasoningEffort)) {
      continue;
    }
    benchmarks[key] = transformBenchmarkSourceValue(key, row.score);
    const scoringSourceKey: string = key;
    scoringSources[scoringSourceKey] = row;
  }
  return { benchmarks, scoringSources };
}

const addAleBench: StandaloneBenchmarkOperation = ({ assignedBenchmarks, lookups, ...context }) => {
  const row = context.resolveSourceRow(lookups.aleBench.rowsByModelName);
  if (row != null) {
    assignedBenchmarks.benchmarks.ale_bench = row.score;
    assignedBenchmarks.scoringSources.ale_bench = row;
  }
};

/** Adds FrontierCode only when the effort-matched source row is eligible for general-model scoring. */
const addFrontierCode: StandaloneBenchmarkOperation = ({
  assignedBenchmarks,
  lookups,
  ...context
}) => {
  const row = context.resolveSourceRow(lookups.frontierCode.rowsByModelName);
  if (row?.score_eligible === true) {
    assignedBenchmarks.benchmarks.frontier_code = row.score;
    assignedBenchmarks.scoringSources.frontier_code = row;
  }
};

const addMercorApexAgents: StandaloneBenchmarkOperation = ({
  assignedBenchmarks,
  lookups,
  ...context
}) => {
  const row = context.resolveSourceRow(lookups.mercorApexAgents.rowsByModelName);
  if (row != null) {
    assignedBenchmarks.scoringSources.apex_agents_mercor = row;
  }
};

/** Adds the strongest agent result for the exact model effort selected by the source projection. */
const addTerminalBench4: StandaloneBenchmarkOperation = ({
  assignedBenchmarks,
  lookups,
  ...context
}) => {
  const row = context.resolveSourceRow(lookups.terminalBench4.rowsByModelName);
  if (row != null) {
    assignedBenchmarks.benchmarks.terminal_bench_4 = row.score;
    assignedBenchmarks.scoringSources.terminal_bench_4 = row;
  }
};

/** Standalone assignment adapters keep benchmark-specific matching behind one exhaustive runtime registry. */
const STANDALONE_BENCHMARK_ADAPTERS = {
  agent_arena: {
    defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
      const row = findBaseModelSourceRow(modelNameCandidates, lookups.agentArena.rowsByModelName);
      if (row != null) {
        assignedBenchmarks.benchmarks.agent_arena = row.score;
        assignedBenchmarks.scoringSources.agent_arena = row;
      }
    },
  },
  agents_last_exam: {
    defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
      const row = findAgentsLastExamModelScore(
        modelNameCandidates,
        lookups.agentsLastExam.rowsByModelName,
      );
      if (row != null) {
        assignedBenchmarks.benchmarks.agents_last_exam = agentsLastExamBenchmarkScore(row);
        assignedBenchmarks.scoringSources.agents_last_exam = row;
      }
    },
  },
  ale_bench: {
    defaultVariant: addAleBench,
    observation: addAleBench,
  },
  blueprint_bench_2: {
    defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
      const score = findBlueprintBenchScore(
        modelNameCandidates,
        lookups.blueprintBench.rowsByModelName,
      );
      if (score != null) {
        assignedBenchmarks.benchmarks.blueprint_bench_2 = score;
      }
    },
  },
  cursorbench: {
    defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
      const row = findSourceRow(modelNameCandidates, lookups.cursorBench.rowsByModelName);
      if (row != null) {
        assignedBenchmarks.benchmarks.cursorbench = row.score;
        assignedBenchmarks.scoringSources.cursorbench = row;
      }
    },
  },
  deep_swe: {
    defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
      const row = findSourceRow(modelNameCandidates, lookups.deepSWE.rowsByModelName);
      if (row != null) {
        assignedBenchmarks.benchmarks.deep_swe = row.pass_at_1;
        assignedBenchmarks.scoringSources.deep_swe = row;
      }
    },
  },
  frontier_code: {
    defaultVariant: addFrontierCode,
    observation: addFrontierCode,
  },
  mercor_apex_agents: {
    defaultVariant: addMercorApexAgents,
    observation: addMercorApexAgents,
  },
  terminal_bench_4: {
    defaultVariant: addTerminalBench4,
    observation: addTerminalBench4,
  },
  vending_bench_2: {
    defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
      const row = findBaseModelSourceRow(
        modelNameCandidates,
        lookups.vendingBench2.rowsByModelName,
      );
      if (row != null) {
        assignedBenchmarks.benchmarks.vending_bench_2 = row.final_balance_usd;
        assignedBenchmarks.scoringSources.vending_bench_2 = row;
      }
    },
  },
} satisfies Record<BenchmarkRuntimeKeyFor<"standalone">, StandaloneBenchmarkAdapter>;

function assignStandaloneBenchmarks(
  kind: keyof StandaloneBenchmarkAdapter,
  context: StandaloneBenchmarkContext,
): void {
  for (const adapter of Object.values(
    STANDALONE_BENCHMARK_ADAPTERS,
  ) as StandaloneBenchmarkAdapter[]) {
    adapter[kind]?.(context);
  }
}

/** Builds benchmarks for one matched effort observation from effort-specific sources. */
export function buildObservationBenchmarks(
  modelNameCandidates: unknown[],
  lookups: BenchmarkAssignmentLookups,
  baseBenchmarks: Record<string, unknown> = {},
  targetReasoningEffort: unknown = null,
): AssignedBenchmarks {
  const assignedBenchmarks = buildArtificialAnalysisBenchmarks(
    modelNameCandidates,
    lookups.artificialAnalysisBenchmarkResources.observationLookup,
    baseBenchmarks,
    canonicalReasoningEffort(targetReasoningEffort),
  );
  const targetEffort = canonicalReasoningEffort(targetReasoningEffort);
  for (const { benchmark, sourceDataKey } of BENCHMARK_OBSERVATION_BINDINGS) {
    const row = findBenchmarkObservation(
      modelNameCandidates,
      targetEffort,
      benchmarkObservationLookup(lookups, sourceDataKey),
    );
    if (
      row?.reasoning_effort == null ||
      canonicalReasoningEffort(row.reasoning_effort) !== targetEffort
    ) {
      continue;
    }
    assignedBenchmarks.benchmarks[benchmark] = transformBenchmarkSourceValue(
      benchmark,
      row.canonical_value,
    );
    assignedBenchmarks.scoringSources[benchmark] = row;
  }
  assignStandaloneBenchmarks("observation", {
    assignedBenchmarks,
    lookups,
    modelNameCandidates,
    resolveSourceRow: (rowsByModelName) =>
      findEffortSourceRow(modelNameCandidates, targetReasoningEffort, rowsByModelName),
  });
  return assignedBenchmarks;
}

/** Builds benchmarks for one default variant from source-default and effort-unspecified observations. */
export function buildDefaultVariantBenchmarks(
  modelNameCandidates: unknown[],
  lookups: BenchmarkAssignmentLookups,
  baseBenchmarks: Record<string, unknown> = {},
  targetReasoningEffort: unknown = null,
): AssignedBenchmarks {
  const assignedBenchmarks = buildArtificialAnalysisBenchmarks(
    modelNameCandidates,
    lookups.artificialAnalysisBenchmarkResources.sourceDefaultLookup,
    baseBenchmarks,
  );
  const { benchmarks, scoringSources } = assignedBenchmarks;
  for (const { benchmark, sourceDataKey } of BENCHMARK_OBSERVATION_BINDINGS) {
    const row = findBenchmarkObservation(
      modelNameCandidates,
      targetReasoningEffort,
      benchmarkObservationLookup(lookups, sourceDataKey),
    );
    if (row != null) {
      benchmarks[benchmark] = transformBenchmarkSourceValue(benchmark, row.canonical_value);
      scoringSources[benchmark] = row;
    }
  }
  assignStandaloneBenchmarks("defaultVariant", {
    assignedBenchmarks,
    lookups,
    modelNameCandidates,
    resolveSourceRow: (rowsByModelName) =>
      findDefaultSourceRow(modelNameCandidates, targetReasoningEffort, rowsByModelName),
  });
  const riemannBenchScore = findRiemannBenchScore(
    modelNameCandidates,
    lookups.riemannBench.rowsByModelName,
  );
  if (riemannBenchScore != null) {
    benchmarks.riemann_bench = riemannBenchScore;
  }
  const valsIndexScore = findValsIndexScore(modelNameCandidates, lookups.valsIndex.rowsByModelName);
  if (valsIndexScore != null) {
    benchmarks.vals_index = valsIndexScore;
  }

  return {
    benchmarks,
    scoringSources,
  };
}

/** Assigns model-level benchmarks to one default variant without replacing exact variant observations. */
export function assignBenchmarksToVariants(
  rows: Record<string, unknown>[],
  lookups: BenchmarkAssignmentLookups,
): Record<string, unknown>[] {
  const defaultVariantByModel = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const modelKey = canonicalModelKey(row);
    const currentDefaultVariant = defaultVariantByModel.get(modelKey);
    const hasMatchedObservation = typeof row.artificial_analysis_id === "string";
    const currentHasMatchedObservation =
      typeof currentDefaultVariant?.artificial_analysis_id === "string";
    if (
      currentDefaultVariant == null ||
      (hasMatchedObservation && !currentHasMatchedObservation) ||
      (hasMatchedObservation === currentHasMatchedObservation &&
        reasoningEffortRank(row.reasoning_effort) >
          reasoningEffortRank(currentDefaultVariant.reasoning_effort))
    ) {
      defaultVariantByModel.set(modelKey, row);
    }
  }

  return rows.map((row) => {
    if (defaultVariantByModel.get(canonicalModelKey(row)) !== row) {
      return row;
    }
    const baseBenchmarks = asRecord(row.benchmarks);
    const defaultVariantBenchmarks = buildDefaultVariantBenchmarks(
      modelNameCandidates(row),
      lookups,
      baseBenchmarks,
      row.reasoning_effort,
    );
    const benchmarks = mergeVariantBenchmarkFields(
      baseBenchmarks,
      defaultVariantBenchmarks.benchmarks,
      defaultVariantBenchmarks.scoringSources,
    );
    const scoringSources = mergeVariantBenchmarkFields(
      asRecord(row.scoring_sources),
      defaultVariantBenchmarks.scoringSources,
      defaultVariantBenchmarks.scoringSources,
    );
    return {
      ...row,
      ...(Object.keys(benchmarks).length === 0 ? {} : { benchmarks }),
      ...(Object.keys(scoringSources).length === 0 ? {} : { scoring_sources: scoringSources }),
    };
  });
}
