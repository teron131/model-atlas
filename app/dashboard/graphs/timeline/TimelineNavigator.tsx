"use client";

/** The Timeline's time-window controls: range presets, the frontier replay's transport with pan steps that keep the window's span, and an overview of every model across the full span, whose window drags to pan and whose edges drag or step to zoom, as a video editor's timeline does. */

import { ChevronLeft, ChevronRight, Pause, Play, Square } from "lucide-react";
import { type PointerEvent, useId, useMemo, useRef } from "react";

import { providerChartColor } from "../../shared/provider-theme";
import { GraphToggle } from "../GraphToggle";
import { HorizonLightStops } from "../plot/Primitives";
import type { TimelinePoint } from "./chart-data";
import { coverageFrontier } from "./frontier";

import styles from "./timeline.module.css";

// The narrowest window the overview's edges allow, as a share of the full span.
const MINIMUM_SPAN = 1 / 64;

export function TimelineNavigator({
  points,
  bounds,
  range,
  onChange,
  preset,
  onPreset,
  replay,
}: {
  points: TimelinePoint[];
  preset: string;
  onPreset: (value: "all" | "year") => void;
  bounds: [number, number];
  range: [number, number];
  onChange: (range: [number, number]) => void;
  replay: {
    /** How far the replay has reached, on the same normalized scale as `range`; `null` while idle. */
    at: number | null;
    paused: boolean;
    /** Start the replay, or resume it when paused. */
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
  };
}) {
  const drag = useRef<{ x: number; width: number; range: [number, number]; mode: string } | null>(
    null,
  );
  const span = range[1] - range[0];
  const move = (start: number) => {
    const left = Math.max(0, Math.min(1 - span, start));
    onChange([left, left + span]);
  };
  const resize = (edge: number, value: number) =>
    onChange(
      edge === 0
        ? [Math.max(0, Math.min(range[1] - MINIMUM_SPAN, value)), range[1]]
        : [range[0], Math.min(1, Math.max(range[0] + MINIMUM_SPAN, value))],
    );
  const playing = replay.at != null && !replay.paused;
  const playLabel = playing
    ? "Pause replay"
    : replay.paused
      ? "Resume replay"
      : "Replay the frontier's rise";
  const date = (value: number) =>
    new Date(bounds[0] + value * (bounds[1] - bounds[0])).toISOString().slice(0, 10);
  const windowDates = `${date(range[0])} — ${date(replay.at ?? range[1])}`;
  // The overview carries the chart's frontier as a small horizon, so the window frames a stretch of it; it is drawn once per population, so a replay moving the window redraws only the window.
  const horizonId = useId();
  const [from, to] = bounds;
  const overview = useMemo(() => {
    const low = Math.min(...points.map((point) => point.score));
    const high = Math.max(...points.map((point) => point.score));
    const overviewX = (point: TimelinePoint) =>
      8 + ((Date.parse(point.releaseDate) - from) / (to - from)) * 984;
    const overviewY = (point: TimelinePoint) =>
      56 - ((point.score - low) / Math.max(1, high - low)) * 48;
    const horizon = coverageFrontier(points).map((point) => ({
      x: overviewX(point),
      y: overviewY(point),
    }));
    const horizonPath =
      horizon.length === 0
        ? ""
        : `${horizon.map(({ x, y }, index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("")}L992,${horizon.at(-1)!.y.toFixed(1)}`;
    return (
      <svg viewBox="0 0 1000 64" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${horizonId}-rim`} x1="0" y1="0" x2="1" y2="0">
            <HorizonLightStops />
          </linearGradient>
          <linearGradient id={`${horizonId}-land`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8f6bff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#8f6bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {horizon.length > 0 ? (
          <>
            <path
              d={`${horizonPath}L992,64L${horizon[0]!.x.toFixed(1)},64Z`}
              fill={`url(#${horizonId}-land)`}
            />
            <path
              className={styles.navigatorRim}
              d={horizonPath}
              stroke={`url(#${horizonId}-rim)`}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        {/* The overview stretches to its width, so each dot is a round cap on a screen-sized stroke and stays a circle at any width. */}
        {points.map((point) => (
          <path
            key={point.id}
            d={`M${overviewX(point).toFixed(1)},${overviewY(point).toFixed(1)}h0`}
            stroke={providerChartColor(point.provider)}
            strokeWidth="4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={(0.35 + (point.coverage ?? 0) * 0.65) * 0.75}
          />
        ))}
      </svg>
    );
  }, [points, from, to, horizonId]);

  /** Measure drag deltas against the overview's full width, even after the pointer leaves a handle; a press outside the window first centres the window there. */
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
      onChange([Math.max(0, Math.min(end - MINIMUM_SPAN, start + delta)), end]);
    else if (active.mode === "end")
      onChange([start, Math.min(1, Math.max(start + MINIMUM_SPAN, end + delta))]);
    else move(start + delta);
  }
  const release = () => {
    drag.current = null;
  };
  return (
    <div className={styles.timeEditor} aria-label="Timeline navigator" data-capture-exclude>
      <GraphToggle
        legend="Timeline range presets"
        selectedKey={preset}
        onSelect={(value) => onPreset(value as "all" | "year")}
        options={[
          { key: "all", label: "Since GPT-4" },
          { key: "year", label: "Latest year" },
        ]}
      />
      <div className={styles.timeTransport}>
        <button aria-label={playLabel} onClick={playing ? replay.onPause : replay.onPlay}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button aria-label="Stop replay" disabled={replay.at == null} onClick={replay.onStop}>
          <Square size={13} />
        </button>
        <button
          aria-label="Pan earlier"
          disabled={range[0] <= 0}
          onClick={() => move(range[0] - span / 3)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Pan later"
          disabled={range[1] >= 1}
          onClick={() => move(range[0] + span / 3)}
        >
          <ChevronRight size={16} />
        </button>
        <span>{windowDates}</span>
      </div>
      <div className={styles.navigator} aria-label="Timeline overview">
        {overview}
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
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
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
      <div
        className={styles.navigatorCaption}
        data-window={span < 1 || replay.at != null ? "part" : "full"}
      >
        <span>{date(0)}</span>
        <span className={styles.captionWindow}>{windowDates}</span>
        <span>{date(1)}</span>
      </div>
    </div>
  );
}
