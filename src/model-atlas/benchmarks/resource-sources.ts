/** Source-labelled resource policy keeps persisted metric suffixes and UI labels aligned with scoring provenance. */

export const BENCHMARK_RESOURCE_SOURCE_LABELS = {
  terminal_bench_4: { source_a: "Official", source_b: "Artificial Analysis" },
  terminal_bench_science: {
    source_a: "Official",
    source_b: "Vals",
    source_c: "Artificial Analysis",
  },
} as const;

export type BenchmarkResourceSource = "source_a" | "source_b" | "source_c";

/**
 * Read source slots declared by a fused row, including a source whose score is currently missing.
 * A slot is the 8-character prefix of a `source_x_label` or `source_x_score` field: `{ source_b_score, source_a_label, model }` → `["source_a", "source_b"]`.
 */
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
