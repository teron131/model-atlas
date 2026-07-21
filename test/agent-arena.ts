/** Agent Arena scraper fixtures protect ranked causal effects, model identity, and matching. */

import assert from "node:assert/strict";
import { processAgentArenaPageHtml } from "../src/model-atlas/scrapers/agent-arena";
import { buildBenchmarkModelMap } from "../src/model-atlas/shared";

const payload = {
	arena: { slug: "agent", title: "Agent" },
	snapshot: {
		rows: [
			{
				rank: 1,
				contenderName: "contenders/claude-fable-5-agent",
				model: "Claude Fable 5 (High)",
				modelOrganization: "Anthropic",
				avgScore: { value: 0.1394 },
			},
			{
				rank: 2,
				contenderName: "contenders/grok-4.3-agent",
				model: "Grok 4.3",
				modelOrganization: "SpaceXAI",
				avgScore: { value: -0.153 },
			},
		],
	},
};
const pageHtml = `<script>self.__next_f.push([1,${JSON.stringify(
	JSON.stringify(payload),
)}])</script>`;
const rows = processAgentArenaPageHtml(pageHtml);

assert.equal(rows.length, 2);
assert.equal(rows[0]?.score, 0.1394);
assert.equal(rows[0]?.base_model, "Claude Fable 5");
assert.equal(rows[0]?.reasoning_effort, "high");
assert.equal(rows[0]?.organization, "Anthropic");
assert.equal(rows[1]?.score, -0.153);

const rowsByModelName = buildBenchmarkModelMap(rows);
assert.equal(rowsByModelName.get("grok-4-3")?.score, -0.153);
assert.equal(rowsByModelName.get("claude-fable-5")?.score, 0.1394);
