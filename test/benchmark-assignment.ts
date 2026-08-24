/** Verifies benchmark assignment maps source rows onto the correct model variants. */

import assert from "node:assert/strict";

import {
  type BenchmarkObservationRow,
  buildBenchmarkObservationLookup,
} from "../src/model-atlas/benchmarks/observation";
import { STAGE_CONFIG } from "../src/model-atlas/config";
import { buildBenchmarkVersionLogRows } from "../src/model-atlas/database/snapshot-workflow";
import { buildBenchmarkModelMap } from "../src/model-atlas/identity/normalization";
import {
  assignBenchmarksToVariants,
  type BenchmarkAssignmentLookups,
  buildDefaultVariantBenchmarks,
  buildObservationBenchmarks,
} from "../src/model-atlas/pipeline/benchmark-rows";
import type { ModelAtlasCandidate, ModelAtlasModel } from "../src/model-atlas/pipeline/model-types";
import {
  buildTaskMetrics,
  versionCandidateBenchmarkData,
} from "../src/model-atlas/pipeline/selection/candidate";
import { prepareVersionReplacementBenchmarkRows } from "../src/model-atlas/pipeline/selection/version-replacement";
import type { AgentArenaModelScoreRow } from "../src/model-atlas/scrapers/benchmarks/agent-arena";
import type { AleBenchModelScoreRow } from "../src/model-atlas/scrapers/benchmarks/ale-bench";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../src/model-atlas/scrapers/benchmarks/artificial-analysis/results";
import type { FrontierCodeModelEffortRow } from "../src/model-atlas/scrapers/benchmarks/frontier-code";
import type { MercorApexAgentsRow } from "../src/model-atlas/scrapers/benchmarks/mercor-apex-agents";
import type { TerminalBench3ModelAgentRow } from "../src/model-atlas/scrapers/benchmarks/terminal-bench-3";
import type { HarveyLabModelScoreRow } from "../src/model-atlas/scrapers/benchmarks/vals/harvey-lab";
import type { VendingBench2ModelScoreRow } from "../src/model-atlas/scrapers/benchmarks/vending-bench-2";

const deepSWERow = {
  model: "Example Model Preview",
  reasoning_effort: null,
  config: null,
  pass_at_1: 0.72,
  ci_lo: null,
  ci_hi: null,
  ci_half: null,
  n_tasks_attempted: 113,
  mean_cost_usd: 4.2,
  mean_duration_seconds: 300,
  mean_output_tokens: 12_000,
};
const cursorBenchRow = {
  rank: 1,
  model: "Example Model",
  base_model: "Example Model",
  reasoning_effort: null,
  score_eligible: true,
  score: 0.52,
  cost_per_task_usd: 0.42,
  tokens_per_task: 12345,
  steps_per_task: 12,
};
const agentArenaRow: AgentArenaModelScoreRow = {
  rank: 1,
  contender_name: "contenders/example-model-agent",
  model: "Example Model",
  base_model: "Example Model",
  reasoning_effort: null,
  organization: "Test",
  score: 0.14,
};
const aleStatistics = (mean: number) => ({
  all: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
  short: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
  long: { mean, median: mean - 1, min: mean - 2, max: mean + 2, stdev: 1 },
});
const aleBenchRow: AleBenchModelScoreRow = {
  model: "Example Model-high",
  base_model: "Example Model",
  reasoning_effort: "high",
  detail_path: "data/example-model-high.json",
  num_self_refine: 1,
  rank: aleStatistics(5),
  performance: aleStatistics(700),
  input_tokens: aleStatistics(1_000),
  output_tokens: aleStatistics(2_000),
  total_tokens: aleStatistics(3_000),
  cost: aleStatistics(0.3),
  results: [],
  score: 700,
  cost_per_task_usd: 0.3,
  tokens_per_task: 3_000,
  input_tokens_per_task: 1_000,
  output_tokens_per_task: 2_000,
};
const frontierCodeRow: FrontierCodeModelEffortRow = {
  revision: "v1_1",
  model: "Example Model (high)",
  base_model: "Example Model",
  source_effort: "high",
  reasoning_effort: "high",
  harness: "codex",
  score_eligible: true,
  official_rank: 1,
  official_best_effort: true,
  main: {
    pass_rate: 0.58,
    score: 0.535,
    cost_per_task_usd: 0.75,
    tokens_per_task: 4_500,
    tool_calls_per_task: 18,
    steps_per_task: 12,
    output_token_equivalent_per_task: 2_000,
  },
  extended: {
    pass_rate: 0.4,
    score: 0.35,
    cost_per_task_usd: 0.6,
    tokens_per_task: 3_500,
    tool_calls_per_task: 14,
    steps_per_task: 10,
    output_token_equivalent_per_task: 1_500,
  },
  score: 0.535,
  cost_per_task_usd: 0.75,
  tokens_per_task: 4_500,
};
const terminalBench3Row: TerminalBench3ModelAgentRow = {
  revision: "3_0_0",
  model: "Example Model (high)",
  base_model: "Example Model",
  reasoning_effort: "high",
  harness: "mini-SWE-agent",
  score: 0.4353,
  score_standard_error: 0.0165,
};
const mercorApexRow: MercorApexAgentsRow = {
  model_id: "test/example-model",
  source_model: "Example Model (High)",
  model: "Example Model (high)",
  base_model: "Example Model",
  reasoning_effort: "high",
  organization: "Test",
  score: 0.4,
};
const vendingBench2Row: VendingBench2ModelScoreRow = {
  rank: 1,
  model: "Example Model",
  base_model: "Example Model",
  reasoning_effort: null,
  run_count: 5,
  final_balance_usd: 9_000,
  daily_balance_usd: [500, 9_000],
};
const artificialAnalysisHleResourceRow = {
  benchmark_key: "hle",
  source_url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
  model_id: "test/example-model",
  model: "Example Model",
  provider: "Test",
  provider_id: "test",
  reasoning_effort: null,
  score: 0.4,
  task_run_count: 2158,
  cost_per_task_usd: 0.02,
  seconds_per_task: 3,
  tokens_per_task: 123,
  input_tokens_per_task: 23,
  output_tokens_per_task: 100,
  answer_tokens_per_task: 40,
  reasoning_tokens_per_task: 60,
} satisfies ArtificialAnalysisBenchmarkResourceRow;
const briefcaseResourceRow = {
  benchmark_key: "briefcase",
  source_url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
  model_id: "test/example-model",
  model: "Example Model",
  provider: "Test",
  provider_id: "test",
  reasoning_effort: null,
  score: 1500,
  task_run_count: 91,
  cost_per_task_usd: 2.5,
  seconds_per_task: 120,
  tokens_per_task: 1000,
  input_tokens_per_task: 800,
  output_tokens_per_task: 200,
  answer_tokens_per_task: 80,
  reasoning_tokens_per_task: 120,
} satisfies ArtificialAnalysisBenchmarkResourceRow;
const analystAgentResourceRow = {
  benchmark_key: "analyst_agent",
  source_url: "https://artificialanalysis.ai/evaluations/aa-analyst-agent",
  model_id: "test/example-model",
  model: "Example Model",
  provider: "Test",
  provider_id: "test",
  reasoning_effort: null,
  score: 0.5,
  task_run_count: 80,
  cost_per_task_usd: 1.15,
  seconds_per_task: 144,
  tokens_per_task: 531_348,
  input_tokens_per_task: 520_168,
  output_tokens_per_task: 11_180,
  answer_tokens_per_task: 2_000,
  reasoning_tokens_per_task: 9_180,
} satisfies ArtificialAnalysisBenchmarkResourceRow;
const automationBenchResourceRow = {
  benchmark_key: "automation_bench",
  source_url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
  model_id: "test/example-model",
  model: "Example Model",
  provider: "Test",
  provider_id: "test",
  reasoning_effort: null,
  score: 0.68,
  task_run_count: 657,
  cost_per_task_usd: 0.12,
  seconds_per_task: 15,
  tokens_per_task: 700,
  input_tokens_per_task: 600,
  output_tokens_per_task: 100,
  answer_tokens_per_task: 60,
  reasoning_tokens_per_task: 40,
} satisfies ArtificialAnalysisBenchmarkResourceRow;
const harveyLabRow = {
  task: "overall",
  task_label: "Overall",
  metric: "task_resolution",
  model_id: "test/example-model",
  model: "example-model",
  base_model: "example-model",
  reasoning_effort: null,
  provider: "Test",
  rank: 1,
  score: 0.1125,
  criterion_pass: 0.9048,
  standard_error: 0.024,
  cost_per_task_usd: 19.225253,
  seconds_per_task: 1613.04,
  temperature: 1,
  top_p: null,
  max_output_tokens: 128_000,
  verbosity: null,
  compute_effort: null,
  harness: null,
} satisfies HarveyLabModelScoreRow;
const itbenchResourceRow = {
  benchmark_key: "itbench_sre",
  source_url: "https://artificialanalysis.ai/evaluations/itbench-aa",
  model_id: "test/example-model",
  model: "Example Model",
  provider: "Test",
  provider_id: "test",
  reasoning_effort: null,
  score: 0.56,
  task_run_count: 177,
  cost_per_task_usd: 1.2,
  seconds_per_task: 180,
  tokens_per_task: 1500,
  input_tokens_per_task: 1300,
  output_tokens_per_task: 200,
  answer_tokens_per_task: 80,
  reasoning_tokens_per_task: 120,
} satisfies ArtificialAnalysisBenchmarkResourceRow;
const legalResearchRow = {
  benchmark_key: "legal_research",
  source_url: "https://www.vals.ai/benchmarks/legal_research",
  model_id: "test/example-model",
  model: "Example Model",
  base_model: "Example Model",
  reasoning_effort: null,
  model_creator: "Test",
  rank: 1,
  canonical_value: 0.61,
  observed_at: null,
  metadata: {},
} satisfies BenchmarkObservationRow;
const chartographyRow = {
  ...legalResearchRow,
  benchmark_key: "chartography",
  source_url: "https://www.surgehq.ai/leaderboard/chartography",
  canonical_value: 0.47,
} satisfies BenchmarkObservationRow;
const arcAgi3Row = {
  benchmark_key: "arc_agi_3",
  source_url: "https://arcprize.org/media/data/leaderboard/v3.json",
  model_id: "test-example-model-high",
  model: "Example Model (High)",
  base_model: "Example Model",
  reasoning_effort: "high",
  model_creator: "Test",
  rank: 1,
  canonical_value: 0.3,
  cost: 20_000,
  observed_at: null,
  metadata: {},
} satisfies BenchmarkObservationRow;

const resourceLookup = new Map([
  ["analyst_agent", new Map([["example-model", analystAgentResourceRow]])],
  ["briefcase", new Map([["example-model", briefcaseResourceRow]])],
  ["automation_bench", new Map([["example-model", automationBenchResourceRow]])],
  ["hle", new Map([["example-model", artificialAnalysisHleResourceRow]])],
  ["itbench_sre", new Map([["example-model", itbenchResourceRow]])],
]);
const lookups = {
  artificialAnalysisBenchmarkResources: {
    observationLookup: resourceLookup,
    sourceDefaultLookup: resourceLookup,
  },
  agentArena: {
    rowsByModelName: new Map([["example-model", agentArenaRow]]),
  },
  agentsLastExam: {
    rowsByModelName: emptyLookup(),
  },
  aleBench: { rowsByModelName: buildBenchmarkModelMap([aleBenchRow]) },
  arcAgi2: { rowsByModelName: emptyLookup() },
  arcAgi3: { rowsByModelName: buildBenchmarkObservationLookup([arcAgi3Row]) },
  blueprintBench: {
    rowsByModelName: emptyLookup(),
  },
  browseComp: {
    rowsByModelName: emptyLookup(),
  },
  codeMigration: { rowsByModelName: emptyLookup() },
  chartography: {
    rowsByModelName: buildBenchmarkObservationLookup([chartographyRow]),
  },
  complexConstraints: { rowsByModelName: emptyLookup() },
  chessPuzzles: { rowsByModelName: new Map() },
  cursorBench: {
    rowsByModelName: new Map([["example-model", cursorBenchRow]]),
  },
  cyberBench: { rowsByModelName: emptyLookup() },
  deepSWE: {
    rowsByModelName: new Map([["example-model-preview", deepSWERow]]),
  },
  ebrBench: { rowsByModelName: new Map() },
  emb: { rowsByModelName: emptyLookup() },
  enterpriseBenchCoreCraft: { rowsByModelName: new Map() },
  epochCapabilitiesIndex: { rowsByModelName: new Map() },
  financeAgentV2: { rowsByModelName: emptyLookup() },
  frontierCode: {
    rowsByModelName: buildBenchmarkModelMap([frontierCodeRow]),
  },
  frontierMathTier4: { rowsByModelName: new Map() },
  gdpPdf: {
    rowsByModelName: emptyLookup(),
  },
  handbookMd: { rowsByModelName: new Map() },
  harveyLab: {
    rowsByModelName: new Map([["example-model", harveyLabRow]]),
  },
  hemingwayBench: { rowsByModelName: emptyLookup() },
  legalResearch: {
    rowsByModelName: buildBenchmarkObservationLookup([legalResearchRow]),
  },
  mlsBench: { rowsByModelName: emptyLookup() },
  omniscienceAccuracy: { rowsByModelName: emptyLookup() },
  mercorApexAgents: {
    rowsByModelName: new Map([["example-model", mercorApexRow]]),
  },
  perceptionBench: { rowsByModelName: emptyLookup() },
  proofBench: { rowsByModelName: new Map() },
  programBench: { rowsByModelName: emptyLookup() },
  publicBenefitsBench: { rowsByModelName: emptyLookup() },
  riemannBench: {
    rowsByModelName: emptyLookup(),
  },
  surgeIntelligenceIndex: { rowsByModelName: emptyLookup() },
  terminalBench3: {
    rowsByModelName: buildBenchmarkModelMap([terminalBench3Row]),
  },
  toolathlon: {
    rowsByModelName: emptyLookup(),
  },
  valsIndex: {
    rowsByModelName: emptyLookup(),
  },
  vendingBench2: {
    rowsByModelName: new Map([["example-model", vendingBench2Row]]),
  },
  vibeCode: { rowsByModelName: emptyLookup() },
  weirdMl: { rowsByModelName: new Map() },
} satisfies BenchmarkAssignmentLookups;

const observationAssignment = buildObservationBenchmarks(["Example Model"], lookups, {
  hle: 0.4,
});
assert.deepEqual(observationAssignment.benchmarks, {
  ale_bench: 700,
  analyst_agent: 0.5,
  automation_bench: 0.68,
  briefcase: 0.5,
  frontier_code: 0.535,
  hle: 0.4,
  itbench_sre: 0.56,
  terminal_bench_3: 0.4353,
});
assert.equal((observationAssignment.benchmarks as Record<string, unknown>).deep_swe, undefined);
assert.equal((observationAssignment.benchmarks as Record<string, unknown>).cursorbench, undefined);
assert.equal((observationAssignment.benchmarks as Record<string, unknown>).arc_agi_3, undefined);

const effortObservationAssignment = buildObservationBenchmarks(
  ["Example Model"],
  lookups,
  {},
  "high",
);
assert.equal(effortObservationAssignment.benchmarks.arc_agi_3, 0.3);
assert.equal(effortObservationAssignment.scoringSources.arc_agi_3, arcAgi3Row);

const defaultVariantAssignment = buildDefaultVariantBenchmarks(["Example Model"], lookups, {
  hle: 0.4,
});

assert.deepEqual(defaultVariantAssignment.benchmarks, {
  agent_arena: 0.14,
  ale_bench: 700,
  analyst_agent: 0.5,
  arc_agi_3: 0.3,
  automation_bench: 0.68,
  briefcase: 0.5,
  chartography: 0.47,
  cursorbench: 0.52,
  deep_swe: 0.72,
  frontier_code: 0.535,
  harvey_lab: 0.1125,
  hle: 0.4,
  itbench_sre: 0.56,
  legal_research: 0.61,
  terminal_bench_3: 0.4353,
  vending_bench_2: 9_000,
});
assert.deepEqual(defaultVariantAssignment.scoringSources, {
  agent_arena: agentArenaRow,
  ale_bench: aleBenchRow,
  analyst_agent: analystAgentResourceRow,
  apex_agents_mercor: mercorApexRow,
  arc_agi_3: arcAgi3Row,
  automation_bench: automationBenchResourceRow,
  briefcase: briefcaseResourceRow,
  chartography: chartographyRow,
  cursorbench: cursorBenchRow,
  deep_swe: deepSWERow,
  frontier_code: frontierCodeRow,
  harvey_lab: harveyLabRow,
  hle: artificialAnalysisHleResourceRow,
  itbench_sre: itbenchResourceRow,
  legal_research: legalResearchRow,
  terminal_bench_3: terminalBench3Row,
  vending_bench_2: vendingBench2Row,
});
const effortQualifiedDefault = buildDefaultVariantBenchmarks(
  ["Example Model - Max"],
  lookups,
  {},
  "max",
);
assert.deepEqual(effortQualifiedDefault.benchmarks, {
  agent_arena: 0.14,
  chartography: 0.47,
  legal_research: 0.61,
  vending_bench_2: 9_000,
});
assert.deepEqual(effortQualifiedDefault.scoringSources, {
  agent_arena: agentArenaRow,
  chartography: chartographyRow,
  legal_research: legalResearchRow,
  vending_bench_2: vendingBench2Row,
});
const sourceOnlyEffortAssignment = assignBenchmarksToVariants(
  [
    {
      id: "test/example-model",
      name: "Example Model",
      artificial_analysis_id: "test/example-model-max",
      reasoning_effort: "max",
      benchmarks: {},
    },
  ],
  lookups,
);
const [sourceOnlyEffortVariant] = sourceOnlyEffortAssignment;
assert.ok(sourceOnlyEffortVariant);
assert.equal(
  (sourceOnlyEffortVariant.benchmarks as Record<string, unknown>).arc_agi_3,
  undefined,
  "a source-only effort must not become an exact result on another effort variant",
);
assert.deepEqual(buildTaskMetrics(null, defaultVariantAssignment.scoringSources), {
  ale_bench: {
    cost: 0.3,
    tokens: 3_000,
    input_tokens: 1_000,
    output_tokens: 2_000,
  },
  analyst_agent: {
    cost: 1.15,
    seconds: 144,
    tokens: 531_348,
    input_tokens: 520_168,
    output_tokens: 11_180,
  },
  automation_bench: {
    cost: 0.12,
    seconds: 15,
    tokens: 700,
    input_tokens: 600,
    output_tokens: 100,
  },
  arc_agi_3: {
    cost: 20_000,
  },
  briefcase: {
    cost: 2.5,
    seconds: 120,
    tokens: 1000,
    input_tokens: 800,
    output_tokens: 200,
  },
  cursorbench: {
    cost: 0.42,
    tokens: 12345,
  },
  frontier_code: {
    cost: 0.75,
    tokens: 4_500,
  },
  deep_swe: {
    cost: 4.2,
    seconds: 300,
    output_tokens: 12000,
  },
  harvey_lab: {
    cost: 19.225253,
    seconds: 1613.04,
  },
  hle: {
    cost: 0.02,
    seconds: 3,
    tokens: 123,
    input_tokens: 23,
    output_tokens: 100,
  },
  itbench_sre: {
    cost: 1.2,
    seconds: 180,
    tokens: 1500,
    input_tokens: 1300,
    output_tokens: 200,
  },
});
const replacementRows = prepareVersionReplacementBenchmarkRows(
  [
    {
      id: "example/example-model-0806",
      reasoning_effort: "max",
      release_date: "2026-07-31",
      version_replacement_source_id: "example/example-model",
      intelligence: { intelligence_index: 49.9 },
      benchmarks: {
        blueprint_bench_2: 0.4,
        browsecomp: 0.55,
        chess_puzzles: 0.5,
        critpt: 0.7,
        epoch_capabilities_index: 0.45,
        hle: 0.36,
        riemann_bench: 0.7,
        scicode: 0.5,
        vals_index: 0.64,
      },
      scoring_sources: {
        blueprint_bench_2: { model: "Example Model" },
        browsecomp: { model: "Example Model 0806" },
        chess_puzzles: {
          model: "Example Model",
          observed_at: "2026-08-01",
        },
        epoch_capabilities_index: { model: "Example Model" },
        hle: {
          model: "Example Model",
          source_url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
        },
        intelligence_index: {
          model: "Example Model",
          source_url: "https://artificialanalysis.ai/leaderboard/models",
        },
        vals_index: {
          model_id: "example/example-model-0806",
          source_url: "https://www.vals.ai/benchmarks/vals-index",
        },
      },
    },
  ],
  [
    {
      id: "example/example-model",
      reasoning_effort: "max",
      intelligence: { intelligence_index: 49.9 },
      benchmarks: {
        blueprint_bench_2: 0.4,
        browsecomp: 0.55,
        chess_puzzles: 0.5,
        critpt: 0.7,
        epoch_capabilities_index: 0.45,
        hle: 0.36,
        riemann_bench: 0.6,
        scicode: 0.5,
        vals_index: 0.64,
      },
      benchmark_dates: { chess_puzzles: "2026-07-01" },
    } as unknown as ModelAtlasModel,
    {
      id: "example/example-model-0806",
      reasoning_effort: "max",
      benchmarks: { blueprint_bench_2: 0.9 },
    } as ModelAtlasModel,
  ],
  STAGE_CONFIG.scoring,
);
const replacementRow = replacementRows[0];
assert.ok(replacementRow);
const replacementBenchmarks = replacementRow.benchmarks as Record<string, unknown>;
assert.equal(
  replacementBenchmarks.blueprint_bench_2,
  undefined,
  "an unchanged ambiguously named benchmark should not transfer to a replacement version",
);
assert.equal(
  replacementBenchmarks.epoch_capabilities_index,
  undefined,
  "ECI should not be a special freshness authority",
);
assert.equal(replacementBenchmarks.riemann_bench, 0.7, "a changed benchmark should remain");
assert.equal(
  replacementBenchmarks.browsecomp,
  0.55,
  "a source row that explicitly names the replacement version should remain",
);
assert.equal(
  replacementBenchmarks.hle,
  0.36,
  "a confirmed stable AA alias should identify the current replacement version",
);
assert.equal(
  replacementBenchmarks.scicode,
  0.5,
  "another native AA benchmark should inherit the confirmed row-level replacement identity",
);
assert.equal(
  replacementBenchmarks.chess_puzzles,
  0.5,
  "a source observation dated after the replacement release and prior evidence should remain",
);
assert.equal(
  replacementBenchmarks.vals_index,
  0.64,
  "version-current Vals benchmark evidence should remain",
);
assert.equal(
  (replacementRow.intelligence as Record<string, unknown>).intelligence_index,
  49.9,
  "the native AA index should inherit the confirmed row-level replacement identity",
);
assert.equal(
  (replacementRow.scoring_sources as Record<string, unknown>).blueprint_bench_2,
  undefined,
  "stale task telemetry should be removed with its benchmark",
);

const establishedReplacementRows = prepareVersionReplacementBenchmarkRows(
  replacementRows,
  [replacementRow as unknown as ModelAtlasModel],
  STAGE_CONFIG.scoring,
);
assert.strictEqual(
  establishedReplacementRows[0],
  replacementRows[0],
  "later refreshes should keep already-clean replacement evidence stable",
);

const laterReplacementRows = prepareVersionReplacementBenchmarkRows(
  [
    {
      ...replacementRow,
      benchmarks: { ...replacementBenchmarks, blueprint_bench_2: 0.4 },
      scoring_sources: {
        ...(replacementRow.scoring_sources as Record<string, unknown>),
        blueprint_bench_2: { model: "Example Model" },
      },
    },
  ],
  [replacementRow as unknown as ModelAtlasModel],
  STAGE_CONFIG.scoring,
);
const laterReplacementRow = laterReplacementRows[0];
assert.ok(laterReplacementRow);
assert.equal(
  (laterReplacementRow.benchmarks as Record<string, unknown>).blueprint_bench_2,
  undefined,
  "a later refresh should not reattach ambiguous evidence absent from the accepted replacement",
);

const versionedLuna = versionCandidateBenchmarkData(
  {
    id: "openai/gpt-5.6-luna",
    reasoning_effort: "max",
    task_metrics: {
      deep_swe: {
        cost: 4.2,
        seconds: 300,
        output_tokens: 12_000,
      },
      cursorbench: {
        cost: 0.42,
        tokens: 12_345,
      },
      harvey_lab: {
        cost: 2,
        seconds: 20,
      },
    },
    benchmarks: {
      deep_swe: 0.72,
      cursorbench: 0.52,
    },
  } as ModelAtlasCandidate,
  {
    id: "openai/gpt-5.6-luna",
    reasoning_effort: "max",
    task_metrics: {
      deep_swe: {
        cost: 4.2,
        seconds: 300,
        output_tokens: 12_000,
      },
      cursorbench: {
        cost: 2.1,
        tokens: 12_345,
      },
      harvey_lab: {
        cost: 2,
        seconds: 19,
      },
    },
    benchmarks: {
      deep_swe: 0.72,
      cursorbench: 0.5,
      vending_bench_2: 4_094.712,
    },
    benchmark_dates: null,
  } as ModelAtlasModel,
  {
    baselineDate: "2026-07-30",
    observedDate: "2026-07-31",
  },
);
assert.deepEqual(
  versionedLuna.benchmark_dates,
  {
    deep_swe: "2026-07-30",
    cursorbench: "2026-07-31",
  },
  "unchanged benchmark values should retain the seeded date while changed values advance",
);
assert.deepEqual(
  versionedLuna.task_metrics?.deep_swe,
  {
    cost: 0.8400000000000001,
    observed_cost: 4.2,
    seconds: 300,
    output_tokens: 12_000,
    observed_at: "2026-07-30",
    cost_price_ratio: 0.2,
  },
  "unchanged pre-transition task costs should preserve the observed value and apply the price ratio",
);
assert.deepEqual(
  versionedLuna.task_metrics?.cursorbench,
  {
    cost: 0.42,
    observed_cost: 0.42,
    tokens: 12_345,
    observed_at: "2026-07-31",
    cost_price_ratio: 1,
  },
  "changed task costs should be dated now and should not be adjusted a second time",
);
assert.deepEqual(
  versionedLuna.task_metrics?.harvey_lab,
  {
    cost: 2,
    observed_cost: 2,
    seconds: 20,
    observed_at: "2026-07-31",
    cost_price_ratio: 1,
  },
  "a change anywhere in the same task row should disable price compression",
);
const lunaVersionLog = buildBenchmarkVersionLogRows(
  [
    {
      id: "openai/gpt-5.6-luna",
      reasoning_effort: "max",
      task_metrics: {
        deep_swe: {
          cost: 4.2,
          seconds: 300,
          output_tokens: 12_000,
        },
        cursorbench: {
          cost: 2.1,
          tokens: 12_345,
        },
      },
      benchmarks: {
        deep_swe: 0.72,
        vending_bench_2: 4_094.712,
      },
      benchmark_dates: null,
    } as ModelAtlasModel,
  ],
  [versionedLuna as unknown as ModelAtlasModel],
  "2026-07-30",
  "2026-07-31",
);
assert.deepEqual(
  lunaVersionLog
    .filter(({ benchmark_key }) => benchmark_key === "vending_bench_2")
    .map(({ version_date, change_kind, value_json }) => ({
      version_date,
      change_kind,
      value_json,
    })),
  [
    {
      version_date: "2026-07-30",
      change_kind: "baseline",
      value_json: "4094.712",
    },
    {
      version_date: "2026-07-31",
      change_kind: "removed",
      value_json: null,
    },
  ],
  "the version log should preserve the baseline and append a dated removal",
);
assert.deepEqual(
  lunaVersionLog
    .filter(({ benchmark_key }) => benchmark_key === "cursorbench")
    .map(({ metric_kind, version_date, change_kind }) => ({
      metric_kind,
      version_date,
      change_kind,
    })),
  [
    {
      metric_kind: "score",
      version_date: "2026-07-31",
      change_kind: "added",
    },
    {
      metric_kind: "task",
      version_date: "2026-07-30",
      change_kind: "baseline",
    },
    {
      metric_kind: "task",
      version_date: "2026-07-31",
      change_kind: "changed",
    },
  ],
  "new identities should be added while changed content on an existing identity is versioned",
);

const variantAutomationBenchResourceRow = {
  ...automationBenchResourceRow,
  model_id: "test/example-model-medium",
  model: "Example Model (medium)",
  reasoning_effort: "medium",
  score: 0.61,
  cost_per_task_usd: 0.04,
  seconds_per_task: 6,
} satisfies ArtificialAnalysisBenchmarkResourceRow;
const [assignedObservation, assignedDefaultVariant, unassignedFastRoute] =
  assignBenchmarksToVariants(
    [
      {
        id: "test/example-model",
        name: "Example Model",
        artificial_analysis_id: "test/example-model-medium",
        reasoning_effort: "medium",
        benchmarks: {
          automation_bench: variantAutomationBenchResourceRow.score,
        },
        scoring_sources: {
          automation_bench: variantAutomationBenchResourceRow,
        },
      },
      {
        id: "test/example-model",
        name: "Example Model",
        artificial_analysis_id: "test/example-model",
        reasoning_effort: "max",
        benchmarks: {},
      },
      {
        id: "test/example-model-fast",
        name: "Example Model (Fast)",
        reasoning_effort: null,
        benchmarks: {},
      },
    ],
    lookups,
  );
assert.ok(assignedObservation, "benchmark assignment must preserve the input observation");
assert.equal(
  (assignedObservation.benchmarks as Record<string, unknown>).automation_bench,
  variantAutomationBenchResourceRow.score,
  "default-variant benchmarks must not overwrite an effort observation's benchmark value",
);
assert.equal(
  (
    (assignedObservation.scoring_sources as Record<string, unknown>)
      .automation_bench as ArtificialAnalysisBenchmarkResourceRow
  ).cost_per_task_usd,
  variantAutomationBenchResourceRow.cost_per_task_usd,
  "default-variant benchmarks must not overwrite effort-specific resources",
);
assert.equal(
  (assignedObservation.benchmarks as Record<string, unknown>).cursorbench,
  undefined,
  "model-level benchmarks should not be copied onto lower effort variants",
);
assert.ok(assignedDefaultVariant, "expected the default variant");
assert.equal(
  (assignedDefaultVariant.benchmarks as Record<string, unknown>).cursorbench,
  cursorBenchRow.score,
  "model-level benchmarks should belong to the selected default variant",
);
assert.ok(unassignedFastRoute, "expected the catalog-only fast route");
assert.equal(
  (unassignedFastRoute.benchmarks as Record<string, unknown>).cursorbench,
  undefined,
  "catalog-only routes should not outrank matched effort observations",
);

const chartographyRows = [
  {
    benchmark_key: "chartography",
    source_url: "https://surgehq.ai/benchmarks/chartography",
    model_id: null,
    model: "Example Model",
    base_model: "Example Model",
    reasoning_effort: null,
    model_creator: "Test",
    rank: 2,
    canonical_value: 0.295,
    observed_at: null,
    metadata: {},
  },
  {
    benchmark_key: "chartography",
    source_url: "https://surgehq.ai/benchmarks/chartography",
    model_id: null,
    model: "Example Model (max)",
    base_model: "Example Model",
    reasoning_effort: "max",
    model_creator: "Test",
    rank: 1,
    canonical_value: 0.348,
    observed_at: null,
    metadata: {},
  },
] satisfies BenchmarkObservationRow[];
const [singleVariant] = assignBenchmarksToVariants(
  [
    {
      id: "test/example-model",
      name: "Example Model",
      artificial_analysis_id: "test/example-model",
      reasoning_effort: null,
      benchmarks: { chartography: 0.295 },
    },
  ],
  {
    ...lookups,
    chartography: {
      rowsByModelName: buildBenchmarkObservationLookup(chartographyRows),
    },
  },
);
assert.ok(singleVariant);
assert.equal(
  (singleVariant.benchmarks as Record<string, unknown>).chartography,
  0.348,
  "a source max effort should become the single Atlas row's default",
);
/** Return a typed empty lookup map for sources not involved in this test. */
function emptyLookup(): Map<string, never> {
  return new Map<string, never>();
}
