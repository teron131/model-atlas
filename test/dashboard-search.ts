/** Verify wildcard model search while preserving ordinary keyword boundaries and alternatives. */

import assert from "node:assert/strict";

import { filterSearchDocuments } from "../app/dashboard/shared/search";

const documents = [
  { value: "sol", primary: ["GPT-6 Sol"] },
  { value: "solar", primary: ["GPT-6 Solar"] },
  { value: "other", primary: ["Grok-6 Sol"] },
];

assert.deepEqual(filterSearchDocuments("gpt*so", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("gpt*sol", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("gpt*so, grok", documents), ["sol", "solar", "other"]);
assert.deepEqual(filterSearchDocuments("sol", documents), ["sol", "solar", "other"]);
assert.deepEqual(filterSearchDocuments("ola", documents), []);
assert.deepEqual(filterSearchDocuments("gpt*xy", documents), []);
