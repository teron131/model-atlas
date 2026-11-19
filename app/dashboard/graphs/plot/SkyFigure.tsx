"use client";

/**
 * A plot on the dashboard's sky: `stars` are drawn by the sky where it runs, and the SVG in `children` carries everything else at the same coordinates.
 * A plot drawn wider than its host scrolls sideways inside it, as the leaderboard's table does, instead of squeezing; a mouse, which has no sideways scroll, pans it by dragging any mark tagged `data-pans`.
 */

import { type CSSProperties, type ReactNode, useRef } from "react";

import { useDragPan } from "../../shared/use-drag-pan";
import type { useChartLayout } from "../use-chart-layout";
import { type PlotBounds, SCATTER_CHART_WIDTH } from "./Primitives";
import type { SkyPlotScene, SkyPlotStar } from "./sky-renderer";
import { SkyPlot } from "./SkyPlot";

import styles from "../graphs.module.css";

export function SkyFigure({
  layout,
  width = layout.width,
  pinned,
  height,
  bounds,
  stars,
  flare,
  found = [],
  sky = true,
  horizon = false,
  label,
  onLeave,
  children,
}: {
  layout: ReturnType<typeof useChartLayout>;
  /** The width the plot is drawn at, when a chart needs more than its host gives. */
  width?: number;
  /** Marks in the plot's coordinates that hold the left edge while the plot scrolls, on an opaque strip `width` wide; they are drawn here and not in `children`. */
  pinned?: { width: number; marks: ReactNode };
  height: number;
  bounds: PlotBounds;
  /** Paints the plot as sky; a table's rows leave it off, so their stars sit on the bare panel at one size and light. */
  sky?: boolean;
  /** Lights the plot's foot as the sky's horizon, for marks that rise from it. */
  horizon?: boolean;
  stars: readonly SkyPlotStar[];
  /** Key of the star under the pointer, which flares. */
  flare: string | null;
  /** Stars of the models the find field located, which flare out once from when they were located. */
  found?: SkyPlotScene["found"];
  label: string;
  onLeave: () => void;
  children: ReactNode;
}) {
  const { plotHost, compact } = layout;
  const scrolls = width > layout.width;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pan = useDragPan({
    accepts: (target) => scrolls && target.closest("[data-pans]") != null,
    scrollLeft: () => scrollerRef.current!.scrollLeft,
    scrollTo: (left) => {
      scrollerRef.current!.scrollLeft = left;
    },
  });
  const scene: SkyPlotScene = {
    width,
    height,
    bounds,
    sky,
    // A rim along the plot's foot leaves no room for a planet beneath it, so only its light shows.
    rim: horizon
      ? [
          { x: bounds.left, y: bounds.bottom },
          { x: bounds.right, y: bounds.bottom },
        ]
      : [],
    trail: null,
    muted: false,
    stars,
    flare,
    found,
    compact,
  };
  return (
    <div
      {...plotHost}
      className={styles.chartWrap}
      style={{ "--chart-max-width": `${SCATTER_CHART_WIDTH}px` } as CSSProperties}
    >
      <div
        className={styles.scroller}
        data-scrolls={scrolls || undefined}
        ref={scrollerRef}
        {...pan}
      >
        <div className={styles.scrollStage} style={{ width }}>
          <SkyPlot scene={scene}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={label}
              onPointerLeave={onLeave}
            >
              {children}
            </svg>
          </SkyPlot>
          {pinned == null ? null : (
            <svg
              className={styles.pinned}
              viewBox={`0 0 ${pinned.width} ${height}`}
              style={{ width: pinned.width, height, margin: 0 }}
              aria-hidden="true"
            >
              {pinned.marks}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
