/** Trust Me Bro Index candidates, validation, correction, places, and storage semantics. */

import assert from "node:assert/strict";

import {
  readActiveTmbRanking,
  readTmbRanking,
  submitTmbRanking,
  type TmbPointer,
  type TmbStore,
} from "../src/model-atlas/database/snapshots/tmb-rankings";
import {
  applyTmbIndex,
  parseTmbRanking,
  tmbCandidateErrors,
  tmbCandidates,
  tmbPlaceLabel,
  type TmbRanking,
} from "../src/model-atlas/stats/tmb-index";
import type { ModelAtlasModel } from "../src/model-atlas/stats/types";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

function model(id: string, score: number, releaseDate: string, effort: string | null = null) {
  const base = minimalModelAtlasModel({ id, name: id.toUpperCase() });
  return {
    ...base,
    reasoning_effort: effort,
    release_date: releaseDate,
    scores: { ...base.scores, intelligence_score: score },
  } satisfies ModelAtlasModel;
}

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

function chain(entries: [relation: string | null, id: string][]) {
  return entries.map(([relation, id]) => ({
    ...(relation == null ? {} : { relation }),
    model_id: id,
  })) as TmbRanking["inequalities"][number];
}

// Top ten by Intelligence, then releases after 2026-08-19, sorted by id.
const field = [
  model("k", 99, "2026-10-01"),
  model("j", 98, "2026-06-01"),
  ...["a", "b", "c", "d", "e", "f", "g", "h"].map((id, index) =>
    model(id, 90 - index, index === 3 ? "2026-08-19" : "2026-09-15"),
  ),
  model("late", 50, "2026-10-10"),
];
assert.deepEqual(
  tmbCandidates(minimalModelAtlasPayload({ fetchedAt: 1, models: field }), "2026-10-19").map(
    (entry) => entry.model_id,
  ),
  ["a", "b", "c", "e", "f", "g", "h", "k"],
);

const candidates = ["a", "b", "c"].map((id) => ({
  model_id: id,
  name: id.toUpperCase(),
  release_date: "2026-10-01",
}));

function ranking(overrides: Record<string, unknown> = {}) {
  return {
    ranked_at: "2026-10-19T05:00:00Z",
    inequalities: [
      [
        {
          model_id: "a",
          reason: "Repeated real work",
          sources: ["https://www.reddit.com/r/codex/comments/abc/def/"],
        },
        {
          relation: ">",
          model_id: "b",
          reason: "Misses requirements",
          sources: ["https://www.youtube.com/watch?v=xyz"],
        },
      ],
    ],
    prompt_version: "situations-1",
    left_out: [{ model_id: "c", reason: "No usable experience yet" }],
    ...overrides,
  };
}

// Only ranked_at and inequalities are checked; the log is kept verbatim.
const parsed = parseTmbRanking(ranking());
assert.deepEqual(parsed.errors, []);
assert.deepEqual(parsed.ranking, ranking());
assert.deepEqual(tmbCandidateErrors(parsed.ranking!, candidates), []);
function problems(overrides: Record<string, unknown>) {
  const { ranking: parsedRanking, errors } = parseTmbRanking(ranking(overrides));
  return parsedRanking == null
    ? errors
    : [...errors, ...tmbCandidateErrors(parsedRanking, candidates)];
}
// Opposing directions, or an ordered pair that "=" also joins, are conflicts.
const rejected = [
  ...problems({
    ranked_at: "2026-10-19T05:00Z",
    inequalities: [[{ model_id: "a" }, { relation: "~", model_id: "b" }]],
  }),
  ...problems({
    inequalities: [
      [{ model_id: "a" }, { relation: ">", model_id: "b" }, { relation: "=", model_id: "a" }],
    ],
  }),
  ...problems({ inequalities: [[{ model_id: "a" }, { relation: ">", model_id: "z" }]] }),
  ...problems({
    inequalities: [
      chain([
        [null, "a"],
        [">", "b"],
      ]),
      chain([
        [null, "b"],
        ["≥", "a"],
      ]),
    ],
  }),
  ...problems({
    inequalities: [
      chain([
        [null, "a"],
        [">", "b"],
      ]),
      chain([
        [null, "a"],
        ["=", "b"],
      ]),
    ],
  }),
];
for (const problem of [
  /ranked_at/,
  /relation must be one of/,
  /lists a more than once/,
  /z is not a candidate/,
  /place a both above and below/,
  /place a = b both above and below/,
]) {
  assert.ok(
    rejected.some((error) => problem.test(error)),
    `missing ${problem}`,
  );
}

function intelligence(
  models: readonly ModelAtlasModel[],
  id: string,
  effort: string | null = null,
) {
  return models.find((entry) => entry.id === id && entry.reasoning_effort === effort)!.scores
    .intelligence_score;
}

// A and B pool to 85; C = D pool to 68, then with E (72) to 69.33.
const models = [
  model("a", 80, "2026-10-01"),
  model("b", 90, "2026-10-01"),
  model("b", 70, "2026-10-01", "low"),
  model("c", 70, "2026-10-01"),
  model("d", 66, "2026-10-01"),
  model("e", 72, "2026-10-01"),
  model("unranked", 60, "2026-10-10"),
];
const adjusted = applyTmbIndex(minimalModelAtlasPayload({ fetchedAt: 1, models }), {
  ranked_at: "2026-10-19T05:00:00Z",
  inequalities: [
    chain([
      [null, "a"],
      [">", "b"],
      ["≥", "c"],
      ["=", "d"],
      ["≫", "e"],
    ]),
  ],
});
const pooled = (70 + 66 + 72) / 3;
close(intelligence(adjusted.models, "a"), 82);
close(intelligence(adjusted.models, "b"), 88);
close(intelligence(adjusted.models, "b", "low"), 68);
close(intelligence(adjusted.models, "c"), 70 + 0.4 * (pooled - 70));
close(intelligence(adjusted.models, "d"), 66 + 0.4 * (pooled - 66));
close(intelligence(adjusted.models, "e"), 72 + 0.4 * (pooled - 72));
assert.equal(intelligence(adjusted.models, "unranked"), 60);
assert.deepEqual(
  adjusted.models
    .filter((entry) => entry.reasoning_effort == null)
    .map((entry) => (entry.tmb_index == null ? null : tmbPlaceLabel(entry.tmb_index))),
  ["#1", "#2", "#3", "#3", "#5", null],
);
assert.deepEqual(adjusted.metadata.scoring.column_tooltips.tmbIndex?.sections?.[0]?.rows, [
  {
    title: "Inequality",
    rows: [
      ["A", "#1"],
      ["> B", "#2"],
      ["≥ C", "#3"],
      ["= D", "#3"],
      ["≫ E", "#5"],
    ],
  },
]);

// A 15-point gap exceeds the five-point cap, so the pull shrinks to a third.
const capped = applyTmbIndex(
  minimalModelAtlasPayload({
    fetchedAt: 1,
    models: [model("a", 60, "2026-10-01"), model("b", 90, "2026-10-01")],
  }),
  {
    ranked_at: "2026-10-19T05:00:00Z",
    inequalities: [
      chain([
        [null, "a"],
        [">", "b"],
      ]),
    ],
  },
).models;
close(intelligence(capped, "a"), 65);
close(intelligence(capped, "b"), 85);
assert.equal(
  applyTmbIndex(minimalModelAtlasPayload({ fetchedAt: 1, models }), null).models,
  models,
);

// A > B > C and B > D: A, B and D pool to 85, C keeps 70, and C and D get #3–4.
const partialPayload = minimalModelAtlasPayload({
  fetchedAt: 1,
  models: [
    model("a", 80, "2026-10-01"),
    model("b", 85, "2026-10-01"),
    model("c", 70, "2026-10-01"),
    model("d", 90, "2026-10-01"),
  ],
});
const abc = chain([
  [null, "a"],
  [">", "b"],
  [">", "c"],
]);
const bd = chain([
  [null, "b"],
  [">", "d"],
]);
const partial = applyTmbIndex(partialPayload, {
  ranked_at: "2026-10-19T05:00:00Z",
  inequalities: [abc, bd],
});
close(intelligence(partial.models, "a"), 82);
close(intelligence(partial.models, "b"), 85);
close(intelligence(partial.models, "c"), 70);
close(intelligence(partial.models, "d"), 88);
assert.deepEqual(
  partial.models.map((entry) => tmbPlaceLabel(entry.tmb_index!)),
  ["#1", "#2", "#3–4", "#3–4"],
);
assert.deepEqual(partial.metadata.scoring.column_tooltips.tmbIndex?.sections?.[0]?.rows, [
  {
    title: "Inequality 1",
    rows: [
      ["A", "#1"],
      ["> B", "#2"],
      ["> C", "#3–4"],
    ],
  },
  {
    title: "Inequality 2",
    rows: [
      ["B", "#2"],
      ["> D", "#3–4"],
    ],
  },
]);
// Repeating or reordering chains changes nothing.
assert.deepEqual(
  applyTmbIndex(partialPayload, {
    ranked_at: "2026-10-19T05:00:00Z",
    inequalities: [bd, abc, bd],
  }).models.map((entry) => entry.scores.intelligence_score),
  partial.models.map((entry) => entry.scores.intelligence_score),
);

// "=" joins across chains; disconnected chains leave cross-chain places open.
const places = (inequalities: TmbRanking["inequalities"]) =>
  applyTmbIndex(partialPayload, { ranked_at: "2026-10-19T05:00:00Z", inequalities }).models.map(
    (entry) => tmbPlaceLabel(entry.tmb_index!),
  );
assert.deepEqual(
  places([
    chain([
      [null, "a"],
      [">", "b"],
      [">", "d"],
    ]),
    chain([
      [null, "c"],
      ["=", "b"],
    ]),
  ]),
  ["#1", "#2", "#2", "#4"],
);
assert.deepEqual(
  places([
    chain([
      [null, "a"],
      [">", "b"],
    ]),
    chain([
      [null, "c"],
      [">", "d"],
    ]),
  ]),
  ["#1–3", "#2–4", "#1–3", "#2–4"],
);

function memoryStore() {
  const rankings = new Map<string, TmbRanking>();
  const state: { pointer: TmbPointer | null; generation: number } = {
    pointer: null,
    generation: 0,
  };
  const store: TmbStore = {
    async createRanking(ranking) {
      if (rankings.has(ranking.ranked_at)) return false;
      rankings.set(ranking.ranked_at, structuredClone(ranking));
      return true;
    },
    async readRanking(rankedAt) {
      return rankings.get(rankedAt) ?? null;
    },
    async readPointer() {
      return { pointer: state.pointer, generation: state.generation };
    },
    async writePointer(pointer, generation) {
      if (generation !== state.generation) return false;
      state.pointer = pointer;
      state.generation += 1;
      return true;
    },
  };
  return { store, state };
}

const options = { candidates: async () => candidates, now: new Date("2026-10-19T06:00:00Z") };

{
  const { store, state } = memoryStore();
  const first = await submitTmbRanking(store, ranking(), options);
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, { ranked_at: "2026-10-19T05:00:00Z", active: true });
  assert.deepEqual(await store.readRanking("2026-10-19T05:00:00Z"), ranking());

  // A retry needs no candidates; different content at the same time conflicts.
  const unavailable = {
    candidates: async () => {
      throw new Error("snapshot unavailable");
    },
    now: new Date("2026-10-19T07:00:00Z"),
  };
  const retry = await submitTmbRanking(store, ranking(), unavailable);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, first.body);
  assert.equal(
    (await submitTmbRanking(store, ranking({ prompt_version: "situations-2" }), options)).status,
    409,
  );

  // A late older ranking is stored without becoming active.
  const late = await submitTmbRanking(
    store,
    ranking({ ranked_at: "2026-10-18T23:00:00Z" }),
    options,
  );
  assert.equal(late.status, 201);
  assert.ok("active" in late.body && !late.body.active);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:00:00Z");

  const newer = await submitTmbRanking(
    store,
    ranking({ ranked_at: "2026-10-19T05:30:00Z" }),
    options,
  );
  assert.ok("active" in newer.body && newer.body.active);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:30:00Z");

  for (const overrides of [
    { ranked_at: "2026-10-20T00:00:00Z" },
    { ranked_at: "2026-10-19T05:45:00Z", inequalities: [] },
    {
      ranked_at: "2026-10-19T05:45:00Z",
      inequalities: [[{ model_id: "a" }, { relation: ">", model_id: "z" }]],
    },
  ]) {
    assert.equal((await submitTmbRanking(store, ranking(overrides), options)).status, 400);
  }
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:30:00Z");
}

// A newer ranking winning the pointer race keeps it.
{
  const { store, state } = memoryStore();
  let raced = false;
  const racing: TmbStore = {
    ...store,
    async writePointer(pointer, generation) {
      if (!raced) {
        raced = true;
        await store.writePointer({ ranked_at: "2026-10-19T09:00:00Z" }, generation);
      }
      return store.writePointer(pointer, generation);
    },
  };
  const result = await submitTmbRanking(racing, ranking(), options);
  assert.equal(result.status, 201);
  assert.ok("active" in result.body && !result.body.active);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T09:00:00Z");
}

// Public reads: no pointer means no overlay.
{
  const { store } = memoryStore();
  await submitTmbRanking(store, ranking(), options);
  const objects = new Map<string, unknown>([
    ["tmb/current.json", (await store.readPointer()).pointer],
    ["tmb/rankings/2026-10-19T05:00:00Z.json", await store.readRanking("2026-10-19T05:00:00Z")],
  ]);
  const realFetch = globalThis.fetch;
  process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = "atlas-test-bucket";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const object = String(input).replace("https://storage.googleapis.com/atlas-test-bucket/", "");
    return objects.has(object)
      ? Response.json(objects.get(object))
      : new Response("missing", { status: 404 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await readActiveTmbRanking(), ranking());
    assert.equal((await readTmbRanking("2026-10-19T05:00:00Z"))?.active, true);
    assert.equal(await readTmbRanking("2026-10-18T00:00:00Z"), null);
    assert.equal(await readTmbRanking("unknown"), null);
    process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = "atlas-empty-bucket";
    assert.equal(await readActiveTmbRanking(), null);
  } finally {
    globalThis.fetch = realFetch;
  }
}
