/** Persist the fixed capability ruler and published positions inside the checkpoint's existing atomic transaction. */

import type { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";

import { capabilityDataset, type CapabilityState } from "../timeline/capability";
import { packTimelineDataset, unpackTimelineDataset } from "../timeline/schemas";

export function readCapabilityState(db: DatabaseSync): CapabilityState | null {
  if (
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'capability_state'")
      .get()
  )
    return null;
  const row = db.prepare("SELECT state_gzip FROM capability_state WHERE singleton = 1").get();
  if (!row) return null;
  const state = JSON.parse(
    gunzipSync(row.state_gzip as Uint8Array).toString("utf8"),
  ) as CapabilityState;
  if (
    state.version !== 1 ||
    !state.dataset.scale ||
    !state.anchors.frozenReferences?.length ||
    !state.positions
  )
    throw new Error("Invalid persisted capability state.");
  return { ...state, dataset: unpackTimelineDataset(state.dataset) };
}

/** The caller commits this state together with its model rows, so a crash cannot publish scores against another ruler. */
export function writeCapabilityState(db: DatabaseSync, state: CapabilityState): void {
  const prepared = { ...state, dataset: packTimelineDataset(capabilityDataset(state)) };
  db.prepare(
    "INSERT INTO capability_state (singleton, state_gzip) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET state_gzip = excluded.state_gzip",
  ).run(gzipSync(JSON.stringify(prepared)));
}
