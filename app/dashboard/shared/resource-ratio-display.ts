/** Resource ratios share one multiplier notation across leaderboard cells, axes, and hover details. */

/** Two significant figures match the precision of benchmark-median ratios while keeping small positive ratios legible; missing evidence stays distinct from zero consumption. */
export function formatResourceRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value === 0) return "0×";
  return `${value >= 10 ? value.toFixed(0) : value.toPrecision(2)}×`;
}
