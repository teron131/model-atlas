/** Snapshot table identities distinguish source evidence from derived models and append-only audit history. */

import { RAW_SOURCE_TABLES } from "../sources/registry";

/** Tables owned by the local snapshot pipeline and rewritten as a completed run. */
export const SNAPSHOT_TABLES = {
  ...RAW_SOURCE_TABLES,
  source_quarantines: "source_quarantines",
  source_health: "source_health",
  models: "models",
  model_benchmarks: "model_benchmarks",
  model_task_metrics: "model_task_metrics",
  benchmark_version_log: "benchmark_version_log",
  refresh_runs: "refresh_runs",
  model_score_changes: "model_score_changes",
  model_match_debug: "model_match_debug",
} as const;

export type SnapshotTableName = (typeof SNAPSHOT_TABLES)[keyof typeof SNAPSHOT_TABLES];
