"use client";

/** Range presets, pan steps, and the frontier replay's transport edit the chart's time window; a pan keeps the window's span. */

import { ChevronLeft, ChevronRight, Pause, Play, Square } from "lucide-react";

import { GraphToggle } from "../GraphToggle";

import styles from "./timeline.module.css";

export function TimelineNavigator({
  bounds,
  range,
  onChange,
  preset,
  onPreset,
  replay,
}: {
  preset: string;
  onPreset: (value: "all" | "year") => void;
  bounds: [number, number];
  range: [number, number];
  onChange: (range: [number, number]) => void;
  /** The frontier replay's transport. */
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
  const span = range[1] - range[0];
  const move = (start: number) => {
    const left = Math.max(0, Math.min(1 - span, start));
    onChange([left, left + span]);
  };
  const playing = replay.at != null && !replay.paused;
  const playLabel = playing
    ? "Pause replay"
    : replay.paused
      ? "Resume replay"
      : "Replay the frontier's rise";
  const date = (value: number) =>
    new Date(bounds[0] + value * (bounds[1] - bounds[0])).toISOString().slice(0, 10);
  const windowDates = `${date(range[0])} — ${date(replay.at ?? range[1])}`;
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
        <button
          aria-label={playLabel}
          title={playLabel}
          onClick={playing ? replay.onPause : replay.onPlay}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          aria-label="Stop replay"
          title="Stop replay"
          disabled={replay.at == null}
          onClick={replay.onStop}
        >
          <Square size={13} />
        </button>
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
        <span>{windowDates}</span>
      </div>
    </div>
  );
}
