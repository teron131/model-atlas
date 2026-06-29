import {
	buildToolathlonMap,
	findToolathlonScore,
	processToolathlonDetailsJson,
} from "../src/model-atlas/scrapers/toolathlon";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const rows = processToolathlonDetailsJson({
	models: [
		{
			rank: 1,
			model_name: "Claude Opus 4.8",
			organization_id: "anthropic",
			organization_name: "Anthropic",
			score: 0.599,
			normalized_score: 0.599,
			self_reported_source: "https://www.anthropic.com/news/claude-opus-4-8",
			analysis_method:
				"Pass@1 averaged over 3 trials across all 108 tasks. Internal harness with adaptive thinking at max effort. Pass@3: 67.6%.",
			verified: false,
			self_reported: true,
			announcement_date: "2026-05-28",
		},
		{
			rank: 2,
			model_name: "Gemini 3.5 Flash",
			organization_id: "google",
			organization_name: "Google",
			score: 0.565,
			normalized_score: null,
			self_reported_source:
				"https://deepmind.google/models/evals-methodology/gemini-3-5-flash/",
			verified: false,
			self_reported: true,
		},
		{
			model_name: "Invalid Score",
			organization_id: "example",
			normalized_score: 1.2,
		},
	],
});

assertDeepEqual(rows, [
	{
		rank: 1,
		model: "Claude Opus 4.8",
		provider: "anthropic",
		provider_name: "Anthropic",
		score: 0.599,
		source_url: "https://www.anthropic.com/news/claude-opus-4-8",
		analysis_method:
			"Pass@1 averaged over 3 trials across all 108 tasks. Internal harness with adaptive thinking at max effort. Pass@3: 67.6%.",
		verified: false,
		self_reported: true,
		announcement_date: "2026-05-28",
	},
	{
		rank: 2,
		model: "Gemini 3.5 Flash",
		provider: "google",
		provider_name: "Google",
		score: 0.565,
		source_url:
			"https://deepmind.google/models/evals-methodology/gemini-3-5-flash/",
		analysis_method: null,
		verified: false,
		self_reported: true,
		announcement_date: null,
	},
]);

const scoreByModelName = buildToolathlonMap(rows);

assertDeepEqual(
	findToolathlonScore(["missing", "Claude Opus 4.8"], scoreByModelName),
	0.599,
);
