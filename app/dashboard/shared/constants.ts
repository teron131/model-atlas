/** Shared dashboard constants for live data paths, tooltips, and benchmark labels. */

import type { LlmStatsColumnTooltip } from "../../../src/model-atlas/stats/types";

export const liveStatsPath = "/api/llm-stats?view=all";

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
	agents_last_exam: "Agents' Last Exam",
	apex_agents: "APEX Agents",
	automation_bench: "AutomationBench",
	blueprint_bench_2: "Blueprint-Bench 2",
	briefcase: "Briefcase",
	browsecomp: "BrowseComp",
	critpt: "CritPt",
	cursorbench: "CursorBench",
	deep_swe: "DeepSWE",
	gdp_pdf: "GDP.pdf",
	gdpval_normalized: "GDPval-AA v2",
	harvey_lab: "Harvey LAB",
	hle: "HLE",
	lcr: "LCR",
	omniscience_accuracy: "Omniscience",
	riemann_bench: "Riemann-bench",
	scicode: "SciCode",
	tau_banking: "tau3 Banking",
	terminalbench_v21: "Terminal-Bench 2.1",
	toolathlon: "Toolathlon",
	vals_index: "Vals Index",
};

export const benchmarkTooltips: Record<string, LlmStatsColumnTooltip> = {
	agents_last_exam: {
		title: "Agents' Last Exam",
		body: "Real-world software and professional-workflow benchmark. Model Atlas uses the partial-credit score.",
		rows: [
			["Source", "Agents' Last Exam"],
			["Role", "agentic real-world work"],
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
	deep_swe: {
		title: "DeepSWE",
		body: "Coding-agent benchmark. This score uses the xhigh row when available, otherwise the best reported pass@1 row.",
		rows: [
			["Source", "DeepSWE leaderboard"],
			["Role", "coding agent work"],
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
	lcr: {
		title: "AA-LCR",
		body: "Long-context reasoning over large document sets, checked with an equality grader.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "long context reasoning"],
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
};
