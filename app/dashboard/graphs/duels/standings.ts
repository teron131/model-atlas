/** Duels' scoring: each pair of models sharing enough Intelligence benchmarks duels on them, a duel going to the model that leads on more, and the standings rank the models by their duels. */

import type { ChartBenchmark, ChartRow } from "../chart-data";

// Two models sharing fewer benchmarks than this have too little in common to call a winner.
export const MIN_SHARED = 5;

/** A benchmark both models report: the row's model's result, its opponent's, and the gap between them. */
export type Lead = { benchmark: ChartBenchmark; own: number; theirs: number; points: number };
export type Duel = {
  row: ChartRow;
  opponent: ChartRow;
  /** The row's model's lead on each benchmark both report, the gap between their results as the leaderboard prints them, largest first; negative where the opponent leads and zero where they read the same. */
  leads: Lead[];
  /** The leads the row's model wins, largest first; a tied result decides nothing, so it is in neither side. */
  ahead: Lead[];
  /** The leads its opponent wins, the opponent's largest first. */
  behind: Lead[];
};
type Outcome = "won" | "lost" | "drawn";
export type Standing = {
  row: ChartRow;
  /** The model's place by Intelligence, from 0. */
  place: number;
  /** Duels with each opponent sharing enough benchmarks, by the opponent's key. */
  duels: Map<string, Duel>;
  wins: number;
  losses: number;
  draws: number;
};

/** `models`, strongest by Intelligence first, each with its duels against the others on the Intelligence `benchmarks`, most wins first, a drawn duel counting half, and Intelligence settling ties. */
export function duelStandings(
  models: readonly ChartRow[],
  benchmarks: readonly ChartBenchmark[],
): Standing[] {
  const intelligence = benchmarks.filter((benchmark) => benchmark.intelligence);
  const duel = (row: ChartRow, opponent: ChartRow): Duel | null => {
    const leads = intelligence
      .flatMap((benchmark) => {
        const own = row.benchmarks[benchmark.key];
        const theirs = opponent.benchmarks[benchmark.key];
        return own == null || theirs == null
          ? []
          : [{ benchmark, own, theirs, points: own - theirs }];
      })
      .sort((a, b) => b.points - a.points);
    if (leads.length < MIN_SHARED) return null;
    return {
      row,
      opponent,
      leads,
      ahead: leads.filter(({ points }) => points > 0),
      behind: leads.filter(({ points }) => points < 0).reverse(),
    };
  };
  return models
    .map((row, place): Standing => {
      const duels = new Map(
        models.flatMap((opponent) => {
          const result = opponent === row ? null : duel(row, opponent);
          return result == null ? [] : [[opponent.key, result] as const];
        }),
      );
      const outcomes = [...duels.values()].map(outcome);
      return {
        row,
        place,
        duels,
        wins: outcomes.filter((each) => each === "won").length,
        losses: outcomes.filter((each) => each === "lost").length,
        draws: outcomes.filter((each) => each === "drawn").length,
      };
    })
    .sort((a, b) => b.wins + b.draws / 2 - (a.wins + a.draws / 2) || a.place - b.place);
}

export function outcome({ ahead, behind }: Duel): Outcome {
  return ahead.length > behind.length ? "won" : ahead.length < behind.length ? "lost" : "drawn";
}

/** How decisive a duel was, from −1 to 1: benchmarks won less those lost, over all decided. */
export function margin({ ahead, behind }: Duel): number {
  return (ahead.length - behind.length) / (ahead.length + behind.length);
}

export function firstDuel(standing: Standing, standings: readonly Standing[]): Duel | undefined {
  return [...standings]
    .sort((a, b) => a.place - b.place)
    .map((opponent) => standing.duels.get(opponent.row.key))
    .find((duel) => duel != null);
}

export function duelKey(duel: Duel): string {
  return `${duel.row.key}|${duel.opponent.key}`;
}
