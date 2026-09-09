/** Adapt shared Mercor Loop observations to APEX-Agents' existing persisted row contract. */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import { getMercorStats, processMercorPageHtml } from "../mercor";
import { stringValue } from "../parsing";

export const DEFAULT_LEADERBOARD_URL = "https://www.mercor.com/apex/apex-agents-leaderboard/";

const SOURCE = {
  sourceUrl: DEFAULT_LEADERBOARD_URL,
  harness: "loop_truncated_tools_agent",
} as const;

export type MercorApexAgentsRow = {
  model_id: string;
  source_model: string;
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  organization: string;
  score: number;
};

export type MercorApexAgentsRowsByModelName = Map<string, MercorApexAgentsRow>;

/** Keep refresh options and cache rows stable while sharing Mercor extraction and identity handling. */
export async function getMercorApexAgentsStats(options: { url?: string; timeoutMs?: number } = {}) {
  const payload = await getMercorStats(
    "apex_agents",
    { ...SOURCE, sourceUrl: options.url ?? SOURCE.sourceUrl },
    options.timeoutMs,
  );
  const data = apexRows(payload.data);
  return {
    fetched_at_epoch_seconds: data.length > 0 ? payload.fetched_at_epoch_seconds : null,
    data,
  };
}

export function processMercorApexAgentsPageHtml(html: string): MercorApexAgentsRow[] {
  return apexRows(processMercorPageHtml(html, "apex_agents", SOURCE));
}

function apexRows(rows: readonly BenchmarkObservationRow[]): MercorApexAgentsRow[] {
  return rows.flatMap((row) => {
    const sourceModel = stringValue(row.metadata.source_model);
    if (row.model_id == null || row.model_creator == null || sourceModel == null) return [];
    return [
      {
        model_id: row.model_id,
        source_model: sourceModel,
        model: row.model,
        base_model: row.base_model,
        reasoning_effort: row.reasoning_effort,
        organization: row.model_creator,
        score: row.canonical_value,
      },
    ];
  });
}
