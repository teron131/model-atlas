/** TMB and Slop graph validation, shared correction, partial places, and atomic dated publication. */

import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

import { GET as candidatesGET } from "../app/api/community/candidates/route";
import { GET as rankingGET } from "../app/api/community/rankings/[rankedAt]/route";
import { POST as rankingPOST } from "../app/api/community/rankings/route";
import { communityPlaceLabel } from "../src/model-atlas/community/catalog";
import {
  applyCommunityIndexes,
  communityCandidates,
  type CommunityRanking,
  communitySubmissionErrors,
  parseCommunityRanking,
} from "../src/model-atlas/community/rankings";
import {
  insertCommunityRanking,
  readCommunityRankings,
} from "../src/model-atlas/database/community-rankings";
import {
  readCommunityRanking,
  readDisplayPayload,
} from "../src/model-atlas/database/runtime-snapshot";
import { openDatabase } from "../src/model-atlas/database/schema";
import { submitCommunityRanking } from "../src/model-atlas/database/snapshots/community-rankings";
import {
  type CurrentSnapshot,
  SnapshotConflictError,
  SnapshotStorage,
} from "../src/model-atlas/database/snapshots/gcs";
import {
  type SnapshotManifest,
  type SnapshotVersion,
} from "../src/model-atlas/database/snapshots/manifest";
import { artifactSha256 } from "../src/model-atlas/database/snapshots/manifest";
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

// Top fifteen by Intelligence, then releases in the 60 days ending 2026-10-19 (after 2026-08-20), sorted by id.
const field = [
  model("k", 99, "2026-10-01"),
  model("j", 98, "2026-06-01"),
  ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "l", "m", "n", "o"].map((id, index) =>
    model(id, 90 - index, index === 3 ? "2026-08-20" : "2026-09-15"),
  ),
  model("late", 50, "2026-10-10"),
];
assert.deepEqual(
  communityCandidates(minimalModelAtlasPayload({ fetchedAt: 1, models: field }), "2026-10-19").map(
    (entry) => entry.model_id,
  ),
  ["a", "b", "c", "e", "f", "g", "h", "i", "k", "l", "m", "n", "o"],
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
            relation: ">" as const,
            model_id: "b",
            reason: "Misses requirements",
            sources: ["https://www.youtube.com/watch?v=xyz"],
          },
        ],
      ],
      slop: [],
    },
    nicknames: { a: "Alpha", b: "Beta" },
    prompt_version: "situations-1",
    left_out: [{ model_id: "c", reason: "No usable experience yet" }],
    ...overrides,
  };
}

// Both graph fields are checked independently; the log is kept verbatim.
const parsed = parseCommunityRanking(ranking());
assert.deepEqual(parsed.errors, []);
assert.deepEqual(parsed.ranking, ranking());
assert.deepEqual(communitySubmissionErrors(parsed.ranking!, candidates), []);
// Stored rankings may lack nicknames; only new submissions must carry them.
assert.deepEqual(parseCommunityRanking(ranking({ nicknames: undefined })).errors, []);
function problems(overrides: Record<string, unknown>) {
  const { ranking: parsedRanking, errors } = parseCommunityRanking(ranking(overrides));
  return parsedRanking == null
    ? errors
    : [...errors, ...communitySubmissionErrors(parsedRanking, candidates)];
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
    nicknames: { a: "Alpha", z: "Zed" },
  }),
  ...problems({ nicknames: undefined }),
  ...problems({ nicknames: ["Alpha", "Beta"] }),
  ...problems({ nicknames: { a: "Alpha" } }),
  ...problems({ nicknames: { a: "Alpha", b: "Beta", c: "Gamma" } }),
  ...problems({ nicknames: { a: "Alpha", b: "Beta Thirteen" } }),
  ...problems({ nicknames: { a: "Same", b: "Same" } }),
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
  /nicknames must give every placed model/,
  /nicknames must be an object/,
  /nicknames\.b is required/,
  /nicknames\.c names a model placed in no chain/,
  /nicknames\.b must be 1 to 12 characters/,
  /nicknames\.b repeats a's nickname "Same"/,
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
  nicknames: { a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo" },
});
const pooled = (70 + 66 + 72) / 3;
close(intelligence(adjusted.models, "a"), 81.25);
close(intelligence(adjusted.models, "b"), 88.75);
close(intelligence(adjusted.models, "b", "low"), 68.75);
close(intelligence(adjusted.models, "c"), 70 + 0.25 * (pooled - 70));
close(intelligence(adjusted.models, "d"), 66 + 0.25 * (pooled - 66));
close(intelligence(adjusted.models, "e"), 72 + 0.25 * (pooled - 72));
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
assert.deepEqual(adjusted.metadata.scoring.column_tooltips.tmbIndex?.graph?.edges, [
  { from: "a", to: "b", relation: ">" },
  { from: "b", to: "c", relation: "≥" },
  { from: "c", to: "d", relation: "=" },
  { from: "d", to: "e", relation: "≫" },
]);
assert.deepEqual(
  adjusted.metadata.scoring.column_tooltips.tmbIndex?.graph?.nodes.map((node) => [
    node.id,
    node.name,
    node.label,
    node.place,
  ]),
  [
    ["a", "A", "Alpha", "#1"],
    ["b", "B", "Bravo", "#2"],
    ["c", "C", "Charlie", "#3"],
    ["d", "D", "Delta", "#3"],
    ["e", "E", "Echo", "#5"],
  ],
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
    models: [model("a", 30, "2026-10-01"), model("b", 90, "2026-10-01")],
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
close(intelligence(capped, "a"), 35);
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
close(intelligence(partial.models, "a"), 81.25);
close(intelligence(partial.models, "b"), 85);
close(intelligence(partial.models, "c"), 70);
close(intelligence(partial.models, "d"), 88.75);
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
// A ranking without nicknames labels its graph with full names.
for (const node of dual.metadata.scoring.column_tooltips.tmbIndex!.graph!.nodes) {
  assert.equal(node.label, node.name);
}
// TMB targets 90/90/90, Slop targets 92/92/86, both calculated from 94/90/86.
for (const [id, expected] of [
  ["a", 92.5],
  ["b", 90.5],
  ["c", 87],
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

// Identical graphs use the one 50% allowance rather than doubling the correction.
const same = applyCommunityIndexes(dualPayload, {
  ...dualRanking,
  indexes: { ...dualRanking.indexes, slop: dualRanking.indexes.tmb },
});
close(intelligence(same.models, "a"), 92);
close(intelligence(same.models, "c"), 88);

// A model absent from one graph gets only the other graph's allocated influence.
const slopOnly = applyCommunityIndexes(dualPayload, {
  ...dualRanking,
  indexes: { ...dualRanking.indexes, tmb: [] },
});
close(intelligence(slopOnly.models, "a"), 93.5);
close(intelligence(slopOnly.models, "b"), 90.5);
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
close(intelligence(opposed.models, "a"), 93.5);
close(intelligence(opposed.models, "b"), 90);
close(intelligence(opposed.models, "c"), 86.5);
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

// Exercise the submission workflow against real SQLite files; object publication races are covered by snapshot-store.
await mkdir(".cache", { recursive: true });
const workspace = await mkdtemp(resolve(".cache/community-publication-"));
const checkpoint = join(workspace, "database.sqlite");
(await openDatabase(checkpoint)).close();
const now = new Date("2026-10-19T06:00:00Z");
const initialPayload = minimalModelAtlasPayload({ fetchedAt: 1, models });

class CheckpointStore extends SnapshotStorage {
  payload = initialPayload;
  generation = 1;
  beforePublish: (() => Promise<void>) | null = null;
  manifest: SnapshotManifest = {
    version: "00000000-0000-4000-8000-000000000001",
    fetched_at_epoch_seconds: 1,
    payload_sha256: "0".repeat(64),
    checkpoint_sha256: "0".repeat(64),
    intelligence_index_sha256: null,
    community_rankings_sha256: null,
    data_sha256: "0".repeat(64),
    previous: [],
  };
  constructor() {
    super("community-test", "community-private");
  }
  override async current() {
    return { manifest: this.manifest, generation: this.generation };
  }
  override async restore(_manifest: SnapshotVersion, path: string) {
    await copyFile(checkpoint, path);
    return structuredClone(this.payload);
  }
  override async publish(path: string, payload: typeof initialPayload, previous: CurrentSnapshot) {
    if (this.beforePublish) {
      const before = this.beforePublish;
      this.beforePublish = null;
      await before();
    }
    if (previous.generation !== this.generation)
      throw new SnapshotConflictError("Concurrent publication");
    await copyFile(path, checkpoint);
    this.payload = structuredClone(payload);
    this.generation += 1;
    return { manifest: this.manifest, bytes_uploaded: 0, maintenance_warnings: [] };
  }
}
const store = new CheckpointStore();
const storedRecords = () => {
  const db = new DatabaseSync(checkpoint, { readOnly: true });
  try {
    return readCommunityRankings(db);
  } finally {
    db.close();
  }
};
try {
  const first = await submitCommunityRanking(store, ranking(), now);
  assert.deepEqual(first, { status: 201, body: { ranked_at: ranking().ranked_at, active: true } });
  assert.deepEqual(storedRecords(), [ranking()]);
  const generation = store.generation;
  assert.equal((await submitCommunityRanking(store, ranking(), now)).status, 200);
  assert.equal(store.generation, generation, "An identical retry does not republish the database");
  assert.equal(
    (await submitCommunityRanking(store, ranking({ prompt_version: "changed" }), now)).status,
    409,
  );
  for (const overrides of [
    { ranked_at: "2026-10-20T00:00:00Z" },
    { indexes: { tmb: [], slop: [] } },
    { indexes: { tmb: [], slop: undefined } },
    {
      ranked_at: "2026-10-19T05:10:00Z",
      indexes: { tmb: [], slop: [[{ model_id: "a" }, { model_id: "z", relation: ">" }]] },
    },
  ])
    assert.equal((await submitCommunityRanking(store, ranking(overrides), now)).status, 400);
  assert.deepEqual(storedRecords(), [ranking()]);
  const late = ranking({ ranked_at: "2026-10-18T23:00:00Z" });
  assert.deepEqual(await submitCommunityRanking(store, late, now), {
    status: 201,
    body: { ranked_at: late.ranked_at, active: false },
  });
  const concurrent = ranking({ ranked_at: "2026-10-19T05:30:00Z" });
  store.beforePublish = async () => {
    const db = new DatabaseSync(checkpoint);
    insertCommunityRanking(db, concurrent);
    db.close();
    store.payload = {
      ...store.payload,
      fetched_at_epoch_seconds: 2,
      community_rankings: storedRecords(),
    };
    store.generation += 1;
  };
  const incoming = ranking({ ranked_at: "2026-10-19T05:15:00Z" });
  assert.deepEqual(await submitCommunityRanking(store, incoming, now), {
    status: 201,
    body: { ranked_at: incoming.ranked_at, active: false },
  });
  assert.equal(
    store.payload.fetched_at_epoch_seconds,
    2,
    "A ranking retry keeps the concurrent benchmark refresh",
  );
  assert.deepEqual(storedRecords(), [late, ranking(), incoming, concurrent]);
  store.beforePublish = async () => {
    throw new Error("Interrupted upload");
  };
  await assert.rejects(
    submitCommunityRanking(store, ranking({ ranked_at: "2026-10-19T05:45:00Z" }), now),
    /Interrupted upload/,
  );
  assert.deepEqual(storedRecords(), [late, ranking(), incoming, concurrent]);

  // Dated/current reads and the UI consume a database-derived artifact pinned to the benchmark manifest.
  const savedFetch = globalThis.fetch;
  const savedEnv = {
    MODEL_ATLAS_SNAPSHOT_BUCKET: process.env.MODEL_ATLAS_SNAPSHOT_BUCKET,
    MODEL_ATLAS_LOCAL_DATABASE: process.env.MODEL_ATLAS_LOCAL_DATABASE,
    MODEL_ATLAS_COMMUNITY_WRITER_URL: process.env.MODEL_ATLAS_COMMUNITY_WRITER_URL,
  };
  const submitted = {
    ...dualRanking,
    ranked_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    research: { sources: ["fixture"] },
  };
  const payload = {
    ...dualPayload,
    models: dualPayload.models.map((entry) => ({
      ...entry,
      release_date: submitted.ranked_at.slice(0, 10),
    })),
  };
  const compressed = gzipSync(JSON.stringify(payload));
  const history = gzipSync(JSON.stringify([submitted]));
  const manifest = {
    ...store.manifest,
    payload_sha256: artifactSha256(compressed),
    community_rankings_sha256: artifactSha256(history),
  };
  process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = "community-route-test";
  process.env.MODEL_ATLAS_COMMUNITY_WRITER_URL = "https://writer.test";
  delete process.env.MODEL_ATLAS_LOCAL_DATABASE;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === "https://writer.test") {
      assert.equal(url.pathname, "/api/community/rankings");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
      assert.deepEqual(JSON.parse(String(init?.body)), submitted);
      return Response.json({ ranked_at: submitted.ranked_at, active: true }, { status: 201 });
    }
    const object = url.pathname.replace("/community-route-test/", "");
    if (object === "current.json") return Response.json(manifest);
    if (object === `snapshots/${manifest.version}/payload.json.gz`)
      return new Response(new Uint8Array(compressed));
    if (object === `snapshots/${manifest.version}/community-rankings.json.gz`)
      return new Response(new Uint8Array(history));
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const request = new Request("http://localhost/api/community/rankings", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
      body: JSON.stringify(submitted),
    });
    const accepted = await rankingPOST(request);
    assert.equal(accepted.status, 201);
    assert.deepEqual(await accepted.json(), { ranked_at: submitted.ranked_at, active: true });
    for (const rankedAt of [submitted.ranked_at, "current"]) {
      const response = await rankingGET(new Request("http://localhost"), {
        params: Promise.resolve({ rankedAt }),
      });
      assert.deepEqual(await response.json(), { ranking: submitted, active: true });
    }
    assert.equal(await readCommunityRanking("unknown"), null);
    assert.equal(await readCommunityRanking("2026-10-18T00:00:00Z"), null);
    const display = await readDisplayPayload();
    close(intelligence(display.models, "a"), 92.5);
    assert.equal(display.models[0]!.community_indexes?.slop?.best, 2);
    assert.equal(display.metadata.scoring.column_tooltips.slopIndex?.title, "Slop Index");
    assert.equal(
      display.community_rankings,
      undefined,
      "Research history stays out of the leaderboard payload",
    );
    assert.equal(await readDisplayPayload(), display, "Repeated reads do not compound corrections");
    const candidateResponse = await candidatesGET();
    assert.equal(candidateResponse.status, 200);
    const candidateBody = await candidateResponse.json();
    assert.deepEqual(
      candidateBody.models.map((entry: { model_id: string }) => entry.model_id),
      ["a", "b", "c", "unranked"],
    );
    assert.ok(
      candidateBody.models.every(
        (entry: object) => !("scores" in entry) && !("community_indexes" in entry),
      ),
    );
    delete process.env.MODEL_ATLAS_COMMUNITY_WRITER_URL;
    assert.equal(
      (await rankingPOST(new Request("http://localhost", { method: "POST" }))).status,
      503,
    );
  } finally {
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
