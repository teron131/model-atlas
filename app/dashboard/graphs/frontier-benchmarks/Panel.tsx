/** One comparison surface combines explicit performance selection with measured resources or published resource scores. */

import { memo, useMemo } from "react";

import { isAggregateIndex } from "../../../../src/model-atlas/benchmarks/index-policy";
import {
  type ModelAtlasModel,
  type ModelAtlasPayload,
  type ModelAtlasPublishedModel,
} from "../../../../src/model-atlas/stats/types";
import { captureFileToken } from "../../capture/png";
import { modelName, modelVariantKey, shortLabel } from "../../shared/model-display";
import { BoxWhiskerSummary } from "../BoxWhiskerSummary";
import { valueDistribution } from "../chart-stats";
import { finite, fmtPercentScore, fmtTooltipScore } from "../format";
import { GraphToggle } from "../GraphToggle";
import { Panel } from "../Panel";
import { PARETO_PANEL_CONTENT, ParetoControlSet } from "../ParetoControlSet";
import { scoreAxisScale } from "../plot/axis-scale";
import { SCATTER_CHART_MARGIN, SCATTER_CHART_WIDTH } from "../plot/Primitives";
import type { HoverSetter } from "../types";
import {
  automaticResourceKeys,
  frontierAxisDescription,
  frontierAxisMetricLabel,
  frontierBenchmarkAxisConfig,
  frontierBenchmarkAxisConfigFor,
  type FrontierBenchmarkAxisKey,
  frontierBenchmarkCorrelationByBenchmark,
  frontierBenchmarkHoverRows,
  frontierBenchmarkOptions,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  frontierScoreAxisScale,
  frontierXAxisScale,
  isScoreAxis,
  performanceComparisonRows,
  type PerformanceMetric,
  positiveMetric,
  resourceComparisonIssue,
} from "./analysis";
import { BenchmarkSelect } from "./BenchmarkSelect";
import { sharedFrontierBenchmarkComparison } from "./common-evidence";
import { CommonEvidence } from "./CommonEvidence";
import { EmptyFrontierBenchmarkScatterPlot, FrontierBenchmarkScatterPlot } from "./ScatterPlot";

import styles from "../graphs.module.css";

/** Keep published scores intact and disclose the actual resource basket used by each effort curve. */
export const FrontierBenchmarksPanel = memo(function FrontierBenchmarksPanel({
  payload,
  models,
  referenceModels,
  showVariants,
  compactLayout,
  performance,
  axisKey,
  benchmarkKeys,
  onPerformanceChange,
  onAxisKeyChange,
  onBenchmarkKeysChange,
  setHover,
}: {
  payload: ModelAtlasPayload;
  models: ModelAtlasPublishedModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
  compactLayout: boolean;
  performance: PerformanceMetric;
  axisKey: FrontierBenchmarkAxisKey;
  benchmarkKeys: readonly string[] | null;
  onPerformanceChange: (performance: PerformanceMetric) => void;
  onAxisKeyChange: (axisKey: FrontierBenchmarkAxisKey) => void;
  onBenchmarkKeysChange: (keys: string[] | null) => void;
  setHover: HoverSetter;
}) {
  const benchmarkRows = useMemo(
    () => frontierBenchmarkRows(models, payload.metadata.scoring.benchmark_portfolio),
    [models, payload.metadata.scoring.benchmark_portfolio],
  );
  const referenceRows = useMemo(
    () => frontierBenchmarkRows(referenceModels, payload.metadata.scoring.benchmark_portfolio),
    [referenceModels, payload.metadata.scoring.benchmark_portfolio],
  );
  const benchmarkOptions = useMemo(
    () =>
      frontierBenchmarkOptions(benchmarkRows).map((option) => {
        if (isScoreAxis(axisKey)) return option;
        const measured = benchmarkRows.find(
          (row) =>
            row.benchmarkKey === option.key &&
            positiveMetric(frontierBenchmarkAxisConfig[axisKey].get(row)),
        );
        const unit = measured?.resourcePolicy?.unit === "total" ? "full run" : "per task";
        const measure =
          axisKey === "tokens"
            ? measured?.resourcePolicy?.tokenMeasure === "output_tokens"
              ? "Output tokens"
              : "Total tokens"
            : axisKey === "cost"
              ? "Cost"
              : "Time";
        return {
          ...option,
          detail: measured
            ? `${measure} · ${unit}`
            : `No measured ${frontierBenchmarkAxisConfig[axisKey].shortLabel.toLowerCase()}`,
        };
      }),
    [benchmarkRows, axisKey],
  );
  const correlations = useMemo(
    () => frontierBenchmarkCorrelationByBenchmark(referenceRows),
    [referenceRows],
  );
  const activeKeys = useMemo(() => {
    if (performance !== "benchmarks") {
      return automaticResourceKeys(
        referenceRows,
        payload.metadata.scoring.benchmark_portfolio,
        performance,
        axisKey,
      );
    }
    const available = new Set(benchmarkOptions.map((option) => option.key));
    return benchmarkKeys == null
      ? [...available]
      : benchmarkKeys.filter((key) => available.has(key));
  }, [
    performance,
    referenceRows,
    payload.metadata.scoring.benchmark_portfolio,
    axisKey,
    benchmarkKeys,
    benchmarkOptions,
  ]);
  const publishedPerformance = performance !== "benchmarks";
  const resourceAxis = !isScoreAxis(axisKey);
  const aggregate = activeKeys.length > 1;
  const needsEvidence = resourceAxis || !publishedPerformance;
  const issue = needsEvidence ? resourceComparisonIssue(referenceRows, activeKeys, axisKey) : null;
  const comparison = useMemo(
    () => sharedFrontierBenchmarkComparison(benchmarkRows, referenceRows, activeKeys, axisKey),
    [benchmarkRows, referenceRows, activeKeys, axisKey],
  );
  const axisConfig = useMemo(
    () => frontierBenchmarkAxisConfigFor(axisKey, aggregate),
    [axisKey, aggregate],
  );
  const rows = useMemo(
    () =>
      issue
        ? []
        : performanceComparisonRows(models, comparison.rows, performance, axisKey).filter((row) =>
            positiveMetric(axisConfig.get(row), aggregate || !resourceAxis),
          ),
    [issue, models, comparison.rows, performance, axisKey, axisConfig, aggregate, resourceAxis],
  );
  const singleKey = activeKeys[0];
  const indexScore = !aggregate && isAggregateIndex(singleKey ?? "");
  const normalizedScore = !publishedPerformance && (aggregate || singleKey === "ale_bench");
  const selectedLabel =
    benchmarkOptions.find((option) => option.key === singleKey)?.label ?? "Benchmark";
  const evidenceSummary =
    activeKeys.length <= 3
      ? benchmarkOptions
          .filter((option) => activeKeys.includes(option.key))
          .map((option) => option.label)
          .join(", ")
      : `${activeKeys.length} benchmark and index sources`;
  const yLabel = publishedPerformance
    ? `${performance === "intelligence" ? "Intelligence" : "Agentic"} Score`
    : normalizedScore
      ? "Normalized Performance"
      : `${selectedLabel} Score`;
  const xLabel = frontierAxisMetricLabel(axisConfig, aggregate, rows);
  const formatScore =
    publishedPerformance || normalizedScore || indexScore ? fmtTooltipScore : fmtPercentScore;
  const formatScoreTick =
    publishedPerformance || normalizedScore
      ? (value: number) => value.toFixed(0)
      : indexScore
        ? fmtTooltipScore
        : (value: number) => `${value.toFixed(0)}%`;
  const xAxis = frontierXAxisScale(
    rows.map(axisConfig.get).filter(finite),
    axisKey,
    axisConfig,
    aggregate,
  );
  const scoreValues = rows.map((row) => row.score);
  const yAxis =
    publishedPerformance || normalizedScore
      ? scoreAxisScale(scoreValues, { formatTick: (value) => value.toFixed(0) })
      : frontierScoreAxisScale(scoreValues, indexScore);
  const chartMetric = useMemo(
    () => ({
      label: xLabel,
      get: (row: FrontierBenchmarkRow) => axisConfig.get(row)!,
      format: axisConfig.format,
      xHigherIsBetter: axisConfig.xHigherIsBetter,
    }),
    [xLabel, axisConfig],
  );
  const evidenceLabel = publishedPerformance
    ? "automatic"
    : benchmarkKeys == null
      ? "all"
      : activeKeys.join("-") || "none";
  const captureFileName = `model-atlas-pareto-${performance}-${axisKey}${needsEvidence ? `-${captureFileToken(evidenceLabel)}` : ""}`;
  const controls = (
    <ParetoControlSet
      yAxisControl={
        <BenchmarkSelect
          options={benchmarkOptions}
          selectedKeys={activeKeys}
          correlationByBenchmark={correlations}
          performance={{ value: performance, onChange: onPerformanceChange }}
          onChange={onBenchmarkKeysChange}
        />
      }
      xAxisControl={
        <GraphToggle
          legend="X axis"
          options={Object.entries(frontierBenchmarkAxisConfig).map(([key, config]) => ({
            key: key as FrontierBenchmarkAxisKey,
            label: config.shortLabel,
          }))}
          selectedKey={axisKey}
          onSelect={onAxisKeyChange}
        />
      }
    />
  );
  const explanation =
    publishedPerformance && resourceAxis
      ? `${yLabel} uses the published model-wide calculation, paired with ${aggregate ? "normalized resources" : "measured resources"} from ${evidenceSummary || "the selected evidence"}.`
      : normalizedScore
        ? `Performance across ${evidenceSummary} is normalized against the full reference population, then combined with index overlap removed.`
        : null;
  const emptyMessage =
    issue ??
    (activeKeys.length === 0 && needsEvidence && !publishedPerformance
      ? "Select at least one evidence source to compare."
      : `No models have both ${yLabel} and ${axisConfig.shortLabel} for this selection. Change the evidence, axis, or global filters.`);
  return (
    <Panel
      {...PARETO_PANEL_CONTENT}
      captureWidth={SCATTER_CHART_WIDTH}
      captureFileName={captureFileName}
      summary={
        rows.length > 0 ? (
          <BoxWhiskerSummary
            label={yLabel}
            distribution={valueDistribution(scoreValues)}
            countLabel={showVariants ? "variants" : "models"}
            domainMax={Math.max(100, ...scoreValues)}
            formatValue={formatScore}
            showDomainEndpoints
          />
        ) : null
      }
      note={`The solid envelope traces the best displayed tradeoffs.${showVariants ? " Hover a point or label to reveal its model’s variant connections in reasoning-effort order." : ""} ${frontierAxisDescription(axisKey, aggregate, rows[0])}`}
      wide
    >
      {controls}
      {explanation ? <p className={styles.comparisonExplanation}>{explanation}</p> : null}
      {needsEvidence && aggregate && !issue ? (
        <CommonEvidence
          comparison={{ ...comparison, rows }}
          benchmarkOptions={benchmarkOptions}
          activeBenchmarkKeys={activeKeys}
          axisKey={axisKey}
          publishedPerformance={publishedPerformance}
          showVariants={showVariants}
        />
      ) : null}
      {rows.length === 0 ? (
        <>
          <p className={styles.comparisonExplanation} role="status">
            {emptyMessage}
          </p>
          <EmptyFrontierBenchmarkScatterPlot
            compactLayout={compactLayout}
            xAxisLabel={xLabel}
            yAxisLabel={yLabel}
            formatScore={formatScoreTick}
            xHigherIsBetter={axisConfig.xHigherIsBetter}
          />
        </>
      ) : (
        <FrontierBenchmarkScatterPlot
          rows={[...rows].sort((left, right) => left.score - right.score)}
          metric={chartMetric}
          xDomain={xAxis.domain}
          xTicks={xAxis.ticks}
          yDomain={yAxis.domain}
          yTicks={yAxis.ticks}
          yAxisLabel={yLabel}
          formatScore={formatScoreTick}
          margin={{ ...SCATTER_CHART_MARGIN, left: 96 }}
          keyPrefix={`pareto-${performance}-${axisKey}-${activeKeys.join("-")}`}
          ariaLabel={`${yLabel} versus ${xLabel} scatter plot`}
          getScore={(row) => row.score}
          getModel={(row) => row.model}
          getKey={(row) => `${row.benchmarkKey}-${modelVariantKey(row.model)}`}
          getHoverTitle={(row) => modelName(row.model)}
          getHoverRows={(row) => frontierBenchmarkHoverRows(row, axisConfig, performance)}
          getLabel={(row) => shortLabel(row.model)}
          connectReasoningVariants={showVariants}
          compactLayout={compactLayout}
          setHover={setHover}
        />
      )}
    </Panel>
  );
});
