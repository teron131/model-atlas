"use client";

/** Stateless SVG drawing primitives and shared plot geometry for Model Atlas charts. */

import { clamp } from "../../../../src/model-atlas/numeric";
import type { ModelAtlasPublishedModel } from "../../../../src/model-atlas/stats/types";
import type { Margin } from "../types";
import type { PointLabelPlacement } from "./label-placement";
import { scoreQuadrilateralPoints } from "./score-quadrilateral";

import styles from "../graphs.module.css";

export type PlotBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const SCATTER_CHART_HEIGHT = 600;
export const SCATTER_CHART_MARGIN: Margin = {
  top: 28,
  right: 34,
  bottom: 70,
  left: 62,
};
export const SCATTER_CHART_WIDTH = 960;

const SVG_NUMBER_DECIMALS = 3;

/** Reserve enough compact-width space for enlarged axis labels without changing the plot origin between score bases. */
export function scatterChartMargin(margin: Margin, compact: boolean): Margin {
  return compact ? { ...margin, left: Math.max(margin.left, 84) } : margin;
}

/** Return stable SVG number attributes across server and client rendering. */
function stableSvgNumber(value: number): number {
  return Number(value.toFixed(SVG_NUMBER_DECIMALS));
}

/** Wrap a D3 scale so generated SVG coordinates use stable precision. */
export function stableSvgScale(scale: (value: number) => number) {
  return (value: number) => stableSvgNumber(scale(value));
}

/** Draw a fixed-compass score silhouette: Intelligence up, Agentic right, Speed left, Value down. */
export function ModelScoreMark({
  model,
  cx,
  cy,
  radius,
  fill,
  stroke,
  strokeWidth,
  className,
  opacity = 1,
  clearance = 0,
}: {
  model: ModelAtlasPublishedModel;
  cx: number;
  cy: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  className?: string;
  opacity?: number;
  clearance?: number;
}) {
  const points = scoreQuadrilateralPoints(model, cx, cy, radius)
    .map(({ x, y }) => `${stableSvgNumber(x)},${stableSvgNumber(y)}`)
    .join(" ");
  return (
    <>
      {clearance > 0 ? (
        <polygon
          aria-hidden="true"
          points={points}
          fill="var(--paper)"
          stroke="var(--paper)"
          strokeWidth={clearance * 2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <polygon
        className={className}
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={opacity}
      />
    </>
  );
}

/** Calculate drawable chart bounds from an SVG size and margin. */
export function plotBoundsFor(width: number, height: number, margin: Margin): PlotBounds {
  return {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
  };
}

export function MedianCross({
  x,
  y,
  bounds,
  xLabel,
  yLabel,
  yLabelInside = false,
}: {
  x: number;
  y: number;
  bounds: PlotBounds;
  xLabel: string;
  yLabel: string;
  yLabelInside?: boolean;
}) {
  return (
    <>
      <line className={styles.medianAxis} x1={x} x2={x} y1={bounds.top} y2={bounds.bottom} />
      <line className={styles.medianAxis} x1={bounds.left} x2={bounds.right} y1={y} y2={y} />
      <text className={styles.medianLabel} x={x} y={bounds.top - 8} textAnchor="middle">
        {xLabel}
      </text>
      <text
        className={styles.medianLabel}
        x={yLabelInside ? bounds.right - 8 : bounds.right + 12}
        y={y + 5}
        textAnchor={yLabelInside ? "end" : undefined}
      >
        {yLabel}
      </text>
    </>
  );
}

export function XAxisTicks({
  ticks,
  xPoint,
  y,
  format,
  keyPrefix,
  tickLength = 7,
  labelOffset = 24,
  labelEvery = 1,
  labelMinGap = 0,
}: {
  ticks: number[];
  xPoint: (value: number) => number;
  y: number;
  format: (value: number) => string;
  keyPrefix: string;
  tickLength?: number;
  labelOffset?: number;
  labelEvery?: number;
  labelMinGap?: number;
}) {
  let lastLabelX = Number.NEGATIVE_INFINITY;
  const labelVisibility = ticks.map((tick, index) => {
    if (index % labelEvery !== 0) {
      return false;
    }
    const x = xPoint(tick);
    if (x - lastLabelX < labelMinGap) {
      return false;
    }
    lastLabelX = x;
    return true;
  });
  return ticks.map((tick, index) => (
    <g key={`${keyPrefix}-x-${tick}`}>
      <line
        className={styles.axisTick}
        x1={xPoint(tick)}
        x2={xPoint(tick)}
        y1={y}
        y2={y + tickLength}
      />
      {labelVisibility[index] ? (
        <text className={styles.axisLabel} x={xPoint(tick)} y={y + labelOffset} textAnchor="middle">
          {format(tick)}
        </text>
      ) : null}
    </g>
  ));
}

export function YAxisTicks({
  ticks,
  yPoint,
  x,
  format,
  keyPrefix,
  tickLength = 7,
  labelOffset = 15,
}: {
  ticks: number[];
  yPoint: (value: number) => number;
  x: number;
  format: (value: number) => string;
  keyPrefix: string;
  tickLength?: number;
  labelOffset?: number;
}) {
  return ticks.map((tick) => (
    <g key={`${keyPrefix}-y-${tick}`}>
      <line
        className={styles.axisTick}
        x1={x - tickLength}
        x2={x}
        y1={yPoint(tick)}
        y2={yPoint(tick)}
      />
      <text className={styles.axisLabel} x={x - labelOffset} y={yPoint(tick) + 4} textAnchor="end">
        {format(tick)}
      </text>
    </g>
  ));
}

export function PlotFrame({
  width,
  height,
  margin,
}: {
  width: number;
  height: number;
  margin: Margin;
}) {
  return (
    <rect
      x={margin.left}
      y={margin.top}
      width={width - margin.left - margin.right}
      height={height - margin.top - margin.bottom}
      fill="var(--chart-range-fill)"
    />
  );
}

export function DirectionArrow({
  bounds,
  direction: directionName,
  label,
}: {
  bounds: PlotBounds;
  direction: "upper-left" | "upper-right";
  label: string;
}) {
  const direction = directionName === "upper-right" ? 1 : -1;
  const edgeInset = 8;
  const tipX = directionName === "upper-right" ? bounds.right - edgeInset : bounds.left + edgeInset;
  const tipY = bounds.top + edgeInset;
  const unit = 1 / Math.SQRT2;
  const axis: [number, number] = [direction * unit, -unit];
  const normal: [number, number] = [unit, direction * unit];
  const length = 19;
  const headLength = 8.8;
  const tailWidth = 6.2;
  const headWidth = 13.8;
  const point = (axisOffset: number, normalOffset: number): [number, number] => [
    tipX - axis[0] * axisOffset + normal[0] * normalOffset,
    tipY - axis[1] * axisOffset + normal[1] * normalOffset,
  ];
  const pointCoordinates: [number, number][] = [
    point(length, tailWidth / 2),
    point(headLength, tailWidth / 2),
    point(headLength, headWidth / 2),
    [tipX, tipY],
    point(headLength, -headWidth / 2),
    point(headLength, -tailWidth / 2),
    point(length, -tailWidth / 2),
  ];
  const points = pointCoordinates
    .map(([px, py]) => `${stableSvgNumber(px)},${stableSvgNumber(py)}`)
    .join(" ");

  return (
    <g className={styles.cornerDirection}>
      <polygon className={styles.cornerDirectionGlyph} points={points} />
      <text
        className={styles.cornerDirectionLabel}
        x={tipX - direction * 28}
        y={tipY + 4}
        textAnchor={directionName === "upper-right" ? "end" : "start"}
      >
        {label}
      </text>
    </g>
  );
}

export function AxisTitles({
  width,
  height,
  margin,
  x,
  y,
  compact = false,
  xTitleOffset,
}: {
  width: number;
  height: number;
  margin: Margin;
  x: string;
  y: string;
  compact?: boolean;
  xTitleOffset?: number;
}) {
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const plotBottom = height - margin.bottom;
  const plotMiddleY = margin.top + (height - margin.top - margin.bottom) / 2;
  const yTitleX = compact ? 14 : 18;
  const resolvedXTitleOffset = xTitleOffset ?? (compact ? 58 : 60);
  return (
    <>
      <text
        className={styles.axisTitle}
        x={plotLeft + (plotRight - plotLeft) / 2}
        y={plotBottom + resolvedXTitleOffset}
        textAnchor="middle"
      >
        {x}
      </text>
      <text
        className={styles.axisTitle}
        x={yTitleX}
        y={plotMiddleY}
        textAnchor="middle"
        transform={`rotate(-90 ${yTitleX} ${plotMiddleY})`}
      >
        {y}
      </text>
    </>
  );
}

export function TextPointLabel({
  label,
  cx,
  cy,
  width,
  margin,
  height,
  xOffset = 10,
  placement,
  italic = false,
}: {
  label: string;
  cx: number;
  cy: number;
  width: number;
  margin: Margin;
  height: number;
  xOffset?: number;
  placement?: PointLabelPlacement;
  italic?: boolean;
}) {
  const labelOnLeft = cx > width - margin.right - 135;
  const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
  const textX = placement?.x ?? (labelOnLeft ? cx - xOffset : cx + xOffset);
  const textY = placement?.y ?? y;
  const textAnchor = placement?.textAnchor ?? (labelOnLeft ? "end" : "start");
  return (
    <g>
      {placement?.line ? (
        <line
          className={styles.pointLabelLine}
          x1={stableSvgNumber(placement.line.x1)}
          y1={stableSvgNumber(placement.line.y1)}
          x2={stableSvgNumber(placement.line.x2)}
          y2={stableSvgNumber(placement.line.y2)}
        />
      ) : null}
      <text
        className={[styles.pointLabel, italic ? styles.previewLabel : ""].filter(Boolean).join(" ")}
        x={stableSvgNumber(textX)}
        y={stableSvgNumber(textY)}
        textAnchor={textAnchor}
      >
        {label}
      </text>
    </g>
  );
}
