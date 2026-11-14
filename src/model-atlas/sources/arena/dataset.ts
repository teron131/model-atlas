/**
 * Arena leaderboard fallback snapshots from Arena's official Hugging Face dataset.
 *
 * Dataset source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
 */

import {
  isReasoningModeLabel,
  parseModelEffort,
  qualifierReasoningEffort,
} from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord } from "../../runtime";
import { fetchSourceJson } from "../request-scheduler";

const DATASET_URL = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset";
/** The datasets-server `rows` endpoint returns at most 100 rows per request. */
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
export async function fetchArenaDataset(config: "agent" | "webdev") {
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
    const page = asRecord(await fetchSourceJson(url));
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
  const dates = new Set(overall.map((row) => asNonEmptyString(row.leaderboard_publish_date)));
  if (dates.size !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test([...dates][0] ?? ""))
    throw new Error(`Inconsistent Arena ${config} publication dates`);
  return overall;
}

export function arenaBoardNames(rows: readonly Record<string, unknown>[]): ReadonlySet<string> {
  return new Set(rows.flatMap((row) => asNonEmptyString(row.model_name)?.toLowerCase() ?? []));
}

/**
 * Release and supported precision qualifiers stay in model identity; unknown labels cannot supply an assignment.
 * A hybrid model's thinking mode is its default variant, so an unqualified name the board also lists in thinking mode is the non-thinking mode.
 */
export function arenaDatasetIdentity(name: string, boardNames: ReadonlySet<string>) {
  // A trailing parenthesized list holds the qualifiers: Claude Opus 4.5 (thinking, 32k) → Claude Opus 4.5 with thinking and 32k.
  const suffix = /^(.*?)\s+\(([^()]+)\)$/.exec(name);
  let baseModel = suffix?.[1] ?? name;
  let reasoningEffort: string | null = null;
  let harness: string | null = null;
  let budget: string | null = null;
  let unknown = false;
  for (const qualifier of suffix?.[2]?.split(/,\s*/) ?? []) {
    const effort = qualifierReasoningEffort([qualifier]);
    if (effort != null) reasoningEffort = effort;
    else if (/^instant$/i.test(qualifier)) reasoningEffort = "none";
    else if (isReasoningModeLabel(qualifier)) continue;
    else if (/^[\w -]+ harness$/i.test(qualifier))
      // Terminus 2 harness → terminus-2-harness.
      harness = qualifier.toLowerCase().replace(/\s+/g, "-");
    else if (/^\d+k$/i.test(qualifier)) budget = qualifier.toLowerCase();
    // Qwen3 235B (2507) → Qwen3 235B-2507.
    else if (/^(?:\d{4,8}|NVFP4)$/i.test(qualifier)) baseModel += `-${qualifier}`;
    else unknown = true;
  }
  if (
    suffix == null &&
    ["thinking", "reasoning"].some((mode) => boardNames.has(`${name} (${mode})`.toLowerCase()))
  )
    reasoningEffort = "none";
  const parsed = parseModelEffort(baseModel);
  return {
    baseModel: parsed.baseModel,
    reasoningEffort: reasoningEffort ?? parsed.reasoningEffort,
    harness,
    budget,
    unknown,
  };
}
