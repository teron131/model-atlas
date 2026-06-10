import type { SimulationProfile } from "../llm/model-stats/types";

export const PRICE_PROFILES = {
	task: {
		weight: 0.25,
		input: 0.8,
		output: 0.2,
	},
	chat: {
		weight: 0.4,
		input: 0.5,
		output: 0.5,
	},
	agentic: {
		weight: 0.35,
		input: 0.3,
		output: 0.7,
	},
} as const;

export const PRICE_PROFILE_WEIGHTS = Object.fromEntries(
	Object.entries(PRICE_PROFILES).map(([profile, config]) => [
		profile,
		config.weight,
	]),
) as Record<keyof typeof PRICE_PROFILES, number>;

export const PRICE_PROFILE_TOTAL_WEIGHT = Object.values(PRICE_PROFILES).reduce(
	(sum, config) => sum + config.weight,
	0,
);

export const PRICE_PROFILE_ENTRIES = [
	["Task", "task"],
	["Chat", "chat"],
	["Agentic", "agentic"],
] as const satisfies readonly [string, keyof typeof PRICE_PROFILES][];

export const SIMULATION_PROFILES = {
	micro: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 500,
			upper: 3_000,
		},
		output_tokens_per_call: {
			lower: 1,
			upper: 50,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 30,
		quality_blend: {
			intelligence: 0.3,
			agentic: 0.7,
		},
	},
	refine_translate: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 500,
			upper: 20_000,
		},
		output_tokens_per_call: {
			lower: 500,
			upper: 20_000,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 35,
		quality_blend: {
			intelligence: 0.35,
			agentic: 0.65,
		},
	},
	extract_structure: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 3_000,
			upper: 20_000,
		},
		output_tokens_per_call: {
			lower: 100,
			upper: 1_200,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 45,
		quality_blend: {
			intelligence: 0.4,
			agentic: 0.6,
		},
	},
	chat_reasoning: {
		weight: 0.2,
		calls: 4,
		input_tokens_per_call: {
			lower: 1_000,
			upper: 12_000,
		},
		output_tokens_per_call: {
			lower: 300,
			upper: 2_000,
		},
		cacheable_input_share: 0.5,
		cache_hit_rate_after_first_call: {
			lower: 0.5,
			upper: 0.9,
		},
		quality_full_credit_at: 60,
		quality_blend: {
			intelligence: 0.55,
			agentic: 0.45,
		},
	},
	long_synthesis: {
		weight: 0.15,
		calls: 1,
		input_tokens_per_call: {
			lower: 20_000,
			upper: 80_000,
		},
		output_tokens_per_call: {
			lower: 1_500,
			upper: 6_000,
		},
		cacheable_input_share: 0,
		cache_hit_rate_after_first_call: {
			lower: 0,
			upper: 0,
		},
		quality_full_credit_at: 75,
		quality_blend: {
			intelligence: 0.65,
			agentic: 0.35,
		},
	},
	agentic_loop: {
		weight: 0.2,
		calls: 8,
		input_tokens_per_call: {
			lower: 8_000,
			upper: 60_000,
		},
		output_tokens_per_call: {
			lower: 500,
			upper: 4_000,
		},
		cacheable_input_share: 0.7,
		cache_hit_rate_after_first_call: {
			lower: 0.5,
			upper: 0.9,
		},
		quality_full_credit_at: 90,
		quality_blend: {
			intelligence: 0.25,
			agentic: 0.75,
		},
	},
} as const satisfies Record<string, SimulationProfile>;

export const SIMULATION_INPUT_TOKEN_SECONDS = 0.0001;

export const SIMULATION_PROFILE_WEIGHTS = Object.fromEntries(
	Object.entries(SIMULATION_PROFILES).map(([profile, config]) => [
		profile,
		config.weight,
	]),
) as Record<keyof typeof SIMULATION_PROFILES, number>;
