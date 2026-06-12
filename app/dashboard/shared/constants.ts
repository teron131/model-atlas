import type { LlmStatsColumnTooltip } from "../../../src/model-atlas/llm/stats/types";

export const liveStatsPath = "/api/llm-stats";

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
	apex_agents: "APEX Agents",
	agents_last_exam: "Agents' Last Exam",
	automation_bench: "AutomationBench",
	blueprint_bench_2: "Blueprint-Bench 2",
	browsecomp: "BrowseComp",
	critpt: "CritPt",
	cursorbench: "CursorBench",
	deep_swe: "DeepSWE",
	gdp_pdf: "GDP.pdf",
	gdpval_normalized: "GDPval",
	hle: "HLE",
	ifbench: "IFBench",
	lcr: "LCR",
	omniscience_accuracy: "Omniscience",
	omniscience_nonhallucination_rate: "Omniscience NH",
	riemann_bench: "Riemann-bench",
	scicode: "SciCode",
	terminal_bench_2: "Terminal-Bench 2.0",
	terminalbench_hard: "TerminalBench Hard",
	toolathlon: "Toolathlon",
};

export const benchmarkTooltips: Record<string, LlmStatsColumnTooltip> = {
	gpqa: {
		title: "GPQA",
		body: "Graduate-level Google-proof science questions, used here as a compact reasoning benchmark.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "science reasoning"],
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
	lcr: {
		title: "AA-LCR",
		body: "Long-context reasoning over large document sets, checked with an equality grader.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "long context reasoning"],
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
	scicode: {
		title: "SciCode",
		body: "Scientific Python problem solving with unit-tested subproblems.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "structured code reasoning"],
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
	gdpval_normalized: {
		title: "GDPval-AA",
		body: "Work-like file-output tasks across economically valuable occupations, graded by pairwise comparison.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "real work completion"],
		],
	},
	terminalbench_hard: {
		title: "Terminal-Bench Hard",
		body: "AA hard subset of Terminal-Bench: terminal tasks scored by pass/fail test suites.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "terminal agent work"],
		],
	},
	ifbench: {
		title: "IFBench",
		body: "Single-turn instruction-following prompts with rule-driven response checks.",
		rows: [
			["Source", "Artificial Analysis"],
			["Role", "instruction reliability"],
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
	agents_last_exam: {
		title: "Agents' Last Exam",
		body: "Real-world software and professional-workflow benchmark. Model Atlas uses the partial-credit score.",
		rows: [
			["Source", "Agents' Last Exam"],
			["Role", "agentic real-world work"],
		],
	},
	automation_bench: {
		title: "AutomationBench",
		body: "Zapier workflow automation benchmark. Model Atlas uses the leaderboard score with a bounded domain-leadership lift.",
		rows: [
			["Source", "Zapier"],
			["Role", "business workflow automation"],
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
	gdp_pdf: {
		title: "GDP.pdf",
		body: "Surge AI document-understanding benchmark over real professional PDFs. Model Atlas uses the public leaderboard score.",
		rows: [
			["Source", "Surge AI"],
			["Role", "document reasoning"],
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
	deep_swe: {
		title: "DeepSWE",
		body: "Coding-agent benchmark. This score uses each model's best pass@1 configuration.",
		rows: [
			["Source", "DeepSWE leaderboard"],
			["Role", "coding agent work"],
		],
	},
	terminal_bench_2: {
		title: "Terminal-Bench 2.0",
		body: "Terminal task benchmark, kept separate from AA's Terminal-Bench Hard subset.",
		rows: [
			["Source", "Terminal-Bench"],
			["Role", "terminal agent work"],
		],
	},
	toolathlon: {
		title: "Toolathlon",
		body: "Multi-tool workflow benchmark. Model Atlas uses the current LLM Stats score as a modest baseline signal.",
		rows: [
			["Source", "LLM Stats / ZeroEval"],
			["Role", "multi-tool agent work"],
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
};
