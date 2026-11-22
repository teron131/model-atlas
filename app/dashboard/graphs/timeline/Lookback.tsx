"use client";

/** Lookback, beneath Labs under the Timeline: for the strongest models of the labs the Timeline shows, and any its find field locates, the newest frontier record each one surpasses and how long before its release that record was set, drawn from the record's release to the model's own; rows that surpass the same record share one stem at its release, which names the record once. */

import { scaleUtc } from "d3-scale";
import { useState } from "react";

import { providerChartColor, providerLogo } from "../../shared/provider-theme";
import { TOP_MODELS } from "../chart-data";
import { foundModelsPhrase, lastLocated } from "../ChartFind";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { usePick, XAxisGuides } from "../plot/Interaction";
import {
  axisTextsOverlap,
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
import { coverageFrontier } from "./frontier";

import graphs from "../graphs.module.css";
import timeline from "./timeline.module.css";

const DAY_MS = 86_400_000;
const ROW_HEIGHT = 28;

type Lookback = {
  point: TimelinePoint;
  /** The newest record released by the point's release whose score it matches or beats: the point itself when it set the frontier. */
  matched: TimelinePoint;
  days: number;
};
type Anchor = "start" | "middle" | "end";
/** Consecutive rows that surpass the same record, by row index; `own` when the record's own row stands directly beneath them, so the stem ends on that row's star. */
type Run = { record: TimelinePoint; first: number; last: number; own: boolean };

/** `points` are the Timeline's population, its organization filter applied; `located` and `matches` are its find field's located models and the models its query names, `null` without a query. */
export function TimelineLookback({
  points,
  located,
  matches,
}: {
  points: TimelinePoint[];
  located: ReadonlyMap<string, number>;
  matches: ReadonlySet<string> | null;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = usePick<string>();
  const layout = useChartLayout(1120);
  const { width, compact } = layout;
  // Records need the Timeline's evidence support, so they are the Timeline's own frontier.
  const records = coverageFrontier(points);
  const matchedRecord = (point: TimelinePoint) =>
    records
      .filter((record) => record.releaseDate <= point.releaseDate && record.score <= point.score)
      .at(-1);
  // A model under the first record surpasses none, so it has no place here even when the find field locates it.
  const placeable = points.filter((point) => matchedRecord(point) != null);
  const strongest = [...placeable].sort((a, b) => b.score - a.score).slice(0, TOP_MODELS);
  const found = placeable.filter((point) => located.has(point.id) && !strongest.includes(point));
  const lookbacks: Lookback[] = [...strongest, ...found]
    .sort((a, b) => b.score - a.score)
    .map((point) => {
      const matched = matchedRecord(point)!;
      return { point, matched, days: Math.round((released(point) - released(matched)) / DAY_MS) };
    });
  if (lookbacks.length === 0) return null;
  const foundPhrase = foundModelsPhrase(found.length);

  const { margin, rowHeight, rowTop, markY, textY } = rowChartRows(width, compact, ROW_HEIGHT);
  const height = margin.top + lookbacks.length * rowHeight + margin.bottom;
  const bounds = plotBoundsFor(width, height, margin);
  const first = Math.min(...lookbacks.map(({ matched }) => released(matched)));
  const last = Math.max(...lookbacks.map(({ point }) => released(point)));
  const x = scaleUtc()
    .domain([new Date(first), new Date(last)])
    .range([bounds.left + 16, Math.max(bounds.left + 17, bounds.right - 16)]);
  const at = (point: TimelinePoint) => x(new Date(point.releaseDate));
  // Only month lines stand at rest; the pointer's guides read exact dates.
  const axis = monthAxis(first, last, compact ? 4 : 8);
  // The row under the pointer, else the one a click or tap holds, as in Effort and Duels.
  const pointedId = hovered ?? picked;
  const pointed = lookbacks.find(({ point }) => point.id === pointedId);
  // A pointed row quiets every other; with none pointed, a query in the find field quiets the rows it does not name, as in Duels.
  const dimmed = (id: string) =>
    pointed != null ? pointed.point.id !== id : matches != null && !matches.has(id);
  // A note starts right of its star, or left of it when the plot ends first; `null` when neither side holds it.
  const noteStart = (star: number, text: string) => {
    const noteWidth = monoWidth(text, "micro");
    if (star + 7 + noteWidth <= bounds.right) return star + 7;
    return star - 7 - noteWidth >= bounds.left ? star - 7 - noteWidth : null;
  };
  const runs = recordRuns(lookbacks);
  // A stem and its head stay lit while any of the stem's rows is.
  const runQuiet = (run: Run) =>
    lookbacks.slice(run.first, run.last + 1).every(({ point }) => dimmed(point.id));
  // Every stem names its record once, at its head; on a plot too narrow for one of those names, a head gives its record's score alone and the readout names it, and a stem ending on its record's own row, whose star already reads that score, goes without.
  const naming = runs.every(
    (run) => noteStart(at(run.record), recordNote(run.record, true)) != null,
  );
  const headNotes = new Map(
    runs
      .filter((run) => naming || !run.own)
      .map((run) => {
        const text = recordNote(run.record, naming);
        return [run.first, { text, x: noteStart(at(run.record), text) ?? bounds.left }];
      }),
  );
  // A record with no row of its own beneath its run sets its star at the stem's head, and the rows under it start at the stem.
  const headStars = new Set(runs.filter((run) => !run.own).map((run) => run.first));
  // Plain stars keep their bare-panel size, so a model's star never outsizes a frontier setter's rayed one.
  const stars: SkyPlotStar[] = lookbacks.flatMap(({ point, matched }, index) => {
    const own: SkyPlotStar = {
      key: point.id,
      x: at(point),
      y: markY(index),
      color: providerChartColor(point.provider),
      // A model that set the frontier carries its rays.
      role: matched === point ? "frontier" : "star",
      glow: dimmed(point.id) ? MUTED_STAR_GLOW : 1,
    };
    if (!headStars.has(index)) return [own];
    return [
      {
        key: `${point.id}:matched`,
        x: at(matched),
        y: markY(index),
        color: providerChartColor(matched.provider),
        role: "star",
        // The record the model surpasses is a dimmed star, so the past reads behind the model's own.
        glow: MUTED_STAR_GLOW,
      },
      own,
    ];
  });
  // Until a row is pointed at, the readout names the model found last, else the longest wait, the chart's widest gap.
  const foundLast = lastLocated(located);
  const readout =
    pointed ??
    lookbacks.find(({ point }) => point.id === foundLast) ??
    lookbacks.reduce<Lookback | undefined>(
      (longest, lookback) => (longest == null || lookback.days > longest.days ? lookback : longest),
      undefined,
    );
  // The pointed row drops a dashed guide in its lab colour from each star to the axis and reads the release date there, as Pareto's pointer does; a date names its year once the axis spans more than one, and two dates that would overlap centred stand back to back.
  const readingFormat = new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year:
      new Date(first).getUTCFullYear() === new Date(last).getUTCFullYear() ? undefined : "numeric",
  });
  const ends =
    pointed == null
      ? []
      : [...new Set([pointed.matched, pointed.point])].map((end) => ({
          x: at(end),
          y: markY(lookbacks.indexOf(pointed)),
          text: readingFormat.format(new Date(end.releaseDate)),
        }));
  const [earlier, later] = ends;
  const crowded =
    earlier != null &&
    later != null &&
    axisTextsOverlap({ ...earlier, anchor: "middle" }, { ...later, anchor: "middle" });
  const guides = ends.map(({ x, y, text }, index) => {
    const anchor: Anchor = !crowded ? "middle" : index === 0 ? "end" : "start";
    return {
      x,
      y,
      reading: { x: x + (anchor === "start" ? 4 : anchor === "end" ? -4 : 0), text, anchor },
    };
  });

  // A model's score reads over its trail, ending at its star; where the trail is too short to hold it clear of the stem and its head's note, it reads under the trail from the stem instead. A frontier setter's reads beside its star.
  const scoreNotes = lookbacks.map(({ point, matched }, index) => {
    const y = markY(index);
    const from = at(matched);
    const to = at(point);
    const head = headNotes.get(index);
    const text = point.score.toFixed(1);
    const textWidth = monoWidth(text, "micro");
    const clear = Math.max(from + 7, head == null ? 0 : head.x + monoWidth(head.text, "micro") + 6);
    const place: { x: number; y: number; anchor: Anchor } =
      matched === point
        ? { x: noteStart(to, text) ?? bounds.left, y: y - 6, anchor: "start" }
        : to - 7 - textWidth >= clear
          ? { x: to - 7, y: y - 6, anchor: "end" }
          : { x: Math.min(from + 7, bounds.right - textWidth), y: y + 14, anchor: "start" };
    return { text, ...place };
  });
  // The text a pointer's guide passes behind: every row's name, day count, and score, and each stem's head note.
  const textBoxes = [
    ...lookbacks.flatMap((lookback, index) => {
      const { x, y, text, anchor } = scoreNotes[index]!;
      return [
        ...rowTextBoxes(textY(index), lookback.point.name, daysAfter(lookback), width),
        noteBox(x, y, text, anchor),
      ];
    }),
    ...[...headNotes].map(([row, head]) => noteBox(head.x, markY(row) - 6, head.text, "start")),
  ];

  // Like Labs, which it sits under, the list reads on the page and an exported image is the figure alone.
  return (
    <div className={timeline.rowChart} data-capture-exclude>
      <p className={timeline.rowChartHead}>
        <span>
          <span className={timeline.rowChartName}>Lookback</span>
          {`Top ${strongest.length} models${foundPhrase == null ? "" : ` ${foundPhrase}`} and the record each passes`}
        </span>
        <span aria-hidden="true">Days after</span>
      </p>
      <ChartReadout
        label="Lookback details"
        sentence={{ holds: lookbacks.map(lookbackEntry) }}
        entry={readout == null ? null : lookbackEntry(readout)}
      />
      <SkyFigure
        layout={layout}
        height={height}
        bounds={bounds}
        sky={false}
        stars={stars}
        flare={pointedId}
        found={lookbacks.flatMap(({ point }) => {
          const at = located.get(point.id);
          return at == null ? [] : [{ key: point.id, at }];
        })}
        label="Days each model shipped after the frontier record it surpasses"
        onLeave={() => setHovered(null)}
        // Stems and trails run beneath the stars, so every star they reach lies over them.
        underlay={
          <>
            {runs.map((run) => {
              const foot = run.own ? run.last + 1 : run.last;
              // A lone row with its record's star beside it needs no stem.
              return foot === run.first ? null : (
                <line
                  key={`${run.record.id}:${run.first}`}
                  className={graphs.recordStem}
                  stroke={providerChartColor(run.record.provider)}
                  opacity={runQuiet(run) ? 0.35 : 1}
                  x1={at(run.record)}
                  x2={at(run.record)}
                  y1={markY(run.first)}
                  y2={markY(foot)}
                />
              );
            })}
            {lookbacks.map(({ point, matched }, index) =>
              matched === point ? null : (
                <g key={point.id} opacity={dimmed(point.id) ? 0.35 : 1}>
                  <Trail
                    from={at(matched)}
                    to={at(point)}
                    y={markY(index)}
                    color={providerChartColor(point.provider)}
                  />
                </g>
              ),
            )}
          </>
        }
      >
        {axis.ticks.map((tick) => (
          <line
            key={tick}
            className={graphs.scaleGrid}
            x1={x(new Date(tick))}
            x2={x(new Date(tick))}
            y1={bounds.top}
            y2={bounds.bottom}
          />
        ))}
        <XAxisTicks
          ticks={axis.ticks}
          xPoint={(value) => x(new Date(value))}
          y={bounds.bottom}
          format={axis.label}
          readings={guides.map(({ reading }) => reading)}
          keyPrefix="lookback"
          // A year-bearing label beside a bare month needs about this much between their centres.
          labelMinGap={45}
        />
        {pointed == null ? null : (
          <XAxisGuides
            color={providerChartColor(pointed.point.provider)}
            bottom={bounds.bottom}
            stars={stars}
            boxes={textBoxes}
            guides={guides}
          />
        )}
        {runs.map((run) => {
          const head = headNotes.get(run.first);
          return head == null ? null : (
            <g
              key={`${run.record.id}:${run.first}`}
              className={graphs.partedText}
              opacity={runQuiet(run) ? 0.35 : 1}
            >
              {run.own ? null : (
                <StarMark
                  cx={at(run.record)}
                  cy={markY(run.first)}
                  provider={run.record.provider}
                />
              )}
              <text className={graphs.plotNote} x={head.x} y={markY(run.first) - 6}>
                {head.text}
              </text>
            </g>
          );
        })}
        {lookbacks.map((lookback, index) => {
          const { point } = lookback;
          const quiet = dimmed(point.id);
          const scoreNote = scoreNotes[index]!;
          return (
            <g key={point.id} className={graphs.partedText}>
              <RowLabel
                y={textY(index)}
                name={point.name}
                provider={point.provider}
                dimmed={quiet}
              />
              <text
                className={graphs.plotNote}
                x={scoreNote.x}
                y={scoreNote.y}
                textAnchor={scoreNote.anchor}
                opacity={quiet ? 0.35 : 1}
              >
                {scoreNote.text}
              </text>
              <StarMark cx={at(point)} cy={markY(index)} provider={point.provider} />
              <text
                className={graphs.plotValue}
                x={width}
                y={textY(index)}
                dy="0.34em"
                textAnchor="end"
                opacity={quiet ? 0.4 : 1}
              >
                {daysAfter(lookback)}
              </text>
              <rect
                className={graphs.hit}
                x={0}
                y={rowTop(index)}
                width={width}
                height={rowHeight}
                data-keeps-pick
                onPointerMove={() => setHovered(point.id)}
                onClick={() => setPicked(point.id)}
              />
            </g>
          );
        })}
      </SkyFigure>
    </div>
  );
}

function released(point: TimelinePoint): number {
  return Date.parse(point.releaseDate);
}

/** Month starts from `from` to `to` (epoch ms), every `step` months counted from January, `step` being the finest of 1, 2, 3, or 6 months that keeps to `maxLines`, else a year; labels name the year only on the first tick and each January, so months fit a phone's axis: Sep 1 to Nov 17 2026 gives Sep 1, Oct 1, Nov 1, labelled "Sep 2026", "Oct", "Nov". */
function monthAxis(
  from: number,
  to: number,
  maxLines: number,
): { ticks: number[]; label: (tick: number) => string } {
  const start = new Date(from);
  const end = new Date(to);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const step = [1, 2, 3, 6].find((candidate) => months / candidate <= maxLines) ?? 12;
  const ticks: number[] = [];
  // Date.UTC rolls month 12 over to the next January, so the loop counts months past the start's year.
  for (
    let month = start.getUTCMonth();
    Date.UTC(start.getUTCFullYear(), month, 1) <= to;
    month += 1
  ) {
    const tick = Date.UTC(start.getUTCFullYear(), month, 1);
    if (tick >= from && (month % 12) % step === 0) ticks.push(tick);
  }
  const label = (tick: number) =>
    new Date(tick).toLocaleDateString(
      "en",
      step === 12
        ? { timeZone: "UTC", year: "numeric" }
        : tick === ticks[0] || new Date(tick).getUTCMonth() === 0
          ? { timeZone: "UTC", month: "short", year: "numeric" }
          : { timeZone: "UTC", month: "short" },
    );
  return { ticks, label };
}

function recordRuns(lookbacks: readonly Lookback[]): Run[] {
  const runs: Omit<Run, "own">[] = [];
  lookbacks.forEach(({ point, matched }, index) => {
    if (matched === point) return;
    const open = runs.at(-1);
    if (open != null && open.record === matched && open.last === index - 1) open.last = index;
    else runs.push({ record: matched, first: index, last: index });
  });
  return runs.map((run) => ({ ...run, own: lookbacks[run.last + 1]?.point === run.record }));
}

/** The note at a stem's head: the record and its score, "Claude Fable 5.1 192.5" when `named`, else the score alone. */
function recordNote(record: TimelinePoint, named: boolean): string {
  const score = record.score.toFixed(1);
  return named ? `${record.name} ${score}` : score;
}

function lookbackEntry({ point, matched, days }: Lookback): ReadoutEntry {
  return {
    name: point.name,
    logo: providerLogo(point.provider),
    // One sentence from the name: "GPT-6.2 Sol 194.8 was released 77 days after Claude Fable 5.1 192.5".
    facts: [
      matched === point
        ? `${point.score.toFixed(1)} set the frontier on ${formatDate(point.releaseDate)}`
        : {
            before: `${point.score.toFixed(1)} was released ${dayCount(days)} after`,
            model: { name: matched.name, logo: providerLogo(matched.provider) },
            after: matched.score.toFixed(1),
          },
    ],
  };
}

/** A row's value: how many days its model shipped after the record it passes, or "Frontier" for a model that set one. */
function daysAfter({ point, matched, days }: Lookback): string {
  return matched === point ? "Frontier" : dayCount(days);
}

function dayCount(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
