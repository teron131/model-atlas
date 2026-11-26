"use client";

/** Duels: the strongest models, and any the find field brings in, ranked by their duels with each other, where a duel goes to the model that leads on more of the Intelligence benchmarks both report, each with its move from its Intelligence place; beside them the pointed duel, or the first of the model found last or else of the top model, benchmark by benchmark as the lead the model sheet's Compare shows. */

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { BenchmarkDomain } from "../../../../src/model-atlas/benchmarks/catalog";
import { medianOfFinite } from "../../../../src/model-atlas/math-utils";
import { providerChartColor, providerLogo } from "../../shared/provider-theme";
import {
  type ChartBenchmark,
  type ChartData,
  type ChartRow,
  findDocuments,
  findId,
  findSuggestion,
  NOTHING_FOUND,
  TOP_MODELS,
  topAndFound,
} from "../chart-data";
import {
  ChartFind,
  chartFindMatches,
  foundModelsPhrase,
  lastLocated,
  useChartFind,
} from "../ChartFind";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { FigureRegion } from "../FigureRegion";
import { usePick } from "../plot/Interaction";
import { CHART_WIDTH, StarMark } from "../plot/Primitives";
import { DOMAIN_TILE, DomainTile, RowLabel } from "../plot/RowChart";
import { MUTED_STAR_GLOW, type SkyPlotStar } from "../plot/sky-renderer";
import { SkyFigure } from "../plot/SkyFigure";
import { useChartLayout } from "../use-chart-layout";
import {
  type Duel,
  duelKey,
  duelStandings,
  firstDuel,
  type Lead,
  margin,
  MIN_SHARED,
  outcome,
  type Standing,
} from "./standings";

import graphs from "../graphs.module.css";
import styles from "./duels.module.css";

const CAPTURE = { title: "Head to head", fileName: "model-atlas-duels" };
// The notes over the bout, and the least room over the standings.
const HEAD = 24;
// Each opponent's lab logo stands over its dot column with its name read upward above it, and the move column's heading beside them starts level with the names: a generous mean width of the names' characters, the gap under the logos, the logo's size at most, as a row's, and the gap between logo and name.
const COLUMN = { perChar: 6.2, gap: 8, logo: 14, logoGap: 4 };
const MOVE_HEADING = "vs Intelligence rank";
// A standings row's height side by side with the bout, and stacked above it.
const ROW = { full: 44, stacked: 40, twoLine: 54 };
// Where the dots beside a name would be narrower than side by side, as on a phone, a row takes two lines: its name, record, and move, then its dots across the full width. These are the two lines' centres and where the dots' taps begin.
const TWO_LINE = { text: 16, dots: 38, hitTop: 26 };
// Inside a standings row: the room before its logo and after its move, and the move's column.
const PAD = 8;
const SHIFT = 26;
// A row's name column is its logo's room plus this much per character of the longest name, a generous mean for the names' face, so the record after it clears every name.
const NAME = { logo: 22, perChar: 7 };
// The record's column, from the name's end to the record's right edge, and the gap before the dots.
const RECORD = { width: 48, gap: 14 };
// Each opponent's dot holds a slot in the standings' order, so a slot is the same opponent in every row and the model's own, left empty, falls on the diagonal. Side by side the slots take what the bout leaves them, from the least up to full, and below the least the bout stacks under the standings; stacked, they share the row's width up to the widest.
const SLOT = { least: 24, full: 30, widest: 32 };
// Side by side, every bout spans the standings' full height, so the plot holds still from one duel to the next and ends level with the standings; stacked, a bout opened under its row takes only its rows' height, up to this. Either way a row of the bout takes up to `BOUT_ROW`, and a long duel's rows sit closer.
const BOUT_BOX = TOP_MODELS * ROW.full;
const BOUT_ROW = 30;
// A bar's thickness, a share of its row up to the most.
const BAR = { share: 0.4, most: 10 };
// A bout's benchmark names sit against its centre with the bars beyond them: the gaps from the centre to the chip, the chip to the name, and the name to the bar, and a generous mean width of the names' monospaced characters.
const LABEL = { axisGap: 6, chipGap: 5, perChar: 6.8, barGap: 8 };
// A bar's own model's result reads between its benchmark's name and the bar, in the caption's mono about this wide per character, this far from the bar; where that would leave the longest bar shorter than `least`, as on a phone, it reads under the name instead.
const RESULT = { perChar: 6.6, gap: 6, least: 40 };
// Room past a bar's end for its lead, up to "−100.0".
const LEAD_ROOM = 44;
const GUTTER = 48;
// The least width the bout keeps beside the standings, and how far a stacked duel opened under its row sits from the rows around it.
const LEAST_BOUT = 360;
const INLINE_GAP = 8;
// A win's star shows its margin, the benchmarks won less those lost over all decided: a narrow win is small and faint, though still clearly a star beside an empty lost slot, and from `rays` up a rout carries a frontier star's rays at its own size, so plain stars stop at `scale.most` and never outsize it. The SVG core grows across the whole range.
const MARGIN = {
  rays: 0.7,
  glow: 0.5,
  scale: { least: 0.7, most: 1 },
  core: { least: 2.5, most: 4 },
};

type Pointed = { row: string; opponent: string };
/** Where the stacked rows sit at a render, which the next compares to hold the rows in view still. */
type Placement = { open: string | null; order: string; rowHeight: number; tops: number[] };

export const DuelsPanel = memo(function DuelsPanel({ data }: { data: ChartData }) {
  const [hovered, setHovered] = useState<Pointed | null>(null);
  const documents = useMemo(() => findDocuments(data.rows), [data.rows]);
  const [find, setFind] = useChartFind("duels-find", documents, findSuggestion, findId);
  const layout = useChartLayout(CHART_WIDTH);
  const { width, compact } = layout;
  const ranked = useMemo(
    () => [...data.rows].sort((a, b) => b.intelligence - a.intelligence),
    [data.rows],
  );
  const { top: strongest, found } = useMemo(
    () => topAndFound(ranked, (row) => find.located.has(row.key)),
    [ranked, find.located],
  );
  const standings = useMemo(
    () => duelStandings([...strongest, ...found], data.benchmarks),
    [strongest, found, data.benchmarks],
  );
  const count = standings.length;
  const foundPhrase = foundModelsPhrase(found.length);
  const matches = useMemo(
    () => chartFindMatches(find, documents, findSuggestion, (row) => row.key),
    [find, documents],
  );
  const duels = standings.flatMap((standing) => [...standing.duels.values()]);

  const nameEnd =
    PAD + NAME.logo + Math.max(0, ...standings.map(({ row }) => row.name.length)) * NAME.perChar;
  const recordRight = nameEnd + RECORD.width;
  const dotsLeft = recordRight + RECORD.gap;
  const sideSlot = Math.min(
    SLOT.full,
    (width - GUTTER - LEAST_BOUT - dotsLeft - SHIFT - PAD) / Math.max(1, count),
  );
  const stacked = compact || sideSlot < SLOT.least;
  // A clicked duel holds until a click lands elsewhere, which brings back the resting duel: side by side in the bout, stacked open beneath its row.
  const [picked, setPicked] = usePick<Pointed>();
  const duelOf = (pointed: Pointed | null) =>
    pointed == null
      ? undefined
      : standings.find((standing) => standing.row.key === pointed.row)?.duels.get(pointed.opponent);
  // At rest the bout shows the model found last, or else the top model, against its strongest opponent by Intelligence.
  const foundLast = lastLocated(find.located);
  const shown = standings.find((standing) => standing.row.key === foundLast) ?? standings[0];
  const rest = shown == null ? undefined : firstDuel(shown, standings);
  // The readout names the hovered duel, else the picked one, else the resting one; stacked, the open duel is the same but for hovering, since opening a duel under the pointer would move the rows beneath.
  const pointed = duelOf(hovered) ?? duelOf(picked) ?? rest;
  const openDuel = stacked ? (duelOf(picked) ?? rest) : undefined;
  const openIndex = standings.findIndex((standing) => standing.row === openDuel?.row);
  const opening = openDuel == null ? 0 : boutHeight(openDuel) + 2 * INLINE_GAP;
  // The duel whose row and column light, as the evidence table's hover does: the hovered one, or side by side the one the bout shows; stacked, the open duel already sits under its row, so nothing lights at rest.
  const litDuel = duelOf(hovered) ?? (stacked ? undefined : pointed);
  const slots = (start: number) =>
    Math.min(SLOT.widest, (width - PAD - SHIFT - start) / Math.max(1, count));
  const twoLine = stacked && slots(dotsLeft) < SLOT.least;
  const dotsStart = twoLine ? PAD : dotsLeft;
  const slot = stacked ? slots(dotsStart) : sideSlot;
  const shiftRight = dotsStart + count * slot + SHIFT;
  const slotX = (column: number) => dotsStart + (column + 0.5) * slot;
  const columns = new Map(standings.map((standing, column) => [standing.row, column]));
  const columnX = (row: ChartRow) => slotX(columns.get(row)!);
  // On two lines the record ends where the dots under it end, beside the move.
  const recordX = twoLine ? shiftRight - SHIFT : recordRight;
  const side = stacked ? width : shiftRight + PAD;
  const rowHeight = twoLine ? ROW.twoLine : stacked ? ROW.stacked : ROW.full;
  const heads = [
    ...standings.map((standing, column) => ({
      key: standing.row.key,
      x: slotX(column),
      text: standing.row.name,
      logo: providerLogo(standing.row.provider),
      lit: litDuel?.opponent === standing.row,
    })),
    // The moves are right-aligned, so their heading stands over their middle.
    { key: "move", x: shiftRight - 7, text: MOVE_HEADING, logo: null, lit: false },
  ];
  // A narrow phone's slots shrink the logos to keep a gap between them.
  const logo = Math.min(COLUMN.logo, slot - 2);
  const nameBase = COLUMN.gap + logo + COLUMN.logoGap;
  // On two lines the dot columns start at the left edge, so the record's heading takes its own line over their names.
  const top =
    Math.max(
      HEAD,
      nameBase + COLUMN.gap + Math.max(...heads.map(({ text }) => text.length)) * COLUMN.perChar,
    ) + (twoLine ? HEAD : 0);
  // The room a stacked row's open duel takes under it.
  const below = (index: number) => (index === openIndex ? opening : 0);
  const rowTops = standings.reduce<number[]>(
    (tops, _, index) => [
      ...tops,
      index === 0 ? top : tops[index - 1]! + rowHeight + below(index - 1),
    ],
    [],
  );
  const rowY = (index: number) => rowTops[index]!;
  const standingsBottom = count === 0 ? top : rowY(count - 1) + rowHeight + below(count - 1);
  const held = useHeldRows({
    open: openDuel == null ? null : duelKey(openDuel),
    order: standings.map((standing) => standing.row.key).join(),
    rowHeight,
    tops: rowTops,
  });
  const bouts = stacked
    ? openDuel == null
      ? []
      : [
          {
            duel: openDuel,
            left: 0,
            top: rowY(openIndex) + rowHeight + INLINE_GAP,
            width,
            box: BOUT_BOX,
          },
        ]
    : pointed == null
      ? []
      : [
          {
            duel: pointed,
            left: side + GUTTER,
            top: 0,
            width: width - side - GUTTER,
            box: standingsBottom - HEAD,
          },
        ];
  const height = standingsBottom + 8;
  const names =
    LABEL.axisGap +
    DOMAIN_TILE.size +
    LABEL.chipGap +
    LABEL.barGap +
    Math.max(
      0,
      ...duels.flatMap((duel) => duel.leads.map(({ benchmark }) => benchmark.columnLabel.length)),
    ) *
      LABEL.perChar;

  const textY = (index: number) => rowY(index) + (twoLine ? TWO_LINE.text : rowHeight / 2);
  const dotY = (index: number) => rowY(index) + (twoLine ? TWO_LINE.dots : rowHeight / 2);
  // The lit column runs down the rows, broken where the open duel lies across it.
  const columnRuns: { top: number; bottom: number }[] = [];
  let runTop = top;
  standings.forEach((_, index) => {
    if (below(index) === 0 && index < count - 1) return;
    columnRuns.push({ top: runTop, bottom: rowY(index) + rowHeight });
    runTop = rowY(index) + rowHeight + below(index);
  });

  // While the find field holds a query, the rows it does not name dim.
  const dimmed = (standing: Standing) => matches != null && !matches.has(standing.row.key);

  const stars: SkyPlotStar[] = standings.flatMap((standing, index) =>
    [...standing.duels.values()].flatMap((duel) => {
      if (outcome(duel) !== "won") return [];
      const decisive = margin(duel);
      const rout = decisive >= MARGIN.rays;
      // How far a plain star has grown toward a rout's.
      const growth = Math.min(1, decisive / MARGIN.rays);
      return [
        {
          key: duelKey(duel),
          x: columnX(duel.opponent),
          y: dotY(index),
          color: providerChartColor(standing.row.provider),
          role: rout ? ("frontier" as const) : ("star" as const),
          glow:
            (dimmed(standing) ? MUTED_STAR_GLOW : 1) *
            (rout ? 1 : MARGIN.glow + (1 - MARGIN.glow) * growth),
          scale: rout
            ? undefined
            : MARGIN.scale.least + (MARGIN.scale.most - MARGIN.scale.least) * growth,
        },
      ];
    }),
  );

  if (data.rows.length === 0)
    return (
      <FigureRegion id="leaderboard" capture={CAPTURE}>
        <p className={graphs.emptyChart} role="status">
          {NOTHING_FOUND}
        </p>
      </FigureRegion>
    );
  return (
    <FigureRegion
      id="leaderboard"
      capture={CAPTURE}
      top={
        <>
          <ChartReadout
            label="Duel details"
            factRows={2}
            sentence
            entry={pointed == null ? null : duelEntry(pointed)}
          />
          <ChartFind
            label="Bring models into the duels"
            find={find}
            documents={documents}
            describe={findSuggestion}
            onChange={setFind}
            nothingFound={() => NOTHING_FOUND}
          />
        </>
      }
      caption={
        <p>
          {`Compare the top ${strongest.length} models by Intelligence${foundPhrase == null ? "" : `, ${foundPhrase},`} head to head: a duel goes to the model that leads on more of the Intelligence benchmarks both report; pairs sharing fewer than ${MIN_SHARED} have none.`}
        </p>
      }
    >
      <SkyFigure
        layout={layout}
        height={height}
        bounds={{ left: 0, right: width, top: 0, bottom: height }}
        sky={false}
        stars={stars}
        flare={pointed == null || outcome(pointed) !== "won" ? null : duelKey(pointed)}
        found={standings.flatMap((standing) => {
          const at = find.located.get(standing.row.key);
          return at == null
            ? []
            : [...standing.duels.values()].flatMap((duel) =>
                outcome(duel) === "won" ? [{ key: duelKey(duel), at }] : [],
              );
        })}
        label={`Duel records of ${count} models, and one duel's lead on each benchmark`}
        onLeave={() => setHovered(null)}
      >
        {/* The lit duel's opponent column lights as well as its row, so the dot reads where the two cross. */}
        {litDuel == null
          ? null
          : columnRuns.map((run) => (
              <rect
                key={run.top}
                className={styles.row}
                x={dotsStart + columns.get(litDuel.opponent)! * slot}
                y={run.top}
                width={slot}
                height={run.bottom - run.top}
              />
            ))}
        <text className={graphs.plotNote} x={PAD} y={twoLine ? HEAD / 2 : top - COLUMN.gap}>
          {`Record against the other ${Math.max(0, count - 1)}`}
        </text>
        {heads.map(({ key, x, text, logo: href, lit }) => (
          <g key={key}>
            {href ? (
              <image
                href={href}
                x={x - logo / 2}
                y={top - COLUMN.gap - logo}
                width={logo}
                height={logo}
              />
            ) : null}
            <text
              className={`${graphs.plotNote} ${styles.column}`}
              data-pointed={lit || undefined}
              x={x}
              y={top - nameBase}
              dy="0.34em"
              transform={`rotate(-90 ${x} ${top - nameBase})`}
            >
              {text}
            </text>
          </g>
        ))}
        {standings.map((standing, index) => {
          const y = textY(index);
          const dots = dotY(index);
          const shift = standing.place - index;
          return (
            <g key={standing.row.key}>
              {litDuel?.row === standing.row ? (
                <rect
                  className={styles.row}
                  x={0}
                  y={rowY(index)}
                  width={side}
                  height={rowHeight}
                />
              ) : null}
              {/* A rule closes each row, under its duel when that is open. */}
              <line
                className={styles.rule}
                x1={0}
                x2={side}
                y1={rowY(index) + rowHeight + below(index) - 0.5}
                y2={rowY(index) + rowHeight + below(index) - 0.5}
              />
              <g transform={`translate(${PAD} 0)`}>
                <RowLabel
                  y={y}
                  name={standing.row.name}
                  provider={standing.row.provider}
                  dimmed={dimmed(standing)}
                />
              </g>
              <text
                className={graphs.plotValue}
                x={recordX}
                y={y}
                dy="0.34em"
                textAnchor="end"
                opacity={dimmed(standing) ? 0.4 : 1}
              >
                {standing.draws > 0
                  ? `${standing.wins} – ${standing.losses} – ${standing.draws}`
                  : `${standing.wins} – ${standing.losses}`}
              </text>
              {shift === 0 ? null : (
                <text
                  className={styles.shift}
                  data-direction={shift > 0 ? "up" : "down"}
                  x={shiftRight}
                  y={y}
                  dy="0.34em"
                  textAnchor="end"
                >
                  {`${shift > 0 ? "↑" : "↓"}${Math.abs(shift)}`}
                </text>
              )}
              <g opacity={dimmed(standing) ? 0.4 : 1}>
                {/* A lost duel leaves its slot empty, since the winner's row already holds its star. */}
                {[...standing.duels.values()].map((duel) => {
                  const x = columnX(duel.opponent);
                  switch (outcome(duel)) {
                    case "won":
                      return (
                        <StarMark
                          key={duelKey(duel)}
                          cx={x}
                          cy={dots}
                          provider={standing.row.provider}
                          radius={
                            MARGIN.core.least +
                            (MARGIN.core.most - MARGIN.core.least) * margin(duel)
                          }
                        />
                      );
                    case "drawn":
                      return (
                        <circle
                          key={duelKey(duel)}
                          className={styles.draw}
                          cx={x}
                          cy={dots}
                          r={1.5}
                        />
                      );
                    case "lost":
                      return null;
                  }
                })}
              </g>
            </g>
          );
        })}
        {/* Every slot holds a hit, its own and unplayed ones inert, so the pointer crosses the dots without a gap and leaving them returns the bout to the held or resting duel. */}
        <g ref={held.hits} onPointerLeave={() => setHovered(null)}>
          {standings.map((standing, index) =>
            standings.map((opponent, column) => {
              const duel = standing.duels.get(opponent.row.key);
              const area = {
                x: dotsStart + column * slot,
                y: rowY(index) + (twoLine ? TWO_LINE.hitTop : 0),
                width: slot,
                height: rowHeight - (twoLine ? TWO_LINE.hitTop : 0),
              };
              if (duel == null)
                return (
                  <rect
                    key={`${standing.row.key}|${opponent.row.key}`}
                    {...area}
                    fill="transparent"
                  />
                );
              const point = { row: standing.row.key, opponent: opponent.row.key };
              return (
                <rect
                  key={duelKey(duel)}
                  className={graphs.hit}
                  {...area}
                  data-keeps-pick
                  onPointerEnter={() => setHovered(point)}
                  onClick={() => {
                    if (stacked) held.tap(index);
                    setPicked(point);
                  }}
                />
              );
            }),
          )}
        </g>
        {bouts.map((bout) => (
          <g key={duelKey(bout.duel)} data-keeps-pick>
            <Bout {...bout} names={names} />
          </g>
        ))}
      </SkyFigure>
    </FigureRegion>
  );
});

/** Stacked, the open duel's room moves every row beneath it, so when another opens the page scrolls as far as the rows in view would move and they hold still: the tapped row, else the first row on screen; with every row above the screen, the browser's scroll anchoring already holds the page beneath. `hits` goes on the rows' hit group, whose place on screen finds the rows in view, and `tap` names the row a tap opens. */
function useHeldRows(now: Placement) {
  const hits = useRef<SVGGElement>(null);
  const tapped = useRef<number | null>(null);
  const placed = useRef<Placement | null>(null);
  useLayoutEffect(() => {
    const before = placed.current;
    placed.current = now;
    const row = tapped.current;
    tapped.current = null;
    const screen = hits.current?.getScreenCTM();
    if (
      before == null ||
      screen == null ||
      before.open === now.open ||
      before.order !== now.order ||
      before.rowHeight !== now.rowHeight
    )
      return;
    const anchor = row ?? before.tops.findIndex((rowTop) => screen.f + screen.d * rowTop >= 0);
    const shift = anchor < 0 ? 0 : now.tops[anchor]! - before.tops[anchor]!;
    if (shift !== 0) window.scrollBy({ top: screen.d * shift, behavior: "instant" });
  });
  return {
    hits,
    tap: (row: number) => {
      tapped.current = row;
    },
  };
}

/** The pointed duel as two lists meeting at the centre, each model's leads on its own side under its logo and name, largest first, so each side's length is its score: a benchmark's chip and name against the centre, then a bar as long as the lead. The duel is scaled to its own longest lead, so its bars fill the bout whichever duel is pointed; beside each name that side's model's result reads as Compare prints it, and past each bar its lead reads as that side's margin. */
function Bout({
  duel,
  left,
  top,
  width,
  box,
  names,
}: {
  duel: Duel;
  left: number;
  top: number;
  width: number;
  /** The height the bout's rows share at most. */
  box: number;
  names: number;
}) {
  const spine = left + width / 2;
  const longest = Math.max(1, ...duel.leads.map(({ points }) => Math.abs(points)));
  const resultRoom =
    RESULT.gap +
    Math.max(
      ...duel.leads
        .flatMap((lead) => [lead.own, lead.theirs])
        .map((value) => value.toFixed(1).length),
    ) *
      RESULT.perChar;
  const inline = width / 2 - names - resultRoom - LEAD_ROOM >= RESULT.least;
  const perPoint = Math.max(0, width / 2 - names - (inline ? resultRoom : 0) - LEAD_ROOM) / longest;
  const { rows, step } = boutRows(duel, box);
  const tile = Math.min(DOMAIN_TILE.size, step - 2);
  const thickness = Math.min(BAR.most, step * BAR.share);
  const rowY = (index: number) => top + HEAD + (index + 0.5) * step;
  const side = (model: ChartRow, leads: Lead[], right: boolean, result: (lead: Lead) => number) => {
    const fill = providerChartColor(model.provider);
    const logo = providerLogo(model.provider);
    const anchor = right ? "start" : "end";
    const chip = right ? spine + LABEL.axisGap : spine - LABEL.axisGap - tile;
    const name = right ? chip + tile + LABEL.chipGap : chip - LABEL.chipGap;
    // Inline, the results' column starts where the names end and the bar where that column ends; otherwise the bar starts where the names end.
    const column = right ? spine + names : spine - names;
    const base = !inline ? column : right ? column + resultRoom : column - resultRoom;
    return (
      <g>
        {/* The model heads its list against the centre, its logo where its benchmarks' chips sit and its name where theirs do. */}
        {logo ? (
          <image href={logo} x={chip} y={top + 12 - tile / 2 - 3} width={tile} height={tile} />
        ) : null}
        <text className={graphs.plotNote} x={name} y={top + 12} textAnchor={anchor}>
          {model.name}
        </text>
        {leads.map((lead, index) => {
          const y = rowY(index);
          const length = Math.abs(lead.points) * perPoint;
          return (
            <g key={lead.benchmark.key}>
              <DomainTile
                domain={topDomain(lead.benchmark)}
                x={chip}
                y={y - tile / 2}
                size={tile}
              />
              <text
                className={graphs.axisLabel}
                x={name}
                y={inline ? y : y - 6}
                dy="0.34em"
                textAnchor={anchor}
              >
                {lead.benchmark.columnLabel}
              </text>
              <text
                className={graphs.plotValue}
                x={inline ? column : name}
                y={inline ? y : y + 8}
                dy="0.34em"
                textAnchor={anchor}
              >
                {result(lead).toFixed(1)}
              </text>
              <rect
                x={right ? base : base - length}
                y={y - thickness / 2}
                width={length}
                height={thickness}
                rx={1}
                style={{ fill }}
              />
              <text
                className={graphs.plotValue}
                x={right ? base + length + 6 : base - length - 6}
                y={y}
                dy="0.34em"
                textAnchor={anchor}
              >
                {formatLead(Math.abs(lead.points))}
              </text>
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <g>
      {/* The duel's whole area keeps the pick, so a click between its bars is not a click elsewhere. */}
      <rect x={left} y={top} width={width} height={HEAD + rows * step} fill="transparent" />
      <line
        className={graphs.rowRule}
        x1={spine}
        x2={spine}
        y1={top + HEAD}
        y2={top + HEAD + rows * step}
      />
      {/* The row's model takes the left, as the readout names it first, and its opponent the right, each beside its own results. */}
      {side(duel.row, duel.ahead, false, ({ own }) => own)}
      {side(duel.opponent, duel.behind, true, ({ theirs }) => theirs)}
    </g>
  );
}

// A bout's rows, as many as the longer side's leads, each up to `BOUT_ROW` tall and closer in a long duel, so the rows stay within `box`.
function boutRows({ ahead, behind }: Duel, box: number): { rows: number; step: number } {
  const rows = Math.max(1, ahead.length, behind.length);
  return { rows, step: Math.min(BOUT_ROW, box / rows) };
}

// A stacked bout's height, its notes and its rows.
function boutHeight(duel: Duel): number {
  const { rows, step } = boutRows(duel, BOUT_BOX);
  return HEAD + rows * step;
}

// A benchmark labelled with several domains shows the one holding its largest share.
function topDomain(benchmark: ChartBenchmark): BenchmarkDomain {
  return (Object.entries(benchmark.shares) as [BenchmarkDomain, number][]).reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  )[0];
}

// One decimal, as the leaderboard prints results and Compare their gaps.
function formatLead(points: number): string {
  return `${points > 0 ? "+" : points < 0 ? "−" : ""}${Math.abs(points).toFixed(1)}`;
}

/** The duel as one sentence from the row's model's side: its result and the benchmarks each model leads on, worded so the score never runs into a name's version number, then how many they share and the row's model's median lead. */
function duelEntry(duel: Duel): ReadoutEntry {
  const { row, opponent, leads, ahead, behind } = duel;
  // No-break spaces keep the score and the median lead whole when the sentence wraps: "8 – 6", "+6.2 points".
  const score = `${ahead.length} – ${behind.length}`;
  // A duel has at least `MIN_SHARED` leads, so the median exists.
  const middle = medianOfFinite(leads.map(({ points }) => points))!;
  return {
    name: row.name,
    logo: providerLogo(row.provider),
    facts: [
      {
        score: {
          won: `wins ${score} against`,
          lost: `loses ${score} to`,
          drawn: `draws ${score} with`,
        }[outcome(duel)],
        opponent: { name: opponent.name, logo: providerLogo(opponent.provider) },
        detail: `in ${leads.length} shared benchmarks with median ${formatLead(middle)} points`,
      },
    ],
  };
}
