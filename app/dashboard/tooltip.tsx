import type { FocusEvent, MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type { ModelStatsColumnTooltip } from "../../src/model-atlas/llm/llm-stats/types";
import {
	tooltipHorizontalPadding,
	tooltipMaxWidth,
	tooltipOffsetTop,
} from "./constants";
import type { SortKey } from "./models";

export type TooltipState = {
	key: string;
	left: number;
	top: number;
};

export type HeaderTooltipHandler = (
	event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
	key: SortKey,
) => void;

export function ColumnTooltip({
	content,
	left,
	top,
}: {
	content: ModelStatsColumnTooltip;
	left: number;
	top: number;
}) {
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left, top });
	const hasRows = (content.rows?.length ?? 0) > 0;
	const hasSections = (content.sections?.length ?? 0) > 0;

	useLayoutEffect(() => {
		const rect = tooltipRef.current?.getBoundingClientRect();
		if (rect == null) {
			setPosition({ left, top });
			return;
		}
		const nextPosition = clampTooltipPosition(left, top, rect);
		setPosition((current) =>
			current.left === nextPosition.left && current.top === nextPosition.top
				? current
				: nextPosition,
		);
	}, [left, top]);

	return (
		<div className="column-tooltip visible" ref={tooltipRef} style={position}>
			<div className="column-tooltip-title">{content.title}</div>
			<p className="column-tooltip-body">{content.body}</p>
			{(hasRows || hasSections) && <div className="column-tooltip-rule" />}
			{hasRows && (
				<div className="column-tooltip-rows">
					{content.rows?.map(([label, value]) => (
						<TooltipRow key={`${label}:${value}`} label={label} value={value} />
					))}
				</div>
			)}
			{hasSections && (
				<div className="column-tooltip-sections">
					{content.sections?.map((section) => (
						<div className="column-tooltip-section" key={section.title}>
							<div className="column-tooltip-section-title">
								{section.title}
							</div>
							{section.rows.map(([label, value]) => (
								<TooltipRow
									key={`${section.title}:${label}:${value}`}
									label={label}
									value={value}
								/>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function tooltipPositionFromElement(element: HTMLElement) {
	const headerCell = element.closest("th") ?? element;
	const rect = headerCell.getBoundingClientRect();
	const width = Math.min(
		tooltipMaxWidth,
		window.innerWidth - tooltipHorizontalPadding * 2,
	);
	const left = Math.max(
		tooltipHorizontalPadding,
		Math.min(
			rect.left + rect.width / 2 - width / 2,
			window.innerWidth - width - tooltipHorizontalPadding,
		),
	);
	return {
		left,
		top: rect.bottom + tooltipOffsetTop,
	};
}

function TooltipRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="column-tooltip-row">
			<span className="column-tooltip-label">{label}</span>
			<span className="column-tooltip-value">{value}</span>
		</div>
	);
}

function clampTooltipPosition(left: number, top: number, rect: DOMRect) {
	return {
		left: clamp(
			left,
			tooltipHorizontalPadding,
			window.innerWidth - rect.width - tooltipHorizontalPadding,
		),
		top: clamp(
			top,
			tooltipHorizontalPadding,
			window.innerHeight - rect.height - tooltipHorizontalPadding,
		),
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), Math.max(min, max));
}
