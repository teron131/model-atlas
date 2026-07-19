/** Dashboard table and control formatting helpers. */

import type { DashboardMetricColumn, TaskMetricColumn } from "../table/models";

export const formatScore = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-";

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

export const formatSeconds = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value)
		? `${value.toFixed(value < 10 ? 1 : 0)}s`
		: "-";

export const formatDuration = (value: number | null | undefined) => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "-";
	}
	const totalMinutes = Math.round(value / 60);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export function formatTaskMetric(
	value: number | null | undefined,
	column: TaskMetricColumn,
) {
	if (column.metric === "cost") {
		return formatCost(value);
	}
	if (column.metric === "seconds") {
		if (column.source === "agents_last_exam") {
			return formatDuration(value);
		}
		return formatSeconds(value);
	}
	return formatCompactNumber(value);
}

export function benchmarkPercentValue(value: number | null | undefined) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return Math.abs(value) <= 1 ? value * 100 : value;
}

export function formatBenchmarkMetric(
	value: number | null | undefined,
	format: "percent" | "number" | "currency" = "percent",
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
		return typeof value === "string" && value.length > 0
			? value.slice(0, 10)
			: "-";
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

export const formatWeight = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value)
		? `${(value * 100).toFixed(0)}%`
		: "-";

export const safeSlug = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const cacheBustedPath = (path: string) => {
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}reload=${Date.now()}`;
};
