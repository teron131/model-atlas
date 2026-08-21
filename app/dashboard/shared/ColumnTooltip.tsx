/** Tooltip layout for dashboard score explanations and formula breakdowns. */

import type { FocusEvent, MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type {
  ModelAtlasColumnTooltip,
  ModelAtlasColumnTooltipNestedSection,
  ModelAtlasColumnTooltipRow,
  ModelAtlasColumnTooltipSectionItem,
} from "../../../src/model-atlas/config/tooltips";
import type { TableColumnKey } from "../table/models";
import { tooltipHorizontalPadding, tooltipMaxWidth, tooltipOffsetTop } from "./constants";

export type TooltipState = {
  key: string;
  left: number;
  top: number;
  phase: "visible" | "leaving";
};

export type HeaderTooltipHandler = (
  event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
  key: TableColumnKey,
) => void;

export function ColumnTooltip({
  content,
  phase = "visible",
  left,
  onMouseEnter,
  onMouseLeave,
  role = "tooltip",
  top,
}: {
  content: ModelAtlasColumnTooltip;
  phase?: TooltipState["phase"];
  left: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  role?: "dialog" | "tooltip";
  top: number;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left, top });
  const hasRows = (content.rows?.length ?? 0) > 0;
  const hasSections = (content.sections?.length ?? 0) > 0;
  const availableWidth =
    typeof window === "undefined"
      ? tooltipMaxWidth
      : window.innerWidth - tooltipHorizontalPadding * 2;
  const tooltipWidth = Math.min(tooltipMaxWidth, availableWidth);

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
    <div
      aria-label={role === "dialog" ? content.title : undefined}
      className={`column-tooltip visible${phase === "leaving" ? " leaving" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={tooltipRef}
      role={role}
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
              {section.hideTitle !== true && (
                <TooltipSectionTitle title={section.title} weight={section.weight} />
              )}
              <TooltipSectionRows items={section.rows} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Anchor a tooltip under the hovered trigger while keeping it inside the viewport. */
export function tooltipPositionFromElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const width = Math.min(tooltipMaxWidth, window.innerWidth - tooltipHorizontalPadding * 2);
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

function TooltipSectionRows({ items }: { items: readonly ModelAtlasColumnTooltipSectionItem[] }) {
  return items.map((item) =>
    isTooltipRow(item) ? (
      <TooltipRow key={`${item[0]}:${item[1]}`} label={item[0]} value={item[1]} />
    ) : (
      <TooltipNestedSection key={item.title} section={item} />
    ),
  );
}

function TooltipNestedSection({ section }: { section: ModelAtlasColumnTooltipNestedSection }) {
  return (
    <div className="column-tooltip-nested-section">
      <TooltipSectionTitle title={section.title} weight={section.weight} />
      <div className="column-tooltip-nested-body">
        <TooltipSectionRows items={section.rows} />
      </div>
    </div>
  );
}

function TooltipSectionTitle({ title, weight }: { title: string; weight?: string }) {
  return (
    <div className="column-tooltip-section-title">
      <span className="column-tooltip-section-label">{title}</span>
      {weight != null && <span className="column-tooltip-section-weight">{weight}</span>}
    </div>
  );
}

function isTooltipRow(
  item: ModelAtlasColumnTooltipSectionItem,
): item is ModelAtlasColumnTooltipRow {
  return Array.isArray(item);
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
