/** Column header tooltips: when a header's card opens and closes, and the card itself, placed under its header or above it so it never covers the header row, widened for an inequality graph or a weights map, with benchmark headers handed to their own body and a blended price's token mix drawn as a bar. */

import {
  type FocusEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
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
import { ColumnWeightsMap, DomainChip } from "./ColumnWeightsMap";
import { InequalityGraph, layoutInequalityGraph } from "./InequalityGraph";
import type { DashboardColumnTooltip } from "./tooltips";

const viewportMargin = 18;
const tooltipMaxWidth = 360;
// The card's 13px side padding and 1px border on each side.
const tooltipInset = 28;
const headerGap = 12;
// A weights map takes a card this wide where the screen leaves room for it.
const weightsWidth = 520;
// The pointer rests this long on a header before its card opens, so crossing headers on the way to a click opens none.
const openDelayMs = 800;
// A card stays live this long after its header loses the pointer, enough for the pointer to cross the gap into it.
const leaveGraceMs = 100;
// The `.leaving` fade in globals.css.
const fadeOutMs = 400;

/** Where a card of the usual width starts when centred under its header, and that header's top and bottom edges. */
type HeaderAnchor = { left: number; top: number; bottom: number };

/** `maxHeight` is set only when the card is taller than the room on its side. */
type Placement = { left: number; top: number; maxHeight: number | undefined };

type Phase = "visible" | "leaving";

export type HeaderTooltipHandler<TKey extends string = string> = (
  event: MouseEvent<Element> | FocusEvent<Element>,
  key: TKey,
) => void;

/** Times a header's card: it opens once the pointer rests on its header, at once for keyboard focus, a touch screen's tap, or while another card is showing, and on leaving stays live briefly so the pointer can move into it before it fades. */
export function useColumnTooltip<TKey extends string>(hasTooltip: (key: TKey) => boolean) {
  const [tooltip, setTooltip] = useState<{ key: TKey; anchor: HeaderAnchor; phase: Phase } | null>(
    null,
  );
  const showing = useRef(false);
  const timer = useRef<number | null>(null);

  useLayoutEffect(() => {
    showing.current = tooltip != null;
  }, [tooltip]);
  useEffect(() => () => cancel(timer), []);

  const show = useCallback<HeaderTooltipHandler<TKey>>(
    (event, key) => {
      const header = event.currentTarget;
      const isFocus = event.type === "focus";
      // A mouse click focuses its button too, so focus opens a card only when it came from the keyboard.
      if (!hasTooltip(key) || (isFocus && !header.matches(":focus-visible"))) {
        return;
      }
      const open = () => setTooltip({ key, phase: "visible", anchor: headerAnchor(header) });
      if (isFocus || showing.current || !canHover()) {
        cancel(timer);
        open();
      } else {
        schedule(timer, openDelayMs, open);
      }
    },
    [hasTooltip],
  );

  const end = useCallback(() => {
    if (!showing.current) {
      cancel(timer);
      return;
    }
    schedule(timer, leaveGraceMs, () => {
      setTooltip((current) => current && { ...current, phase: "leaving" });
      schedule(timer, fadeOutMs, () => setTooltip(null));
    });
  }, []);

  // A leaving card ignores the pointer, so only a live one can be held.
  const hold = useCallback(() => cancel(timer), []);

  /** Closes the card at once when its header sorts, except on a touch screen, where the tap that sorts is also the only way to open it. */
  const closeOnSort = useCallback(() => {
    if (canHover()) {
      cancel(timer);
      setTooltip(null);
    }
  }, []);

  return { tooltip, show, end, hold, closeOnSort };
}

export function ColumnTooltip({
  content,
  anchor,
  phase,
  onMouseEnter,
  onMouseLeave,
}: {
  content: DashboardColumnTooltip;
  anchor: HeaderAnchor;
  phase: Phase;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<(Placement & { anchor: HeaderAnchor }) | null>(null);
  // Until it is placed for this header, the card renders unconstrained below it so the effect measures its full height.
  const position: Placement =
    placement?.anchor === anchor
      ? placement
      : { left: anchor.left, top: anchor.bottom + headerGap, maxHeight: undefined };
  const hasRows = (content.rows?.length ?? 0) > 0;
  const hasSections = (content.sections?.length ?? 0) > 0;
  const graphLayout = useMemo(
    () => (content.graph == null ? null : layoutInequalityGraph(content.graph)),
    [content.graph],
  );
  const availableWidth =
    typeof window === "undefined" ? tooltipMaxWidth : window.innerWidth - viewportMargin * 2;
  const tooltipWidth = Math.min(
    Math.max(
      tooltipMaxWidth,
      (graphLayout?.width ?? 0) + tooltipInset,
      content.weights == null ? 0 : weightsWidth,
    ),
    availableWidth,
  );

  useLayoutEffect(() => {
    const card = tooltipRef.current;
    if (card != null) {
      setPlacement({ anchor, ...placeCard(anchor, card.offsetWidth, card.offsetHeight) });
    }
  }, [anchor]);

  return (
    <div
      className={`column-tooltip visible${phase === "leaving" ? " leaving" : ""}${graphLayout != null || content.benchmark != null || content.weights != null ? " has-graph" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={tooltipRef}
      role="tooltip"
      style={{
        left: position.left,
        top: position.top,
        maxHeight: position.maxHeight,
        width: tooltipWidth,
      }}
    >
      {content.benchmark != null ? (
        <BenchmarkTooltipBody body={content.body} facts={content.benchmark} title={content.title} />
      ) : (
        <>
          <div className="column-tooltip-title">
            {content.domain != null && <DomainChip domain={content.domain} />}
            {content.title}
          </div>
          <p className="column-tooltip-body">{content.body}</p>
        </>
      )}
      {content.weights != null && (
        <>
          <div className="column-tooltip-rule" />
          <ColumnWeightsMap weights={content.weights} width={tooltipWidth - tooltipInset} />
        </>
      )}
      {content.mix != null && (
        <>
          <div className="column-tooltip-rule" />
          <BlendMixBar mix={content.mix} />
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

const mixFormat = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 2 });

/** Every token of the mix in one bar, nearly all cache reads, with the small remainder drawn out to full width beneath so new input and output read at a legible size. */
function BlendMixBar({ mix }: { mix: NonNullable<DashboardColumnTooltip["mix"]> }) {
  const rest = mix.new_input + mix.output;
  return (
    <div className="blend-mix">
      <div className="blend-mix-legend">
        <span>
          Cache read <span className="blend-mix-value">{mixFormat.format(1 - rest)}</span>
        </span>
        <span className="blend-mix-value">{mixFormat.format(rest)}</span>
      </div>
      <div className="blend-mix-bar" aria-hidden>
        <span className="blend-mix-cache" style={{ flexGrow: 1 - rest }} />
        <span className="blend-mix-input" style={{ flexGrow: mix.new_input }} />
        <span className="blend-mix-output" style={{ flexGrow: mix.output }} />
      </div>
      <svg className="blend-mix-zoom" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
        <polygon points={`${(1 - rest) * 100},0 100,0 100,10 0,10`} />
      </svg>
      {/* Grow factors summing below 1 hand out only that fraction of the free space, so the remainder's shares are scaled to fill the bar. */}
      <div className="blend-mix-bar blend-mix-rest" aria-hidden>
        <span className="blend-mix-input" style={{ flexGrow: mix.new_input / rest }} />
        <span className="blend-mix-output" style={{ flexGrow: mix.output / rest }} />
      </div>
      <div className="blend-mix-legend">
        <span className="blend-mix-key blend-mix-input-key">
          New input <span className="blend-mix-value">{mixFormat.format(mix.new_input)}</span>
        </span>
        <span className="blend-mix-key blend-mix-output-key">
          Output <span className="blend-mix-value">{mixFormat.format(mix.output)}</span>
        </span>
      </div>
    </div>
  );
}

function canHover() {
  return window.matchMedia("(hover: hover)").matches;
}

function schedule(timer: RefObject<number | null>, delayMs: number, run: () => void) {
  cancel(timer);
  timer.current = window.setTimeout(() => {
    timer.current = null;
    run();
  }, delayMs);
}

function cancel(timer: RefObject<number | null>) {
  if (timer.current != null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

function headerAnchor(header: Element): HeaderAnchor {
  const rect = header.getBoundingClientRect();
  const width = Math.min(tooltipMaxWidth, window.innerWidth - viewportMargin * 2);
  return { left: rect.left + rect.width / 2 - width / 2, top: rect.top, bottom: rect.bottom };
}

/** The card goes under its header, or above it when it doesn't fit below and more of it fits above, so it never covers the header row; a card taller than its side's room scrolls. */
function placeCard(anchor: HeaderAnchor, width: number, height: number): Placement {
  const left = clamp(anchor.left, viewportMargin, window.innerWidth - width - viewportMargin);
  const below = anchor.bottom + headerGap;
  const roomBelow = window.innerHeight - viewportMargin - below;
  const roomAbove = anchor.top - headerGap - viewportMargin;
  if (height <= roomBelow || roomBelow >= roomAbove) {
    return { left, top: below, maxHeight: height > roomBelow ? roomBelow : undefined };
  }
  return {
    left,
    top: anchor.top - headerGap - Math.min(height, roomAbove),
    maxHeight: height > roomAbove ? roomAbove : undefined,
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
