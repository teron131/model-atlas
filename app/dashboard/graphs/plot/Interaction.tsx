"use client";

/** Pointer projection, cursor overlays, and interactive hit targets for dashboard SVG plots. */

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useState } from "react";

import type { ModelAtlasPublishedModel } from "../../../../src/model-atlas/stats/types";
import { modelName } from "../../shared/model-display";
import { focusHover, pointHover } from "../hover-state";
import type { HoverRow, HoverSetter } from "../types";
import type { PlotBounds } from "./Primitives";

import styles from "../graphs.module.css";

type CursorProjection = {
  x: number;
  y: number;
  xValue: number;
  yValue: number;
};

type ProjectionPoint = CursorProjection;

type ProjectionConfig = {
  event: ReactPointerEvent<SVGSVGElement>;
  bounds: PlotBounds;
  points: ProjectionPoint[];
  snapDistance?: number;
};

type ProjectionTarget = Omit<ProjectionConfig, "event">;

/** Snap a pointer event to the nearest projected chart point within range. */
function projectCursor({
  event,
  bounds: plot,
  points,
  snapDistance = 24,
}: ProjectionConfig): CursorProjection | null {
  const svg = event.currentTarget;
  const bounds = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const pointerX = ((event.clientX - bounds.left) / bounds.width) * viewBox.width;
  const pointerY = ((event.clientY - bounds.top) / bounds.height) * viewBox.height;

  if (
    pointerX < plot.left ||
    pointerX > plot.right ||
    pointerY < plot.top ||
    pointerY > plot.bottom
  ) {
    return null;
  }

  let nearestPoint: ProjectionPoint | null = null;
  let nearestDistance = Infinity;
  for (const point of points) {
    const dx = point.x - pointerX;
    const dy = point.y - pointerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = point;
    }
  }

  return nearestPoint && nearestDistance <= snapDistance ? nearestPoint : null;
}

/** Track nearest-point cursor projection state for SVG charts. */
export function useCursorProjection() {
  const [cursorProjection, setCursorProjection] = useState<CursorProjection | null>(null);

  return {
    cursorProjection,
    cursorHandlers: ({ bounds, points, snapDistance }: ProjectionTarget) => ({
      onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
        setCursorProjection(
          projectCursor({
            event,
            bounds,
            points,
            snapDistance,
          }),
        );
      },
      onPointerLeave: () => setCursorProjection(null),
    }),
    setCursorProjection,
  };
}

export function CursorCapture({ bounds }: { bounds: PlotBounds }) {
  return (
    <rect
      className={styles.cursorCapture}
      x={bounds.left}
      y={bounds.top}
      width={bounds.right - bounds.left}
      height={bounds.bottom - bounds.top}
    />
  );
}

export function CursorProjectionLayer({
  projection,
  bounds,
  xLabel,
  yLabel,
  color,
}: {
  projection: CursorProjection | null;
  bounds: PlotBounds;
  xLabel: string;
  yLabel: string;
  color?: string;
}) {
  if (!projection) {
    return null;
  }

  return (
    <g
      className={styles.cursorProjection}
      style={color == null ? undefined : ({ "--projection-color": color } as CSSProperties)}
    >
      <line x1={projection.x} x2={projection.x} y1={bounds.top} y2={projection.y} />
      <line x1={projection.x} x2={bounds.right} y1={projection.y} y2={projection.y} />
      <circle cx={projection.x} cy={projection.y} r={3} />
      <text
        className={styles.cursorProjectionLabel}
        x={projection.x}
        y={bounds.top - 8}
        textAnchor="middle"
      >
        {xLabel}
      </text>
      <text
        className={styles.cursorProjectionLabel}
        x={bounds.right + 10}
        y={projection.y + 4}
        textAnchor="start"
      >
        {yLabel}
      </text>
    </g>
  );
}

export function PointHitTarget({
  cx,
  cy,
  model,
  rows,
  setHover,
  hoverTitle,
  snapProjection,
  setCursorProjection,
  onActiveChange,
}: {
  cx: number;
  cy: number;
  model: ModelAtlasPublishedModel;
  rows: HoverRow[];
  setHover: HoverSetter;
  hoverTitle?: string;
  snapProjection?: CursorProjection;
  setCursorProjection?: (projection: CursorProjection | null) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const size = 28;
  const displayName = hoverTitle ?? modelName(model);
  const setActive = (active: boolean) => {
    onActiveChange?.(active);
    if (snapProjection) {
      setCursorProjection?.(active ? snapProjection : null);
    }
  };
  return (
    <foreignObject
      data-capture-exclude
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
    >
      <button
        type="button"
        className={styles.pointButton}
        aria-label={`Show details for ${displayName}`}
        onPointerEnter={(event) => {
          setActive(true);
          setHover(pointHover(event, model, rows, displayName));
        }}
        onFocus={(event) => {
          setActive(true);
          setHover(focusHover(event.currentTarget, model, rows, displayName));
        }}
        onPointerMove={(event) =>
          setHover((hover) =>
            hover == null ||
            (Math.abs(hover.left - event.clientX) < 6 && Math.abs(hover.top - event.clientY) < 6)
              ? hover
              : {
                  ...hover,
                  left: event.clientX,
                  top: event.clientY,
                },
          )
        }
        onPointerLeave={() => {
          setActive(false);
          setHover(null);
        }}
        onBlur={() => {
          setActive(false);
          setHover(null);
        }}
      />
    </foreignObject>
  );
}
