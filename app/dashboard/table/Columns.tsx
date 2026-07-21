/** Leaderboard column definitions shared by the body and sticky header. */

import type { ReactNode } from "react";

import {
	BotIcon,
	BrainIcon,
	DollarIcon,
	LightningIcon,
} from "../shared/DashboardIcons";
import type { SortKey } from "./models";

type SortableColumnDefinition = {
	key: SortKey;
	label: ReactNode;
	className?: string;
};

export const scoreMetricColumns: SortableColumnDefinition[] = [
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
		key: "value",
		label: metricLabel(<DollarIcon />, "Value"),
	},
];

export const scoreSortableColumns: SortableColumnDefinition[] = [
	{ key: "rank", label: "#", className: "rank" },
	{ key: "model", label: "Model", className: "model-column" },
	...scoreMetricColumns,
];

export const staticSortableColumns: SortableColumnDefinition[] = [
	...scoreSortableColumns,
	{ key: "blend", label: "Blend" },
	{ key: "context", label: "Context" },
];

function metricLabel(icon: ReactNode, text: string) {
	return (
		<span className="metric-head">
			{icon}
			{text}
		</span>
	);
}
