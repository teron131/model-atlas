/** Source-labelled resource policy keeps persisted metric suffixes and UI labels aligned with scoring provenance. */

export const BENCHMARK_RESOURCE_SOURCE_LABELS = {
  arc_agi_3: { source_a: "Standard", source_b: "Provider Adapter" },
  terminal_bench_4: { source_a: "Official", source_b: "Artificial Analysis" },
  terminal_bench_science: {
    source_a: "Official",
    source_b: "Vals",
    source_c: "Artificial Analysis",
  },
} as const;

export const RESOURCE_SOURCE_AGREEMENT_POLICY = {
  minimumModels: 10,
  minimumShare: 0.9,
  maximumRatio: 1.05,
} as const;

export type BenchmarkResourceSource = "source_a" | "source_b" | "source_c";

/** Read source slots declared by a fused row, including a source whose score is currently missing. */
export function resourceSourcesFromMetadata(
  metadata: Record<string, unknown>,
): BenchmarkResourceSource[] {
  const sources = Object.keys(metadata)
    .filter((field) => /^(source_a|source_b|source_c)_(label|score)$/.test(field))
    .map((field) => field.slice(0, 8) as BenchmarkResourceSource);
  return [...new Set(sources)].sort();
}

export function resourceSourceMetricKey(key: string, source: BenchmarkResourceSource): string {
  return `${key}__${source}`;
}
