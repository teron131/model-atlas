/** Resource ratios share one multiplier notation across leaderboard cells, axes, and hover details. */

/** Preserve small positive ratios while showing missing evidence distinctly from zero consumption. */
export function formatResourceRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value < 0.01 && value > 0 ? value.toPrecision(2) : value.toFixed(2)}×`;
}
