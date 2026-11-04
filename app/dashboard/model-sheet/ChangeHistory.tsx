/** A model variant's updates over the change-history window: each score's trail across them, a stepper through them, and the chosen update's details. */

import { type CSSProperties, type KeyboardEvent, useEffect, useState } from "react";

import type {
  ModelAtlasModel,
  ModelAtlasScoreChange,
  ModelAtlasScoreDimension,
} from "../../../src/model-atlas/stats/types";
import { providerBrandColor } from "../shared/provider-theme";
import { scoreColumnsByDimension } from "../table/Columns";
import { formatScore } from "../table/format";
import {
  changeEntry,
  changeScores,
  changeShortDate,
  type MoveDirection,
  moveDirection,
  ScoreChangeDetails,
  scoreChangeSummary,
} from "../table/ScoreChange";

import styles from "./model-sheet.module.css";

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; updates: ModelAtlasScoreChange[] }
  | { status: "failed" };
type Updates = readonly [ModelAtlasScoreChange, ...ModelAtlasScoreChange[]];

type Point = { x: number; value: number };
type Trail = {
  dimension: ModelAtlasScoreDimension;
  current: number | null;
  drift: Point[][];
  moves: { x: number; before: number | null; after: number; direction: MoveDirection }[];
  values: number[];
};

const DIMENSIONS = [
  ["intelligence", "intelligence_score"],
  ["agentic", "agentic_score"],
  ["speed", "speed_score"],
  ["value", "value_score"],
] as const satisfies readonly (readonly [
  ModelAtlasScoreDimension,
  keyof ModelAtlasModel["scores"],
])[];
// Every trail shares one vertical scale so a row's rise reads against the others; a quiet history still spans this many points.
const MIN_TRAIL_SPAN = 4;

const stepDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** `effort` names the variant whose changes a collapsed row carries, since its model drops the effort label. */
export function ChangeHistory({
  model,
  effort,
  change,
}: {
  model: ModelAtlasModel;
  effort: string | null;
  change: ModelAtlasScoreChange;
}) {
  const variant = { ...model, reasoning_effort: effort };
  const history = useChangeHistory(variant);
  const updates =
    history.status === "ready" && isNonEmpty(history.updates) ? history.updates : null;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const found = updates?.findIndex(({ refresh_id }) => refresh_id === selectedId) ?? -1;
  // The latest update shows until the reader picks another.
  const selectedIndex = updates == null ? -1 : found >= 0 ? found : updates.length - 1;
  const update = updates?.[selectedIndex] ?? change;
  // With the stepper naming the update's date, only an entry needs a sentence.
  const entry = changeEntry(variant, update);
  const select = (index: number) => {
    if (updates?.[index] != null) setSelectedId(updates[index].refresh_id);
  };
  return (
    <section className={styles.section} aria-labelledby="model-sheet-change">
      <h3 id="model-sheet-change">
        Changes
        {updates == null ? null : (
          <small>
            {updates.length} {updates.length === 1 ? "update" : "updates"} in 30 days
          </small>
        )}
      </h3>
      {updates == null ? null : (
        <>
          <Trails model={model} updates={updates} selected={selectedIndex} onSelect={select} />
          <div className={styles.stepper}>
            <button
              aria-label="Earlier update"
              className={styles.stepButton}
              disabled={selectedIndex === 0}
              onClick={() => select(selectedIndex - 1)}
              type="button"
            >
              ‹
            </button>
            <span className={styles.stepLabel} aria-live="polite">
              {stepDate.format(update.refresh_id * 1000)} UTC
            </span>
            <button
              aria-label="Later update"
              className={styles.stepButton}
              disabled={selectedIndex === updates.length - 1}
              onClick={() => select(selectedIndex + 1)}
              type="button"
            >
              ›
            </button>
            <span className={styles.stepCount}>
              {selectedIndex + 1} of {updates.length}
            </span>
          </div>
        </>
      )}
      {updates == null ? (
        <p className={styles.note}>{scoreChangeSummary(variant, update)}</p>
      ) : entry == null ? null : (
        <p className={styles.note}>{entry}.</p>
      )}
      <ScoreChangeDetails model={model} change={update} tracks={updates == null} />
      {history.status === "failed" ? (
        <p className={styles.note}>Earlier updates couldn&apos;t load, so only the latest shows.</p>
      ) : null}
    </section>
  );
}

function isNonEmpty<T>(items: T[]): items is [T, ...T[]] {
  return items.length > 0;
}

/** Loads the variant's updates only when its payload row lists recent ones. */
function useChangeHistory(model: ModelAtlasModel): HistoryState {
  const hasRecent = (model.recent_changes?.length ?? 0) > 0;
  const [state, setState] = useState<HistoryState>(
    hasRecent ? { status: "loading" } : { status: "ready", updates: [] },
  );
  useEffect(() => {
    if (!hasRecent || model.id == null) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ model: model.id });
    if (model.reasoning_effort != null) params.set("effort", model.reasoning_effort);
    void fetch(`/api/llm-stats/changes?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return ((await response.json()) as { updates: ModelAtlasScoreChange[] }).updates;
      })
      .then((updates) => {
        if (!controller.signal.aborted) setState({ status: "ready", updates });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed" });
      });
    return () => controller.abort();
  }, [hasRecent, model.id, model.reasoning_effort]);
  return state;
}

function Trails({
  model,
  updates,
  selected,
  onSelect,
}: {
  model: ModelAtlasModel;
  updates: Updates;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [first, ...later] = updates;
  const last = later.at(-1) ?? first;
  const x = (index: number) => ((index + 0.5) / updates.length) * 100;
  const trails = DIMENSIONS.map(([dimension, scoreKey]) =>
    trailOf(dimension, model.scores[scoreKey], updates, x),
  );
  const span =
    Math.max(
      MIN_TRAIL_SPAN,
      ...trails.map(({ values }) => Math.max(...values) - Math.min(...values)),
    ) * 1.25;
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowLeft: selected - 1,
      ArrowRight: selected + 1,
      Home: 0,
      End: updates.length - 1,
    }[event.key];
    if (next == null || next < 0 || next >= updates.length) return;
    event.preventDefault();
    onSelect(next);
    event.currentTarget.querySelectorAll("button")[next]?.focus();
  };
  return (
    <div
      className={styles.trails}
      style={{ "--score-color": providerBrandColor(model.provider) } as CSSProperties}
    >
      {trails.map((trail) => {
        const values = trail.values.length > 0 ? trail.values : [0];
        const center = (Math.max(...values) + Math.min(...values)) / 2;
        const y = (value: number) => 50 - ((value - center) / span) * 100;
        return (
          <div className={styles.trailRow} key={trail.dimension}>
            <span className={styles.trailLabel}>
              {scoreColumnsByDimension[trail.dimension].name}
            </span>
            <span className={styles.trail} aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                {trail.drift.map((points, index) => (
                  <polyline
                    className={styles.trailDrift}
                    key={index}
                    points={points.map((point) => `${point.x},${y(point.value)}`).join(" ")}
                  />
                ))}
                {trail.moves.flatMap((move) =>
                  move.before == null
                    ? []
                    : [
                        <line
                          className={styles.trailMove}
                          data-direction={move.direction}
                          key={move.x}
                          x1={move.x}
                          x2={move.x}
                          y1={y(move.before)}
                          y2={y(move.after)}
                        />,
                      ],
                )}
              </svg>
              <span className={styles.trailCursor} style={{ left: `${x(selected)}%` }} />
              {trail.moves.map((move) => (
                <span
                  className={styles.trailDot}
                  data-direction={move.direction}
                  key={move.x}
                  style={{ left: `${move.x}%`, top: `${y(move.after)}%` }}
                />
              ))}
              {trail.current == null ? null : (
                <span className={styles.trailNow} style={{ top: `${y(trail.current)}%` }} />
              )}
            </span>
            <span className={styles.trailValue}>{formatScore(trail.current)}</span>
          </div>
        );
      })}
      <div aria-label="Updates" className={styles.trailColumns} onKeyDown={step} role="radiogroup">
        {updates.map((update, index) => (
          <button
            aria-checked={index === selected}
            aria-label={`${stepDate.format(update.refresh_id * 1000)} UTC`}
            className={styles.trailColumn}
            key={update.refresh_id}
            onClick={() => onSelect(index)}
            role="radio"
            tabIndex={index === selected ? 0 : -1}
            type="button"
          />
        ))}
      </div>
      <div className={styles.trailAxis} aria-hidden="true">
        <span className={styles.trailTicks}>
          {updates.map((update, index) => (
            <span
              className={styles.trailTick}
              data-selected={index === selected || undefined}
              key={update.refresh_id}
              style={{ left: `${x(index)}%` }}
            />
          ))}
        </span>
        <span>{changeShortDate(first)}</span>
        <span>{changeShortDate(last)}</span>
      </div>
    </div>
  );
}

/**
 * One score's path across the updates: drift segments join an update's score after to the next update's score before, since smaller changes between updates aren't recorded, and the last reaches the current score at the right edge.
 * A score no update moved is a flat line at its current value.
 */
function trailOf(
  dimension: ModelAtlasScoreDimension,
  current: number | null,
  updates: Updates,
  x: (index: number) => number,
): Trail {
  const moves = updates.flatMap((update, index) => {
    const move = changeScores(update).find((score) => score.dimension === dimension);
    return move == null
      ? []
      : [
          {
            x: x(index),
            before: move.score_before,
            after: move.score_after,
            direction: moveDirection(move),
          },
        ];
  });
  const drift: Point[][] = [];
  let from: Point | null = null;
  for (const move of moves) {
    if (move.before != null)
      drift.push([from ?? { x: 0, value: move.before }, { x: move.x, value: move.before }]);
    from = { x: move.x, value: move.after };
  }
  if (current != null) drift.push([from ?? { x: 0, value: current }, { x: 100, value: current }]);
  return {
    dimension,
    current,
    drift,
    moves,
    values: [
      ...moves.flatMap(({ before, after }) => (before == null ? [after] : [before, after])),
      ...(current == null ? [] : [current]),
    ],
  };
}
