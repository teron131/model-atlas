"use client";

/** The overview retains the full time range while pointer capture and keyboard controls edit the chart window. */

import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { type PointerEvent, useRef } from "react";

import { providerChartColor } from "../../shared/provider-theme";
import { GraphToggle } from "../GraphToggle";
import type { TimelinePoint } from "./chart-data";

import styles from "../timeline.module.css";

/** Edit a normalized time window without filtering the overview; keep pointer and keyboard resizing within its minimum span. */
export function TimelineNavigator({
  points,
  bounds,
  range,
  onChange,
  preset,
  onPreset,
}: {
  preset: string;
  onPreset: (value: "all" | "year") => void;
  points: TimelinePoint[];
  bounds: [number, number];
  range: [number, number];
  onChange: (range: [number, number]) => void;
}) {
  const drag = useRef<{ x: number; width: number; range: [number, number]; mode: string } | null>(
    null,
  );
  const span = range[1] - range[0];
  const minimum = 1 / 64;
  const move = (start: number, size = span) => {
    const width = Math.max(minimum, Math.min(1, size));
    const left = Math.max(0, Math.min(1 - width, start));
    onChange([left, left + width]);
  };
  const zoom = (size: number) => move((range[0] + range[1] - size) / 2, size);
  const resize = (edge: number, value: number) =>
    onChange(
      edge === 0
        ? [Math.max(0, Math.min(range[1] - minimum, value)), range[1]]
        : [range[0], Math.min(1, Math.max(range[0] + minimum, value))],
    );
  const date = (value: number) =>
    new Date(bounds[0] + value * (bounds[1] - bounds[0])).toISOString().slice(0, 10);
  const low = Math.min(...points.map((p) => p.score));
  const high = Math.max(...points.map((p) => p.score));

  /** Measure drag deltas in the overview's full range, even after the pointer leaves a handle. */
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mode = (event.target as HTMLElement).dataset.edge ?? "pan";
    const position = (event.clientX - rect.left) / rect.width;
    let initial = range;
    if (mode === "pan" && (position < range[0] || position > range[1])) {
      const start = Math.max(0, Math.min(1 - span, position - span / 2));
      initial = [start, start + span];
      onChange(initial);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: rect.width, range: initial, mode };
    event.preventDefault();
  }
  function track(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active) return;
    const delta = (event.clientX - active.x) / active.width;
    const [start, end] = active.range;
    if (active.mode === "start")
      onChange([Math.max(0, Math.min(end - minimum, start + delta)), end]);
    else if (active.mode === "end")
      onChange([start, Math.min(1, Math.max(start + minimum, end + delta))]);
    else move(start + delta, end - start);
  }
  return (
    <div className={styles.timeEditor} aria-label="Timeline navigator" data-capture-exclude>
      <div className={styles.timePresets}>
        <GraphToggle
          legend="Timeline range presets"
          selectedKey={preset}
          onSelect={(value) => onPreset(value as "all" | "year")}
          options={[
            { key: "all", label: "Since GPT-4" },
            { key: "year", label: "Latest year" },
          ]}
        />
      </div>
      <div className={styles.timeTransport}>
        <div>
          <button
            aria-label="Pan earlier"
            title="Pan earlier"
            disabled={range[0] <= 0}
            onClick={() => move(range[0] - span / 3)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Pan later"
            title="Pan later"
            disabled={range[1] >= 1}
            onClick={() => move(range[0] + span / 3)}
          >
            <ChevronRight size={16} />
          </button>
          <span>
            {date(range[0])} — {date(range[1])}
          </span>
        </div>
        <div>
          <button
            aria-label="Zoom out"
            title="Zoom out"
            disabled={span >= 1}
            onClick={() => zoom(Math.min(1, span * 2))}
          >
            <Minus size={16} />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min="0"
            max="6"
            step="0.1"
            value={Math.log2(1 / span)}
            onChange={(event) => zoom(2 ** -Number(event.target.value))}
          />
          <button
            aria-label="Zoom in"
            title="Zoom in"
            disabled={span <= minimum}
            onClick={() => zoom(Math.max(minimum, span / 2))}
          >
            <Plus size={16} />
          </button>
          <button
            aria-label="Reset timeline window"
            title="Reset time range"
            disabled={span >= 1}
            onClick={() => onPreset("all")}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div className={styles.navigator} aria-label="Timeline overview">
        <svg viewBox="0 0 1000 64" preserveAspectRatio="none" aria-hidden="true">
          {points.map((p) => (
            <circle
              key={p.id}
              cx={8 + ((Date.parse(p.releaseDate) - bounds[0]) / (bounds[1] - bounds[0])) * 984}
              cy={56 - ((p.score - low) / Math.max(1, high - low)) * 48}
              r="2"
              fill={providerChartColor(p.provider)}
              opacity={0.35 + (p.coverage ?? 0) * 0.65}
            />
          ))}
        </svg>
        <div className={styles.rangeShade} style={{ left: 0, width: `${range[0] * 100}%` }} />
        <div className={styles.rangeShade} style={{ left: `${range[1] * 100}%`, right: 0 }} />
        <div
          className={styles.rangeWindow}
          style={{ left: `${range[0] * 100}%`, width: `${span * 100}%` }}
        />
        <div
          className={styles.rangeInteraction}
          onPointerDown={begin}
          onPointerMove={track}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          {(["start", "end"] as const).map((edge, index) => (
            <button
              key={edge}
              data-edge={edge}
              className={styles.rangeHandle}
              style={{ left: `${range[index]! * 100}%` }}
              role="slider"
              aria-label={`Visible range ${edge}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(range[index]! * 100)}
              aria-valuetext={date(range[index]!)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  resize(index, range[index]! + (event.key === "ArrowLeft" ? -0.01 : 0.01));
                }
              }}
            />
          ))}
        </div>
      </div>
      <div className={styles.navigatorCaption}>
        <span>{date(0)}</span>
        <span>Drag window to pan · Drag edges to zoom</span>
        <span>{date(1)}</span>
      </div>
    </div>
  );
}
