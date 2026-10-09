"use client";

/** The sheet's reasoning-effort section: each family's efforts as a curve of Intelligence against cost, placed and joined in effort order exactly like the Pareto chart's variants, over one row of effort choices per model that switch the sheet and light their star. */

import {
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type SetStateAction,
  useState,
} from "react";

import { HoverCard } from "../graphs/ChartComponents";
import { GraphToggle } from "../graphs/GraphToggle";
import { type HoverRow, type HoverState, pointHover } from "../graphs/hover-state";
import { linearAxisScale } from "../graphs/plot/axis-scale";
import { calloutLabelPlacements } from "../graphs/plot/label-placement";
import { starCore, StarGlows, TextPointLabel, useLabelSizes } from "../graphs/plot/Primitives";
import { starConnectorSegments } from "../graphs/plot/star-marks";
import { providerChartColor } from "../shared/provider-theme";
import { formatResourceRatio } from "../shared/resource-ratio-display";
import { formatScore } from "../table/format";
import type { TableRow } from "../table/models";
import { type EffortPoint, familyName, type SheetEntry } from "./entries";
import { type ModelSheetSlot, selectModelSheetEffort } from "./open";
import { LABEL_MARGIN, SheetPlotFrame, useSheetPlot } from "./SheetPlot";

import graphStyles from "../graphs/graphs.module.css";
import styles from "./model-sheet.module.css";

const COLLAPSED = "collapsed";
const COLLAPSED_TITLE =
  "The leaderboard's collapsed row: the strongest variant, with other efforts' direct results filling its gaps";
const CURVE_HEIGHT = 168;
const STAR_RADIUS = 3.4;
const CHOSEN_STAR_RADIUS = 4.6;
// A star answers the pointer this far from its centre, so small, close efforts stay easy to find.
const STAR_REACH = 11;

type EffortCurve = { entry: SheetEntry; points: readonly EffortPoint[] };
/** The model series a star or choice row is pointing at, and the effort within it, if any, lit in the plot. */
type EffortPreview = { slot: ModelSheetSlot; effort: string | null };

/**
 * Costs come from the benchmarks all of a family's efforts share, as in the Pareto chart, so they can differ from each variant's own Cost× in the resources above.
 * Efforts without shared cost evidence stay choosable but off the curve; a single model also reads its chosen effort's step from the effort below.
 */
export function ReasoningEffort({ entries }: { entries: readonly SheetEntry[] }) {
  const [preview, setPreview] = useState<EffortPreview | null>(null);
  const comparing = entries.length > 1;
  const curves = entries
    .map((entry) => ({ entry, points: entry.efforts.points }))
    .filter((curve) => curve.points.length > 1);
  const stepLine = comparing || curves.length === 0 ? null : effortStep(curves[0]!);
  const counts = curves.map((curve) => curve.entry.efforts.benchmarkCount);
  return (
    <section className={styles.section} aria-labelledby="model-sheet-efforts">
      <h3 id="model-sheet-efforts">
        Reasoning effort{" "}
        <small>
          {curves.length > 0
            ? `Cost on ${counts.join(" · ")} shared ${counts.length === 1 && counts[0] === 1 ? "benchmark" : "benchmarks"}`
            : "Intelligence"}
        </small>
      </h3>
      {curves.length > 0 ? (
        <EffortPlot
          curves={curves}
          comparing={comparing}
          preview={preview}
          onPreview={setPreview}
        />
      ) : null}
      {stepLine == null ? null : <p className={styles.effortStep}>{stepLine}</p>}
      <div className={styles.effortChoices}>
        {entries.map((entry) => (
          <EffortChoices key={entry.slot} entry={entry} named={comparing} onPreview={setPreview} />
        ))}
      </div>
    </section>
  );
}

/**
 * Each family's efforts in effort order; the effort a sheet model shows is lit, and so is an effort named by its choice or under the pointer.
 * Pointing at a star, or along its curve at the nearest star, opens the dashboard's hover card for that variant, and choosing it switches the sheet.
 * In a comparison, pointing at a series, by its star or its choice row, lights it as the Pareto chart lights a variant family: its efforts are named and the other curve steps back.
 */
function EffortPlot({
  curves,
  comparing,
  preview,
  onPreview,
}: {
  curves: EffortCurve[];
  comparing: boolean;
  preview: EffortPreview | null;
  onPreview: (preview: EffortPreview | null) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const points = curves.flatMap((curve) => curve.points);
  const scoreAxis = linearAxisScale(
    points.map((point) => point.intelligence),
    { paddingRatio: 0.2, targetTickCount: 3, formatTick: (value) => value.toFixed(0) },
  );
  const plot = useSheetPlot(
    CURVE_HEIGHT,
    points.map((point) => point.cost),
    scoreAxis.domain,
  );
  const activeSlot = comparing ? (preview?.slot ?? null) : null;
  // Each family's placed efforts stay together for its connectors, its name at the curve's end, and its pointer reach.
  const series = curves.map(({ entry, points: curve }) => {
    const chosen = chosenEffort(entry);
    const muted = activeSlot != null && entry.slot !== activeSlot;
    const color = providerChartColor(entry.row.model.provider);
    const anchors = curve.map((point, index) => {
      const previewed = preview?.slot === entry.slot && preview.effort === point.effort;
      return {
        key: `${entry.slot}-${point.effort}`,
        entry,
        point,
        previous: curve[index - 1],
        muted,
        chosen: point.effort === chosen,
        lit: !muted && (point.effort === chosen || previewed),
        cx: plot.x(point.cost),
        cy: plot.y(point.intelligence),
        // Labels keep their places while a preview enlarges a star.
        radius: point.effort === chosen ? CHOSEN_STAR_RADIUS : STAR_RADIUS,
        color,
      };
    });
    return { entry, muted, color, anchors };
  });
  const marks = series.flatMap(({ anchors }) => anchors);
  type Mark = (typeof marks)[number];
  const connectors = series.flatMap(({ entry, muted, color, anchors }) =>
    starConnectorSegments(anchors).map((segment, index) => ({
      ...segment,
      key: `${entry.slot}-${index}`,
      color,
      muted,
      active: entry.slot === activeSlot,
    })),
  );
  // A single model, or a series being pointed at, names every effort; otherwise a comparison names each curve once, at its highest effort.
  const labels =
    comparing && activeSlot == null
      ? series.map(({ entry, anchors }) => ({ ...anchors.at(-1)!, label: familyName(entry) }))
      : marks.filter((mark) => !mark.muted).map((mark) => ({ ...mark, label: mark.point.effort }));
  const { svgRef, labelSizes } = useLabelSizes(
    labels.map((label) => label.label).join("\0"),
    false,
  );
  const placements = calloutLabelPlacements({
    labels: labels.map(({ key, label, cx, cy, radius }) => ({
      key,
      label,
      cx,
      cy,
      radius,
      size: labelSizes[label],
    })),
    // A stepped-back series may sit under the lit series' names, as muted Pareto points do.
    obstacles: marks.map(({ key, cx, cy, radius, muted }) => ({
      key,
      cx,
      cy,
      radius,
      weight: muted ? 0.15 : 1,
    })),
    bounds: plot.bounds,
    reservedBoxes: plot.reservedBoxes,
    segments: connectors.filter((segment) => !segment.muted),
  });
  const description = [
    "Intelligence against Cost× by reasoning effort.",
    ...curves.map(
      ({ entry, points: curve }) =>
        `${familyName(entry)}: ${curve
          .map(
            (point) =>
              `${point.effort} ${formatScore(point.intelligence)} at ${formatResourceRatio(point.cost)}`,
          )
          .join(", ")}.`,
    ),
  ].join(" ");
  const pointAt = (event: PointerEvent<SVGElement>, mark: Mark) => {
    setHover(pointHover(event, mark.point.model, effortHoverRows(mark.point, mark.previous)));
    onPreview({ slot: mark.entry.slot, effort: mark.point.effort });
  };
  const leave = () => {
    setHover(null);
    onPreview(null);
  };
  // Along a curve, the pointer answers for the curve's nearest effort, as a Timeline lab line answers for its nearest release.
  const nearestMark = (event: MouseEvent<SVGPathElement>, anchors: Mark[]) => {
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * plot.width) / rect.width;
    const py = ((event.clientY - rect.top) * plot.height) / rect.height;
    const distance = (mark: Mark) => Math.hypot(mark.cx - px, mark.cy - py);
    return anchors.reduce((best, mark) => (distance(mark) < distance(best) ? mark : best));
  };

  return (
    <div ref={plot.chartRef} className={`${graphStyles.chartTokens} ${styles.plot}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${plot.width} ${plot.height}`}
        role="img"
        aria-label={description}
      >
        <SheetPlotFrame plot={plot} scoreTicks={scoreAxis.ticks} />
        {connectors.map((segment) => (
          <line
            key={segment.key}
            className={styles.effortLine}
            data-muted={segment.muted || undefined}
            data-active={segment.active || undefined}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            stroke={segment.color}
          />
        ))}
        <StarGlows
          bounds={plot.bounds}
          stars={marks
            .filter((mark) => mark.lit)
            .map(({ key, chosen, cx, cy, color }) => ({
              key,
              cx,
              cy,
              radius: CHOSEN_STAR_RADIUS,
              color,
              emphasis: chosen ? ("selected" as const) : ("frontier" as const),
            }))}
        />
        {marks.map((mark) => (
          <circle
            key={mark.key}
            className={`${graphStyles.starCore} ${styles.effortStar}`}
            data-muted={mark.muted || undefined}
            cx={mark.cx}
            cy={mark.cy}
            {...starCore(mark.lit ? CHOSEN_STAR_RADIUS : STAR_RADIUS, mark.color)}
          />
        ))}
        {labels.map((label) => (
          <TextPointLabel
            key={label.key}
            label={label.label}
            cx={label.cx}
            cy={label.cy}
            width={plot.width}
            height={plot.height}
            margin={LABEL_MARGIN}
            placement={placements.get(label.key)}
          />
        ))}
        {series.map(({ entry, anchors }) => (
          <path
            key={`${entry.slot}-reach`}
            className={styles.effortLineReach}
            d={anchors
              .map((mark, index) => `${index === 0 ? "M" : "L"}${mark.cx},${mark.cy}`)
              .join("")}
            onPointerEnter={(event) => pointAt(event, nearestMark(event, anchors))}
            onPointerMove={(event) => pointAt(event, nearestMark(event, anchors))}
            onPointerLeave={leave}
            onClick={(event) =>
              selectModelSheetEffort(entry.slot, nearestMark(event, anchors).point.effort)
            }
          />
        ))}
        {marks.map((mark) => (
          <circle
            key={`${mark.key}-reach`}
            className={styles.effortReach}
            cx={mark.cx}
            cy={mark.cy}
            r={STAR_REACH}
            onPointerEnter={(event) => pointAt(event, mark)}
            onPointerMove={(event) => pointAt(event, mark)}
            onPointerLeave={leave}
            onClick={() => selectModelSheetEffort(mark.entry.slot, mark.point.effort)}
          />
        ))}
      </svg>
      {hover ? <HoverCard hover={hover} /> : null}
    </div>
  );
}

/** One row of effort choices per model: the collapsed choice is the leaderboard's own row; pointing anywhere in the row lights its series, and pointing at an effort lights its star. */
function EffortChoices({
  entry,
  named,
  onPreview,
}: {
  entry: SheetEntry;
  named: boolean;
  onPreview: Dispatch<SetStateAction<EffortPreview | null>>;
}) {
  const name = familyName(entry);
  return (
    <div
      className={styles.effortChoiceRow}
      onPointerEnter={() => onPreview({ slot: entry.slot, effort: null })}
      onPointerLeave={() => onPreview(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPreview(null);
      }}
    >
      {named ? (
        <span
          className={styles.effortModel}
          style={{ "--star": providerChartColor(entry.row.model.provider) } as CSSProperties}
        >
          <span className={styles.effortModelStar} aria-hidden="true" />
          <span>{name}</span>
        </span>
      ) : null}
      {entry.variants.length < 2 ? (
        <p className={styles.effortNone}>One effort</p>
      ) : (
        <GraphToggle
          legend={named ? `${name} reasoning effort` : "Reasoning effort"}
          options={[
            { key: COLLAPSED, label: "Collapsed", title: COLLAPSED_TITLE },
            ...entry.variants.flatMap(({ model }) =>
              model.reasoning_effort == null
                ? []
                : [
                    {
                      key: model.reasoning_effort,
                      label: model.reasoning_effort,
                      title: `Intelligence ${formatScore(model.scores.intelligence_score)}`,
                    },
                  ],
            ),
          ]}
          selectedKey={entry.effort ?? COLLAPSED}
          onSelect={(key) => selectModelSheetEffort(entry.slot, key === COLLAPSED ? null : key)}
          onPreview={(key) =>
            onPreview((current) =>
              key == null
                ? current?.slot === entry.slot
                  ? { slot: entry.slot, effort: null }
                  : current
                : { slot: entry.slot, effort: key === COLLAPSED ? null : key },
            )
          }
        />
      )}
    </div>
  );
}

/** The dashboard's hover-card rows for one effort: its score, its shared-benchmark cost, and its step from the effort below. */
function effortHoverRows(point: EffortPoint, previous: EffortPoint | undefined): HoverRow[] {
  const rows: HoverRow[] = [
    ["Intelligence Score", formatScore(point.intelligence)],
    ["Cost× ↓", formatResourceRatio(point.cost)],
  ];
  if (previous != null) {
    const { gain, cost } = step(previous, point);
    rows.push([`From ${previous.effort}`, `${gain} at ${cost} cost`]);
  }
  return rows;
}

/** The effort a sheet model shows: its own, or for a collapsed row the variant whose headline scores the row carries. */
function chosenEffort(entry: SheetEntry): string | null {
  if (entry.effort != null) return entry.effort;
  let best: TableRow | null = null;
  for (const variant of entry.variants) {
    const score = variant.model.scores.intelligence_score;
    if (score != null && score > (best?.model.scores.intelligence_score ?? -Infinity)) {
      best = variant;
    }
  }
  return best?.model.reasoning_effort ?? null;
}

/** Describe the chosen effort's step up from the effort below it; the lowest effort describes the whole ladder instead. */
function effortStep({ entry, points }: EffortCurve): string {
  const index = points.findIndex((point) => point.effort === chosenEffort(entry));
  const [from, to] =
    index > 0 ? [points[index - 1]!, points[index]!] : [points[0]!, points.at(-1)!];
  const { gain, cost } = step(from, to);
  return `${from.effort} → ${to.effort}: ${gain} Intelligence at ${cost} the cost`;
}

/** One step between efforts: the signed Intelligence change and the cost multiplier. */
function step(from: EffortPoint, to: EffortPoint) {
  const gain = to.intelligence - from.intelligence;
  return {
    gain: `${gain < 0 ? "−" : "+"}${Math.abs(gain).toFixed(1)}`,
    cost: formatResourceRatio(to.cost / from.cost),
  };
}
