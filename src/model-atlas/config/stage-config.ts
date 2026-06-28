/** Pipeline stage switches that control how source rows are matched, enriched, pruned, and scored. */

import type { ModelAtlasStageConfig } from "../llm/stats/types";
import {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	BENCHMARK_PORTFOLIO,
	FRONTIER_BENCHMARKS,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	OVERALL_RELATIVE_SCORE_WEIGHTS,
	QUALITY_SCORE_WEIGHTS,
	SELECTED_AGENTIC_BENCHMARKS,
	SELECTED_INTELLIGENCE_BENCHMARKS,
} from "./benchmark-portfolio";
import { COLUMN_TOOLTIPS } from "./column-tooltips";
import {
	PRICE_PROFILES,
	SIMULATION_INPUT_TOKEN_SECONDS,
	SIMULATION_PROFILES,
} from "./usage-profiles";

/** Centralized stage config for matching, enrichment, pruning, and scoring. */
export const STAGE_CONFIG = {
	matcher: {
		variantTokens: [
			"flash-lite",
			"flash",
			"pro",
			"nano",
			"mini",
			"lite",
			"max",
			"image",
			"codex",
			"omni",
			"multi-agent",
			"latest",
		],
	},
	openrouter: {
		speedConcurrency: 8,
	},
	final: {
		nullFieldPruneThreshold: 0.5,
		nullFieldPruneRecentLookbackDays: 90,
	},
	snapshotPreservation: {
		minPreviousIntelligenceScore: 90,
		minIntelligenceScoreDrop: 10,
	},
	scoring: {
		intelligenceBenchmarkKeys: SELECTED_INTELLIGENCE_BENCHMARKS,
		intelligenceBenchmarkDisplayKeys: INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
		agenticBenchmarkKeys: SELECTED_AGENTIC_BENCHMARKS,
		agenticBenchmarkDisplayKeys: AGENTIC_BENCHMARK_DISPLAY_KEYS,
		defaultSpeedOutputTokenAnchors: [200, 500, 1_000, 2_000, 8_000],
		speedOutputTokenRangeMin: 200,
		speedOutputTokenRangeMax: 8_000,
		speedAnchorQuantiles: [0.25, 0.5, 0.75],
		priceProfiles: PRICE_PROFILES,
		simulationProfiles: SIMULATION_PROFILES,
		simulationInputTokenSeconds: SIMULATION_INPUT_TOKEN_SECONDS,
		benchmarkPortfolio: BENCHMARK_PORTFOLIO,
		frontierBenchmarkKeys: FRONTIER_BENCHMARKS,
		qualityScoreWeights: QUALITY_SCORE_WEIGHTS,
		overallRelativeScoreWeights: OVERALL_RELATIVE_SCORE_WEIGHTS,
		columnTooltips: COLUMN_TOOLTIPS,
	},
} satisfies ModelAtlasStageConfig;
