/**
 * Vending-Bench 2 leaderboard results from Andon Labs.
 *
 * Page source: https://andonlabs.com/evals/vending-bench-2
 */

import { parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds } from "../../runtime";
import { findObjectEnd } from "../parsing";
import { fetchSource } from "../request-scheduler";

export const VENDING_BENCH_2_LEADERBOARD_URL = "https://andonlabs.com/evals/vending-bench-2";

const DEFAULT_TIMEOUT_MS = 30_000;

const ROUTE_NODE_PATTERN = /\/_app\/immutable\/nodes\/[^"'<>\s]+\.js/g;

const CHUNK_IMPORT_PATTERN = /from"(\.\.\/chunks\/[^"']+\.js)"/g;

const VB2_RUNS_MARKER = '"vb2":';

export type VendingBench2ModelScoreRow = {
  rank: number;
  model: string;
  base_model: string;
  reasoning_effort: string | null;
  run_count: number;
  final_balance_usd: number;
  daily_balance_usd: number[];
};

export type VendingBench2RowsByModelName = Map<string, VendingBench2ModelScoreRow>;

type VendingBench2Payload = {
  fetched_at_epoch_seconds: number | null;
  source_url?: string;
  data: VendingBench2ModelScoreRow[];
};

export async function getVendingBench2Stats(): Promise<VendingBench2Payload> {
  const pageHtml = await fetchText(VENDING_BENCH_2_LEADERBOARD_URL);
  const dataModule = await vendingDataModule(pageHtml, VENDING_BENCH_2_LEADERBOARD_URL);
  const data = dataModule == null ? [] : processVendingBench2DataModule(dataModule.text);
  return {
    fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null,
    source_url: dataModule?.url,
    data,
  };
}

/** Parse the official Svelte data module rather than the page's top-ten-only HTML table. */
function processVendingBench2DataModule(dataModule: string): VendingBench2ModelScoreRow[] {
  const markerIndex = dataModule.indexOf(VB2_RUNS_MARKER);
  if (markerIndex === -1) {
    return [];
  }
  const objectStart = markerIndex + VB2_RUNS_MARKER.length;
  const objectEnd = findObjectEnd(dataModule, objectStart);
  if (objectEnd === -1) {
    return [];
  }
  const rows: Omit<VendingBench2ModelScoreRow, "rank">[] = [];
  const runs = asRecord(JSON.parse(dataModule.slice(objectStart, objectEnd + 1)));
  for (const [model, value] of Object.entries(runs)) {
    const run = asRecord(value);
    const runCount = asFiniteNumber(run.num_epochs);
    const dailyBalanceUsd = Array.isArray(run.time_series)
      ? run.time_series.map(asFiniteNumber)
      : [];
    const finalBalanceUsd = asFiniteNumber(run.final_value);
    if (
      runCount == null ||
      !Number.isInteger(runCount) ||
      runCount <= 0 ||
      dailyBalanceUsd.length === 0 ||
      !dailyBalanceUsd.every((balance): balance is number => balance != null) ||
      finalBalanceUsd == null
    ) {
      continue;
    }
    const { baseModel, reasoningEffort } = parseModelEffort(model);
    rows.push({
      model,
      base_model: baseModel,
      reasoning_effort: reasoningEffort,
      run_count: runCount,
      final_balance_usd: finalBalanceUsd,
      daily_balance_usd: dailyBalanceUsd,
    });
  }
  return rows
    .sort((left, right) => right.final_balance_usd - left.final_balance_usd)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

async function fetchText(url: string): Promise<string> {
  return await fetchSource(url, {}, DEFAULT_TIMEOUT_MS, async (response) => {
    if (!response.ok) {
      throw new Error(`Vending-Bench 2 asset fetch failed: ${response.status}`);
    }
    return response.text();
  });
}

async function vendingDataModule(
  pageHtml: string,
  pageUrl: string,
): Promise<{ url: string; text: string } | null> {
  const routeModuleUrls = [
    ...new Set(
      [...pageHtml.matchAll(ROUTE_NODE_PATTERN)].map((match) => new URL(match[0], pageUrl).href),
    ),
  ];
  const routeModules = await Promise.all(
    routeModuleUrls.map(async (url) => ({
      url,
      text: await fetchText(url),
    })),
  );
  // Svelte route nodes are listed root-to-leaf, so inspect the leaf first and fall back through shared layouts.
  for (const routeModule of [...routeModules].reverse()) {
    const chunkUrls = [
      ...new Set(
        [...routeModule.text.matchAll(CHUNK_IMPORT_PATTERN)].map(
          (match) => new URL(match[1] ?? "", routeModule.url).href,
        ),
      ),
    ];
    const chunks = await Promise.all(
      chunkUrls.map(async (url) => ({
        url,
        text: await fetchText(url),
      })),
    );
    const dataModule = chunks.find((chunk) => chunk.text.includes(VB2_RUNS_MARKER));
    if (dataModule != null) {
      return dataModule;
    }
  }
  return null;
}
