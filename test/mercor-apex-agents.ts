/** Protect Mercor's metric selection and its separately published effort and product-qualifier identities. */

import assert from "node:assert/strict";

import { processMercorPageHtml } from "../src/model-atlas/sources/mercor/results";

const parse = (html: string) =>
  processMercorPageHtml(html, "apex_agents", {
    sourceUrl: "https://www.mercor.com/apex/apex-agents-leaderboard/",
    harness: "loop_truncated_tools_agent",
  });

const result = (effort: string, score: number) => ({
  model: {
    _id: `fable-${effort}`,
    modelId: `claude-fable-5.1-${effort}`,
    modelName: "Fable 5.1",
    effort,
    provider: { name: "Anthropic" },
  },
  passScores: [
    { pass: "mean-score", harnessScores: [{ harness: "loop_truncated_tools_agent", score: 90 }] },
    {
      pass: "pass-1",
      harnessScores: [
        { harness: "react", score: 80 },
        { harness: "loop_truncated_tools_agent", score },
      ],
    },
  ],
});

const rows = parse(JSON.stringify([result("max", 68.6), result("high", 60)]));
assert.deepEqual(
  rows.map(({ model, reasoning_effort, canonical_value: score }) => ({
    model,
    reasoning_effort,
    score,
  })),
  [
    { model: "Claude Fable 5.1 (max)", reasoning_effort: "max", score: 0.686 },
    { model: "Claude Fable 5.1 (high)", reasoning_effort: "high", score: 0.6 },
  ],
);

const described = (
  modelName: string,
  descriptors: string[] | null,
  effort: string,
  score: number,
) => {
  const row = result(effort, score);
  return { ...row, model: { ...row.model, modelName, descriptors } };
};
assert.deepEqual(
  parse(
    JSON.stringify([
      described("GPT-5.6 Sol", ["Pro"], "max", 51.5),
      described("Kimi K2", ["Thinking"], "high", 17.4),
      described("MiMo V2.6 Pro", null, "auto", 54.4),
    ]),
  ).map(({ model, base_model, reasoning_effort }) => ({ model, base_model, reasoning_effort })),
  [
    { model: "MiMo V2.6 Pro", base_model: "MiMo V2.6 Pro", reasoning_effort: null },
    { model: "GPT-5.6 Sol Pro (max)", base_model: "GPT-5.6 Sol Pro", reasoning_effort: "max" },
    { model: "Kimi K2 Thinking (high)", base_model: "Kimi K2 Thinking", reasoning_effort: "high" },
  ],
);
