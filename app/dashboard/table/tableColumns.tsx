/** Dashboard table columns shared by the body and sticky header. */

import type { ReactNode } from "react";

import { BotIcon, BrainIcon, DollarIcon, LightningIcon } from "../shared/icons";
import {
	type DashboardMetricColumn,
	dashboardMetricColumns,
	type SortKey,
} from "./models";

export type SortableColumnDefinition = {
	key: SortKey;
	label: ReactNode;
	className?: string;
};

export const staticSortableColumns: SortableColumnDefinition[] = [
	{ key: "rank", label: "#", className: "rank" },
	{ key: "model", label: "Model", className: "model-column" },
	{
		key: "intelligence",
		label: metricLabel(<BrainIcon />, "Intel"),
	},
	{
		key: "agentic",
		label: metricLabel(<BotIcon />, "Agent"),
	},
	{
		key: "speed",
		label: metricLabel(<LightningIcon />, "Speed"),
	},
	{
		key: "costEfficiency",
		label: metricLabel(<DollarIcon />, "Cost"),
	},
	{ key: "overall", label: "Ovrll" },
	{ key: "blend", label: "Blend" },
	{ key: "context", label: "Context" },
];

export type ColumnView = "specs" | "evals" | "all";

export const columnViewOptions: Array<{ key: ColumnView; label: string }> = [
	{ key: "specs", label: "Specs" },
	{ key: "evals", label: "Evals" },
	{ key: "all", label: "All" },
];

const specsMetricKeys = new Set<SortKey>([
	"modalities",
	"inputCost",
	"outputCost",
	"cacheReadCost",
	"throughput",
	"latency",
	"e2eLatency",
]);

export function metricColumnsForView(
	columnView: ColumnView,
): DashboardMetricColumn[] {
	switch (columnView) {
		case "specs":
			return dashboardMetricColumns.filter((column) =>
				specsMetricKeys.has(column.key),
			);
		case "evals":
			return dashboardMetricColumns.filter(
				(column) => column.group === "benchmarks" || column.group === "tasks",
			);
		case "all":
			return dashboardMetricColumns;
	}
	const exhaustiveView: never = columnView;
	return exhaustiveView;
}

export function columnKeysForView(columnView: ColumnView) {
	return [
		...staticSortableColumns.map((column) => column.key),
		...metricColumnsForView(columnView).map((column) => column.key),
	];
}

export function isSortKeyVisible(columnView: ColumnView, sortKey: SortKey) {
	return columnKeysForView(columnView).includes(sortKey);
}

function metricLabel(icon: ReactNode, text: string) {
	return (
		<span className="metric-head">
			{icon}
			{text}
		</span>
	);
}
