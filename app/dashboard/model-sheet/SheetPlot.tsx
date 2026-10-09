"use client";

/** The sheet's small plots share one frame: Intelligence up the side and Cost× along a base-10 log foot with the 1× benchmark-median guide, measured to the sheet's width. */

import { scaleLinear, scaleLog } from "d3-scale";

import { logRatioAxisScale } from "../graphs/plot/axis-scale";
import { type Margin, plotBoundsFor, stableSvgScale } from "../graphs/plot/Primitives";
import { useChartWidth } from "../graphs/use-chart-layout";
import { formatResourceRatio } from "../shared/resource-ratio-display";

import graphStyles from "../graphs/graphs.module.css";
import styles from "./model-sheet.module.css";

const PLOT_MAX_WIDTH = 840;
const PLOT_MARGIN: Margin = { top: 10, right: 10, bottom: 30, left: 30 };
// Stars keep this clearance from the frame so their glow and labels stay inside it.
const PLOT_INSET = 10;
// Cost labels need roughly this much room; a wide range keeps only its powers of ten.
const MIN_TICK_GAP = 46;
// The Intelligence title's box inside the plot's top-left corner, kept clear of point labels.
const AXIS_TITLE_BOX = { width: 92, height: 18 };
/** Point labels place themselves within the plot bounds, so they clamp to the plot with no extra margin. */
export const LABEL_MARGIN: Margin = { top: 0, right: 0, bottom: 0, left: 0 };

/** Fit a plot to its host: Cost× on a log scale that always reaches the 1× median, Intelligence over `scoreDomain`. */
export function useSheetPlot(
  height: number,
  costs: readonly number[],
  scoreDomain: readonly [number, number],
) {
  const { chartRef, width } = useChartWidth(PLOT_MAX_WIDTH);
  const axis = logRatioAxisScale([...costs], formatResourceRatio);
  const bounds = plotBoundsFor(width, height, PLOT_MARGIN);
  const x = stableSvgScale(
    scaleLog()
      .base(10)
      .domain(axis.domain)
      .range([bounds.left + PLOT_INSET, bounds.right - PLOT_INSET])
      .clamp(true),
  );
  const y = stableSvgScale(
    scaleLinear()
      .domain(scoreDomain)
      .range([bounds.bottom - PLOT_INSET, bounds.top + PLOT_INSET])
      .clamp(true),
  );
  // Point labels must leave the axis title readable wherever the stars fall.
  const reservedBoxes = [
    {
      left: bounds.left,
      right: bounds.left + AXIS_TITLE_BOX.width,
      top: bounds.top,
      bottom: bounds.top + AXIS_TITLE_BOX.height,
    },
  ];
  return {
    chartRef,
    width,
    height,
    bounds,
    x,
    y,
    costTicks: sparseCostTicks(axis.ticks, x),
    reservedBoxes,
  };
}

export type SheetPlotGeometry = ReturnType<typeof useSheetPlot>;

/** The plot's field, score gridlines, cost labels, median guide, and axis titles, drawn beneath its marks. */
export function SheetPlotFrame({
  plot,
  scoreTicks,
}: {
  plot: SheetPlotGeometry;
  scoreTicks: readonly number[];
}) {
  const { height, bounds, x, y, costTicks } = plot;
  return (
    <g aria-hidden="true">
      <rect
        x={bounds.left}
        y={bounds.top}
        width={Math.max(0, bounds.right - bounds.left)}
        height={Math.max(0, bounds.bottom - bounds.top)}
        fill="var(--chart-range-fill)"
      />
      {scoreTicks.map((tick) => (
        <g key={`score-${tick}`}>
          <line
            className={graphStyles.scaleGrid}
            x1={bounds.left}
            x2={bounds.right}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text className={styles.plotTick} x={bounds.left - 6} y={y(tick) + 3.5} textAnchor="end">
            {tick}
          </text>
        </g>
      ))}
      {costTicks.map((tick) => (
        <text
          key={`cost-${tick}`}
          className={styles.plotTick}
          x={x(tick)}
          y={bounds.bottom + 14}
          textAnchor="middle"
        >
          {formatResourceRatio(tick)}
        </text>
      ))}
      <line
        className={graphStyles.medianAxis}
        x1={x(1)}
        x2={x(1)}
        y1={bounds.top}
        y2={bounds.bottom}
        strokeDasharray="3 4"
      />
      <text className={styles.plotAxis} x={bounds.left + 6} y={bounds.top + 12}>
        Intelligence
      </text>
      <text className={styles.plotAxis} x={bounds.right} y={height - 2} textAnchor="end">
        Cost× · log₁₀
      </text>
    </g>
  );
}

/**
 * Keep cost labels apart, preferring powers of ten when the range is wide enough to show three of them.
 * The 1× label always stays, since the median guide is drawn there; other labels join only where they clear every kept one.
 */
function sparseCostTicks(ticks: readonly number[], x: (value: number) => number): number[] {
  const decades = ticks.filter((tick) =>
    Number.isInteger(Math.round(Math.log10(tick) * 1e6) / 1e6),
  );
  const candidates = decades.length >= 3 ? decades : ticks;
  const kept: number[] = [];
  for (const tick of [1, ...candidates.filter((candidate) => candidate !== 1)]) {
    if (kept.every((other) => Math.abs(x(other) - x(tick)) >= MIN_TICK_GAP)) kept.push(tick);
  }
  return kept.sort((left, right) => left - right);
}
