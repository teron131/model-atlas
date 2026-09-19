/** Source-labelled resource policy keeps persisted metric suffixes and UI labels aligned with scoring provenance. */

export const BENCHMARK_RESOURCE_SOURCE_LABELS = {
  arc_agi_3: { source_a: "Standard", source_b: "Provider Adapter" },
  terminal_bench_4: { source_a: "Official", source_b: "Artificial Analysis" },
  terminal_bench_science: { source_a: "Official", source_b: "Vals" },
} as const;

export const RESOURCE_SOURCE_AGREEMENT_POLICY = {
  minimumModels: 10,
  minimumShare: 0.9,
  maximumRatio: 1.05,
} as const;

export type BenchmarkResourceSource = "source_a" | "source_b";

export function resourceSourceMetricKey(key: string, source: BenchmarkResourceSource): string {
  return `${key}__${source}`;
}
