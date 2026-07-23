/** Selected-benchmark summary strip backed by scoring metadata. */

import { Star } from "lucide-react";
import {
	type CSSProperties,
	type FocusEvent,
	Fragment,
	type MouseEvent,
	useCallback,
	useState,
} from "react";

import { benchmarkMetricValue } from "../../../src/model-atlas/pipeline/scores/resource-metrics";
import type { ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import {
	ColumnTooltip,
	type TooltipState,
	tooltipPositionFromElement,
} from "../shared/ColumnTooltip";
import {
	benchmarkGroups,
	benchmarkLabels,
	benchmarkTooltips,
	compareBenchmarkDisplayKeys,
} from "../shared/constants";

const loadingCounts: Record<string, number> = {
	Intelligence: 6,
	Agent: 5,
};

export function BenchmarkStrip({
	payload,
	models,
	isLoading,
}: {
	payload: ModelAtlasPayload | null;
	models: ModelAtlasPayload["models"];
	isLoading: boolean;
}) {
	const scoring = payload?.metadata?.scoring;
	const benchmarkPortfolio = scoring?.benchmark_portfolio ?? {};
	const frontierKeys = new Set(
		Object.entries(benchmarkPortfolio)
			.filter(([, entry]) => entry.group === "frontier")
			.map(([key]) => key),
	);
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	const activeTooltipContent =
		tooltip == null
			? undefined
			: tooltipWithCoverage(
					benchmarkTooltips[tooltip.key],
					benchmarkCoverage(models, tooltip.key),
				);
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
					const keys = [
						...(scoring?.[field] ?? scoring?.[fallbackField] ?? []),
					].sort(compareBenchmarkDisplayKeys);
					return (
						<BenchmarkGroup
							key={field}
							label={label}
							keys={keys}
							models={models}
							frontierBenchmarkKeys={frontierKeys}
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
	models,
	frontierBenchmarkKeys,
	isLoading,
	onTooltip,
	onTooltipEnd,
}: {
	label: string;
	keys: string[];
	models: ModelAtlasPayload["models"];
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
					models={models}
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
	models,
	frontierBenchmarkKeys,
	onTooltip,
	onTooltipEnd,
}: {
	keys: string[];
	models: ModelAtlasPayload["models"];
	frontierBenchmarkKeys: ReadonlySet<string>;
	onTooltip: (
		event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
		key: string,
	) => void;
	onTooltipEnd: () => void;
}) {
	return (
		<ul className="benchmark-list">
			{keys.map((key, index) => {
				const label = benchmarkLabels[key] ?? key;
				const isFrontier = frontierBenchmarkKeys.has(key);
				const startsBaselineGroup =
					index > 0 &&
					!isFrontier &&
					frontierBenchmarkKeys.has(keys[index - 1] as string);
				const coverage = benchmarkCoverage(models, key);
				const coverageLabel = benchmarkCoverageLabel(coverage);
				return (
					<Fragment key={key}>
						{startsBaselineGroup && (
							<li className="benchmark-baseline-divider" aria-hidden="true" />
						)}
						<li>
							<button
								className="benchmark-chip"
								type="button"
								aria-label={`${label}, ${coverageAriaLabel(coverage)}${
									isFrontier ? ", frontier benchmark" : ""
								}`}
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
								<span className="benchmark-chip-coverage">{coverageLabel}</span>
							</button>
						</li>
					</Fragment>
				);
			})}
		</ul>
	);
}

type BenchmarkCoverage = {
	observed: number;
	total: number;
};

/** Count only observed benchmark values across the models in the current global view. */
function benchmarkCoverage(
	models: ModelAtlasPayload["models"],
	key: string,
): BenchmarkCoverage {
	return {
		observed: models.filter((model) => benchmarkMetricValue(model, key) != null)
			.length,
		total: models.length,
	};
}

function benchmarkCoverageLabel({
	observed,
	total,
}: BenchmarkCoverage): string {
	return total === 0 ? "-" : `${Math.round((observed / total) * 100)}%`;
}

function coverageAriaLabel(coverage: BenchmarkCoverage): string {
	return coverage.total === 0
		? "no models in current view"
		: `${benchmarkCoverageLabel(coverage)} coverage in current model view`;
}

function tooltipWithCoverage(
	tooltip: (typeof benchmarkTooltips)[string] | undefined,
	coverage: BenchmarkCoverage,
) {
	if (tooltip == null) {
		return undefined;
	}
	const coverageValue =
		coverage.total === 0
			? "No models in current view"
			: `${coverage.observed} of ${coverage.total} models (${benchmarkCoverageLabel(coverage)})`;
	return {
		...tooltip,
		rows: [...(tooltip.rows ?? []), ["Coverage", coverageValue] as const],
	};
}

function LoadingBenchmarkList({ label }: { label: string }) {
	const prefix = label.toLowerCase();
	const count = loadingCounts[label] ?? 5;
	const keys = Array.from(
		{ length: count },
		(_, index) => `${prefix}-${index}`,
	);
	return (
		<ul className="benchmark-list benchmark-list-loading">
			{keys.map((key, index) => (
				<li key={key}>
					<span
						className="benchmark-chip benchmark-chip-loading"
						style={
							{
								"--loading-chip-index": index,
							} as CSSProperties
						}
					/>
				</li>
			))}
		</ul>
	);
}
