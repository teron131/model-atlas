/** One comparison surface owns its shareable performance, evidence, and resource selections, plotting published scores or selected benchmarks against measured resources or published resource scores. */

import { memo, useMemo, useState } from "react";

import { isAggregateIndex } from "../../../../src/model-atlas/benchmarks/index-policy";
import { canonicalModelKey } from "../../../../src/model-atlas/identity/normalization";
import { collapsedModels, modelVariantKey } from "../../../../src/model-atlas/stats/model-variants";
import {
  type ModelAtlasModel,
  type ModelAtlasPayload,
} from "../../../../src/model-atlas/stats/types";
import { captureFileToken } from "../../capture/png";
import { ResearchRegion } from "../../ResearchRegions";
import { modelName, shortLabel } from "../../shared/model-display";
import { modelSearchDocument } from "../../shared/model-filters";
import { modelSuggestionRow } from "../../shared/ModelSuggestions";
import { updateDashboardUrl, useUrlState } from "../../use-url-state";
import {
  ChartFind,
  type ChartFindState,
  chartFindTargets,
  EMPTY_CHART_FIND,
  termTargets,
} from "../ChartFind";
import { finite, formatTooltipNumber, formatTooltipScore } from "../format";
import { GraphToggle } from "../GraphToggle";
import { scoreAxisScale } from "../plot/axis-scale";
import { SCATTER_CHART_MARGIN } from "../plot/Primitives";
import {
  automaticResourceKeys,
  FRONTIER_AXIS_KEYS,
  frontierBenchmarkCorrelationByBenchmark,
  frontierBenchmarkOptions,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  isScoreAxis,
  performanceComparisonRows,
  positiveMetric,
  referenceFrontierBenchmarkRows,
} from "./analysis";
import { BenchmarkSelect } from "./BenchmarkSelect";
import { commonBenchmarkComparison } from "./common-evidence";
import { CommonEvidence } from "./CommonEvidence";
import { PARETO_CAPTION, ParetoFigureFoot, ParetoFigureTop } from "./Figure";
import {
  frontierAxisDescription,
  frontierAxisMetricLabel,
  frontierBenchmarkAxisConfig,
  frontierBenchmarkAxisConfigFor,
  frontierBenchmarkReadoutFacts,
  frontierScoreAxisScale,
  frontierXAxisScale,
} from "./presentation";
import { FrontierBenchmarkScatterPlot } from "./ScatterPlot";

import styles from "../graphs.module.css";

type ParetoPanelProps = {
  payload: ModelAtlasPayload;
  models: ModelAtlasModel[];
  /** Every reasoning variant through the dashboard filters, for the evidence; `models` itself while the plot shows variants. */
  variantModels: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
  showVariants: boolean;
  onShowVariantsChange: (show: boolean) => void;
};

export const ParetoPanel = memo(function ParetoPanel({
  payload,
  models,
  variantModels,
  referenceModels,
  showVariants,
  onShowVariantsChange,
}: ParetoPanelProps) {
  const [performance, setPerformance] = useUrlState("performance");
  const [benchmarkKeys] = useUrlState("benchmark");
  const [axisKey, setAxisKey] = useUrlState("axes");
  const benchmarkRows = useMemo(
    () => frontierBenchmarkRows(models, payload.metadata.scoring.benchmark_portfolio, axisKey),
    [models, payload.metadata.scoring.benchmark_portfolio, axisKey],
  );
  const referenceRows = useMemo(
    () =>
      referenceFrontierBenchmarkRows(
        referenceModels,
        payload.metadata.scoring.benchmark_portfolio,
        axisKey,
      ),
    [referenceModels, payload.metadata.scoring.benchmark_portfolio, axisKey],
  );
  const benchmarkOptions = useMemo(
    () =>
      frontierBenchmarkOptions(benchmarkRows).map((option) => {
        if (isScoreAxis(axisKey)) return option;
        const measured = benchmarkRows.find(
          (row) =>
            row.baseBenchmarkKey === option.key &&
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
    () => commonBenchmarkComparison(benchmarkRows, referenceRows, activeKeys, axisKey),
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
  // The evidence lists every reasoning variant even while the plot shows one star per model, so each model's row counts and compares all its efforts.
  const evidence = useMemo(() => {
    if (variantModels === models) return { ...comparison, rows };
    const variantComparison = commonBenchmarkComparison(
      frontierBenchmarkRows(variantModels, payload.metadata.scoring.benchmark_portfolio, axisKey),
      referenceRows,
      activeKeys,
      axisKey,
    );
    return {
      ...variantComparison,
      rows: performanceComparisonRows(
        variantModels,
        variantComparison.rows,
        performance,
        axisKey,
      ).filter((row) => positiveMetric(axisConfig.get(row), aggregate || !resourceAxis)),
    };
  }, [
    variantModels,
    models,
    comparison,
    rows,
    payload.metadata.scoring.benchmark_portfolio,
    axisKey,
    referenceRows,
    activeKeys,
    performance,
    axisConfig,
    aggregate,
    resourceAxis,
  ]);
  const [find, setFind] = useState<ChartFindState>(EMPTY_CHART_FIND);
  const findDocuments = useMemo(
    () => plottedFamilies(rows).map((model) => modelSearchDocument(model, model)),
    [rows],
  );
  const matches = useMemo(() => {
    const targets = chartFindTargets(find, findDocuments, modelSuggestionRow);
    return targets == null ? null : new Set(targets.map(canonicalModelKey));
  }, [find, findDocuments]);
  const snapshotDocuments = useMemo(
    () => collapsedModels(referenceModels).map((model) => modelSearchDocument(model, model)),
    [referenceModels],
  );
  // A part that names no plotted model names the snapshot's best match and why the chart leaves it out.
  const nothingFound = (part: string) => {
    const missing = termTargets(part, snapshotDocuments, modelSuggestionRow)[0];
    if (missing == null) return "No model matches.";
    const family = canonicalModelKey(missing);
    return models.some((model) => canonicalModelKey(model) === family)
      ? `${modelName(missing)} has no data for these axes.`
      : `${modelName(missing)} is hidden by the dashboard filters.`;
  };
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
      : `${activeKeys.length} benchmarks and indexes`;
  const yLabel = publishedPerformance
    ? `${performance === "intelligence" ? "Intelligence" : "Agentic"} Score`
    : normalizedScore
      ? "Normalized Performance"
      : `${selectedLabel} Score`;
  const xLabel = frontierAxisMetricLabel(axisKey, aggregate, rows);
  const formatScoreTick =
    publishedPerformance || normalizedScore
      ? (value: number) => value.toFixed(0)
      : indexScore
        ? formatTooltipScore
        : (value: number) => `${value.toFixed(0)}%`;
  const xAxis = frontierXAxisScale(rows.map(axisConfig.get).filter(finite), axisKey, axisConfig);
  const scoreValues = rows.map((row) => row.score);
  const yAxis =
    publishedPerformance || normalizedScore
      ? scoreAxisScale(scoreValues, { formatTick: (value) => value.toFixed(0) })
      : frontierScoreAxisScale(scoreValues, indexScore);
  const chartMetric = useMemo(
    () => ({
      // Resource steps read as "6.3× cost"; score axes keep their own names.
      noun: isScoreAxis(axisKey)
        ? axisConfig.shortLabel
        : frontierBenchmarkAxisConfig[axisKey].shortLabel.toLowerCase(),
      get: (row: FrontierBenchmarkRow) => axisConfig.get(row)!,
      format: isScoreAxis(axisKey) ? formatTooltipNumber : axisConfig.format,
      xHigherIsBetter: axisConfig.xHigherIsBetter,
      logarithmic: axisConfig.logarithmic,
    }),
    [axisConfig, axisKey],
  );
  const evidenceLabel = publishedPerformance
    ? "automatic"
    : benchmarkKeys == null
      ? "all"
      : activeKeys.join("-") || "none";
  const captureFileName = `model-atlas-pareto-${performance}-${axisKey}${needsEvidence ? `-${captureFileToken(evidenceLabel)}` : ""}`;
  const explanation = publishedPerformance
    ? `Published ${yLabel}, which includes supported estimates and coverage adjustments${resourceAxis ? `, vs. ${aggregate ? "median-relative" : "measured"} resources from ${evidenceSummary || "selected evidence"}` : ""}.`
    : normalizedScore
      ? `${evidenceSummary}: performance normalized to the full reference population, with index overlap removed.`
      : null;
  const emptyMessage =
    activeKeys.length === 0 && needsEvidence && !publishedPerformance
      ? "Select an evidence source."
      : `No models have both ${yLabel} and ${axisConfig.shortLabel}. Change the evidence, axis, or filters.`;
  // Pareto's left margin also holds its score spread beside the tick labels.
  const plotMargin = { ...SCATTER_CHART_MARGIN, left: 96 };
  const note =
    rows.length > 0
      ? `${frontierAxisDescription(axisKey, aggregate, rows[0])}${showVariants ? " Hover a point or label to connect its model's variants in reasoning-effort order." : ""}`
      : null;
  return (
    <ResearchRegion
      id="pareto-analysis"
      className={styles.section}
      plane={styles.panel}
      capture={{ title: "Performance tradeoffs", fileName: captureFileName }}
    >
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
        find={
          rows.length === 0 ? null : (
            <ChartFind
              label="Locate models on the Pareto chart"
              find={find}
              documents={findDocuments}
              describe={modelSuggestionRow}
              onChange={setFind}
              nothingFound={nothingFound}
            />
          )
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
          getFacts={(row) =>
            frontierBenchmarkReadoutFacts(row, axisConfig, chartMetric.noun, performance)
          }
          getLabel={(row) => shortLabel(row.model)}
          connectReasoningVariants={showVariants}
          matches={matches}
          located={find.located}
        />
      )}
      <ParetoFigureFoot
        xAxisControl={
          <GraphToggle
            legend="X axis"
            // Each choice names what the axis would plot: a ratio such as Cost× across several benchmarks, the measured amount for one.
            options={FRONTIER_AXIS_KEYS.map((key) => ({
              key,
              label: frontierBenchmarkAxisConfigFor(key, aggregate).shortLabel,
            }))}
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
          comparison={evidence}
          benchmarkOptions={benchmarkOptions}
          activeBenchmarkKeys={activeKeys}
          axisKey={axisKey}
          publishedPerformance={publishedPerformance}
        />
      ) : null}
    </ResearchRegion>
  );
});

/** One model per plotted family, from its highest-scoring row and without an effort, as the find field offers and names it. */
function plottedFamilies(rows: readonly FrontierBenchmarkRow[]): ModelAtlasModel[] {
  const strongest = new Map<string, FrontierBenchmarkRow>();
  for (const row of rows) {
    const family = canonicalModelKey(row.model);
    const held = strongest.get(family);
    if (held == null || row.score > held.score) strongest.set(family, row);
  }
  return [...strongest.values()].map((row) => ({ ...row.model, reasoning_effort: null }));
}
