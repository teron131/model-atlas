/** Pipeline stage switches that control how source rows are matched, enriched, pruned, and scored. */

import type { BenchmarkPortfolio } from "../benchmarks/factory";
import {
	AGENTIC_BENCHMARK_DISPLAY_KEYS,
	BENCHMARK_PORTFOLIO,
	INDEX_BENCHMARK_KEYS,
	INTELLIGENCE_BENCHMARK_DISPLAY_KEYS,
	SELECTED_AGENTIC_BENCHMARKS,
	SELECTED_INTELLIGENCE_BENCHMARKS,
} from "../benchmarks/registry";
import type { MatcherConfig } from "../identity";
import { COLUMN_TOOLTIPS, type ModelAtlasColumnTooltips } from "./tooltips";
import {
	PRICE_PROFILES,
	type PriceProfiles,
	SECONDS_PER_INPUT_TOKEN,
	SIMULATION_PROFILES,
	type SimulationProfiles,
} from "./usage-profiles";

export type OpenRouterConfig = {
	speedConcurrency: number;
};

export type BenchmarkAdmissionConfig = {
	indexBenchmarkKeys: readonly string[];
	minimumObservedBenchmarks: number;
	minimumObservedBenchmarksPerDimension: number;
};

export type FinalStageConfig = {
	nullFieldPruneThreshold: number;
	nullFieldPruneRecentLookbackDays: number;
	benchmarkAdmission: BenchmarkAdmissionConfig;
};

export type SnapshotPreservationConfig = {
	minPreviousIntelligenceScore: number;
	minIntelligenceScoreDrop: number;
};

export type ScoringConfig = {
	intelligenceBenchmarkKeys: readonly string[];
	intelligenceBenchmarkDisplayKeys: readonly string[];
	agenticBenchmarkKeys: readonly string[];
	agenticBenchmarkDisplayKeys: readonly string[];
	defaultSpeedOutputTokenAnchors: readonly number[];
	speedOutputTokenRangeMin: number;
	speedOutputTokenRangeMax: number;
	speedAnchorQuantiles: readonly number[];
	priceProfiles: PriceProfiles;
	simulationProfiles: SimulationProfiles;
	secondsPerInputToken: number;
	benchmarkPortfolio: BenchmarkPortfolio;
	columnTooltips: ModelAtlasColumnTooltips;
};

export type ModelAtlasStageConfig = {
	matcher: MatcherConfig;
	openrouter: OpenRouterConfig;
	final: FinalStageConfig;
	snapshotPreservation: SnapshotPreservationConfig;
	scoring: ScoringConfig;
};

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
			"vl",
			"coder",
			"small",
			"micro",
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
		benchmarkAdmission: {
			indexBenchmarkKeys: INDEX_BENCHMARK_KEYS,
			minimumObservedBenchmarks: 8,
			minimumObservedBenchmarksPerDimension: 1,
		},
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
		secondsPerInputToken: SECONDS_PER_INPUT_TOKEN,
		benchmarkPortfolio: BENCHMARK_PORTFOLIO,
		columnTooltips: COLUMN_TOOLTIPS,
	},
} satisfies ModelAtlasStageConfig;
