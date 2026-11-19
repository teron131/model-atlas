"use client";

/** Pointer picking, cursor overlays, and interactive hit targets for dashboard SVG plots. */

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { openModelSheet } from "../../model-sheet/open";
import { modelName } from "../../shared/model-display";
import type { PlotBounds } from "./Primitives";

import styles from "../graphs.module.css";

// The pointer picks the nearest point within this many plot units, and none farther away.
const SNAP_DISTANCE = 24;

type CursorProjection = {
  x: number;
  y: number;
  xValue: number;
  yValue: number;
};

type PlotPoint = { x: number; y: number };

/** The pointer's position in the SVG's viewBox units. */
export function pointerPosition(event: ReactMouseEvent<SVGSVGElement>): PlotPoint {
  const svg = event.currentTarget;
  const bounds = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
    y: ((event.clientY - bounds.top) / bounds.height) * viewBox.height,
  };
}

/** The point nearest `at` within `SNAP_DISTANCE`, or none when `at` lies outside the plot or no point is that near. */
export function nearestPoint<Point extends PlotPoint>(
  at: PlotPoint,
  plot: PlotBounds,
  points: readonly Point[],
): Point | null {
  if (at.x < plot.left || at.x > plot.right || at.y < plot.top || at.y > plot.bottom) return null;
  let nearest: Point | null = null;
  let nearestDistance = Infinity;
  for (const point of points) {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = point;
    }
  }
  return nearestDistance <= SNAP_DISTANCE ? nearest : null;
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
      <line x1={projection.x} x2={projection.x} y1={projection.y} y2={bounds.bottom} />
      <line x1={bounds.left} x2={projection.x} y1={projection.y} y2={projection.y} />
      <circle cx={projection.x} cy={projection.y} r={3} />
      <AxisReading x={projection.x} y={bounds.bottom + 24} textAnchor="middle">
        {xLabel}
      </AxisReading>
      <AxisReading x={bounds.left - 15} y={projection.y + 4} textAnchor="end">
        {yLabel}
      </AxisReading>
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
  onActiveChange,
}: {
  cx: number;
  cy: number;
  model: ModelAtlasModel;
  onActiveChange: (active: boolean) => void;
}) {
  const size = 28;
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
        aria-label={`Show details for ${modelName(model)}`}
        aria-haspopup="dialog"
        // The keyboard previews a star by focusing it and opens the model's full sheet by choosing it; pointers pick stars through the plot, since the button takes no pointer events.
        onFocus={() => onActiveChange(true)}
        onClick={() => openModelSheet(model)}
        onBlur={() => onActiveChange(false)}
      />
    </foreignObject>
  );
}

/** A mark a click holds until a click lands anywhere but a mark tagged `data-keeps-pick`; hovering another shows that one only while the pointer rests on it. */
export function usePick<T>(): [T | null, (pick: T) => void] {
  const [picked, setPicked] = useState<T | null>(null);
  useEffect(() => {
    if (picked == null) return;
    const release = (event: MouseEvent) => {
      if (!(event.target instanceof Element && event.target.closest("[data-keeps-pick]")))
        setPicked(null);
    };
    document.addEventListener("click", release);
    return () => document.removeEventListener("click", release);
  }, [picked]);
  return [picked, setPicked];
}
