/** The column header tooltip card: places itself under its trigger inside the viewport, widens for an inequality graph, and hands benchmark headers to their own body. */

import {
  type FocusEvent,
  type MouseEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ModelAtlasColumnTooltipNestedSection,
  ModelAtlasColumnTooltipRow,
  ModelAtlasColumnTooltipSectionItem,
} from "../../../src/model-atlas/config/tooltips";
import { clamp } from "../../../src/model-atlas/math-utils";
import { BenchmarkTooltipBody } from "./BenchmarkTooltip";
import { InequalityGraph, layoutInequalityGraph } from "./InequalityGraph";
import type { DashboardColumnTooltip } from "./tooltips";

const tooltipHorizontalPadding = 18;
const tooltipMaxWidth = 360;
// The card's 13px side padding and 1px border on each side.
const tooltipInset = 28;
const tooltipOffsetTop = 12;

export type TooltipState = {
  left: number;
  top: number;
  phase: "visible" | "leaving";
};

export type HeaderTooltipHandler<TKey extends string = string> = (
  event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
  key: TKey,
) => void;

export function ColumnTooltip({
  content,
  phase,
  left,
  onMouseEnter,
  onMouseLeave,
  top,
}: {
  content: DashboardColumnTooltip;
  phase: TooltipState["phase"];
  left: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  top: number;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left, top });
  const hasRows = (content.rows?.length ?? 0) > 0;
  const hasSections = (content.sections?.length ?? 0) > 0;
  const graphLayout = useMemo(
    () => (content.graph == null ? null : layoutInequalityGraph(content.graph)),
    [content.graph],
  );
  const availableWidth =
    typeof window === "undefined"
      ? tooltipMaxWidth
      : window.innerWidth - tooltipHorizontalPadding * 2;
  const tooltipWidth = Math.min(
    Math.max(tooltipMaxWidth, (graphLayout?.width ?? 0) + tooltipInset),
    availableWidth,
  );

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
      className={`column-tooltip visible${phase === "leaving" ? " leaving" : ""}${graphLayout != null || content.benchmark != null ? " has-graph" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={tooltipRef}
      role="tooltip"
      style={{ ...position, width: tooltipWidth }}
    >
      {content.benchmark != null ? (
        <BenchmarkTooltipBody body={content.body} facts={content.benchmark} title={content.title} />
      ) : (
        <>
          <div className="column-tooltip-title">{content.title}</div>
          <p className="column-tooltip-body">{content.body}</p>
        </>
      )}
      {graphLayout != null ? (
        <>
          <InequalityGraph layout={graphLayout} />
          {hasRows && (
            <p className="column-tooltip-details">
              {content.rows?.map(([label, value]) => (
                <span key={`${label}:${value}`}>
                  <span className="column-tooltip-label">{label}</span> {value}
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <>
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
        </>
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
