/** Resource ratios share one multiplier notation and one median-relative bar geometry across leaderboard cells, the model sheet, axes, and hover details. */

import type { CSSProperties } from "react";

// Bars reach the track's ends at 16× or 1/16× (four doublings); every column shares this fixed scale, however wide its spread.
const RATIO_TRACK_DOUBLINGS = 4;
// A power below one on the doubling count widens small factors and keeps large ones apart: 0.74× still reads as a saving, 1.05× stays a stub, and 6.2× and 11× draw visibly apart.
const RATIO_CURVE = 0.6;

/** Two significant figures match the precision of benchmark-median ratios while keeping small positive ratios legible; missing evidence stays distinct from zero consumption. */
export function formatResourceRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value === 0) return "0×";
  return `${value >= 10 ? value.toFixed(0) : value.toPrecision(2)}×`;
}

/** Place a positive ratio's bar on the fixed doubling track, growing from the 1× median tick, as the `.ratio-track` CSS variables. */
export function ratioTrackStyle(ratio: number): CSSProperties {
  const doublings = Math.log2(ratio);
  const extent = Math.min(1, (Math.abs(doublings) / RATIO_TRACK_DOUBLINGS) ** RATIO_CURVE);
  const position = 0.5 + (Math.sign(doublings) * extent) / 2;
  // Fixed precision keeps server and browser logarithms serializing the same style.
  return {
    "--ratio-bar-start": `${(Math.min(position, 0.5) * 100).toFixed(2)}%`,
    "--ratio-bar-width": `${(Math.abs(position - 0.5) * 100).toFixed(2)}%`,
  } as CSSProperties;
}
