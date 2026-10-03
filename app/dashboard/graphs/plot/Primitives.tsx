"use client";

/** Shared SVG drawing, label measurement and plot geometry for Model Atlas charts. */

import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from "react";

import { clamp } from "../../../../src/model-atlas/math-utils";
import type { PointLabelPlacement, PointLabelSize } from "./label-placement";

import styles from "../graphs.module.css";

export type Margin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

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
export const SCATTER_CHART_WIDTH = 1120;

const SVG_NUMBER_DECIMALS = 3;

/** Keep compact titles above the plot and inset scale labels within its narrow gutters. */
export function scatterChartMargin(margin: Margin, compact: boolean): Margin {
  return compact ? { top: 48, right: 8, bottom: 60, left: 8 } : margin;
}

/** Return stable SVG number attributes across server and client rendering. */
export function stableSvgNumber(value: number): number {
  return Number(value.toFixed(SVG_NUMBER_DECIMALS));
}

/** Wrap a D3 scale so generated SVG coordinates use stable precision. */
export function stableSvgScale(scale: (value: number) => number) {
  return (value: number) => stableSvgNumber(scale(value));
}

// A star is a lit centre inside a ring of its provider colour, as fractions of its radius: the ring's centre line and its width.
const STAR_RING_CENTRE = 0.72;
const STAR_RING_WIDTH = 0.56;

/** Circle attributes that draw a star like the leaderboard's score stars, crisp enough to read in a dense chart: a lit centre inside a solid ring of its provider colour. */
export function starCore(radius: number, color: string) {
  return {
    r: stableSvgNumber(radius * STAR_RING_CENTRE),
    strokeWidth: stableSvgNumber(radius * STAR_RING_WIDTH),
    style: { "--star": color } as CSSProperties,
  };
}

/** One emphasised star's light in a chart's glow layer. */
type StarLight = {
  key: string;
  cx: number;
  cy: number;
  /** Radius of the star; its glow spreads just past it. */
  radius: number;
  color: string;
  /** Frontier models glow faintly; the selected model a little more. */
  emphasis: "frontier" | "selected";
  /** Dimming shared with the star, from 0 to 1. */
  opacity?: number;
};

// Glow size in star radii and its strength before the blur softens it; kept tight so marks stay legible.
const STAR_GLOW = {
  frontier: { reach: 1.55, strength: 0.42 },
  selected: { reach: 1.9, strength: 0.6 },
} as const;
const STAR_GLOW_BLUR = 1.6;

/** Light emphasised stars from one softly blurred layer beneath the marks, at the cost of a single filter per chart. */
export function StarGlows({ stars, bounds }: { stars: readonly StarLight[]; bounds: PlotBounds }) {
  const id = useId();
  const margin = STAR_GLOW_BLUR * 8;
  return (
    <g className={styles.starGlows} aria-hidden="true">
      <defs>
        <filter
          id={id}
          filterUnits="userSpaceOnUse"
          x={bounds.left - margin}
          y={bounds.top - margin}
          width={bounds.right - bounds.left + margin * 2}
          height={bounds.bottom - bounds.top + margin * 2}
        >
          <feGaussianBlur stdDeviation={STAR_GLOW_BLUR} />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>
        {stars.map(({ key, cx, cy, radius, color, emphasis, opacity = 1 }) => (
          <circle
            key={key}
            cx={stableSvgNumber(cx)}
            cy={stableSvgNumber(cy)}
            r={stableSvgNumber(radius * STAR_GLOW[emphasis].reach)}
            fill={color}
            opacity={opacity * STAR_GLOW[emphasis].strength}
          />
        ))}
      </g>
    </g>
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

type ScreenPoint = { x: number; y: number };

/** The side where a frontier's reached region continues past its outermost model to the plot edge. */
type HorizonOpenSide = "left" | "right";

// Light along the rim, widest and faintest first; only the half under the rim survives the land clip.
const HORIZON_GLOW = [
  { width: 46, opacity: 0.07 },
  { width: 22, opacity: 0.12 },
  { width: 9, opacity: 0.22 },
] as const;
// One tile of the stipple scattered under the rim, as [x, y, radius] in plot pixels.
const STIPPLE_TILE = 17;
const STIPPLE = [
  [1.5, 2.5, 0.7],
  [9.5, 1, 0.55],
  [14.5, 6.5, 0.75],
  [5, 8, 0.6],
  [11, 11.5, 0.7],
  [2, 14, 0.55],
  [7.5, 15.5, 0.65],
  [15.5, 14, 0.5],
] as const;

/** The horizon's cobalt-to-violet-to-rose light as SVG gradient stops, matching the --horizon-gradient token; literal so PNG exports, which drop stylesheet rules inside SVG, keep the same light. */
export function HorizonLightStops() {
  return (
    <>
      <stop offset="0" stopColor="#4a72ff" />
      <stop offset="0.58" stopColor="#8f6bff" />
      <stop offset="1" stopColor="#ff92bd" />
    </>
  );
}

/** Extend frontier points, given in ascending screen x, to the plot edge on the open side at the outermost model's height. */
export function horizonRim(
  points: readonly ScreenPoint[],
  bounds: PlotBounds,
  open: HorizonOpenSide,
): ScreenPoint[] {
  const first = points[0];
  const last = points.at(-1);
  if (first == null || last == null) return [];
  return open === "right"
    ? [...points, { x: bounds.right, y: last.y }]
    : [{ x: bounds.left, y: first.y }, ...points];
}

/**
 * Draw a frontier the way the sky draws its horizon: a hot rim over the region the frontier reaches, with light and stipple along its underside.
 *
 * Every model the frontier outperforms sits inside the lit region, so the rim reads as the edge of what has been reached.
 */
export function FrontierHorizon({
  points,
  bounds,
  open,
  muted = false,
}: {
  /** Frontier models in ascending screen x. */
  points: readonly ScreenPoint[];
  bounds: PlotBounds;
  open: HorizonOpenSide;
  /** Dimmed while another selection owns the chart's emphasis. */
  muted?: boolean;
}) {
  const id = useId();
  const rim = horizonRim(points, bounds, open);
  const first = rim[0];
  const last = rim.at(-1);
  if (first == null || last == null) return null;
  const rimPath = rim
    .map(({ x, y }, index) => `${index ? "L" : "M"}${stableSvgNumber(x)},${stableSvgNumber(y)}`)
    .join("");
  const landPath = `${rimPath}L${stableSvgNumber(last.x)},${stableSvgNumber(bounds.bottom)}L${stableSvgNumber(first.x)},${stableSvgNumber(bounds.bottom)}Z`;
  const light = `${id}-light`;
  const land = `${id}-land`;
  const stipple = `${id}-stipple`;
  const clip = `${id}-clip`;
  // Gradient stops are literal so PNG exports, which drop stylesheet rules inside SVG, keep the same light.
  return (
    <g
      className={muted ? `${styles.horizon} ${styles.horizonMuted}` : styles.horizon}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={light}
          gradientUnits="userSpaceOnUse"
          x1={bounds.left}
          y1={0}
          x2={bounds.right}
          y2={0}
        >
          <HorizonLightStops />
        </linearGradient>
        <linearGradient
          id={land}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={bounds.top}
          x2={0}
          y2={bounds.bottom}
        >
          <stop offset="0" stopColor="#6f8cff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#6f8cff" stopOpacity="0.025" />
        </linearGradient>
        <pattern
          id={stipple}
          width={STIPPLE_TILE}
          height={STIPPLE_TILE}
          patternUnits="userSpaceOnUse"
        >
          {STIPPLE.map(([x, y, radius]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={radius} fill="currentColor" />
          ))}
        </pattern>
        <clipPath id={clip}>
          <path d={landPath} />
        </clipPath>
      </defs>
      <path className={styles.horizonLand} d={landPath} fill={`url(#${land})`} />
      <g clipPath={`url(#${clip})`}>
        <path
          className={styles.horizonStipple}
          d={rimPath}
          stroke={`url(#${stipple})`}
          strokeWidth={34}
          opacity={0.32}
        />
        <path
          className={styles.horizonStipple}
          d={rimPath}
          stroke={`url(#${stipple})`}
          strokeWidth={14}
          opacity={0.5}
        />
        {HORIZON_GLOW.map(({ width, opacity }) => (
          <path
            key={width}
            className={styles.horizonGlow}
            d={rimPath}
            stroke={`url(#${light})`}
            strokeWidth={width}
            opacity={opacity}
          />
        ))}
      </g>
      <path
        className={styles.horizonGlow}
        d={rimPath}
        stroke={`url(#${light})`}
        strokeWidth={8}
        opacity={0.16}
      />
      <path className={styles.horizonEdge} d={rimPath} stroke={`url(#${light})`} />
      <path className={styles.horizonRim} d={rimPath} />
    </g>
  );
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

/** Compact plots retain three inset scale anchors even when their gridlines are omitted. */
export function YAxisTicks({
  ticks,
  yPoint,
  x,
  format,
  keyPrefix,
  tickLength = 7,
  labelOffset = 15,
  insetRight,
  showGridLines = true,
}: {
  ticks: number[];
  yPoint: (value: number) => number;
  x: number;
  format: (value: number) => string;
  keyPrefix: string;
  tickLength?: number;
  labelOffset?: number;
  insetRight?: number;
  showGridLines?: boolean;
}) {
  const inset = insetRight != null;
  const middle = Math.floor((ticks.length - 1) / 2);
  return ticks.map((tick, index) => (
    <g key={`${keyPrefix}-y-${tick}`}>
      {(!inset || showGridLines) && (
        <line
          className={inset ? styles.scaleGrid : styles.axisTick}
          x1={inset ? x : x - tickLength}
          x2={insetRight ?? x}
          y1={yPoint(tick)}
          y2={yPoint(tick)}
        />
      )}
      {!inset || index === 0 || index === middle || index === ticks.length - 1 ? (
        <text
          className={inset ? styles.scaleAnchor : styles.axisLabel}
          x={inset ? x + 6 : x - labelOffset}
          y={yPoint(tick) + (inset ? (index === 0 ? -6 : 14) : 4)}
          textAnchor={inset ? "start" : "end"}
        >
          {format(tick)}
        </text>
      ) : null}
    </g>
  ));
}

/** Keep the frame empty while responsive remeasurement leaves no usable plotting area. */
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
      width={Math.max(0, width - margin.left - margin.right)}
      height={Math.max(0, height - margin.top - margin.bottom)}
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
  const yTitleX = compact ? plotLeft : 18;
  const resolvedXTitleOffset = xTitleOffset ?? (compact ? 48 : 60);
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
        y={compact ? 14 : plotMiddleY}
        textAnchor={compact ? "start" : "middle"}
        transform={compact ? undefined : `rotate(-90 ${yTitleX} ${plotMiddleY})`}
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
}: {
  label: string;
  cx: number;
  cy: number;
  width: number;
  margin: Margin;
  height: number;
  xOffset?: number;
  placement?: PointLabelPlacement;
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
        className={styles.pointLabel}
        x={stableSvgNumber(textX)}
        y={stableSvgNumber(textY)}
        textAnchor={textAnchor}
      >
        {label}
      </text>
    </g>
  );
}

/** Measure rendered label bounds after fonts and viewport changes so text and leaders share exact geometry. */
export function useLabelSizes(textKey: string, compactLayout: boolean) {
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
            Math.abs(old.width - size.width) > 0.1 ||
            Math.abs(old.ascent - size.ascent) > 0.1 ||
            Math.abs(old.descent - size.descent) > 0.1
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
