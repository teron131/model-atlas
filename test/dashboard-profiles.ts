/** Protect browser profile persistence, full-filter matching, and zero-result create/update rejection independently of chart and local-table state. */

import assert from "node:assert/strict";

import {
  DEFAULT_PROFILE_FILTERS,
  matchingProfileModelCount,
  MODEL_PROFILES_STORAGE_KEY,
  readModelProfiles,
  removeModelProfile,
  sameProfileFilters,
  saveModelProfile,
} from "../app/dashboard/model-profiles";
import type { ModelAtlasModel } from "../src/model-atlas/stats/types";

const models = [
  {
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    provider: "OpenAI",
    reasoning_effort: "high",
    release_date: "2026-09-01",
    cost: { blended_price: 2 },
    scores: { intelligence_score: 80, value_score: null },
  },
  {
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    provider: "OpenAI",
    reasoning_effort: "max",
    release_date: "2026-09-01",
    cost: { blended_price: 2 },
    scores: { intelligence_score: 85, value_score: null },
  },
  {
    id: "grok-6",
    name: "Grok-6",
    provider: "xAI",
    reasoning_effort: null,
    release_date: "2026-01-01",
    cost: { blended_price: 10 },
    scores: { intelligence_score: 75, value_score: 60 },
  },
] as ModelAtlasModel[];
const fetchedAt = Date.parse("2026-10-01T00:00:00Z") / 1000;
const filters = { ...DEFAULT_PROFILE_FILTERS, q: "GPT*" };
assert.equal(matchingProfileModelCount(models, DEFAULT_PROFILE_FILTERS, fetchedAt), 2);
assert.equal(
  matchingProfileModelCount(models, filters, fetchedAt),
  1,
  "Missing plot coordinates do not make a matching model group unsavable",
);
assert.equal(matchingProfileModelCount(models, { ...filters, provider: ["xai"] }, fetchedAt), 0);
assert.equal(matchingProfileModelCount(models, { ...filters, "max-cost": 1 }, fetchedAt), 0);
assert.equal(
  matchingProfileModelCount(
    models,
    { ...DEFAULT_PROFILE_FILTERS, q: "Grok*", days: 90 },
    fetchedAt,
  ),
  0,
);
assert.equal(
  matchingProfileModelCount(models, { ...filters, q: "xyz-nonexistent*" }, fetchedAt),
  0,
);
assert.equal(matchingProfileModelCount(models, { ...filters, q: "GPT* *max" }, fetchedAt), 1);

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};
assert.deepEqual(readModelProfiles(storage), []);
const profile = { id: "one", name: " My models ", filters };
let saved = saveModelProfile(storage, [], profile, 1);
assert.equal(saved[0]!.name, "My models");
assert.deepEqual(readModelProfiles(storage), saved);
const stored = values.get(MODEL_PROFILES_STORAGE_KEY);
for (const count of [0, -1, Number.NaN]) {
  assert.throws(
    () => saveModelProfile(storage, saved, { ...profile, id: "new" }, count),
    /No models match/,
  );
  assert.throws(
    () =>
      saveModelProfile(
        storage,
        saved,
        { ...profile, filters: { ...filters, q: "xyz-nonexistent*" } },
        count,
      ),
    /No models match/,
  );
  assert.equal(
    values.get(MODEL_PROFILES_STORAGE_KEY),
    stored,
    "Rejected creates and updates leave the saved configuration intact",
  );
}
assert.throws(
  () => saveModelProfile(storage, saved, { ...profile, id: "two", name: "my MODELS" }, 1),
  /already exists/,
);
saved = saveModelProfile(storage, saved, { ...profile, filters: { ...filters, q: "Grok*" } }, 1);
assert.equal(saved.length, 1);
assert.equal(readModelProfiles(storage)[0]!.filters.q, "Grok*");
assert.equal(
  sameProfileFilters(
    { ...filters, provider: ["openai", "xai"] },
    { ...filters, provider: ["xai", "openai"] },
  ),
  true,
);
assert.throws(
  () =>
    saveModelProfile(
      {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
      saved,
      profile,
      1,
    ),
  /quota exceeded/,
);
const second = { ...profile, id: "two", name: "Other models" };
const twoProfiles = saveModelProfile(storage, saved, second, 1);
const remaining = removeModelProfile(storage, twoProfiles, profile.id);
assert.deepEqual(
  remaining.map((p) => p.id),
  ["two"],
);
assert.deepEqual(readModelProfiles(storage), remaining);
assert.deepEqual(removeModelProfile(storage, remaining, second.id), []);
assert.deepEqual(readModelProfiles(storage), []);
assert.throws(
  () =>
    removeModelProfile(
      {
        setItem: () => {
          throw new Error("storage blocked");
        },
      },
      saved,
      profile.id,
    ),
  /storage blocked/,
);
values.set(
  MODEL_PROFILES_STORAGE_KEY,
  JSON.stringify([{ ...profile, filters: { ...filters, days: "wrong" } }]),
);
assert.throws(() => readModelProfiles(storage), /could not be read/);
console.log("Dashboard profile checks passed.");
