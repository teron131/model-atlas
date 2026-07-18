/** Mercor APEX fixtures protect Loop Pass@1 parsing and conservative contender identity. */

import assert from "node:assert/strict";
import { processMercorApexAgentsPageHtml } from "../src/model-atlas/scrapers/mercor-apex-agents";
import { buildBenchmarkModelMap } from "../src/model-atlas/shared";

function result(
	modelId: string,
	modelName: string,
	provider: string,
	score: number,
	error: number,
) {
	return {
		model: {
			_id: modelId,
			modelId,
			modelName,
			provider: { name: provider, providerId: provider.toLowerCase() },
		},
		passScores: [
			{
				pass: "pass-1",
				harnessScores: [
					{ harness: "react_toolbelt_agent", score: score - 1, error },
					{ harness: "loop_truncated_tools_agent", score, error },
				],
			},
		],
	};
}

const pageHtml = [
	result("gpt-5-6-sol-max", "GPT 5.6 Sol (Max)", "OpenAI", 39.9, 4),
	result("gpt-5-6-sol-max-pro", "GPT 5.6 Sol (Max + Pro)", "OpenAI", 40, 4.1),
	result("zai-org/GLM-5.2-FP8", "GLM-5.2 (Thinking)", "Zhipu", 35.6, 3.6),
	result("claude-fable-5", "Fable 5", "Anthropic", 43.3, 4.1),
]
	.map((row) => JSON.stringify(row))
	.join("\n");
const rows = processMercorApexAgentsPageHtml(pageHtml);

assert.equal(rows.length, 4);
assert.deepEqual(rows[0], {
	model_id: "gpt-5-6-sol-max",
	source_model: "GPT 5.6 Sol (Max)",
	model: "GPT-5.6 Sol (max)",
	base_model: "GPT-5.6 Sol",
	reasoning_effort: "max",
	organization: "OpenAI",
	score: 0.399,
});
assert.equal(rows[1]?.base_model, "GPT-5.6 Sol Pro");
assert.equal(rows[2]?.model, "GLM-5.2 (max)");
assert.equal(rows[2]?.reasoning_effort, "max");
assert.equal(rows[3]?.base_model, "Claude Fable 5");

const scoreByModelName = buildBenchmarkModelMap(rows);
assert.equal(scoreByModelName.get("gpt-5-6-sol")?.score, 0.399);
assert.equal(scoreByModelName.get("glm-5-2")?.score, 0.356);
assert.equal(scoreByModelName.get("claude-fable-5")?.score, 0.433);
assert.equal(scoreByModelName.has("gpt-5-6-sol-pro"), true);
