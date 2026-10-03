/** Fuse independent benchmark sources into derived observations for both live assembly and restored payloads, leaving raw evidence unchanged. */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import { BENCHMARK_RESOURCE_SOURCE_LABELS } from "../../benchmarks/resource-sources";
import {
  crosswalkBenchmarkSources,
  type CrosswalkObservation,
  crosswalkThreeBenchmarkSources,
} from "../../benchmarks/sources-crosswalk";
import { benchmarkModelEffort } from "../../identity/normalization";
import { type AleBenchSourceRow, fuseAleBenchRows } from "../ale-bench/leaderboard";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../artificial-analysis/benchmark-resources";
import type { TerminalBench4ModelAgentRow } from "../terminal-bench-4/leaderboard";

/** Raw source arrays remain unchanged; only these derived observations enter fused matching and collapsed display. */
export function fusedBenchmarkObservations({
  terminalBench4Rows: official,
  artificialAnalysisBenchmarkResourceRows: aa,
  terminalBenchScienceRows: science,
  gdpPdfRows: gdpPdf,
  aleBenchConfigurationRows: ale,
  weirdMlRows: weird,
}: {
  terminalBench4Rows: TerminalBench4ModelAgentRow[];
  artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
  terminalBenchScienceRows: BenchmarkObservationRow[];
  gdpPdfRows: BenchmarkObservationRow[];
  aleBenchConfigurationRows: AleBenchSourceRow[];
  weirdMlRows: BenchmarkObservationRow[];
}): Record<string, CrosswalkObservation[]> {
  const officialRows: CrosswalkObservation[] = official.map((row) => ({
    benchmark_key: "terminal_bench_4",
    source_url: "https://www.tbench.ai/?version=4.0",
    model_id: null,
    model: claudeName(row.model),
    base_model: claudeName(row.base_model),
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
    model: claudeName(row.model),
    base_model: claudeName(
      row.metadata.source_series === "vals"
        ? row.base_model
        : benchmarkModelEffort(row.model).baseModel,
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
  return {
    ale_bench: fuseAleBenchRows(ale),
    weirdml: crosswalkBenchmarkSources(
      weird.filter((row) => row.metadata.weirdml_origin === "creator"),
      weird.filter(
        (row) => row.metadata.weirdml_origin === "epoch" && row.metadata.fusion_eligible !== false,
      ),
      { sourceLabels: { a: "Creator", b: "Epoch" } },
    ),
    gdp_pdf: crosswalkBenchmarkSources(gdpPdf, aaObservations("gdp_pdf"), {
      sourceLabels: { a: "Surge", b: "Artificial Analysis" },
    }),
    terminal_bench_4: crosswalkBenchmarkSources(officialRows, aaObservations("terminal_bench_4"), {
      sourceLabels: {
        a: BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench_4.source_a,
        b: BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench_4.source_b,
      },
    }),
    terminal_bench_science: crosswalkThreeBenchmarkSources(
      officialScienceRows,
      valsScienceRows,
      aaObservations("terminal_bench_science"),
      {
        sourceLabels: {
          a: BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench_science.source_a,
          b: BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench_science.source_b,
          c: BENCHMARK_RESOURCE_SOURCE_LABELS.terminal_bench_science.source_c,
        },
      },
    ),
  };

  /** AA resource pages share the same quality, effort, and decode-time observation contract. */
  function aaObservations(key: string): CrosswalkObservation[] {
    return aa
      .filter((row) => row.benchmark_key === key)
      .map((row) => ({
        benchmark_key: row.benchmark_key,
        source_url: row.source_url,
        model_id: row.model_id,
        model: row.model,
        base_model: benchmarkModelEffort(row.model).baseModel,
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

function claudeName(name: string): string {
  return /^(?:Fable|Opus|Sonnet)\b/i.test(name) ? `Claude ${name}` : name;
}
