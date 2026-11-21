"use client";

/** Lookback: for the strongest models on the Timeline's Intelligence Index, and any the find field brings in, the newest frontier record each one surpasses and how long before its release that record was set, drawn from the record's release to the model's own. */

import { scaleUtc } from "d3-scale";
import { type CSSProperties, useId, useState } from "react";

import { providerChartColor, providerLogo } from "../../shared/provider-theme";
import { TOP_MODELS } from "../chart-data";
import {
  ChartFind,
  chartFindTargets,
  foundModelsPhrase,
  lastLocated,
  termTargets,
  useChartFind,
} from "../ChartFind";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { FigureRegion } from "../FigureRegion";
import { AxisReading, usePick } from "../plot/Interaction";
import { plotBoundsFor, rowChartMargin, RowLabel, StarMark, XAxisTicks } from "../plot/Primitives";
import { MUTED_STAR_GLOW, type SkyPlotStar } from "../plot/sky-renderer";
import { SkyFigure } from "../plot/SkyFigure";
import type { TimelinePoint } from "../timeline/chart-data";
import { coverageFrontier } from "../timeline/frontier";
import {
  timelinePointModelId,
  timelineSearchDocument,
  timelineSuggestionRow,
} from "../timeline/Panel";
import { useTimelineData } from "../timeline/use-timeline-data";
import { useChartLayout } from "../use-chart-layout";

import graphs from "../graphs.module.css";
import timeline from "../timeline/timeline.module.css";

const DAY_MS = 86_400_000;
const ROW_HEIGHT = 28;
// The note type is 10px mono, about this wide per character, which decides which side of its star a note fits on.
const NOTE_CHAR_WIDTH = 6.1;
// Mono type is about 0.6em per character: a pointer's 13px date reading and an 11px month label, which decides when one would cover the other.
const READING_CHAR_WIDTH = 7.8;
const LABEL_CHAR_WIDTH = 6.6;

type Lookback = {
  point: TimelinePoint;
  /** The newest record released by the point's release whose score it matches or beats: the point itself when it set the frontier. */
  matched: TimelinePoint;
  days: number;
};
type Anchor = "start" | "middle" | "end";

export function LookbackPanel() {
  const { data, error, retry } = useTimelineData<TimelinePoint[]>(
    "/api/timeline?view=chart",
    "Unable to load Timeline.",
  );
  const points = data ?? [];
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = usePick<string>();
  const trailId = useId();
  const layout = useChartLayout(1120);
  const { width, compact } = layout;
  // Records need the Timeline's evidence support, so they are the Timeline's own frontier.
  const records = coverageFrontier(points);
  const matchedRecord = (point: TimelinePoint) =>
    records
      .filter((record) => record.releaseDate <= point.releaseDate && record.score <= point.score)
      .at(-1);
  // A model under the first record surpasses none, so it has no place here and the find field does not offer it.
  const placeable = points.filter((point) => matchedRecord(point) != null);
  const documents = placeable.map(timelineSearchDocument);
  const [find, setFind] = useChartFind(
    "lookback-find",
    documents,
    timelineSuggestionRow,
    timelinePointModelId,
  );
  const targets = chartFindTargets(find, documents, timelineSuggestionRow);
  const matches = targets == null ? null : new Set(targets.map((point) => point.id));
  const strongest = [...placeable].sort((a, b) => b.score - a.score).slice(0, TOP_MODELS);
  const found = placeable.filter(
    (point) => find.located.has(point.id) && !strongest.includes(point),
  );
  const lookbacks: Lookback[] = [...strongest, ...found]
    .sort((a, b) => b.score - a.score)
    .map((point) => {
      const matched = matchedRecord(point)!;
      return { point, matched, days: Math.round((released(point) - released(matched)) / DAY_MS) };
    });
  const foundPhrase = foundModelsPhrase(found.length);

  const margin = rowChartMargin(compact);
  const height = margin.top + lookbacks.length * ROW_HEIGHT + margin.bottom;
  const bounds = plotBoundsFor(width, height, margin);
  const first = Math.min(...lookbacks.map(({ matched }) => released(matched)));
  const last = Math.max(...lookbacks.map(({ point }) => released(point)));
  const x = scaleUtc()
    .domain([new Date(first), new Date(last)])
    .range([bounds.left + 16, Math.max(bounds.left + 17, bounds.right - 16)]);
  const at = (point: TimelinePoint) => x(new Date(point.releaseDate));
  // Only month lines stand at rest; the pointer's guides read exact dates.
  const axis = monthAxis(first, last, compact ? 4 : 8);
  const rowY = (index: number) => margin.top + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  // The row under the pointer, else the one a click or tap holds, as in Effort and Duels.
  const pointedId = hovered ?? picked;
  const pointed = lookbacks.find(({ point }) => point.id === pointedId);
  // A pointed row quiets every other; with none pointed, a query in the find field quiets the rows it does not name, as in Duels.
  const dimmed = (id: string) =>
    pointed != null ? pointed.point.id !== id : matches != null && !matches.has(id);
  // Every note names the record it surpasses, or, on a plot too narrow for the longest of them, none does and the readout names it.
  const naming = lookbacks.every(
    (lookback) => noteText(lookback, true).length * NOTE_CHAR_WIDTH <= bounds.right - bounds.left,
  );
  // Plain stars keep their bare-panel size, so a model's star never outsizes a frontier setter's rayed one.
  const stars: SkyPlotStar[] = lookbacks.flatMap(({ point, matched }, index) => {
    const own: SkyPlotStar = {
      key: point.id,
      x: at(point),
      y: rowY(index),
      color: providerChartColor(point.provider),
      // A model that set the frontier carries its rays.
      role: matched === point ? "frontier" : "star",
      glow: dimmed(point.id) ? MUTED_STAR_GLOW : 1,
    };
    if (matched === point) return [own];
    return [
      {
        key: `${point.id}:matched`,
        x: at(matched),
        y: rowY(index),
        color: providerChartColor(matched.provider),
        role: "star",
        // The record the model surpasses is a dimmed star, so the past reads behind the model's own.
        glow: MUTED_STAR_GLOW,
      },
      own,
    ];
  });
  // Until a row is pointed at, the readout names the model found last, else the longest wait, the chart's widest gap.
  const foundLast = lastLocated(find.located);
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
          key: end.id,
          x: at(end),
          date: readingFormat.format(new Date(end.releaseDate)),
        }));
  const [earlier, later] = ends;
  const crowded =
    earlier != null &&
    later != null &&
    overlaps(
      axisSpan(earlier.x, earlier.date, "middle", READING_CHAR_WIDTH),
      axisSpan(later.x, later.date, "middle", READING_CHAR_WIDTH),
    );
  const guides = ends.map((end) => {
    const anchor: Anchor = !crowded ? "middle" : end === earlier ? "end" : "start";
    return {
      ...end,
      anchor,
      readingX: end.x + (anchor === "start" ? 4 : anchor === "end" ? -4 : 0),
    };
  });

  return (
    <FigureRegion
      id="timeline"
      capture={{ title: "Frontier lookback", fileName: "model-atlas-lookback" }}
      top={
        data == null ? null : (
          <ChartFind
            label="Bring models into the Lookback chart"
            find={find}
            documents={documents}
            describe={timelineSuggestionRow}
            onChange={setFind}
            nothingFound={(term) =>
              termTargets(term, points.map(timelineSearchDocument), timelineSuggestionRow).length >
              0
                ? "It scores below the earliest frontier record, so it surpasses none."
                : "No Timeline model matches."
            }
          />
        )
      }
      caption={
        lookbacks.length === 0 ? null : (
          <p>
            {`Compare each of the top ${strongest.length} models by Intelligence${foundPhrase == null ? "" : `, ${foundPhrase},`} against the previous frontier it surpasses at its release.`}
          </p>
        )
      }
    >
      {data == null || lookbacks.length === 0 ? (
        <div className={timeline.loading} role="status">
          {data != null ? "No Timeline model surpasses a record." : error || "Loading Timeline…"}
          {error && data == null ? <button onClick={retry}>Retry</button> : null}
        </div>
      ) : (
        <>
          <ChartReadout
            label="Lookback details"
            sentence
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
              const located = find.located.get(point.id);
              return located == null ? [] : [{ key: point.id, at: located }];
            })}
            label="Days each model shipped after the frontier record it surpasses"
            onLeave={() => setHovered(null)}
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
              // A month label a date reading would overlap gives way to it, rather than peeking out around the reading's backdrop.
              format={(tick) =>
                guides.some((guide) =>
                  overlaps(
                    axisSpan(guide.readingX, guide.date, guide.anchor, READING_CHAR_WIDTH),
                    axisSpan(x(new Date(tick)), axis.label(tick), "middle", LABEL_CHAR_WIDTH),
                  ),
                )
                  ? ""
                  : axis.label(tick)
              }
              keyPrefix="lookback"
              // A year-bearing label beside a bare month needs about this much between their centres.
              labelMinGap={45}
            />
            {pointed == null ? null : (
              <g
                className={graphs.cursorProjection}
                style={
                  {
                    "--projection-color": providerChartColor(pointed.point.provider),
                  } as CSSProperties
                }
              >
                {guides.map((guide) => (
                  <g key={guide.key}>
                    <line
                      x1={guide.x}
                      x2={guide.x}
                      y1={rowY(lookbacks.indexOf(pointed))}
                      y2={bounds.bottom}
                    />
                    <AxisReading
                      x={guide.readingX}
                      y={bounds.bottom + 24}
                      textAnchor={guide.anchor}
                    >
                      {guide.date}
                    </AxisReading>
                  </g>
                ))}
              </g>
            )}
            {lookbacks.map((lookback, index) => {
              const { point, matched, days } = lookback;
              const y = rowY(index);
              const from = at(matched);
              const to = at(point);
              const quiet = dimmed(point.id);
              const note = noteText(lookback, naming);
              // The note sits right of the record's star, or left of it when the plot ends first, and never past the plot's left edge.
              const noteWidth = note.length * NOTE_CHAR_WIDTH;
              const noteX =
                from + 7 + noteWidth <= bounds.right
                  ? from + 7
                  : Math.max(bounds.left, from - 7 - noteWidth);
              return (
                <g key={point.id}>
                  <RowLabel y={y} name={point.name} provider={point.provider} dimmed={quiet} />
                  {matched === point ? null : (
                    <g opacity={quiet ? 0.35 : 1}>
                      {/* The dashboard's trail, a hairline brightening into the model's lab colour at its star, here starting at the matched record's dim light instead of nothing, since that end is a release rather than a scale's zero. */}
                      <linearGradient
                        id={`${trailId}-${index}`}
                        gradientUnits="userSpaceOnUse"
                        x1={from}
                        x2={to}
                        y1={y}
                        y2={y}
                      >
                        <stop
                          offset={0}
                          stopColor={providerChartColor(point.provider)}
                          stopOpacity={MUTED_STAR_GLOW}
                        />
                        <stop offset={1} stopColor={providerChartColor(point.provider)} />
                      </linearGradient>
                      <line stroke={`url(#${trailId}-${index})`} x1={from} x2={to} y1={y} y2={y} />
                      <StarMark cx={from} cy={y} provider={matched.provider} />
                    </g>
                  )}
                  <text className={graphs.plotNote} x={noteX} y={y - 6} opacity={quiet ? 0.35 : 1}>
                    {note}
                  </text>
                  <StarMark cx={to} cy={y} provider={point.provider} />
                  <text
                    className={graphs.plotValue}
                    x={width}
                    y={y}
                    dy="0.34em"
                    textAnchor="end"
                    opacity={quiet ? 0.4 : 1}
                  >
                    {matched === point ? "Frontier" : dayCount(days)}
                  </text>
                  <rect
                    className={graphs.hit}
                    x={0}
                    y={y - ROW_HEIGHT / 2}
                    width={width}
                    height={ROW_HEIGHT}
                    data-keeps-pick
                    onPointerMove={() => setHovered(point.id)}
                    onClick={() => setPicked(point.id)}
                  />
                </g>
              );
            })}
          </SkyFigure>
        </>
      )}
    </FigureRegion>
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

/** The x range `text` covers on the axis, anchored as SVG anchors it, with room for a reading's backdrop either side. */
function axisSpan(x: number, text: string, anchor: Anchor, charWidth: number): [number, number] {
  const width = text.length * charWidth;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return [left - 6, left + width + 6];
}

function overlaps([left, right]: [number, number], [otherLeft, otherRight]: [number, number]) {
  return left < otherRight && otherLeft < right;
}

/** A row's note: the score it rose from and to, "Claude Fable 5.1 192.5 → 194.8" when `named`, or a frontier setter's own score. */
function noteText({ point, matched }: Lookback, named: boolean): string {
  const after = point.score.toFixed(1);
  if (matched === point) return after;
  const rise = `${matched.score.toFixed(1)} → ${after}`;
  return named ? `${matched.name} ${rise}` : rise;
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
