/** TMB and Slop graph validation, shared correction, partial places, and atomic dated publication. */

import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";

import { GET as candidatesGET } from "../app/api/community/candidates/route";
import { GET as rankingGET } from "../app/api/community/rankings/[rankedAt]/route";
import { POST as rankingPOST } from "../app/api/community/rankings/route";
import { communityPlaceLabel } from "../src/model-atlas/community/catalog";
import {
  applyCommunityIndexes,
  communityCandidateErrors,
  communityCandidates,
  type CommunityRanking,
  parseCommunityRanking,
} from "../src/model-atlas/community/rankings";
import { readDisplaySnapshotPayload } from "../src/model-atlas/database/runtime-snapshot";
import {
  type CommunityPointer,
  CommunityRankingStorage,
  type CommunityStore,
  readActiveCommunityRanking,
  readCommunityRanking,
  submitCommunityRanking,
} from "../src/model-atlas/database/snapshots/community-rankings";
import { snapshotHash } from "../src/model-atlas/database/snapshots/manifest";
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
  })) as CommunityRanking["indexes"]["tmb"][number];
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
  communityCandidates(minimalModelAtlasPayload({ fetchedAt: 1, models: field }), "2026-10-19").map(
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
    indexes: {
      tmb: [
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
      slop: [],
    },
    prompt_version: "situations-1",
    left_out: [{ model_id: "c", reason: "No usable experience yet" }],
    ...overrides,
  };
}

// Both graph fields are checked independently; the log is kept verbatim.
const parsed = parseCommunityRanking(ranking());
assert.deepEqual(parsed.errors, []);
assert.deepEqual(parsed.ranking, ranking());
assert.deepEqual(communityCandidateErrors(parsed.ranking!, candidates), []);
function problems(overrides: Record<string, unknown>) {
  const { ranking: parsedRanking, errors } = parseCommunityRanking(ranking(overrides));
  return parsedRanking == null
    ? errors
    : [...errors, ...communityCandidateErrors(parsedRanking, candidates)];
}
// Opposing directions, or an ordered pair that "=" also joins, are conflicts.
const rejected = [
  ...problems({ indexes: undefined }),
  ...problems({ indexes: { tmb: [], slop: [], unknown: [] } }),
  ...problems({ indexes: { tmb: [], slop: null } }),
  ...problems({
    indexes: { tmb: [], slop: [[{ model_id: "a" }, { relation: ">", model_id: "z" }]] },
  }),
  ...problems({
    indexes: {
      tmb: [],
      slop: [
        chain([
          [null, "a"],
          [">", "b"],
        ]),
        chain([
          [null, "b"],
          [">", "a"],
        ]),
      ],
    },
  }),
  ...problems({
    ranked_at: "2026-10-19T05:00Z",
    indexes: { tmb: [[{ model_id: "a" }, { relation: "~", model_id: "b" }]], slop: [] },
  }),
  ...problems({
    indexes: {
      tmb: [
        [{ model_id: "a" }, { relation: ">", model_id: "b" }, { relation: "=", model_id: "a" }],
      ],
      slop: [],
    },
  }),
  ...problems({
    indexes: { tmb: [[{ model_id: "a" }, { relation: ">", model_id: "z" }]], slop: [] },
  }),
  ...problems({
    indexes: {
      tmb: [
        chain([
          [null, "a"],
          [">", "b"],
        ]),
        chain([
          [null, "b"],
          ["≥", "a"],
        ]),
      ],
      slop: [],
    },
  }),
  ...problems({
    indexes: {
      tmb: [
        chain([
          [null, "a"],
          [">", "b"],
        ]),
        chain([
          [null, "a"],
          ["=", "b"],
        ]),
      ],
      slop: [],
    },
  }),
];
for (const problem of [
  /ranked_at/,
  /relation must be one of/,
  /lists a more than once/,
  /z is not a candidate/,
  /place a both above and below/,
  /place a = b both above and below/,
  /indexes\.slop must be an array/,
  /indexes\.tmb must be an array/,
  /indexes\.unknown is not a supported community index/,
  /indexes\.slop:.*both above and below/,
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
const adjusted = applyCommunityIndexes(minimalModelAtlasPayload({ fetchedAt: 1, models }), {
  ranked_at: "2026-10-19T05:00:00Z",
  indexes: {
    tmb: [
      chain([
        [null, "a"],
        [">", "b"],
        ["≥", "c"],
        ["=", "d"],
        ["≫", "e"],
      ]),
    ],
    slop: [],
  },
});
const pooled = (70 + 66 + 72) / 3;
close(intelligence(adjusted.models, "a"), 81.5);
close(intelligence(adjusted.models, "b"), 88.5);
close(intelligence(adjusted.models, "b", "low"), 68.5);
close(intelligence(adjusted.models, "c"), 70 + 0.3 * (pooled - 70));
close(intelligence(adjusted.models, "d"), 66 + 0.3 * (pooled - 66));
close(intelligence(adjusted.models, "e"), 72 + 0.3 * (pooled - 72));
assert.equal(intelligence(adjusted.models, "unranked"), 60);
assert.deepEqual(
  adjusted.models
    .filter((entry) => entry.reasoning_effort == null)
    .map((entry) =>
      entry.community_indexes?.tmb == null
        ? null
        : communityPlaceLabel(entry.community_indexes?.tmb),
    ),
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

// Missing Slop contributes zero; TMB's 7.5-point movement is capped at five.
const capped = applyCommunityIndexes(
  minimalModelAtlasPayload({
    fetchedAt: 1,
    models: [model("a", 40, "2026-10-01"), model("b", 90, "2026-10-01")],
  }),
  {
    ranked_at: "2026-10-19T05:00:00Z",
    indexes: {
      tmb: [
        chain([
          [null, "a"],
          [">", "b"],
        ]),
      ],
      slop: [],
    },
  },
).models;
close(intelligence(capped, "a"), 45);
close(intelligence(capped, "b"), 85);
assert.equal(
  applyCommunityIndexes(minimalModelAtlasPayload({ fetchedAt: 1, models }), null).models,
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
const partial = applyCommunityIndexes(partialPayload, {
  ranked_at: "2026-10-19T05:00:00Z",
  indexes: { tmb: [abc, bd], slop: [] },
});
close(intelligence(partial.models, "a"), 81.5);
close(intelligence(partial.models, "b"), 85);
close(intelligence(partial.models, "c"), 70);
close(intelligence(partial.models, "d"), 88.5);
assert.deepEqual(
  partial.models.map((entry) => communityPlaceLabel(entry.community_indexes!.tmb!)),
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
  applyCommunityIndexes(partialPayload, {
    ranked_at: "2026-10-19T05:00:00Z",
    indexes: { tmb: [bd, abc, bd], slop: [] },
  }).models.map((entry) => entry.scores.intelligence_score),
  partial.models.map((entry) => entry.scores.intelligence_score),
);

// "=" joins across chains; disconnected chains leave cross-chain places open.
const places = (inequalities: CommunityRanking["indexes"]["tmb"]) =>
  applyCommunityIndexes(partialPayload, {
    ranked_at: "2026-10-19T05:00:00Z",
    indexes: { tmb: inequalities, slop: [] },
  }).models.map((entry) => communityPlaceLabel(entry.community_indexes!.tmb!));
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

const dualPayload = minimalModelAtlasPayload({
  fetchedAt: 1,
  models: [
    model("a", 94, "2026-10-01"),
    model("b", 90, "2026-10-01"),
    model("c", 86, "2026-10-01"),
    model("unranked", 80, "2026-10-01"),
  ],
});
const dualRanking = {
  ranked_at: "2026-10-19T05:00:00Z",
  indexes: {
    tmb: [
      chain([
        [null, "c"],
        [">", "b"],
        [">", "a"],
      ]),
    ],
    slop: [
      chain([
        [null, "b"],
        [">", "a"],
        [">", "c"],
      ]),
    ],
  },
} satisfies CommunityRanking;
// Different directions across indexes are valid: each answers a different question.
assert.deepEqual(parseCommunityRanking(dualRanking).errors, []);
const dual = applyCommunityIndexes(dualPayload, dualRanking);
// TMB targets 90/90/90, Slop targets 92/92/86, both calculated from 94/90/86.
for (const [id, expected] of [
  ["a", 92.6],
  ["b", 90.2],
  ["c", 87.2],
] as const) {
  close(intelligence(dual.models, id), expected);
}
assert.equal(dual.models[3], dualPayload.models[3]);
assert.deepEqual(
  dual.models.slice(0, 3).map((entry) => entry.community_indexes?.slop),
  [
    { best: 2, worst: 2 },
    { best: 1, worst: 1 },
    { best: 3, worst: 3 },
  ],
);
assert.equal(dual.metadata.scoring.column_tooltips.slopIndex?.title, "Slop Index");
assert.deepEqual(
  dualPayload.models.map((entry) => entry.scores.intelligence_score),
  [94, 90, 86, 80],
);
const total = (entries: readonly ModelAtlasModel[]) =>
  entries.reduce((sum, entry) => sum + entry.scores.intelligence_score, 0);
close(total(dual.models), total(dualPayload.models));
for (const [index, entry] of dual.models.entries()) {
  assert.ok(entry.scores.intelligence_score >= 80 && entry.scores.intelligence_score <= 94);
  assert.equal(entry.scores.agentic_score, dualPayload.models[index]!.scores.agentic_score);
  assert.equal(entry.scores.speed_score, dualPayload.models[index]!.scores.speed_score);
  assert.equal(entry.scores.value_score, dualPayload.models[index]!.scores.value_score);
}

// Identical graphs use the one 40% allowance rather than doubling the correction.
const same = applyCommunityIndexes(dualPayload, {
  ...dualRanking,
  indexes: { ...dualRanking.indexes, slop: dualRanking.indexes.tmb },
});
close(intelligence(same.models, "a"), 92.4);
close(intelligence(same.models, "c"), 87.6);

// A model absent from one graph gets only the other graph's allocated influence.
const slopOnly = applyCommunityIndexes(dualPayload, {
  ...dualRanking,
  indexes: { ...dualRanking.indexes, tmb: [] },
});
close(intelligence(slopOnly.models, "a"), 93.8);
close(intelligence(slopOnly.models, "b"), 90.2);
assert.equal(slopOnly.models[0]!.community_indexes?.tmb, undefined);
assert.equal(slopOnly.metadata.scoring.column_tooltips.tmbIndex, undefined);
assert.deepEqual(
  parseCommunityRanking({ ...dualRanking, indexes: { ...dualRanking.indexes, tmb: [] } }).errors,
  [],
);
assert.equal(
  parseCommunityRanking({ ...dualRanking, indexes: { tmb: [], slop: [] } }).ranking,
  null,
);

// Partially overlapping graphs can pull the shared model in opposite directions.
const opposed = applyCommunityIndexes(dualPayload, {
  ...dualRanking,
  indexes: {
    tmb: [
      chain([
        [null, "c"],
        [">", "b"],
      ]),
    ],
    slop: [
      chain([
        [null, "b"],
        [">", "a"],
      ]),
    ],
  },
});
close(intelligence(opposed.models, "a"), 93.8);
close(intelligence(opposed.models, "b"), 89.6);
close(intelligence(opposed.models, "c"), 86.6);
close(total(opposed.models), total(dualPayload.models));

// A larger field checks the shared cap and conservation even when graphs disagree.
const widePayload = minimalModelAtlasPayload({
  fetchedAt: 1,
  models: [
    model("a", 99.9, "2026-10-01"),
    model("b", 50, "2026-10-01"),
    model("c", 10, "2026-10-01"),
  ],
});
const wide = applyCommunityIndexes(widePayload, dualRanking);
close(total(wide.models), total(widePayload.models));
close(
  Math.max(
    ...wide.models.map((entry, index) =>
      Math.abs(
        entry.scores.intelligence_score - widePayload.models[index]!.scores.intelligence_score,
      ),
    ),
  ),
  5,
);
assert.ok(
  wide.models.every(
    (entry) => entry.scores.intelligence_score >= 10 && entry.scores.intelligence_score <= 99.9,
  ),
);

function memoryStore() {
  const rankings = new Map<string, CommunityRanking>();
  const state: { pointer: CommunityPointer | null; generation: number } = {
    pointer: null,
    generation: 0,
  };
  const store: CommunityStore = {
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
  const first = await submitCommunityRanking(store, ranking(), options);
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, { ranked_at: "2026-10-19T05:00:00Z", active: true });
  assert.deepEqual(await store.readRanking("2026-10-19T05:00:00Z"), ranking());
  const missingSlop = await submitCommunityRanking(
    store,
    ranking({ ranked_at: "2026-10-19T05:10:00Z", indexes: { tmb: [], slop: undefined } }),
    options,
  );
  assert.equal(missingSlop.status, 400);
  assert.equal(await store.readRanking("2026-10-19T05:10:00Z"), null);
  const invalidSlop = await submitCommunityRanking(
    store,
    ranking({
      ranked_at: "2026-10-19T05:15:00Z",
      indexes: { tmb: [], slop: [[{ model_id: "a" }, { relation: ">", model_id: "z" }]] },
    }),
    options,
  );
  assert.equal(invalidSlop.status, 400);
  assert.equal(await store.readRanking("2026-10-19T05:15:00Z"), null);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:00:00Z");

  // A retry needs no candidates; different content at the same time conflicts.
  const unavailable = {
    candidates: async () => {
      throw new Error("snapshot unavailable");
    },
    now: new Date("2026-10-19T07:00:00Z"),
  };
  const retry = await submitCommunityRanking(store, ranking(), unavailable);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, first.body);
  assert.equal(
    (await submitCommunityRanking(store, ranking({ prompt_version: "situations-2" }), options))
      .status,
    409,
  );

  // A late older ranking is stored without becoming active.
  const late = await submitCommunityRanking(
    store,
    ranking({ ranked_at: "2026-10-18T23:00:00Z" }),
    options,
  );
  assert.equal(late.status, 201);
  assert.ok("active" in late.body && !late.body.active);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:00:00Z");

  const newer = await submitCommunityRanking(
    store,
    ranking({ ranked_at: "2026-10-19T05:30:00Z" }),
    options,
  );
  assert.ok("active" in newer.body && newer.body.active);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:30:00Z");

  for (const overrides of [
    { ranked_at: "2026-10-20T00:00:00Z" },
    { ranked_at: "2026-10-19T05:45:00Z", indexes: { tmb: [], slop: [] } },
    {
      ranked_at: "2026-10-19T05:45:00Z",
      indexes: { tmb: [[{ model_id: "a" }, { relation: ">", model_id: "z" }]], slop: [] },
    },
  ]) {
    assert.equal((await submitCommunityRanking(store, ranking(overrides), options)).status, 400);
  }
  assert.equal(state.pointer?.ranked_at, "2026-10-19T05:30:00Z");
}

// A newer ranking winning the pointer race keeps it.
{
  const { store, state } = memoryStore();
  let raced = false;
  const racing: CommunityStore = {
    ...store,
    async writePointer(pointer, generation) {
      if (!raced) {
        raced = true;
        await store.writePointer({ ranked_at: "2026-10-19T09:00:00Z" }, generation);
      }
      return store.writePointer(pointer, generation);
    },
  };
  const result = await submitCommunityRanking(racing, ranking(), options);
  assert.equal(result.status, 201);
  assert.ok("active" in result.body && !result.body.active);
  assert.equal(state.pointer?.ranked_at, "2026-10-19T09:00:00Z");
}

// Public reads: no pointer means no overlay.
{
  const { store } = memoryStore();
  await submitCommunityRanking(store, ranking(), options);
  const objects = new Map<string, unknown>([
    ["community/current.json", (await store.readPointer()).pointer],
    [
      "community/rankings/2026-10-19T05:00:00Z.json",
      await store.readRanking("2026-10-19T05:00:00Z"),
    ],
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
    assert.deepEqual(await readActiveCommunityRanking(), ranking());
    assert.equal((await readCommunityRanking("2026-10-19T05:00:00Z"))?.active, true);
    assert.equal(await readCommunityRanking("2026-10-18T00:00:00Z"), null);
    assert.equal(await readCommunityRanking("unknown"), null);
    process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = "atlas-empty-bucket";
    assert.equal(await readActiveCommunityRanking(), null);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Real route handlers and runtime overlay share an in-memory object store instead of production GCS.
{
  const { store, state } = memoryStore();
  const savedMethods = {
    createRanking: CommunityRankingStorage.prototype.createRanking,
    readRanking: CommunityRankingStorage.prototype.readRanking,
    readPointer: CommunityRankingStorage.prototype.readPointer,
    writePointer: CommunityRankingStorage.prototype.writePointer,
  };
  const savedFetch = globalThis.fetch;
  const savedEnv = {
    MODEL_ATLAS_SNAPSHOT_BUCKET: process.env.MODEL_ATLAS_SNAPSHOT_BUCKET,
    MODEL_ATLAS_LOCAL_DATABASE: process.env.MODEL_ATLAS_LOCAL_DATABASE,
    MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN: process.env.MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN,
    MODEL_ATLAS_COMMUNITY_WRITER_CREDENTIALS: process.env.MODEL_ATLAS_COMMUNITY_WRITER_CREDENTIALS,
    VERCEL: process.env.VERCEL,
  };
  const rankedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const submitted = { ...dualRanking, ranked_at: rankedAt, research: { sources: ["fixture"] } };
  const payload = {
    ...dualPayload,
    models: dualPayload.models.map((entry) => ({ ...entry, release_date: rankedAt.slice(0, 10) })),
  };
  const compressed = gzipSync(JSON.stringify(payload));
  const version = "00000000-0000-4000-8000-000000000001";
  const hash = snapshotHash(compressed);
  process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = "community-route-test";
  process.env.MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN = "local-test-token";
  delete process.env.MODEL_ATLAS_LOCAL_DATABASE;
  delete process.env.MODEL_ATLAS_COMMUNITY_WRITER_CREDENTIALS;
  delete process.env.VERCEL;
  Object.assign(CommunityRankingStorage.prototype, store);
  globalThis.fetch = async (input) => {
    const object = new URL(String(input)).pathname.replace("/community-route-test/", "");
    if (object === "current.json") {
      return Response.json({
        version,
        fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
        payload_sha256: hash,
        checkpoint_sha256: hash,
        intelligence_index_sha256: null,
        data_sha256: hash,
        previous: [],
      });
    }
    if (object === `snapshots/${version}/payload.json.gz`) {
      return new Response(new Uint8Array(compressed));
    }
    if (object === "community/current.json") {
      return state.pointer == null
        ? new Response(null, { status: 404 })
        : Response.json(state.pointer);
    }
    if (object === `community/rankings/${rankedAt}.json`) {
      const stored = await store.readRanking(rankedAt);
      return stored == null ? new Response(null, { status: 404 }) : Response.json(stored);
    }
    throw new Error(`Unexpected request: ${object}`);
  };
  const request = (body: unknown, token = "local-test-token") =>
    new Request("http://localhost/api/community/rankings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await rankingPOST(request(submitted, "wrong-token"))).status, 401);
    const invalid = {
      ...submitted,
      indexes: {
        ...submitted.indexes,
        slop: [[{ model_id: "unknown" }, { relation: ">", model_id: "a" }]],
      },
    };
    assert.equal((await rankingPOST(request(invalid))).status, 400);
    assert.equal(await store.readRanking(rankedAt), null);
    const accepted = await rankingPOST(request(submitted));
    assert.equal(accepted.status, 201);
    assert.deepEqual(await accepted.json(), { ranked_at: rankedAt, active: true });
    assert.equal((await rankingPOST(request(submitted))).status, 200);
    const readBack = await rankingGET(new Request("http://localhost"), {
      params: Promise.resolve({ rankedAt }),
    });
    assert.deepEqual(await readBack.json(), { ranking: submitted, active: true });
    const active = await rankingGET(new Request("http://localhost"), {
      params: Promise.resolve({ rankedAt: "current" }),
    });
    assert.deepEqual(await active.json(), { ranking: submitted, active: true });
    const display = await readDisplaySnapshotPayload();
    close(intelligence(display.models, "a"), 92.6);
    assert.equal(display.models[0]!.community_indexes?.slop?.best, 2);
    assert.equal(display.metadata.scoring.column_tooltips.slopIndex?.title, "Slop Index");
    assert.equal(
      await readDisplaySnapshotPayload(),
      display,
      "Repeated reads must not compound either correction",
    );
    const fetchedCandidates = await candidatesGET();
    assert.equal(fetchedCandidates.status, 200);
    const candidateBody = await fetchedCandidates.json();
    assert.deepEqual(
      candidateBody.models.map((entry: { model_id: string }) => entry.model_id),
      ["a", "b", "c", "unranked"],
    );
    assert.ok(
      candidateBody.models.every(
        (entry: object) => !("scores" in entry) && !("community_indexes" in entry),
      ),
    );
  } finally {
    Object.assign(CommunityRankingStorage.prototype, savedMethods);
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
