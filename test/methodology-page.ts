/** Verify documentation routing, headings, and methodology asset resolution. */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
	documentHref,
	documentImageSize,
	documentImageSource,
	documentLink,
	tableOfContents,
} from "../app/methodology/documents";

const methodology = await readFile("docs/methodology.md", "utf8");
const outline = tableOfContents(methodology);

assert.equal(documentHref("methodology"), "/methodology");
assert.equal(documentHref("benchmarks"), "/methodology/benchmarks");
assert.equal(
	documentLink("methodology.md#apex-agents-source-crosswalk"),
	"/methodology#apex-agents-source-crosswalk",
);
assert.equal(documentLink("standards.md"), "/methodology/standards");
assert.equal(documentLink("https://example.com"), "https://example.com");
assert.equal(
	documentImageSource("assets/methodology/coverage-confidence.svg"),
	"/methodology-assets/coverage-confidence.svg",
);
assert.equal(
	documentImageSource("assets/methodology/unknown.svg"),
	"assets/methodology/unknown.svg",
);
assert.deepEqual(documentImageSize("logit-quality.svg"), {
	width: 720,
	height: 520,
});
assert.equal(
	outline.some(
		(item) =>
			item.id === "intelligence-and-agentic" &&
			item.label === "Intelligence and Agentic" &&
			item.level === 2,
	),
	true,
	"the methodology outline should expose stable section anchors",
);

console.log("methodology page checks passed");
