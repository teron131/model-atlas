/** Verify wildcard and separator-ended model prefixes while preserving keyword boundaries and alternatives. */

import assert from "node:assert/strict";

import { filterSearchDocuments, hasSearchQuery } from "../app/dashboard/shared/search";

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
assert.deepEqual(filterSearchDocuments("gpt-", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("gpt-6", documents), ["sol", "solar"]);
assert.deepEqual(filterSearchDocuments("pt-", documents), []);

assert.equal(hasSearchQuery(" , \n , "), false);
assert.equal(hasSearchQuery(" , gpt- , "), true);
assert.equal(hasSearchQuery("*"), true);
