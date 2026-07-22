/** Benchmark source policy owns loaders, adapters, processing, and persistence declarations. */

import type {
	BenchmarkPersistenceFacet,
	BenchmarkProcessingFacet,
	BenchmarkScoreLoader,
	BenchmarkSourceFacet,
	BenchmarkSourceGroup,
} from "../factory";
import type { BenchmarkKey } from "./portfolio";

export const BENCHMARK_SCORE_SOURCES = {
	browsecomp: {
		group: "sparse",
		id: "zeroeval",
		loader: {
			kind: "zeroeval",
			sourceUrl:
				"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
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
		loader: { kind: "custom" },
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
	toolathlon: {
		group: "sparse",
		id: "zeroeval",
		loader: {
			kind: "zeroeval",
			sourceUrl:
				"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details",
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
		group: "sparse",
		id: "weirdml",
		loader: { kind: "custom" },
		sourceDataKey: "weirdMl",
		sourceRowsKey: "weirdMlRows",
	},
} as const satisfies Readonly<
	Record<
		string,
		{
			group: BenchmarkSourceGroup;
			id: string;
			loader: BenchmarkScoreLoader;
			sourceDataKey: string;
			sourceRowsKey: string;
		}
	>
>;

export const BENCHMARK_SOURCE_OVERRIDES = {
	aa_intelligence_index: {
		inputs: [
			{
				group: "artificial_analysis",
				id: "artificial_analysis",
				roles: ["observation"],
				adapters: undefined,
			},
		],
	},
	agent_arena: {
		inputs: [
			{
				group: "sparse",
				id: "agent_arena",
				roles: ["observation"],
				runtime: { key: "agent_arena", publicRows: true },
			},
		],
	},
	agents_last_exam: {
		inputs: [
			{
				group: "sparse",
				id: "agents_last_exam",
				roles: ["observation", "resource"],
				runtime: { key: "agents_last_exam", publicRows: true },
			},
		],
	},
	ale_bench: {
		inputs: [
			{
				group: "sparse",
				id: "sakana",
				roles: ["observation", "resource"],
				runtime: { key: "ale_bench", publicRows: true },
			},
			{ group: "epoch", id: "epoch", roles: ["validation"] },
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
						kind: "artificial_analysis_leaderboard",
						aliases: ["apexAgents", "apex_agents"],
					},
					{
						kind: "artificial_analysis_resource_page",
						url: "https://artificialanalysis.ai/evaluations/apex-agents-aa",
						taskRunCount: 452,
					},
				],
			},
			{
				group: "sparse",
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
				group: "sparse",
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
	weirdml: {
		inputs: [
			{
				group: "sparse",
				id: "weirdml",
				roles: ["observation"],
				adapters: [
					{
						kind: "benchmark_score",
						sourceDataKey: "weirdMl",
						sourceRowsKey: "weirdMlRows",
					},
				],
			},
			{ group: "epoch", id: "epoch", roles: ["observation", "validation"] },
		],
	},
	critpt: {
		inputs: [
			{
				group: "artificial_analysis",
				id: "artificial_analysis",
				roles: ["observation", "resource"],
				adapters: [
					{ kind: "artificial_analysis_leaderboard", aliases: ["critpt"] },
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
				group: "sparse",
				id: "cursor",
				roles: ["observation", "resource"],
				runtime: { key: "cursorbench", publicRows: true },
			},
		],
	},
	deep_swe: {
		inputs: [
			{
				group: "sparse",
				id: "deep_swe",
				roles: ["observation", "resource"],
				runtime: { key: "deep_swe", publicRows: true },
			},
		],
	},
	frontier_code: {
		inputs: [
			{
				group: "sparse",
				id: "cognition",
				roles: ["observation", "resource"],
				runtime: { key: "frontier_code", publicRows: true },
			},
		],
	},
	gdp_pdf: {
		inputs: [
			{
				group: "surge",
				id: "surge",
				roles: ["observation"],
				runtime: { key: "gdp_pdf", publicRows: true },
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
						kind: "artificial_analysis_leaderboard",
						aliases: ["gdpvalNormalized", "gdpval_normalized"],
					},
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
				group: "artificial_analysis",
				id: "artificial_analysis",
				roles: ["observation"],
				adapters: [
					{
						kind: "artificial_analysis_leaderboard",
						aliases: ["harveyLab", "harvey_lab"],
					},
				],
			},
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
					{ kind: "artificial_analysis_leaderboard", aliases: ["hle"] },
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
						kind: "artificial_analysis_leaderboard",
						aliases: ["itbenchSre", "itbench_sre"],
					},
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
	lcr: {
		inputs: [
			{
				group: "artificial_analysis",
				id: "artificial_analysis",
				roles: ["observation"],
				adapters: [
					{ kind: "artificial_analysis_leaderboard", aliases: ["lcr"] },
				],
			},
		],
	},
	omniscience_accuracy: {
		inputs: [
			{
				group: "artificial_analysis",
				id: "artificial_analysis",
				roles: ["observation"],
				adapters: undefined,
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
				roles: ["observation"],
				adapters: [
					{ kind: "artificial_analysis_leaderboard", aliases: ["scicode"] },
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
						kind: "artificial_analysis_leaderboard",
						aliases: ["tauBanking", "tau_banking"],
					},
					{
						kind: "artificial_analysis_resource_page",
						url: "https://artificialanalysis.ai/evaluations/tau3-banking",
						taskRunCount: 97,
					},
				],
			},
		],
	},
	terminalbench_v21: {
		inputs: [
			{
				group: "artificial_analysis",
				id: "artificial_analysis",
				roles: ["observation", "resource"],
				adapters: [
					{
						kind: "artificial_analysis_leaderboard",
						aliases: ["terminalbenchV21", "terminalbench_v21"],
					},
					{
						kind: "artificial_analysis_resource_page",
						scoreKey: "terminalbench_v2_1",
						url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1",
						taskRunCount: 267,
					},
				],
			},
			{
				group: "vals",
				id: "vals",
				roles: ["observation", "resource"],
				runtime: { key: "vals_terminal_bench", publicRows: true },
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
				group: "sparse",
				id: "andon_labs",
				roles: ["observation"],
				runtime: { key: "vending_bench_2", publicRows: true },
			},
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
	terminalbench_v21: {
		aggregation: { kind: "custom" },
	},
	weirdml: {
		sourceCrosswalk: { kind: "validated_merge" },
	},
} as const satisfies Partial<
	Record<BenchmarkKey, Partial<BenchmarkProcessingFacet>>
>;

export const BENCHMARK_PERSISTENCE_OVERRIDES = {
	aa_intelligence_index: {
		location: { kind: "intelligence", field: "intelligence_index" },
		exposure: "public",
	},
	omniscience_accuracy: {
		location: { kind: "intelligence", field: "omniscience_accuracy" },
		exposure: "public",
	},
} as const satisfies Partial<Record<BenchmarkKey, BenchmarkPersistenceFacet>>;
