/**
 * Epoch Capabilities Index leaderboard results from Epoch AI.
 *
 * Page source: https://epoch.ai/benchmarks/eci?tab=leaderboard
 * CSV source: https://epoch.ai/data/eci_scores.csv
 * Benchmark evidence: https://epoch.ai/data/eci_benchmarks.csv
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { benchmarkModelEffort } from "../../identity/normalization";
import { asFiniteNumber, nowEpochSeconds } from "../../runtime";
import { parseCsvRecords } from "../parsing";
import { fetchSource } from "../request-scheduler";

const EPOCH_CAPABILITIES_INDEX_CSV_URL = "https://epoch.ai/data/eci_scores.csv";
const EPOCH_BENCHMARKS_CSV_URL = "https://epoch.ai/data/eci_benchmarks.csv";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function getEpochCapabilitiesIndexStats(
  sourceUrl = EPOCH_CAPABILITIES_INDEX_CSV_URL,
): Promise<BenchmarkObservationPayload> {
  try {
    const read = (url: string) =>
      fetchSource(url, {}, DEFAULT_TIMEOUT_MS, async (response) => {
        if (!response.ok)
          throw new Error(`Epoch Capabilities Index scrape failed: ${response.status}`);
        return response.text();
      });
    const [scores, benchmarks] = await Promise.all([
      read(sourceUrl),
      read(EPOCH_BENCHMARKS_CSV_URL),
    ]);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processEpochCapabilitiesIndexCsv(scores, sourceUrl, benchmarks),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

export function processEpochCapabilitiesIndexCsv(
  csv: string,
  sourceUrl = EPOCH_CAPABILITIES_INDEX_CSV_URL,
  benchmarksCsv = "",
): BenchmarkObservationRow[] {
  const evidence = epochBenchmarkEvidence(benchmarksCsv);
  return parseCsvRecords(csv).flatMap((row, index) => {
    const score = asFiniteNumber(row.eci);
    const model = row["Display name"] || row.Model || "";
    if (score == null || model.length === 0) return [];
    const parsed = benchmarkModelEffort(model);
    return [
      {
        benchmark_key: "epoch_capabilities_index",
        source_url: sourceUrl,
        model_id: row.Model || null,
        model,
        base_model: parsed.baseModel,
        reasoning_effort: parsed.reasoningEffort,
        model_creator: row.Organization || null,
        rank: index + 1,
        canonical_value: score,
        observed_at: row.date || null,
        metadata: {
          country: row["Country (of organization)"] || null,
          accessibility: row["Model accessibility"] || null,
          accessibility_group: row["Accessibility group"] || null,
          model_versions: row.model_versions || null,
          benchmark_count: evidence.get(row.Model ?? "")?.length ?? null,
          benchmarks: evidence.get(row.Model ?? "") ?? [],
        },
      },
    ];
  });
}

/** Count distinct fitted benchmarks for the exact published model group; zero results are evidence and duplicate runs are not extra breadth. */
function epochBenchmarkEvidence(csv: string): Map<string, string[]> {
  const evidence = new Map<string, Map<string, string>>();
  for (const row of parseCsvRecords(csv)) {
    if (
      !row.Model ||
      !row.benchmark_id ||
      !row.benchmark ||
      asFiniteNumber(row.performance) == null
    )
      continue;
    const benchmarks = evidence.get(row.Model) ?? new Map<string, string>();
    benchmarks.set(row.benchmark_id, row.benchmark);
    evidence.set(row.Model, benchmarks);
  }
  return new Map([...evidence].map(([model, benchmarks]) => [model, [...benchmarks.values()]]));
}
