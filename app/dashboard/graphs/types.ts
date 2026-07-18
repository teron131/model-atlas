/** Shared graph view contracts. */

import type { Dispatch, SetStateAction } from "react";
import type { DeepSWELeaderboardRow } from "../../../src/model-atlas/scrapers/deep-swe";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";

export type ProviderOption = {
	slug: string;
	label: string;
	count: number;
	color: string;
	logo: string;
};

export type HoverRow = readonly [string, string];

export type HoverState = {
	left: number;
	top: number;
	model: string;
	provider: string;
	color: string;
	logo: string;
	rows: HoverRow[];
};

export type HoverSetter = Dispatch<SetStateAction<HoverState | null>>;

export type Point = {
	model: LlmStatsModel;
	x: number;
	y: number;
};

export type InteractionContext = {
	frontierScoreByModel: ReadonlyMap<string, number>;
};

export type InteractionConfig = {
	key: string;
	title: string;
	fieldLabel: string;
	lowerIsBetter: boolean;
	logScale: boolean;
	ticks: number[];
	get: (model: LlmStatsModel, context: InteractionContext) => number | null;
	format: (value: number) => string;
	tooltipFormat: (value: number) => string;
	xLabel: string;
	hoverLabel?: string;
	insight?: string;
};

export type Margin = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

export type ModelLimit = 30 | 60 | "all";
export type CostFilter = "all" | number;
export type ProviderFilters = string[];
export type DeepSWEEffortMode = "best" | "all";

export type DeepSWEChartRow = {
	model: LlmStatsModel;
	row: DeepSWELeaderboardRow;
	displayName: string;
	effortLabel: string;
	modelKey: string;
};
