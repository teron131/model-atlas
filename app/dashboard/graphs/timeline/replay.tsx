"use client";

/** The record frontier's replay: a camera that travels the chosen window with the reveal, framing the models around it, then pulls back to the whole window. */

import { useCallback, useEffect, useRef, useState } from "react";

import { type TimelinePoint, timelineScoreDomain } from "./chart-data";

// The reveal crosses the window in this long, holding briefly on each new record, then the camera settles back to the window.
const SWEEP_MS = 11000;
const RECORD_HOLD_MS = 160;
const SETTLE_MS = 1700;
// The camera frames this share of the window, keeps this share of it ahead of the reveal, and eases toward each new framing.
const CAMERA_SPAN = 0.25;
const CAMERA_LEAD = 0.045;
const CAMERA_EASE_MS = { time: 200, score: 260 };
const STEP_MS = 1000 / 60;
// Under reduced motion the replay advances in a few still steps, with models and records arriving already settled.
const STILL_STEPS = 8;
// How long a newly reached model takes to settle, and how long the frontier takes to climb to a new record.
const ARRIVAL_MS = 350;
export const RECORD_RISE_MS = 480;

/** A camera framing: release dates in epoch milliseconds and Intelligence Index bounds. */
export type ReplayView = { start: number; end: number; low: number; high: number };

export type ReplayFrame = {
  /** The release date the reveal has reached. */
  at: number;
  view: ReplayView;
  /** Progress of the closing pull-back to the whole window, from 0 to 1. */
  settle: number;
  /** Time since the reveal reached a model, or `Infinity` under reduced motion so nothing animates; `null` before it is reached. */
  age: (id: string) => number | null;
};

type ReplayPlan = {
  duration: number;
  frame: (elapsed: number, still: boolean) => ReplayFrame;
};

/**
 * Plan a replay of `points` from `from` to `to`, ending on `full`, the window's static framing.
 * The camera's eased path is sampled once here, so each frame only looks it up.
 * `records` are the window's frontier records in date order and `prior` the record standing at its start, whose level frames the camera until a later record replaces it.
 */
export function followReplayPlan(
  points: readonly TimelinePoint[],
  records: readonly TimelinePoint[],
  prior: TimelinePoint | undefined,
  from: number,
  to: number,
  full: ReplayView,
): ReplayPlan {
  const rate = (to - from) / SWEEP_MS;
  const recordTimes = records.map((point) => Date.parse(point.releaseDate));
  const sweep = SWEEP_MS + RECORD_HOLD_MS * recordTimes.length;
  const reachedAt = new Map(
    points.map((point) => {
      const time = Date.parse(point.releaseDate);
      const held = recordTimes.filter((record) => record < time).length;
      return [point.id, (time - from) / rate + RECORD_HOLD_MS * held];
    }),
  );
  const reached = (elapsed: number) => {
    let clock = 0;
    let date = from;
    for (const record of recordTimes) {
      const run = (record - date) / rate;
      if (elapsed < clock + run) return date + (elapsed - clock) * rate;
      clock += run;
      if (elapsed < clock + RECORD_HOLD_MS) return record;
      clock += RECORD_HOLD_MS;
      date = record;
    }
    return Math.min(to, date + (elapsed - clock) * rate);
  };

  const span = CAMERA_SPAN * (full.end - full.start);
  const lead = CAMERA_LEAD * (full.end - full.start);
  const dated = points.map((point) => ({
    time: Date.parse(point.releaseDate),
    score: point.score,
  }));
  const standing = [...(prior ? [prior] : []), ...records].map((point) => ({
    time: Date.parse(point.releaseDate),
    score: point.score,
  }));
  // The camera frames the models reached so far around the reveal, with the record standing at its left edge, whose level the frontier enters at.
  const framing = (date: number): ReplayView => {
    const end = Math.min(full.end, Math.max(full.start + span, date + lead));
    const start = end - span;
    const scores = dated
      .filter(({ time }) => time <= date && time >= start && time <= end)
      .map(({ score }) => score);
    const entering = standing.filter(({ time }) => time < start).at(-1);
    const [low, high] = timelineScoreDomain(entering ? [...scores, entering.score] : scores);
    return { start, end, low, high };
  };
  const path: ReplayView[] = [];
  let view = framing(from);
  for (let elapsed = 0; elapsed <= sweep; elapsed += STEP_MS) {
    const goal = framing(reached(elapsed));
    const end = approach(view.end, goal.end, CAMERA_EASE_MS.time);
    view = {
      start: end - span,
      end,
      low: approach(view.low, goal.low, CAMERA_EASE_MS.score),
      high: approach(view.high, goal.high, CAMERA_EASE_MS.score),
    };
    path.push(view);
  }
  const last = path.at(-1)!;

  return {
    duration: sweep + SETTLE_MS,
    frame: (elapsed, still) => {
      const age = (id: string) => {
        const at = reachedAt.get(id);
        return at == null || at > elapsed ? null : still ? Infinity : elapsed - at;
      };
      if (elapsed < sweep)
        return {
          at: reached(elapsed),
          view: path[Math.min(path.length - 1, Math.floor(elapsed / STEP_MS))]!,
          settle: 0,
          age,
        };
      const settle = easeInOut(Math.min(1, (elapsed - sweep) / SETTLE_MS));
      return {
        at: to,
        view: {
          start: lerp(last.start, full.start, settle),
          end: lerp(last.end, full.end, settle),
          low: lerp(last.low, full.low, settle),
          high: lerp(last.high, full.high, settle),
        },
        settle,
        age,
      };
    },
  };
}

/**
 * Run a replay plan's clock, redrawing every frame or in a few still steps under reduced motion, until it ends or stops; starting again restarts it, and it never outlives its component.
 * A pause keeps the frame it reached with no frames running, and resuming continues from it. `start`, `pause` and `stop` keep their identity across renders.
 */
export function useReplay() {
  const [state, setState] = useState<{
    plan: ReplayPlan;
    elapsed: number;
    still: boolean;
    paused: boolean;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const halt = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const run = useCallback(
    (plan: ReplayPlan, from: number, still: boolean) => {
      halt();
      const began = performance.now() - from;
      let shown = Math.floor((from / plan.duration) * STILL_STEPS);
      const tick = (now: number) => {
        // A frame's timestamp marks when the frame began, which can precede the call that started or resumed the replay.
        const elapsed = Math.max(from, now - began);
        if (elapsed >= plan.duration) {
          frame.current = null;
          setState(null);
          return;
        }
        if (!still) setState({ plan, elapsed, still, paused: false });
        else {
          const step = Math.floor((elapsed / plan.duration) * STILL_STEPS);
          if (step !== shown) {
            shown = step;
            setState({ plan, elapsed: (step / STILL_STEPS) * plan.duration, still, paused: false });
          }
        }
        frame.current = requestAnimationFrame(tick);
      };
      setState({ plan, elapsed: from, still, paused: false });
      frame.current = requestAnimationFrame(tick);
    },
    [halt],
  );
  const start = useCallback(
    (plan: ReplayPlan) =>
      run(plan, 0, window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    [run],
  );
  const pause = useCallback(() => {
    halt();
    setState((current) => current && { ...current, paused: true });
  }, [halt]);
  const stop = useCallback(() => {
    halt();
    setState(null);
  }, [halt]);
  useEffect(() => halt, [halt]);
  return {
    frame: state && state.plan.frame(state.elapsed, state.still),
    paused: state?.paused ?? false,
    start,
    pause,
    resume: () => {
      if (state?.paused) run(state.plan, state.elapsed, state.still);
    },
    stop,
  };
}

/** How far a model reached `age` ago has settled into its mark, from 0 to 1. */
export function arrival(age: number | null) {
  return age == null ? 1 : easeOut(age / ARRIVAL_MS);
}

export function easeOut(progress: number) {
  return 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;
}

function easeInOut(progress: number) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

/** Move one sampling step toward `goal`, closing the gap with time constant `ms`. */
function approach(value: number, goal: number, ms: number) {
  return value + (goal - value) * (1 - Math.exp(-STEP_MS / ms));
}
