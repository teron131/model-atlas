import {
	buildAutomationBenchScoreByModelName,
	findAutomationBenchScore,
	processAutomationBenchPageHtml,
	summarizeAutomationBenchModelScores,
} from "../src/model-atlas/llm/scrapers/automation-bench";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const pageHtml = `
	<section>
		Leaderboard
		Rank
		Model
		Score
		Cost / task
		1
		Fable 5.0 (Max)
		17.4%
		$3.67
		2
		Fable 5.0 (XHigh)
		16.0%
		$3.03
		3
		Claude Opus 4.8 (XHigh)
		15.5%
		$2.36
		4
		Claude Opus 4.8 (Max)
		15.4%
		$3.11
		By domain
		Domain
		Top Model
		Score
		2nd Place model
		Sales
		GPT-5.5 (XHigh) &#8212; OpenAI
		17.9%
		Claude Opus 4.8 (Max) &#8212; Anthropic (17.1%)
		Marketing
		GPT-5.5 (XHigh) &mdash; OpenAI
		20.0%
		Fable 5.0 (Max) &mdash; Anthropic / Claude Opus 4.7 (Max) &mdash; Anthropic (tie at 18.0%)
		Operations
		Fable 5.0 (Max) &mdash; Anthropic
		27.0%
		Fable 5.0 (XHigh) &mdash; Anthropic (23.0%)
		Try the latest models in Zapier
	</section>
`;

const parsed = processAutomationBenchPageHtml(pageHtml);

assertDeepEqual(parsed.overall, [
	{
		model: "Fable 5.0 (Max)",
		reasoning_effort: "Max",
		score: 0.174,
		cost_per_task_usd: 3.67,
	},
	{
		model: "Fable 5.0 (XHigh)",
		reasoning_effort: "XHigh",
		score: 0.16,
		cost_per_task_usd: 3.03,
	},
	{
		model: "Claude Opus 4.8 (XHigh)",
		reasoning_effort: "XHigh",
		score: 0.155,
		cost_per_task_usd: 2.36,
	},
	{
		model: "Claude Opus 4.8 (Max)",
		reasoning_effort: "Max",
		score: 0.154,
		cost_per_task_usd: 3.11,
	},
]);

assertDeepEqual(parsed.domains, [
	{
		domain: "Sales",
		top_model: "GPT-5.5 (XHigh)",
		top_reasoning_effort: "XHigh",
		top_provider: "OpenAI",
		score: 0.179,
		second_place_models: [
			{
				model: "Claude Opus 4.8 (Max)",
				reasoning_effort: "Max",
				provider: "Anthropic",
			},
		],
		second_place_score: 0.171,
		second_place_tie: false,
		second_place_raw: "Claude Opus 4.8 (Max) \u2014 Anthropic (17.1%)",
	},
	{
		domain: "Marketing",
		top_model: "GPT-5.5 (XHigh)",
		top_reasoning_effort: "XHigh",
		top_provider: "OpenAI",
		score: 0.2,
		second_place_models: [
			{
				model: "Fable 5.0 (Max)",
				reasoning_effort: "Max",
				provider: "Anthropic",
			},
			{
				model: "Claude Opus 4.7 (Max)",
				reasoning_effort: "Max",
				provider: "Anthropic",
			},
		],
		second_place_score: 0.18,
		second_place_tie: true,
		second_place_raw:
			"Fable 5.0 (Max) \u2014 Anthropic / Claude Opus 4.7 (Max) \u2014 Anthropic (tie at 18.0%)",
	},
	{
		domain: "Operations",
		top_model: "Fable 5.0 (Max)",
		top_reasoning_effort: "Max",
		top_provider: "Anthropic",
		score: 0.27,
		second_place_models: [
			{
				model: "Fable 5.0 (XHigh)",
				reasoning_effort: "XHigh",
				provider: "Anthropic",
			},
		],
		second_place_score: 0.23,
		second_place_tie: false,
		second_place_raw: "Fable 5.0 (XHigh) \u2014 Anthropic (23.0%)",
	},
]);

assertDeepEqual(
	summarizeAutomationBenchModelScores(parsed.overall, parsed.domains),
	parsed.model_scores,
);

assertDeepEqual(parsed.model_scores, [
	{
		model: "Fable 5.0 (Max)",
		reasoning_effort: "Max",
		score: 0.174,
		cost_per_task_usd: 3.67,
		domain_lead_scores: [0.27],
		domain_lead_score_median: 0.27,
		adjusted_score: 0.198,
	},
	{
		model: "Fable 5.0 (XHigh)",
		reasoning_effort: "XHigh",
		score: 0.16,
		cost_per_task_usd: 3.03,
		domain_lead_scores: [],
		domain_lead_score_median: null,
		adjusted_score: 0.16,
	},
	{
		model: "Claude Opus 4.8 (XHigh)",
		reasoning_effort: "XHigh",
		score: 0.155,
		cost_per_task_usd: 2.36,
		domain_lead_scores: [],
		domain_lead_score_median: null,
		adjusted_score: 0.155,
	},
	{
		model: "Claude Opus 4.8 (Max)",
		reasoning_effort: "Max",
		score: 0.154,
		cost_per_task_usd: 3.11,
		domain_lead_scores: [],
		domain_lead_score_median: null,
		adjusted_score: 0.154,
	},
]);

const scoreByModelName = buildAutomationBenchScoreByModelName(
	parsed.model_scores,
);
assertDeepEqual(
	findAutomationBenchScore(["fable-5.0-xhigh"], scoreByModelName),
	0.16,
);
assertDeepEqual(
	findAutomationBenchScore(["Claude Opus 4.8 (XHigh)"], scoreByModelName),
	0.155,
);
assertDeepEqual(
	findAutomationBenchScore(["Claude Opus 4.8"], scoreByModelName),
	0.154,
);
assertDeepEqual(
	findAutomationBenchScore(["Claude Fable 5"], scoreByModelName),
	0.198,
);
assertDeepEqual(findAutomationBenchScore(["Fable 5"], scoreByModelName), 0.198);
