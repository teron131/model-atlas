import type { CSSProperties, FocusEvent, MouseEvent } from "react";
import { useCallback, useState } from "react";

import type { ModelStatsSelectedPayload } from "../../src/model-atlas/llm/llm-stats/types";
import {
	benchmarkGroups,
	benchmarkLabels,
	benchmarkTooltips,
} from "./constants";
import { formatWeight } from "./format";
import {
	ColumnTooltip,
	type TooltipState,
	tooltipPositionFromElement,
} from "./tooltip";

const loadingWeightRows = [
	"intelligence",
	"agentic",
	"speed",
	"value",
] as const;
const loadingBenchmarkCounts: Record<string, number> = {
	Intelligence: 6,
	Agent: 5,
};

export function BenchmarkStrip({
	payload,
	isLoading,
}: {
	payload: ModelStatsSelectedPayload | null;
	isLoading: boolean;
}) {
	const scoring = payload?.metadata?.scoring;
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	const activeTooltipContent =
		tooltip == null ? undefined : benchmarkTooltips[tooltip.key];
	const clearTooltip = useCallback(() => {
		setTooltip(null);
	}, []);
	const showTooltip = useCallback(
		(event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string) => {
			if (!benchmarkTooltips[key]) {
				return;
			}
			setTooltip({
				key,
				phase: "visible",
				...tooltipPositionFromElement(event.currentTarget),
			});
		},
		[],
	);

	return (
		<section className="benchmarks" aria-label="Selected benchmarks">
			<h2>Selected benchmarks</h2>
			<div className="benchmark-groups">
				{benchmarkGroups.map(({ field, fallbackField, label }) => {
					const keys = scoring?.[field] ?? scoring?.[fallbackField] ?? [];
					return (
						<BenchmarkGroup
							key={field}
							label={label}
							keys={keys}
							isLoading={isLoading}
							onTooltip={showTooltip}
							onTooltipEnd={clearTooltip}
						/>
					);
				})}
				<WeightsGroup
					weights={scoring?.overall_relative_score_weights ?? {}}
					isLoading={isLoading}
				/>
			</div>
			{tooltip != null && activeTooltipContent != null && (
				<ColumnTooltip
					content={activeTooltipContent}
					left={tooltip.left}
					top={tooltip.top}
				/>
			)}
		</section>
	);
}

function BenchmarkGroup({
	label,
	keys,
	isLoading,
	onTooltip,
	onTooltipEnd,
}: {
	label: string;
	keys: string[];
	isLoading: boolean;
	onTooltip: (
		event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
		key: string,
	) => void;
	onTooltipEnd: () => void;
}) {
	return (
		<div className="benchmark-group">
			<div
				className="benchmark-group-label"
				data-count={isLoading ? "sync" : keys.length}
			>
				{label}
			</div>
			{isLoading ? (
				<LoadingBenchmarkList label={label} />
			) : (
				<BenchmarkList
					keys={keys}
					onTooltip={onTooltip}
					onTooltipEnd={onTooltipEnd}
				/>
			)}
		</div>
	);
}

function BenchmarkList({
	keys,
	onTooltip,
	onTooltipEnd,
}: {
	keys: string[];
	onTooltip: (
		event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
		key: string,
	) => void;
	onTooltipEnd: () => void;
}) {
	return (
		<ul className="benchmark-list">
			{keys.map((key) => (
				<li key={key}>
					<button
						className="benchmark-chip"
						type="button"
						onMouseEnter={(event) => onTooltip(event, key)}
						onFocus={(event) => onTooltip(event, key)}
						onMouseLeave={onTooltipEnd}
						onBlur={onTooltipEnd}
					>
						{benchmarkLabels[key] ?? key}
					</button>
				</li>
			))}
		</ul>
	);
}

function LoadingBenchmarkList({ label }: { label: string }) {
	return (
		<ul className="benchmark-list benchmark-list-loading">
			{loadingBenchmarkKeys(label).map((key, index) => (
				<li key={key}>
					<span
						className="benchmark-chip benchmark-chip-loading"
						style={loadingStyle("--loading-chip-index", index)}
					/>
				</li>
			))}
		</ul>
	);
}

function WeightsGroup({
	weights,
	isLoading,
}: {
	weights: Record<string, number | undefined>;
	isLoading: boolean;
}) {
	return (
		<div className="benchmark-group">
			<div
				className="benchmark-group-label"
				data-count={isLoading ? "sync" : "overall"}
			>
				Weights
			</div>
			{isLoading ? <LoadingWeightList /> : <WeightList weights={weights} />}
		</div>
	);
}

function WeightList({
	weights,
}: {
	weights: Record<string, number | undefined>;
}) {
	return (
		<ul className="benchmark-list weight-list">
			{Object.entries(weights).map(([name, value]) => (
				<li key={name}>
					<samp>
						{name} <b>{formatWeight(value)}</b>
					</samp>
				</li>
			))}
		</ul>
	);
}

function LoadingWeightList() {
	return (
		<ul className="benchmark-list weight-list weight-list-loading">
			{loadingWeightRows.map((name, index) => (
				<li key={name}>
					<samp
						className="loading-weight-row"
						style={loadingStyle("--loading-row-index", index)}
					>
						<span>{name}</span>
						<b />
					</samp>
				</li>
			))}
		</ul>
	);
}

function loadingBenchmarkKeys(label: string): string[] {
	const prefix = label.toLowerCase();
	const count = loadingBenchmarkCounts[label] ?? 5;
	return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function loadingStyle(
	name: "--loading-chip-index" | "--loading-row-index",
	value: number,
): CSSProperties {
	return { [name]: value } as CSSProperties;
}
