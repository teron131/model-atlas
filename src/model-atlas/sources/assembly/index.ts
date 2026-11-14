/** Entry for source assembly, which turns either a live fetch of every bulk source or a restored checkpoint snapshot into the normalized lookups matching and scoring read. */

export { fusedBenchmarkObservations } from "./fusion";
export { fetchSourceData, sourceDataFromSnapshots } from "./load";
export type {
  ArtificialAnalysisModel,
  ModelAtlasSourceData,
  ModelAtlasSourceRows,
} from "./source-data";
export { buildSourceData } from "./source-data";
