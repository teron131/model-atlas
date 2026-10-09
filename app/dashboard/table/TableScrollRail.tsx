/** The leaderboard's group rail: a scrollbar drawn as the research rail's flight path, naming where each column group starts so a reader can see what lies off screen and jump to it. */

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useRef,
} from "react";

import { clamp } from "../../../src/model-atlas/math-utils";
import type { TableColumnRun } from "./models";
import { useTableScrollSnapshot } from "./viewport";

const TABLE_SCROLL_KEY_STEP_PX = 80;
const SCROLL_PAGE_STEP_RATIO = 0.85;
const RUN_LABELS: Record<TableColumnRun["group"], string> = {
  scores: "Scores",
  operations: "Resources",
  frontier: "Frontier",
  indexes: "Indexes",
  baseline: "Baseline",
  details: "Details",
};
// Rail labels are measurement labels, estimated at this width per character to keep neighbours apart.
const RAIL_LABEL_CHAR_PX = 8.1;
const RAIL_LABEL_GAP_PX = 16;
// A nudged name may sit this far from where its group starts before the rail hides crowded names instead.
const RAIL_LABEL_MAX_DRIFT_PX = 72;

/**
 * Mirror the table viewport in an accessible scroll rail and translate pointer, drag, and keyboard input back to horizontal table positions.
 * The rail is a flight path over the columns, styled as the research rail: each group's name sits near where its columns start with its waypoint beneath it, and a star travels waypoint to waypoint with its path lit behind it and passed waypoints violet.
 * A name scrolls its group to just after the pinned columns, or as near as the table's end allows; dragging anywhere on the track moves the star to the pointer.
 */
export function TableScrollRail({
  regionId,
  tableScrollRef,
  tableRef,
  onScrollTo,
  runs,
  columnWidths,
  pinnedWidth,
}: {
  /** The id of the scroll region the rail and its group names control. */
  regionId: string;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
  onScrollTo: (scrollLeft: number) => void;
  runs: readonly TableColumnRun[];
  columnWidths: readonly number[];
  pinnedWidth: number;
}) {
  const snapshot = useTableScrollSnapshot(tableScrollRef, tableRef);
  const total = columnWidths.reduce((sum, width) => sum + width, 0);
  const offsets = runs.map((run) =>
    columnWidths.slice(0, run.first).reduce((sum, width) => sum + width, 0),
  );
  // Each group reaches the reading line, just after the pinned columns, at this scroll.
  const reach = offsets.map((offset) => offset - pinnedWidth);
  const canScroll = snapshot.maxScrollLeft > 1;
  const labels = runs.map((run) => ({
    name: RUN_LABELS[run.group],
    count: run.benchmarks > 0 ? String(run.benchmarks) : "",
  }));
  // The last group whose scroll position the table has reached, given each group's position in order.
  const lastReached = (scrolls: readonly number[]) =>
    scrolls.filter((scroll) => scroll <= snapshot.scrollLeft + 1).length - 1;
  // A crowded rail keeps the name of the group at the reading line.
  const placements = railLabelPlacements(
    labels.map(({ name, count }) => `${name} ${count}`.trim().length),
    offsets.map((offset) => (total > 0 ? offset / total : 0)),
    snapshot.clientWidth,
    lastReached(reach),
  );
  // As on the research rail, each waypoint sits under its name rather than at the exact column, so the two never drift apart.
  const waypoints = placements.map((placement) => placement.center);
  const knots = flightKnots(reach, waypoints, snapshot.maxScrollLeft);
  const journey = alongFlight(knots, "scroll", "track", snapshot.scrollLeft);
  // Where the table must scroll for the star to meet each waypoint; the group being read is the last one the star has met.
  const arrivals = waypoints.map((waypoint) => alongFlight(knots, "track", "scroll", waypoint));
  const active = lastReached(arrivals);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const scrollProgress = canScroll ? snapshot.scrollLeft / snapshot.maxScrollLeft : 0;
  const percentScrolled = Math.round(scrollProgress * 100);
  const railStyle = { "--table-scrollbar-journey": `${journey * 100}%` } as CSSProperties;
  const scrollToPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (track == null || !canScroll || track.clientWidth <= 0) {
        return;
      }
      const trackLeft = track.getBoundingClientRect().left + track.clientLeft;
      const position = clamp((clientX - trackLeft) / track.clientWidth, 0, 1);
      onScrollTo(alongFlight(knots, "track", "scroll", position));
    },
    [canScroll, knots, onScrollTo],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canScroll) {
        return;
      }
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      scrollToPointer(event.clientX);
    },
    [canScroll, scrollToPointer],
  );
  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) {
        return;
      }
      scrollToPointer(event.clientX);
    },
    [scrollToPointer],
  );
  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!canScroll) {
        return;
      }
      const pageStep = snapshot.clientWidth * SCROLL_PAGE_STEP_RATIO;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft - TABLE_SCROLL_KEY_STEP_PX);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft + TABLE_SCROLL_KEY_STEP_PX);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft - pageStep);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        onScrollTo(snapshot.scrollLeft + pageStep);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        onScrollTo(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onScrollTo(snapshot.maxScrollLeft);
      }
    },
    [canScroll, onScrollTo, snapshot],
  );

  return (
    <div className="table-scrollbar" data-scrollable={canScroll} style={railStyle}>
      {runs.length > 1 ? (
        <div className="table-scrollbar-labels" role="group" aria-label="Column groups">
          {labels.map(({ name, count }, index) => (
            <button
              key={runs[index]!.group}
              type="button"
              className="table-scrollbar-label"
              style={{ left: `${placements[index]!.center * 100}%` }}
              data-active={index === active}
              data-crowded={placements[index]!.crowded}
              aria-controls={regionId}
              title={`Show the ${name.toLowerCase()} columns`}
              onClick={() => onScrollTo(Math.max(0, reach[index]!))}
            >
              {name}
              {count ? <b>{count}</b> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div
        aria-controls={regionId}
        aria-label="Table columns"
        aria-orientation="horizontal"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentScrolled}
        className="table-scrollbar-track"
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={trackRef}
        role="scrollbar"
        tabIndex={canScroll ? 0 : -1}
      >
        {waypoints.map((waypoint, index) => (
          <span
            key={runs[index]!.group}
            className="table-scrollbar-waypoint"
            style={{ left: `${waypoint * 100}%` }}
            data-passed={index <= active}
          />
        ))}
        <span className="table-scrollbar-star" aria-hidden="true" />
      </div>
    </div>
  );
}

type FlightKnot = { scroll: number; track: number };

/**
 * Pair table scroll positions with track positions, as fractions of the track, the way the research rail's star travels: it meets each group's waypoint as that group reaches the reading line just after the pinned columns, and reaches the track's end at the scroll limit.
 * `reach` is the scroll at which each group reaches the line; a group already there at the start puts the star on its waypoint, and groups too near the end to reach it are passed on the final stretch.
 * A waypoint that would not lie past the one before, which only a crowded rail can produce, adds no knot.
 */
function flightKnots(
  reach: readonly number[],
  waypoints: readonly number[],
  maxScroll: number,
): FlightKnot[] {
  const knots: FlightKnot[] = [{ scroll: 0, track: 0 }];
  reach.forEach((scroll, index) => {
    if (scroll <= 0) knots[0] = { scroll: 0, track: waypoints[index]! };
    else if (scroll < maxScroll && waypoints[index]! > knots.at(-1)!.track) {
      knots.push({ scroll, track: waypoints[index]! });
    }
  });
  knots.push({ scroll: maxScroll, track: 1 });
  return knots;
}

/** Read one coordinate of the flight from the other, linearly between knots and held at either end. */
function alongFlight(
  knots: readonly FlightKnot[],
  from: keyof FlightKnot,
  to: keyof FlightKnot,
  value: number,
): number {
  for (let index = 1; index < knots.length; index += 1) {
    const before = knots[index - 1]!;
    const after = knots[index]!;
    if (value <= after[from] || index === knots.length - 1) {
      const span = after[from] - before[from];
      const progress = span > 0 ? clamp((value - before[from]) / span, 0, 1) : 1;
      return before[to] + progress * (after[to] - before[to]);
    }
  }
  return knots[0]![to];
}

/**
 * Place each group's name from where its columns start (`starts`, as fractions of the rail), held inside the rail, returning each name's centre as a fraction of the rail's width.
 * Names first nudge apart, rightward and then back from the rail's end, staying near their starts; when the rail is too narrow for that, the group being read keeps its name and any other name that would crowd a placed one is hidden until it takes keyboard focus.
 */
function railLabelPlacements(
  lengths: readonly number[],
  starts: readonly number[],
  railWidth: number,
  active: number,
) {
  const widths = lengths.map((length) => length * RAIL_LABEL_CHAR_PX);
  const anchors = starts.map((start, index) =>
    Math.max(0, Math.min(start * railWidth, railWidth - widths[index]!)),
  );
  const center = (left: number, index: number) =>
    railWidth > 0 ? (left + widths[index]! / 2) / railWidth : 0;
  const nudged = [...anchors];
  for (let index = 1; index < nudged.length; index += 1) {
    nudged[index] = Math.max(
      nudged[index]!,
      nudged[index - 1]! + widths[index - 1]! + RAIL_LABEL_GAP_PX,
    );
  }
  for (let index = nudged.length - 1; index >= 0; index -= 1) {
    const limit =
      index === nudged.length - 1
        ? railWidth - widths[index]!
        : nudged[index + 1]! - RAIL_LABEL_GAP_PX - widths[index]!;
    nudged[index] = Math.min(nudged[index]!, limit);
  }
  if (
    nudged.every(
      (left, index) => left >= 0 && Math.abs(left - anchors[index]!) <= RAIL_LABEL_MAX_DRIFT_PX,
    )
  ) {
    return nudged.map((left, index) => ({ center: center(left, index), crowded: false }));
  }
  const placed: { left: number; right: number }[] = [];
  const crowded = new Set<number>();
  for (const index of [active, ...anchors.keys()]) {
    if (index < 0 || crowded.has(index) || placed.some((box) => box.left === anchors[index])) {
      continue;
    }
    const box = { left: anchors[index]!, right: anchors[index]! + widths[index]! };
    if (
      placed.some(
        (other) =>
          box.left < other.right + RAIL_LABEL_GAP_PX && box.right + RAIL_LABEL_GAP_PX > other.left,
      )
    ) {
      crowded.add(index);
    } else {
      placed.push(box);
    }
  }
  return anchors.map((left, index) => ({
    center: center(left, index),
    crowded: crowded.has(index),
  }));
}
