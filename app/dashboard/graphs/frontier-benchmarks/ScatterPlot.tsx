"use client";

/** Frontier benchmark scatter plot owns axes, Pareto envelopes, labels, cursor projections, and effort lines. */

import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type ModelAtlasPublishedModel } from "../../../../src/model-atlas/stats/types";
import { reasoningVariantGroups } from "../../shared/model-display";
import { providerChartColor } from "../../shared/provider-theme";
import { pointHover } from "../hover-state";
import {
  CursorCapture,
  CursorProjectionLayer,
  PointHitTarget,
  useCursorProjection,
} from "../plot/Interaction";
import {
  calloutLabelPlacements,
  type PointLabelPlacement,
  type PointLabelSize,
} from "../plot/label-placement";
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
  scatterChartMargin,
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

import styles from "../graphs.module.css";

type ScatterMetric<Row> = {
  label: string;
  get: (row: Row) => number;
  format: (value: number) => string;
  xHigherIsBetter?: boolean;
};

const EMPTY_CHART_TICKS = [0, 20, 40, 60, 80, 100];
const PLOT_EDGE_GUTTER = 9;
const MEDIAN_LABEL_CLEARANCE = 64;
const HOVER_EXIT_DELAY_MS = 150;
const TEXT_MEASUREMENT_TOLERANCE = 0.1;

/** Preserve the benchmark chart footprint when no benchmark evidence is selected. */
export function EmptyFrontierBenchmarkScatterPlot({
  compactLayout,
  xAxisLabel,
  xHigherIsBetter,
  yAxisLabel,
  formatScore,
}: {
  compactLayout: boolean;
  xAxisLabel: string;
  yAxisLabel: string;
  formatScore: (value: number) => string;
  xHigherIsBetter?: boolean;
}) {
  const width = SCATTER_CHART_WIDTH;
  const height = SCATTER_CHART_HEIGHT;
  const margin = scatterChartMargin(SCATTER_CHART_MARGIN, compactLayout);
  const plot = plotBoundsFor(width, height, margin);
  const xPoint = stableSvgScale(scaleLinear().domain([0, 100]).range([plot.left, plot.right]));
  const yPoint = stableSvgScale(scaleLinear().domain([0, 100]).range([plot.bottom, plot.top]));
  return (
    <div
      className={styles.chartWrap}
      style={{ "--chart-max-width": `${width}px` } as CSSProperties}
      role="group"
      aria-label="Empty frontier benchmark chart viewport"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Empty frontier benchmark chart"
      >
        <PlotFrame width={width} height={height} margin={margin} />
        <YAxisTicks
          ticks={EMPTY_CHART_TICKS}
          yPoint={yPoint}
          x={plot.left}
          format={formatScore}
          keyPrefix="empty-frontier-benchmarks"
        />
        <XAxisTicks
          ticks={EMPTY_CHART_TICKS}
          xPoint={xPoint}
          y={plot.bottom}
          format={(tick) => tick.toFixed(0)}
          keyPrefix="empty-frontier-benchmarks"
        />
        <AxisTitles
          width={width}
          height={height}
          margin={margin}
          x={xAxisLabel}
          y={yAxisLabel}
          compact={compactLayout}
          xTitleOffset={50}
        />
        <DirectionArrow
          bounds={plot}
          direction={xHigherIsBetter ? "upper-right" : "upper-left"}
          label="Better"
        />
      </svg>
    </div>
  );
}

/** Render a generic frontier benchmark scatter plot with configurable axes, labels, effort connections, cursor projections, and hover payloads. */
export function FrontierBenchmarkScatterPlot<Row>({
  rows,
  metric,
  xDomain,
  xTicks: providedXTicks,
  yDomain,
  yTicks,
  yAxisLabel,
  formatScore,
  keyPrefix,
  ariaLabel,
  getScore,
  getModel,
  getKey,
  getHoverRows,
  getHoverTitle,
  getLabel,
  connectReasoningVariants = false,
  compactLayout,
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
  formatScore: (value: number) => string;
  keyPrefix: string;
  ariaLabel: string;
  getScore: (row: Row) => number;
  getModel: (row: Row) => ModelAtlasPublishedModel;
  getKey: (row: Row) => string;
  getHoverRows: (row: Row) => HoverRow[];
  getHoverTitle?: (row: Row) => string;
  getLabel: (row: Row) => string;
  connectReasoningVariants?: boolean;
  compactLayout: boolean;
  setHover: HoverSetter;
  width?: number;
  height?: number;
  margin?: Margin;
}) {
  const [highlightedVariantKey, setHighlightedVariantKey] = useVariantHighlight();
  const guideMaskId = useId();
  const chartMargin = scatterChartMargin(margin, compactLayout);
  const { cursorProjection, cursorHandlers, setCursorProjection } = useCursorProjection();
  const metricValues = rows.map(metric.get);
  const xTicks =
    providedXTicks ??
    (metric.label === "Value Score"
      ? roundedLinearTicks(xDomain, 10)
      : linearTicksForValues(metricValues, metric.format));
  const plot = plotBoundsFor(width, height, chartMargin);
  const x = scaleLinear()
    .domain(xDomain)
    .range([plot.left + PLOT_EDGE_GUTTER, plot.right - PLOT_EDGE_GUTTER])
    .clamp(true);
  const y = scaleLinear()
    .domain(yDomain)
    .range([plot.bottom - PLOT_EDGE_GUTTER, plot.top + PLOT_EDGE_GUTTER])
    .clamp(true);
  const xPoint = stableSvgScale(x);
  const yPoint = stableSvgScale(y);
  const frontier = paretoFrontier(rows, {
    x: { get: metric.get, goal: metric.xHigherIsBetter ? "maximize" : "minimize" },
    y: { get: getScore, goal: "maximize" },
  });
  const medianMetric = median(rows.map(metric.get)) ?? xDomain[0];
  const medianScore = median(rows.map(getScore)) ?? yDomain[0];
  const markRadius = (row: Row) => scoreQuadrilateralRadius(getModel(row), 3, 7);
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
  const reasoningGroups = connectReasoningVariants ? reasoningVariantGroups(rows, getModel) : [];
  const reasoningGroupByRow = new Map(
    reasoningGroups.flatMap((group) => group.variants.map((row) => [row, group.key] as const)),
  );
  const activeRow = rows.find((row) => getKey(row) === highlightedVariantKey);
  const activeVariantKey = activeRow == null ? null : highlightedVariantKey;
  const activeReasoningGroup =
    activeRow == null ? null : (reasoningGroupByRow.get(activeRow) ?? null);
  // Place the hovered family's labels first so every connected effort remains identifiable.
  const highlightedRows =
    reasoningGroups.find((group) => group.key === activeReasoningGroup)?.variants ??
    (activeRow == null ? [] : [activeRow]);
  const labeledRows = [...new Set([...highlightedRows, ...frontier])];
  const { svgRef, labelSizes } = useLabelSizes(labeledRows.map(getLabel).join("\0"), compactLayout);
  const layoutRequest: Parameters<typeof calloutLabelPlacements>[0] = {
    bounds: plot,
    obstacles: rows.map((row) => ({
      key: getKey(row),
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      radius: markRadius(row),
      weight: activeReasoningGroup != null && !highlightedRows.includes(row) ? 0.15 : 1,
    })),
    segments: [
      frontier,
      ...reasoningGroups
        .filter((group) => group.key === activeReasoningGroup)
        .map((group) => group.variants),
    ].flatMap((points) =>
      points.slice(1).map((row, index) => ({
        x1: xPoint(metric.get(points[index]!)),
        y1: yPoint(getScore(points[index]!)),
        x2: xPoint(metric.get(row)),
        y2: yPoint(getScore(row)),
      })),
    ),
    labels: labeledRows.map((row, index) => ({
      key: getKey(row),
      label: getLabel(row),
      size: labelSizes[getLabel(row)],
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      radius: markRadius(row),
      priority: labeledRows.length - index,
    })),
  };
  // Pointer projections rerender this chart; only changed label geometry should run the search.
  const layoutKey = JSON.stringify(layoutRequest);
  const labelPlacements = useMemo(() => calloutLabelPlacements(JSON.parse(layoutKey)), [layoutKey]);
  const callouts = labeledRows.map((row) => {
    const key = getKey(row);
    const label = getLabel(row);
    return {
      key,
      row,
      label,
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      placement: labelPlacements.get(key),
      size: labelSizes[label],
    };
  });
  const variantClass = (row: Row) => {
    const selected = getKey(row) === activeVariantKey;
    const highlighted =
      activeReasoningGroup == null
        ? selected
        : reasoningGroupByRow.get(row) === activeReasoningGroup;
    return [
      styles.reasoningVariantPoint,
      activeVariantKey == null
        ? ""
        : highlighted
          ? styles.reasoningVariantPointActive
          : styles.reasoningVariantPointMuted,
      selected ? styles.reasoningVariantPointSelected : "",
    ]
      .filter(Boolean)
      .join(" ");
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
        ref={svgRef}
        {...projectionHandlers}
      >
        <defs>
          <mask
            id={guideMaskId}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <rect width={width} height={height} fill="white" />
            {callouts.map(({ key, placement, size }) => {
              if (!placement || !size) return null;
              return (
                <g key={key}>
                  <rect {...labelRect(placement, size, 4)} fill="black" />
                  {placement.line ? (
                    <line {...placement.line} stroke="black" strokeWidth={6} />
                  ) : null}
                </g>
              );
            })}
          </mask>
        </defs>
        <PlotFrame width={width} height={height} margin={chartMargin} />
        <CursorCapture bounds={plot} />
        <YAxisTicks
          ticks={yTicks}
          yPoint={yPoint}
          x={plot.left}
          format={formatScore}
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
        <g mask={`url(#${guideMaskId})`}>
          <MedianCross
            x={xPoint(medianMetric)}
            y={yPoint(medianScore)}
            bounds={plot}
            xLabel={
              cursorProjection &&
              Math.abs(cursorProjection.x - xPoint(medianMetric)) < MEDIAN_LABEL_CLEARANCE
                ? ""
                : `MED ${metric.format(medianMetric)}`
            }
            yLabel={`MED ${formatScore(medianScore)}`}
            yLabelInside
          />
        </g>
        <DirectionArrow
          bounds={plot}
          direction={metric.xHigherIsBetter ? "upper-right" : "upper-left"}
          label="Better"
        />
        <g mask={`url(#${guideMaskId})`}>
          <CursorProjectionLayer
            projection={cursorProjection}
            bounds={plot}
            xLabel={cursorProjection ? metric.format(cursorProjection.xValue) : ""}
            yLabel={cursorProjection ? formatScore(cursorProjection.yValue) : ""}
            color={activeHighlightColor}
          />
        </g>
        {reasoningVariantLines.flatMap((line) =>
          line.segments.map((segment, index) => (
            <line
              {...segment}
              aria-hidden="true"
              key={`${line.key}-${index}`}
              className={[
                styles.reasoningVariantLine,
                activeReasoningGroup != null && line.key === activeReasoningGroup
                  ? styles.reasoningVariantLineActive
                  : "",
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
            <g className={variantClass(row)} key={getKey(row)}>
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
                clearance={connectReasoningVariants ? 0.5 : 0}
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
        {callouts.map(({ key, row, label, cx, cy, placement, size }) => {
          return (
            <g
              className={variantClass(row)}
              key={`label-${key}`}
              onPointerEnter={(event) => {
                setHighlightedVariantKey(getKey(row));
                setHover(pointHover(event, getModel(row), getHoverRows(row), getHoverTitle?.(row)));
              }}
              onPointerLeave={() => {
                setHighlightedVariantKey(null);
                setHover(null);
              }}
            >
              {placement && size ? (
                <rect
                  data-capture-exclude
                  {...labelRect(placement, size, 3)}
                  fill="transparent"
                  pointerEvents="all"
                  aria-hidden="true"
                />
              ) : null}
              <TextPointLabel
                label={label}
                cx={cx}
                cy={cy}
                width={width}
                margin={chartMargin}
                height={height}
                xOffset={markRadius(row) + 8}
                placement={placement}
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

/** Measure SVG text in chart coordinates after fonts load; cache sizes so point movement does not trigger another measurement. */
function useLabelSizes(textKey: string, compactLayout: boolean) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelSizes, setLabelSizes] = useState<Record<string, PointLabelSize>>({});
  useLayoutEffect(() => {
    let disposed = false;
    const measure = () => {
      if (disposed || !svgRef.current) return;
      const measured: Record<string, PointLabelSize> = {};
      for (const text of Array.from(
        svgRef.current.querySelectorAll<SVGTextElement>(`text.${styles.pointLabel}`),
      )) {
        const box = text.getBBox();
        const baseline = text.y.baseVal.getItem(0).value;
        measured[text.textContent ?? ""] = {
          width: box.width,
          ascent: baseline - box.y,
          descent: box.y + box.height - baseline,
        };
      }
      setLabelSizes((previous) => {
        const changed = Object.entries(measured).some(([key, size]) => {
          const old = previous[key];
          return (
            !old ||
            Math.abs(old.width - size.width) > TEXT_MEASUREMENT_TOLERANCE ||
            Math.abs(old.ascent - size.ascent) > TEXT_MEASUREMENT_TOLERANCE ||
            Math.abs(old.descent - size.descent) > TEXT_MEASUREMENT_TOLERANCE
          );
        });
        return changed ? { ...previous, ...measured } : previous;
      });
    };
    measure();
    void document.fonts.ready.then(measure);
    const observer = new ResizeObserver(measure);
    if (svgRef.current) observer.observe(svgRef.current);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [textKey, compactLayout]);
  return { svgRef, labelSizes };
}

/** Bridge the small pointer gap between a point and its temporary label without retaining an abandoned hover. */
function useVariantHighlight() {
  const [key, setKey] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearTimer.current != null) clearTimeout(clearTimer.current);
    },
    [],
  );
  const highlight = (next: string | null) => {
    if (clearTimer.current != null) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    if (next == null) clearTimer.current = setTimeout(() => setKey(null), HOVER_EXIT_DELAY_MS);
    else setKey(next);
  };
  return [key, highlight] as const;
}

/** Hit areas and guide masks must use the same measured text geometry, with their own clearance. */
function labelRect(placement: PointLabelPlacement, size: PointLabelSize, padding: number) {
  return {
    x: placement.x - padding,
    y: placement.y - size.ascent - padding,
    width: size.width + padding * 2,
    height: size.ascent + size.descent + padding * 2,
  };
}
