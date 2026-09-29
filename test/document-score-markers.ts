/** Protect explicit score annotations from styling ordinary words or breaking Markdown links, emphasis, headings, and accessibility text. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { DOCUMENTS, documentTitle, headingId, tableOfContents } from "../app/methodology/documents";
import { plainScoreText, scoreMarkers, scoreMentions } from "../app/methodology/score-markers";

const marker = ":score[Intelligence]";
assert.deepEqual(scoreMarkers(`Highest ${marker} score`), [
  { index: 8, end: 8 + marker.length, score: "Intelligence" },
]);
assert.equal(plainScoreText(`Highest ${marker} score`), "Highest Intelligence score");
assert.deepEqual(scoreMarkers("Intelligence Agentic Speed Value Pareto Value Best Agentic"), []);
assert.deepEqual(scoreMarkers(":score[Unknown]"), []);

const plain =
  "Intelligence and Agentic describe capabilities. Pareto Value and Best Agentic are roles. Provider Speed, Value, and the Intelligence Index stay plain.";
assert.equal(render(plain), `<p>${plain}</p>`);

const formatted = render(
  "**highest :score[Intelligence] score** and [compare :score[Speed] and :score[Value]](speed-value.md#combining-speed-and-value-components).",
);
assert.match(
  formatted,
  /<strong>highest <span data-score="Intelligence">Intelligence<\/span> score<\/strong>/,
);
assert.match(
  formatted,
  /<a href="speed-value\.md#combining-speed-and-value-components">compare <span data-score="Speed">Speed<\/span> and <span data-score="Value">Value<\/span><\/a>/,
);
assert.equal((formatted.match(/data-score=/g) ?? []).length, 3);
assert.ok(!formatted.includes(":score["));

const table = render(
  "| Parameter | Value | :score[Value] |\n| --- | --- | --- |\n| Role | Pareto Value | **:score[Agentic]** |",
);
assert.match(table, /<th>Value<\/th>/);
assert.match(table, /<th><span data-score="Value">Value<\/span><\/th>/);
assert.match(table, /<td>Pareto Value<\/td>/);
assert.equal((table.match(/data-score=/g) ?? []).length, 2);

const protectedText = render(
  "`:score[Value]`\n\n```text\n:score[Speed]\n```\n\n$\\text{Intelligence}$\n\n<!-- :score[Agentic] -->",
);
assert.ok(protectedText.includes("<code>:score[Value]</code>"));
assert.ok(protectedText.includes(":score[Speed]"));
assert.ok(protectedText.includes('class="katex"'));
assert.ok(!protectedText.includes("data-score="));
assert.ok(!protectedText.includes(":score[Agentic]"));

const image = render(
  "![Measured :score[Speed] and :score[Value].](../assets/methodology/example.svg)",
);
assert.ok(image.includes('alt="Measured Speed and Value."'));
assert.ok(!image.includes(":score["));

const title = "# :score[Intelligence] and :score[Agentic]";
assert.equal(
  documentTitle(title, "Intelligence and Agentic"),
  ":score[Intelligence] and :score[Agentic]",
);
assert.equal(documentTitle("# Dashboard Inclusion", "Leaderboard Rules"), "Leaderboard Rules");
assert.equal(
  documentTitle("# Intelligence and Agentic", "Intelligence and Agentic"),
  "Intelligence and Agentic",
);
assert.equal(
  headingId("How :score[Speed] and :score[Value] Are Calculated"),
  "how-speed-and-value-are-calculated",
);
assert.deepEqual(tableOfContents("## How :score[Speed] and :score[Value] Are Calculated"), [
  {
    id: "how-speed-and-value-are-calculated",
    label: "How :score[Speed] and :score[Value] Are Calculated",
    level: 2,
  },
]);

for (const document of DOCUMENTS) {
  const markdown = readFileSync(`docs/${document.source}`, "utf8");
  assert.ok(
    !plainScoreText(markdown).includes(":score["),
    `${document.source}: unknown or incomplete marker`,
  );
  assert.deepEqual(
    tableOfContents(markdown).map(({ id }) => id),
    tableOfContents(plainScoreText(markdown)).map(({ id }) => id),
    `${document.source}: marker changed heading anchors`,
  );
}

function render(markdown: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [scoreMentions, rehypeKatex],
      skipHtml: true,
      components: {
        img: ({ alt = "", src }) => createElement("img", { src, alt: plainScoreText(alt) }),
      },
      children: markdown,
    }),
  );
}
