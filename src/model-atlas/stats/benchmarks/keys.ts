/** Shared benchmark field keys used by stats and database payload reconstruction. */

export const ARTIFICIAL_ANALYSIS_INTELLIGENCE_KEYS = [
	"intelligence_index",
	"agentic_index",
	"coding_index",
	"omniscience_index",
	"omniscience_accuracy",
] as const;

export const ARTIFICIAL_ANALYSIS_EVALUATION_KEYS = [
	"apex_agents",
	"critpt",
	"gdpval_normalized",
	"gpqa",
	"hle",
	"lcr",
	"mmmu_pro",
	"scicode",
	"tau_banking",
	"terminalbench_v21",
] as const;

export const MODEL_ATLAS_EVALUATION_KEYS = [
	...ARTIFICIAL_ANALYSIS_EVALUATION_KEYS,
	"agents_last_exam",
	"automation_bench",
	"blueprint_bench_2",
	"browsecomp",
	"cursorbench",
	"deep_swe",
	"gdp_pdf",
	"riemann_bench",
	"toolathlon",
	"vals_index",
] as const;
