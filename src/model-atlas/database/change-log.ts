/** The refresh change log's SQLite codec: the rows the change-history window reads, how refresh runs, score moves, and update details are stored, and how stored events decode, including those logged before update-level fields existed. */

import { asFiniteNumber, asNonEmptyString, asRecord } from "../runtime";
import { jsonValue } from "../sources/cache/rows";
import {
  buildChangeHistory,
  CHANGE_HISTORY_SECONDS,
  type ChangeLog,
  type ModelChangeDetailRow,
  type ModelScoreChangeRow,
  type RefreshRunRow,
  variantKey,
} from "../stats/payload/changes";
import type {
  ModelAtlasBenchmarkRankDriver,
  ModelAtlasInputChange,
  ModelAtlasModel,
  ModelAtlasScoreChange,
  ModelAtlasScoreChangeCause,
  ModelAtlasScoreDimension,
  ModelAtlasScoreMove,
  ModelAtlasVariantChanges,
} from "../stats/types";
import { SNAPSHOT_TABLES, type SnapshotTableName } from "./tables";
import { type DatabaseWriter, sqliteBooleanValue } from "./writers/database";

type DbRow = Record<string, unknown>;

export const CHANGE_LOG_TABLES = [
  SNAPSHOT_TABLES.refresh_runs,
  SNAPSHOT_TABLES.model_score_changes,
  SNAPSHOT_TABLES.model_change_details,
] as const;

/** Change history reads only entries from this refresh id onward, measured back from the newest refresh. */
const CHANGE_HISTORY_START = `(SELECT MAX(refresh_id) FROM ${SNAPSHOT_TABLES.refresh_runs}) - ${CHANGE_HISTORY_SECONDS}`;

export const CHANGE_LOG_ROW_GROUPS = [
  {
    key: "refreshRunRows",
    sql: `SELECT * FROM ${SNAPSHOT_TABLES.refresh_runs} ORDER BY refresh_id`,
    optional: false,
  },
  windowedRowGroup("scoreChangeRows", SNAPSHOT_TABLES.model_score_changes, false),
  windowedRowGroup("changeDetailRows", SNAPSHOT_TABLES.model_change_details, true),
] as const;

type ChangeLogRows = Record<(typeof CHANGE_LOG_ROW_GROUPS)[number]["key"], DbRow[]>;

const SCORE_CHANGE_DIMENSIONS = new Set<ModelAtlasScoreDimension>([
  "intelligence",
  "agentic",
  "speed",
  "value",
]);
const SCORE_CHANGE_CAUSE_KINDS = new Set<ModelAtlasScoreChangeCause["kind"]>([
  "model",
  "evidence",
  "coverage",
  "methodology",
  "relative",
]);
const INPUT_CHANGE_KINDS = new Set<ModelAtlasInputChange["kind"]>([
  "result",
  "task_cost",
  "task_time",
  "task_tokens",
  "provider_price",
  "provider_speed",
  "provider_latency",
]);

/** Entries before the change-history window are never read, so each refresh drops them to keep the checkpoint from growing with every run; publication archives each entry as it is added. */
export function pruneChangeLog(db: DatabaseWriter): void {
  for (const table of CHANGE_LOG_TABLES) {
    db.prepare(`DELETE FROM ${table} WHERE refresh_id < ${CHANGE_HISTORY_START}`).run();
  }
}

/** Appends one bounded summary for each refresh that reached publication. */
export function insertRefreshRuns(db: DatabaseWriter, rows: readonly RefreshRunRow[]): void {
  const statement = db.prepare(`
		INSERT OR IGNORE INTO refresh_runs (
			refresh_id, previous_refresh_id, methodology_changed,
			model_change_count, score_change_count
		) VALUES (?, ?, ?, ?, ?)
	`);
  for (const refresh of rows) {
    statement.run(
      refresh.refresh_id,
      refresh.previous_refresh_id,
      sqliteBooleanValue(refresh.methodology_changed),
      refresh.model_change_count,
      refresh.score_change_count,
    );
  }
}

/** Appends only material score dimensions together with their bounded cause and rank-alignment evidence. */
export function insertModelScoreChanges(
  db: DatabaseWriter,
  rows: readonly ModelScoreChangeRow[],
): void {
  const statement = db.prepare(`
		INSERT OR IGNORE INTO model_score_changes (
			refresh_id, model_id, reasoning_effort, score_key,
			score_before, score_after, score_delta, rank_before, rank_after,
			confidence_before, confidence_after, causes_json, rank_drivers_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const change of rows) {
    statement.run(
      change.refresh_id,
      change.model_id,
      change.reasoning_effort,
      change.dimension,
      change.score_before,
      change.score_after,
      change.score_delta,
      change.rank_before,
      change.rank_after,
      change.confidence_before,
      change.confidence_after,
      JSON.stringify(change.causes),
      JSON.stringify(change.rank_drivers),
    );
  }
}

/** Appends each material update's entry kind and the variant's own changed inputs. */
export function insertModelChangeDetails(
  db: DatabaseWriter,
  rows: readonly ModelChangeDetailRow[],
): void {
  const statement = db.prepare(`
		INSERT OR IGNORE INTO model_change_details (
			refresh_id, model_id, reasoning_effort, entry, inputs_json
		) VALUES (?, ?, ?, ?, ?)
	`);
  for (const detail of rows) {
    statement.run(
      detail.refresh_id,
      detail.model_id,
      detail.reasoning_effort,
      detail.entry,
      JSON.stringify(detail.inputs),
    );
  }
}

export function changeLogFromRows(rows: ChangeLogRows): ChangeLog {
  return {
    refreshRuns: rows.refreshRunRows.flatMap((row) => {
      const refreshId = asFiniteNumber(row.refresh_id);
      return refreshId == null
        ? []
        : [
            {
              refresh_id: refreshId,
              previous_refresh_id: asFiniteNumber(row.previous_refresh_id),
              methodology_changed: row.methodology_changed === 1,
            },
          ];
    }),
    scoreChanges: rows.scoreChangeRows.flatMap(scoreChangeRowFromDb),
    details: rows.changeDetailRows.flatMap(changeDetailRowFromDb),
  };
}

/** The change history of the variants a payload lists, as published beside it. */
export function listedChangeHistory(
  rows: ChangeLogRows,
  models: readonly ModelAtlasModel[],
): ModelAtlasVariantChanges[] {
  const listed = new Set(
    models.flatMap(({ id, reasoning_effort }) =>
      id == null ? [] : [variantKey(id, reasoning_effort)],
    ),
  );
  return buildChangeHistory(changeLogFromRows(rows)).filter(({ model_id, reasoning_effort }) =>
    listed.has(variantKey(model_id, reasoning_effort)),
  );
}

/**
 * Decode persisted change JSON defensively, rejecting invalid required fields while discarding malformed optional causes, drivers, score moves, and inputs.
 * Events stored before update-level fields existed read as their headline move alone with inputs not recorded (null).
 */
export function scoreChangeFromJson(value: unknown): ModelAtlasScoreChange | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  let change: DbRow;
  try {
    change = asRecord(JSON.parse(value));
  } catch {
    return null;
  }
  const refreshId = asFiniteNumber(change.refresh_id);
  const headline = scoreMoveFromJson(change);
  if (refreshId == null || headline == null) {
    return null;
  }
  const causes = causesFromJson(change.causes);
  return {
    ...headline,
    refresh_id: refreshId,
    causes,
    rank_drivers: rankDriversFromJson(change.rank_drivers),
    entry: entryFromJson(change.entry),
    methodology_changed:
      change.methodology_changed === true || causes.some(({ kind }) => kind === "methodology"),
    scores: Array.isArray(change.scores)
      ? change.scores.flatMap((value) => scoreMoveFromJson(asRecord(value)) ?? [])
      : [headline],
    inputs: Array.isArray(change.inputs) ? change.inputs.flatMap(inputChangeFromJson) : null,
  };
}

function windowedRowGroup<Key extends string>(
  key: Key,
  table: SnapshotTableName,
  optional: boolean,
) {
  return {
    key,
    sql: `SELECT * FROM ${table} WHERE refresh_id >= ${CHANGE_HISTORY_START} ORDER BY refresh_id`,
    optional,
  };
}

function scoreChangeRowFromDb(row: DbRow): ModelScoreChangeRow[] {
  const refreshId = asFiniteNumber(row.refresh_id);
  const modelId = asNonEmptyString(row.model_id);
  const move = scoreMoveFromJson({ ...row, dimension: row.score_key });
  return refreshId == null || modelId == null || move == null
    ? []
    : [
        {
          refresh_id: refreshId,
          ...move,
          causes: causesFromJson(jsonValue(row.causes_json)),
          rank_drivers: rankDriversFromJson(jsonValue(row.rank_drivers_json)),
          model_id: modelId,
          reasoning_effort: typeof row.reasoning_effort === "string" ? row.reasoning_effort : "",
        },
      ];
}

function changeDetailRowFromDb(row: DbRow): ModelChangeDetailRow[] {
  const refreshId = asFiniteNumber(row.refresh_id);
  const modelId = asNonEmptyString(row.model_id);
  const inputs = jsonValue(row.inputs_json);
  return refreshId == null || modelId == null || !Array.isArray(inputs)
    ? []
    : [
        {
          refresh_id: refreshId,
          model_id: modelId,
          reasoning_effort: typeof row.reasoning_effort === "string" ? row.reasoning_effort : "",
          entry: entryFromJson(row.entry),
          inputs: inputs.flatMap(inputChangeFromJson),
        },
      ];
}

function causesFromJson(value: unknown): ModelAtlasScoreChangeCause[] {
  return Array.isArray(value)
    ? value
        .flatMap((entry) => {
          const cause = asRecord(entry);
          const kind = asNonEmptyString(cause.kind) as ModelAtlasScoreChangeCause["kind"] | null;
          const label = asNonEmptyString(cause.label);
          return kind == null || label == null || !SCORE_CHANGE_CAUSE_KINDS.has(kind)
            ? []
            : [{ kind, label }];
        })
        .slice(0, 3)
    : [];
}

function rankDriversFromJson(value: unknown): ModelAtlasBenchmarkRankDriver[] {
  return Array.isArray(value)
    ? value
        .flatMap((entry) => {
          const driver = asRecord(entry);
          const benchmarkKey = asNonEmptyString(driver.benchmark_key);
          const label = asNonEmptyString(driver.label);
          const benchmarkRank = asFiniteNumber(driver.benchmark_rank);
          const benchmarkModelCount = asFiniteNumber(driver.benchmark_model_count);
          const rankCorrelation = asFiniteNumber(driver.rank_correlation);
          return benchmarkKey == null ||
            label == null ||
            benchmarkRank == null ||
            benchmarkModelCount == null ||
            rankCorrelation == null
            ? []
            : [
                {
                  benchmark_key: benchmarkKey,
                  label,
                  benchmark_rank: benchmarkRank,
                  benchmark_model_count: benchmarkModelCount,
                  rank_correlation: rankCorrelation,
                } satisfies ModelAtlasBenchmarkRankDriver,
              ];
        })
        .slice(0, 3)
    : [];
}

function entryFromJson(value: unknown): ModelAtlasScoreChange["entry"] {
  return value === "model" || value === "variant" ? value : null;
}

function scoreMoveFromJson(move: DbRow): ModelAtlasScoreMove | null {
  const dimension = asNonEmptyString(move.dimension) as ModelAtlasScoreDimension | null;
  const scoreAfter = asFiniteNumber(move.score_after);
  if (dimension == null || !SCORE_CHANGE_DIMENSIONS.has(dimension) || scoreAfter == null) {
    return null;
  }
  return {
    dimension,
    score_before: asFiniteNumber(move.score_before),
    score_after: scoreAfter,
    score_delta: asFiniteNumber(move.score_delta),
    rank_before: asFiniteNumber(move.rank_before),
    rank_after: asFiniteNumber(move.rank_after),
    confidence_before: asFiniteNumber(move.confidence_before),
    confidence_after: asFiniteNumber(move.confidence_after),
  };
}

function inputChangeFromJson(value: unknown): ModelAtlasInputChange[] {
  const input = asRecord(value);
  const kind = asNonEmptyString(input.kind) as ModelAtlasInputChange["kind"] | null;
  const key = asNonEmptyString(input.key);
  const label = asNonEmptyString(input.label);
  return kind == null || key == null || label == null || !INPUT_CHANGE_KINDS.has(kind)
    ? []
    : [
        {
          kind,
          key,
          label,
          before: asFiniteNumber(input.before),
          after: asFiniteNumber(input.after),
        },
      ];
}
