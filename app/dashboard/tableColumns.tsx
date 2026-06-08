import type { ReactNode } from "react";

import { BotIcon, BrainIcon, DollarIcon, RocketIcon } from "./icons";
import {
	benchmarkMetricColumns,
	type SortKey,
	taskMetricColumns,
} from "./models";

export type SortableColumnDefinition = {
	key: SortKey;
	label: ReactNode;
	className?: string;
};

export const staticSortableColumns: SortableColumnDefinition[] = [
	{ key: "rank", label: "#", className: "rank" },
	{ key: "model", label: "Model", className: "model-column" },
	{ key: "overall", label: "Ovrll" },
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
		label: metricLabel(<RocketIcon />, "Speed"),
	},
	{
		key: "value",
		label: metricLabel(<DollarIcon />, "Value"),
	},
	{ key: "blend", label: "Blend" },
	{ key: "context", label: "Context" },
];

export const dashboardColumnKeys = [
	...staticSortableColumns.map((column) => column.key),
	...taskMetricColumns.map((column) => column.key),
	...benchmarkMetricColumns.map((column) => column.key),
];

function metricLabel(icon: ReactNode, text: string) {
	return (
		<span className="metric-head">
			{icon}
			{text}
		</span>
	);
}
