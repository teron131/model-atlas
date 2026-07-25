/** Source loading owns provider dispatch and produces the complete raw-row contract for stats assembly. */

import {
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkRuntimeKey,
  type BenchmarkRuntimeKeyFor,
} from "../../benchmarks/registry";
import { getAgentArenaStats } from "../../benchmarks/scrapers/agent-arena";
import { getAgentsLastExamStats } from "../../benchmarks/scrapers/agents-last-exam";
import { getAleBenchStats } from "../../benchmarks/scrapers/ale-bench";
import { getArtificialAnalysisBenchmarkResourceStats } from "../../benchmarks/scrapers/artificial-analysis/results";
import { getBlueprintBenchStats } from "../../benchmarks/scrapers/blueprint-bench";
import { getCursorBenchStats } from "../../benchmarks/scrapers/cursorbench";
import { getDeepSWELeaderboardStats } from "../../benchmarks/scrapers/deep-swe";
import { getFrontierCodeStats } from "../../benchmarks/scrapers/frontier-code";
import { getMercorApexAgentsStats } from "../../benchmarks/scrapers/mercor-apex-agents";
import { benchmarkObservationSourceFetcher } from "../../benchmarks/scrapers/observation-source";
import { getRiemannBenchStats } from "../../benchmarks/scrapers/surge/riemann-bench";
import { getHarveyLabStats } from "../../benchmarks/scrapers/vals/harvey-lab";
import { getValsIndexStats } from "../../benchmarks/scrapers/vals/index-benchmark";
import { getTerminalBenchStats } from "../../benchmarks/scrapers/vals/terminal-bench";
import { getVendingBench2Stats } from "../../benchmarks/scrapers/vending-bench-2";
import { getArtificialAnalysisLeaderboardStats } from "../../scrapers/artificial-analysis/leaderboard";
import { getModelsDevSourceStats } from "../../scrapers/models-dev";
import { selectModelsDevRowsForArtificialAnalysis } from "./policy";
import {
  buildSourceData,
  type ModelAtlasSourceData,
  type ModelAtlasSourceRows,
} from "./source-data";

type BenchmarkSourceLoader<Key extends keyof ModelAtlasSourceRows> = {
  sourceRowsKey: Key;
  load: () => Promise<ModelAtlasSourceRows[Key]>;
};

function benchmarkSourceLoader<const Key extends keyof ModelAtlasSourceRows>(
  sourceRowsKey: Key,
  load: () => Promise<ModelAtlasSourceRows[Key]>,
): BenchmarkSourceLoader<Key> {
  return { sourceRowsKey, load };
}

const SURGE_SOURCE_LOADERS = {
  riemann_bench: benchmarkSourceLoader(
    "riemannBenchRows",
    async () => (await getRiemannBenchStats()).data,
  ),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_SOURCE_LOADERS = {
  vals_harvey_lab: benchmarkSourceLoader(
    "harveyLabRows",
    async () => (await getHarveyLabStats()).model_scores,
  ),
  vals_terminal_bench: benchmarkSourceLoader(
    "terminalBenchRows",
    async () => (await getTerminalBenchStats()).model_scores,
  ),
  vals_index: benchmarkSourceLoader(
    "valsIndexRows",
    async () => (await getValsIndexStats()).model_scores,
  ),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"vals">, object>;

const SPARSE_SOURCE_LOADERS = {
  agent_arena: benchmarkSourceLoader(
    "agentArenaRows",
    async () => (await getAgentArenaStats()).data,
  ),
  agents_last_exam: benchmarkSourceLoader(
    "agentsLastExamRows",
    async () => (await getAgentsLastExamStats()).data,
  ),
  ale_bench: benchmarkSourceLoader(
    "aleBenchConfigurationRows",
    async () => (await getAleBenchStats()).data,
  ),
  blueprint_bench_2: benchmarkSourceLoader(
    "blueprintBenchRows",
    async () => (await getBlueprintBenchStats()).data,
  ),
  cursorbench: benchmarkSourceLoader(
    "cursorBenchRows",
    async () => (await getCursorBenchStats()).data,
  ),
  deep_swe: benchmarkSourceLoader(
    "deepSWEEffortRows",
    async () => (await getDeepSWELeaderboardStats()).data,
  ),
  frontier_code: benchmarkSourceLoader(
    "frontierCodeRows",
    async () => (await getFrontierCodeStats()).data,
  ),
  mercor_apex_agents: benchmarkSourceLoader(
    "mercorApexAgentsRows",
    async () => (await getMercorApexAgentsStats()).data,
  ),
  vending_bench_2: benchmarkSourceLoader(
    "vendingBench2Rows",
    async () => (await getVendingBench2Stats()).data,
  ),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"sparse">, object>;

const BENCHMARK_SOURCE_LOADERS = {
  ...SURGE_SOURCE_LOADERS,
  ...VALS_SOURCE_LOADERS,
  ...SPARSE_SOURCE_LOADERS,
} as const satisfies Record<BenchmarkRuntimeKey, object>;

type BenchmarkSourceRowsKey =
  (typeof BENCHMARK_SOURCE_LOADERS)[BenchmarkRuntimeKey]["sourceRowsKey"];
type BenchmarkSourceRows = Pick<ModelAtlasSourceRows, BenchmarkSourceRowsKey>;

/** Fetch custom benchmark rows while preserving each source-specific output contract. */
async function fetchBenchmarkSourceRows(): Promise<BenchmarkSourceRows> {
  const entries = await Promise.all(
    Object.values(BENCHMARK_SOURCE_LOADERS).map(async (loader) => [
      loader.sourceRowsKey,
      await loader.load(),
    ]),
  );
  return Object.fromEntries(entries) as BenchmarkSourceRows;
}

/** Fetch every external source into the raw-row contract consumed by stats assembly. */
async function fetchSourceRows(): Promise<ModelAtlasSourceRows> {
  const [
    artificialAnalysisStats,
    artificialAnalysisBenchmarkResourceStats,
    modelsDevStats,
    benchmarkRows,
    benchmarkObservationStats,
  ] = await Promise.all([
    getArtificialAnalysisLeaderboardStats(),
    getArtificialAnalysisBenchmarkResourceStats(),
    getModelsDevSourceStats(),
    fetchBenchmarkSourceRows(),
    Promise.all(
      BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => ({
        binding,
        payload: await benchmarkObservationSourceFetcher(binding)(),
      })),
    ),
  ]);
  const artificialAnalysisRows = artificialAnalysisStats.data;
  const artificialAnalysisBenchmarkResourceRows = artificialAnalysisBenchmarkResourceStats.data;
  type BenchmarkObservationRowsKey =
    (typeof BENCHMARK_OBSERVATION_BINDINGS)[number]["sourceRowsKey"];
  const benchmarkObservationRows = Object.fromEntries(
    benchmarkObservationStats.map(({ binding, payload }) => [binding.sourceRowsKey, payload.data]),
  ) as Pick<ModelAtlasSourceRows, BenchmarkObservationRowsKey>;
  const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
    modelsDevStats.payload,
    artificialAnalysisRows,
  );
  return {
    artificialAnalysisRows,
    artificialAnalysisBenchmarkResourceRows,
    modelsDevModels,
    ...benchmarkRows,
    ...benchmarkObservationRows,
  };
}

/** Fetch and normalize every configured stats source through the same assembly boundary. */
export async function fetchSourceData(): Promise<ModelAtlasSourceData> {
  return buildSourceData(await fetchSourceRows());
}
