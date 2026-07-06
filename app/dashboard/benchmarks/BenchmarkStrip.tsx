/** Selected-benchmark summary strip backed by scoring metadata. */

import { Star } from "lucide-react";
import type { CSSProperties, FocusEvent, MouseEvent } from "react";
import { useCallback, useState } from "react";

import type { LlmStatsPayload } from "../../../src/model-atlas/stats/types";
import {
	ColumnTooltip,
	type TooltipState,
	tooltipPositionFromElement,
} from "../shared/ColumnTooltip";
import {
	benchmarkGroups,
	benchmarkLabels,
	benchmarkTooltips,
} from "../shared/constants";

const loadingBenchmarkCounts: Record<string, number> = {
	Intelligence: 6,
	Agent: 5,
};

export function BenchmarkStrip({
	payload,
	isLoading,
}: {
	payload: LlmStatsPayload | null;
	isLoading: boolean;
}) {
	const scoring = payload?.metadata?.scoring;
	const frontierBenchmarkKeys = new Set(
		Object.entries(scoring?.benchmark_portfolio ?? {})
			.filter(([, entry]) => entry.group === "frontier")
			.map(([key]) => key),
	);
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
							frontierBenchmarkKeys={frontierBenchmarkKeys}
							isLoading={isLoading}
							onTooltip={showTooltip}
							onTooltipEnd={clearTooltip}
						/>
					);
				})}
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
	frontierBenchmarkKeys,
	isLoading,
	onTooltip,
	onTooltipEnd,
}: {
	label: string;
	keys: string[];
	frontierBenchmarkKeys: ReadonlySet<string>;
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
				<span>{label}</span>
			</div>
			{isLoading ? (
				<LoadingBenchmarkList label={label} />
			) : (
				<BenchmarkList
					keys={keys}
					frontierBenchmarkKeys={frontierBenchmarkKeys}
					onTooltip={onTooltip}
					onTooltipEnd={onTooltipEnd}
				/>
			)}
		</div>
	);
}

function BenchmarkList({
	keys,
	frontierBenchmarkKeys,
	onTooltip,
	onTooltipEnd,
}: {
	keys: string[];
	frontierBenchmarkKeys: ReadonlySet<string>;
	onTooltip: (
		event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
		key: string,
	) => void;
	onTooltipEnd: () => void;
}) {
	return (
		<ul className="benchmark-list">
			{keys.map((key) => {
				const label = benchmarkLabels[key] ?? key;
				const isFrontier = frontierBenchmarkKeys.has(key);
				return (
					<li key={key}>
						<button
							className="benchmark-chip"
							type="button"
							aria-label={isFrontier ? `${label} frontier benchmark` : label}
							onMouseEnter={(event) => onTooltip(event, key)}
							onFocus={(event) => onTooltip(event, key)}
							onMouseLeave={onTooltipEnd}
							onBlur={onTooltipEnd}
						>
							{isFrontier && (
								<Star
									className="benchmark-frontier-star"
									aria-hidden="true"
									size={10}
								/>
							)}
							<span className="benchmark-chip-label">{label}</span>
						</button>
					</li>
				);
			})}
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

function loadingBenchmarkKeys(label: string): string[] {
	const prefix = label.toLowerCase();
	const count = loadingBenchmarkCounts[label] ?? 5;
	return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function loadingStyle(
	name: "--loading-chip-index",
	value: number,
): CSSProperties {
	return { [name]: value } as CSSProperties;
}
