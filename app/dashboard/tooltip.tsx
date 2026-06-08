import type { FocusEvent, MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type {
	ModelStatsColumnTooltip,
	ModelStatsColumnTooltipNestedSection,
	ModelStatsColumnTooltipRow,
	ModelStatsColumnTooltipSectionItem,
	ModelStatsColumnTooltipSectionKind,
} from "../../src/model-atlas/llm/llm-stats/types";
import {
	tooltipHorizontalPadding,
	tooltipMaxWidth,
	tooltipOffsetTop,
	tooltipWorkflowMaxWidth,
} from "./constants";
import type { SortKey } from "./models";

const workflowSimulationRowPattern =
	/^(.*?)\s+(\d+\s+calls?), input ([^,]+), output (.+)$/;
const priceProfileRowPattern = /^(.*?) input\/output split (.+)$/;
const priceShareRowPattern = /^(.*?) (.+?) x (.+)$/;

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
	const hasWorkflowSimulationSection =
		content.sections?.some(sectionHasWorkflowSimulation) ?? false;
	const availableWidth =
		typeof window === "undefined"
			? tooltipMaxWidth
			: window.innerWidth - tooltipHorizontalPadding * 2;
	const baseWidth = Math.min(tooltipMaxWidth, availableWidth);
	const tooltipWidth = Math.min(
		hasWorkflowSimulationSection ? tooltipWorkflowMaxWidth : tooltipMaxWidth,
		availableWidth,
	);
	const centeredLeft =
		hasWorkflowSimulationSection && tooltipWidth > baseWidth
			? left - (tooltipWidth - baseWidth) / 2
			: left;

	useLayoutEffect(() => {
		const rect = tooltipRef.current?.getBoundingClientRect();
		if (rect == null) {
			setPosition({ left: centeredLeft, top });
			return;
		}
		const nextPosition = clampTooltipPosition(centeredLeft, top, rect);
		setPosition((current) =>
			current.left === nextPosition.left && current.top === nextPosition.top
				? current
				: nextPosition,
		);
	}, [centeredLeft, top]);

	return (
		<div
			className={`column-tooltip visible${hasWorkflowSimulationSection ? " workflow-tooltip" : ""}`}
			ref={tooltipRef}
			style={{ ...position, width: tooltipWidth }}
		>
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
							<TooltipSectionTitle
								title={section.title}
								weight={section.weight}
							/>
							<TooltipSectionBody kind={section.kind} rows={section.rows} />
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

function TooltipSectionRows({
	items,
}: {
	items: readonly ModelStatsColumnTooltipSectionItem[];
}) {
	return items.map((item) =>
		isTooltipRow(item) ? (
			<TooltipRow
				key={`${item[0]}:${item[1]}`}
				label={item[0]}
				value={item[1]}
			/>
		) : (
			<TooltipNestedSection key={item.title} section={item} />
		),
	);
}

function TooltipNestedSection({
	section,
}: {
	section: ModelStatsColumnTooltipNestedSection;
}) {
	const className = `column-tooltip-nested-section${section.kind == null ? " weighted-breakdown" : ""}`;
	return (
		<div className={className}>
			<TooltipSectionTitle title={section.title} weight={section.weight} />
			<TooltipSectionBody kind={section.kind} rows={section.rows} />
		</div>
	);
}

function TooltipSectionBody({
	kind,
	rows,
}: {
	kind?: ModelStatsColumnTooltipSectionKind;
	rows: readonly ModelStatsColumnTooltipSectionItem[];
}) {
	switch (kind) {
		case "workflow_simulation":
			return <WorkflowSimulationRows rows={tooltipRows(rows)} />;
		case "price_profile":
			return <PriceProfileRows rows={tooltipRows(rows)} />;
		case "price_share":
			return <PriceShareRows rows={tooltipRows(rows)} />;
		default:
			return <TooltipSectionRows items={rows} />;
	}
}

function PriceProfileRows({
	rows,
}: {
	rows: readonly ModelStatsColumnTooltipRow[];
}) {
	return (
		<div className="column-tooltip-price-profile-table">
			<span className="column-tooltip-nested-head">Profile</span>
			<span className="column-tooltip-nested-head">Split</span>
			<span className="column-tooltip-nested-head">Weight</span>
			{rows.map(([label, value]) => {
				const cells = priceProfileCells(label);
				return cells == null ? (
					<TooltipRow key={`${label}:${value}`} label={label} value={value} />
				) : (
					<PriceProfileRow
						key={`${label}:${value}`}
						cells={cells}
						weight={value}
					/>
				);
			})}
		</div>
	);
}

function PriceShareRows({
	rows,
}: {
	rows: readonly ModelStatsColumnTooltipRow[];
}) {
	return (
		<div className="column-tooltip-price-share-table">
			<span className="column-tooltip-nested-head">Profile</span>
			<span className="column-tooltip-nested-head">Weight x split</span>
			<span className="column-tooltip-nested-head">Share</span>
			{rows.map(([label, value]) => {
				const cells = priceShareCells(label);
				return cells == null ? (
					<TooltipRow key={`${label}:${value}`} label={label} value={value} />
				) : (
					<PriceShareRow
						key={`${label}:${value}`}
						cells={cells}
						share={value}
					/>
				);
			})}
		</div>
	);
}

function WorkflowSimulationRows({
	rows,
}: {
	rows: readonly ModelStatsColumnTooltipRow[];
}) {
	return (
		<div className="column-tooltip-workflow-table">
			<span className="column-tooltip-workflow-head">Scenario</span>
			<span className="column-tooltip-workflow-head">Calls</span>
			<span className="column-tooltip-workflow-head">Input</span>
			<span className="column-tooltip-workflow-head">Output</span>
			<span className="column-tooltip-workflow-head">Weight</span>
			{rows.map(([label, value]) => {
				const cells = workflowSimulationCells(label);
				return cells == null ? (
					<TooltipRow key={`${label}:${value}`} label={label} value={value} />
				) : (
					<WorkflowSimulationRow
						key={`${label}:${value}`}
						cells={cells}
						weight={value}
					/>
				);
			})}
		</div>
	);
}

function TooltipSectionTitle({
	title,
	weight,
}: {
	title: string;
	weight?: string;
}) {
	return (
		<div className="column-tooltip-section-title">
			<span className="column-tooltip-section-label">{title}</span>
			{weight != null && (
				<span className="column-tooltip-section-weight">{weight}</span>
			)}
		</div>
	);
}

function isTooltipRow(
	item: ModelStatsColumnTooltipSectionItem,
): item is ModelStatsColumnTooltipRow {
	return Array.isArray(item);
}

function tooltipRows(
	items: readonly ModelStatsColumnTooltipSectionItem[],
): ModelStatsColumnTooltipRow[] {
	return items.filter(isTooltipRow);
}

function sectionHasWorkflowSimulation({
	kind,
	rows,
}: {
	kind?: ModelStatsColumnTooltipSectionKind;
	rows: readonly ModelStatsColumnTooltipSectionItem[];
}) {
	return (
		kind === "workflow_simulation" ||
		rows.some(
			(item) => !isTooltipRow(item) && item.kind === "workflow_simulation",
		)
	);
}

function priceProfileCells(label: string) {
	const match = priceProfileRowPattern.exec(label);
	if (match == null) {
		return null;
	}
	const [, profile, split] = match;
	if (profile == null || split == null) {
		return null;
	}
	return { profile, split };
}

function priceShareCells(label: string) {
	const match = priceShareRowPattern.exec(label);
	if (match == null) {
		return null;
	}
	const [, profile, profileWeight, sideSplit] = match;
	if (profile == null || profileWeight == null || sideSplit == null) {
		return null;
	}
	return { profile, formula: `${profileWeight} x ${sideSplit}` };
}

function workflowSimulationCells(label: string) {
	const match = workflowSimulationRowPattern.exec(label);
	if (match == null) {
		return null;
	}
	const [, scenario, calls, input, output] = match;
	if (scenario == null || calls == null || input == null || output == null) {
		return null;
	}
	return {
		scenario,
		calls: calls.replace(/\s+calls?$/, ""),
		input,
		output,
	};
}

function WorkflowSimulationRow({
	cells,
	weight,
}: {
	cells: NonNullable<ReturnType<typeof workflowSimulationCells>>;
	weight: string;
}) {
	return (
		<>
			<span className="column-tooltip-workflow-scenario">{cells.scenario}</span>
			<span>{cells.calls}</span>
			<span>{cells.input}</span>
			<span>{cells.output}</span>
			<span className="column-tooltip-workflow-weight">{weight}</span>
		</>
	);
}

function PriceProfileRow({
	cells,
	weight,
}: {
	cells: NonNullable<ReturnType<typeof priceProfileCells>>;
	weight: string;
}) {
	return (
		<>
			<span>{cells.profile}</span>
			<span>{cells.split}</span>
			<span className="column-tooltip-nested-weight">{weight}</span>
		</>
	);
}

function PriceShareRow({
	cells,
	share,
}: {
	cells: NonNullable<ReturnType<typeof priceShareCells>>;
	share: string;
}) {
	return (
		<>
			<span>{cells.profile}</span>
			<span>{cells.formula}</span>
			<span className="column-tooltip-nested-weight">{share}</span>
		</>
	);
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
