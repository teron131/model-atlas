/** D1 row-write policy owns differential comparison, bounded SQL, and staged fallback. */

import { createHash } from "node:crypto";

import type { CacheDbRow } from "../../ingest/cache/rows";
import {
  isBenchmarkObservationRawSource,
  RAW_SOURCE_TABLES,
  type RawSourceName,
} from "../../ingest/source-registry";
import { SnapshotRowCollector } from "../../ingest/writers";
import type { CollectedTableRows } from "../../ingest/writers/collector";
import type { SqlValue } from "../../ingest/writers/database";
import { quoteIdentifier } from "../schema-reconciliation";
import { type D1Usage, queryD1Batch } from "./client";

const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;
const DELETE_KEYS_PER_STATEMENT = 500;
const MAX_PUBLICATION_BATCH_STATEMENTS = 20;
const MAX_PUBLICATION_BATCH_SQL_CHARS = 350_000;
const ROW_DIFF_IGNORED_COLUMNS = new Set(["row_index", "fetched_at_epoch_seconds"]);

type RawRowWritePlan = {
  statements: string[];
  fitsAtomicBatch: boolean;
};

/** Detect meaningful raw-source changes while isolating shared observation-table partitions. */
export function rawSourceRowsChanged(
  collector: SnapshotRowCollector,
  source: RawSourceName,
  currentRows: readonly CacheDbRow[],
): boolean {
  return (
    tableContentHash(collectedSourceRecords(collector, source)) !== tableContentHash(currentRows)
  );
}

/** Writes a bounded raw-source diff atomically and retains staged replacement for large churn. */
export async function writeChangedRawSourceRows(
  source: RawSourceName,
  collector: SnapshotRowCollector,
  currentRows: readonly CacheDbRow[],
  usage: D1Usage,
): Promise<number> {
  const table = RAW_SOURCE_TABLES[source];
  const collected = collectedRowsForSource(collector, source);
  const isObservation = isBenchmarkObservationRawSource(source);
  const whereSql = isObservation
    ? `${quoteIdentifier("source_key")} = ${sqlLiteral(source)}`
    : undefined;
  const conflictColumns = isObservation ? ["source_key", "row_index"] : ["row_index"];
  const plan = buildRawRowWritePlan(table, collected, currentRows, whereSql, conflictColumns);
  if (!plan.fitsAtomicBatch) {
    return replaceStagedRows(table, collected, source, usage, whereSql);
  }
  await queryD1Batch(
    plan.statements.map((sql) => ({ sql })),
    usage,
  );
  return plan.statements.length;
}

/** Compares a collected source with its already-loaded cache and plans only changed row writes. */
export function buildRawRowWritePlan(
  table: string,
  collected: CollectedTableRows | undefined,
  currentRows: readonly CacheDbRow[],
  whereSql?: string,
  conflictColumns: readonly string[] = ["row_index"],
): RawRowWritePlan {
  const next = collected ?? { columns: ["row_index"], rows: [] };
  const keyColumn = "row_index";
  const keyIndex = next.columns.indexOf(keyColumn);
  if (keyIndex < 0) {
    throw new Error(`${table} is missing its ${keyColumn} differential-write key`);
  }
  const currentByKey = new Map(
    currentRows.map((row) => [rowKey(row[keyColumn], table), row] as const),
  );
  const nextKeys = new Set<string>();
  const changedRows = next.rows.filter((values) => {
    const key = rowKey(values[keyIndex], table);
    if (nextKeys.has(key)) {
      throw new Error(`${table} contains duplicate ${keyColumn} ${String(values[keyIndex])}`);
    }
    nextKeys.add(key);
    const current = currentByKey.get(key);
    return (
      current == null ||
      collectedRowContent(next.columns, values) !== cachedRowContent(next.columns, current)
    );
  });
  const deletedKeys = currentRows
    .filter((row) => !nextKeys.has(rowKey(row[keyColumn], table)))
    .map((row) => row[keyColumn] as SqlValue);
  const changed =
    changedRows.length === 0 ? undefined : { columns: next.columns, rows: changedRows };
  const statements = [
    ...deleteKeyStatements(table, keyColumn, deletedKeys, whereSql),
    ...insertStatements(table, changed, conflictColumns),
  ];
  return {
    statements,
    fitsAtomicBatch: statementBatches(statements).length <= 1,
  };
}

/** Compare table content as an unordered multiset while ignoring refresh-only row metadata. */
export function tableRowsChanged(
  collected: CollectedTableRows | undefined,
  currentRows: readonly CacheDbRow[],
): boolean {
  if (collected == null) {
    return currentRows.length > 0;
  }
  const nextContent = collected.rows
    .map((values) => collectedRowContent(collected.columns, values))
    .sort();
  const currentContent = currentRows.map((row) => cachedRowContent(collected.columns, row)).sort();
  return (
    nextContent.length !== currentContent.length ||
    nextContent.some((content, index) => content !== currentContent[index])
  );
}

/** Build a direct atomic replacement for small tables committed beside another publication write. */
export function buildTableReplacementStatements(
  table: string,
  collected: CollectedTableRows | undefined,
): string[] {
  return [`DELETE FROM ${quoteIdentifier(table)};`, ...insertStatements(table, collected)];
}

/** Replaces a table or source partition only after its complete successor is staged. */
export async function replaceStagedRows(
  table: string,
  collected: CollectedTableRows | undefined,
  stageKey: string,
  usage: D1Usage,
  whereSql?: string,
): Promise<number> {
  const stage = stageTableName(`${table}_${stageKey}`);
  let statementCount = await resetStageTable(table, stage, usage);
  statementCount += await populateStageTable(stage, collected, usage);
  const commitQueries = [
    {
      sql:
        whereSql == null
          ? `DELETE FROM ${quoteIdentifier(table)};`
          : `DELETE FROM ${quoteIdentifier(table)} WHERE ${whereSql};`,
    },
    {
      sql: `INSERT INTO ${quoteIdentifier(table)} SELECT * FROM ${quoteIdentifier(stage)};`,
    },
    { sql: `DROP TABLE ${quoteIdentifier(stage)};` },
  ];
  await queryD1Batch(commitQueries, usage);
  return statementCount + commitQueries.length;
}

/** Append idempotent audit rows directly because partial batches remain safe to retry. */
export async function appendRows(
  table: string,
  collected: CollectedTableRows | undefined,
  usage: D1Usage,
): Promise<number> {
  const statements = insertStatements(table, collected, "ignore");
  await executeStatements(statements, usage);
  return statements.length;
}

async function resetStageTable(table: string, stage: string, usage: D1Usage): Promise<number> {
  const queries = [
    { sql: `DROP TABLE IF EXISTS ${quoteIdentifier(stage)};` },
    {
      sql: `CREATE TABLE ${quoteIdentifier(stage)} AS SELECT * FROM ${quoteIdentifier(table)} WHERE 0;`,
    },
  ];
  await queryD1Batch(queries, usage);
  return queries.length;
}

async function populateStageTable(
  stage: string,
  collected: CollectedTableRows | undefined,
  usage: D1Usage,
): Promise<number> {
  const statements = insertStatements(stage, collected);
  await executeStatements(statements, usage);
  return statements.length;
}

async function executeStatements(statements: readonly string[], usage: D1Usage): Promise<void> {
  for (const batch of statementBatches(statements)) {
    await queryD1Batch(
      batch.map((sql) => ({ sql })),
      usage,
    );
  }
}

/** Bounds both statement count and SQL text so every D1 REST batch stays comfortably below 30 seconds. */
function statementBatches(statements: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchChars = 0;
  for (const statement of statements) {
    if (
      batch.length > 0 &&
      (batch.length >= MAX_PUBLICATION_BATCH_STATEMENTS ||
        batchChars + statement.length > MAX_PUBLICATION_BATCH_SQL_CHARS)
    ) {
      batches.push(batch);
      batch = [];
      batchChars = 0;
    }
    batch.push(statement);
    batchChars += statement.length;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}

function stageTableName(key: string): string {
  const readableKey = key.replaceAll(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
  const suffix = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return `model_atlas_stage_${readableKey}_${suffix}`;
}

/** Select one logical source partition from the shared observation table. */
function collectedRowsForSource(
  collector: SnapshotRowCollector,
  source: RawSourceName,
): CollectedTableRows | undefined {
  const table = RAW_SOURCE_TABLES[source];
  const collected = collector.tables.get(table);
  if (collected == null || !isBenchmarkObservationRawSource(source)) {
    return collected;
  }
  const sourceKeyIndex = collected.columns.indexOf("source_key");
  if (sourceKeyIndex < 0) {
    throw new Error(`${table} is missing its source_key partition column`);
  }
  return {
    columns: collected.columns,
    rows: collected.rows.filter((row) => row[sourceKeyIndex] === source),
  };
}

function collectedSourceRecords(
  collector: SnapshotRowCollector,
  source: RawSourceName,
): Record<string, SqlValue>[] {
  const collected = collectedRowsForSource(collector, source);
  if (collected == null) {
    return [];
  }
  return collected.rows.map((values) =>
    Object.fromEntries(collected.columns.map((column, index) => [column, values[index] ?? null])),
  );
}

function deleteKeyStatements(
  table: string,
  keyColumn: string,
  keys: readonly SqlValue[],
  whereSql?: string,
): string[] {
  const statements: string[] = [];
  for (let index = 0; index < keys.length; index += DELETE_KEYS_PER_STATEMENT) {
    const chunk = keys.slice(index, index + DELETE_KEYS_PER_STATEMENT);
    const keyPredicate = `${quoteIdentifier(keyColumn)} IN (${chunk.map(sqlLiteral).join(", ")})`;
    statements.push(
      `DELETE FROM ${quoteIdentifier(table)} WHERE ${whereSql == null ? keyPredicate : `${whereSql} AND ${keyPredicate}`};`,
    );
  }
  return statements;
}

function insertStatements(
  table: string,
  collected: CollectedTableRows | undefined,
  conflict?: "ignore" | readonly string[],
): string[] {
  if (collected == null || collected.rows.length === 0) {
    return [];
  }
  const prefix = `INSERT${conflict === "ignore" ? " OR IGNORE" : ""} INTO ${quoteIdentifier(table)} (${collected.columns.map(quoteIdentifier).join(", ")}) VALUES `;
  const suffix = Array.isArray(conflict) ? upsertClause(collected.columns, conflict) : "";
  const statements: string[] = [];
  let chunk: string[] = [];
  let chunkLength = prefix.length;
  for (const row of collected.rows) {
    const valueSql = `(${row.map(sqlLiteral).join(", ")})`;
    const nextLength = chunkLength + valueSql.length + 2;
    if (
      chunk.length > 0 &&
      (chunk.length >= INSERT_ROWS_PER_STATEMENT || nextLength > MAX_INSERT_STATEMENT_CHARS)
    ) {
      statements.push(`${prefix}${chunk.join(", ")}${suffix};`);
      chunk = [];
      chunkLength = prefix.length;
    }
    chunk.push(valueSql);
    chunkLength += valueSql.length + 2;
  }
  if (chunk.length > 0) {
    statements.push(`${prefix}${chunk.join(", ")}${suffix};`);
  }
  return statements;
}

function upsertClause(columns: readonly string[], conflictColumns: readonly string[]): string {
  const updatedColumns = columns.filter((column) => !conflictColumns.includes(column));
  const target = conflictColumns.map(quoteIdentifier).join(", ");
  return updatedColumns.length === 0
    ? ` ON CONFLICT (${target}) DO NOTHING`
    : ` ON CONFLICT (${target}) DO UPDATE SET ${updatedColumns.map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ")}`;
}

function rowKey(value: unknown, table: string): string {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${table} contains invalid row_index ${String(value)}`);
  }
  return String(value);
}

function collectedRowContent(columns: readonly string[], values: readonly SqlValue[]): string {
  return JSON.stringify(
    columns.flatMap((column, index) =>
      ROW_DIFF_IGNORED_COLUMNS.has(column) ? [] : [values[index] ?? null],
    ),
  );
}

function cachedRowContent(columns: readonly string[], row: CacheDbRow): string {
  return JSON.stringify(
    columns.flatMap((column) =>
      ROW_DIFF_IGNORED_COLUMNS.has(column) ? [] : [row[column] ?? null],
    ),
  );
}

function tableContentHash(rows: readonly Record<string, unknown>[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map(({ row_index, fetched_at_epoch_seconds, ...row }) => canonicalize(row)),
      ),
    )
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sqlLiteral(value: SqlValue): string {
  if (value == null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${value.replaceAll("'", "''")}'`;
}
