/** Protect Mercor's metric selection and separately published reasoning-effort identities. */

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

const labelled = result("", 50);
labelled.model.modelName = "Opus 5 (Max + Pro)";
const proRows = parse(JSON.stringify(labelled));
assert.equal(proRows[0]?.base_model, "Claude Opus 5 Pro");
assert.equal(proRows[0]?.model, "Claude Opus 5 (Max + Pro)");
assert.equal(proRows[0]?.reasoning_effort, "max");
labelled.model.modelName = "Opus 5 (Thinking)";
assert.equal(parse(JSON.stringify(labelled))[0]?.base_model, "Claude Opus 5");
