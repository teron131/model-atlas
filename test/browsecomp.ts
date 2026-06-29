import {
	buildBrowseCompMap,
	findBrowseCompScore,
	processBrowseCompDetailsJson,
} from "../src/model-atlas/scrapers/browsecomp";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processBrowseCompDetailsJson({
	models: [
		{
			model_name: "GPT-5.5 Pro",
			organization_id: "openai",
			organization_name: "OpenAI",
			score: 0.901,
			normalized_score: 0.901,
			self_reported_source: "https://openai.com/index/introducing-gpt-5-5/",
			analysis_method: "GPT-5.5 Pro - BrowseComp.",
			verified: false,
			self_reported: true,
		},
		{
			model_name: "Claude Opus 4.6",
			organization_id: "anthropic",
			organization_name: "Anthropic",
			score: 0.84,
			normalized_score: null,
			self_reported_source: "https://www.anthropic.com/news/claude-opus-4-6",
			analysis_method: "Official BrowseComp score.",
			verified: false,
			self_reported: true,
		},
		{
			model_name: "MiniMax M3",
			organization_id: "minimax",
			organization_name: "MiniMax",
			score: null,
			normalized_score: 0.835,
		},
	],
});

assertDeepEqual(rows, [
	{
		model: "GPT-5.5 Pro",
		provider: "openai",
		provider_name: "OpenAI",
		score: 0.901,
		source_url: "https://openai.com/index/introducing-gpt-5-5/",
		analysis_method: "GPT-5.5 Pro - BrowseComp.",
		verified: false,
		self_reported: true,
	},
	{
		model: "Claude Opus 4.6",
		provider: "anthropic",
		provider_name: "Anthropic",
		score: 0.84,
		source_url: "https://www.anthropic.com/news/claude-opus-4-6",
		analysis_method: "Official BrowseComp score.",
		verified: false,
		self_reported: true,
	},
	{
		model: "MiniMax M3",
		provider: "minimax",
		provider_name: "MiniMax",
		score: 0.835,
		source_url: null,
		analysis_method: null,
		verified: null,
		self_reported: null,
	},
]);

const scoreByModelName = buildBrowseCompMap(rows);

assertDeepEqual(
	findBrowseCompScore(["missing", "GPT 5.5 Pro"], scoreByModelName),
	0.901,
);
