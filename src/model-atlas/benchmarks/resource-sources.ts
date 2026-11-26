/** Source-labelled resource policy keeps persisted metric suffixes and UI labels aligned with scoring provenance. */

export const BENCHMARK_RESOURCE_SOURCE_LABELS = {
  terminal_bench: { source_a: "Official", source_b: "Artificial Analysis" },
  terminal_bench_science: {
    source_a: "Official",
    source_b: "Vals",
    source_c: "Artificial Analysis",
  },
} as const;

export const BENCHMARK_RESOURCE_SOURCES = ["source_a", "source_b", "source_c"] as const;

export type BenchmarkResourceSource = (typeof BENCHMARK_RESOURCE_SOURCES)[number];

/** The per-task amounts a combined row carries, each with a `fusion_<field>_comparable` flag in the row's metadata. */
export const COMBINED_RESOURCE_FIELDS = [
  "cost",
  "seconds_per_task",
  "tokens_per_task",
  "output_tokens_per_task",
] as const;

export type CombinedResourceField = (typeof COMBINED_RESOURCE_FIELDS)[number];

/**
 * Read source slots declared by a combined row, including a source whose score is currently missing.
 * A slot counts when its `_label` or `_score` field exists, in slot order: `{ source_b_score, source_a_label, model }` → `["source_a", "source_b"]`.
 */
export function resourceSourcesFromMetadata(
  metadata: Record<string, unknown>,
): BenchmarkResourceSource[] {
  return BENCHMARK_RESOURCE_SOURCES.filter(
    (source) =>
      Object.hasOwn(metadata, `${source}_label`) || Object.hasOwn(metadata, `${source}_score`),
  );
}

/** A combined row splits back into its sources when any of its resource amounts is marked not comparable across them. */
export function hasSeparatedResources(metadata: Record<string, unknown>): boolean {
  return COMBINED_RESOURCE_FIELDS.some((field) => metadata[`fusion_${field}_comparable`] === false);
}

export function resourceSourceMetricKey(key: string, source: BenchmarkResourceSource): string {
  return `${key}__${source}`;
}
