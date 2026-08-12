/** Benchmark source policy owns loaders, adapters, processing, and persistence declarations. */

import type {
  BenchmarkObservationLoader,
  BenchmarkPersistenceFacet,
  BenchmarkProcessingFacet,
  BenchmarkSourceFacet,
  BenchmarkSourceGroup,
} from "../factory";
import type { BenchmarkKey } from "./portfolio";

/** Standard sources use the shared benchmark-observation loader and persistence contract. */
export const BENCHMARK_STANDARD_SOURCES = {
  arc_agi_2: {
    group: "standalone",
    id: "arc_prize",
    roles: ["observation", "resource"],
    loader: {
      kind: "arc_prize",
      datasetId: "v2_Semi_Private",
      sourceUrl: "https://arcprize.org/media/data/leaderboard/v2.json",
    },
    sourceDataKey: "arcAgi2",
    sourceRowsKey: "arcAgi2Rows",
  },
  arc_agi_3: {
    group: "standalone",
    id: "arc_prize",
    roles: ["observation", "resource"],
    loader: {
      kind: "arc_prize",
      datasetId: "v3_Semi_Private",
      sourceUrl: "https://arcprize.org/media/data/leaderboard/v3.json",
    },
    sourceDataKey: "arcAgi3",
    sourceRowsKey: "arcAgi3Rows",
  },
  browsecomp: {
    group: "standalone",
    id: "zeroeval",
    loader: {
      kind: "zeroeval",
      sourceUrl: "https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
    },
    sourceDataKey: "browseComp",
    sourceRowsKey: "browseCompRows",
  },
  chartography: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      sourceUrl: "https://surgehq.ai/benchmarks/chartography",
    },
    sourceDataKey: "chartography",
    sourceRowsKey: "chartographyRows",
  },
  chess_puzzles: {
    group: "epoch",
    id: "epoch",
    loader: { kind: "epoch_runs", task: "Chess Puzzles" },
    sourceDataKey: "chessPuzzles",
    sourceRowsKey: "chessPuzzleRows",
  },
  code_migration: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      sourceUrl: "https://www.vals.ai/benchmarks/code-migration",
    },
    sourceDataKey: "codeMigration",
    sourceRowsKey: "codeMigrationRows",
  },
  complex_constraints: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      sourceUrl: "https://surgehq.ai/benchmarks/complex-constraints",
    },
    sourceDataKey: "complexConstraints",
    sourceRowsKey: "complexConstraintsRows",
  },
  cyberbench: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "patch",
      sourceUrl: "https://www.vals.ai/benchmarks/cyber",
    },
    sourceDataKey: "cyberBench",
    sourceRowsKey: "cyberBenchRows",
  },
  ebr_bench: {
    group: "epoch",
    id: "epoch",
    loader: { kind: "epoch_runs", task: "EBR-bench" },
    sourceDataKey: "ebrBench",
    sourceRowsKey: "ebrBenchRows",
  },
  emb: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      sourceUrl: "https://www.vals.ai/benchmarks/emb",
    },
    sourceDataKey: "emb",
    sourceRowsKey: "embRows",
  },
  enterprisebench_corecraft: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      sourceUrl: "https://surgehq.ai/benchmarks/enterprisebench-corecraft",
    },
    sourceDataKey: "enterpriseBenchCoreCraft",
    sourceRowsKey: "enterpriseBenchCoreCraftRows",
  },
  epoch_capabilities_index: {
    group: "epoch",
    id: "epoch",
    loader: {
      kind: "epoch_capabilities_index",
      sourceUrl: "https://epoch.ai/data/eci_scores.csv",
    },
    sourceDataKey: "epochCapabilitiesIndex",
    sourceRowsKey: "epochCapabilitiesIndexRows",
  },
  finance_agent_v2: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "all_pass",
      sourceUrl: "https://www.vals.ai/benchmarks/fabv2",
    },
    sourceDataKey: "financeAgentV2",
    sourceRowsKey: "financeAgentV2Rows",
  },
  frontiermath_tier_4: {
    group: "epoch",
    id: "epoch",
    loader: {
      kind: "epoch_runs",
      task: "FrontierMath-Tier-4-v2-Private",
    },
    sourceDataKey: "frontierMathTier4",
    sourceRowsKey: "frontierMathTier4Rows",
  },
  gdp_pdf: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      sourceUrl: "https://surgehq.ai/leaderboards/gdp-pdf",
    },
    sourceDataKey: "gdpPdf",
    sourceRowsKey: "gdpPdfRows",
  },
  handbook_md: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      sourceUrl: "https://surgehq.ai/benchmarks/handbook",
    },
    sourceDataKey: "handbookMd",
    sourceRowsKey: "handbookMdRows",
  },
  hemingway_bench: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      scoreKind: "elo",
      sourceUrl: "https://surgehq.ai/benchmarks/hemingway-bench",
    },
    sourceDataKey: "hemingwayBench",
    sourceRowsKey: "hemingwayBenchRows",
  },
  legal_research: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      sourceUrl: "https://www.vals.ai/benchmarks/legal_research",
    },
    sourceDataKey: "legalResearch",
    sourceRowsKey: "legalResearchRows",
  },
  medcode: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      sourceUrl: "https://www.vals.ai/benchmarks/medcode",
    },
    sourceDataKey: "medCode",
    sourceRowsKey: "medCodeRows",
  },
  mls_bench: {
    group: "standalone",
    id: "mls_bench",
    loader: {
      kind: "mls_bench",
      sourceUrl: "https://mls-bench.com/leaderboard",
    },
    sourceDataKey: "mlsBench",
    sourceRowsKey: "mlsBenchRows",
  },
  omniscience_accuracy: {
    group: "artificial_analysis",
    id: "artificial_analysis",
    loader: {
      kind: "artificial_analysis_omniscience",
      sourceUrl: "https://artificialanalysis.ai/evaluations/omniscience",
    },
    sourceDataKey: "omniscienceAccuracy",
    sourceRowsKey: "omniscienceAccuracyRows",
  },
  perception_bench: {
    group: "standalone",
    id: "perception_bench",
    loader: {
      kind: "perception_bench",
      sourceUrl: "https://raw.githubusercontent.com/MoonshotAI/PerceptionBench/master/README.md",
    },
    sourceDataKey: "perceptionBench",
    sourceRowsKey: "perceptionBenchRows",
  },
  programbench: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "partial",
      sourceUrl: "https://www.vals.ai/benchmarks/programbench",
    },
    sourceDataKey: "programBench",
    sourceRowsKey: "programBenchRows",
  },
  proofbench: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      includeReasoningEffortInModel: false,
      eligibility: "exclude_aristotle",
      sourceUrl: "https://www.vals.ai/benchmarks/proof_bench",
    },
    sourceDataKey: "proofBench",
    sourceRowsKey: "proofBenchRows",
  },
  public_benefits_bench: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      sourceUrl: "https://www.vals.ai/benchmarks/public-benefits-bench",
    },
    sourceDataKey: "publicBenefitsBench",
    sourceRowsKey: "publicBenefitsBenchRows",
  },
  surge_intelligence_index: {
    group: "surge",
    id: "surge",
    loader: {
      kind: "surge",
      sourceUrl: "https://surgehq.ai/benchmarks",
      view: "index",
    },
    sourceDataKey: "surgeIntelligenceIndex",
    sourceRowsKey: "surgeIntelligenceIndexRows",
  },
  toolathlon: {
    group: "standalone",
    id: "zeroeval",
    loader: {
      kind: "zeroeval",
      sourceUrl: "https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
      rankField: "rank",
      observedAtField: "announcement_date",
    },
    sourceDataKey: "toolathlon",
    sourceRowsKey: "toolathlonRows",
  },
  vibe_code: {
    group: "vals",
    id: "vals",
    loader: {
      kind: "vals",
      canonicalTask: "overall",
      sourceUrl: "https://www.vals.ai/benchmarks/vibe-code",
    },
    sourceDataKey: "vibeCode",
    sourceRowsKey: "vibeCodeRows",
  },
  weirdml: {
    group: "standalone",
    id: "weirdml",
    loader: { kind: "weirdml" },
    sourceDataKey: "weirdMl",
    sourceRowsKey: "weirdMlRows",
  },
} as const satisfies Readonly<
  Partial<
    Record<
      BenchmarkKey,
      {
        group: BenchmarkSourceGroup;
        id: string;
        roles?: readonly ["observation"] | readonly ["observation", "resource"];
        loader: BenchmarkObservationLoader;
        sourceDataKey: string;
        sourceRowsKey: string;
      }
    >
  >
>;

/** Extended sources declare complete source facets when the standard contract is insufficient. */
export const BENCHMARK_EXTENDED_SOURCES = {
  aa_intelligence_index: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation"],
      },
    ],
  },
  agent_arena: {
    inputs: [
      {
        group: "standalone",
        id: "agent_arena",
        roles: ["observation"],
        runtime: { key: "agent_arena", publicRows: true },
      },
    ],
  },
  agents_last_exam: {
    inputs: [
      {
        group: "standalone",
        id: "agents_last_exam",
        roles: ["observation", "resource"],
        runtime: { key: "agents_last_exam", publicRows: true },
      },
    ],
  },
  ale_bench: {
    inputs: [
      {
        group: "standalone",
        id: "sakana",
        roles: ["observation", "resource"],
        runtime: { key: "ale_bench", publicRows: true },
      },
      { group: "epoch", id: "epoch", roles: ["validation"] },
    ],
  },
  analyst_agent: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            scoreKey: "aa_analyst_agent",
            url: "https://artificialanalysis.ai/evaluations/aa-analyst-agent",
            taskRunCount: 80,
          },
        ],
      },
    ],
  },
  apex_agents: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            url: "https://artificialanalysis.ai/evaluations/apex-agents-aa",
            taskRunCount: 452,
          },
        ],
      },
      {
        group: "standalone",
        id: "mercor",
        roles: ["imputation"],
        evidenceKey: "apex_agents_mercor",
        runtime: { key: "mercor_apex_agents", publicRows: false },
      },
    ],
  },
  automation_bench: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            scorePath: ["automation_bench_breakdown", "summary", "completion"],
            url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
            taskRunCount: 657,
          },
        ],
      },
    ],
  },
  blueprint_bench_2: {
    inputs: [
      {
        group: "standalone",
        id: "andon_labs",
        roles: ["observation"],
        runtime: { key: "blueprint_bench_2", publicRows: true },
      },
    ],
  },
  briefcase: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            scorePath: ["briefcase", "elo"],
            costPath: ["briefcaseCost"],
            tokenCountsPath: ["canonicalEvalTokenCounts", "briefcase"],
            secondsProcessor: "briefcase",
            rowDetectionKey: "briefcase",
            url: "https://artificialanalysis.ai/evaluations/aa-briefcase",
            taskRunCount: 91,
          },
        ],
      },
    ],
  },
  critpt: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            url: "https://artificialanalysis.ai/evaluations/critpt",
            taskRunCount: 70,
          },
        ],
      },
    ],
  },
  cursorbench: {
    inputs: [
      {
        group: "standalone",
        id: "cursor",
        roles: ["observation", "resource"],
        runtime: { key: "cursorbench", publicRows: true },
      },
    ],
  },
  deep_swe: {
    inputs: [
      {
        group: "standalone",
        id: "deep_swe",
        roles: ["observation", "resource"],
        runtime: { key: "deep_swe", publicRows: true },
      },
    ],
  },
  frontier_bench: {
    inputs: [
      {
        group: "standalone",
        id: "frontier_bench",
        roles: ["observation"],
        runtime: { key: "frontier_bench", publicRows: true },
      },
    ],
  },
  frontier_code: {
    inputs: [
      {
        group: "standalone",
        id: "cognition",
        roles: ["observation", "resource"],
        runtime: { key: "frontier_code", publicRows: true },
      },
    ],
  },
  gdpval_normalized: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            url: "https://artificialanalysis.ai/evaluations/gdpval-aa",
            taskRunCount: 220,
          },
        ],
      },
    ],
  },
  harvey_lab: {
    inputs: [
      {
        group: "vals",
        id: "vals",
        roles: ["observation", "resource"],
        runtime: { key: "vals_harvey_lab", publicRows: true },
      },
    ],
  },
  hle: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
            taskRunCount: 2158,
          },
        ],
      },
    ],
  },
  itbench_sre: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            scoreKey: "it_bench_sre",
            url: "https://artificialanalysis.ai/evaluations/itbench-aa",
            taskRunCount: 177,
          },
        ],
      },
    ],
  },
  riemann_bench: {
    inputs: [
      {
        group: "surge",
        id: "surge",
        roles: ["observation"],
        runtime: { key: "riemann_bench", publicRows: true },
      },
    ],
  },
  scicode: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            url: "https://artificialanalysis.ai/evaluations/scicode",
            taskRunCount: 288,
          },
        ],
      },
    ],
  },
  tau_banking: {
    inputs: [
      {
        group: "artificial_analysis",
        id: "artificial_analysis",
        roles: ["observation", "resource"],
        adapters: [
          {
            kind: "artificial_analysis_resource_page",
            url: "https://artificialanalysis.ai/evaluations/tau3-banking",
            taskRunCount: 97,
          },
        ],
      },
    ],
  },
  vals_index: {
    inputs: [
      {
        group: "vals",
        id: "vals",
        roles: ["observation"],
        runtime: { key: "vals_index", publicRows: true },
      },
    ],
  },
  vending_bench_2: {
    inputs: [
      {
        group: "standalone",
        id: "andon_labs",
        roles: ["observation"],
        runtime: { key: "vending_bench_2", publicRows: true },
      },
    ],
  },
  weirdml: {
    inputs: [
      {
        group: BENCHMARK_STANDARD_SOURCES.weirdml.group,
        id: BENCHMARK_STANDARD_SOURCES.weirdml.id,
        roles: ["observation"],
        adapters: [
          {
            kind: "benchmark_observation",
            sourceDataKey: BENCHMARK_STANDARD_SOURCES.weirdml.sourceDataKey,
            sourceRowsKey: BENCHMARK_STANDARD_SOURCES.weirdml.sourceRowsKey,
          },
        ],
      },
      { group: "epoch", id: "epoch", roles: ["observation", "validation"] },
    ],
  },
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkSourceFacet>>;
export const BENCHMARK_PROCESSING_OVERRIDES = {
  agents_last_exam: {
    aggregation: { kind: "custom" },
  },
  ale_bench: {
    sourceCrosswalk: { kind: "custom" },
  },
  briefcase: {
    transform: {
      kind: "linear",
      input: [500, 2_500],
      output: [0, 1],
      clamp: true,
    },
  },
  frontier_bench: {
    aggregation: { kind: "custom" },
  },
  weirdml: {
    sourceCrosswalk: { kind: "validated_merge" },
  },
} as const satisfies Partial<Record<BenchmarkKey, Partial<BenchmarkProcessingFacet>>>;

export const BENCHMARK_PERSISTENCE_OVERRIDES = {
  aa_intelligence_index: {
    location: { kind: "intelligence", field: "intelligence_index" },
  },
  omniscience_accuracy: {
    location: { kind: "intelligence", field: "omniscience_accuracy" },
  },
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkPersistenceFacet>>;
