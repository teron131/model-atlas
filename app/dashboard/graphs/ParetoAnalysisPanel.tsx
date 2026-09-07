/** Unified owner for switching between model-score and benchmark-evidence Pareto analysis. */

import type {
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasPublishedModel,
} from "../../../src/model-atlas/stats/types";
import { useUrlState } from "../use-url-state";
import { FrontierBenchmarksPanel } from "./frontier-benchmarks/Panel";
import { GraphToggle } from "./GraphToggle";
import { ParetoFrontierPanel } from "./ParetoFrontierPanel";
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
  const [view, setView] = useUrlState("pareto");
  const [benchmarkKeys, setBenchmarkKeys] = useUrlState("benchmark");
  const [benchmarkAxisKey, setBenchmarkAxisKey] = useUrlState("axes");
  const scoreBasisControl = (
    <GraphToggle
      legend="Score basis"
      options={[
        { key: "scores", label: "Scores" },
        { key: "benchmarks", label: "Benchmarks" },
      ]}
      selectedKey={view}
      onSelect={setView}
    />
  );

  return view === "scores" ? (
    <ParetoFrontierPanel
      models={models}
      showVariants={showVariants}
      compactLayout={compactLayout}
      scoreBasisControl={scoreBasisControl}
      setHover={setHover}
    />
  ) : (
    <FrontierBenchmarksPanel
      payload={payload}
      models={models}
      referenceModels={referenceModels}
      showVariants={showVariants}
      compactLayout={compactLayout}
      axisKey={benchmarkAxisKey}
      benchmarkKeys={benchmarkKeys}
      scoreBasisControl={scoreBasisControl}
      onAxisKeyChange={setBenchmarkAxisKey}
      onBenchmarkKeysChange={setBenchmarkKeys}
      setHover={setHover}
    />
  );
}
