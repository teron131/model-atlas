/** Share component/index influence between live scoring and fixed historical coordinates without changing their evidence selection. */

import { QUALITY_SCORE_BUCKET_WEIGHTS } from "../../config/stage";
import { smoothstep, weightedMeanOfFinite } from "../../math-utils";

/** Preserve each group's relative weights; only directly observed tasks advance the existing coverage taper. */
export function blendQualityEvidence<T extends { value: number | null; weight: number }>(
  tasks: readonly T[],
  indexes: readonly T[],
  observedTasks: number,
  fullTaskCount: number,
): { value: number | null; parts: T[] } {
  const usable = (parts: readonly T[]) =>
    parts.filter((part) => part.value != null && Number.isFinite(part.value) && part.weight > 0);
  const taskParts = usable(tasks);
  const indexParts = usable(indexes);
  const taskMean = weightedMeanOfFinite(taskParts);
  const indexMean = weightedMeanOfFinite(indexParts);
  if (taskMean == null) return { value: indexMean, parts: indexParts };
  if (indexMean == null) return { value: taskMean, parts: taskParts };
  const progress = fullTaskCount <= 1 ? 1 : smoothstep((observedTasks - 1) / (fullTaskCount - 1));
  const taskShare =
    QUALITY_SCORE_BUCKET_WEIGHTS.nonBenchmark +
    progress * (QUALITY_SCORE_BUCKET_WEIGHTS.benchmark - QUALITY_SCORE_BUCKET_WEIGHTS.nonBenchmark);
  const taskWeight = taskParts.reduce((sum, part) => sum + part.weight, 0);
  const indexWeight = indexParts.reduce((sum, part) => sum + part.weight, 0);
  const parts = [
    ...taskParts.map((part) => ({ ...part, weight: (taskShare * part.weight) / taskWeight })),
    ...indexParts.map((part) => ({
      ...part,
      weight: ((1 - taskShare) * part.weight) / indexWeight,
    })),
  ];
  return { value: taskShare * taskMean + (1 - taskShare) * indexMean, parts };
}
