"use client";

/** Pointer projection, cursor overlays, and interactive hit targets for dashboard SVG plots. */

import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { openModelSheet } from "../../model-sheet/open";
import { modelName } from "../../shared/model-display";
import { focusHover, type HoverRow, type HoverSetter, pointHover } from "../HoverCard";
import type { PlotBounds } from "./Primitives";

import styles from "../graphs.module.css";

// A cursor projection snaps to the nearest point within this many plot units, and to none farther away.
const SNAP_DISTANCE = 24;

type CursorProjection = {
  x: number;
  y: number;
  xValue: number;
  yValue: number;
};

type ProjectionConfig = {
  event: ReactPointerEvent<SVGSVGElement>;
  bounds: PlotBounds;
  points: CursorProjection[];
};

type ProjectionTarget = Omit<ProjectionConfig, "event">;

function projectCursor({ event, bounds: plot, points }: ProjectionConfig): CursorProjection | null {
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

  let nearestPoint: CursorProjection | null = null;
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

  return nearestPoint && nearestDistance <= SNAP_DISTANCE ? nearestPoint : null;
}

export function useCursorProjection() {
  const [cursorProjection, setCursorProjection] = useState<CursorProjection | null>(null);

  return {
    cursorProjection,
    cursorHandlers: ({ bounds, points }: ProjectionTarget) => ({
      onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
        const next = projectCursor({ event, bounds, points });
        setCursorProjection((previous) =>
          previous?.x === next?.x &&
          previous?.y === next?.y &&
          previous?.xValue === next?.xValue &&
          previous?.yValue === next?.yValue
            ? previous
            : next,
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
      width={Math.max(0, bounds.right - bounds.left)}
      height={Math.max(0, bounds.bottom - bounds.top)}
    />
  );
}

/** The cursor's guides drop to the axes and its readings sit on them over the tick labels, outside the plot where model names never go. */
export function CursorProjectionLayer({
  projection,
  bounds,
  xLabel,
  yLabel,
  color,
  insetScale = false,
}: {
  projection: CursorProjection | null;
  bounds: PlotBounds;
  xLabel: string;
  yLabel: string;
  color?: string;
  /** The y scale sits inside the plot, as compact plots' anchors do, so its reading does too, above the guide. */
  insetScale?: boolean;
}) {
  if (!projection) {
    return null;
  }
  return (
    <g
      className={styles.cursorProjection}
      style={color == null ? undefined : ({ "--projection-color": color } as CSSProperties)}
    >
      <line x1={projection.x} x2={projection.x} y1={projection.y} y2={bounds.bottom} />
      <line x1={bounds.left} x2={projection.x} y1={projection.y} y2={projection.y} />
      <circle cx={projection.x} cy={projection.y} r={3} />
      <AxisReading x={projection.x} y={bounds.bottom + 24} textAnchor="middle">
        {xLabel}
      </AxisReading>
      {insetScale ? (
        <AxisReading x={bounds.left + 6} y={projection.y - 6} textAnchor="start">
          {yLabel}
        </AxisReading>
      ) : (
        <AxisReading x={bounds.left - 15} y={projection.y + 4} textAnchor="end">
          {yLabel}
        </AxisReading>
      )}
    </g>
  );
}

/** A reading set where the axis labels sit, on a backdrop measured from its text so the tick label beneath gives way. */
function AxisReading({
  x,
  y,
  textAnchor,
  children,
}: {
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  children: ReactNode;
}) {
  const text = useRef<SVGTextElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    setBox(text.current?.getBBox() ?? null);
  }, [x, y, textAnchor, children]);
  return (
    <>
      {box == null ? null : (
        <rect
          className={styles.cursorReadingBackdrop}
          x={box.x - 5}
          y={box.y - 2}
          width={box.width + 10}
          height={box.height + 4}
          rx={2}
        />
      )}
      <text ref={text} className={styles.cursorProjectionLabel} x={x} y={y} textAnchor={textAnchor}>
        {children}
      </text>
    </>
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
  model: ModelAtlasModel;
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
        aria-haspopup="dialog"
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          setActive(true);
          setHover(pointHover(event, model, rows, displayName));
        }}
        onFocus={(event) => {
          setActive(true);
          setHover(focusHover(event.currentTarget, model, rows, displayName));
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          setHover((hover) =>
            hover == null ||
            (Math.abs(hover.left - event.clientX) < 6 && Math.abs(hover.top - event.clientY) < 6)
              ? hover
              : {
                  ...hover,
                  left: event.clientX,
                  top: event.clientY,
                },
          );
        }}
        // Hover and focus preview a star; choosing it opens the model's full sheet.
        onClick={() => {
          setHover(null);
          openModelSheet(model);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch" || event.currentTarget === document.activeElement)
            return;
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
