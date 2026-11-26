/** The checkpoint's row tables as one typed registry of names, so a writer or reader that takes a table name accepts only a table listed here. */

import { RAW_SOURCE_TABLES } from "../sources/registry";

/** The row tables a refresh writes: the change-log tables are appended to and pruned to their window, all others are replaced whole. The single-row `snapshot_metadata` and `capability_state` tables are read and written by name in their own owners. */
export const SNAPSHOT_TABLES = {
  ...RAW_SOURCE_TABLES,
  source_quarantines: "source_quarantines",
  source_health: "source_health",
  models: "models",
  model_benchmarks: "model_benchmarks",
  model_task_metrics: "model_task_metrics",
  model_task_estimates: "model_task_estimates",
  model_benchmark_estimates: "model_benchmark_estimates",
  refresh_runs: "refresh_runs",
  model_score_changes: "model_score_changes",
  model_change_details: "model_change_details",
  model_match_debug: "model_match_debug",
} as const;

export type SnapshotTableName = (typeof SNAPSHOT_TABLES)[keyof typeof SNAPSHOT_TABLES];
