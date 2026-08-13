/** Direct D1 refresh stages bounded writes and exposes the new public snapshot only after every table is ready. */

import { createHash, randomUUID } from "node:crypto";

import { readBenchmarkObservationRawCache } from "../../benchmarks/persistence/observation";
import { benchmarkSnapshotCachesFromRows } from "../../benchmarks/persistence/runtime";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
} from "../../benchmarks/registry";
import { BENCHMARK_VERSION_BASELINE_DATE, STAGE_CONFIG } from "../../config";
import {
  artificialAnalysisBenchmarkResourceRawCacheFromRows,
  artificialAnalysisRawCacheFromRows,
  modelsDevRawCacheFromRows,
  rawSourceCacheStatusFromRows,
  readOpenRouterRawCache,
} from "../../ingest/cache";
import type { CacheDbRow } from "../../ingest/cache/rows";
import {
  isBenchmarkObservationRawSource,
  RAW_SOURCE_NAMES,
  RAW_SOURCE_TABLES,
  type RawSourceName,
  SNAPSHOT_TABLES,
} from "../../ingest/source-registry";
import {
  refreshSourceSnapshots,
  type SourceSnapshotCaches,
} from "../../ingest/source-snapshots/load";
import {
  type OpenRouterRawCache,
  refreshOpenRouterRawPayload,
} from "../../ingest/source-snapshots/openrouter";
import { sourceRowStatesFromRows } from "../../ingest/source-snapshots/policy";
import type { RawSourceCacheStatus } from "../../ingest/types";
import { SnapshotRowCollector } from "../../ingest/writers";
import { nowEpochSeconds } from "../../runtime";
import { preserveHighSignalSnapshotModels } from "../../stats/payload/snapshot-preservation";
import type { ModelAtlasPayload } from "../../stats/types";
import { buildPayloadFromRows, buildPayloadRows, PAYLOAD_ROW_GROUPS } from "../payload-rows";
import { quoteIdentifier, type SchemaReconciliationPlan } from "../schema-reconciliation";
import {
  buildBenchmarkVersionLogRows,
  deriveDatabaseSnapshot,
  writeDatabaseSnapshotRows,
} from "../snapshot-workflow";
import {
  createD1Usage,
  d1Config,
  type D1Usage,
  ensureD1Schema,
  missingD1Environment,
  queryD1Batch,
  queryD1BatchRows,
  readD1Payload,
} from "./client";
import {
  appendRows,
  buildTableReplacementStatements,
  rawSourceRowsChanged,
  rawSourceRowsFromCollector,
  replaceStagedRows,
  tableRowsChanged,
  writeChangedRawSourceRows,
} from "./writes";

const REFRESH_STATE_TABLES = [
  SNAPSHOT_TABLES.source_quarantines,
  SNAPSHOT_TABLES.source_health,
  SNAPSHOT_TABLES.model_match_debug,
] as const;
const MODEL_TABLES = [
  SNAPSHOT_TABLES.models,
  SNAPSHOT_TABLES.model_benchmarks,
  SNAPSHOT_TABLES.model_task_metrics,
] as const;
const MAX_MATERIALIZED_PAYLOAD_BYTES = 1_900_000;
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
  d1_usage: D1Usage;
  timings_ms: D1PublishTimings;
};

type D1PublishTimings = {
  schema: number;
  lock: number;
  read_state: number;
  source_refresh: number;
  derivation: number;
  snapshot_assembly: number;
  d1_write: number;
  lock_release: number;
  total: number;
};

type D1RefreshState = {
  rawRows: Record<RawSourceName, CacheDbRow[]>;
  refreshStateRows: Record<(typeof REFRESH_STATE_TABLES)[number], CacheDbRow[]>;
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
  const publicationStartedAt = performance.now();
  const timings: D1PublishTimings = {
    schema: 0,
    lock: 0,
    read_state: 0,
    source_refresh: 0,
    derivation: 0,
    snapshot_assembly: 0,
    d1_write: 0,
    lock_release: 0,
    total: 0,
  };
  const config = d1Config();
  if (config == null) {
    throw new Error(
      `Cloudflare D1 is not configured. Missing ${missingD1Environment().join(", ")}.`,
    );
  }
  const usage = createD1Usage();
  let phaseStartedAt = performance.now();
  const schema = await ensureD1Schema(usage);
  timings.schema = elapsedMilliseconds(phaseStartedAt);
  phaseStartedAt = performance.now();
  const lockToken = await acquirePublicationLock(usage);
  timings.lock = elapsedMilliseconds(phaseStartedAt);
  try {
    return await publishLockedD1Snapshot(config.databaseId, schema, usage, timings);
  } finally {
    phaseStartedAt = performance.now();
    await releasePublicationLock(lockToken, usage);
    timings.lock_release = elapsedMilliseconds(phaseStartedAt);
    timings.total = elapsedMilliseconds(publicationStartedAt);
  }
}

/** Runs the refresh while one D1 owner controls table staging and the public payload flip. */
async function publishLockedD1Snapshot(
  databaseId: string,
  schema: SchemaReconciliationPlan,
  usage: D1Usage,
  timings: D1PublishTimings,
): Promise<D1Publication> {
  const startedAtEpochSeconds = nowEpochSeconds();
  const replaceSourceRows = process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1";
  let phaseStartedAt = performance.now();
  const current = await readD1RefreshState(startedAtEpochSeconds, usage);
  timings.read_state = elapsedMilliseconds(phaseStartedAt);
  phaseStartedAt = performance.now();
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
  timings.source_refresh = elapsedMilliseconds(phaseStartedAt);
  phaseStartedAt = performance.now();
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
  timings.derivation = elapsedMilliseconds(phaseStartedAt);
  phaseStartedAt = performance.now();
  let collector = collectDatabaseSnapshot(derived.rows);
  const previewPayload = payloadFromCollector(startedAtEpochSeconds, collector);
  let nextPayload = previewPayload;
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
    nextPayload = payloadFromCollector(startedAtEpochSeconds, collector);
  }
  const collectedRawRows = rawSourceRowsFromCollector(collector);
  const changedSources = RAW_SOURCE_NAMES.filter((source) =>
    rawSourceRowsChanged(collectedRawRows[source], current.rawRows[source]),
  );
  const modelsChanged =
    current.previousPayload == null ||
    stableHash(nextPayload.models) !== stableHash(current.previousPayload.models);
  timings.snapshot_assembly = elapsedMilliseconds(phaseStartedAt);
  if (
    schema.statements.length === 0 &&
    changedSources.length === 0 &&
    current.previousPayload != null &&
    !modelsChanged &&
    stableHash(nextPayload.metadata.scoring) ===
      stableHash(current.previousPayload.metadata.scoring)
  ) {
    const sourceHealthChanged = tableRowsChanged(
      collector.tables.get(SNAPSHOT_TABLES.source_health),
      current.refreshStateRows[SNAPSHOT_TABLES.source_health],
    );
    const payload = sourceHealthChanged
      ? {
          ...current.previousPayload,
          metadata: {
            ...current.previousPayload.metadata,
            source_health: derived.rows.sourceHealth,
          },
        }
      : current.previousPayload;
    const queries = sourceHealthChanged
      ? [
          ...buildTableReplacementStatements(
            SNAPSHOT_TABLES.source_health,
            collector.tables.get(SNAPSHOT_TABLES.source_health),
          ).map((sql) => ({ sql })),
          materializedPayloadQuery(payload),
        ]
      : [];
    phaseStartedAt = performance.now();
    await queryD1Batch(queries, usage);
    timings.d1_write = elapsedMilliseconds(phaseStartedAt);
    return {
      result: publishResult(databaseId, payload, false, [], queries.length, schema, usage, timings),
      payload,
    };
  }
  const completedAtEpochSeconds = nowEpochSeconds();
  const payload = payloadAtEpochSeconds(nextPayload, completedAtEpochSeconds);
  phaseStartedAt = performance.now();
  const statementCount = await publishChangedSnapshot(
    completedAtEpochSeconds,
    collector,
    collectedRawRows,
    changedSources,
    current,
    payload,
    modelsChanged,
    schema,
    usage,
  );
  timings.d1_write = elapsedMilliseconds(phaseStartedAt);
  return {
    result: publishResult(
      databaseId,
      payload,
      true,
      changedSources,
      statementCount,
      schema,
      usage,
      timings,
    ),
    payload,
  };
}

/** Claims the singleton publication owner, replacing only locks left stale by an interrupted run. */
async function acquirePublicationLock(usage: D1Usage): Promise<string> {
  const token = randomUUID();
  const acquiredAtEpochSeconds = nowEpochSeconds();
  const [, rows] = await queryD1BatchRows(
    [
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
    ],
    usage,
  );
  const lock = rows?.[0];
  if (lock?.owner_token !== token) {
    throw new Error(
      `Cloudflare D1 publication is already running (lock acquired at ${String(lock?.acquired_at_epoch_seconds ?? "unknown")})`,
    );
  }
  return token;
}

/** Releases only the lock owned by this invocation so a stale caller cannot unlock a newer run. */
async function releasePublicationLock(token: string, usage: D1Usage): Promise<void> {
  await queryD1Batch(
    [
      {
        sql: "DELETE FROM snapshot_publication_lock WHERE lock_key = 'public' AND owner_token = ?",
        params: [token],
      },
    ],
    usage,
  );
}

function publishResult(
  databaseId: string,
  payload: ModelAtlasPayload,
  published: boolean,
  changedSources: RawSourceName[],
  statementCount: number,
  schema: SchemaReconciliationPlan,
  usage: D1Usage,
  timings: D1PublishTimings,
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
    d1_usage: usage,
    timings_ms: timings,
  };
}

async function readD1RefreshState(
  checkedAtEpochSeconds: number,
  usage: D1Usage,
): Promise<D1RefreshState> {
  const [previousPayload, rawRows, refreshStateRows] = await Promise.all([
    readD1Payload(usage),
    readD1RawRows(usage),
    queryD1BatchRows(
      [
        {
          sql: "SELECT source, row_key, row_label, 'quarantined_missing_from_source' AS status, missing_from_source_since_epoch_seconds FROM source_quarantines ORDER BY source, row_key",
        },
        {
          sql: "SELECT * FROM source_health ORDER BY row_index",
        },
        {
          sql: "SELECT * FROM model_match_debug ORDER BY row_index",
        },
      ],
      usage,
    ),
  ]);
  const [previousQuarantineRows, previousHealthRows, previousMatchDebugRows] = refreshStateRows;
  const persistedStatuses = persistedSourceStatusesFromRows(previousHealthRows ?? []);
  return {
    rawRows,
    refreshStateRows: {
      [SNAPSHOT_TABLES.source_quarantines]: previousQuarantineRows ?? [],
      [SNAPSHOT_TABLES.source_health]: previousHealthRows ?? [],
      [SNAPSHOT_TABLES.model_match_debug]: previousMatchDebugRows ?? [],
    },
    sourceCaches: sourceCachesFromRows(rawRows),
    openRouterCache: readOpenRouterRawCache(rawRows.openrouter),
    statuses: Object.fromEntries(
      RAW_SOURCE_NAMES.map((source) => [
        source,
        rawSourceCacheStatusFromRows(
          source,
          rawRows[source],
          checkedAtEpochSeconds,
          persistedStatuses.get(source),
        ),
      ]),
    ) as Record<RawSourceName, RawSourceCacheStatus>,
    previousSourceRowStates: sourceRowStatesFromRows(previousQuarantineRows ?? []),
    previousPayload,
  };
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function persistedSourceStatusesFromRows(
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

async function readD1RawRows(usage: D1Usage): Promise<Record<RawSourceName, CacheDbRow[]>> {
  const directSources = RAW_SOURCE_NAMES.filter(
    (source) => !isBenchmarkObservationRawSource(source),
  );
  const rowGroups = await queryD1BatchRows(
    [
      ...directSources.map((source) => ({
        sql: `SELECT * FROM ${quoteIdentifier(RAW_SOURCE_TABLES[source])} ORDER BY row_index`,
      })),
      {
        sql: `SELECT * FROM ${quoteIdentifier(BENCHMARK_OBSERVATION_RAW_TABLE)} ORDER BY source_key, row_index`,
      },
    ],
    usage,
  );
  const directRows = new Map(
    directSources.map((source, index) => [source, rowGroups[index] ?? []] as const),
  );
  const sharedRows = rowGroups[directSources.length] ?? [];
  const sharedRowsBySource = new Map<string, CacheDbRow[]>();
  for (const row of sharedRows) {
    if (typeof row.source_key !== "string") {
      continue;
    }
    const sourceRows = sharedRowsBySource.get(row.source_key) ?? [];
    sourceRows.push(row);
    sharedRowsBySource.set(row.source_key, sourceRows);
  }
  return Object.fromEntries(
    RAW_SOURCE_NAMES.map((source) => [
      source,
      (isBenchmarkObservationRawSource(source)
        ? (sharedRowsBySource.get(source) ?? [])
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

function payloadFromCollector(
  fetchedAtEpochSeconds: number,
  collector: SnapshotRowCollector,
): ModelAtlasPayload {
  const recordsByTable = new Map<string, ReturnType<SnapshotRowCollector["records"]>>();
  const recordsBySourceByTable = new Map<
    string,
    Map<string, ReturnType<SnapshotRowCollector["records"]>>
  >();
  const recordsForTable = (table: string) => {
    const cached = recordsByTable.get(table);
    if (cached != null) {
      return cached;
    }
    const records = collector.records(table);
    recordsByTable.set(table, records);
    return records;
  };
  const recordsForSource = (table: string, source: string) => {
    let recordsBySource = recordsBySourceByTable.get(table);
    if (recordsBySource == null) {
      recordsBySource = new Map();
      for (const row of recordsForTable(table)) {
        if (typeof row.source_key !== "string") {
          continue;
        }
        const records = recordsBySource.get(row.source_key) ?? [];
        records.push(row);
        recordsBySource.set(row.source_key, records);
      }
      recordsBySourceByTable.set(table, recordsBySource);
    }
    return recordsBySource.get(source) ?? [];
  };
  return buildPayloadFromRows(
    buildPayloadRows(
      fetchedAtEpochSeconds,
      PAYLOAD_ROW_GROUPS.map(({ key, table, sourceKey }) => [
        key,
        sourceKey == null ? recordsForTable(table) : recordsForSource(table, sourceKey),
      ]),
    ),
  );
}

/** Retimestamp an assembled payload because payload construction uses this value only for snapshot and source-health generation times. */
function payloadAtEpochSeconds(
  payload: ModelAtlasPayload,
  fetchedAtEpochSeconds: number,
): ModelAtlasPayload {
  return {
    ...payload,
    fetched_at_epoch_seconds: fetchedAtEpochSeconds,
    metadata: {
      ...payload.metadata,
      ...(payload.metadata.source_health == null
        ? {}
        : {
            source_health: {
              ...payload.metadata.source_health,
              generated_at_epoch_seconds: fetchedAtEpochSeconds,
            },
          }),
    },
  };
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
  collectedRawRows: ReturnType<typeof rawSourceRowsFromCollector>,
  changedSources: RawSourceName[],
  current: D1RefreshState,
  payload: ModelAtlasPayload,
  modelsChanged: boolean,
  schema: SchemaReconciliationPlan,
  usage: D1Usage,
): Promise<number> {
  let statementCount = 0;
  for (const source of changedSources) {
    statementCount += await writeChangedRawSourceRows(
      source,
      collectedRawRows[source],
      current.rawRows[source],
      usage,
    );
  }
  for (const table of REFRESH_STATE_TABLES) {
    const collected = collector.tables.get(table);
    if (!tableRowsChanged(collected, current.refreshStateRows[table])) {
      continue;
    }
    statementCount += await replaceStagedRows(table, collected, table, usage);
  }
  const changedSchemaTables = new Set(schema.changedTables);
  if (modelsChanged || MODEL_TABLES.some((table) => changedSchemaTables.has(table))) {
    for (const table of MODEL_TABLES) {
      statementCount += await replaceStagedRows(table, collector.tables.get(table), table, usage);
    }
  }
  if (modelsChanged || changedSchemaTables.has(SNAPSHOT_TABLES.benchmark_version_log)) {
    statementCount += await appendRows(
      SNAPSHOT_TABLES.benchmark_version_log,
      collector.tables.get(SNAPSHOT_TABLES.benchmark_version_log),
      usage,
    );
  }
  const completionQueries = [
    { sql: "DELETE FROM snapshot_metadata;" },
    {
      sql: `INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (${completedAtEpochSeconds});`,
    },
    materializedPayloadQuery(payload),
  ];
  await queryD1Batch(completionQueries, usage);
  return statementCount + completionQueries.length;
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
