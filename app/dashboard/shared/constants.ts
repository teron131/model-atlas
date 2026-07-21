/** Shared dashboard constants for live data paths, tooltips, and benchmark labels. */

import type {
	BenchmarkPortfolio,
	LlmStatsColumnTooltip,
} from "../../../src/model-atlas/stats/types";

export const liveStatsPath = "/api/llm-stats?view=dashboard";

export const tooltipHorizontalPadding = 18;
export const tooltipMaxWidth = 360;
export const tooltipWorkflowMaxWidth = 480;
export const tooltipOffsetTop = 12;

export const benchmarkGroups = [
	{
		field: "intelligence_benchmark_display_keys",
		fallbackField: "intelligence_benchmark_keys",
		label: "Intelligence",
	},
	{
		field: "agentic_benchmark_display_keys",
		fallbackField: "agentic_benchmark_keys",
		label: "Agent",
	},
] as const;

export const benchmarkLabels: Record<string, string> = {
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
};

/** Order benchmark displays by scoring priority, then alphabetically within each group. */
export function compareBenchmarkDisplayKeys(
	left: string,
	right: string,
	portfolio: BenchmarkPortfolio,
): number {
	const groupDifference =
		benchmarkGroupOrder(portfolio[left]?.group) -
		benchmarkGroupOrder(portfolio[right]?.group);
	if (groupDifference !== 0) {
		return groupDifference;
	}
	const labelDifference = (benchmarkLabels[left] ?? left).localeCompare(
		benchmarkLabels[right] ?? right,
		"en",
		{ sensitivity: "base" },
	);
	return labelDifference !== 0 ? labelDifference : left.localeCompare(right);
}

function benchmarkGroupOrder(group: "frontier" | "baseline" | undefined) {
	if (group === "frontier") {
		return 0;
	}
	return group === "baseline" ? 1 : 2;
}

export const benchmarkTooltips: Record<string, LlmStatsColumnTooltip> = {
	aa_intelligence_index: {
		title: "AA Intelligence Index",
		body: "Artificial Analysis aggregate of current reasoning and knowledge evaluations. Model Atlas gives the overlapping index half importance.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "broad intelligence index"],
		],
	},
	agent_arena: {
		title: "Agent Arena",
		body: "Causal evaluation of orchestrator models across real Agent Mode work. Model Atlas uses the leaderboard's signed average-score estimate.",
		rows: [
			["Source", "Arena"],
			["Role", "real-world agent performance"],
		],
	},
	agents_last_exam: {
		title: "Agents' Last Exam",
		body: "Real-world software and professional-workflow benchmark. Model Atlas uses the partial-credit score.",
		rows: [
			["Source", "Agents' Last Exam"],
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
		body: "Artificial Analysis implementation of the Zapier workflow-automation benchmark. Model Atlas uses the AA evaluation-page score and task resources.",
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
};
