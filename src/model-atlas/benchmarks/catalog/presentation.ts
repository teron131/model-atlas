/** Benchmark presentation policy owns labels, tooltips, columns, and ordering. */

import type {
	BenchmarkColumnFacet,
	BenchmarkPresentationDetail,
	BenchmarkTaskMetricColumnFacet,
} from "../factory";
import type { BenchmarkKey } from "./portfolio";

export const BENCHMARK_TOOLTIPS = {
	aa_intelligence_index: {
		title: "AA Intelligence Index",
		body: "Artificial Analysis aggregate of current reasoning and knowledge benchmarks. Model Atlas gives the overlapping index half importance.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "broad intelligence index"],
		],
	},
	agent_arena: {
		title: "Agent Arena",
		body: "Causal benchmark of orchestrator models across real Agent Mode work. Model Atlas uses the leaderboard's signed average-score estimate.",
		rows: [
			["Source", "Arena"],
			["Role", "real-world agent performance"],
		],
	},
	agents_last_exam: {
		title: "Agents' Last Exam",
		body: "Real-world software and professional-workflow benchmark. The displayed value is the higher of median and mean partial-credit score.",
		rows: [
			["Source", "Agents' Last Exam"],
			["Split", "Full Overall"],
			["Role", "agentic real-world work"],
		],
	},
	ale_bench: {
		title: "ALE-Bench",
		body: "Heuristic-programming benchmark over executable optimization tasks. Model Atlas scores Sakana AI's source-default ×1 mean performance and preserves refinement checkpoints as raw evidence.",
		rows: [
			["Source", "Sakana AI; Epoch validation"],
			["Role", "algorithm design and code execution"],
		],
	},
	apex_agents: {
		title: "APEX Agents",
		body: "Long-horizon professional-services agent tasks in consulting, banking, and law settings.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "agentic task completion"],
		],
	},
	automation_bench: {
		title: "AutomationBench",
		body: "Artificial Analysis implementation of the Zapier workflow-automation benchmark. Model Atlas uses the AA benchmark-page score and task resources.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "agentic SaaS workflow"],
		],
	},
	blueprint_bench_2: {
		title: "Blueprint-Bench 2",
		body: "Andon Labs spatial reasoning benchmark: models reconstruct apartment floor plans from interior photos.",
		rows: [
			["Source", "Andon Labs"],
			["Role", "spatial reasoning"],
		],
	},
	briefcase: {
		title: "Briefcase",
		body: "Artificial Analysis long-horizon knowledge-work benchmark over multi-file professional deliverables, scored with rubric and pairwise quality judgments. Model Atlas normalizes the Elo score onto the shared 0-1 benchmark scale.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "agentic knowledge work"],
		],
	},
	browsecomp: {
		title: "BrowseComp",
		body: "OpenAI's web-browsing benchmark for finding difficult-to-locate information.",
		rows: [
			["Source", "LLM Stats / ZeroEval"],
			["Role", "web information retrieval"],
		],
	},
	chartography: {
		title: "Chartography",
		body: "Professional chart-understanding benchmark over specialized graphics, testing visual perception, domain interpretation, and multi-step graphical reasoning.",
		rows: [
			["Source", "Surge AI"],
			["Role", "professional graphical reasoning"],
		],
	},
	chess_puzzles: {
		title: "Chess Puzzles",
		body: "One hundred novel engine-generated chess positions where models must select the single best next move from a FEN board state.",
		rows: [
			["Source", "Epoch AI"],
			["Role", "planning and game reasoning"],
		],
	},
	code_migration: {
		title: "Code Migration",
		body: "Vals benchmark for migrating an existing codebase while preserving required behavior.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall accuracy"],
			["Role", "repository migration workflow"],
		],
	},
	critpt: {
		title: "CritPt",
		body: "Research-level physics reasoning with numeric, symbolic, and code answers.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "physics reasoning"],
		],
	},
	cursorbench: {
		title: "CursorBench",
		body: "Cursor's first-party coding-agent benchmark over ambiguous, multi-file tasks. Composer rows are excluded.",
		rows: [
			["Source", "Cursor"],
			["Role", "coding-agent workflow"],
		],
	},
	cyberbench: {
		title: "CyberBench",
		body: "Vals benchmark for carrying out practical cybersecurity workflows in a tool-using environment.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "patch-track accuracy"],
			["Role", "cybersecurity agent work"],
		],
	},
	deep_swe: {
		title: "DeepSWE",
		body: "Coding-agent benchmark. This score uses the source-default or highest reported reasoning effort.",
		rows: [
			["Source", "DeepSWE leaderboard"],
			["Role", "coding agent work"],
		],
	},
	ebr_bench: {
		title: "EBR-Bench",
		body: "Long-horizon Earthborne Rangers benchmark that tests whether agents improve at an unfamiliar task through repeated play and persistent notes.",
		rows: [
			["Source", "Epoch AI"],
			["Role", "learning from experience"],
		],
	},
	emb: {
		title: "EMB",
		body: "Vals benchmark for completing realistic expert work through a multi-step agent workflow.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall accuracy"],
			["Role", "expert agent workflow"],
		],
	},
	enterprisebench_corecraft: {
		title: "EnterpriseBench CoreCraft",
		body: "Enterprise-agent benchmark inside a simulated computer-hardware startup, requiring active discovery, tool use, and policy-aware task completion.",
		rows: [
			["Source", "Surge AI"],
			["Role", "enterprise tool use"],
		],
	},
	epoch_capabilities_index: {
		title: "Epoch Capabilities Index",
		body: "Composite capability scale that combines results from many benchmarks so models can be compared across tasks and over time.",
		rows: [
			["Source", "Epoch AI"],
			["Role", "general capability context"],
		],
	},
	finance_agent_v2: {
		title: "Finance Agent V2",
		body: "Vals benchmark for finance research and analysis completed through an agent workflow.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "strict all-pass rate"],
			["Role", "finance agent work"],
		],
	},
	frontier_code: {
		title: "FrontierCode",
		body: "Cognition's repository-scale benchmark of code quality and mergeability. Model Atlas uses the FrontierCode 1.1 Main score and preserves every effort, harness, and Extended result as source evidence.",
		rows: [
			["Source", "Cognition"],
			["Role", "repository-scale coding agents"],
		],
	},
	frontiermath_tier_4: {
		title: "FrontierMath Tier 4",
		body: "Exceptionally difficult original mathematics problems written and vetted by expert mathematicians, often requiring research-level work.",
		rows: [
			["Source", "Epoch AI"],
			["Role", "research-level mathematics"],
		],
	},
	gdp_pdf: {
		title: "GDP.pdf",
		body: "Surge AI document-understanding benchmark over real professional PDFs. Model Atlas uses the public leaderboard score.",
		rows: [
			["Source", "Surge AI"],
			["Role", "document reasoning"],
		],
	},
	gdpval_normalized: {
		title: "GDPval-AA v2",
		body: "AA v4.1 professional-work benchmark, re-baselined around human performance with longer agent trajectories.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "real work completion"],
		],
	},
	handbook_md: {
		title: "HANDBOOK.md",
		body: "Long-context enterprise benchmark where agents must follow company handbooks while using internal tools and external MCP servers.",
		rows: [
			["Source", "Surge AI"],
			["Role", "policy-grounded agent work"],
		],
	},
	harvey_lab: {
		title: "Harvey LAB",
		body: "Artificial Analysis implementation of Harvey's Legal Agent Benchmark, scored by strict all-pass legal deliverable completion across private legal-agent tasks.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "legal agent work"],
		],
	},
	hle: {
		title: "HLE",
		body: "Humanity's Last Exam: difficult academic reasoning and knowledge questions.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "frontier reasoning"],
		],
	},
	itbench_sre: {
		title: "ITBench",
		body: "Artificial Analysis implementation of the ITBench Kubernetes incident root-cause benchmark, using average precision at full recall over offline alerts, events, traces, metrics, and topology.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "SRE agent investigation"],
		],
	},
	lcr: {
		title: "AA-LCR",
		body: "Long-context reasoning over large document sets, checked with an equality grader.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "long context reasoning"],
		],
	},
	legal_research: {
		title: "Legal Research",
		body: "Vals benchmark for researching legal questions and producing grounded work through a tool-using workflow.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall accuracy"],
			["Role", "legal research agent work"],
		],
	},
	medcode: {
		title: "MedCode",
		body: "Vals benchmark for medical coding knowledge and reasoning.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall accuracy"],
			["Role", "medical coding reasoning"],
		],
	},
	omniscience_accuracy: {
		title: "Omniscience",
		body: "AA knowledge benchmark. This table uses the accuracy side as the factual-recall signal.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "knowledge accuracy"],
		],
	},
	programbench: {
		title: "ProgramBench",
		body: "Vals benchmark for solving programming tasks through an executable coding workflow.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "raw behavioral-test pass rate"],
			["Role", "programming agent work"],
		],
	},
	proofbench: {
		title: "ProofBench",
		body: "Graduate and advanced-undergraduate mathematics problems where agents must produce Lean 4 proofs accepted by a formal checker.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall compiler-verified accuracy"],
			["Role", "formal theorem proving"],
		],
	},
	public_benefits_bench: {
		title: "Public Benefits Bench",
		body: "Vals benchmark for resolving public-benefits cases through professional research and workflow execution.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall accuracy"],
			["Role", "public-benefits agent work"],
		],
	},
	riemann_bench: {
		title: "Riemann-bench",
		body: "Surge AI extreme mathematics benchmark over private frontier math problems. Model Atlas uses the public leaderboard score.",
		rows: [
			["Source", "Surge AI"],
			["Role", "frontier math reasoning"],
		],
	},
	scicode: {
		title: "SciCode",
		body: "Scientific Python problem solving with unit-tested subproblems.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "structured code reasoning"],
		],
	},
	tau_banking: {
		title: "tau3 Banking",
		body: "AA v4.1 banking-agent benchmark for realistic tool-mediated banking scenarios.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "banking agent work"],
		],
	},
	terminalbench_v21: {
		title: "Terminal-Bench 2.1",
		body: "Best matched AA or Vals terminal-agent score for command-line task execution.",
		rows: [
			["Source", "Artificial Analysis & Vals"],
			["Role", "terminal agent work"],
		],
	},
	toolathlon: {
		title: "Toolathlon",
		body: "Multi-tool workflow benchmark from ZeroEval. Model Atlas uses the LLM Stats score.",
		rows: [
			["Source", "LLM Stats / ZeroEval"],
			["Role", "multi-tool agent work"],
		],
	},
	vals_index: {
		title: "Vals Index",
		body: "Vals Index aggregates finance and coding tasks, including non-public Vals-built components. Model Atlas uses only the overall score as a normal baseline signal.",
		rows: [
			["Source", "Vals AI"],
			["Role", "professional finance and coding work"],
		],
	},
	vending_bench_2: {
		title: "Vending-Bench 2",
		body: "Year-long simulated business benchmark where agents manage inventory, suppliers, pricing, and cash flow to maximize final balance.",
		rows: [
			["Source", "Andon Labs"],
			["Role", "long-horizon business operation"],
		],
	},
	vibe_code: {
		title: "Vibe Code",
		body: "Vals benchmark for end-to-end software creation in a coding-agent environment.",
		rows: [
			["Source", "Vals AI"],
			["Metric", "overall accuracy"],
			["Role", "coding agent work"],
		],
	},
	weirdml: {
		title: "WeirdML",
		body: "Novel machine-learning tasks where models design working PyTorch solutions and iteratively improve them from execution feedback.",
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
	aa_intelligence_index: "AA Intelligence Index",
	agent_arena: "Agent Arena",
	agents_last_exam: "Agents' Last Exam",
	ale_bench: "ALE-Bench",
	apex_agents: "APEX Agents",
	automation_bench: "AutomationBench",
	blueprint_bench_2: "Blueprint-Bench 2",
	briefcase: "Briefcase",
	browsecomp: "BrowseComp",
	chartography: "Chartography",
	chess_puzzles: "Chess Puzzles",
	code_migration: "Code Migration",
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
	gdpval_normalized: "GDPval-AA v2",
	handbook_md: "HANDBOOK.md",
	harvey_lab: "Harvey LAB",
	hle: "HLE",
	itbench_sre: "ITBench",
	lcr: "LCR",
	legal_research: "Legal Research",
	medcode: "MedCode",
	omniscience_accuracy: "Omniscience",
	programbench: "ProgramBench",
	proofbench: "ProofBench",
	public_benefits_bench: "Public Benefits Bench",
	riemann_bench: "Riemann-bench",
	scicode: "SciCode",
	tau_banking: "tau3 Banking",
	terminalbench_v21: "Terminal-Bench 2.1",
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

/** Preserve the established frontier-first display sequence without caller-owned sorting rules. */
export const BENCHMARK_DISPLAY_ORDER = [
	"agent_arena",
	"agents_last_exam",
	"ale_bench",
	"apex_agents",
	"automation_bench",
	"blueprint_bench_2",
	"briefcase",
	"chartography",
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
	"programbench",
	"proofbench",
	"riemann_bench",
	"terminalbench_v21",
	"aa_intelligence_index",
	"browsecomp",
	"chess_puzzles",
	"code_migration",
	"cyberbench",
	"ebr_bench",
	"enterprisebench_corecraft",
	"epoch_capabilities_index",
	"finance_agent_v2",
	"lcr",
	"medcode",
	"omniscience_accuracy",
	"public_benefits_bench",
	"scicode",
	"tau_banking",
	"toolathlon",
	"vals_index",
	"vending_bench_2",
	"vibe_code",
	"weirdml",
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
	terminalbench_v21: [
		{
			key: "terminalBenchCost",
			metric: "cost",
			direction: "ascending",
			label: "TB$",
			tooltip: {
				title: "Terminal-Bench 2.1 cost per task ↓",
				body: "Median available task cost for Terminal-Bench 2.1.",
				details: [
					["Source", "Artificial Analysis & Vals"],
					["Metric", "median cost per task"],
				],
			},
		},
		{
			key: "terminalBenchSeconds",
			metric: "seconds",
			direction: "ascending",
			label: "TB Sec",
			tooltip: {
				title: "Terminal-Bench 2.1 seconds per task ↓",
				body: "Median available task runtime for Terminal-Bench 2.1.",
				details: [
					["Source", "Artificial Analysis & Vals"],
					["Metric", "median runtime per task"],
				],
			},
		},
		{
			key: "terminalBenchTokens",
			metric: "tokens",
			direction: "ascending",
			label: "TB Tok",
			tooltip: {
				title: "Terminal-Bench 2.1 tokens per task ↓",
				body: "Artificial Analysis reported token use for Terminal-Bench 2.1.",
				details: [
					["Source", "Artificial Analysis"],
					["Metric", "AA tokens per task"],
				],
			},
		},
	],
} as const satisfies Partial<
	Record<BenchmarkKey, readonly BenchmarkTaskMetricColumnFacet[]>
>;

export const BENCHMARK_COLUMNS = {
	aa_intelligence_index: {
		key: "aaIntelligenceIndex",
		label: "AA Index",
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
	lcr: {
		key: "lcr",
		label: "LCR",
		format: "percent",
		defaultSort: "descending",
	},
	legal_research: {
		key: "legalResearch",
		label: "Legal",
		format: "percent",
		defaultSort: "descending",
	},
	medcode: {
		key: "medCode",
		label: "MedCode",
		format: "percent",
		defaultSort: "descending",
	},
	omniscience_accuracy: {
		key: "omniscience",
		label: "Omni",
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
	tau_banking: {
		key: "tauBanking",
		label: "tau3",
		format: "percent",
		defaultSort: "descending",
	},
	terminalbench_v21: {
		key: "terminalBench",
		label: "TBench",
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
	gpqa: ["gpqa"],
	mmmu_pro: ["mmmuPro", "mmmu_pro"],
} as const;

export const ARTIFICIAL_ANALYSIS_ADDITIONAL_BENCHMARK_KEYS_AFTER = {
	gdpval_normalized: ["gpqa"],
	lcr: ["mmmu_pro"],
} as const satisfies Partial<Record<BenchmarkKey, readonly string[]>>;

export const MODEL_ATLAS_ADDITIONAL_BENCHMARK_KEYS_AFTER = {
	gdpval_normalized: ["gpqa"],
	medcode: ["mmmu_pro"],
} as const satisfies Partial<Record<BenchmarkKey, readonly string[]>>;

export const INDEX_BENCHMARK_KEYS = [
	"aa_intelligence_index",
	"epoch_capabilities_index",
	"vals_index",
] as const satisfies readonly BenchmarkKey[];
