/** Trust Me Bro Index rankings in the public snapshot bucket: immutable records at tmb/rankings/{ranked_at}.json and a compare-and-swap pointer at tmb/current.json. */

import { Storage } from "@google-cloud/storage";

import { stableJson } from "../../runtime";
import {
  isTmbRankedAt,
  parseTmbRanking,
  type TmbCandidate,
  tmbCandidateErrors,
  type TmbRanking,
} from "../../stats/tmb-index";
import { snapshotBucket, snapshotUrl } from "./manifest";

const POINTER_OBJECT = "tmb/current.json";
const ACTIVE_CACHE_MS = 30_000;
const FUTURE_SKEW_MS = 5 * 60_000;
const POINTER_ATTEMPTS = 5;

export type TmbPointer = { ranked_at: string };

export type TmbStore = {
  /** False when that `ranked_at` already exists. */
  createRanking(ranking: TmbRanking): Promise<boolean>;
  readRanking(rankedAt: string): Promise<TmbRanking | null>;
  readPointer(): Promise<{ pointer: TmbPointer | null; generation: string | number }>;
  /** Compare-and-swap on `generation`; false when another writer won. */
  writePointer(pointer: TmbPointer, generation: string | number): Promise<boolean>;
};

export type TmbReceipt = { ranked_at: string; active: boolean };

export type TmbSubmitResult =
  | { status: 200 | 201; body: TmbReceipt }
  | { status: 400 | 409; body: { errors: string[] } };

/** Idempotent by `ranked_at`: an identical retry gets its receipt before any candidate check, different content is a conflict, and the newest ranking becomes active. */
export async function submitTmbRanking(
  store: TmbStore,
  value: unknown,
  options: { candidates: () => Promise<TmbCandidate[]>; now: Date },
): Promise<TmbSubmitResult> {
  const { ranking, errors } = parseTmbRanking(value);
  if (ranking == null) return { status: 400, body: { errors } };
  if (Date.parse(ranking.ranked_at) > options.now.getTime() + FUTURE_SKEW_MS) {
    return { status: 400, body: { errors: ["ranked_at is in the future"] } };
  }
  const replay = async (): Promise<TmbSubmitResult> => {
    const existing = await store.readRanking(ranking.ranked_at);
    if (existing == null || stableJson(existing) !== stableJson(ranking)) {
      return {
        status: 409,
        body: { errors: [`A different ranking already exists at ${ranking.ranked_at}`] },
      };
    }
    return { status: 200, body: await receipt(store, existing) };
  };
  if ((await store.readRanking(ranking.ranked_at)) != null) return replay();

  const candidateErrors = tmbCandidateErrors(ranking, await options.candidates());
  if (candidateErrors.length > 0) return { status: 400, body: { errors: candidateErrors } };
  // A concurrent identical submission may have created it since the check above.
  if (!(await store.createRanking(ranking))) return replay();
  return { status: 201, body: await receipt(store, ranking) };
}

async function receipt(store: TmbStore, ranking: TmbRanking): Promise<TmbReceipt> {
  const active = await activate(store, ranking);
  return { ranked_at: ranking.ranked_at, active: active.ranked_at === ranking.ranked_at };
}

async function activate(store: TmbStore, ranking: TmbRanking): Promise<TmbPointer> {
  for (let attempt = 0; attempt < POINTER_ATTEMPTS; attempt++) {
    const { pointer, generation } = await store.readPointer();
    // Fixed-width UTC datetimes order correctly as strings.
    if (pointer != null && pointer.ranked_at >= ranking.ranked_at) return pointer;
    const next = { ranked_at: ranking.ranked_at };
    if (await store.writePointer(next, generation)) return next;
  }
  throw new Error("The active TMB ranking kept changing; retry the submission");
}

/** Credentials from MODEL_ATLAS_TMB_WRITER_CREDENTIALS, or application-default credentials locally. */
export class TmbRankingStorage implements TmbStore {
  private readonly bucket = new Storage({
    ...writerCredentials(),
    timeout: 30_000,
    retryOptions: { maxRetries: 3, totalTimeout: 90 },
  }).bucket(snapshotBucket());

  async createRanking(ranking: TmbRanking): Promise<boolean> {
    try {
      await this.bucket.file(rankingObject(ranking.ranked_at)).save(JSON.stringify(ranking), {
        resumable: false,
        validation: "crc32c",
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      return true;
    } catch (error) {
      if (errorCode(error) === 412) return false;
      throw error;
    }
  }

  async readRanking(rankedAt: string): Promise<TmbRanking | null> {
    try {
      const [bytes] = await this.bucket.file(rankingObject(rankedAt)).download();
      return JSON.parse(bytes.toString("utf8")) as TmbRanking;
    } catch (error) {
      if (errorCode(error) === 404) return null;
      throw error;
    }
  }

  async readPointer(): Promise<{ pointer: TmbPointer | null; generation: string | number }> {
    try {
      const [metadata] = await this.bucket.file(POINTER_OBJECT).getMetadata();
      const generation = String(metadata.generation);
      const [bytes] = await this.bucket.file(POINTER_OBJECT, { generation }).download();
      return { pointer: JSON.parse(bytes.toString("utf8")) as TmbPointer, generation };
    } catch (error) {
      if (errorCode(error) === 404) return { pointer: null, generation: 0 };
      throw error;
    }
  }

  async writePointer(pointer: TmbPointer, generation: string | number): Promise<boolean> {
    try {
      await this.bucket.file(POINTER_OBJECT).save(JSON.stringify(pointer), {
        resumable: false,
        validation: "crc32c",
        preconditionOpts: { ifGenerationMatch: generation },
        metadata: { contentType: "application/json", cacheControl: "no-store" },
      });
      return true;
    } catch (error) {
      if (errorCode(error) === 412) return false;
      throw error;
    }
  }
}

type ActiveReadState = {
  bucket: string;
  record: TmbRanking | null;
  expiresAt: number;
  inFlight: Promise<TmbRanking | null> | null;
};

const activeReadState = globalThis as typeof globalThis & {
  __modelAtlasTmbReadState?: ActiveReadState;
};

/** Re-read every 30 seconds; a failed read keeps the last good ranking. */
export async function readActiveTmbRanking(): Promise<TmbRanking | null> {
  const bucket = snapshotBucket();
  if (activeReadState.__modelAtlasTmbReadState?.bucket !== bucket) {
    activeReadState.__modelAtlasTmbReadState = {
      bucket,
      record: null,
      expiresAt: 0,
      inFlight: null,
    };
  }
  const state = activeReadState.__modelAtlasTmbReadState;
  if (Date.now() < state.expiresAt) return state.record;
  state.inFlight ??= refreshActive(state)
    .catch(() => state.record)
    .finally(() => {
      state.inFlight = null;
    });
  return state.inFlight;
}

export async function readTmbRanking(
  rankedAt: string,
): Promise<{ ranking: TmbRanking; active: boolean } | null> {
  if (!isTmbRankedAt(rankedAt)) return null;
  const bucket = snapshotBucket();
  const [ranking, pointer] = await Promise.all([
    fetchPublicJson<TmbRanking>(bucket, rankingObject(rankedAt)),
    fetchPublicJson<TmbPointer>(bucket, POINTER_OBJECT),
  ]);
  return ranking == null ? null : { ranking, active: pointer?.ranked_at === rankedAt };
}

async function refreshActive(state: ActiveReadState): Promise<TmbRanking | null> {
  const pointer = await fetchPublicJson<TmbPointer>(state.bucket, POINTER_OBJECT);
  if (pointer == null) {
    state.record = null;
  } else if (pointer.ranked_at !== state.record?.ranked_at) {
    const record = await fetchPublicJson<TmbRanking>(
      state.bucket,
      rankingObject(pointer.ranked_at),
    );
    if (record == null) throw new Error(`Active TMB ranking ${pointer.ranked_at} is missing`);
    state.record = record;
  }
  state.expiresAt = Date.now() + ACTIVE_CACHE_MS;
  return state.record;
}

async function fetchPublicJson<T>(bucket: string, object: string): Promise<T | null> {
  const response = await fetch(snapshotUrl(bucket, object), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to read ${object}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

function rankingObject(rankedAt: string) {
  return `tmb/rankings/${rankedAt}.json`;
}

function writerCredentials() {
  const raw = process.env.MODEL_ATLAS_TMB_WRITER_CREDENTIALS;
  if (!raw) return {};
  const key = JSON.parse(raw) as {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };
  if (!key.client_email || !key.private_key) {
    throw new Error("MODEL_ATLAS_TMB_WRITER_CREDENTIALS must be a service-account JSON key");
  }
  return {
    projectId: key.project_id,
    credentials: { client_email: key.client_email, private_key: key.private_key },
  };
}

function errorCode(error: unknown) {
  return (error as { code?: number }).code;
}
