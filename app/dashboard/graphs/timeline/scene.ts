/** The Timeline chart's drawn scene, derived as plain values from the windowed models, the plot's size, the replay frame, and the reader's pick and pointer. */

import { scaleLinear, scaleUtc } from "d3-scale";

import { providerChartColor } from "../../shared/provider-theme";
import {
  calloutLabelPlacements,
  type PointLabelPlacement,
  type PointLabelSize,
} from "../plot/label-placement";
import {
  crowdedOutLabels,
  horizonRim,
  horizonTrail,
  insetScaleAnchors,
  labelBounds,
  labelRect,
  plotBoundsFor,
  polylineSegments,
  SCATTER_CHART_MARGIN,
  scatterChartMargin,
} from "../plot/Primitives";
import { MUTED_STAR_GLOW, type SkyPlotScene } from "../plot/sky-renderer";
import {
  TIMELINE_LABEL_GAPS,
  type TimelinePoint,
  timelinePointLabel,
  timelineScoreDomain,
} from "./chart-data";
import { arrival, easeOut, RECORD_RISE_MS, type ReplayFrame } from "./replay";

// Frontier names sit in the open sky above and before their stars, as Pareto's do: the rim only rises to the right, so it never runs there, and the field of other models below it stays clear; a name with no room there gives way.
const SKY_SIDE = [[-1, -1]] as const;
// A constellation stroke stops this far short of each star it joins, as on a star chart.
const CONSTELLATION_GAP = 6;

type TimelineScene = ReturnType<typeof timelineScene>;
type LabelSizes = Record<string, PointLabelSize>;
type LabelPlacements = Map<string, PointLabelPlacement>;

/**
 * Everything the chart draws except where its names go, which waits on their measured sizes: `frontierNamesKey`, `frontierNameCallouts`, `labNamesKey`, then `labNameCallouts`, each callout step after the placements of the key before it.
 * `start` and `end` bound the window in epoch milliseconds, `range` is the window as shares of the population's span, and `reached` is the replay's reveal date or else `end`.
 */
export function timelineScene({
  width,
  compact,
  frame,
  start,
  end,
  range,
  reached,
  windowed,
  visible,
  records,
  ties,
  byScore,
  picked,
  preview,
  labRecords,
}: {
  width: number;
  compact: boolean;
  frame: ReplayFrame | null;
  start: number;
  end: number;
  range: readonly [number, number];
  reached: number;
  windowed: readonly TimelinePoint[];
  visible: readonly TimelinePoint[];
  records: readonly TimelinePoint[];
  ties: readonly TimelinePoint[];
  byScore: readonly TimelinePoint[];
  picked: TimelinePoint | undefined;
  preview: TimelinePoint | null;
  labRecords: readonly TimelinePoint[];
}) {
  const prior = records.filter((point) => Date.parse(point.releaseDate) < start).at(-1);
  const frontier = records.filter((point) => {
    const date = Date.parse(point.releaseDate);
    return date >= start && date <= reached;
  });
  // The models on the frontier curve: its records and the models level with them, in release order.
  const curve = [
    ...frontier,
    ...ties.filter((point) => Date.parse(point.releaseDate) <= reached),
  ].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const frontierIds = new Set(frontier.map((point) => point.id));
  // The readout follows picks, not the pointer, which the hover card follows, so the entry above the chart holds still while the reader scans the stars.
  const chosen = picked ?? frontier.at(-1) ?? visible.at(-1);
  const height = compact ? 400 : 520;
  const margin = scatterChartMargin(SCATTER_CHART_MARGIN, compact);
  const padding = Math.max((end - start) * 0.025, 14 * 86400000 * (range[1] - range[0]));
  // The window's scores and the record it opens under set the scale; a running replay frames its own stretch of the window and settles back onto this framing.
  const [low, high] = timelineScoreDomain(
    [...windowed, ...(prior ? [prior] : [])].map((point) => point.score),
  );
  const windowView = { start: start - padding, end: end + padding, low, high };
  const camera = frame?.view ?? windowView;
  const x = scaleUtc()
    .domain([new Date(camera.start), new Date(camera.end)])
    .range([margin.left, width - margin.right]);
  const y = scaleLinear()
    .domain([camera.low, camera.high])
    .range([height - margin.bottom, margin.top]);
  const xPoint = (point: TimelinePoint) => x(new Date(point.releaseDate));
  // A replay brings each model in a little larger and fainter than its mark, settling a moment after it is reached.
  const arrived = (point: TimelinePoint) => (frame == null ? 1 : arrival(frame.age(point.id)));
  // Stars share the Pareto plot's scale; this field is far denser, so they sit at the small end of it.
  const markRadius = (point: TimelinePoint) => (frontierIds.has(point.id) ? 2.8 : 2.4);
  const pointRadius = (point: TimelinePoint) =>
    (chosen?.id === point.id ? 3.6 : markRadius(point)) * (1.4 - 0.4 * arrived(point));
  // While a star is hovered its lab stays lit and the other labs dim, as other models do on Pareto; a replay fades each model in.
  const dimmed = (point: TimelinePoint) => preview != null && preview.provider !== point.provider;
  const pointOpacity = (point: TimelinePoint) =>
    (dimmed(point) ? MUTED_STAR_GLOW : 1) * arrived(point);
  const highlights = byScore.slice(0, 3);
  const gpt4 = visible.find(
    (point) =>
      point.name === "GPT-4 (Mar 2023)" ||
      (point.name === "GPT-4" && point.releaseDate === "2023-03-14"),
  );
  const plotBounds = plotBoundsFor(width, height, margin);
  // A replay draws only the stars its camera frames.
  const drawn =
    frame == null
      ? visible
      : visible.filter((point) => {
          const cx = xPoint(point);
          return cx >= plotBounds.left - 8 && cx <= plotBounds.right + 8;
        });
  // The settled chart names its frontier curve, as Pareto names its frontier, and always the picked model, GPT-4, and its leaders, which take priority over the curve's newest models and then its oldest, so a crowded stretch, as on a phone, keeps those names first; a replay names the curve models its camera frames.
  const labelled =
    frame != null
      ? curve.filter((point) => drawn.includes(point))
      : [
          ...new Map(
            [
              ...(picked && drawn.includes(picked) ? [picked] : []),
              ...(gpt4 ? [gpt4] : []),
              ...highlights,
              ...[...curve].reverse(),
            ].map((point) => [point.id, point]),
          ).values(),
        ];
  // The focused lab's records within reach, which its strokes join; only its newest is named, where its line ends, since naming every record crowds the field.
  const labStars = labRecords.filter((point) => {
    const date = Date.parse(point.releaseDate);
    return date >= start && date <= reached && drawn.includes(point);
  });
  const labStarIds = new Set(labStars.map((point) => point.id));
  const labNewest = labStars.at(-1);
  const labNamed =
    frame == null && labNewest != null && !labelled.includes(labNewest) ? [labNewest] : [];
  const yTicks = y.ticks(5);
  const scaleAnchorBoxes = compact
    ? insetScaleAnchors(yTicks, y, margin.left, String).map(({ box }) => box)
    : [];
  const ticks = x.ticks(compact ? 4 : 7).map(Number);
  // In a replay the newest record's level climbs from the one it beat, and the reached region ends at the reveal until the camera settles.
  const levels = [...(prior ? [prior] : []), ...frontier];
  const horizon = levels.map((point, index) => {
    const level = y(point.score);
    const below = y(levels[index - 1]?.score ?? point.score);
    const age = frame && index === levels.length - 1 ? frame.age(point.id) : null;
    return {
      x: point === prior ? x(new Date(start)) : xPoint(point),
      y: age == null ? level : below + (level - below) * easeOut(age / RECORD_RISE_MS),
    };
  });
  const reveal =
    frame == null
      ? plotBounds.right
      : x(new Date(frame.at)) + (plotBounds.right - x(new Date(frame.at))) * frame.settle;
  const rim = horizonRim(horizon, { ...plotBounds, right: reveal }, "right");
  const trail = horizonTrail(horizon, plotBounds, "right");
  // The focused lab's records, entering at the window's start as the frontier does and ending at its latest record within reach.
  const labPrior = labRecords.filter((point) => Date.parse(point.releaseDate) < start).at(-1);
  const labLine = [
    ...(labPrior ? [{ x: x(new Date(start)), y: y(labPrior.score) }] : []),
    ...labStars.map((point) => ({ x: xPoint(point), y: y(point.score) })),
  ];
  const labSegments = polylineSegments(labLine);
  // Names are placed as Pareto's are, clear of every star; a replay's camera moves every frame, too often to search placements, so its labels sit beside their stars until the chart settles.
  const settled = frame == null && labelled.length > 0;
  const obstacles = settled
    ? visible.map((point) => ({
        key: point.id,
        cx: xPoint(point),
        cy: y(point.score),
        radius: markRadius(point),
      }))
    : [];
  const leader = frontier.at(-1);
  const sky: SkyPlotScene = {
    width,
    height,
    bounds: plotBounds,
    rim,
    trail,
    muted: preview != null,
    stars: drawn.map((point) => ({
      key: point.id,
      x: xPoint(point),
      y: y(point.score),
      color: providerChartColor(point.provider),
      // The focused lab's records take the record stars' rays, so its line is read star by star.
      role:
        point === leader
          ? "leader"
          : frontierIds.has(point.id) || labStarIds.has(point.id)
            ? "frontier"
            : "star",
      glow: pointOpacity(point),
      scale: 1.4 - 0.4 * arrived(point),
    })),
    // Only a star the reader hovers or picks flares, as on Pareto; the readout's default leader stays a plain leader star.
    flare: (preview ?? picked)?.id ?? null,
    compact,
  };
  return {
    prior,
    frontier,
    frontierIds,
    chosen,
    height,
    margin,
    windowView,
    x,
    y,
    xPoint,
    arrived,
    markRadius,
    pointRadius,
    dimmed,
    pointOpacity,
    plotBounds,
    drawn,
    labelled,
    labNamed,
    yTicks,
    scaleAnchorBoxes,
    ticks,
    horizon,
    reveal,
    rim,
    trail,
    labPrior,
    labSegments,
    settled,
    obstacles,
    sky,
  };
}

/** The settled frontier names' placement problem as a string, so placements are searched again only when it changes; `null` while nothing is to be placed. */
export function frontierNamesKey(scene: TimelineScene, labelSizes: LabelSizes) {
  const {
    labelled,
    settled,
    xPoint,
    y,
    markRadius,
    obstacles,
    plotBounds,
    scaleAnchorBoxes,
    rim,
    trail,
  } = scene;
  // The frontier's names also keep clear of its rim and trail.
  return !settled
    ? null
    : JSON.stringify({
        labels: labelled.map((point, index) => ({
          key: point.id,
          label: timelinePointLabel(point),
          cx: xPoint(point),
          cy: y(point.score),
          radius: markRadius(point),
          size: labelSizes[timelinePointLabel(point)],
          priority: labelled.length - index,
        })),
        obstacles,
        bounds: labelBounds(plotBounds),
        reservedBoxes: scaleAnchorBoxes,
        gaps: TIMELINE_LABEL_GAPS,
        directions: SKY_SIDE,
        segments: [
          ...polylineSegments(rim),
          ...(trail == null ? [] : polylineSegments([trail.from, trail.to])),
        ],
      });
}

/** The frontier names as placed, and which of them are crowded out. */
export function frontierNameCallouts(
  scene: TimelineScene,
  labelSizes: LabelSizes,
  labelPlacements: LabelPlacements,
) {
  const callouts = scene.labelled.map((point) => ({
    key: point.id,
    placement: labelPlacements.get(point.id),
    size: labelSizes[timelinePointLabel(point)],
  }));
  return { callouts, crowded: crowdedOutLabels(callouts) };
}

type FrontierNames = ReturnType<typeof frontierNameCallouts>;

/** The focused lab's name's placement problem around the frontier names left standing, as `frontierNamesKey` states the frontier's; `null` while there is no name to place. */
export function labNamesKey(
  scene: TimelineScene,
  labelSizes: LabelSizes,
  { callouts, crowded }: FrontierNames,
) {
  const {
    labNamed,
    settled,
    xPoint,
    y,
    markRadius,
    obstacles,
    plotBounds,
    scaleAnchorBoxes,
    labSegments,
  } = scene;
  // The focused lab's name is placed around the names already standing, which keep their places as the pointer moves, and gives way where it does not fit.
  const keptNameBoxes = callouts.flatMap(({ key, placement, size }) => {
    if (crowded.has(key) || placement == null || size == null) return [];
    const rect = labelRect(placement, size, 2);
    return [
      { left: rect.x, right: rect.x + rect.width, top: rect.y, bottom: rect.y + rect.height },
    ];
  });
  return labNamed.length === 0 || !settled
    ? null
    : JSON.stringify({
        labels: labNamed.map((point) => ({
          key: point.id,
          label: timelinePointLabel(point),
          cx: xPoint(point),
          cy: y(point.score),
          radius: markRadius(point),
          size: labelSizes[timelinePointLabel(point)],
        })),
        obstacles,
        bounds: labelBounds(plotBounds),
        reservedBoxes: [...scaleAnchorBoxes, ...keptNameBoxes],
        gaps: TIMELINE_LABEL_GAPS,
        segments: labSegments,
      });
}

/** The focused lab's name as placed, and which names, frontier ones standing included, are crowded out once it joins them. */
export function labNameCallouts(
  scene: TimelineScene,
  labelSizes: LabelSizes,
  labPlacements: LabelPlacements,
  { callouts, crowded }: FrontierNames,
) {
  const labCallouts = scene.labNamed.map((point) => ({
    key: point.id,
    placement: labPlacements.get(point.id),
    size: labelSizes[timelinePointLabel(point)],
  }));
  const labCrowded = crowdedOutLabels([
    ...callouts.filter(({ key }) => !crowded.has(key)),
    ...labCallouts,
  ]);
  return { labCallouts, labCrowded };
}

/** A name sits at most a short gap from its star, so it takes no leader, whose few dots would read as stray stars beside it. */
export function placeBesideStars(layoutKey: string | null) {
  if (layoutKey == null) return new Map<string, PointLabelPlacement>();
  const placements = calloutLabelPlacements(JSON.parse(layoutKey));
  return new Map(
    [...placements].map(([key, placement]) => [key, { ...placement, line: undefined }]),
  );
}

/** A stroke joining two of a lab's records, stopped short of each star, or `null` where the stars sit too close for one; a stroke entering at the window's edge starts there, where no star stands. */
export function constellationStroke(
  segment: { x1: number; y1: number; x2: number; y2: number },
  fromEdge: boolean,
) {
  const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
  const head = fromEdge ? 0 : CONSTELLATION_GAP;
  if (length <= head + CONSTELLATION_GAP * 2) return null;
  const ux = (segment.x2 - segment.x1) / length;
  const uy = (segment.y2 - segment.y1) / length;
  return {
    x1: segment.x1 + ux * head,
    y1: segment.y1 + uy * head,
    x2: segment.x2 - ux * CONSTELLATION_GAP,
    y2: segment.y2 - uy * CONSTELLATION_GAP,
  };
}
