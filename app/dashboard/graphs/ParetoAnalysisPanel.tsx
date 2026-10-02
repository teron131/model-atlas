/** Own the shareable performance and resource selections for one unified Pareto comparison. */

import { memo } from "react";

import type { ModelAtlasModel, ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { updateDashboardUrl, useUrlState } from "../use-url-state";
import { FrontierBenchmarksPanel } from "./frontier-benchmarks/Panel";
import type { HoverSetter } from "./hover-state";
import { useCompactChartLayout } from "./use-chart-layout";

export const ParetoAnalysisPanel = memo(function ParetoAnalysisPanel({
  payload,
  models,
  referenceModels,
  showVariants,
  onShowVariantsChange,
  setHover,
}: {
  payload: ModelAtlasPayload;
  models: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
  onShowVariantsChange: (show: boolean) => void;
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
      onShowVariantsChange={onShowVariantsChange}
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
});
