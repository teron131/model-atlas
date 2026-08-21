/**
 * PerceptionBench leaderboard results from Moonshot AI's published README.
 *
 * Page source: https://github.com/MoonshotAI/PerceptionBench
 * Markdown source: https://raw.githubusercontent.com/MoonshotAI/PerceptionBench/master/README.md
 */

import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import {
  canonicalReasoningEffort,
  modelNameWithoutCreatorPrefix,
} from "../../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { percentToUnitScore } from "../parsing";

const PERCEPTION_BENCH_README_URL =
  "https://raw.githubusercontent.com/MoonshotAI/PerceptionBench/master/README.md";

const DEFAULT_TIMEOUT_MS = 30_000;
const TABLE_HEADER =
  "| # | Model | Overall | VRel | Count | Attr | Depth | Loc | Comp | FGR | Ctx | OCR | Hallu |";
const MODEL_CREATORS: Readonly<Record<string, string>> = {
  "Claude-Fable-5": "Anthropic",
  "Claude-Opus-4.8": "Anthropic",
  "Gemini-3.1-Pro": "Google",
  "Gemini-3.5-Flash": "Google",
  "Gemma-4-31B": "Google",
  "GLM-4.6V": "Zhipu",
  "GLM-5V-Turbo": "Zhipu",
  "GPT-5.5": "OpenAI",
  "GPT-5.6-Sol": "OpenAI",
  "Grok-4.5": "xAI",
  "Kimi K2.6": "Moonshot",
  "Kimi K3": "Moonshot",
  "Minimax-M3": "MiniMax",
  "Qwen3.5-397B-A17B": "Alibaba",
  "Qwen3.7-Plus": "Alibaba",
  "Seed-2.1-Pro": "ByteDance",
};
const MODEL_EFFORTS: Readonly<Record<string, string>> = {
  "Claude-Fable-5": "max",
  "Claude-Opus-4.8": "max",
  "Gemini-3.1-Pro": "high",
  "Gemini-3.5-Flash": "high",
  "GPT-5.5": "xhigh",
  "GPT-5.6-Sol": "max",
  "Kimi K3": "max",
  "Seed-2.1-Pro": "high",
};

function markdownCells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function finitePercent(value: string): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 100
    ? numericValue
    : null;
}

/** Parse the official Markdown leaderboard and reject malformed or partial result rows. */
export function processPerceptionBenchReadme(
  readme: string,
  sourceUrl = PERCEPTION_BENCH_README_URL,
): BenchmarkObservationRow[] {
  const lines = readme.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() === TABLE_HEADER);
  if (headerIndex === -1) return [];

  const rows: BenchmarkObservationRow[] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break;
    const cells = markdownCells(line);
    if (cells.length !== 13) continue;

    const rank = Number(cells[0]);
    const model = cells[1] ?? "";
    const overall = finitePercent(cells[2] ?? "");
    if (!Number.isInteger(rank) || rank < 1 || model.length === 0 || overall == null) {
      continue;
    }
    const canonicalValue = percentToUnitScore(String(overall));
    const creator = MODEL_CREATORS[model] ?? null;
    if (canonicalValue == null) continue;

    const metadata: BenchmarkObservationMetadata = {};
    if (model === "Claude-Fable-5") {
      metadata.fallback_model = "Claude-Opus-4.8";
      metadata.fallback_share_percent = 1.1;
    }
    if (model === "Gemma-4-31B") metadata.thinking_enabled = true;

    rows.push({
      benchmark_key: "perception_bench",
      source_url: sourceUrl,
      model_id: null,
      model,
      base_model: modelNameWithoutCreatorPrefix(model, creator),
      reasoning_effort: canonicalReasoningEffort(MODEL_EFFORTS[model]),
      model_creator: creator,
      rank,
      canonical_value: canonicalValue,
      observed_at: null,
      metadata,
    });
  }
  return rows;
}

/** Fetch the current creator-owned PerceptionBench leaderboard without mutating persisted data. */
export async function getPerceptionBenchStats(
  sourceUrl = PERCEPTION_BENCH_README_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(sourceUrl, {}, timeoutMs);
    if (!response.ok) throw new Error(`PerceptionBench scrape failed: ${response.status}`);
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processPerceptionBenchReadme(await response.text(), sourceUrl),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
