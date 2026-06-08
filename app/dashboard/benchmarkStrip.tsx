import type { FocusEvent, MouseEvent } from "react";
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

export function BenchmarkStrip({
	payload,
}: {
	payload: ModelStatsSelectedPayload | null;
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
							onTooltip={showTooltip}
							onTooltipEnd={clearTooltip}
						/>
					);
				})}
				<WeightsGroup weights={scoring?.overall_relative_score_weights ?? {}} />
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
	onTooltip,
	onTooltipEnd,
}: {
	label: string;
	keys: string[];
	onTooltip: (
		event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
		key: string,
	) => void;
	onTooltipEnd: () => void;
}) {
	return (
		<div className="benchmark-group">
			<div className="benchmark-group-label" data-count={keys.length}>
				{label}
			</div>
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
		</div>
	);
}

function WeightsGroup({
	weights,
}: {
	weights: Record<string, number | undefined>;
}) {
	return (
		<div className="benchmark-group">
			<div className="benchmark-group-label" data-count="overall">
				Weights
			</div>
			<ul className="benchmark-list weight-list">
				{Object.entries(weights).map(([name, value]) => (
					<li key={name}>
						<samp>
							{name} <b>{formatWeight(value)}</b>
						</samp>
					</li>
				))}
			</ul>
		</div>
	);
}
