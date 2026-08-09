/** Interaction metric matrix for dashboard scatter plots. */

import { extent, median } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { type CSSProperties, memo, useMemo, useState } from "react";

import type { BenchmarkPortfolio, ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelVariantKey } from "../shared/model-display";
import { providerChartColor } from "../shared/provider-theme";
import { linearAxisScale } from "./axis-scale";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { extremeLabelRows, valueDistribution } from "./chart-stats";
import { EmptyChart } from "./ChartComponents";
import { finiteValue, fmtTooltipScore } from "./format";
import { GraphToggle } from "./GraphToggle";
import { interactionXAxisTicks } from "./interaction-ticks";
import { calloutLabelPlacements } from "./label-placement";
import {
  correlationLabel,
  correlationValue,
  formatCorrelation,
  frontierBenchmarkScoreByModel,
  interactionConfigs,
  positiveDomain,
  shortLabel,
} from "./models";
import { Panel } from "./Panel";
import {
  AxisTitles,
  CursorCapture,
  CursorProjectionLayer,
  DirectionArrow,
  MedianCross,
  ModelPointLabel,
  ModelScoreMark,
  plotBoundsFor,
  PlotFrame,
  PointHitTarget,
  SCATTER_CHART_HEIGHT,
  SCATTER_CHART_MARGIN,
  SCATTER_CHART_WIDTH,
  stableSvgScale,
  useCursorProjection,
  XAxisTicks,
  YAxisTicks,
} from "./PlotPrimitives";
import { scoreQuadrilateralRadius } from "./score-quadrilateral";
import type { HoverRow, HoverSetter, InteractionConfig, InteractionContext, Point } from "./types";

import styles from "./graphs.module.css";

const INTERACTION_LABEL_METRICS = {
  fontSize: 11,
  charWidth: 6.5,
  lineHeight: 12,
  padding: 3,
};

export const InteractionMatrix = memo(function InteractionMatrix({
  models,
  benchmarkPortfolio,
  hasFullPayload,
  setHover,
}: {
  models: ModelAtlasModel[];
  benchmarkPortfolio: BenchmarkPortfolio;
  hasFullPayload: boolean;
  setHover: HoverSetter;
}) {
  const [selectedKey, setSelectedKey] = useState(interactionConfigs[0]?.key ?? "");
  const selectedConfig =
    interactionConfigs.find((config) => config.key === selectedKey) ?? interactionConfigs[0];
  const interactionContext = useMemo(
    () => ({
      frontierScoreByModel: frontierBenchmarkScoreByModel(models, benchmarkPortfolio),
    }),
    [models, benchmarkPortfolio],
  );
  if (!selectedConfig) {
    return null;
  }

  const xDistribution = interactionXDistribution(models, selectedConfig, interactionContext);

  return (
    <Panel
      captureWidth={SCATTER_CHART_WIDTH}
      sectionId="interaction-matrix"
      sectionLabel="Interaction view · Pairwise relationships"
      title="Intelligence Interaction Matrix"
      copy={
        <>
          Compare <em>Intelligence Score</em> with one price, speed, context, or benchmark measure
          at a time. CORR reports the strength and direction of the relationship.
        </>
      }
      summary={
        <BoxWhiskerSummary
          label={`${selectedConfig.fieldLabel} spread`}
          distribution={xDistribution.distribution}
          domainMin={xDistribution.domainMin}
          domainMax={xDistribution.domainMax}
          formatValue={xDistribution.formatValue}
          showObservedLabels
        />
      }
    >
      <div className={styles.interactionControls}>
        <GraphToggle
          legend="Interaction field"
          options={interactionConfigs.map((config) => ({
            key: config.key,
            label: config.fieldLabel,
            detail: interactionTabCorrelation(models, config, interactionContext),
          }))}
          selectedKey={selectedConfig.key}
          onSelect={setSelectedKey}
          layout="stacked"
        />
      </div>
      <div className={styles.interactionPlotBody}>
        <InteractionPlot
          models={models}
          config={selectedConfig}
          context={interactionContext}
          hasFullPayload={hasFullPayload}
          setHover={setHover}
        />
      </div>
    </Panel>
  );
});

function interactionXDistribution(
  models: ModelAtlasModel[],
  config: InteractionConfig,
  context: InteractionContext,
) {
  const formatValue = config.key === "context" ? config.format : config.tooltipFormat;
  const values = models
    .map((model) => config.get(model, context))
    .filter(
      (value): value is number =>
        value != null && Number.isFinite(value) && (!config.logScale || value > 0),
    );
  const distribution = valueDistribution(values);
  return {
    distribution,
    domainMax: distribution.max,
    domainMin: distribution.min,
    formatValue,
  };
}

function interactionTabCorrelation(
  models: ModelAtlasModel[],
  config: InteractionConfig,
  context: InteractionContext,
) {
  const pairs = models.flatMap((model) => {
    const xValue = config.get(model, context);
    const yValue = finiteValue(model.scores?.intelligence_score);
    if (xValue == null || yValue == null || (config.logScale && xValue <= 0)) {
      return [];
    }
    return [
      {
        x: config.logScale ? Math.log10(Math.max(xValue, 0.001)) : xValue,
        y: yValue,
      },
    ];
  });
  return formatCorrelation(correlationValue(pairs));
}

function InteractionPlot({
  models,
  config,
  context,
  hasFullPayload,
  setHover,
}: {
  models: ModelAtlasModel[];
  config: InteractionConfig;
  context: InteractionContext;
  hasFullPayload: boolean;
  setHover: HoverSetter;
}) {
  const { cursorProjection, cursorHandlers, setCursorProjection } = useCursorProjection();
  const modelPoints = models.map((model) => ({
    model,
    x: config.get(model, context),
    y: finiteValue(model.scores?.intelligence_score),
  }));
  const chartPoints = modelPoints.filter(
    (point): point is Point =>
      point.x != null && point.y != null && (!config.logScale || point.x > 0),
  );

  if (chartPoints.length === 0) {
    if (!hasFullPayload) {
      return null;
    }
    return (
      <div className={`${styles.chartWrap} ${styles.interactionPlot}`}>
        <div className={styles.interactionPlotHead}>
          <div className={styles.interactionTitle}>{config.title}</div>
          <div className={styles.interactionBadge}>r --</div>
        </div>
        <EmptyChart />
      </div>
    );
  }

  const width = SCATTER_CHART_WIDTH;
  const height = SCATTER_CHART_HEIGHT;
  const margin = SCATTER_CHART_MARGIN;
  const [rawMin, rawMax] = extent(chartPoints, (point) => point.x);
  const xMin = rawMin ?? 1;
  const xMax = rawMax ?? xMin * 2;
  const xAxis = config.logScale
    ? null
    : linearAxisScale(
        chartPoints.map((point) => point.x),
        {
          paddingRatio: 0.06,
        },
      );
  const xDomain: [number, number] = config.logScale
    ? positiveDomain(chartPoints.map((point) => point.x))
    : (xAxis?.domain ?? [0, 1]);
  const xTickDomain: [number, number] = xMin < xMax ? [xMin, xMax] : xDomain;
  const yValues = chartPoints.map((point) => point.y);
  const yAxis = linearAxisScale(yValues, {
    formatTick: (tick) => String(tick),
    max: 100,
    min: 0,
    minimumTicksWithoutExpansion: 4,
    paddingRatio: 0.06,
  });
  const yDomain = yAxis.domain;
  const yTicks = yAxis.ticks;
  const x = (config.logScale ? scaleLog() : scaleLinear())
    .domain(xDomain)
    .range([margin.left, width - margin.right])
    .clamp(true);
  const xTicks = interactionXAxisTicks(config, xTickDomain);
  const y = scaleLinear()
    .domain(yDomain)
    .range([height - margin.bottom, margin.top])
    .clamp(true);
  const xPoint = stableSvgScale(x);
  const yPoint = stableSvgScale(y);
  const plot = plotBoundsFor(width, height, margin);
  const transformX = (value: number) =>
    config.logScale ? Math.log10(Math.max(value, 0.001)) : value;
  const correlationText = correlationLabel(chartPoints, transformX);
  // Keep lower-is-better axes visually conventional: cheaper/faster remains left, while a small arrow marks the better corner.
  const bestCornerIsRight = !config.lowerIsBetter;
  const plottedPoints = chartPoints.slice(0, 130);
  const medianXValue = median(plottedPoints.map((point) => point.x)) ?? xDomain[0];
  const medianYValue = median(plottedPoints.map((point) => point.y)) ?? yDomain[0];
  const markRadius = (model: ModelAtlasModel) => scoreQuadrilateralRadius(model, 4, 7);
  const projectionPoints = plottedPoints.map((point) => ({
    x: xPoint(point.x),
    y: yPoint(point.y),
    xValue: point.x,
    yValue: point.y,
  }));
  const projectionHandlers = cursorHandlers({
    bounds: plot,
    points: projectionPoints,
  });
  const labeledPoints =
    config.key === "frontierScore"
      ? new Set(
          [...plottedPoints]
            .sort((left, right) => right.y - left.y || right.x - left.x)
            .slice(0, 3),
        )
      : extremeLabelRows(
          plottedPoints,
          (point) => modelVariantKey(point.model),
          (point) => point.x,
          (point) => point.y,
          { xHigherIsBetter: !config.lowerIsBetter },
        );
  const labelPlacements = calloutLabelPlacements({
    bounds: plot,
    obstacles: plottedPoints.map((point) => ({
      cx: xPoint(point.x),
      cy: yPoint(point.y),
      radius: markRadius(point.model),
    })),
    labels: plottedPoints
      .filter((point) => labeledPoints.has(point))
      .map((point, index) => ({
        key: modelVariantKey(point.model),
        label: shortLabel(point.model),
        cx: xPoint(point.x),
        cy: yPoint(point.y),
        radius: markRadius(point.model),
        priority: plottedPoints.length - index,
      })),
    ...INTERACTION_LABEL_METRICS,
  });

  return (
    <div
      className={`${styles.chartWrap} ${styles.interactionPlot}`}
      style={{ "--chart-max-width": `${width}px` } as CSSProperties}
      role="group"
      aria-label={`${config.title} chart viewport`}
      tabIndex={0}
    >
      <div className={styles.interactionPlotHead}>
        <div className={styles.interactionTitle}>{config.title}</div>
        <div className={styles.interactionBadge}>{correlationText}</div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${config.title} scatter plot`}
        {...projectionHandlers}
      >
        <PlotFrame width={width} height={height} margin={margin} />
        <CursorCapture bounds={plot} />
        <XAxisTicks
          ticks={xTicks}
          xPoint={xPoint}
          y={plot.bottom}
          format={config.format}
          keyPrefix={config.key}
        />
        <YAxisTicks
          ticks={yTicks}
          yPoint={yPoint}
          x={plot.left}
          format={(tick) => String(tick)}
          keyPrefix={config.key}
        />
        <AxisTitles
          width={width}
          height={height}
          margin={margin}
          x={config.xLabel}
          y="Intelligence Score"
          xTitleOffset={50}
        />
        <MedianCross
          x={xPoint(medianXValue)}
          y={yPoint(medianYValue)}
          bounds={plot}
          xLabel={`MED ${config.format(medianXValue)}`}
          yLabel={`MED ${medianYValue.toFixed(0)}`}
          yLabelInside
        />
        <CursorProjectionLayer
          projection={cursorProjection}
          bounds={plot}
          xLabel={cursorProjection ? config.tooltipFormat(cursorProjection.xValue) : ""}
          yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
        />
        <DirectionArrow
          bounds={plot}
          direction={bestCornerIsRight ? "upper-right" : "upper-left"}
          label="Better"
        />
        {plottedPoints.map((point) => {
          const cx = xPoint(point.x);
          const cy = yPoint(point.y);
          const rows: HoverRow[] = [
            ["Intelligence Score", fmtTooltipScore(point.y)],
            [config.hoverLabel ?? config.xLabel, config.tooltipFormat(point.x)],
          ];
          return (
            <g key={modelVariantKey(point.model) || `${point.x}-${point.y}`}>
              <ModelScoreMark
                className={styles.datavizPoint}
                model={point.model}
                cx={cx}
                cy={cy}
                radius={markRadius(point.model)}
                fill={providerChartColor(point.model.provider)}
                stroke="var(--chart-point-stroke)"
                strokeWidth={1}
                opacity={1}
              />
              <PointHitTarget
                cx={cx}
                cy={cy}
                model={point.model}
                rows={rows}
                setHover={setHover}
                snapProjection={{
                  x: cx,
                  y: cy,
                  xValue: point.x,
                  yValue: point.y,
                }}
                setCursorProjection={setCursorProjection}
              />
            </g>
          );
        })}
        {plottedPoints.map((point) =>
          labeledPoints.has(point) ? (
            <ModelPointLabel
              key={`label-${modelVariantKey(point.model) || `${point.x}-${point.y}`}`}
              model={point.model}
              cx={xPoint(point.x)}
              cy={yPoint(point.y)}
              width={width}
              margin={margin}
              height={height}
              placement={labelPlacements.get(modelVariantKey(point.model))}
            />
          ) : null,
        )}
      </svg>
      {config.insight && <div className={styles.interactionRead}>{config.insight}</div>}
    </div>
  );
}
