/** Import immutable AA leaderboard captures with observed legacy scores, explicit snapshot units, and publisher-qualified model identities. */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { INDEX_SCORING_WEIGHT } from "../benchmarks/index-policy";
import { prepareArchiveAppend, readArchivedRecord } from "../database/archive";
import { versionDate } from "../identity/releases";
import { asRecord, type JsonObject } from "../runtime";
import { parseArtificialAnalysisReasoningEffort } from "../sources/artificial-analysis/model-labels";
import { extractNextFlightCorpus, findObjectEnd, parseFlightJsonObject } from "../sources/parsing";
import { fetchSource } from "../sources/request-scheduler";
import { AA_METHODOLOGY_URL, artificialAnalysisPortfolios } from "./index-sources";
import {
  historicalNameKey,
  historicalReleaseName,
  historicalSourceModel,
  historicalVersionSeries,
} from "./model-identity";
import type {
  HistoricalBenchmark,
  HistoricalModel,
  HistoricalObservation,
  HistoricalSourceRelease,
} from "./schemas";

// Version periods follow AA's published changelog; capture identities also separate undocumented patch or grader revisions.
export const AA_HISTORY_SNAPSHOTS = [
  {
    timestamp: "20250101082016",
    version: "1.x",
    sha256: "2969ea4763722d3d9042cf125710b74c1eeddb14d2c92cd0c965f743a0e12339",
  },
  {
    timestamp: "20250302071507",
    version: "2.0",
    sha256: "06d52d27ac6ee59add585e9e0fc9bbd6226277c62cc50bf471c75b5ecbef6953",
  },
  {
    timestamp: "20250804080828",
    version: "2.0",
    sha256: "a8a9b86662263fc116f2b4f2753499b15260ee33a649c68675711f579c8eeffe",
  },
  {
    timestamp: "20250805101932",
    version: "2.1",
    sha256: "70c9cf6c5ad6fe0ffd9a9be6fa64f04b9d49ae9e04871eb7d01bd3ec0b16db2e",
  },
  {
    timestamp: "20250807171948",
    version: "2.2",
    sha256: "ca5522a7822e831b845f161d851fdd14f6614386643546550e54c25d29e72f80",
  },
  {
    timestamp: "20251001204842",
    version: "3.0",
    sha256: "0512ccdc7fc610383f3c6229df1c7090dc17d4ea037f7dc09c456b3360d71d57",
  },
  {
    timestamp: "20260205184229",
    version: "4.0",
    sha256: "1c3a74541a02890f9240198d54f0c32cfef0801c898d7787105566f0abd1b959",
  },
  {
    timestamp: "20260701120956",
    version: "4.1",
    sha256: "8a663f0a3e506112992a50bde9bc7d8695ed65206f4199d85b2a96c844a7fc92",
  },
  {
    timestamp: "20260901032805",
    version: "4.1.1",
    sha256: "a6bc3ca32e92f6d40b3bf86fa7abf6b8118dd5b33ea69e968c684d0f4a551a96",
  },
  {
    timestamp: "20260905154805",
    version: "4.2",
    sha256: "434541dda15f31d97d30eb111c83a6888c5ab345104205c1af8e8e8c9f20735a",
  },
] as const;
type Capture = { timestamp: string; version: string };
const ORIGIN = "https://artificialanalysis.ai/leaderboards/models";
/** Fetch and validate every fixed capture before writing a transaction; replay reuses content-hashed local evidence. */
export async function importArtificialAnalysisHistory(
  db: DatabaseSync,
): Promise<HistoricalSourceRelease[]> {
  const directory = resolve(".cache/aa-history");
  await mkdir(directory, { recursive: true });
  const captures: { release: HistoricalSourceRelease; html: string }[] = [];
  for (const capture of AA_HISTORY_SNAPSHOTS) {
    const path = resolve(directory, `${capture.timestamp}.html`);
    let html: string;
    try {
      html = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const artifact = readArchivedRecord(
        db,
        "index_source_artifact",
        `artifact:${capture.sha256}`,
      );
      if (artifact) {
        if (artifact.encoding !== "base64" || typeof artifact.content !== "string")
          throw new Error(`Invalid retained AA artifact ${capture.timestamp}`);
        html = Buffer.from(artifact.content, "base64").toString("utf8");
      } else {
        html = await fetchSource(archiveUrl(capture), {}, 60_000, async (response) => {
          if (!response.ok)
            throw new Error(`AA archive ${capture.timestamp}: HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          return (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString(
            "utf8",
          );
        });
      }
      if (hash(html) !== capture.sha256)
        throw new Error(
          `AA archive ${capture.timestamp} changed; inspect its source before accepting new bytes.`,
        );
      await writeFile(path, html);
    }
    if (hash(html) !== capture.sha256)
      throw new Error(`AA archive ${capture.timestamp} failed its content check.`);
    captures.push({ release: parseArtificialAnalysisHistory(html, capture), html });
  }
  db.exec("BEGIN");
  try {
    const append = prepareArchiveAppend(db);
    for (const { release, html } of captures) {
      append("index_components", release.capturedAt, release, release.id);
      const artifact = release.artifacts[0]!;
      append(
        "index_source_artifact",
        release.capturedAt,
        {
          ...artifact,
          origin: ORIGIN,
          encoding: "base64",
          content: Buffer.from(html).toString("base64"),
        },
        `artifact:${artifact.sha256}`,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return captures.map(({ release }) => release);
}

/** Keep capture-specific measurement units while sharing series keys for query deduplication; only observed values may train cross-era links. */
export function parseArtificialAnalysisHistory(
  html: string,
  capture: Capture,
): HistoricalSourceRelease {
  if (!/^\d{14}$/.test(capture.timestamp))
    throw new Error("An AA historical capture needs its full archive timestamp.");
  const capturedAt = `${capture.timestamp.slice(0, 4)}-${capture.timestamp.slice(4, 6)}-${capture.timestamp.slice(6, 8)}T${capture.timestamp.slice(8, 10)}:${capture.timestamp.slice(10, 12)}:${capture.timestamp.slice(12)}.000Z`;
  const prefix = `aa:archive:${capture.timestamp}`;
  const corpus = extractNextFlightCorpus(html);
  const quality = capture.version === "1.x";
  const key = quality
    ? "quality_index_aa"
    : corpus.includes('"intelligenceIndex":')
      ? "intelligenceIndex"
      : "intelligence_index";
  const rows = extractRows(corpus, key);
  if (!rows.length)
    throw new Error(`AA archive ${capture.timestamp} has no recognizable model rows.`);
  const portfolioVersion = capture.version.split(".").slice(0, 2).join(".");
  const membership = new Set(
    quality
      ? ["MMLU", "GPQA Diamond", "MATH-500", "HumanEval"]
      : artificialAnalysisPortfolios()
          .find((p) => p.id === `aa:${portfolioVersion}`)
          ?.components.map((c) => c.label),
  );
  const benchmarks = new Map<string, HistoricalBenchmark>();
  const models = new Map<string, HistoricalModel>();
  const observations: HistoricalObservation[] = [];
  const identities = rows.map(archiveModel);
  const identityCounts = new Map<string, number>();
  for (const model of identities)
    identityCounts.set(model.id, (identityCounts.get(model.id) ?? 0) + 1);
  for (const [index, row] of rows.entries()) {
    if (row.deleted === true) continue;
    const name = String(row.name ?? row.shortName ?? row.short_name);
    // The January page explicitly identifies the o1 family's numbers as preliminary OpenAI claims, including component values.
    if (quality && /^o1(?:\b|-)/i.test(name)) continue;
    const identity = identities[index]!;
    const model =
      identityCounts.get(identity.id)! > 1
        ? { ...identity, id: `aa-model:${row.id}::${identity.effort ?? "unknown"}` }
        : identity;
    models.set(model.id, model);
    const sourceModelVersion = String(row.slug ?? row.id);
    const score = finite(row[key]);
    const estimated = row.intelligenceIndexIsEstimated ?? row.intelligence_index_is_estimated;
    const measured =
      quality ||
      estimated === false ||
      (estimated == null && row.estimated_intelligence_index == null);
    if (measured && score != null && score >= 0 && score <= 100)
      observations.push({
        modelId: model.id,
        benchmarkId: `${prefix}:index`,
        value: score,
        rawValue: score,
        observedAt: capturedAt,
        source: archiveUrl(capture),
        sourceModelVersion,
        sourceModelName: name,
        sourceReleaseDate:
          typeof (row.releaseDate ?? row.release_date) === "string"
            ? String(row.releaseDate ?? row.release_date)
            : null,
        ...(archiveSnapshot(row, identity.name)
          ? { sourceSnapshot: archiveSnapshot(row, identity.name)!.version }
          : {}),
      });
  }
  benchmarks.set(`${prefix}:index`, {
    id: `${prefix}:index`,
    key: quality ? "aa_quality_index" : "aa_intelligence_index",
    label: `AA ${quality ? "Quality" : "Intelligence"} Index ${capture.version} (${capturedAt.slice(0, 10)})`,
    kind: "index",
    scale: "linear",
    weights: { ...INDEX_SCORING_WEIGHT.dimensionLoadings },
    representedBenchmarks: membership.size,
    benchmarkNames: [...membership],
    normalization: `Publisher index points; fixed AA capture ${capture.timestamp}`,
  });
  if (!observations.some((o) => o.benchmarkId === `${prefix}:index`))
    throw new Error(`AA archive ${capture.timestamp} has no qualified observed index scores.`);
  return {
    id: `aa:historical-indexes-v2:${capture.timestamp}:${hash(html)}`,
    capturedAt,
    artifacts: [{ url: archiveUrl(capture), sha256: hash(html) }],
    models: [...models.values()],
    benchmarks: [...benchmarks.values()],
    observations,
    portfolios: [
      {
        id: prefix,
        label: `AA ${capture.version} observed data (${capturedAt.slice(0, 10)})`,
        source: archiveUrl(capture),
        components: [...membership].map((label) => ({ label, benchmarkId: null })),
        note: `Only observed aggregate scores are imported. Index membership follows ${AA_METHODOLOGY_URL}; membership provides breadth and overlap metadata, not component measurements. Publisher estimates are excluded. Snapshot units remain distinct across captures.`,
      },
    ],
  };
}

/** Normalize dated labels and AA's older Claude word order, while retaining explicit effort and independently published configurations. */
function archiveModel(row: JsonObject): HistoricalModel {
  const name = String(row.name ?? row.shortName ?? row.short_name);
  const canonicalName = name
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+['’](\d{2})\b/g, "$1 20$2")
    .replace(/^Claude (4(?:\.\d+)?) (Opus|Sonnet)\b/, "Claude $2 $1");
  const creator = asRecord(row.model_creators ?? row.creator);
  const snapshot = archiveSnapshot(row, canonicalName);
  return historicalSourceModel(
    snapshot ? historicalReleaseName(canonicalName, snapshot.date) : canonicalName,
    String(row.modelCreatorName ?? creator.name ?? "Unknown"),
    parseArtificialAnalysisReasoningEffort(name) ?? (/\bstandard\b/i.test(name) ? "none" : null),
    snapshot?.date ?? row.releaseDate ?? row.release_date,
  );
}

/** Require corroborating dated model metadata, or the publisher's explicit API model field; a page slug or family launch date alone cannot identify a snapshot. */
function archiveSnapshot(row: JsonObject, name: string): { version: string; date: string } | null {
  const identity = historicalVersionSeries(historicalSourceModel(name, "", null, null));
  const baseName = name.replace(/\([^)]*\)/g, "").trim();
  const versions = [
    row.openai_full_model_name,
    row.chatbot_arena_label,
    ...(Array.isArray(row.host_models)
      ? row.host_models.map((host) => asRecord(host).host_api_id)
      : []),
  ];
  const candidates = versions.flatMap((value) => {
    if (typeof value !== "string") return [];
    const date = versionDate(value);
    const prefix = value.replace(/[-_]?20\d{2}-?\d{2}-?\d{2}.*$/, "");
    return date && historicalNameKey(prefix) === historicalNameKey(baseName)
      ? [{ version: value, date }]
      : [];
  });
  if (!candidates.length || new Set(candidates.map((c) => c.date)).size !== 1) return null;
  const snapshot = candidates[0]!;
  if (identity.period && !snapshot.date.startsWith(identity.period)) return null;
  if (
    new Set(candidates.map((c) => c.version)).size < 2 &&
    row.openai_full_model_name !== snapshot.version
  )
    return null;
  return snapshot;
}

/** Archived schemas carry snake-case rows, modern schemas camel-case rows; conflicting duplicate source records must not be chosen by page order. */
function extractRows(corpus: string, key: string): JsonObject[] {
  const rows = new Map<string, JsonObject>();
  let cursor = -1;
  while ((cursor = corpus.indexOf(`"${key}":`, cursor + 1)) >= 0) {
    for (let start = cursor; start >= Math.max(0, cursor - 20_000); start--) {
      if (corpus[start] !== "{") continue;
      const end = findObjectEnd(corpus, start);
      if (end < cursor) continue;
      const row = parseFlightJsonObject(corpus.slice(start, end + 1));
      if (!row || typeof row.id !== "string" || !(row.name || row.shortName) || !(key in row))
        continue;
      // A model may repeat with different provider/resource details; only its score and identity fields belong to this importer.
      const previous = rows.get(row.id);
      const previousFlag =
        previous?.intelligenceIndexIsEstimated ?? previous?.intelligence_index_is_estimated;
      const flag = row.intelligenceIndexIsEstimated ?? row.intelligence_index_is_estimated;
      // AA includes both database rows and display projections that replace a missing index with an explicitly marked estimate.
      if (previous && typeof previousFlag === "boolean" && typeof flag !== "boolean") break;
      if (previous && typeof previousFlag === typeof flag && previous[key] !== row[key])
        throw new Error(`Conflicting archived AA score for ${row.id}`);
      rows.set(
        row.id,
        previous && previous[key] === row[key]
          ? { ...previous, ...row, host_models: row.host_models ?? previous.host_models ?? null }
          : row,
      );
      break;
    }
  }
  return [...rows.values()];
}

function archiveUrl(capture: Capture): string {
  return `https://web.archive.org/web/${capture.timestamp}id_/${ORIGIN}`;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
