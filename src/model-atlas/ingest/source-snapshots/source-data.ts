/** Persisted snapshot rows are adapted into the shared normalized source-data contract. */

import { BENCHMARK_OBSERVATION_BINDINGS } from "../../benchmarks/registry";
import type { ModelAtlasSourceData } from "../assembly";
import { buildSourceData } from "../assembly";
import { benchmarkSourceRowsFromSnapshots } from "../benchmark-runtimes/registry";
import type { SourceSnapshots } from "../types";

/** Restored source rows rebuild lookup maps without refetching external benchmark pages. */
export function cachedSourceDataFromSnapshots(snapshots: SourceSnapshots): ModelAtlasSourceData {
  type BenchmarkObservationRowsKey =
    (typeof BENCHMARK_OBSERVATION_BINDINGS)[number]["sourceRowsKey"];
  const benchmarkObservationRows = Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
      binding.sourceRowsKey,
      snapshots[binding.sourceRowsKey],
    ]),
  ) as Pick<SourceSnapshots, BenchmarkObservationRowsKey>;
  return buildSourceData({
    artificialAnalysisRows: snapshots.artificialAnalysisSelectedRows,
    artificialAnalysisBenchmarkResourceRows: snapshots.artificialAnalysisBenchmarkResourceRows,
    modelsDevModels: snapshots.modelsDevModels,
    ...benchmarkSourceRowsFromSnapshots(snapshots),
    ...benchmarkObservationRows,
  });
}
