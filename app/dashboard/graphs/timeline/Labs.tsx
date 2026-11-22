"use client";

/** Labs, beneath the Timeline, set on Lookback's row grid: the leading labs ranked by their strongest supported model released by the window's end, each row the lab's strongest models as stars on one Intelligence Index scale, the leader named at its star. Rows also steer the Timeline: the pointer points at a row's nearest star, which drops a dashed guide reading its index on the axis and is named with its score, while the chart draws its lab and its readout follows; pressing picks that model, and a focused row points at its leader. */

import { scaleLinear } from "d3-scale";
import { type MouseEvent, useMemo, useState } from "react";

import { providerChartColor, providerDisplayName } from "../../shared/provider-theme";
import { pointerPosition, XAxisGuides } from "../plot/Interaction";
import {
  type AxisReadingAt,
  monoWidth,
  noteBox,
  plotBoundsFor,
  rowChartRows,
  RowLabel,
  rowTextBoxes,
  StarMark,
  Trail,
  XAxisTicks,
} from "../plot/Primitives";
import { MUTED_STAR_GLOW, type SkyPlotStar } from "../plot/sky-renderer";
import { SkyFigure } from "../plot/SkyFigure";
import { useChartLayout } from "../use-chart-layout";
import type { TimelinePoint } from "./chart-data";
import {
  LAB_MINIMUM_MODELS,
  LEADING_LAB_COUNT,
  leadingLabs,
  RECORD_MINIMUM_SUPPORT,
} from "./frontier";

import graphs from "../graphs.module.css";
import timeline from "./timeline.module.css";

// Each lab's row shows its strongest few models, enough to read the depth behind its leader without reaching back through its history.
const MODELS_PER_LAB = 5;
const ROW_HEIGHT = 28;

type LabRow = { leader: TimelinePoint; models: TimelinePoint[] };

/** `points` are the Timeline's population, its organization filter applied, and `end` its window's end in epoch ms; `focusLab` is the lab the chart draws, whose row stays lit while the others quiet; `pickedId` is the Timeline's picked model, which a row holds pointed while it lists it. */
export function TimelineLabs({
  points,
  end,
  focusLab,
  pickedId,
  onPoint,
  onPick,
}: {
  points: TimelinePoint[];
  end: number;
  focusLab: string | null;
  pickedId: string | null;
  onPoint: (model: TimelinePoint | null) => void;
  onPick: (model: TimelinePoint) => void;
}) {
  const layout = useChartLayout(1120);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const labRows = useMemo(() => rankLabs(points, end), [points, end]);
  if (labRows.length === 0) return null;

  const { width, compact } = layout;
  const { margin, rowHeight, rowTop, markY, textY } = rowChartRows(width, compact, ROW_HEIGHT);
  const height = margin.top + labRows.length * rowHeight + margin.bottom;
  const bounds = plotBoundsFor(width, height, margin);
  // Every row reads one index scale, spanning the listed labs' models, so the rows compare as the chart's y-axis does.
  const scores = labRows.flatMap(({ models }) => models.map((model) => model.score));
  const x = scaleLinear()
    .domain([Math.min(...scores), Math.max(...scores)])
    .nice()
    .range([bounds.left + 16, Math.max(bounds.left + 17, bounds.right - 16)]);
  const ticks = x.ticks(4);
  const quiet = (provider: string) => focusLab != null && focusLab !== provider;
  // The star under the pointer, else the leader of a row the keyboard focuses, else the Timeline's pick while a row lists it, so a tap on a phone holds its guide.
  const focusedLeader = focusedRow == null ? undefined : labRows[focusedRow]?.leader;
  const pointedId = hovered ?? focusedLeader?.id ?? pickedId;
  const pointed = labRows
    .flatMap(({ models }, row) => models.map((model) => ({ model, row })))
    .find(({ model }) => model.id === pointedId);
  // The pointed model's index, read on the axis under its star.
  const reading: AxisReadingAt | null =
    pointed == null
      ? null
      : { x: x(pointed.model.score), text: pointed.model.score.toFixed(1), anchor: "middle" };
  const point = (model: TimelinePoint | null) => {
    setHovered(model?.id ?? null);
    onPoint(model);
  };
  // Across the plot a row points at its star nearest the pointer; over its name or index, at its leader.
  const modelAt = (event: MouseEvent<SVGElement>, { leader, models }: LabRow) => {
    const at = pointerPosition(event).x;
    if (at < bounds.left || at > bounds.right) return leader;
    return models.reduce((nearest, model) =>
      Math.abs(x(model.score) - at) < Math.abs(x(nearest.score) - at) ? model : nearest,
    );
  };
  // A lab's other models are dimmed stars, as Lookback dims the record a model passes, so the leader and a pointed model read in front of them.
  const stars: SkyPlotStar[] = labRows.flatMap(({ leader, models }, index) =>
    models.map((model) => ({
      key: model.id,
      x: x(model.score),
      y: markY(index),
      color: providerChartColor(model.provider),
      role: "star",
      glow:
        (model === leader || model === pointed?.model) && !quiet(model.provider)
          ? 1
          : MUTED_STAR_GLOW,
    })),
  );
  // A row's note names its leader at rest and its pointed model with that model's score, reading over the trail to end at the star, or past the star where the plot's start comes first.
  const notes = labRows.map(({ leader }, index) => {
    const subject = pointed?.row === index ? pointed.model : null;
    const text = subject == null ? leader.name : `${subject.name} ${subject.score.toFixed(1)}`;
    const star = x((subject ?? leader).score);
    const anchor: "start" | "end" =
      star - 7 - monoWidth(text, "micro") >= bounds.left ? "end" : "start";
    return { subject, text, star, anchor, x: anchor === "end" ? star - 7 : star + 7 };
  });
  // The text a pointer's guide passes behind: every row's name, index, and note.
  const textBoxes = labRows.flatMap(({ leader }, index) => [
    ...rowTextBoxes(
      textY(index),
      providerDisplayName(leader.provider),
      leader.score.toFixed(1),
      width,
    ),
    noteBox(notes[index]!.x, markY(index) - 6, notes[index]!.text, notes[index]!.anchor),
  ]);

  return (
    <div className={timeline.rowChart} data-capture-exclude>
      <p className={timeline.rowChartHead}>
        <span>
          <span className={timeline.rowChartName}>Labs</span>
          {labRows.length === LEADING_LAB_COUNT ? `Top ${LEADING_LAB_COUNT}` : "All"} with more than{" "}
          {LAB_MINIMUM_MODELS} models
        </span>
        <span aria-hidden="true">Index</span>
      </p>
      <SkyFigure
        layout={layout}
        height={height}
        bounds={bounds}
        sky={false}
        stars={stars}
        flare={pointed?.model.id ?? null}
        label="Labs: each leading lab's strongest models by Intelligence Index"
        role="group"
        onLeave={() => point(null)}
        // Each lab's trail runs from its weakest listed model to its leader beneath the stars, so every star on it lies over the line.
        underlay={labRows.map(({ leader, models }, index) => (
          <g key={leader.provider} opacity={quiet(leader.provider) ? 0.35 : 1}>
            <Trail
              from={x(models.at(-1)!.score)}
              to={x(leader.score)}
              y={markY(index)}
              color={providerChartColor(leader.provider)}
            />
          </g>
        ))}
      >
        {ticks.map((tick) => (
          <line
            key={tick}
            className={graphs.scaleGrid}
            x1={x(tick)}
            x2={x(tick)}
            y1={bounds.top}
            y2={bounds.bottom}
          />
        ))}
        <XAxisTicks
          ticks={ticks}
          xPoint={x}
          y={bounds.bottom}
          format={String}
          readings={reading == null ? [] : [reading]}
          keyPrefix="labs"
        />
        {pointed == null || reading == null ? null : (
          <XAxisGuides
            color={providerChartColor(pointed.model.provider)}
            bottom={bounds.bottom}
            stars={stars}
            boxes={textBoxes}
            guides={[{ x: reading.x, y: markY(pointed.row), reading }]}
          />
        )}
        {labRows.map((labRow, index) => {
          const { leader, models } = labRow;
          const y = markY(index);
          const to = x(leader.score);
          const dimmed = quiet(leader.provider);
          const lab = providerDisplayName(leader.provider);
          const score = leader.score.toFixed(1);
          const note = notes[index]!;
          return (
            <g key={leader.provider} className={graphs.partedText}>
              <RowLabel y={textY(index)} name={lab} provider={leader.provider} dimmed={dimmed} />
              <g opacity={dimmed ? 0.35 : 1}>
                <text className={graphs.plotNote} x={note.x} y={y - 6} textAnchor={note.anchor}>
                  {note.text}
                </text>
              </g>
              <StarMark cx={to} cy={y} provider={leader.provider} />
              {note.subject == null || note.subject === leader ? null : (
                <StarMark cx={note.star} cy={y} provider={note.subject.provider} />
              )}
              <text
                className={graphs.plotValue}
                x={width}
                y={textY(index)}
                dy="0.34em"
                textAnchor="end"
                opacity={dimmed ? 0.4 : 1}
              >
                {score}
              </text>
              <rect
                className={`${graphs.hit} ${timeline.labRow}`}
                x={0}
                y={rowTop(index)}
                width={width}
                height={rowHeight}
                role="button"
                tabIndex={0}
                aria-pressed={models.some((model) => model.id === pickedId)}
                aria-label={`${lab}: ${leader.name}, Intelligence Index ${score}`}
                onPointerMove={(event) => point(modelAt(event, labRow))}
                // A click or tap focuses the row too, and the star it lands on, not the leader, is the one it points at.
                onFocus={(event) => {
                  if (!event.currentTarget.matches(":focus-visible")) return;
                  setFocusedRow(index);
                  onPoint(leader);
                }}
                onBlur={() => {
                  setFocusedRow(null);
                  point(null);
                }}
                onClick={(event) => {
                  const model = modelAt(event, labRow);
                  point(model);
                  onPick(model);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onPick(pointed?.row === index ? pointed.model : leader);
                }}
              />
            </g>
          );
        })}
      </SkyFigure>
    </div>
  );
}

/** The leading labs ranked by their strongest model released by `end` with the evidence support a record needs, each with its strongest such models, strongest first. */
function rankLabs(points: TimelinePoint[], end: number): LabRow[] {
  const supported = points
    .filter(
      (point) =>
        Date.parse(point.releaseDate) <= end &&
        point.coverage != null &&
        point.coverage >= RECORD_MINIMUM_SUPPORT,
    )
    .sort((a, b) => b.score - a.score || a.releaseDate.localeCompare(b.releaseDate));
  return leadingLabs(points)
    .flatMap((lab) => {
      const models = supported
        .filter((point) => point.provider === lab.provider)
        .slice(0, MODELS_PER_LAB);
      return models.length ? [{ leader: models[0]!, models }] : [];
    })
    .sort((a, b) => b.leader.score - a.leader.score);
}
