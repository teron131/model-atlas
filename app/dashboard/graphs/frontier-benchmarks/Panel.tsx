/** Frontier benchmark panel coordinates benchmark selection, resource axes, and scatter composition. */

import { memo, type ReactNode, useMemo } from "react";

import type { ModelAtlasModel, ModelAtlasPayload } from "../../../../src/model-atlas/stats/types";
import { captureFileToken } from "../../capture/png";
import { modelName, modelVariantKey, shortLabel } from "../../shared/model-display";
import { BoxWhiskerSummary } from "../BoxWhiskerSummary";
import { valueDistribution } from "../chart-stats";
import { finite, fmtPercentScore } from "../format";
import { GraphToggle } from "../GraphToggle";
import { Panel } from "../Panel";
import { PARETO_PANEL_CONTENT, ParetoControlSet } from "../ParetoControlSet";
import { SCATTER_CHART_WIDTH } from "../plot/Primitives";
import type { HoverSetter } from "../types";
import {
  frontierAxisDescription,
  frontierAxisMetricLabel,
  frontierBenchmarkAxisConfig,
  frontierBenchmarkAxisConfigFor,
  type FrontierBenchmarkAxisKey,
  frontierBenchmarkAxisOptions,
  frontierBenchmarkCorrelationByBenchmark,
  frontierBenchmarkHoverRows,
  frontierBenchmarkOptions,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  frontierScoreAxisScale,
  frontierXAxisScale,
  positiveMetric,
  selectedFrontierBenchmarkAxisKey,
  selectedFrontierBenchmarkRows,
} from "./analysis";
import { BenchmarkSelect } from "./BenchmarkSelect";
import { EmptyFrontierBenchmarkScatterPlot, FrontierBenchmarkScatterPlot } from "./ScatterPlot";

export const FrontierBenchmarksPanel = memo(function FrontierBenchmarksPanel({
  payload,
  models,
  referenceModels,
  showVariants,
  compactLayout,
  axisKey,
  benchmarkKeys,
  scoreBasisControl,
  onAxisKeyChange,
  onBenchmarkKeysChange,
  setHover,
}: {
  payload: ModelAtlasPayload;
  models: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
  compactLayout: boolean;
  axisKey: FrontierBenchmarkAxisKey;
  benchmarkKeys: readonly string[] | null;
  scoreBasisControl: ReactNode;
  onAxisKeyChange: (axisKey: FrontierBenchmarkAxisKey) => void;
  onBenchmarkKeysChange: (benchmarkKeys: string[] | null) => void;
  setHover: HoverSetter;
}) {
  const benchmarkRows = useMemo(
    () => frontierBenchmarkRows(models, payload.metadata.scoring.benchmark_portfolio),
    [models, payload.metadata.scoring.benchmark_portfolio],
  );
  const referenceBenchmarkRows = useMemo(
    () => frontierBenchmarkRows(referenceModels, payload.metadata.scoring.benchmark_portfolio),
    [referenceModels, payload.metadata.scoring.benchmark_portfolio],
  );
  const benchmarkOptions = useMemo(() => frontierBenchmarkOptions(benchmarkRows), [benchmarkRows]);
  const correlationByBenchmark = useMemo(
    () => frontierBenchmarkCorrelationByBenchmark(benchmarkRows),
    [benchmarkRows],
  );
  const benchmarkKeySet = useMemo(
    () => new Set(benchmarkOptions.map((option) => option.key)),
    [benchmarkOptions],
  );
  const activeBenchmarkKeys = useMemo(
    () =>
      benchmarkKeys == null
        ? benchmarkOptions.map((option) => option.key)
        : benchmarkKeys.filter((key) => benchmarkKeySet.has(key)),
    [benchmarkKeySet, benchmarkKeys, benchmarkOptions],
  );
  const selectedRows = useMemo(
    () => selectedFrontierBenchmarkRows(benchmarkRows, referenceBenchmarkRows, activeBenchmarkKeys),
    [activeBenchmarkKeys, benchmarkRows, referenceBenchmarkRows],
  );
  const isAllBenchmarkView =
    benchmarkOptions.length > 0 && activeBenchmarkKeys.length === benchmarkOptions.length;
  const isAggregateView = activeBenchmarkKeys.length !== 1;
  const selectedBenchmarkKey = activeBenchmarkKeys[0];
  const usesNormalizedBenchmarkScore =
    activeBenchmarkKeys.length === 1 && selectedBenchmarkKey === "ale_bench";
  const axisOptions = useMemo(
    () => frontierBenchmarkAxisOptions(selectedRows, isAggregateView),
    [isAggregateView, selectedRows],
  );
  const selectedAxisKey = selectedFrontierBenchmarkAxisKey(axisKey, axisOptions);
  let selectedBenchmarkLabel = "none";
  if (isAllBenchmarkView) {
    selectedBenchmarkLabel = "all";
  } else if (activeBenchmarkKeys.length === 1) {
    selectedBenchmarkLabel =
      benchmarkOptions.find((option) => option.key === selectedBenchmarkKey)?.label ??
      selectedBenchmarkKey ??
      "benchmark";
  } else if (activeBenchmarkKeys.length > 1) {
    selectedBenchmarkLabel = `${activeBenchmarkKeys.length}-benchmarks`;
  }
  const captureFileName = [
    "model-atlas-frontier-benchmarks",
    captureFileToken(selectedBenchmarkLabel),
    captureFileToken(frontierBenchmarkAxisConfig[selectedAxisKey].shortLabel),
  ].join("-");
  const axisConfig = frontierBenchmarkAxisConfigFor(selectedAxisKey, isAggregateView);
  const chartRows = useMemo(
    () => selectedRows.filter((row) => positiveMetric(axisConfig.get(row))),
    [axisConfig, selectedRows],
  );
  const xMetricLabel = frontierAxisMetricLabel(axisConfig, isAggregateView, selectedRows);
  const chartMetric = useMemo(
    () => ({
      label: xMetricLabel,
      get: (row: FrontierBenchmarkRow) => axisConfig.get(row) ?? 0,
      format: axisConfig.format,
      xHigherIsBetter: axisConfig.xHigherIsBetter,
    }),
    [axisConfig, xMetricLabel],
  );
  const controls = (
    <ParetoControlSet
      scoreBasisControl={scoreBasisControl}
      yAxisControl={
        <BenchmarkSelect
          options={benchmarkOptions}
          selectedKeys={activeBenchmarkKeys}
          correlationByBenchmark={correlationByBenchmark}
          onChange={onBenchmarkKeysChange}
        />
      }
      xAxisControl={
        <GraphToggle
          legend="Comparison axis"
          options={Object.entries(frontierBenchmarkAxisConfig).map(
            ([key, config]) =>
              axisOptions.find((option) => option.key === key) ?? {
                key: key as FrontierBenchmarkAxisKey,
                label: config.shortLabel,
              },
          )}
          selectedKey={selectedAxisKey}
          onSelect={onAxisKeyChange}
        />
      }
    />
  );

  if (chartRows.length === 0) {
    return (
      <Panel
        {...PARETO_PANEL_CONTENT}
        captureWidth={SCATTER_CHART_WIDTH}
        captureFileName={captureFileName}
        wide
      >
        {controls}
        <EmptyFrontierBenchmarkScatterPlot
          compactLayout={compactLayout}
          xAxisLabel={xMetricLabel}
          xHigherIsBetter={axisConfig.xHigherIsBetter}
        />
      </Panel>
    );
  }
  const leader = chartRows[0];
  if (leader == null) {
    return null;
  }

  const axisValues = chartRows.map(axisConfig.get).filter(finite);
  const xAxis = frontierXAxisScale(axisValues, selectedAxisKey, axisConfig);
  const scoreValues = chartRows.map((row) => row.score).filter(finite);
  const scoreAxis = frontierScoreAxisScale(scoreValues, isAggregateView);
  const scoreDistribution = valueDistribution(chartRows.map((row) => row.score));
  const plotRows = [...chartRows].sort((left, right) => left.score - right.score);
  const yAxisLabel = isAggregateView
    ? "Mean Normalized Benchmark Score"
    : usesNormalizedBenchmarkScore
      ? "Normalized Benchmark Score"
      : "Benchmark Score";
  const axisDescription = frontierAxisDescription(selectedAxisKey, isAggregateView, leader);
  let scoreMetricLabel = `${leader.benchmarkLabel} Score`;
  if (isAggregateView) {
    scoreMetricLabel = isAllBenchmarkView
      ? "Mean Normalized Frontier Benchmark Score"
      : "Mean Normalized Selected Benchmark Score";
  } else if (usesNormalizedBenchmarkScore) {
    scoreMetricLabel = `${leader.benchmarkLabel} Normalized Score`;
  }
  return (
    <Panel
      {...PARETO_PANEL_CONTENT}
      captureWidth={SCATTER_CHART_WIDTH}
      captureFileName={captureFileName}
      summary={
        <BoxWhiskerSummary
          label={yAxisLabel}
          distribution={scoreDistribution}
          domainMax={100}
          formatValue={fmtPercentScore}
          showDomainEndpoints
        />
      }
      note={`The frontier line traces the best displayed tradeoffs between ${scoreMetricLabel} and ${xMetricLabel}. ${axisDescription}`}
      wide
    >
      {controls}
      <FrontierBenchmarkScatterPlot
        rows={plotRows}
        metric={chartMetric}
        xDomain={xAxis.domain}
        xTicks={xAxis.ticks}
        yDomain={scoreAxis.domain}
        yTicks={scoreAxis.ticks}
        yAxisLabel={yAxisLabel}
        keyPrefix={`frontier-benchmarks-${activeBenchmarkKeys.join("-") || "all"}-${selectedAxisKey}`}
        ariaLabel={`${axisConfig.label} frontier scatter plot`}
        getScore={(row) => row.score}
        getModel={(row) => row.model}
        getKey={(row) => `${row.benchmarkKey}-${modelVariantKey(row.model)}`}
        getHoverTitle={(row) => modelName(row.model)}
        getHoverRows={(row) => frontierBenchmarkHoverRows(row, axisConfig)}
        getLabel={(row) => shortLabel(row.model)}
        connectReasoningVariants={showVariants}
        compactLayout={compactLayout}
        setHover={setHover}
      />
    </Panel>
  );
});
