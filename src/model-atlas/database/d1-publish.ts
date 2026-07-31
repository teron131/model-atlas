/** Direct D1 refresh stages bounded writes and exposes the new public snapshot only after every table is ready. */

import { createHash, randomUUID } from "node:crypto";

import { readBenchmarkObservationRawCache } from "../benchmarks/persistence/observation";
import { benchmarkSnapshotCachesFromRows } from "../benchmarks/persistence/runtime";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
} from "../benchmarks/registry";
import { BENCHMARK_VERSION_BASELINE_DATE, STAGE_CONFIG } from "../config";
import {
  artificialAnalysisBenchmarkResourceRawCacheFromRows,
  artificialAnalysisRawCacheFromRows,
  modelsDevRawCacheFromRows,
  rawSourceCacheStatusFromRows,
  readOpenRouterRawCache,
} from "../ingest/cache";
import type { CacheDbRow } from "../ingest/cache/rows";
import {
  isBenchmarkObservationRawSource,
  RAW_SOURCE_NAMES,
  RAW_SOURCE_TABLES,
  type RawSourceName,
  SNAPSHOT_TABLES,
} from "../ingest/source-registry";
import { refreshSourceSnapshots, type SourceSnapshotCaches } from "../ingest/source-snapshots/load";
import {
  type OpenRouterRawCache,
  refreshOpenRouterRawPayload,
} from "../ingest/source-snapshots/openrouter";
import { sourceRowStatesFromRows } from "../ingest/source-snapshots/policy";
import type { RawSourceCacheStatus } from "../ingest/types";
import { SnapshotRowCollector } from "../ingest/writers";
import type { CollectedTableRows } from "../ingest/writers/collector";
import type { SqlValue } from "../ingest/writers/database";
import { nowEpochSeconds } from "../runtime";
import { preserveHighSignalSnapshotModels } from "../stats/payload/snapshot-preservation";
import type { ModelAtlasPayload } from "../stats/types";
import {
  d1Config,
  ensureD1Schema,
  missingD1Environment,
  queryD1Batch,
  queryD1BatchRows,
  readD1Payload,
} from "./d1";
import { buildPayloadFromRows, buildPayloadRows, PAYLOAD_ROW_GROUPS } from "./payload-rows";
import { quoteIdentifier, type SchemaReconciliationPlan } from "./schema-reconciliation";
import {
  buildBenchmarkVersionLogRows,
  deriveDatabaseSnapshot,
  writeDatabaseSnapshotRows,
} from "./snapshot-workflow";

const DERIVED_TABLES = [
  SNAPSHOT_TABLES.source_quarantines,
  SNAPSHOT_TABLES.source_health,
  SNAPSHOT_TABLES.models,
  SNAPSHOT_TABLES.model_benchmarks,
  SNAPSHOT_TABLES.model_task_metrics,
  SNAPSHOT_TABLES.model_match_debug,
] as const;
const INSERT_ROWS_PER_STATEMENT = 100;
const MAX_INSERT_STATEMENT_CHARS = 20_000;
const MAX_MATERIALIZED_PAYLOAD_BYTES = 1_900_000;
const MAX_PUBLICATION_BATCH_STATEMENTS = 20;
const MAX_PUBLICATION_BATCH_SQL_CHARS = 350_000;
const PUBLICATION_LOCK_STALE_SECONDS = 30 * 60;

type D1PublishResult = {
  database_id: string;
  model_count: number;
  fetched_at_epoch_seconds: number | null;
  published: boolean;
  changed_sources: RawSourceName[];
  statement_count: number;
  schema_statement_count: number;
  schema_changed_tables: string[];
  schema_removed_tables: string[];
  schema_changed_indexes: string[];
  schema_removed_indexes: string[];
};

type D1RefreshState = {
  rawRows: Record<RawSourceName, CacheDbRow[]>;
  sourceCaches: SourceSnapshotCaches;
  openRouterCache: OpenRouterRawCache;
  statuses: Record<RawSourceName, RawSourceCacheStatus>;
  previousSourceRowStates: ReturnType<typeof sourceRowStatesFromRows>;
  previousPayload: ModelAtlasPayload | null;
};

type PersistedSourceCacheStatus = Pick<
  RawSourceCacheStatus,
  "last_fetch_epoch_seconds" | "source_input_count"
>;

type D1Publication = {
  result: D1PublishResult;
  payload: ModelAtlasPayload;
};

/** Refreshes D1 directly and returns both publication diagnostics and the assembled payload. */
export async function publishD1Snapshot(): Promise<D1Publication> {
  const config = d1Config();
  if (config == null) {
    throw new Error(
      `Cloudflare D1 is not configured. Missing ${missingD1Environment().join(", ")}.`,
    );
  }
  const schema = await ensureD1Schema();
  const lockToken = await acquirePublicationLock();
  try {
    return await publishLockedD1Snapshot(config.databaseId, schema);
  } finally {
    await releasePublicationLock(lockToken);
  }
}

/** Runs the refresh while one D1 owner controls table staging and the public payload flip. */
async function publishLockedD1Snapshot(
  databaseId: string,
  schema: SchemaReconciliationPlan,
): Promise<D1Publication> {
  const previousPayload = await readD1Payload();
  const startedAtEpochSeconds = nowEpochSeconds();
  const replaceSourceRows = process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1";
  const current = await readD1RefreshState(startedAtEpochSeconds, previousPayload);
  const refreshed = await refreshSourceSnapshots(
    current.sourceCaches,
    current.statuses,
    current.previousSourceRowStates,
    startedAtEpochSeconds,
    STAGE_CONFIG.scoring,
    {
      replaceSourceRows,
    },
  );
  const derived = await deriveDatabaseSnapshot(
    startedAtEpochSeconds,
    refreshed.snapshots,
    refreshed.sourceCache,
    (modelIds) =>
      refreshOpenRouterRawPayload(
        current.openRouterCache,
        current.statuses.openrouter,
        modelIds,
        STAGE_CONFIG.openrouter.speedConcurrency,
        {
          replaceSourceRows,
        },
      ),
    {
      previousPayload: current.previousPayload,
    },
  );
  let collector = collectDatabaseSnapshot(derived.rows);
  const previewPayload = payloadFromCollector(startedAtEpochSeconds, collector);
  const preservedPayload = replaceSourceRows
    ? previewPayload
    : preserveHighSignalSnapshotModels(
        previewPayload,
        current.previousPayload,
        STAGE_CONFIG.snapshotPreservation,
        STAGE_CONFIG.scoring,
      );
  if (preservedPayload !== previewPayload) {
    derived.rows.finalModelRows = preservedPayload.models;
    derived.rows.benchmarkVersionLogRows = buildBenchmarkVersionLogRows(
      current.previousPayload?.models ?? [],
      preservedPayload.models,
      BENCHMARK_VERSION_BASELINE_DATE,
      new Date(startedAtEpochSeconds * 1000).toISOString().slice(0, 10),
    );
    collector = collectDatabaseSnapshot(derived.rows);
  }
  const changedSources = RAW_SOURCE_NAMES.filter(
    (source) =>
      tableContentHash(collectorRowsForSource(collector, source)) !==
      tableContentHash(current.rawRows[source]),
  );
  const nextPayload = payloadFromCollector(startedAtEpochSeconds, collector);
  if (
    schema.statements.length === 0 &&
    changedSources.length === 0 &&
    current.previousPayload != null &&
    publicContentHash(nextPayload) === publicContentHash(current.previousPayload)
  ) {
    const payload = {
      ...current.previousPayload,
      metadata: {
        ...current.previousPayload.metadata,
        source_health: derived.rows.sourceHealth,
      },
    };
    const queries = [
      ...sourceHealthStatements(collector).map((sql) => ({ sql })),
      materializedPayloadQuery(payload),
    ];
    await queryD1Batch(queries);
    return {
      result: publishResult(databaseId, payload, false, [], queries.length, schema),
      payload,
    };
  }
  const completedAtEpochSeconds = nowEpochSeconds();
  const payload = payloadFromCollector(completedAtEpochSeconds, collector);
  const statementCount = await publishChangedSnapshot(
    completedAtEpochSeconds,
    collector,
    changedSources,
    payload,
  );
  return {
    result: publishResult(databaseId, payload, true, changedSources, statementCount, schema),
    payload,
  };
}

/** Claims the singleton publication owner, replacing only locks left stale by an interrupted run. */
async function acquirePublicationLock(): Promise<string> {
  const token = randomUUID();
  const acquiredAtEpochSeconds = nowEpochSeconds();
  const [, rows] = await queryD1BatchRows([
    {
      sql: "INSERT INTO snapshot_publication_lock (lock_key, owner_token, acquired_at_epoch_seconds) VALUES ('public', ?, ?) ON CONFLICT(lock_key) DO UPDATE SET owner_token = excluded.owner_token, acquired_at_epoch_seconds = excluded.acquired_at_epoch_seconds WHERE snapshot_publication_lock.acquired_at_epoch_seconds <= ?",
      params: [
        token,
        acquiredAtEpochSeconds,
        acquiredAtEpochSeconds - PUBLICATION_LOCK_STALE_SECONDS,
      ],
    },
    {
      sql: "SELECT owner_token, acquired_at_epoch_seconds FROM snapshot_publication_lock WHERE lock_key = 'public'",
    },
  ]);
  const lock = rows?.[0];
  if (lock?.owner_token !== token) {
    throw new Error(
      `Cloudflare D1 publication is already running (lock acquired at ${String(lock?.acquired_at_epoch_seconds ?? "unknown")})`,
    );
  }
  return token;
}

/** Releases only the lock owned by this invocation so a stale caller cannot unlock a newer run. */
async function releasePublicationLock(token: string): Promise<void> {
  await queryD1Batch([
    {
      sql: "DELETE FROM snapshot_publication_lock WHERE lock_key = 'public' AND owner_token = ?",
      params: [token],
    },
  ]);
}

function publishResult(
  databaseId: string,
  payload: ModelAtlasPayload,
  published: boolean,
  changedSources: RawSourceName[],
  statementCount: number,
  schema: SchemaReconciliationPlan,
): D1PublishResult {
  return {
    database_id: databaseId,
    model_count: payload.models.length,
    fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
    published,
    changed_sources: changedSources,
    statement_count: statementCount,
    schema_statement_count: schema.statements.length,
    schema_changed_tables: schema.changedTables,
    schema_removed_tables: schema.removedTables,
    schema_changed_indexes: schema.changedIndexes,
    schema_removed_indexes: schema.removedIndexes,
  };
}

async function readD1RefreshState(
  nowEpochSeconds: number,
  previousPayload: ModelAtlasPayload | null,
): Promise<D1RefreshState> {
  const rawRows = await readD1RawRows();
  const [previousSourceRows, previousSourceCacheRows] = await queryD1BatchRows([
    {
      sql: "SELECT source, row_key, row_label, 'quarantined_missing_from_source' AS status, missing_from_source_since_epoch_seconds FROM source_quarantines ORDER BY source, row_key",
    },
    {
      sql: "SELECT source, last_fetch_epoch_seconds, source_input_count FROM source_health ORDER BY source",
    },
  ]);
  const previousSourceCache = sourceCacheStatusesFromRows(previousSourceCacheRows ?? []);
  return {
    rawRows,
    sourceCaches: sourceCachesFromRows(rawRows),
    openRouterCache: readOpenRouterRawCache(rawRows.openrouter),
    statuses: Object.fromEntries(
      RAW_SOURCE_NAMES.map((source) => [
        source,
        rawSourceCacheStatusFromRows(
          source,
          rawRows[source],
          nowEpochSeconds,
          previousSourceCache.get(source),
        ),
      ]),
    ) as Record<RawSourceName, RawSourceCacheStatus>,
    previousSourceRowStates: sourceRowStatesFromRows(previousSourceRows ?? []),
    previousPayload,
  };
}

function sourceCacheStatusesFromRows(
  rows: readonly Record<string, unknown>[],
): Map<string, PersistedSourceCacheStatus> {
  const statuses = new Map<string, PersistedSourceCacheStatus>();
  for (const row of rows) {
    if (typeof row.source !== "string" || typeof row.source_input_count !== "number") {
      continue;
    }
    statuses.set(row.source, {
      last_fetch_epoch_seconds:
        typeof row.last_fetch_epoch_seconds === "number" ? row.last_fetch_epoch_seconds : null,
      source_input_count: row.source_input_count,
    });
  }
  return statuses;
}

async function readD1RawRows(): Promise<Record<RawSourceName, CacheDbRow[]>> {
  const directSources = RAW_SOURCE_NAMES.filter(
    (source) => !isBenchmarkObservationRawSource(source),
  );
  const rowGroups = await queryD1BatchRows([
    ...directSources.map((source) => ({
      sql: `SELECT * FROM ${quoteIdentifier(RAW_SOURCE_TABLES[source])} ORDER BY row_index`,
    })),
    {
      sql: `SELECT * FROM ${quoteIdentifier(BENCHMARK_OBSERVATION_RAW_TABLE)} ORDER BY source_key, row_index`,
    },
  ]);
  const directRows = new Map(
    directSources.map((source, index) => [source, rowGroups[index] ?? []] as const),
  );
  const sharedRows = rowGroups[directSources.length] ?? [];
  return Object.fromEntries(
    RAW_SOURCE_NAMES.map((source) => [
      source,
      (isBenchmarkObservationRawSource(source)
        ? sharedRows.filter((row) => row.source_key === source)
        : (directRows.get(source) ?? [])) as CacheDbRow[],
    ]),
  ) as Record<RawSourceName, CacheDbRow[]>;
}

function sourceCachesFromRows(rows: Record<RawSourceName, CacheDbRow[]>): SourceSnapshotCaches {
  const benchmarkObservations = Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
      binding.sourceDataKey,
      readBenchmarkObservationRawCache(rows[binding.benchmark], binding),
    ]),
  );
  return {
    ...benchmarkSnapshotCachesFromRows(rows),
    artificialAnalysis: artificialAnalysisRawCacheFromRows(rows.artificial_analysis),
    artificialAnalysisBenchmarkResources: artificialAnalysisBenchmarkResourceRawCacheFromRows(
      rows.artificial_analysis_benchmark_resources,
    ),
    modelsDev: modelsDevRawCacheFromRows(rows.models_dev),
    benchmarkObservations,
  };
}

function collectDatabaseSnapshot(
  rows: Parameters<typeof writeDatabaseSnapshotRows>[1],
): SnapshotRowCollector {
  const collector = new SnapshotRowCollector();
  writeDatabaseSnapshotRows(collector, rows);
  return collector;
}

/** Replaces only refresh metadata when source and derived content are unchanged. */
function sourceHealthStatements(collector: SnapshotRowCollector): string[] {
  const collected = collector.tables.get(SNAPSHOT_TABLES.source_health);
  if (collected == null) {
    return [];
  }
  return [
    `DELETE FROM ${quoteIdentifier(SNAPSHOT_TABLES.source_health)};`,
    ...insertStatements(SNAPSHOT_TABLES.source_health, collected),
  ];
}

function payloadFromCollector(
  fetchedAtEpochSeconds: number,
  collector: SnapshotRowCollector,
): ModelAtlasPayload {
  return buildPayloadFromRows(
    buildPayloadRows(
      fetchedAtEpochSeconds,
      PAYLOAD_ROW_GROUPS.map(({ key, table, sourceKey }) => [
        key,
        collector.records(table).filter((row) => sourceKey == null || row.source_key === sourceKey),
      ]),
    ),
  );
}

/** Stores the completed public snapshot only after every source and derived table is ready. */
function materializedPayloadQuery(payload: ModelAtlasPayload) {
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(payloadJson);
  if (payloadBytes > MAX_MATERIALIZED_PAYLOAD_BYTES) {
    throw new Error(
      `Materialized D1 payload is ${payloadBytes} bytes; the ${MAX_MATERIALIZED_PAYLOAD_BYTES}-byte safety limit requires a storage redesign`,
    );
  }
  return {
    sql: "INSERT OR REPLACE INTO snapshot_payloads (snapshot_key, payload_json) VALUES ('public', ?)",
    params: [payloadJson],
  };
}

/** Stages each replacement in bounded requests, then flips the public payload in the final batch. */
async function publishChangedSnapshot(
  completedAtEpochSeconds: number,
  collector: SnapshotRowCollector,
  changedSources: RawSourceName[],
  payload: ModelAtlasPayload,
): Promise<number> {
  const directChangedSources = changedSources.filter(
    (source) => !isBenchmarkObservationRawSource(source),
  );
  const observationChangedSources = changedSources.filter(isBenchmarkObservationRawSource);
  let statementCount = 0;
  for (const source of directChangedSources) {
    const table = RAW_SOURCE_TABLES[source];
    statementCount += await replaceStagedRows(table, collector.tables.get(table), source);
  }
  for (const source of observationChangedSources) {
    statementCount += await replaceStagedRows(
      BENCHMARK_OBSERVATION_RAW_TABLE,
      collectedRowsForSource(collector, source),
      source,
      `${quoteIdentifier("source_key")} = ${sqlLiteral(source)}`,
    );
  }
  for (const table of DERIVED_TABLES) {
    statementCount += await replaceStagedRows(table, collector.tables.get(table), table);
  }
  statementCount += await appendStagedRows(
    SNAPSHOT_TABLES.benchmark_version_log,
    collector.tables.get(SNAPSHOT_TABLES.benchmark_version_log),
  );
  const completionQueries = [
    { sql: "DELETE FROM snapshot_metadata;" },
    {
      sql: `INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (${completedAtEpochSeconds});`,
    },
    materializedPayloadQuery(payload),
  ];
  await queryD1Batch(completionQueries);
  return statementCount + completionQueries.length;
}

/** Replaces a table or source partition only after its complete successor is staged. */
async function replaceStagedRows(
  table: string,
  collected: CollectedTableRows | undefined,
  stageKey: string,
  whereSql?: string,
): Promise<number> {
  const stage = stageTableName(`${table}_${stageKey}`);
  let statementCount = await resetStageTable(table, stage);
  statementCount += await populateStageTable(stage, collected);
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
  await queryD1Batch(commitQueries);
  return statementCount + commitQueries.length;
}

/** Appends idempotent audit rows from a complete stage without replacing older versions. */
async function appendStagedRows(
  table: string,
  collected: CollectedTableRows | undefined,
): Promise<number> {
  const stage = stageTableName(table);
  let statementCount = await resetStageTable(table, stage);
  statementCount += await populateStageTable(stage, collected);
  const commitQueries = [
    {
      sql: `INSERT OR IGNORE INTO ${quoteIdentifier(table)} SELECT * FROM ${quoteIdentifier(stage)};`,
    },
    { sql: `DROP TABLE ${quoteIdentifier(stage)};` },
  ];
  await queryD1Batch(commitQueries);
  return statementCount + commitQueries.length;
}

async function resetStageTable(table: string, stage: string): Promise<number> {
  const queries = [
    { sql: `DROP TABLE IF EXISTS ${quoteIdentifier(stage)};` },
    {
      sql: `CREATE TABLE ${quoteIdentifier(stage)} AS SELECT * FROM ${quoteIdentifier(table)} WHERE 0;`,
    },
  ];
  await queryD1Batch(queries);
  return queries.length;
}

async function populateStageTable(
  stage: string,
  collected: CollectedTableRows | undefined,
): Promise<number> {
  const statements = insertStatements(stage, collected);
  for (const batch of publicationStatementBatches(statements)) {
    await queryD1Batch(batch.map((sql) => ({ sql })));
  }
  return statements.length;
}

/** Bounds both statement count and SQL text so every D1 REST batch stays comfortably below 30 seconds. */
function publicationStatementBatches(statements: readonly string[]): string[][] {
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

/** Return collected source rows with shared score-table partitions isolated. */
function collectorRowsForSource(
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

function insertStatements(table: string, collected: CollectedTableRows | undefined): string[] {
  if (collected == null || collected.rows.length === 0) {
    return [];
  }
  const prefix = `INSERT INTO ${quoteIdentifier(table)} (${collected.columns.map(quoteIdentifier).join(", ")}) VALUES `;
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
      statements.push(`${prefix}${chunk.join(", ")};`);
      chunk = [];
      chunkLength = prefix.length;
    }
    chunk.push(valueSql);
    chunkLength += valueSql.length + 2;
  }
  if (chunk.length > 0) {
    statements.push(`${prefix}${chunk.join(", ")};`);
  }
  return statements;
}

function tableContentHash(rows: readonly Record<string, unknown>[]): string {
  return stableHash(rows.map(({ row_index, fetched_at_epoch_seconds, ...row }) => row));
}

function publicContentHash(payload: ModelAtlasPayload): string {
  return stableHash({
    models: payload.models,
    scoring: payload.metadata.scoring,
  });
}

function stableHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
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
