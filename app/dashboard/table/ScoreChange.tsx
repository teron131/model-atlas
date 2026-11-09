/** One update of a model variant, as the leaderboard's change cell and the model sheet's history show it: the scores it moved and the variant's own inputs that changed. */

import type { CSSProperties } from "react";

import type {
  ModelAtlasInputChange,
  ModelAtlasModel,
  ModelAtlasScoreChange,
  ModelAtlasScoreMove,
} from "../../../src/model-atlas/stats/types";
import { providerBrandColor } from "../shared/provider-theme";
import { scoreColumnsByDimension } from "./Columns";
import {
  formatCompactNumber,
  formatCost,
  formatDashboardMetric,
  formatRefreshDate,
  formatScore,
} from "./format";
import { benchmarkMetricColumns } from "./models";

type InputKind = ModelAtlasInputChange["kind"];

const INPUT_GROUPS = [
  { title: "Results", kinds: ["result"] },
  { title: "Per-task cost and time", kinds: ["task_cost", "task_time", "task_tokens"] },
  {
    title: "Provider price and speed",
    kinds: ["provider_price", "provider_speed", "provider_latency"],
  },
] as const satisfies readonly { title: string; kinds: readonly InputKind[] }[];

const TASK_METRIC_NAMES: Partial<Record<InputKind, string>> = {
  task_cost: "cost",
  task_time: "time",
  task_tokens: "tokens",
};

/** Every score the update moved, headline first; payloads published before update-level fields, and browser copies of them, carry the headline move alone. */
export function changeScores(change: ModelAtlasScoreChange): readonly ModelAtlasScoreMove[] {
  return change.scores ?? [change];
}

export function changeShortDate(change: ModelAtlasScoreChange): string {
  return formatRefreshDate(change.refresh_id, "short");
}

/** The headline score's move, or what the update did to it when its score number held. */
export function headlineMove(change: ModelAtlasScoreChange): string {
  if (change.score_delta == null) {
    return change.rank_after === 1 ? "new #1" : "new";
  }
  if (change.score_delta !== 0) {
    return signedDelta(change.score_delta);
  }
  if (
    change.rank_before != null &&
    change.rank_after != null &&
    change.rank_before !== change.rank_after
  ) {
    return `#${change.rank_before}→#${change.rank_after}`;
  }
  return "support";
}

export type MoveDirection = "up" | "down" | "new";

export function moveDirection(move: Pick<ModelAtlasScoreMove, "score_delta">): MoveDirection {
  return move.score_delta == null ? "new" : move.score_delta < 0 ? "down" : "up";
}

export function scoreChangeSummary(model: ModelAtlasModel, change: ModelAtlasScoreChange): string {
  return `${changeEntry(model, change) ?? "Updated"} on ${formatRefreshDate(change.refresh_id)}.`;
}

/** How the update added the variant to Atlas, or null for an update to a variant already listed. */
export function changeEntry(model: ModelAtlasModel, change: ModelAtlasScoreChange): string | null {
  if (change.entry === "model") {
    return "Added to Atlas";
  }
  if (change.entry === "variant") {
    return `Added as a new ${model.reasoning_effort ?? "default"} effort`;
  }
  // Entries logged before entry kinds were stored show only as scores with no earlier value.
  return changeScores(change).every(({ score_before }) => score_before == null) ? "Added" : null;
}

/** `tracks` draws each move on its 0–100 track; a view that already plots the scores over time leaves them out. */
export function ScoreChangeDetails({
  model,
  change,
  tracks,
}: {
  model: ModelAtlasModel;
  change: ModelAtlasScoreChange;
  tracks: boolean;
}) {
  return (
    <div
      className="score-change"
      style={{ "--score-color": providerBrandColor(model.provider) } as CSSProperties}
    >
      <ul className="score-change-moves">
        {changeScores(change).map((move) => (
          <ScoreMove key={move.dimension} move={move} track={tracks} />
        ))}
      </ul>
      <ChangedInputs change={change} />
    </div>
  );
}

function ScoreMove({ move, track }: { move: ModelAtlasScoreMove; track: boolean }) {
  const direction = moveDirection(move);
  const rank =
    move.rank_after == null
      ? null
      : move.rank_before == null
        ? `Entered at #${move.rank_after}`
        : move.rank_before === move.rank_after
          ? null
          : `Rank #${move.rank_before} → #${move.rank_after}`;
  const support =
    move.confidence_after == null || move.confidence_before === move.confidence_after
      ? null
      : move.confidence_before == null
        ? `Support ${move.confidence_after}%`
        : `Support ${move.confidence_before}% → ${move.confidence_after}%`;
  return (
    <li className="score-change-move" data-direction={direction}>
      <span className="score-change-dimension">{scoreColumnsByDimension[move.dimension].name}</span>
      <span className="score-change-score">
        {move.score_before == null ? null : (
          <span className="score-change-before">{formatScore(move.score_before)} → </span>
        )}
        <strong>{formatScore(move.score_after)}</strong>
        <span className="score-change-delta">
          {move.score_delta == null ? "new" : signedDelta(move.score_delta)}
        </span>
      </span>
      {track ? (
        <span
          aria-hidden="true"
          className="score-change-track"
          style={
            {
              "--before": String(clampScore(move.score_before ?? move.score_after)),
              "--after": String(clampScore(move.score_after)),
            } as CSSProperties
          }
        >
          {move.score_before == null ? null : <span className="score-change-ghost" />}
        </span>
      ) : null}
      {rank == null && support == null ? null : (
        <span className="score-change-context">
          {rank == null ? null : <span>{rank}</span>}
          {support == null ? null : <span>{support}</span>}
        </span>
      )}
    </li>
  );
}

function ChangedInputs({ change }: { change: ModelAtlasScoreChange }) {
  const methodology = change.methodology_changed ? (
    <p className="score-change-note">The scoring method also changed in this update.</p>
  ) : null;
  // An entry has no earlier inputs to compare; the summary above already says it was added.
  if (change.entry != null) {
    return methodology;
  }
  if (change.inputs == null) {
    return (
      <p className="score-change-note">
        This update predates input tracking, so the inputs behind it are not listed.
      </p>
    );
  }
  const inputs = change.inputs;
  if (inputs.length === 0) {
    return (
      <>
        <p className="score-change-note">
          None of this model&apos;s own results, prices, or speeds changed. Each benchmark places
          models between its weakest and strongest result, so other models&apos; new results moved
          these scores.
        </p>
        {methodology}
      </>
    );
  }
  return (
    <div className="score-change-inputs">
      {methodology}
      {INPUT_GROUPS.map(({ title, kinds }) => {
        const rows = inputs.filter((input) => (kinds as readonly InputKind[]).includes(input.kind));
        return rows.length === 0 ? null : (
          <section className="score-change-group" key={title}>
            <h4 className="score-change-group-title">{title}</h4>
            <ul>
              {rows.map((input) => (
                <ChangedInput input={input} key={`${input.kind}:${input.key}`} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ChangedInput({ input }: { input: ModelAtlasInputChange }) {
  const metric = TASK_METRIC_NAMES[input.kind];
  return (
    <li className="score-change-input">
      <span className="score-change-input-label">
        {input.label}
        {metric == null ? null : <span className="score-change-input-metric"> {metric}</span>}
      </span>
      <span className="score-change-input-values">
        {input.before == null ? (
          <>
            <span className="score-change-status">new</span> {formatInput(input, input.after)}
          </>
        ) : input.after == null ? (
          <>
            <s className="score-change-before">{formatInput(input, input.before)}</s>{" "}
            <span className="score-change-status">removed</span>
          </>
        ) : (
          <>
            <span className="score-change-before">{formatInput(input, input.before)} → </span>
            {formatInput(input, input.after)}
          </>
        )}
      </span>
    </li>
  );
}

function formatInput(input: ModelAtlasInputChange, value: number | null): string {
  switch (input.kind) {
    case "result": {
      const column = benchmarkMetricColumns.find(({ benchmark }) => benchmark === input.key);
      return column == null ? formatSignificant(value) : formatDashboardMetric(value, column);
    }
    case "task_cost":
      return formatCost(value);
    case "task_time":
      return formatTaskTime(value);
    case "task_tokens":
      return formatCompactNumber(value);
    case "provider_price":
      return `${formatCost(value)}/M`;
    case "provider_speed":
      return value == null ? "-" : `${value.toFixed(1)} tok/s`;
    case "provider_latency":
      return formatLatency(value);
    default:
      input.kind satisfies never;
      return "-";
  }
}

// Inputs are reported when they differ at three significant digits, so latencies keep two decimals.
function formatLatency(value: number | null): string {
  return value == null ? "-" : `${value.toFixed(value < 10 ? 2 : 1)}s`;
}

// Long task times show three significant digits in minutes or hours, the precision the log compares them at.
function formatTaskTime(value: number | null): string {
  if (value == null || value < 600) return formatLatency(value);
  return value < 3600 ? `${(value / 60).toPrecision(3)}m` : `${(value / 3600).toPrecision(3)}h`;
}

function formatSignificant(value: number | null): string {
  return value == null ? "-" : String(Number(value.toPrecision(3)));
}

function signedDelta(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(1)}`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
