/** Leaderboard column definitions shared by the body and sticky header. */

import type { ReactNode } from "react";

import { BotIcon, BrainIcon, DollarIcon, LightningIcon } from "../shared/DashboardIcons";
import { type SortKey, speedMetricColumns } from "./models";

type SortableColumnDefinition = {
  key: SortKey;
  label: ReactNode;
  searchText: string;
  className?: string;
};

export const scoreMetricColumns: SortableColumnDefinition[] = [
  {
    key: "intelligence",
    label: metricLabel(<BrainIcon />, "Intel"),
    searchText: "Intel Intelligence",
  },
  {
    key: "agentic",
    label: metricLabel(<BotIcon />, "Agent"),
    searchText: "Agent Agentic",
  },
  {
    key: "speed",
    label: metricLabel(<LightningIcon />, "Speed"),
    searchText: "Speed",
  },
  {
    key: "value",
    label: metricLabel(<DollarIcon />, "Value"),
    searchText: "Value",
  },
];

export const scoreSortableColumns: SortableColumnDefinition[] = [
  { key: "rank", label: "#", searchText: "Rank", className: "rank" },
  { key: "model", label: "Model", searchText: "Model", className: "model-column" },
  ...scoreMetricColumns,
];

export const staticSortableColumns: SortableColumnDefinition[] = [
  ...scoreSortableColumns,
  { key: "blend", label: "Blend", searchText: "Blend" },
  ...speedMetricColumns.map(({ key, label }) => ({ key, label, searchText: label })),
  { key: "context", label: "Context", searchText: "Context" },
];

function metricLabel(icon: ReactNode, text: string) {
  return (
    <span className="metric-head">
      {icon}
      {text}
    </span>
  );
}
