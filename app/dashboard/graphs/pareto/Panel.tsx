/** One comparison surface owns its shareable performance, evidence, and resource selections, plotting published scores or selected benchmarks against measured resources or published resource scores. */

import { memo, useMemo } from "react";

import { isAggregateIndex } from "../../../../src/model-atlas/benchmarks/index-policy";
import {
  type ModelAtlasModel,
  type ModelAtlasPayload,
} from "../../../../src/model-atlas/stats/types";
import { captureFileToken } from "../../capture/png";
import { modelName, modelVariantKey, shortLabel } from "../../shared/model-display";
import { updateDashboardUrl, useUrlState } from "../../use-url-state";
import { BoxWhiskerSummary } from "../BoxWhiskerSummary";
import { finite, fmtPercentScore, fmtTooltipNumber, fmtTooltipScore } from "../format";
import { GraphToggle } from "../GraphToggle";
import type { HoverSetter } from "../hover-state";
import { Panel } from "../Panel";
import { scoreAxisScale } from "../plot/axis-scale";
import { SCATTER_CHART_MARGIN } from "../plot/Primitives";
import { useCompactChartLayout } from "../use-chart-layout";
import {
  automaticResourceKeys,
  type FrontierBenchmarkAxisKey,
  frontierBenchmarkCorrelationByBenchmark,
  frontierBenchmarkOptions,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  isScoreAxis,
  performanceComparisonRows,
  positiveMetric,
} from "./analysis";
import { BenchmarkSelect } from "./BenchmarkSelect";
import { sharedFrontierBenchmarkComparison } from "./common-evidence";
import { CommonEvidence } from "./CommonEvidence";
import { PARETO_CAPTION, PARETO_PANEL_CONTENT, ParetoFigureFoot, ParetoFigureTop } from "./Figure";
import {
  frontierAxisDescription,
  frontierAxisMetricLabel,
  frontierBenchmarkAxisConfig,
  frontierBenchmarkAxisConfigFor,
  frontierBenchmarkHoverRows,
  frontierScoreAxisScale,
  frontierXAxisScale,
} from "./presentation";
import { FrontierBenchmarkScatterPlot } from "./ScatterPlot";

import styles from "../graphs.module.css";

/** Keep published scores intact and disclose the actual resource basket used by each effort curve. */
export const ParetoPanel = memo(function ParetoPanel({
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
  const [axisKey, setAxisKey] = useUrlState("axes");
  const benchmarkRows = useMemo(
    () => frontierBenchmarkRows(models, payload.metadata.scoring.benchmark_portfolio, axisKey),
    [models, payload.metadata.scoring.benchmark_portfolio, axisKey],
  );
  const referenceRows = useMemo(
    () =>
      frontierBenchmarkRows(referenceModels, payload.metadata.scoring.benchmark_portfolio, axisKey),
    [referenceModels, payload.metadata.scoring.benchmark_portfolio, axisKey],
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
          axisKey === "tokens" ? "Total tokens" : axisKey === "cost" ? "Cost" : "Time";
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
      return automaticResourceKeys(referenceRows, axisKey);
    }
    const available = new Set(benchmarkOptions.map((option) => option.key));
    return benchmarkKeys == null
      ? [...available]
      : benchmarkKeys.filter((key) => available.has(key));
  }, [performance, referenceRows, axisKey, benchmarkKeys, benchmarkOptions]);
  const publishedPerformance = performance !== "benchmarks";
  const resourceAxis = !isScoreAxis(axisKey);
  const aggregate = activeKeys.length > 1;
  const needsEvidence = resourceAxis || !publishedPerformance;
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
      performanceComparisonRows(models, comparison.rows, performance, axisKey).filter((row) =>
        positiveMetric(axisConfig.get(row), aggregate || !resourceAxis),
      ),
    [models, comparison.rows, performance, axisKey, axisConfig, aggregate, resourceAxis],
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
  const xAxis = frontierXAxisScale(rows.map(axisConfig.get).filter(finite), axisKey, axisConfig);
  const scoreValues = rows.map((row) => row.score);
  const yAxis =
    publishedPerformance || normalizedScore
      ? scoreAxisScale(scoreValues, { formatTick: (value) => value.toFixed(0) })
      : frontierScoreAxisScale(scoreValues, indexScore);
  const chartMetric = useMemo(
    () => ({
      label: `${xLabel}${axisConfig.logarithmic ? " · log₁₀" : ""}`,
      // Resource steps read as "6.3× cost"; score axes keep their own names.
      noun: isScoreAxis(axisKey)
        ? axisConfig.shortLabel
        : frontierBenchmarkAxisConfig[axisKey].shortLabel.toLowerCase(),
      get: (row: FrontierBenchmarkRow) => axisConfig.get(row)!,
      format: isScoreAxis(axisKey) ? fmtTooltipNumber : axisConfig.format,
      xHigherIsBetter: axisConfig.xHigherIsBetter,
      logarithmic: axisConfig.logarithmic,
    }),
    [xLabel, axisConfig, axisKey],
  );
  const evidenceLabel = publishedPerformance
    ? "automatic"
    : benchmarkKeys == null
      ? "all"
      : activeKeys.join("-") || "none";
  const captureFileName = `model-atlas-pareto-${performance}-${axisKey}${needsEvidence ? `-${captureFileToken(evidenceLabel)}` : ""}`;
  const explanation =
    publishedPerformance && resourceAxis
      ? `Published ${yLabel} vs. ${aggregate ? "median-relative" : "measured"} resources from ${evidenceSummary || "selected evidence"}.`
      : normalizedScore
        ? `${evidenceSummary}: performance normalized to the full reference population, with index overlap removed.`
        : null;
  const emptyMessage =
    activeKeys.length === 0 && needsEvidence && !publishedPerformance
      ? "Select an evidence source."
      : `No models have both ${yLabel} and ${axisConfig.shortLabel}. Change the evidence, axis, or filters.`;
  const plotMargin = { ...SCATTER_CHART_MARGIN, left: 96 };
  const note =
    rows.length > 0
      ? `${frontierAxisDescription(axisKey, aggregate, rows[0])}${showVariants ? " Hover a point or label to connect its model's variants in reasoning-effort order." : ""}`
      : null;
  return (
    <Panel {...PARETO_PANEL_CONTENT} captureFileName={captureFileName} wide>
      <ParetoFigureTop
        yAxisControl={
          <BenchmarkSelect
            options={benchmarkOptions}
            selectedKeys={activeKeys}
            correlationByBenchmark={correlations}
            performance={{ value: performance, onChange: setPerformance }}
            onChange={(keys) => updateDashboardUrl({ performance: "benchmarks", benchmark: keys })}
          />
        }
        summary={
          rows.length > 0 ? (
            <BoxWhiskerSummary
              label={yLabel}
              values={scoreValues}
              countLabel={showVariants ? "variants" : "models"}
              domainMax={Math.max(100, ...scoreValues)}
              formatValue={formatScore}
              showDomainEndpoints
            />
          ) : null
        }
      />
      {rows.length === 0 ? (
        <p className={styles.emptyComparison} role="status">
          {emptyMessage}
        </p>
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
          margin={plotMargin}
          keyPrefix={`pareto-${performance}-${axisKey}-${activeKeys.join("-")}`}
          ariaLabel={`${yLabel} versus ${xLabel}${axisConfig.logarithmic ? " (logarithmic)" : ""} scatter plot`}
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
      <ParetoFigureFoot
        xAxisControl={
          <GraphToggle
            legend="X axis"
            // Each choice names what the axis would plot: a ratio such as Cost× across several benchmarks, the measured amount for one.
            options={(Object.keys(frontierBenchmarkAxisConfig) as FrontierBenchmarkAxisKey[]).map(
              (key) => ({ key, label: frontierBenchmarkAxisConfigFor(key, aggregate).shortLabel }),
            )}
            selectedKey={axisKey}
            onSelect={setAxisKey}
          />
        }
        showVariants={showVariants}
        onShowVariantsChange={onShowVariantsChange}
      />
      {/* The caption and evidence read on the page; an exported image is the figure alone. */}
      <div className={styles.figureCaption} data-capture-exclude>
        <p>
          {PARETO_CAPTION}
          {rows.length > 0 && explanation ? ` ${explanation}` : ""}
        </p>
        {note == null ? null : <p className={styles.captionNote}>{note}</p>}
      </div>
      {rows.length > 0 && needsEvidence && aggregate ? (
        <CommonEvidence
          comparison={{ ...comparison, rows }}
          benchmarkOptions={benchmarkOptions}
          activeBenchmarkKeys={activeKeys}
          axisKey={axisKey}
          publishedPerformance={publishedPerformance}
          showVariants={showVariants}
        />
      ) : null}
    </Panel>
  );
});
