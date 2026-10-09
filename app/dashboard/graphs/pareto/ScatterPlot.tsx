"use client";

/** Frontier benchmark scatter plot owns axes, the Pareto frontier horizon, labels, cursor projections, and effort lines. */

import { median } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { type ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { reasoningVariantGroups } from "../../shared/model-display";
import { providerChartColor } from "../../shared/provider-theme";
import { formatResourceRatio } from "../../shared/resource-ratio-display";
import { type HoverRow, type HoverSetter, pointHover } from "../hover-state";
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
import { paretoFrontier } from "../plot/pareto-frontier";
import {
  AxisTitles,
  DirectionArrow,
  FrontierHorizon,
  horizonRim,
  type Margin,
  MedianCross,
  plotBoundsFor,
  PlotFrame,
  SCATTER_CHART_HEIGHT,
  SCATTER_CHART_WIDTH,
  scatterChartMargin,
  stableSvgNumber,
  stableSvgScale,
  starCore,
  StarGlows,
  TextPointLabel,
  useLabelSizes,
  XAxisTicks,
  YAxisTicks,
} from "../plot/Primitives";
import { starConnectorSegments, starMarkRadius } from "../plot/star-marks";
import { useChartWidth } from "../use-chart-layout";

import styles from "../graphs.module.css";

type ScatterMetric<Row> = {
  label: string;
  /** What the X axis measures, as a frontier step names its trade: `6.3× cost`, `−12.3 Speed Score`. */
  noun: string;
  get: (row: Row) => number;
  format: (value: number) => string;
  xHigherIsBetter?: boolean;
  logarithmic?: boolean;
};

const PLOT_EDGE_GUTTER = 20;
const LABEL_EDGE_GUTTER = 12;
const DIRECTION_LABEL_WIDTH = 100;
const DIRECTION_LABEL_HEIGHT = 32;
// Reserve room above the highest score for full model callouts.
const PLOT_TOP_GUTTER = 48;
const MEDIAN_LABEL_CLEARANCE = 64;
const HOVER_EXIT_DELAY_MS = 150;

/** Render a generic frontier benchmark scatter plot with configurable axes, labels, effort connections, cursor projections, and hover payloads. */
export function FrontierBenchmarkScatterPlot<Row>({
  rows,
  metric,
  xDomain,
  xTicks,
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
  margin,
}: {
  rows: Row[];
  metric: ScatterMetric<Row>;
  xDomain: [number, number];
  xTicks: number[];
  yDomain: [number, number];
  yTicks: number[];
  yAxisLabel: string;
  formatScore: (value: number) => string;
  keyPrefix: string;
  ariaLabel: string;
  getScore: (row: Row) => number;
  getModel: (row: Row) => ModelAtlasModel;
  getKey: (row: Row) => string;
  getHoverRows: (row: Row) => HoverRow[];
  getHoverTitle?: (row: Row) => string;
  getLabel: (row: Row) => string;
  connectReasoningVariants?: boolean;
  compactLayout: boolean;
  setHover: HoverSetter;
  margin: Margin;
}) {
  const { chartRef, width } = useChartWidth(SCATTER_CHART_WIDTH);
  const height = compactLayout ? Math.min(SCATTER_CHART_HEIGHT, 400) : SCATTER_CHART_HEIGHT;
  const [highlightedVariantKey, setHighlightedVariantKey] = useVariantHighlight();
  const guideMaskId = useId();
  const chartMargin = scatterChartMargin(margin, compactLayout);
  const { cursorProjection, cursorHandlers, setCursorProjection } = useCursorProjection();
  const plot = plotBoundsFor(width, height, chartMargin);
  const edgeGutter = compactLayout ? 12 : PLOT_EDGE_GUTTER;
  const topGutter = compactLayout ? 24 : PLOT_TOP_GUTTER;
  const x = (metric.logarithmic ? scaleLog().base(10) : scaleLinear())
    .domain(xDomain)
    .range([plot.left + edgeGutter, plot.right - edgeGutter])
    .clamp(true);
  const y = scaleLinear()
    .domain(yDomain)
    .range([plot.bottom - edgeGutter, plot.top + topGutter])
    .clamp(true);
  const xPoint = stableSvgScale(x);
  const yPoint = stableSvgScale(y);
  const frontier = paretoFrontier(rows, {
    x: { get: metric.get, goal: metric.xHigherIsBetter ? "maximize" : "minimize" },
    y: { get: getScore, goal: "maximize" },
  });
  const medianMetric = median(rows.map(metric.get)) ?? xDomain[0];
  const medianScore = median(rows.map(getScore)) ?? yDomain[0];
  const frontierRows = new Set(frontier);
  // The reached region continues away from the better side: rightward when lower resources win.
  const horizonOpenSide = metric.xHigherIsBetter ? "left" : "right";
  const frontierPoints = frontier.map((row) => ({
    x: xPoint(metric.get(row)),
    y: yPoint(getScore(row)),
  }));
  // The frontier step being read, by the position of the model it reaches.
  const [activeStep, setActiveStep] = useState<number | null>(null);
  // A frontier model's card states its step from the frontier model before it in X order, whether read from its star or from the frontier between them.
  const hoverRows = (row: Row): HoverRow[] => {
    const index = frontier.indexOf(row);
    if (index < 1) return getHoverRows(row);
    const from = frontier[index - 1]!;
    return [...getHoverRows(row), [`From ${getLabel(from)}`, stepTrade(from, row)]];
  };
  const hoverFor = (event: PointerEvent<Element>, row: Row) =>
    pointHover(event, getModel(row), hoverRows(row), getHoverTitle?.(row));
  /** One step's trade, worded as the sheet's effort steps are: the signed score change at the X change, a multiple on log axes and a signed amount on linear ones. */
  const stepTrade = (from: Row, to: Row) => {
    const gain = getScore(to) - getScore(from);
    const [fromX, toX] = [metric.get(from), metric.get(to)];
    const change = metric.logarithmic
      ? formatResourceRatio(toX / fromX)
      : `${toX < fromX ? "−" : "+"}${metric.format(Math.abs(toX - fromX))}`;
    return `${gain < 0 ? "−" : "+"}${Math.abs(gain).toFixed(1)} at ${change} ${metric.noun}`;
  };
  // A mid-scoring model matches the leaderboard's score star: 6px wide, or 5px on compact layouts.
  const [minMarkRadius, maxMarkRadius] = compactLayout ? [1.75, 3.25] : [2, 3.75];
  const markRadius = (row: Row) => starMarkRadius(getModel(row), minMarkRadius, maxMarkRadius);
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
  const persistentLabels = compactLayout
    ? [...frontier].sort((a, b) => getScore(b) - getScore(a)).slice(0, 3)
    : frontier;
  const labeledRows = [...new Set([...highlightedRows, ...persistentLabels])];
  const { svgRef, labelSizes } = useLabelSizes(labeledRows.map(getLabel).join("\0"), compactLayout);
  const layoutRequest: Parameters<typeof calloutLabelPlacements>[0] = {
    bounds: {
      left: plot.left + LABEL_EDGE_GUTTER,
      right: plot.right - LABEL_EDGE_GUTTER,
      top: plot.top + LABEL_EDGE_GUTTER,
      bottom: plot.bottom - LABEL_EDGE_GUTTER,
    },
    // Protect the corner direction glyph and caption from both text and leaders.
    reservedBoxes: [
      {
        left: metric.xHigherIsBetter ? plot.right - DIRECTION_LABEL_WIDTH : plot.left,
        right: metric.xHigherIsBetter ? plot.right : plot.left + DIRECTION_LABEL_WIDTH,
        top: plot.top,
        bottom: plot.top + DIRECTION_LABEL_HEIGHT,
      },
    ],
    obstacles: rows.map((row) => ({
      key: getKey(row),
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      radius: markRadius(row),
      weight: activeReasoningGroup != null && !highlightedRows.includes(row) ? 0.15 : 1,
    })),
    segments: [
      horizonRim(frontierPoints, plot, horizonOpenSide),
      ...reasoningGroups
        .filter((group) => group.key === activeReasoningGroup)
        .map((group) =>
          group.variants.map((row) => ({ x: xPoint(metric.get(row)), y: yPoint(getScore(row)) })),
        ),
    ].flatMap((points) =>
      points.slice(1).map((point, index) => ({
        x1: points[index]!.x,
        y1: points[index]!.y,
        x2: point.x,
        y2: point.y,
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
  const placementCache = useRef(new Map<string, Map<string, PointLabelPlacement>>());
  const labelPlacements = useMemo(() => {
    const cache = placementCache.current;
    const cached = cache.get(layoutKey);
    if (cached) return cached;
    const placements = calloutLabelPlacements(JSON.parse(layoutKey));
    // Retain at most one layout per displayed point plus the resting view; geometry changes use new keys.
    while (cache.size >= rows.length + 1) cache.delete(cache.keys().next().value!);
    cache.set(layoutKey, placements);
    return placements;
  }, [layoutKey, rows.length]);
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
  const isHighlighted = (row: Row) =>
    activeReasoningGroup == null
      ? getKey(row) === activeVariantKey
      : reasoningGroupByRow.get(row) === activeReasoningGroup;
  const variantClass = (row: Row) =>
    [
      styles.reasoningVariantPoint,
      activeVariantKey == null
        ? ""
        : isHighlighted(row)
          ? styles.reasoningVariantPointActive
          : styles.reasoningVariantPointMuted,
      getKey(row) === activeVariantKey ? styles.reasoningVariantPointSelected : "",
    ]
      .filter(Boolean)
      .join(" ");
  const reasoningVariantLines = reasoningGroups.flatMap((group) => {
    const first = group.variants[0];
    if (first == null) {
      return [];
    }
    return [
      {
        key: group.key,
        color: providerChartColor(getModel(first).provider),
        segments: starConnectorSegments(
          group.variants.map((row) => ({
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
      ref={chartRef}
      className={styles.chartWrap}
      style={{ "--chart-max-width": `${SCATTER_CHART_WIDTH}px` } as CSSProperties}
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
          insetRight={compactLayout ? plot.right : undefined}
          showGridLines={false}
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
          {metric.logarithmic ? (
            <line
              className={styles.medianAxis}
              x1={xPoint(1)}
              x2={xPoint(1)}
              y1={plot.top}
              y2={plot.bottom}
              strokeDasharray="3 4"
              aria-label="1× benchmark-median resource use"
            />
          ) : null}
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
              x1={stableSvgNumber(segment.x1)}
              y1={stableSvgNumber(segment.y1)}
              x2={stableSvgNumber(segment.x2)}
              y2={stableSvgNumber(segment.y2)}
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
        <FrontierHorizon
          points={frontierPoints}
          bounds={plot}
          open={horizonOpenSide}
          muted={activeVariantKey != null}
        />
        {/* Each step along the frontier answers the pointer with the trade it makes; the stars' own targets sit above it. */}
        {frontier.map((row, index) => {
          if (index === 0) return null;
          const segment = {
            x1: frontierPoints[index - 1]!.x,
            y1: frontierPoints[index - 1]!.y,
            x2: frontierPoints[index]!.x,
            y2: frontierPoints[index]!.y,
          };
          return (
            <g key={`step-${getKey(row)}`}>
              {activeStep === index ? <line className={styles.frontierStep} {...segment} /> : null}
              <line
                className={styles.frontierStepReach}
                data-capture-exclude
                {...segment}
                onPointerEnter={(event) => {
                  setActiveStep(index);
                  setHover(hoverFor(event, row));
                }}
                onPointerMove={(event) => setHover(hoverFor(event, row))}
                onPointerLeave={() => {
                  setActiveStep(null);
                  setHover(null);
                }}
              />
            </g>
          );
        })}
        {/* Only frontier models glow; a muted effort variant loses its glow while another model is hovered. */}
        <StarGlows
          bounds={plot}
          stars={frontier.map((row) => ({
            key: getKey(row),
            cx: xPoint(metric.get(row)),
            cy: yPoint(getScore(row)),
            radius: markRadius(row),
            color: providerChartColor(getModel(row).provider),
            emphasis: "frontier",
            opacity: activeVariantKey != null && !isHighlighted(row) ? 0 : 1,
          }))}
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
              <circle
                className={`${styles.starCore} ${styles.datavizPoint}`}
                cx={cx}
                cy={cy}
                {...starCore(markRadius(row), providerChartColor(model.provider))}
                opacity={frontierRows.has(row) ? 1 : 0.86}
              />
              <PointHitTarget
                cx={cx}
                cy={cy}
                model={model}
                rows={hoverRows(row)}
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
                setHover(hoverFor(event, row));
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
                  pointerEvents={compactLayout ? "none" : "all"}
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
