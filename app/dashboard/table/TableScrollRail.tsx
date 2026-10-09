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

/**
 * Mirror the table viewport in an accessible scroll rail and translate pointer, drag, and keyboard input back to horizontal table positions.
 * The rail is a flight path over the columns, styled as the research rail: each group's name sits near where its group starts on the rail with its waypoint beneath it, and a star travels waypoint to waypoint with its path lit behind it and passed waypoints violet.
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
  onScrollTo: (scrollLeft: number, options?: { smooth?: boolean }) => void;
  runs: readonly TableColumnRun[];
  columnWidths: readonly number[];
  pinnedWidth: number;
}) {
  const snapshot = useTableScrollSnapshot(tableScrollRef, tableRef);
  // Each group's stretch of rail follows what its name counts: benchmarks for the benchmark groups, so Frontier 40 runs twice as far as Baseline 20 whatever resource columns ride with them, and columns for the rest; the shape then holds across column views.
  const weights = runs.map((run, index) =>
    run.benchmarks > 0
      ? run.benchmarks
      : (runs[index + 1]?.first ?? columnWidths.length) - run.first,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const starts = weights.map(
    (_, index) =>
      weights.slice(0, index).reduce((sum, weight) => sum + weight, 0) / Math.max(1, totalWeight),
  );
  const offsets = runs.map((run) =>
    columnWidths.slice(0, run.first).reduce((sum, width) => sum + width, 0),
  );
  // Each group reaches the reading line, just after the pinned columns, at this scroll; the first group opens the view beside the model column, so it counts as reached from the start and the star rests on it.
  const reach = offsets.map((offset, index) =>
    index === 0 ? Math.min(0, offset - pinnedWidth) : offset - pinnedWidth,
  );
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
    starts,
    snapshot.clientWidth,
    lastReached(reach),
  );
  // As on the research rail, each waypoint sits under its name rather than at the exact column, so the two never drift apart.
  const waypoints = placements.map((placement) => placement.center);
  const flight = smoothFlight(flightKnots(reach, waypoints, snapshot.maxScrollLeft));
  const journey = flight.trackAt(snapshot.scrollLeft);
  // Where the table must scroll for the star to meet each waypoint; the group being read is the last one the star has met.
  const arrivals = waypoints.map((waypoint) => flight.scrollAt(waypoint));
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
      onScrollTo(flight.scrollAt(position));
    },
    [canScroll, flight, onScrollTo],
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
              onClick={() => onScrollTo(Math.max(0, reach[index]!), { smooth: true })}
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

/**
 * The star's flight as a smooth curve through the knots, read in both directions and held at either end.
 * A monotone cubic (Fritsch–Carlson) keeps the star on each waypoint and never moving backwards, while its pace changes gradually between groups instead of turning a corner at every waypoint.
 */
function smoothFlight(knots: readonly FlightKnot[]) {
  const first = knots[0]!;
  const last = knots.at(-1)!;
  const secants = knots.slice(1).map((knot, index) => {
    const span = knot.scroll - knots[index]!.scroll;
    return span > 0 ? (knot.track - knots[index]!.track) / span : 0;
  });
  const slopes = knots.map((_, index) => {
    const before = secants[index - 1];
    const after = secants[index];
    if (before == null) return after ?? 0;
    if (after == null) return before;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  secants.forEach((secant, index) => {
    if (secant === 0) {
      slopes[index] = 0;
      slopes[index + 1] = 0;
      return;
    }
    const start = slopes[index]! / secant;
    const end = slopes[index + 1]! / secant;
    const size = start * start + end * end;
    if (size > 9) {
      const scale = 3 / Math.sqrt(size);
      slopes[index] = scale * start * secant;
      slopes[index + 1] = scale * end * secant;
    }
  });
  const trackAt = (scroll: number) => {
    if (scroll <= first.scroll) return first.track;
    if (scroll >= last.scroll) return last.track;
    const index = knots.findIndex((knot) => scroll <= knot.scroll);
    const before = knots[index - 1]!;
    const after = knots[index]!;
    const span = after.scroll - before.scroll;
    if (span <= 0) return after.track;
    const t = (scroll - before.scroll) / span;
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * before.track +
      (t ** 3 - 2 * t ** 2 + t) * span * slopes[index - 1]! +
      (-2 * t ** 3 + 3 * t ** 2) * after.track +
      (t ** 3 - t ** 2) * span * slopes[index]!
    );
  };
  /** The scroll that puts the star at a track position, found by halving since the curve only rises. */
  const scrollAt = (track: number) => {
    if (track <= first.track) return first.scroll;
    if (track >= last.track) return last.scroll;
    let low = first.scroll;
    let high = last.scroll;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (trackAt(middle) < track) low = middle;
      else high = middle;
    }
    return high;
  };
  return { trackAt, scrollAt };
}

/**
 * Place each group's name from where its group starts on the rail (`starts`, as fractions of the rail), held inside the rail, returning each name's centre as a fraction of the rail's width.
 * Names first nudge apart, rightward and then back from the rail's end, staying as near their starts as the names before and after them allow; waypoints follow the names, so drift costs only proportion. Only when the rail is too narrow for every name does the group being read keep its name while any other name that would crowd a placed one is hidden until it takes keyboard focus.
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
  if (nudged.every((left) => left >= 0)) {
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
