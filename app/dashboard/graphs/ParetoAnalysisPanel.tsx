/** Own the shareable performance and resource selections for one unified Pareto comparison. */

import type {
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasPublishedModel,
} from "../../../src/model-atlas/stats/types";
import { updateDashboardUrl, useUrlState } from "../use-url-state";
import { FrontierBenchmarksPanel } from "./frontier-benchmarks/Panel";
import type { HoverSetter } from "./types";
import { useCompactChartLayout } from "./use-media-query";

export function ParetoAnalysisPanel({
  payload,
  models,
  referenceModels,
  showVariants,
  setHover,
}: {
  payload: ModelAtlasPayload;
  models: ModelAtlasPublishedModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
  setHover: HoverSetter;
}) {
  const compactLayout = useCompactChartLayout();
  const [performance, setPerformance] = useUrlState("performance");
  const [benchmarkKeys] = useUrlState("benchmark");
  const [benchmarkAxisKey, setBenchmarkAxisKey] = useUrlState("axes");
  return (
    <FrontierBenchmarksPanel
      payload={payload}
      models={models}
      referenceModels={referenceModels}
      showVariants={showVariants}
      compactLayout={compactLayout}
      performance={performance}
      axisKey={benchmarkAxisKey}
      benchmarkKeys={benchmarkKeys}
      onPerformanceChange={setPerformance}
      onAxisKeyChange={setBenchmarkAxisKey}
      onBenchmarkKeysChange={(keys) =>
        updateDashboardUrl({ performance: "benchmarks", benchmark: keys })
      }
      setHover={setHover}
    />
  );
}
