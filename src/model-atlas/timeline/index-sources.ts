/** Import published aggregate scores and their benchmark membership without backfilling component measurements. */
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { INDEX_SCORING_WEIGHT } from "../benchmarks/index-policy";
import type { BenchmarkObservationRow } from "../benchmarks/observation";
import { prepareArchiveAppend } from "../database/archive";
import { type JsonObject, stableJson } from "../runtime";
import { getArtificialAnalysisLeaderboardRawStats } from "../sources/artificial-analysis/leaderboard";
import { parseArtificialAnalysisReasoningEffort } from "../sources/artificial-analysis/model-labels";
import { getEpochCapabilitiesIndexStats } from "../sources/epoch/capabilities-index";
import { fetchSource } from "../sources/request-scheduler";
import {
  historicalReleaseName,
  historicalSourceModel,
  validHistoricalReleaseDate,
} from "./model-identity";
import type {
  HistoricalModel,
  HistoricalObservation,
  HistoricalPortfolio,
  HistoricalSourceRelease,
} from "./schemas";

const AA_URL = "https://artificialanalysis.ai/leaderboards/models";
const ECI_URL = "https://epoch.ai/data/eci_scores.csv";

export const AA_METHODOLOGY_URL =
  "https://artificialanalysis.ai/methodology/intelligence-benchmarking";

const AA_PORTFOLIOS = [
  {
    id: "2.0",
    labels: [
      "MMLU-Pro",
      "GPQA Diamond",
      "HLE",
      "MATH-500",
      "AIME 2024",
      "SciCode",
      "LiveCodeBench",
    ],
  },
  {
    id: "2.1",
    labels: ["MMLU-Pro", "GPQA Diamond", "HLE", "AIME 2025", "SciCode", "LiveCodeBench", "IFBench"],
  },
  {
    id: "2.2",
    labels: [
      "MMLU-Pro",
      "GPQA Diamond",
      "HLE",
      "AIME 2025",
      "SciCode",
      "LiveCodeBench",
      "IFBench",
      "AA-LCR",
    ],
  },
  {
    id: "3.0",
    labels: [
      "MMLU-Pro",
      "GPQA Diamond",
      "HLE",
      "AIME 2025",
      "SciCode",
      "LiveCodeBench",
      "IFBench",
      "AA-LCR",
      "Terminal-Bench Hard",
      "τ²-Telecom",
    ],
  },
  {
    id: "4.0",
    labels: [
      "GPQA Diamond",
      "HLE",
      "SciCode",
      "IFBench",
      "AA-LCR",
      "Terminal-Bench Hard",
      "τ²-Telecom",
      "GDPval-AA",
      "AA-Omniscience",
      "CritPt",
    ],
  },
  {
    id: "4.1",
    labels: [
      "GPQA Diamond",
      "HLE",
      "SciCode",
      "AA-LCR",
      "Terminal-Bench 2.1",
      "τ³-Banking",
      "GDPval-AA v2",
      "AA-Omniscience",
      "CritPt",
    ],
  },
  {
    id: "4.2",
    labels: [
      "HLE",
      "SciCode",
      "AA-LCR v1.1",
      "Terminal-Bench 2.1",
      "τ³-Banking",
      "GDPval-AA v2",
      "AA-Omniscience",
      "CritPt",
      "AA-Briefcase",
      "GDP.pdf",
    ],
  },
  {
    id: "4.3",
    labels: [
      "HLE",
      "SciCode",
      "AA-LCR v1.1",
      "Terminal-Bench 4.0",
      "AutomationBench-AA",
      "GDPval-AA v2",
      "AA-Omniscience",
      "CritPt",
      "AA-Briefcase",
      "GDP.pdf",
    ],
  },
  {
    id: "4.3.2",
    labels: [
      "HLE",
      "SciCode",
      "AA-LCR v1.1",
      "Terminal-Bench 4.0",
      "AutomationBench-AA",
      "GDPval-AA v2.1",
      "AA-Omniscience",
      "CritPt",
      "AA-Briefcase v1.1",
      "GDP.pdf",
    ],
  },
];

/** Fetch index values and membership metadata before committing immutable source releases; no component leaderboard bundle is downloaded. */
export async function refreshHistoricalIndexSources(db: DatabaseSync): Promise<void> {
  const capturedAt = new Date().toISOString();
  const [aa, methodology, epoch] = await Promise.all([
    getArtificialAnalysisLeaderboardRawStats(),
    fetchSource(AA_METHODOLOGY_URL, {}, 30_000, async (response) => {
      if (!response.ok) throw new Error(`AA methodology: HTTP ${response.status}`);
      return response.text();
    }),
    getEpochCapabilitiesIndexStats(),
  ]);
  if (!epoch.data.length || !aa.data.length)
    throw new Error("A publisher returned no index observations.");
  const version = /Intelligence Index v(\d+\.\d+(?:\.\d+)?)/.exec(methodology)?.[1];
  if (!version) throw new Error("AA did not identify its current index version.");
  const releases = [
    parseEpochTimeline(epoch.data, capturedAt),
    parseArtificialAnalysisTimeline(aa.data, capturedAt, version),
  ];
  releases[1]!.artifacts.push({ url: AA_METHODOLOGY_URL, sha256: digest(methodology) });
  db.exec("BEGIN");
  try {
    const append = prepareArchiveAppend(db);
    for (const release of releases) append("index_components", capturedAt, release, release.id);
    for (const [url, content] of [
      [ECI_URL, stableJson(epoch.data)],
      [AA_URL, stableJson(aa.data)],
      [AA_METHODOLOGY_URL, methodology],
    ]) {
      const sha256 = digest(content!);
      append(
        "index_source_artifact",
        capturedAt,
        {
          url,
          sha256,
          encoding: "base64",
          content: Buffer.from(content!).toString("base64"),
        },
        `artifact:${sha256}`,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Reuse the main ECI parser's exact model-group score, fitted count and membership; membership never becomes a task observation. */
export function parseEpochTimeline(
  rows: BenchmarkObservationRow[],
  capturedAt: string,
): HistoricalSourceRelease {
  const sha256 = digest(stableJson(rows));
  const id = "epoch:index:eci";
  const models = new Map<string, HistoricalModel>();
  const observations: HistoricalObservation[] = [];
  for (const row of rows) {
    if (row.canonical_value == null || !Number.isFinite(row.canonical_value)) continue;
    let model = historicalSourceModel(
      row.model,
      row.model_creator ?? "Unknown",
      row.reasoning_effort,
      row.observed_at,
    );
    // An ECI row is a publisher model group; its published group date is not necessarily the month retained in its display label.
    if (model.releaseDate && !validHistoricalReleaseDate(model))
      model = historicalSourceModel(
        historicalReleaseName(model.name, model.releaseDate),
        model.provider,
        model.effort,
        model.releaseDate,
      );
    models.set(model.id, model);
    const count = numberOrNull(row.metadata.benchmark_count);
    observations.push({
      modelId: model.id,
      benchmarkId: id,
      value: row.canonical_value,
      observedAt: capturedAt,
      source: row.source_url,
      ...(row.model_id ? { sourceModelVersion: row.model_id } : {}),
      sourceModelName: row.model,
      sourceReleaseDate: row.observed_at,
      ...(count != null && count > 0 ? { benchmarkCount: count } : {}),
      benchmarkNames: Array.isArray(row.metadata.benchmarks)
        ? row.metadata.benchmarks.filter((name): name is string => typeof name === "string")
        : [],
    });
  }
  return {
    id: `epoch:indexes-v3:${sha256}`,
    capturedAt,
    artifacts: [{ url: ECI_URL, sha256 }],
    models: [...models.values()],
    benchmarks: [
      {
        id,
        key: "epoch_capabilities_index",
        label: "Epoch Capabilities Index",
        kind: "index",
        scale: "linear",
        weights: { ...INDEX_SCORING_WEIGHT.dimensionLoadings },
      },
    ],
    observations,
    portfolios: [],
  };
}

/** Preserve measured AA aggregate scores and the published edition's basket, without importing its component columns. */
export function parseArtificialAnalysisTimeline(
  rows: JsonObject[],
  capturedAt: string,
  version: string,
): HistoricalSourceRelease {
  const portfolios = artificialAnalysisPortfolios();
  const portfolio = portfolios.find((p) => p.id === `aa:${version}`);
  if (!portfolio) throw new Error(`No benchmark membership is recorded for AA ${version}.`);
  const models = new Map<string, HistoricalModel>();
  const observations: HistoricalObservation[] = [];
  for (const row of rows) {
    const name = String(row.shortName || row.name || "");
    const index = numberOrNull(row.intelligenceIndex);
    if (
      !name ||
      row.intelligenceIndexIsEstimated !== false ||
      index == null ||
      index < 0 ||
      index > 100
    )
      continue;
    const model = historicalSourceModel(
      name,
      String(row.modelCreatorName || "Unknown"),
      parseArtificialAnalysisReasoningEffort(name),
      row.release_date,
    );
    models.set(model.id, model);
    observations.push({
      modelId: model.id,
      benchmarkId: `aa:index:${version}`,
      value: index,
      observedAt: capturedAt,
      source: AA_URL,
      sourceModelVersion: String(row.slug),
      sourceModelName: name,
      sourceReleaseDate:
        typeof (row.release_date ?? row.releaseDate) === "string"
          ? String(row.release_date ?? row.releaseDate)
          : null,
    });
  }
  const sha256 = digest(stableJson(rows));
  return {
    id: `aa:indexes-v2:${version}:${sha256}`,
    capturedAt,
    artifacts: [{ url: AA_URL, sha256 }],
    models: [...models.values()],
    benchmarks: [
      {
        id: `aa:index:${version}`,
        key: "aa_intelligence_index",
        label: `AA Intelligence Index v${version}`,
        kind: "index",
        scale: "linear",
        weights: { ...INDEX_SCORING_WEIGHT.dimensionLoadings },
        representedBenchmarks: portfolio.components.length,
        benchmarkNames: portfolio.components.map((c) => c.label),
      },
    ],
    observations,
    portfolios: [portfolio],
  };
}

/** Retain every named constituent even when its underlying measurements are unavailable. */
export function artificialAnalysisPortfolios(): HistoricalPortfolio[] {
  return AA_PORTFOLIOS.map(({ id, labels }) => ({
    id: `aa:${id}`,
    label: `Artificial Analysis v${id}`,
    source: AA_METHODOLOGY_URL,
    components: labels.map((label) => ({ label, benchmarkId: null })),
    note: "Published index membership for benchmark-count and overlap checks; component measurements are not imported or reconstructed.",
  }));
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
