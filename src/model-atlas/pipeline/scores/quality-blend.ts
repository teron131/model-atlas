/** Share component/index influence between live scoring and fixed historical coordinates without changing their evidence selection. */

import { QUALITY_SCORE_BUCKET_WEIGHTS } from "../../config/stage";
import { smoothstep, weightedMeanOfFinite } from "../../math-utils";

/** Preserve each group's relative weights; only directly observed benchmarks advance the benchmark/index blend. */
export function blendQualityEvidence<T extends { value: number | null; weight: number }>(
  benchmarks: readonly T[],
  indexes: readonly T[],
  observedBenchmarkCount: number,
  fullBenchmarkCount: number,
): { value: number | null; parts: T[] } {
  const usable = (parts: readonly T[]) =>
    parts.filter((part) => part.value != null && Number.isFinite(part.value) && part.weight > 0);
  const benchmarkParts = usable(benchmarks);
  const indexParts = usable(indexes);
  const benchmarkMean = weightedMeanOfFinite(benchmarkParts);
  const indexMean = weightedMeanOfFinite(indexParts);
  if (benchmarkMean == null) return { value: indexMean, parts: indexParts };
  if (indexMean == null) return { value: benchmarkMean, parts: benchmarkParts };
  const progress =
    fullBenchmarkCount <= 1
      ? 1
      : smoothstep((observedBenchmarkCount - 1) / (fullBenchmarkCount - 1));
  const benchmarkShare =
    QUALITY_SCORE_BUCKET_WEIGHTS.nonBenchmark +
    progress * (QUALITY_SCORE_BUCKET_WEIGHTS.benchmark - QUALITY_SCORE_BUCKET_WEIGHTS.nonBenchmark);
  const benchmarkWeight = benchmarkParts.reduce((sum, part) => sum + part.weight, 0);
  const indexWeight = indexParts.reduce((sum, part) => sum + part.weight, 0);
  const parts = [
    ...benchmarkParts.map((part) => ({
      ...part,
      weight: (benchmarkShare * part.weight) / benchmarkWeight,
    })),
    ...indexParts.map((part) => ({
      ...part,
      weight: ((1 - benchmarkShare) * part.weight) / indexWeight,
    })),
  ];
  return { value: benchmarkShare * benchmarkMean + (1 - benchmarkShare) * indexMean, parts };
}
