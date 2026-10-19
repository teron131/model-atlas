/**
 * Arena leaderboard fallback snapshots from Arena's official Hugging Face dataset.
 *
 * Dataset source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
 */

import { benchmarkModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asRecord, stringValue } from "../../runtime";
import { fetchSource } from "../request-scheduler";

const DATASET_URL = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset";
const PAGE_SIZE = 100;
export const ARENA_AGENT_DATASET_URL = `${DATASET_URL}/viewer/agent/latest`;
export const ARENA_WEBDEV_DATASET_URL = `${DATASET_URL}/viewer/webdev/latest`;

type PublicationRow = { source_url: string; observed_at: string | null };

/** A successful fallback download must not downgrade a newer publication or replace the same day's website evidence. */
export function arenaRefreshIsCurrent(
  cachedRows: readonly PublicationRow[],
  fetchedRows: readonly PublicationRow[],
): boolean {
  const cachedDates = cachedRows.flatMap((row) =>
    row.observed_at == null ? [] : [row.observed_at],
  );
  const newestCached = cachedDates.sort().at(-1);
  if (newestCached == null) return true;
  if (fetchedRows.some((row) => row.observed_at == null || row.observed_at < newestCached))
    return false;
  const cachedWebsite = cachedRows.some(
    (row) => row.observed_at === newestCached && !isDatasetUrl(row.source_url),
  );
  return (
    !cachedWebsite ||
    !fetchedRows.some((row) => row.observed_at === newestCached && isDatasetUrl(row.source_url))
  );
}

function isDatasetUrl(url: string): boolean {
  return url === ARENA_AGENT_DATASET_URL || url === ARENA_WEBDEV_DATASET_URL;
}

/** Require complete, untruncated pages and a single explicit publication date before using the fallback. */
export async function fetchArenaDataset(config: "agent" | "webdev", timeoutMs = 30_000) {
  const rows: Record<string, unknown>[] = [];
  let total: number | null = null;
  while (total == null || rows.length < total) {
    const url = new URL("https://datasets-server.huggingface.co/rows");
    url.search = new URLSearchParams({
      dataset: "lmarena-ai/leaderboard-dataset",
      config,
      split: "latest",
      offset: String(rows.length),
      length: String(PAGE_SIZE),
    }).toString();
    const page = await fetchSource(url, {}, timeoutMs, async (response) => {
      if (!response.ok) throw new Error(`Arena ${config} dataset failed: ${response.status}`);
      return asRecord(await response.json());
    });
    const count = asFiniteNumber(page.num_rows_total);
    if (
      page.partial !== false ||
      count == null ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 10_000 ||
      (total != null && count !== total) ||
      !Array.isArray(page.rows) ||
      page.rows.length === 0
    )
      throw new Error(`Incomplete Arena ${config} dataset`);
    total = count;
    for (const [index, value] of page.rows.entries()) {
      const entry = asRecord(value);
      if (
        entry.row_idx !== rows.length ||
        !Array.isArray(entry.truncated_cells) ||
        entry.truncated_cells.length !== 0 ||
        entry.row == null ||
        index >= PAGE_SIZE
      )
        throw new Error(`Invalid Arena ${config} dataset page`);
      rows.push(asRecord(entry.row));
    }
    if (rows.length > total) throw new Error(`Oversized Arena ${config} dataset page`);
  }
  const overall = rows.filter((row) => row.category === "overall");
  const dates = new Set(overall.map((row) => stringValue(row.leaderboard_publish_date)));
  if (dates.size !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test([...dates][0] ?? ""))
    throw new Error(`Inconsistent Arena ${config} publication dates`);
  return overall;
}

/** Interpret only disclosed effort, harness, budget, and release qualifiers; unknown labels cannot supply an assignment. */
export function arenaDatasetIdentity(name: string) {
  const suffix = /^(.*?)\s+\(([^()]+)\)$/.exec(name);
  let baseModel = suffix?.[1] ?? name;
  let reasoningEffort: string | null = null;
  let harness: string | null = null;
  let budget: string | null = null;
  let unknown = false;
  for (const qualifier of suffix?.[2]?.split(/,\s*/) ?? []) {
    if (/^(none|minimal|low|medium|high|xhigh|max)$/i.test(qualifier))
      reasoningEffort = qualifier.toLowerCase();
    else if (/^(non-thinking|instant)$/i.test(qualifier)) reasoningEffort = "none";
    else if (/^(thinking|reasoning)$/i.test(qualifier)) reasoningEffort = "thinking";
    else if (/^[\w -]+ harness$/i.test(qualifier))
      harness = qualifier.toLowerCase().replace(/\s+/g, "-");
    else if (/^\d+k$/i.test(qualifier)) budget = qualifier.toLowerCase();
    else if (/^\d{4,8}$/.test(qualifier)) baseModel += `-${qualifier}`;
    else unknown = true;
  }
  const parsed = benchmarkModelEffort(baseModel);
  return {
    baseModel: parsed.baseModel,
    reasoningEffort: reasoningEffort ?? parsed.reasoningEffort,
    harness,
    budget,
    unknown,
  };
}
