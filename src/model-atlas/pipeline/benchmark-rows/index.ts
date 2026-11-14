/** Source benchmark results reach two consumers: assignment attaches them to model variants for scoring, and source rows feed benchmark-update health and observed benchmark versions. */

export {
  assignBenchmarksToVariants,
  type BenchmarkAssignmentLookups,
  buildDefaultVariantBenchmarks,
  buildObservationBenchmarks,
} from "./assignment";
export {
  type BenchmarkRowsByKey,
  type BenchmarkSourceRow,
  benchmarkRowsFromSourceData,
  observedBenchmarkVersions,
} from "./source-rows";
