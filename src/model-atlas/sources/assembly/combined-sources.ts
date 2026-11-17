/** Combine declared benchmark sources into derived observations for both live assembly and restored payloads, leaving raw evidence unchanged. */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import { BENCHMARK_RESOURCE_SOURCE_LABELS } from "../../benchmarks/resource-sources";
import { withClaudeFamily } from "../../identity/claude";
import { parseModelEffort } from "../../identity/normalization";
import { type AleBenchSourceRow, combineAleBenchRows } from "../ale-bench/leaderboard";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../artificial-analysis/benchmark-resources";
import {
  TERMINAL_BENCH_LEADERBOARD_URL,
  type TerminalBenchModelHarnessRow,
} from "../terminal-bench/leaderboard";
import { mergeWeirdMlRows } from "../weirdml";
import { crosswalkBenchmarkSources, type CrosswalkObservation } from "./crosswalk";

/** Only these derived observations enter combined matching and collapsed display. */
export function combinedBenchmarkObservations({
  terminalBenchRows: official,
  artificialAnalysisBenchmarkResourceRows: artificialAnalysisRows,
  terminalBenchScienceRows: science,
  gdpPdfRows: gdpPdf,
  aleBenchRows: ale,
  weirdMlRows: weird,
}: {
  terminalBenchRows: TerminalBenchModelHarnessRow[];
  artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
  terminalBenchScienceRows: BenchmarkObservationRow[];
  gdpPdfRows: BenchmarkObservationRow[];
  aleBenchRows: AleBenchSourceRow[];
  weirdMlRows: BenchmarkObservationRow[];
}): Record<string, CrosswalkObservation[]> {
  const officialRows: CrosswalkObservation[] = official.map((row) => ({
    benchmark_key: "terminal_bench",
    source_url: TERMINAL_BENCH_LEADERBOARD_URL,
    model_id: null,
    model: withClaudeFamily(row.model),
    base_model: withClaudeFamily(row.base_model),
    reasoning_effort: row.reasoning_effort,
    model_creator: null,
    rank: null,
    canonical_value: row.score,
    cost: row.cost_per_task_usd,
    seconds_per_task: row.seconds_per_task,
    tokens_per_task: row.tokens_per_task,
    output_tokens_per_task: row.output_tokens_per_task,
    observed_at: null,
    metadata: { harness: row.harness, time_measure: "wall" },
  }));
  const scienceRows: CrosswalkObservation[] = science.map((row) => ({
    ...row,
    model: withClaudeFamily(row.model),
    base_model: withClaudeFamily(
      row.metadata.source_series === "vals"
        ? row.base_model
        : parseModelEffort(row.model).baseModel,
    ),
    seconds_per_task:
      typeof row.metadata.seconds_per_task === "number" ? row.metadata.seconds_per_task : null,
    output_tokens_per_task:
      typeof row.metadata.output_tokens_per_task === "number"
        ? row.metadata.output_tokens_per_task
        : null,
  }));
  const officialScienceRows = scienceRows.filter((row) => row.metadata.source_series !== "vals");
  const valsScienceRows = scienceRows.filter((row) => row.metadata.source_series === "vals");
  // Retention can merge observations from separate fetches, so reconcile the complete evidence before the crosswalk.
  const weirdRows = mergeWeirdMlRows(
    weird.filter((row) => row.metadata.source_series === "creator"),
    weird.filter((row) => row.metadata.source_series === "epoch"),
  );
  return {
    ale_bench: combineAleBenchRows(ale),
    weirdml: crosswalkBenchmarkSources(
      [
        weirdRows.filter((row) => row.metadata.source_series === "creator"),
        weirdRows.filter((row) => row.metadata.source_series === "epoch"),
      ],
      { sourceLabels: ["Creator", "Epoch"] },
    ),
    gdp_pdf: crosswalkBenchmarkSources([gdpPdf, artificialAnalysisObservations("gdp_pdf")], {
      sourceLabels: ["Surge", "Artificial Analysis"],
    }),
    terminal_bench: crosswalkBenchmarkSources(
      [officialRows, artificialAnalysisObservations("terminal_bench")],
      {
        sourceLabels: Object.values(BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench),
        // The official board is the publisher's own, so it scores alone while Artificial Analysis has no rows on its version.
        firstAloneWithoutOthers: true,
      },
    ),
    terminal_bench_science: crosswalkBenchmarkSources(
      [
        officialScienceRows,
        valsScienceRows,
        artificialAnalysisObservations("terminal_bench_science"),
      ],
      { sourceLabels: Object.values(BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench_science) },
    ),
  };

  /** Artificial Analysis resource pages share the same quality, effort, and decode-time observation contract. */
  function artificialAnalysisObservations(key: string): CrosswalkObservation[] {
    return artificialAnalysisRows
      .filter((row) => row.benchmark_key === key)
      .map((row) => ({
        benchmark_key: row.benchmark_key,
        source_url: row.source_url,
        model_id: row.model_id,
        model: row.model,
        base_model: parseModelEffort(row.model).baseModel,
        reasoning_effort: row.reasoning_effort,
        model_creator: row.provider,
        rank: null,
        canonical_value: row.score,
        cost: row.cost_per_task_usd,
        seconds_per_task: row.seconds_per_task,
        tokens_per_task: row.tokens_per_task,
        output_tokens_per_task: row.output_tokens_per_task,
        observed_at: null,
        metadata: { time_measure: "decode" },
      }));
  }
}
