/** Unified owner for switching between model-score and benchmark-evidence Pareto analysis. */

import { useState } from "react";

import type { ModelAtlasModel, ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import type { FrontierBenchmarkAxisKey } from "./frontier-benchmarks/analysis";
import { FrontierBenchmarksPanel } from "./frontier-benchmarks/Panel";
import { GraphToggle } from "./GraphToggle";
import { ParetoFrontierPanel } from "./ParetoFrontierPanel";
import type { HoverSetter } from "./types";
import { useCompactChartLayout } from "./use-media-query";

type ParetoAnalysisView = "scores" | "benchmarks";

export function ParetoAnalysisPanel({
  payload,
  models,
  referenceModels,
  showVariants,
  setHover,
}: {
  payload: ModelAtlasPayload;
  models: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
  setHover: HoverSetter;
}) {
  const compactLayout = useCompactChartLayout();
  const [view, setView] = useState<ParetoAnalysisView>("scores");
  const [benchmarkKeys, setBenchmarkKeys] = useState<string[] | null>(null);
  const [benchmarkAxisKey, setBenchmarkAxisKey] = useState<FrontierBenchmarkAxisKey>("speedValue");
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
