import type { BenchmarkMetricColumn, TaskMetricColumn } from "../table/models";

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

export function formatBenchmarkMetric(
	value: number | null | undefined,
	column: BenchmarkMetricColumn,
) {
	if (column.metric === "agents_last_exam" || column.metric === "deep_swe") {
		return typeof value === "number" && Number.isFinite(value)
			? `${(value * 100).toFixed(1)}%`
			: "-";
	}
	return formatScore(value);
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

export const cacheBustedPath = (path: string) => `${path}?reload=${Date.now()}`;
