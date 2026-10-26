/** Leaderboard column definitions shared by the body, the sticky header, and the model sheet, which reads its rows against the same columns. */

import type { ReactNode } from "react";

import type {
  ModelAtlasModel,
  ModelAtlasScoreDimension,
} from "../../../src/model-atlas/stats/types";
import { SCORE_ICONS } from "../shared/DashboardIcons";
import { type SortKey, speedMetricColumns } from "./models";

type SortableColumnDefinition = {
  key: SortKey;
  label: ReactNode;
  searchText: string;
  className?: string;
};

/** A score column also carries its mark, its full name, and its score and evidence-support readers, which the phone score strip, the evidence column, and the model sheet share. */
type ScoreColumnDefinition = SortableColumnDefinition & {
  key: ModelAtlasScoreDimension;
  name: string;
  icon: ReactNode;
  score: (model: ModelAtlasModel) => number | null;
  support: (model: ModelAtlasModel) => number | null;
};

export const scoreColumnsByDimension = {
  intelligence: scoreColumn("intelligence", "Intelligence", "Intel"),
  agentic: scoreColumn("agentic", "Agentic", "Agent"),
  speed: scoreColumn("speed", "Speed", "Speed"),
  value: scoreColumn("value", "Value", "Value"),
} satisfies Record<ModelAtlasScoreDimension, ScoreColumnDefinition>;

/** The four scores in column order. */
export const scoreMetricColumns: ScoreColumnDefinition[] = Object.values(scoreColumnsByDimension);

export const scoreSortableColumns: SortableColumnDefinition[] = [
  { key: "rank", label: "#", searchText: "Rank", className: "rank" },
  { key: "model", label: "Model", searchText: "Model", className: "model-column" },
  ...scoreMetricColumns,
];

/**
 * Descriptive resource use follows the scores without replacing quality-adjusted Speed and Value.
 * `better` is the direction in which a ratio wins, drawn as the header's down arrow and used by the model sheet to mark the better of two values; fewer tokens are not plainly better, so tokens win neither way.
 */
export const resourceRatioColumns = [
  {
    key: "taskCostRatio",
    kind: "cost",
    name: "Cost×",
    better: "ascending",
    searchText: "Relative task cost",
  },
  {
    key: "taskTimeRatio",
    kind: "time",
    name: "Time×",
    better: "ascending",
    searchText: "Relative task time runtime",
  },
  {
    key: "totalTokenRatio",
    kind: "tokens",
    name: "Tokens×",
    better: null,
    searchText: "Relative total input output tokens",
  },
] as const;

export const staticSortableColumns: SortableColumnDefinition[] = [
  ...scoreSortableColumns,
  ...resourceRatioColumns.map(({ key, name, better, searchText }) => ({
    key,
    label: better == null ? name : `${name} ↓`,
    searchText,
  })),
  { key: "blend", label: "Blend", searchText: "Blend" },
  ...speedMetricColumns.map(({ key, label }) => ({ key, label, searchText: label })),
  { key: "context", label: "Context", searchText: "Context" },
];

function scoreColumn(
  key: ModelAtlasScoreDimension,
  name: string,
  header: string,
): ScoreColumnDefinition {
  const Icon = SCORE_ICONS[key];
  return {
    key,
    name,
    icon: <Icon />,
    label: metricLabel(<Icon />, header),
    searchText: header === name ? name : `${header} ${name}`,
    score: (model) => model.scores[`${key}_score`],
    support: (model) => model.confidence?.[key] ?? null,
  };
}

function metricLabel(icon: ReactNode, text: string) {
  return (
    <span className="metric-head">
      {icon}
      {text}
    </span>
  );
}
