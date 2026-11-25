"use client";

/** The SVG building blocks the dashboard's plots share, in each plot's SVG coordinates: frame, axes, star marks and glows, row labels and domain chips, the frontier horizon, medians, and point labels with their measurement. */

import { type CSSProperties, useCallback, useId, useLayoutEffect, useRef, useState } from "react";

import type { BenchmarkDomain } from "../../../../src/model-atlas/benchmarks/catalog";
import { clamp } from "../../../../src/model-atlas/math-utils";
import { domainIcons } from "../../../shared/DomainShares";
import { providerChartColor, providerLogo } from "../../shared/provider-theme";
import { REFERENCE_PLOT_HEIGHT } from "../../shared/sky-light";
import { NAME_CLEARANCE, type PointLabelPlacement, type PointLabelSize } from "./label-placement";
import { MUTED_STAR_GLOW } from "./sky-renderer";

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
  top: 14,
  right: 34,
  bottom: 34,
  left: 62,
};
export const SCATTER_CHART_WIDTH = 1120;
// Model callouts keep this far inside the plot's edges.
const LABEL_EDGE_GUTTER = 12;

const SVG_NUMBER_DECIMALS = 3;
const AXIS_TICK_LENGTH = 7;

/** A compact plot sets its title above the plot and keeps a left gutter just wide enough for a three-digit y scale label at the phone micro size. */
export function scatterChartMargin(margin: Margin, compact: boolean): Margin {
  return compact ? { top: 28, right: 8, bottom: 30, left: 36 } : margin;
}

/** Rounds so server and client renders serialize identical SVG attributes. */
export function stableSvgNumber(value: number): number {
  return Number(value.toFixed(SVG_NUMBER_DECIMALS));
}

export function stableSvgScale(scale: (value: number) => number) {
  return (value: number) => stableSvgNumber(scale(value));
}

// A star is a lit centre inside a ring of its provider colour, as fractions of its radius: the ring's centre line and its width.
const STAR_RING_CENTRE = 0.72;
const STAR_RING_WIDTH = 0.56;

export function starCore(radius: number, color: string) {
  return {
    r: stableSvgNumber(radius * STAR_RING_CENTRE),
    strokeWidth: stableSvgNumber(radius * STAR_RING_WIDTH),
    style: { "--star": color } as CSSProperties,
  };
}

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
  frontier: { reach: 1.3, strength: 0.24 },
  selected: { reach: 1.6, strength: 0.4 },
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

/** The SVG's own star for a model, painted only where the sky cannot draw it. */
export function StarMark({
  cx,
  cy,
  provider,
  radius = 3,
}: {
  cx: number;
  cy: number;
  provider: string;
  radius?: number;
}) {
  return (
    <circle
      className={styles.starCore}
      cx={cx}
      cy={cy}
      {...starCore(radius, providerChartColor(provider))}
      pointerEvents="none"
    />
  );
}

/** A row chart's margin: just enough above for the first row's note to clear the plot's edge, so the rows sit close under their head, room for each RowLabel on the left, the row's value set flush with the far right edge, and an axis beneath. */
export function rowChartMargin(compact: boolean): Margin {
  return { top: 2, right: compact ? 60 : 76, bottom: 30, left: compact ? 140 : 204 };
}

// Where names and values beside the plot would leave it narrower than `leastPlot`, as on a phone, a row takes two lines: its name and value, then its marks across the full width. These are the two lines' centres within the row, its height, and the plot's side margins.
const TWO_LINE_ROW = { leastPlot: 240, text: 10, marks: 34, height: 46, side: 8 };

/** A row chart's rows at `width`: one line `rowHeight` tall, or two lines where the plot beside the names would be too narrow; `markY` centres a row's marks and `textY` its name and value. */
export function rowChartRows(width: number, compact: boolean, rowHeight: number) {
  const oneLine = rowChartMargin(compact);
  const twoLine = width - oneLine.left - oneLine.right < TWO_LINE_ROW.leastPlot;
  const margin = twoLine
    ? { ...oneLine, left: TWO_LINE_ROW.side, right: TWO_LINE_ROW.side }
    : oneLine;
  const height = twoLine ? TWO_LINE_ROW.height : rowHeight;
  const rowTop = (index: number) => margin.top + index * height;
  return {
    margin,
    rowHeight: height,
    rowTop,
    markY: (index: number) => rowTop(index) + (twoLine ? TWO_LINE_ROW.marks : height / 2),
    textY: (index: number) => rowTop(index) + (twoLine ? TWO_LINE_ROW.text : height / 2),
  };
}

// The plots' mono type sizes in CSS pixels, as globals.css sets --type-micro-size and --type-caption-size, and the share of its size a mono character advances; with them a chart guesses where text will sit before it renders.
const MONO_SIZE = { micro: 10, caption: 11 };
const MONO_ADVANCE = 0.6;

/** About how wide `text` sets in the plots' mono type: `micro` for notes, `caption` for values, tick labels, and readings. */
export function monoWidth(text: string, size: keyof typeof MONO_SIZE): number {
  return text.length * MONO_SIZE[size] * MONO_ADVANCE;
}

// A row's name starts this far right of its logo's left edge.
const ROW_NAME_X = 22;
// A row name's 12.5px semibold sans runs about this wide per character.
const ROW_NAME_CHAR_WIDTH = 7.2;

/** The box a plot note covers, set at `x` as SVG anchors it with its baseline at `y`, for guides that pass behind it. */
export function noteBox(
  x: number,
  y: number,
  text: string,
  anchor: "start" | "middle" | "end",
): PlotBounds {
  const width = monoWidth(text, "micro");
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  // The 10px type rises about 8px above its baseline and drops 3px below it.
  return { left, right: left + width, top: y - 8, bottom: y + 3 };
}

/** The boxes a row's `RowLabel` centred on `y` and its value set flush with the right edge at `width` cover, for guides that pass behind them. */
export function rowTextBoxes(y: number, name: string, value: string, width: number): PlotBounds[] {
  return [
    { left: 0, right: ROW_NAME_X + name.length * ROW_NAME_CHAR_WIDTH, top: y - 8, bottom: y + 8 },
    { left: width - monoWidth(value, "caption"), right: width, top: y - 7, bottom: y + 7 },
  ];
}

/** The dashboard's trail: a hairline along `y` brightening from a dimmed star's light at `from` into `color` at its star at `to`. A plot draws it beneath its stars, so their light lies over it. */
export function Trail({
  from,
  to,
  y,
  color,
}: {
  from: number;
  to: number;
  y: number;
  color: string;
}) {
  const id = useId();
  return (
    <>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={from} x2={to} y1={y} y2={y}>
        <stop offset={0} stopColor={color} stopOpacity={MUTED_STAR_GLOW} />
        <stop offset={1} stopColor={color} />
      </linearGradient>
      <line stroke={`url(#${id})`} x1={from} x2={to} y1={y} y2={y} />
    </>
  );
}

/** A plot row's model: its lab's logo, then its name, vertically centred on `y`. */
export function RowLabel({
  y,
  name,
  provider,
  dimmed = false,
}: {
  y: number;
  name: string;
  provider: string;
  dimmed?: boolean;
}) {
  const logo = providerLogo(provider);
  return (
    <g opacity={dimmed ? 0.4 : 1}>
      {logo ? <image href={logo} x={0} y={y - 7} width={14} height={14} /> : null}
      <text className={styles.rowName} x={ROW_NAME_X} y={y} dy="0.34em">
        {name}
      </text>
    </g>
  );
}

// A domain's chip in a plot matches the weights map's legend: a 14px tile in the label's colour carrying its icon 2px in.
export const DOMAIN_TILE = { size: 14, inset: 2 };

/** A domain's icon on its label-coloured tile, its top left corner at `x`, `y`; a tile smaller than the legend's, for rows set closer, keeps the icon's inset. */
export function DomainTile({
  domain,
  x,
  y,
  size = DOMAIN_TILE.size,
}: {
  domain: BenchmarkDomain;
  x: number;
  y: number;
  size?: number;
}) {
  const Icon = domainIcons[domain];
  return (
    <>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={2}
        style={{ fill: `var(--domain-tone-${domain})` }}
      />
      <Icon
        className={styles.domainIcon}
        x={x + DOMAIN_TILE.inset}
        y={y + DOMAIN_TILE.inset}
        size={size - DOMAIN_TILE.inset * 2}
        strokeWidth={2}
        aria-hidden
      />
    </>
  );
}

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

export type HorizonTrail = { from: ScreenPoint; to: ScreenPoint };

export function polylineSegments(points: readonly ScreenPoint[]) {
  return points.slice(1).map((to, index) => ({
    x1: points[index]!.x,
    y1: points[index]!.y,
    x2: to.x,
    y2: to.y,
  }));
}

/** The area of a plot that model callouts may take, inset from its edges. */
export function labelBounds(plot: PlotBounds): PlotBounds {
  return {
    left: plot.left + LABEL_EDGE_GUTTER,
    right: plot.right - LABEL_EDGE_GUTTER,
    top: plot.top + LABEL_EDGE_GUTTER,
    bottom: plot.bottom - LABEL_EDGE_GUTTER,
  };
}

// A trail follows the trend of this many frontier models nearest its end; a fit over the whole frontier would take in the far end's bend.
const TRAIL_TREND_MODELS = 4;
// A trail never falls faster than it runs, so it carries the frontier sideways instead of dropping toward the axis.
const TRAIL_MAX_SLOPE = 1;

// The rim's light rises into the open sky above it: a tight glow over a broad, faint one, so brightness falls away evenly instead of ending as a band.
const HORIZON_SKY = [
  { width: 4, blur: 4 },
  { width: 12, blur: 16 },
] as const;
// A tight halo keeps the rim luminous without widening it.
const HORIZON_HALO = { width: 3, blur: 2.5 } as const;

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
 * Guess how a frontier, given in ascending screen x, continues past its closed end, the side away from `open`, where no model lies beyond the outermost one: a line from that model to the plot edge at the least-squares slope of the models nearest it.
 * Null when that model sits at the edge or beyond it, as when a replay's camera has panned past it.
 */
export function horizonTrail(
  points: readonly ScreenPoint[],
  bounds: PlotBounds,
  open: HorizonOpenSide,
): HorizonTrail | null {
  const nearest = (open === "right" ? points : [...points].reverse()).slice(0, TRAIL_TREND_MODELS);
  const from = nearest[0];
  const edge = open === "right" ? bounds.left : bounds.right;
  if (from == null || (open === "right" ? from.x - edge : edge - from.x) < 1) return null;
  const meanX = nearest.reduce((sum, { x }) => sum + x, 0) / nearest.length;
  const meanY = nearest.reduce((sum, { y }) => sum + y, 0) / nearest.length;
  let covariance = 0;
  let variance = 0;
  for (const { x, y } of nearest) {
    covariance += (x - meanX) * (y - meanY);
    variance += (x - meanX) ** 2;
  }
  const slope =
    variance === 0 ? 0 : clamp(covariance / variance, -TRAIL_MAX_SLOPE, TRAIL_MAX_SLOPE);
  return { from, to: { x: edge, y: from.y + slope * (edge - from.x) } };
}

/**
 * Draw a frontier the way the sky draws its horizon: a crisp lit rim whose light rises into the open sky above it.
 *
 * Every model the frontier outperforms sits inside the region below the rim, which keeps only a faint wash, so the light never clouds those models.
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
  const skyScale = Math.min(1, (bounds.bottom - bounds.top) / REFERENCE_PLOT_HEIGHT);
  const skyLayers = HORIZON_SKY.map(({ width, blur }) => ({
    width: stableSvgNumber(width * skyScale),
    blur: stableSvgNumber(blur * skyScale),
  }));
  const reach = Math.max(...HORIZON_SKY.map(({ width, blur }) => width / 2 + blur * 3));
  const landPath = `${rimPath}L${stableSvgNumber(last.x)},${stableSvgNumber(bounds.bottom)}L${stableSvgNumber(first.x)},${stableSvgNumber(bounds.bottom)}Z`;
  const light = `${id}-light`;
  const land = `${id}-land`;
  const skyMask = `${id}-sky-mask`;
  const skyLight = `${id}-sky-light`;
  const halo = `${id}-halo`;
  const region = {
    x: bounds.left - reach,
    y: bounds.top - reach,
    width: bounds.right - bounds.left + reach * 2,
    height: bounds.bottom - bounds.top + reach * 2,
  };
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
          <stop offset="0" stopColor="#6f8cff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#6f8cff" stopOpacity="0" />
        </linearGradient>
        {skyLayers.map(({ blur }, index) => (
          <filter key={blur} id={`${skyLight}-${index}`} filterUnits="userSpaceOnUse" {...region}>
            <feGaussianBlur stdDeviation={blur} />
          </filter>
        ))}
        <filter id={halo} filterUnits="userSpaceOnUse" {...region}>
          <feGaussianBlur stdDeviation={HORIZON_HALO.blur} />
        </filter>
        {/* Only the reached region is kept dark, so the light fades out naturally past the frontier's ends while staying inside the plot's width. */}
        <mask id={skyMask} maskUnits="userSpaceOnUse" {...region}>
          <rect
            x={bounds.left}
            y={region.y}
            width={bounds.right - bounds.left}
            height={region.height}
            fill="#fff"
          />
          <path d={landPath} fill="#000" />
        </mask>
      </defs>
      <path d={landPath} fill={`url(#${land})`} />
      <g mask={`url(#${skyMask})`}>
        {skyLayers.map(({ width }, index) => (
          <path
            key={width}
            className={styles.horizonSky}
            d={rimPath}
            stroke={`url(#${light})`}
            strokeWidth={width}
            filter={`url(#${skyLight}-${index})`}
          />
        ))}
      </g>
      <path
        className={styles.horizonHalo}
        d={rimPath}
        stroke={`url(#${light})`}
        strokeWidth={HORIZON_HALO.width}
        filter={`url(#${halo})`}
      />
      <path className={styles.horizonEdge} d={rimPath} stroke={`url(#${light})`} />
      <path className={styles.horizonRim} d={rimPath} />
    </g>
  );
}

// Room a reading beside a vertical line's top end takes, so near the plot's right edge it turns to the line's left.
const TOP_READING_ROOM = 96;
// Readings are mono at the caption size or smaller, about this tall above the baseline.
const READING_ASCENT = 10;

/** Where a reading naming a vertical line sits, inside the plot's top: on the line's right, or on its left near the right edge. */
function topReading(x: number, bounds: PlotBounds) {
  const right = x <= bounds.right - TOP_READING_ROOM;
  return {
    x: right ? x + 8 : x - 8,
    y: bounds.top + 16,
    textAnchor: right ? "start" : "end",
  } as const;
}

/** Where a reading naming a horizontal line sits: above it, at the plot's right edge. */
function rightReading(y: number, bounds: PlotBounds) {
  return { x: bounds.right - 8, y: y - 7, textAnchor: "end" } as const;
}

/** The boxes the median names take inside the plot, for callouts to keep clear of. */
export function medianReadingBoxes(
  x: number,
  y: number,
  bounds: PlotBounds,
  labels: [string, string],
) {
  return [topReading(x, bounds), rightReading(y, bounds)].map((reading, index) => {
    const width = monoWidth(labels[index]!, "caption");
    const left = reading.textAnchor === "start" ? reading.x : reading.x - width;
    return { left, right: left + width, top: reading.y - READING_ASCENT, bottom: reading.y + 3 };
  });
}

/** Each median's name sits inside the plot beside its line's far end: the x median's at the top and the y median's above its line at the right. */
export function MedianCross({
  x,
  y,
  bounds,
  xLabel,
  yLabel,
}: {
  x: number;
  y: number;
  bounds: PlotBounds;
  xLabel: string;
  yLabel: string;
}) {
  return (
    <>
      <line className={styles.medianAxis} x1={x} x2={x} y1={bounds.top} y2={bounds.bottom} />
      <line className={styles.medianAxis} x1={bounds.left} x2={bounds.right} y1={y} y2={y} />
      <text className={styles.medianLabel} {...topReading(x, bounds)}>
        {xLabel}
      </text>
      <text className={styles.medianLabel} {...rightReading(y, bounds)}>
        {yLabel}
      </text>
    </>
  );
}

// A reading on the y-axis covers a tick label whose line is closer than this.
const AXIS_LINE_HEIGHT = 14;

/** A pointer's value read on the x-axis at `x`, anchored as SVG anchors its text. */
export type AxisReadingAt = { x: number; text: string; anchor: "start" | "middle" | "end" };

/** Whether two texts on the x-axis would overlap, with room for a reading's backdrop either side of each. */
export function axisTextsOverlap(text: AxisReadingAt, other: AxisReadingAt): boolean {
  const [left, right] = axisSpan(text);
  const [otherLeft, otherRight] = axisSpan(other);
  return left < otherRight && otherLeft < right;
}

function axisSpan({ x, text, anchor }: AxisReadingAt): [number, number] {
  const width = monoWidth(text, "caption");
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return [left - 6, left + width + 6];
}

export function XAxisTicks({
  ticks,
  xPoint,
  y,
  format,
  keyPrefix,
  labelMinGap = 0,
  tickGap = 0,
  readings = [],
}: {
  ticks: number[];
  xPoint: (value: number) => number;
  y: number;
  format: (value: number) => string;
  keyPrefix: string;
  labelMinGap?: number;
  /** Tick marks begin this far below the plot's edge, clearing a mark that straddles it; labels keep their place, where cursor readings also sit. */
  tickGap?: number;
  /** Pointer readings on the axis; a tick label one would overlap gives way to it rather than peeking out around its backdrop. */
  readings?: readonly AxisReadingAt[];
}) {
  let lastLabelX = Number.NEGATIVE_INFINITY;
  const labelVisibility = ticks.map((tick) => {
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
        y1={y + tickGap}
        y2={y + tickGap + AXIS_TICK_LENGTH}
      />
      {labelVisibility[index] &&
      !readings.some((reading) =>
        axisTextsOverlap(reading, { x: xPoint(tick), text: format(tick), anchor: "middle" }),
      ) ? (
        <text className={styles.axisLabel} x={xPoint(tick)} y={y + 24} textAnchor="middle">
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
  tickGap = 0,
  reading,
}: {
  ticks: number[];
  yPoint: (value: number) => number;
  x: number;
  format: (value: number) => string;
  keyPrefix: string;
  /** Tick marks begin this far left of the plot's edge, clearing a mark that straddles it; labels keep their place, where cursor readings also sit. */
  tickGap?: number;
  /** The y of a pointer's reading on the axis; a tick label it would overlap gives way to it. */
  reading?: number;
}) {
  return ticks.map((tick) => (
    <g key={`${keyPrefix}-y-${tick}`}>
      <line
        className={styles.axisTick}
        x1={x - tickGap - AXIS_TICK_LENGTH}
        x2={x - tickGap}
        y1={yPoint(tick)}
        y2={yPoint(tick)}
      />
      {reading != null && Math.abs(yPoint(tick) - reading) < AXIS_LINE_HEIGHT ? null : (
        <text className={styles.axisLabel} x={x - 15} y={yPoint(tick) + 4} textAnchor="end">
          {format(tick)}
        </text>
      )}
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

/** Only the y-axis is titled in the plot: the row of choices beneath each plot names its x-axis. */
export function YAxisTitle({
  height,
  margin,
  title,
  compact = false,
}: {
  height: number;
  margin: Margin;
  title: string;
  compact?: boolean;
}) {
  const plotMiddleY = margin.top + (height - margin.top - margin.bottom) / 2;
  // Above a compact plot the title starts over its scale's labels, in line with the panel's text.
  const x = compact ? 8 : 18;
  return (
    <text
      className={styles.axisTitle}
      x={x}
      y={compact ? 14 : plotMiddleY}
      textAnchor={compact ? "start" : "middle"}
      transform={compact ? undefined : `rotate(-90 ${x} ${plotMiddleY})`}
    >
      {title}
    </text>
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
  leaderMask,
}: {
  label: string;
  cx: number;
  cy: number;
  width: number;
  margin: Margin;
  height: number;
  xOffset?: number;
  placement?: PointLabelPlacement;
  /** Id of a `NameMask` that hides this label's leader where it passes under other names. */
  leaderMask?: string;
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
          mask={leaderMask ? `url(#${leaderMask})` : undefined}
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

/** Hit areas and guide masks must use the same measured text geometry, with their own clearance. */
export function labelRect(placement: PointLabelPlacement, size: PointLabelSize, padding: number) {
  return {
    x: placement.x - padding,
    y: placement.y - size.ascent - padding,
    width: size.width + padding * 2,
    height: size.ascent + size.descent + padding * 2,
  };
}

/** Keys of the labels to leave out, in priority order: each placed label whose text comes within the name clearance of a reserved box, such as a median's name, or of an earlier kept label's text gives way. */
export function crowdedOutLabels(
  labels: readonly { key: string; placement?: PointLabelPlacement; size?: PointLabelSize }[],
  reserved: readonly PlotBounds[],
  compact: boolean,
): Set<string> {
  const clearance = NAME_CLEARANCE[compact ? "compact" : "wide"];
  const kept = reserved.map((box) => ({
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  }));
  const crowded = new Set<string>();
  for (const { key, placement, size } of labels) {
    if (placement == null || size == null) continue;
    const box = labelRect(placement, size, 0);
    const meets = kept.some(
      (other) =>
        box.x < other.x + other.width + clearance.x &&
        other.x < box.x + box.width + clearance.x &&
        box.y < other.y + other.height + clearance.y &&
        other.y < box.y + box.height + clearance.y,
    );
    if (meets) crowded.add(key);
    else kept.push(box);
  }
  return crowded;
}

/** Clear a plot's guides from under its placed labels and their leaders, so no guide runs through a name. */
export function LabelMask({
  id,
  width,
  height,
  labels,
}: {
  id: string;
  width: number;
  height: number;
  labels: readonly { key: string; placement?: PointLabelPlacement; size?: PointLabelSize }[];
}) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
      <rect width={width} height={height} fill="white" />
      {labels.map(({ key, placement, size }) =>
        placement && size ? (
          <g key={key}>
            <rect {...labelRect(placement, size, 4)} fill="black" />
            {placement.line ? <line {...placement.line} stroke="black" strokeWidth={6} /> : null}
          </g>
        ) : null,
      )}
    </mask>
  );
}

/** Hide lines where they pass under one of these names, so a leader or guide that a crowded plot must run across a name passes behind it instead of striking it through. */
export function NameMask({
  id,
  width,
  height,
  labels,
}: {
  id: string;
  width: number;
  height: number;
  labels: readonly { key: string; placement?: PointLabelPlacement; size?: PointLabelSize }[];
}) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
      <rect width={width} height={height} fill="white" />
      {labels.map(({ key, placement, size }) =>
        placement && size ? (
          <rect key={key} {...labelRect(placement, size, 2)} fill="black" />
        ) : null,
      )}
    </mask>
  );
}

/**
 * Measure rendered label bounds after fonts and viewport changes so text and leaders share exact geometry.
 * A label's size depends only on its text and the layout's type size, so a changed set of labels measures only text not yet measured at this layout; fonts loading or the chart resizing measures every label again.
 */
export function useLabelSizes(textKey: string, compactLayout: boolean) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelSizes, setLabelSizes] = useState<Record<string, PointLabelSize>>({});
  const measuredTexts = useRef(new Set<string>());
  const measure = useCallback((all: boolean) => {
    if (!svgRef.current) return;
    const measured: Record<string, PointLabelSize> = {};
    for (const text of Array.from(
      svgRef.current.querySelectorAll<SVGTextElement>(`text.${styles.pointLabel}`),
    )) {
      const content = text.textContent ?? "";
      if (!all && measuredTexts.current.has(content)) continue;
      const box = text.getBBox();
      const baseline = text.y.baseVal.getItem(0).value;
      measured[content] = {
        width: box.width,
        ascent: baseline - box.y,
        descent: box.y + box.height - baseline,
      };
      measuredTexts.current.add(content);
    }
    if (Object.keys(measured).length === 0) return;
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
  }, []);
  useLayoutEffect(() => {
    let disposed = false;
    measuredTexts.current = new Set();
    void document.fonts.ready.then(() => {
      if (!disposed) measure(true);
    });
    return () => {
      disposed = true;
    };
  }, [compactLayout, measure]);
  useLayoutEffect(() => {
    measure(false);
    // An observer reports the chart's current size as soon as it starts watching, which was just measured.
    let observed = false;
    const observer = new ResizeObserver(() => {
      if (observed) measure(true);
      observed = true;
    });
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [textKey, compactLayout, measure]);
  return { svgRef, labelSizes };
}
