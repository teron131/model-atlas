/**
 * Epoch Capabilities Index leaderboard results from Epoch AI.
 *
 * Page source: https://epoch.ai/benchmarks/eci?tab=leaderboard
 * CSV source: https://epoch.ai/data/eci_scores.csv
 */

import type {
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../../benchmarks/observation";
import { benchmarkModelEffort } from "../../../identity/normalization";
import { asFiniteNumber, fetchWithTimeout, nowEpochSeconds } from "../../../runtime";
import { parseCsvRecords } from "../../parsing";

const EPOCH_CAPABILITIES_INDEX_CSV_URL = "https://epoch.ai/data/eci_scores.csv";
const DEFAULT_TIMEOUT_MS = 30_000;

export function processEpochCapabilitiesIndexCsv(
  csv: string,
  sourceUrl = EPOCH_CAPABILITIES_INDEX_CSV_URL,
): BenchmarkObservationRow[] {
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
        },
      },
    ];
  });
}

export async function getEpochCapabilitiesIndexStats(
  sourceUrl = EPOCH_CAPABILITIES_INDEX_CSV_URL,
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(sourceUrl, {}, DEFAULT_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Epoch Capabilities Index scrape failed: ${response.status}`);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processEpochCapabilitiesIndexCsv(await response.text(), sourceUrl),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
