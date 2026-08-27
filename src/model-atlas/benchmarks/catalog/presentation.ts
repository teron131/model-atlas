/** Benchmark presentation policy owns labels, tooltips, columns, and ordering. */

import type {
  BenchmarkColumnFacet,
  BenchmarkPresentationDetail,
  BenchmarkTaskMetricColumnFacet,
} from "../factory";
import type { BenchmarkKey } from "./portfolio";

export const BENCHMARK_TOOLTIPS = {
  aa_intelligence_index: {
    title: "Artificial Analysis Intelligence Index",
    body: "Composite score across mathematics, science, coding, knowledge, and agentic evaluations.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "broad intelligence index"],
    ],
  },
  agent_arena: {
    title: "Agent Arena",
    body: "Randomized real-world Agent Mode sessions measuring how the orchestrator model changes task success, user feedback, steerability, and tool reliability.",
    rows: [
      ["Source", "Arena"],
      ["Role", "real-world agent performance"],
    ],
  },
  agents_last_exam: {
    title: "Agents' Last Exam",
    body: "Software and professional tasks graded for both complete solutions and meaningful partial progress.",
    rows: [
      ["Source", "Agents' Last Exam"],
      ["Split", "Full Overall"],
      ["Role", "agentic real-world work"],
    ],
  },
  ale_bench: {
    title: "ALE-Bench",
    body: "Executable heuristic-optimization problems where models design algorithms and improve them through iterative feedback.",
    rows: [
      ["Source", "Sakana AI; Epoch validation"],
      ["Role", "algorithm design and code execution"],
    ],
  },
  analyst_agent: {
    title: "AnalystAgent",
    body: "Answer quantitative business and scientific questions by analyzing supplied spreadsheets and documents with code execution.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Metric", "pass^5"],
      ["Role", "quantitative analysis workflow"],
    ],
  },
  apex_agents: {
    title: "APEX Agents",
    body: "Long-horizon consulting, investment-banking, and legal tasks completed across files and workplace tools.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "agentic task completion"],
    ],
  },
  automation_bench: {
    title: "AutomationBench",
    body: "Multi-step workflows across simulated SaaS apps, scored by objectives completed without guardrail violations.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "agentic SaaS workflow"],
    ],
  },
  arc_agi_2: {
    title: "ARC-AGI-2",
    body: "Solve novel abstract visual transformation tasks from a small set of demonstrations.",
    rows: [
      ["Source", "ARC Prize verified leaderboard"],
      ["Split", "Semi-Private"],
      ["Metric", "task success"],
      ["Role", "fluid reasoning"],
    ],
  },
  arc_agi_3: {
    title: "ARC-AGI-3",
    body: "Discover rules and solve unfamiliar interactive environments through efficient action and feedback.",
    rows: [
      ["Source", "ARC Prize verified leaderboard"],
      ["Split", "Semi-Private"],
      ["Metric", "human-relative action efficiency"],
      ["Role", "interactive fluid reasoning"],
    ],
  },
  blueprint_bench_2: {
    title: "Blueprint-Bench 2",
    body: "Reconstruct apartment floor plans from interior photographs.",
    rows: [
      ["Source", "Andon Labs"],
      ["Role", "spatial reasoning"],
    ],
  },
  briefcase: {
    title: "Briefcase",
    body: "Multi-file business projects requiring spreadsheets, presentations, and memos, graded for correctness, analysis, and presentation.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "agentic knowledge work"],
    ],
  },
  browsecomp: {
    title: "BrowseComp",
    body: "Find obscure information on the web and return short, verifiable answers.",
    rows: [
      ["Source", "LLM Stats / ZeroEval"],
      ["Role", "web information retrieval"],
    ],
  },
  chartography: {
    title: "Chartography",
    body: "Answer difficult questions about specialized charts using visual perception, domain knowledge, and multi-step reasoning.",
    rows: [
      ["Source", "Surge AI"],
      ["Role", "professional graphical reasoning"],
    ],
  },
  chess_puzzles: {
    title: "Chess Puzzles",
    body: "Choose the best move from 100 novel engine-generated chess positions represented as FEN boards.",
    rows: [
      ["Source", "Epoch AI"],
      ["Role", "planning and game reasoning"],
    ],
  },
  code_migration: {
    title: "Code Migration",
    body: "Reimplement working programs in new languages, scored by hidden behavioral tests and anti-cheat checks.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "hidden-test pass rate"],
      ["Role", "repository migration workflow"],
    ],
  },
  complex_constraints: {
    title: "ComplexConstraints",
    body: "Complete realistic professional writing, scheduling, and planning tasks while satisfying interdependent, conditional, implicit, and multistep requirements.",
    rows: [
      ["Source", "Surge AI"],
      ["Metric", "all-criteria task pass rate"],
      ["Role", "complex instruction following"],
    ],
  },
  critpt: {
    title: "CritPt",
    body: "Solve research-level physics problems with numeric, symbolic, and code-based answers.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "physics reasoning"],
    ],
  },
  cursorbench: {
    title: "CursorBench",
    body: "Implement ambiguous, multi-file changes in real repositories, scored for functional correctness and code quality.",
    rows: [
      ["Source", "Cursor"],
      ["Role", "coding-agent workflow"],
    ],
  },
  cyberbench: {
    title: "CyberBench",
    body: "Reproduce and patch OSS-Fuzz vulnerabilities in real open-source repositories without breaking benign behavior.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "patch-track accuracy"],
      ["Role", "cybersecurity agent work"],
    ],
  },
  deep_swe: {
    title: "DeepSWE",
    body: "Resolve original software-engineering tasks by inspecting, editing, and testing active open-source repositories.",
    rows: [
      ["Source", "DeepSWE leaderboard"],
      ["Role", "coding agent work"],
    ],
  },
  ebr_bench: {
    title: "EBR-Bench",
    body: "Learn an unfamiliar strategy game through repeated play while carrying persistent notes between runs.",
    rows: [
      ["Source", "Epoch AI"],
      ["Role", "learning from experience"],
    ],
  },
  emb: {
    title: "EMB",
    body: "Build working Excel financial models from prompts and source spreadsheets, including LBO, DCF, and M&A models.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "overall accuracy"],
      ["Role", "expert agent workflow"],
    ],
  },
  enterprisebench_corecraft: {
    title: "EnterpriseBench CoreCraft",
    body: "Complete customer, operations, and knowledge-work tasks inside a simulated computer-hardware startup using enterprise tools and company policy.",
    rows: [
      ["Source", "Surge AI"],
      ["Role", "enterprise tool use"],
    ],
  },
  epoch_capabilities_index: {
    title: "Epoch Capabilities Index",
    body: "Combine results across diverse capability benchmarks into a scale for comparing models over time.",
    rows: [
      ["Source", "Epoch AI"],
      ["Role", "general capability context"],
    ],
  },
  finance_agent_v2: {
    title: "Finance Agent V2",
    body: "Answer difficult financial-analysis questions from public-company filings using research, calculation, and retrieval tools.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "strict all-pass rate"],
      ["Role", "finance agent work"],
    ],
  },
  frontier_code: {
    title: "FrontierCode",
    body: "Make repository-scale code changes that are tested for correctness, quality, and mergeability.",
    rows: [
      ["Source", "Cognition"],
      ["Role", "repository-scale coding agents"],
    ],
  },
  frontiermath_tier_4: {
    title: "FrontierMath Tier 4",
    body: "Solve original, expert-written Tier 4 mathematics problems designed to require research-level reasoning.",
    rows: [
      ["Source", "Epoch AI"],
      ["Role", "research-level mathematics"],
    ],
  },
  gdp_pdf: {
    title: "GDP.pdf",
    body: "Answer expert workflow questions grounded in real professional PDFs, including diagrams, tables, forms, and technical documents.",
    rows: [
      ["Source", "Surge AI"],
      ["Role", "document reasoning"],
    ],
  },
  gdpval_normalized: {
    title: "GDPval v2",
    body: "Produce documents, spreadsheets, slides, and diagrams for real tasks drawn from 44 occupations, judged through blind pairwise comparisons.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "real work completion"],
    ],
  },
  handbook_md: {
    title: "HANDBOOK.md",
    body: "Complete enterprise tasks while following long company handbooks and using internal tools and external MCP servers.",
    rows: [
      ["Source", "Surge AI"],
      ["Role", "policy-grounded agent work"],
    ],
  },
  harvey_lab: {
    title: "Harvey LAB",
    body: "Produce legal work such as memos, redlines, and disclosure schedules from case documents, with every required criterion graded.",
    rows: [
      ["Source", "Vals AI"],
      ["Role", "legal agent work"],
    ],
  },
  hemingway_bench: {
    title: "Hemingway-bench",
    body: "Produce creative, business, and everyday writing preferred by expert writers for quality, originality, coherence, instruction following, and emotional intelligence.",
    rows: [
      ["Source", "Surge AI"],
      ["Metric", "expert pairwise Elo"],
      ["Role", "writing quality and judgment"],
    ],
  },
  hle: {
    title: "HLE",
    body: "Answer expert-written questions across mathematics, science, humanities, and other academic disciplines.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "frontier reasoning"],
    ],
  },
  itbench_sre: {
    title: "ITBench",
    body: "Diagnose Kubernetes incidents from offline alerts, events, traces, metrics, and topology, identifying every contributing root-cause entity.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "SRE agent investigation"],
    ],
  },
  legal_research: {
    title: "Legal Research",
    body: "Research questions across U.S. law using case-law search, web search, and document retrieval, then produce a supported answer.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "strict all-pass accuracy"],
      ["Role", "legal research agent work"],
    ],
  },
  mls_bench: {
    title: "MLS-Bench Lite",
    body: "Improve machine-learning methods across 30 controlled research tasks through iterative experimentation in a five-hour agent environment.",
    rows: [
      ["Source", "MLS-Bench"],
      ["Metric", "baseline-normalized performance"],
      ["Role", "agentic machine-learning research"],
    ],
  },
  omniscience_accuracy: {
    title: "Omniscience",
    body: "Answer cross-domain factual questions drawn from authoritative sources; the displayed score is the share answered correctly.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "knowledge accuracy"],
    ],
  },
  perception_bench: {
    title: "PerceptionBench",
    body: "Answer 3,000 short visual questions isolating counting, localization, OCR, depth, relations, and five other atomic perception capabilities.",
    rows: [
      ["Source", "Moonshot AI"],
      ["Metric", "overall accuracy"],
      ["Role", "atomic visual perception"],
    ],
  },
  programbench: {
    title: "ProgramBench",
    body: "Write executable programs from natural-language requirements, scored by behavioral tests.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "raw behavioral-test pass rate"],
      ["Role", "programming agent work"],
    ],
  },
  proofbench: {
    title: "ProofBench",
    body: "Write Lean 4 proofs for graduate and advanced-undergraduate mathematics problems, accepted only when they compile.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "overall compiler-verified accuracy"],
      ["Role", "formal theorem proving"],
    ],
  },
  public_benefits_bench: {
    title: "Public Benefits Bench",
    body: "Answer realistic SNAP eligibility and policy questions using web research, follow-up questions, and expert-validated rubrics.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "overall accuracy"],
      ["Role", "public-benefits agent work"],
    ],
  },
  riemann_bench: {
    title: "Riemann-bench",
    body: "Solve private, research-level mathematics problems designed to remain difficult for frontier models.",
    rows: [
      ["Source", "Surge AI"],
      ["Role", "frontier math reasoning"],
    ],
  },
  scicode: {
    title: "SciCode",
    body: "Implement scientific Python solutions for expert-written problems, scored by unit-tested subproblems.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "structured code reasoning"],
    ],
  },
  surge_intelligence_index: {
    title: "Surge Intelligence Index",
    body: "Aggregate capability index across Surge's professional reasoning, agentic, writing, and expert-preference benchmarks.",
    rows: [
      ["Source", "Surge AI"],
      ["Role", "broad capability index"],
    ],
  },
  tau_banking: {
    title: "tau3 Banking",
    body: "Resolve realistic banking-support scenarios by applying policy and coordinating multi-step tool calls with the customer.",
    rows: [
      ["Source", "Artificial Analysis"],
      ["Role", "banking agent work"],
    ],
  },
  terminal_bench_3: {
    title: "Terminal-Bench 3.0",
    body: "Complete difficult software, infrastructure, data, and technical workflows inside containerized terminal environments.",
    rows: [
      ["Source", "Terminal-Bench 3.0"],
      ["Metric", "task accuracy"],
      ["Role", "terminal and software agent work"],
    ],
  },
  toolathlon: {
    title: "Toolathlon",
    body: "Complete long-horizon real-world tasks that require selecting and coordinating many external tools.",
    rows: [
      ["Source", "LLM Stats / ZeroEval"],
      ["Role", "multi-tool agent work"],
    ],
  },
  vals_index: {
    title: "Vals Index",
    body: "Composite score across professional finance, legal, and coding tasks.",
    rows: [
      ["Source", "Vals AI"],
      ["Role", "professional finance, legal, and coding work"],
    ],
  },
  vending_bench_2: {
    title: "Vending-Bench 2",
    body: "Run a simulated vending-machine business for one year by managing inventory, suppliers, pricing, and cash flow.",
    rows: [
      ["Source", "Andon Labs"],
      ["Role", "long-horizon business operation"],
    ],
  },
  vibe_code: {
    title: "Vibe Code",
    body: "Build complete web applications from natural-language specifications, scored through browser-based interaction tests.",
    rows: [
      ["Source", "Vals AI"],
      ["Metric", "overall accuracy"],
      ["Role", "coding agent work"],
    ],
  },
  weirdml: {
    title: "WeirdML",
    body: "Train PyTorch models on novel datasets and iteratively improve them using execution feedback.",
    rows: [
      ["Source", "WeirdML"],
      ["Role", "iterative ML engineering"],
    ],
  },
} as const satisfies Readonly<
  Record<
    BenchmarkKey,
    {
      title: string;
      body: string;
      rows: readonly BenchmarkPresentationDetail[];
    }
  >
>;

export const BENCHMARK_LABELS = {
  aa_intelligence_index: "Artificial Analysis Intelligence Index",
  agent_arena: "Agent Arena",
  agents_last_exam: "Agents' Last Exam",
  ale_bench: "ALE-Bench",
  analyst_agent: "AnalystAgent",
  apex_agents: "APEX Agents",
  arc_agi_2: "ARC-AGI-2",
  arc_agi_3: "ARC-AGI-3",
  automation_bench: "AutomationBench",
  blueprint_bench_2: "Blueprint-Bench 2",
  briefcase: "Briefcase",
  browsecomp: "BrowseComp",
  chartography: "Chartography",
  chess_puzzles: "Chess Puzzles",
  code_migration: "Code Migration",
  complex_constraints: "ComplexConstraints",
  critpt: "CritPt",
  cursorbench: "CursorBench",
  cyberbench: "CyberBench",
  deep_swe: "DeepSWE",
  ebr_bench: "EBR-Bench",
  emb: "EMB",
  enterprisebench_corecraft: "EnterpriseBench CoreCraft",
  epoch_capabilities_index: "Epoch Capabilities Index",
  finance_agent_v2: "Finance Agent V2",
  frontier_code: "FrontierCode",
  frontiermath_tier_4: "FrontierMath Tier 4",
  gdp_pdf: "GDP.pdf",
  gdpval_normalized: "GDPval v2",
  handbook_md: "HANDBOOK.md",
  harvey_lab: "Harvey LAB",
  hemingway_bench: "Hemingway-bench",
  hle: "HLE",
  itbench_sre: "ITBench",
  legal_research: "Legal Research",
  mls_bench: "MLS-Bench Lite",
  omniscience_accuracy: "Omniscience",
  perception_bench: "PerceptionBench",
  programbench: "ProgramBench",
  proofbench: "ProofBench",
  public_benefits_bench: "Public Benefits Bench",
  riemann_bench: "Riemann-bench",
  scicode: "SciCode",
  surge_intelligence_index: "Surge Intelligence Index",
  tau_banking: "tau3 Banking",
  terminal_bench_3: "Terminal-Bench 3.0",
  toolathlon: "Toolathlon",
  vals_index: "Vals Index",
  vending_bench_2: "Vending-Bench 2",
  vibe_code: "Vibe Code",
  weirdml: "WeirdML",
} as const satisfies Readonly<Record<BenchmarkKey, string>>;

export const BENCHMARK_SCORING_LABELS: Partial<Record<BenchmarkKey, string>> = {
  aa_intelligence_index: "Artificial Analysis Intelligence Index",
  omniscience_accuracy: "Omniscience accuracy",
};

const FRONTIER_BENCHMARK_DISPLAY_ORDER = [
  "agent_arena",
  "agents_last_exam",
  "ale_bench",
  "analyst_agent",
  "apex_agents",
  "arc_agi_2",
  "arc_agi_3",
  "automation_bench",
  "blueprint_bench_2",
  "briefcase",
  "chartography",
  "complex_constraints",
  "critpt",
  "cursorbench",
  "deep_swe",
  "emb",
  "frontier_code",
  "frontiermath_tier_4",
  "gdp_pdf",
  "gdpval_normalized",
  "handbook_md",
  "harvey_lab",
  "hle",
  "itbench_sre",
  "legal_research",
  "mls_bench",
  "programbench",
  "proofbench",
  "riemann_bench",
  "terminal_bench_3",
] as const satisfies readonly BenchmarkKey[];

export const INDEX_BENCHMARK_KEYS = [
  "aa_intelligence_index",
  "epoch_capabilities_index",
  "surge_intelligence_index",
  "vals_index",
] as const satisfies readonly BenchmarkKey[];

const BASELINE_BENCHMARK_DISPLAY_ORDER = [
  "browsecomp",
  "chess_puzzles",
  "code_migration",
  "cyberbench",
  "ebr_bench",
  "enterprisebench_corecraft",
  "finance_agent_v2",
  "hemingway_bench",
  "omniscience_accuracy",
  "perception_bench",
  "public_benefits_bench",
  "scicode",
  "tau_banking",
  "toolathlon",
  "vending_bench_2",
  "vibe_code",
  "weirdml",
] as const satisfies readonly BenchmarkKey[];

/** Preserve frontier, index, and baseline display groups without caller-owned sorting rules. */
export const BENCHMARK_DISPLAY_ORDER = [
  ...FRONTIER_BENCHMARK_DISPLAY_ORDER,
  ...INDEX_BENCHMARK_KEYS,
  ...BASELINE_BENCHMARK_DISPLAY_ORDER,
] as const satisfies readonly BenchmarkKey[];

export const BENCHMARK_TASK_METRIC_COLUMNS = {
  agents_last_exam: [
    {
      key: "agentsLastExamCost",
      metric: "cost",
      direction: "ascending",
      label: "ALE$",
      tooltip: {
        title: "Agents' Last Exam cost ↓",
        body: "Estimated cost per Full Overall task, using the lower of median and mean per-task cost.",
        details: [
          ["Source", "Agents' Last Exam"],
          ["Split", "Full Overall"],
          ["Metric", "cost per task"],
        ],
      },
    },
    {
      key: "agentsLastExamSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "ALE Sec",
      format: "duration",
      tooltip: {
        title: "Agents' Last Exam runtime ↓",
        body: "Runtime per Full Overall task, using the lower of median and mean per-task duration.",
        details: [
          ["Source", "Agents' Last Exam"],
          ["Split", "Full Overall"],
          ["Metric", "runtime per task"],
        ],
      },
    },
    {
      key: "agentsLastExamInputTokens",
      metric: "input_tokens",
      direction: "ascending",
      label: "ALE In",
      tooltip: {
        title: "Agents' Last Exam input tokens ↓",
        body: "Input tokens per Full Overall task, using the lower of median and mean per-task token usage.",
        details: [
          ["Source", "Agents' Last Exam"],
          ["Split", "Full Overall"],
          ["Metric", "input tokens per task"],
        ],
      },
    },
    {
      key: "agentsLastExamOutputTokens",
      metric: "output_tokens",
      direction: "ascending",
      label: "ALE Out",
      tooltip: {
        title: "Agents' Last Exam output tokens ↓",
        body: "Output tokens per Full Overall task, using the lower of median and mean per-task token usage.",
        details: [
          ["Source", "Agents' Last Exam"],
          ["Split", "Full Overall"],
          ["Metric", "output tokens per task"],
        ],
      },
    },
  ],
  analyst_agent: [
    {
      key: "analystAgentCost",
      metric: "cost",
      direction: "ascending",
      label: "Analyst$",
    },
    {
      key: "analystAgentSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "Analyst Sec",
      format: "duration",
    },
    {
      key: "analystAgentTokens",
      metric: "tokens",
      direction: "ascending",
      label: "Analyst Tok",
    },
  ],
  arc_agi_2: [
    {
      key: "arcAgi2Cost",
      metric: "cost",
      direction: "ascending",
      label: "AGI-2$",
      tooltip: {
        title: "ARC-AGI-2 cost per task ↓",
        body: "Official verified semi-private leaderboard cost for one ARC-AGI-2 task.",
        details: [
          ["Source", "ARC Prize"],
          ["Metric", "cost per task"],
        ],
      },
    },
  ],
  arc_agi_3: [
    {
      key: "arcAgi3Cost",
      metric: "cost",
      direction: "ascending",
      label: "AGI-3$",
      tooltip: {
        title: "ARC-AGI-3 total cost ↓",
        body: "Official verified semi-private leaderboard cost for the full ARC-AGI-3 evaluation.",
        details: [
          ["Source", "ARC Prize"],
          ["Metric", "total cost"],
        ],
      },
    },
  ],
  automation_bench: [
    {
      key: "automationBenchCost",
      metric: "cost",
      direction: "ascending",
      label: "Auto$",
    },
  ],
  critpt: [
    {
      key: "critptCost",
      metric: "cost",
      direction: "ascending",
      label: "Crit$",
    },
    {
      key: "critptSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "Crit Sec",
    },
    {
      key: "critptTokens",
      metric: "tokens",
      direction: "ascending",
      label: "Crit Tok",
    },
  ],
  cursorbench: [
    {
      key: "cursorBenchCost",
      metric: "cost",
      direction: "ascending",
      label: "Cursor$",
    },
    {
      key: "cursorBenchTokens",
      metric: "tokens",
      direction: "ascending",
      label: "Cursor Tok",
    },
  ],
  deep_swe: [
    {
      key: "deepSWECost",
      metric: "cost",
      direction: "ascending",
      label: "DSWE$",
      tooltip: {
        title: "DeepSWE cost per task ↓",
        body: "Mean cost for one DeepSWE task.",
        details: [
          ["Source", "DeepSWE leaderboard"],
          ["Metric", "mean cost per task"],
        ],
      },
    },
    {
      key: "deepSWESeconds",
      metric: "seconds",
      direction: "ascending",
      label: "DSWE Sec",
      tooltip: {
        title: "DeepSWE seconds per task ↓",
        body: "Mean runtime for one DeepSWE task.",
        details: [
          ["Source", "DeepSWE leaderboard"],
          ["Metric", "mean runtime per task"],
        ],
      },
    },
    {
      key: "deepSWETokens",
      metric: "output_tokens",
      direction: "descending",
      label: "DSWE Tok",
      tooltip: {
        title: "DeepSWE output tokens per task",
        body: "Mean output tokens for one DeepSWE task.",
        details: [
          ["Source", "DeepSWE leaderboard"],
          ["Metric", "mean output tokens per task"],
        ],
      },
    },
  ],
  frontier_code: [
    {
      key: "frontierCodeCost",
      metric: "cost",
      direction: "ascending",
      label: "FC$",
    },
    {
      key: "frontierCodeTokens",
      metric: "tokens",
      direction: "ascending",
      label: "FC Tok",
    },
  ],
  gdpval_normalized: [
    {
      key: "gdpvalCost",
      metric: "cost",
      direction: "ascending",
      label: "GDP$",
    },
    {
      key: "gdpvalSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "GDP Sec",
    },
    {
      key: "gdpvalTokens",
      metric: "tokens",
      direction: "ascending",
      label: "GDP Tok",
    },
  ],
  harvey_lab: [
    {
      key: "harveyLabCost",
      metric: "cost",
      direction: "ascending",
      label: "HLAB$",
    },
    {
      key: "harveyLabSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "HLAB Sec",
    },
    {
      key: "harveyLabTokens",
      metric: "tokens",
      direction: "ascending",
      label: "HLAB Tok",
    },
  ],
  hle: [
    {
      key: "hleCost",
      metric: "cost",
      direction: "ascending",
      label: "HLE$",
    },
    {
      key: "hleSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "HLE Sec",
    },
    {
      key: "hleTokens",
      metric: "tokens",
      direction: "ascending",
      label: "HLE Tok",
    },
  ],
  tau_banking: [
    {
      key: "tauBankingCost",
      metric: "cost",
      direction: "ascending",
      label: "tau3$",
    },
    {
      key: "tauBankingSeconds",
      metric: "seconds",
      direction: "ascending",
      label: "tau3 Sec",
    },
    {
      key: "tauBankingTokens",
      metric: "tokens",
      direction: "ascending",
      label: "tau3 Tok",
    },
  ],
} as const satisfies Partial<Record<BenchmarkKey, readonly BenchmarkTaskMetricColumnFacet[]>>;

export const BENCHMARK_COLUMNS = {
  aa_intelligence_index: {
    key: "aaIntelligenceIndex",
    label: "AA",
    format: "number",
    defaultSort: "descending",
  },
  agent_arena: {
    key: "agentArena",
    label: "Arena",
    format: "score",
    defaultSort: "descending",
  },
  agents_last_exam: {
    key: "agentsLastExam",
    label: "ALE",
    format: "percent",
    defaultSort: "descending",
  },
  ale_bench: {
    key: "aleBench",
    label: "ALE-B",
    format: "score",
    defaultSort: "descending",
  },
  analyst_agent: {
    key: "analystAgent",
    label: "Analyst",
    format: "percent",
    defaultSort: "descending",
  },
  apex_agents: {
    key: "apexAgents",
    label: "APEX",
    format: "percent",
    defaultSort: "descending",
  },
  automation_bench: {
    key: "automationBench",
    label: "Auto",
    format: "percent",
    defaultSort: "descending",
  },
  arc_agi_2: {
    key: "arcAgi2",
    label: "AGI-2",
    format: "percent",
    defaultSort: "descending",
  },
  arc_agi_3: {
    key: "arcAgi3",
    label: "AGI-3",
    format: "percent",
    defaultSort: "descending",
  },
  blueprint_bench_2: {
    key: "blueprintBench",
    label: "BB2",
    format: "percent",
    defaultSort: "descending",
  },
  briefcase: {
    key: "briefcase",
    label: "Briefcase",
    format: "percent",
    defaultSort: "descending",
  },
  browsecomp: {
    key: "browseComp",
    label: "Browse",
    format: "percent",
    defaultSort: "descending",
  },
  chartography: {
    key: "chartography",
    label: "Chart",
    format: "percent",
    defaultSort: "descending",
  },
  chess_puzzles: {
    key: "chessPuzzles",
    label: "Chess",
    format: "percent",
    defaultSort: "descending",
  },
  code_migration: {
    key: "codeMigration",
    label: "Migration",
    format: "percent",
    defaultSort: "descending",
  },
  complex_constraints: {
    key: "complexConstraints",
    label: "Complex",
    format: "percent",
    defaultSort: "descending",
  },
  critpt: {
    key: "critpt",
    label: "CritPt",
    format: "percent",
    defaultSort: "descending",
  },
  cursorbench: {
    key: "cursorBench",
    label: "Cursor",
    format: "percent",
    defaultSort: "descending",
  },
  cyberbench: {
    key: "cyberBench",
    label: "Cyber",
    format: "percent",
    defaultSort: "descending",
  },
  deep_swe: {
    key: "deepSWE",
    label: "DSWE",
    format: "percent",
    defaultSort: "descending",
  },
  ebr_bench: {
    key: "ebrBench",
    label: "EBR",
    format: "percent",
    defaultSort: "descending",
  },
  emb: {
    key: "emb",
    label: "EMB",
    format: "percent",
    defaultSort: "descending",
  },
  enterprisebench_corecraft: {
    key: "enterpriseBenchCoreCraft",
    label: "CoreCraft",
    format: "percent",
    defaultSort: "descending",
  },
  epoch_capabilities_index: {
    key: "epochCapabilitiesIndex",
    label: "ECI",
    format: "number",
    defaultSort: "descending",
  },
  finance_agent_v2: {
    key: "financeAgentV2",
    label: "Finance",
    format: "percent",
    defaultSort: "descending",
  },
  frontier_code: {
    key: "frontierCode",
    label: "FCode",
    format: "percent",
    defaultSort: "descending",
  },
  frontiermath_tier_4: {
    key: "frontierMathTier4",
    label: "FM T4",
    format: "percent",
    defaultSort: "descending",
  },
  gdp_pdf: {
    key: "gdpPdf",
    label: "GDP.pdf",
    format: "percent",
    defaultSort: "descending",
  },
  gdpval_normalized: {
    key: "gdpval",
    label: "GDPval",
    format: "percent",
    defaultSort: "descending",
  },
  handbook_md: {
    key: "handbookMd",
    label: "Handbook",
    format: "percent",
    defaultSort: "descending",
  },
  harvey_lab: {
    key: "harveyLab",
    label: "HLAB",
    format: "percent",
    defaultSort: "descending",
  },
  hemingway_bench: {
    key: "hemingwayBench",
    label: "Hemingway",
    format: "score",
    defaultSort: "descending",
  },
  hle: {
    key: "hle",
    label: "HLE",
    format: "percent",
    defaultSort: "descending",
  },
  itbench_sre: {
    key: "itBench",
    label: "ITBench",
    format: "percent",
    defaultSort: "descending",
  },
  legal_research: {
    key: "legalResearch",
    label: "Legal",
    format: "percent",
    defaultSort: "descending",
  },
  mls_bench: {
    key: "mlsBench",
    label: "MLS",
    format: "percent",
    defaultSort: "descending",
  },
  omniscience_accuracy: {
    key: "omniscience",
    label: "Omni",
    format: "percent",
    defaultSort: "descending",
  },
  perception_bench: {
    key: "perceptionBench",
    label: "Perception",
    format: "percent",
    defaultSort: "descending",
  },
  programbench: {
    key: "programBench",
    label: "Program",
    format: "percent",
    defaultSort: "descending",
  },
  proofbench: {
    key: "proofBench",
    label: "Proof",
    format: "percent",
    defaultSort: "descending",
  },
  public_benefits_bench: {
    key: "publicBenefitsBench",
    label: "Benefits",
    format: "percent",
    defaultSort: "descending",
  },
  riemann_bench: {
    key: "riemannBench",
    label: "Riemann",
    format: "percent",
    defaultSort: "descending",
  },
  scicode: {
    key: "scicode",
    label: "SciCode",
    format: "percent",
    defaultSort: "descending",
  },
  surge_intelligence_index: {
    key: "surgeIntelligenceIndex",
    label: "Surge",
    format: "percent",
    defaultSort: "descending",
  },
  tau_banking: {
    key: "tauBanking",
    label: "tau3",
    format: "percent",
    defaultSort: "descending",
  },
  terminal_bench_3: {
    key: "terminalBench3",
    label: "TB3",
    format: "percent",
    defaultSort: "descending",
  },
  toolathlon: {
    key: "toolathlon",
    label: "Toolathlon",
    format: "percent",
    defaultSort: "descending",
  },
  vals_index: {
    key: "valsIndex",
    label: "Vals",
    format: "percent",
    defaultSort: "descending",
  },
  vending_bench_2: {
    key: "vendingBench2",
    label: "Vending",
    format: "currency",
    defaultSort: "descending",
  },
  vibe_code: {
    key: "vibeCode",
    label: "Vibe",
    format: "percent",
    defaultSort: "descending",
  },
  weirdml: {
    key: "weirdMl",
    label: "WeirdML",
    format: "percent",
    defaultSort: "descending",
  },
} as const satisfies Readonly<Record<BenchmarkKey, BenchmarkColumnFacet>>;

export const ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_ALIASES = {
  critpt: ["critpt"],
  gdpval_normalized: ["gdpvalNormalized", "gdpval_normalized"],
  gpqa: ["gpqa"],
  hle: ["hle"],
  mmmu_pro: ["mmmuPro", "mmmu_pro"],
  scicode: ["scicode"],
  tau_banking: ["tauBanking", "tau_banking"],
} as const;

export const ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_KEYS_AFTER = {
  gdpval_normalized: [
    "critpt",
    "gdpval_normalized",
    "gpqa",
    "hle",
    "mmmu_pro",
    "scicode",
    "tau_banking",
  ],
} as const satisfies Partial<Record<BenchmarkKey, readonly string[]>>;

export const MODEL_ATLAS_ADDITIONAL_BENCHMARK_KEYS_AFTER = {
  gdpval_normalized: ["gpqa", "mmmu_pro"],
} as const satisfies Partial<Record<BenchmarkKey, readonly string[]>>;
