/** Ranking submissions edit the authoritative checkpoint and use the benchmark publisher's atomic commit point. */

import {
  communityCandidates,
  communitySubmissionErrors,
  parseCommunityRanking,
} from "../../community/rankings";
import { insertCommunityRanking, readCommunityRankings } from "../community-rankings";
import { openDatabase } from "../schema";
import { SnapshotConflictError, type SnapshotStorage } from "./gcs";
import { withCheckpointWorkspace } from "./publish";

const FUTURE_SKEW_MS = 5 * 60_000;
const PUBLICATION_ATTEMPTS = 3;

export type CommunityReceipt = { ranked_at: string; active: boolean };
export type CommunitySubmitResult =
  | { status: 200 | 201; body: CommunityReceipt }
  | { status: 400 | 409; body: { errors: string[] } };

/** Identical retries preserve the full record; a concurrent benchmark publication requires restoring its checkpoint before retrying. */
export async function submitCommunityRanking(
  store: SnapshotStorage,
  value: unknown,
  now: Date,
): Promise<CommunitySubmitResult> {
  const { ranking, errors } = parseCommunityRanking(value);
  if (!ranking) return { status: 400, body: { errors } };
  if (Date.parse(ranking.ranked_at) > now.getTime() + FUTURE_SKEW_MS) {
    return { status: 400, body: { errors: ["ranked_at is in the future"] } };
  }
  for (let attempt = 0; attempt < PUBLICATION_ATTEMPTS; attempt++) {
    try {
      return await withCheckpointWorkspace(async (databasePath) => {
        const current = await store.current();
        if (!current.manifest) throw new Error("The benchmark checkpoint is not initialized");
        const payload = await store.restore(current.manifest, databasePath);
        const db = await openDatabase(databasePath);
        let records;
        let status: "created" | "unchanged" | "conflict";
        try {
          records = readCommunityRankings(db);
          if (!records.some((record) => record.ranked_at === ranking.ranked_at)) {
            const submissionErrors = communitySubmissionErrors(
              ranking,
              communityCandidates(payload, now.toISOString().slice(0, 10)),
            );
            if (submissionErrors.length) return { status: 400, body: { errors: submissionErrors } };
          }
          status = insertCommunityRanking(db, ranking);
          if (status === "conflict") {
            return {
              status: 409,
              body: { errors: [`A different ranking already exists at ${ranking.ranked_at}`] },
            };
          }
          records = readCommunityRankings(db);
          db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        } finally {
          db.close();
        }
        if (status === "created") {
          await store.publish(databasePath, { ...payload, community_rankings: records }, current);
        }
        return {
          status: status === "created" ? 201 : 200,
          body: {
            ranked_at: ranking.ranked_at,
            active: records.at(-1)?.ranked_at === ranking.ranked_at,
          },
        };
      });
    } catch (error) {
      if (!(error instanceof SnapshotConflictError) || attempt === PUBLICATION_ATTEMPTS - 1)
        throw error;
    }
  }
  throw new Error("The benchmark checkpoint kept changing; retry the identical submission");
}
