"use client";

/** Frontier benchmark scatter plot owns axes, Pareto envelopes, labels, cursor projections, and effort lines. */

import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import { type CSSProperties, useState } from "react";

import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { reasoningVariantGroups } from "../../shared/model-display";
import { providerChartColor } from "../../shared/provider-theme";
import {
  CursorCapture,
  CursorProjectionLayer,
  PointHitTarget,
  useCursorProjection,
} from "../plot/Interaction";
import { calloutLabelPlacements } from "../plot/label-placement";
import { ParetoEnvelope, paretoFrontier } from "../plot/ParetoEnvelope";
import {
  AxisTitles,
  DirectionArrow,
  MedianCross,
  ModelScoreMark,
  plotBoundsFor,
  PlotFrame,
  SCATTER_CHART_HEIGHT,
  SCATTER_CHART_MARGIN,
  SCATTER_CHART_WIDTH,
  stableSvgScale,
  TextPointLabel,
  XAxisTicks,
  YAxisTicks,
} from "../plot/Primitives";
import {
  scoreQuadrilateralConnectorSegments,
  scoreQuadrilateralRadius,
} from "../plot/score-quadrilateral";
import type { HoverRow, HoverSetter, Margin } from "../types";
import { useCompactChartLayout } from "../use-media-query";

import styles from "../graphs.module.css";

type ScatterMetric<Row> = {
  label: string;
  get: (row: Row) => number;
  format: (value: number) => string;
  xHigherIsBetter?: boolean;
};

/** Render a generic frontier benchmark scatter plot with configurable axes, labels, effort connections, cursor projections, and hover payloads. */
export function FrontierBenchmarkScatterPlot<Row>({
  rows,
  metric,
  xDomain,
  xTicks: providedXTicks,
  yDomain,
  yTicks,
  yAxisLabel,
  keyPrefix,
  ariaLabel,
  getScore,
  getModel,
  getKey,
  getHoverRows,
  getHoverTitle,
  getLabel,
  connectReasoningVariants = false,
  setHover,
  width = SCATTER_CHART_WIDTH,
  height = SCATTER_CHART_HEIGHT,
  margin = SCATTER_CHART_MARGIN,
}: {
  rows: Row[];
  metric: ScatterMetric<Row>;
  xDomain: [number, number];
  xTicks?: number[];
  yDomain: [number, number];
  yTicks: number[];
  yAxisLabel: string;
  keyPrefix: string;
  ariaLabel: string;
  getScore: (row: Row) => number;
  getModel: (row: Row) => ModelAtlasModel;
  getKey: (row: Row) => string;
  getHoverRows: (row: Row) => HoverRow[];
  getHoverTitle?: (row: Row) => string;
  getLabel: (row: Row) => string;
  connectReasoningVariants?: boolean;
  setHover: HoverSetter;
  width?: number;
  height?: number;
  margin?: Margin;
}) {
  const compactLayout = useCompactChartLayout();
  const [highlightedVariantKey, setHighlightedVariantKey] = useState<string | null>(null);
  const chartMargin = compactLayout ? { ...margin, left: Math.max(margin.left, 84) } : margin;
  const { cursorProjection, cursorHandlers, setCursorProjection } = useCursorProjection();
  const metricValues = rows.map(metric.get);
  const xTicks =
    providedXTicks ??
    (metric.label === "Value Score"
      ? roundedLinearTicks(xDomain, 10)
      : linearTicksForValues(metricValues, metric.format));
  const x = scaleLinear()
    .domain(xDomain)
    .range([chartMargin.left, width - chartMargin.right])
    .clamp(true);
  const y = scaleLinear()
    .domain(yDomain)
    .range([height - chartMargin.bottom, chartMargin.top])
    .clamp(true);
  const xPoint = stableSvgScale(x);
  const yPoint = stableSvgScale(y);
  const plot = plotBoundsFor(width, height, chartMargin);
  const frontier = paretoFrontier(rows, {
    x: { get: metric.get, goal: metric.xHigherIsBetter ? "maximize" : "minimize" },
    y: { get: getScore, goal: "maximize" },
  });
  const medianMetric = median(rows.map(metric.get)) ?? xDomain[0];
  const medianScore = median(rows.map(getScore)) ?? yDomain[0];
  const markRadius = (row: Row) => scoreQuadrilateralRadius(getModel(row), 2.5, 8);
  const projectionPoints = rows.map((row) => {
    const xValue = metric.get(row);
    const yValue = getScore(row);
    return {
      x: xPoint(xValue),
      y: yPoint(yValue),
      xValue,
      yValue,
    };
  });
  const projectionHandlers = cursorHandlers({
    bounds: plot,
    points: projectionPoints,
  });
  const labelPlacements = calloutLabelPlacements({
    bounds: plot,
    obstacles: rows.map((row) => ({
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      radius: markRadius(row),
    })),
    labels: frontier.map((row, index) => ({
      key: getKey(row),
      label: getLabel(row),
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      radius: markRadius(row),
      priority: frontier.length - index,
    })),
  });
  const reasoningGroups = connectReasoningVariants ? reasoningVariantGroups(rows, getModel) : [];
  const reasoningGroupByRow = new Map(
    reasoningGroups.flatMap((group) => group.variants.map((row) => [row, group.key] as const)),
  );
  const activeRow = rows.find((row) => getKey(row) === highlightedVariantKey);
  const activeVariantKey = activeRow == null ? null : highlightedVariantKey;
  const activeReasoningGroup =
    activeRow == null ? null : (reasoningGroupByRow.get(activeRow) ?? null);
  const reasoningHighlightClass = (row: Row) => {
    if (activeVariantKey == null) {
      return "";
    }
    const isActiveVariant =
      activeReasoningGroup == null
        ? getKey(row) === activeVariantKey
        : reasoningGroupByRow.get(row) === activeReasoningGroup;
    return isActiveVariant ? styles.reasoningVariantPointActive : styles.reasoningVariantPointMuted;
  };
  const reasoningVariantLines = reasoningGroups.flatMap((group) => {
    const first = group.variants[0];
    if (first == null) {
      return [];
    }
    return [
      {
        key: group.key,
        color: providerChartColor(getModel(first).provider),
        segments: scoreQuadrilateralConnectorSegments(
          group.variants.map((row) => ({
            model: getModel(row),
            cx: xPoint(metric.get(row)),
            cy: yPoint(getScore(row)),
            radius: markRadius(row),
          })),
        ),
      },
    ];
  });
  const activeHighlightColor =
    activeRow == null ? undefined : providerChartColor(getModel(activeRow).provider);

  return (
    <div
      className={styles.chartWrap}
      style={{ "--chart-max-width": `${width}px` } as CSSProperties}
      role="group"
      aria-label={`${ariaLabel} viewport`}
      tabIndex={0}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        {...projectionHandlers}
      >
        <PlotFrame width={width} height={height} margin={margin} />
        <CursorCapture bounds={plot} />
        <YAxisTicks
          ticks={yTicks}
          yPoint={yPoint}
          x={plot.left}
          format={(tick) => `${tick}%`}
          keyPrefix={keyPrefix}
        />
        <XAxisTicks
          ticks={xTicks}
          xPoint={xPoint}
          y={plot.bottom}
          format={metric.format}
          keyPrefix={keyPrefix}
          labelMinGap={62}
        />
        <AxisTitles
          width={width}
          height={height}
          margin={chartMargin}
          x={metric.label}
          y={yAxisLabel}
          compact={compactLayout}
          xTitleOffset={50}
        />
        <MedianCross
          x={xPoint(medianMetric)}
          y={yPoint(medianScore)}
          bounds={plot}
          xLabel={`MED ${metric.format(medianMetric)}`}
          yLabel={`MED ${medianScore.toFixed(0)}%`}
          yLabelInside
        />
        <DirectionArrow
          bounds={plot}
          direction={metric.xHigherIsBetter ? "upper-right" : "upper-left"}
          label="Better"
        />
        <CursorProjectionLayer
          projection={cursorProjection}
          bounds={plot}
          xLabel={cursorProjection ? metric.format(cursorProjection.xValue) : ""}
          yLabel={cursorProjection ? `${cursorProjection.yValue.toFixed(1)}%` : ""}
          color={activeHighlightColor}
        />
        {reasoningVariantLines.flatMap((line) =>
          line.segments.map((segment, index) => (
            <line
              {...segment}
              aria-hidden="true"
              key={`${line.key}-${index}`}
              className={[
                styles.reasoningVariantLine,
                activeVariantKey == null
                  ? ""
                  : activeReasoningGroup != null && line.key === activeReasoningGroup
                    ? styles.reasoningVariantLineActive
                    : styles.reasoningVariantLineMuted,
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  "--line-color": line.color,
                } as CSSProperties
              }
              vectorEffect="non-scaling-stroke"
            />
          )),
        )}
        <ParetoEnvelope
          frontier={frontier}
          getX={metric.get}
          getY={getScore}
          xPoint={xPoint}
          yPoint={yPoint}
          getColor={(row) => providerChartColor(getModel(row).provider)}
          idPrefix={`${keyPrefix}-frontier`}
          className={[styles.frontier, activeVariantKey == null ? "" : styles.reasoningContextMuted]
            .filter(Boolean)
            .join(" ")}
        />
        {rows.map((row) => {
          const axisValue = metric.get(row);
          const score = getScore(row);
          const cx = xPoint(axisValue);
          const cy = yPoint(score);
          const model = getModel(row);
          const variantKey = getKey(row);
          return (
            <g
              className={[styles.reasoningVariantPoint, reasoningHighlightClass(row)]
                .filter(Boolean)
                .join(" ")}
              key={getKey(row)}
            >
              <ModelScoreMark
                className={styles.datavizPoint}
                model={model}
                cx={cx}
                cy={cy}
                radius={markRadius(row)}
                fill={providerChartColor(model.provider)}
                stroke="var(--chart-point-stroke)"
                strokeWidth={1}
                opacity={1}
                clearance={connectReasoningVariants ? 2 : 0}
              />
              <PointHitTarget
                cx={cx}
                cy={cy}
                model={model}
                rows={getHoverRows(row)}
                setHover={setHover}
                hoverTitle={getHoverTitle?.(row)}
                snapProjection={{
                  x: cx,
                  y: cy,
                  xValue: axisValue,
                  yValue: score,
                }}
                setCursorProjection={setCursorProjection}
                onActiveChange={(active) => setHighlightedVariantKey(active ? variantKey : null)}
              />
            </g>
          );
        })}
        {frontier.map((row) => {
          const axisValue = metric.get(row);
          const cx = xPoint(axisValue);
          const cy = yPoint(getScore(row));
          return (
            <g
              className={[styles.reasoningVariantPoint, reasoningHighlightClass(row)]
                .filter(Boolean)
                .join(" ")}
              key={`label-${getKey(row)}`}
            >
              <TextPointLabel
                label={getLabel(row)}
                cx={cx}
                cy={cy}
                width={width}
                margin={chartMargin}
                height={height}
                xOffset={markRadius(row) + 8}
                placement={labelPlacements.get(getKey(row))}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function linearTicksForValues(values: number[], format: (value: number) => string) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const low = Math.min(...finiteValues);
  const high = Math.max(...finiteValues);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return [];
  }
  if (low === high) {
    return [low];
  }
  const tickCount = 5;
  const ticks = Array.from(
    { length: tickCount },
    (_, index) => low + ((high - low) * index) / (tickCount - 1),
  );
  const labels = new Set<string>();
  return ticks.filter((tick) => {
    const label = format(tick);
    if (labels.has(label)) {
      return false;
    }
    labels.add(label);
    return true;
  });
}

function roundedLinearTicks([low, high]: [number, number], step: number) {
  const first = Math.ceil(low / step) * step;
  const last = Math.floor(high / step) * step;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) {
    return [];
  }
  return Array.from(
    { length: Math.floor((last - first) / step) + 1 },
    (_, index) => first + index * step,
  );
}
