/** Leaderboard table formatting keeps metric values and missing-value glyphs consistent. */

import type { DashboardMetricColumn, TaskMetricColumn } from "./models";

// Refresh times are UTC epoch seconds; formatting in UTC keeps server and client renders identical.
const refreshDates = {
  long: new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }),
  short: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
};

export const formatRefreshDate = (epochSeconds: number, length: "long" | "short" = "long") =>
  refreshDates[length].format(epochSeconds * 1000);

export const formatScore = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-";

export const formatConfidence = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
    : "-";

export const formatCost = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(value < 1 ? 3 : 2)}`
    : "-";

export const formatCompactNumber = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${Number((value / 1_000_000_000).toFixed(1))}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${Number((value / 1_000).toFixed(1))}K`;
  }
  return value.toFixed(value < 100 ? 1 : 0);
};

const formatSeconds = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(value < 10 ? 1 : 0)}s`
    : "-";

const formatDuration = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  const totalMinutes = Math.round(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

function formatTaskMetric(value: number | null | undefined, column: TaskMetricColumn) {
  if (column.metric === "cost") {
    return typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 1_000
      ? `$${formatCompactNumber(value)}`
      : formatCost(value);
  }
  if (column.metric === "seconds") {
    if (column.format === "duration") {
      return formatDuration(value);
    }
    return formatSeconds(value);
  }
  return formatCompactNumber(value);
}

function benchmarkPercentValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatBenchmarkMetric(
  value: number | null | undefined,
  format: "percent" | "score" | "number" | "currency" = "percent",
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (format === "number") {
    return value.toFixed(1);
  }
  if (format === "currency") {
    const absolute = Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${value < 0 ? "-" : ""}$${absolute}`;
  }
  const percent = benchmarkPercentValue(value) as number;
  return `${percent.toFixed(1)}%`;
}

/** A benchmark result in its source's units; a score column's cells rescale results to 0–100, so its source numbers, such as ratings, show as plain numbers. */
export function formatBenchmarkSourceValue(
  value: number,
  format: "percent" | "score" | "number" | "currency" = "percent",
): string {
  return format === "score" ? formatSourceNumber(value) : formatBenchmarkMetric(value, format);
}

/** A gap between results of one benchmark, or their standard error, in its source's units. */
export function formatBenchmarkSpread(
  value: number,
  format: "percent" | "score" | "number" | "currency" = "percent",
): string {
  return format === "percent"
    ? `${(value * 100).toFixed(1)} pts`
    : formatBenchmarkSourceValue(value, format);
}

/** Keeps about three significant digits, never dropping whole digits and never more than three decimals. */
function formatSourceNumber(value: number): string {
  const decimals = Math.min(3, Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value)))));
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDashboardMetric(
  value: number | string | null | undefined,
  column: DashboardMetricColumn,
) {
  if ("source" in column) {
    return formatTaskMetric(numberValue(value), column);
  }
  if ("benchmark" in column) {
    return formatBenchmarkMetric(numberValue(value), column.format);
  }
  if (column.group === "costs") {
    return formatCost(numberValue(value));
  }
  if (column.group === "speed") {
    return column.field === "throughput_tokens_per_second_median"
      ? formatCompactNumber(numberValue(value))
      : formatSeconds(numberValue(value));
  }
  if (column.field === "release") {
    return typeof value === "string" && value.length > 0 ? value.slice(0, 10) : "-";
  }
  if (column.field === "modalities") {
    return typeof value === "string" && value.length > 0 ? value : "-";
  }
  if (value === 1) {
    return "Yes";
  }
  if (value === 0) {
    return "No";
  }
  return "-";
}

function numberValue(value: number | string | null | undefined) {
  return typeof value === "number" ? value : null;
}

export const formatContext = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}M`;
  }
  return `${Math.round(value / 1000)}K`;
};
