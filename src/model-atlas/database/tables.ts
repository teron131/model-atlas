/** The checkpoint's table names in one registry, shared by the checkpoint writers, the payload reader, and the change log. */

import { RAW_SOURCE_TABLES } from "../sources/registry";

/** Every table a refresh writes: the change-log tables are appended to and pruned to their window, all others are replaced whole. */
export const SNAPSHOT_TABLES = {
  ...RAW_SOURCE_TABLES,
  source_quarantines: "source_quarantines",
  source_health: "source_health",
  models: "models",
  model_benchmarks: "model_benchmarks",
  model_task_metrics: "model_task_metrics",
  refresh_runs: "refresh_runs",
  model_score_changes: "model_score_changes",
  model_change_details: "model_change_details",
  model_match_debug: "model_match_debug",
} as const;

export type SnapshotTableName = (typeof SNAPSHOT_TABLES)[keyof typeof SNAPSHOT_TABLES];
