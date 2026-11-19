"use client";

/** Spectra: one column per domain with every leaderboard model as a star placed up it by its standing on the domain's benchmarks, each domain's three best named above it, a pointed model or every found one traced across every domain, and a domain's benchmarks and their weights as a map in a card over its header. */

import { useState } from "react";

import { providerChartColor, providerLogo } from "../../shared/provider-theme";
import { hashUnit } from "../../shared/sky-light";
import { ColumnTooltip, useColumnTooltip } from "../../table/ColumnTooltip";
import {
  type ColumnWeightGroup,
  type DashboardColumnTooltip,
  domainShares,
} from "../../table/tooltips";
import {
  type ChartBenchmark,
  type ChartData,
  type ChartDomain,
  type ChartRow,
  findDocuments,
  findId,
  findSuggestion,
  NOTHING_FOUND,
} from "../chart-data";
import { ChartFind, chartFindTargets, lastLocated, useChartFind } from "../ChartFind";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { FigureRegion } from "../FigureRegion";
import { usePick } from "../plot/Interaction";
import { DomainTile, StarMark } from "../plot/Primitives";
import { MUTED_STAR_GLOW, type SkyPlotStar } from "../plot/sky-renderer";
import { SkyFigure } from "../plot/SkyFigure";
import { useChartLayout } from "../use-chart-layout";

import graphs from "../graphs.module.css";
import styles from "./spectra.module.css";

type Standing = {
  row: ChartRow;
  score: number;
  /** The share of the domain's benchmark weight the model reports, as Atlas measures evidence support. */
  support: number;
  /** Place among the domain's ranked models, those with at least half its weight reported; null below that. */
  rank: number | null;
};
type Pointed = { row: string; domain: string };
type DomainStandings = ChartDomain & {
  /** The benchmarks that count toward the domain, heaviest first, each with its share of the domain's weight. */
  weights: { benchmark: ChartBenchmark; weight: number }[];
  /** Every model with a result in the domain, best first. */
  standings: Standing[];
  /** The ranked models, best first: the podium and every place come from these. */
  ranked: Standing[];
  byRow: Map<string, Standing>;
};

// The strip left of the columns, pinned while a narrow plot scrolls: the benchmark count's row name, the podium's place names, and the two ends of the scale. Its longest name, "Benchmarks" at 59px, keeps a clear gap before the first column's count, and with fifteen columns at their narrowest it fills the widest panel exactly.
const LEFT = 70;
// A column never gets narrower than this, the room the longest domain name or a podium name broken over two lines needs, which also fits all fifteen domains in the widest panel; a narrower host scrolls the plot sideways instead.
const MIN_COLUMN = 70;
// Text starts this far into its column.
const INSET = 4;
// The header's rows: the domain's chip, set down so the plot's first mark sits as far under the readout as Pareto's and the Timeline's, then its name and its benchmark count.
const HEAD = { chip: 14, name: 43, count: 57, height: 70 };
const PLACE_ROW = 48;
const GAP = 14;
const PLOT = { full: 400, compact: 300 };
// A domain's first three places in falling light: each place's label, its star's role and light, and its star's size where the SVG paints it; the models named on the podium all keep full light.
const PODIUM = [
  { label: "1st", role: "leader", glow: 1, radius: 4 },
  { label: "2nd", role: "frontier", glow: 0.9, radius: 3.4 },
  { label: "3rd", role: "frontier", glow: 0.6, radius: 3 },
] as const;
// The podium's three stars take the column's left, middle, and right thirds in an order drawn from the domain, so the best is not always in the middle and tied results never stack.
const PODIUM_THIRDS = [-0.3, 0, 0.3] as const;
const THIRD_ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;
// A star below the podium: its light and its size where the SVG paints it.
const FIELD_GLOW = 0.66;
const FIELD_RADIUS = 2.2;
// Two traced scores in one column closer than this sit on opposite sides of their stars.
const SCORE_HEIGHT = 14;
// A model reporting under half of a domain's weight still has its star there, at this share of a ranked star's light, since its standing rests on part of the domain.
const UNRANKED_LIGHT = 0.45;
const everyDomainHasCard = () => true;

export function SpectraPanel({ data }: { data: ChartData }) {
  const [hovered, setHovered] = useState<Pointed | null>(null);
  // A clicked star or name holds its model.
  const [picked, setPicked] = usePick<Pointed>();
  const pointed = hovered ?? picked;
  const card = useColumnTooltip<string>(everyDomainHasCard);
  const layout = useChartLayout(1120);
  const domains = domainStandings(data);
  const documents = findDocuments(
    data.rows.filter((row) => domains.some((domain) => domain.byRow.has(row.key))),
  );
  const [find, setFind] = useChartFind("spectra-find", documents, findSuggestion, findId);
  const targets = chartFindTargets(find, documents, findSuggestion);
  const matches = targets == null ? null : new Set(targets.map((row) => row.key));
  const column = Math.max(MIN_COLUMN, (layout.width - LEFT) / domains.length);
  const width = LEFT + domains.length * column;
  const plot = layout.compact ? PLOT.compact : PLOT.full;
  const placeTop = (place: number) => HEAD.height + place * PLACE_ROW;
  const plotTop = placeTop(PODIUM.length) + GAP;
  const plotBottom = plotTop + plot;
  const height = plotBottom + 8;
  const bounds = { left: LEFT, right: width, top: plotTop, bottom: plotBottom };
  const marks = domains.flatMap((domain, index) => {
    const order = THIRD_ORDERS[Math.floor(hashUnit(domain.key) * THIRD_ORDERS.length)]!;
    return domain.standings.map((standing, position) => {
      const key = `${domain.key}|${standing.row.key}`;
      const place = podiumPlace(standing);
      const offset =
        place == null
          ? spread(position + 1, key) * 0.42
          : PODIUM_THIRDS[order[place]!]! + (hashUnit(key) * 2 - 1) * 0.08;
      return {
        key,
        domain,
        standing,
        x: LEFT + (index + 0.5 + offset) * column,
        y: plotTop + 10 + (1 - standing.score) * (plot - 20),
      };
    });
  });
  // A pointed model is traced alone, and with nothing pointed every found one is, the readout naming the one found last; while a model is pointed or the find field holds a query, the models outside them dim.
  const traced = new Set(pointed == null ? find.located.keys() : [pointed.row]);
  const shown = pointed?.row ?? lastLocated(find.located);
  const lit = (row: string) =>
    traced.has(row) || (pointed == null && (matches == null || matches.has(row)));
  const light = (standing: Standing) => {
    const place = podiumPlace(standing);
    const own =
      place == null
        ? FIELD_GLOW * (standing.rank == null ? UNRANKED_LIGHT : 1)
        : PODIUM[place]!.glow;
    return traced.has(standing.row.key) ? 1 : lit(standing.row.key) ? own : own * MUTED_STAR_GLOW;
  };
  const stars: SkyPlotStar[] = marks.map(({ key, standing, x, y }) => {
    const place = podiumPlace(standing);
    const named = traced.has(standing.row.key) || (matches != null && lit(standing.row.key));
    return {
      key,
      x,
      y,
      color: providerChartColor(standing.row.provider),
      role: place == null ? "star" : PODIUM[place]!.role,
      glow: light(standing),
      scale: named && place == null ? 1.5 : undefined,
    };
  });
  const trace = marks.filter((mark) => traced.has(mark.standing.row.key));
  const lines = [...traced].map((row) => trace.filter((mark) => mark.standing.row.key === row));
  // Each traced score sits on the side of its star with more room in its column, or on the other side where another traced score already sits level with it.
  const scores = trace.reduce<{ mark: (typeof trace)[number]; right: boolean }[]>(
    (placed, mark) => {
      const roomy = mark.x <= LEFT + (domains.indexOf(mark.domain) + 0.5) * column;
      const taken = placed.some(
        (other) =>
          other.mark.domain === mark.domain &&
          other.right === roomy &&
          Math.abs(other.mark.y - mark.y) < SCORE_HEIGHT,
      );
      return [...placed, { mark, right: taken ? !roomy : roomy }];
    },
    [],
  );
  const tracedRow = trace.find((mark) => mark.standing.row.key === shown)?.standing.row;
  const pointedDomain = domains.find((domain) => domain.key === pointed?.domain);
  // With nothing pointed or found, the readout rests on the strongest model by Intelligence, the one the leaderboard opens on; filters that admit no model leave it empty.
  const leader = data.rows.reduce<ChartRow | null>(
    (best, row) => (best == null || row.intelligence > best.intelligence ? row : best),
    null,
  );
  const point = (row: string, domain: string) => ({
    "data-keeps-pick": true,
    onPointerMove: () => setHovered({ row, domain }),
    onClick: () => setPicked({ row, domain }),
  });

  const carded = domains.find((domain) => domain.key === card.tooltip?.key);

  return (
    <>
      <FigureRegion
        id="leaderboard"
        capture={{ title: "Benchmark spectra", fileName: "model-atlas-spectra" }}
        top={
          <ChartFind
            label="Locate models on Spectra"
            find={find}
            documents={documents}
            describe={findSuggestion}
            onChange={setFind}
            nothingFound={() => NOTHING_FOUND}
          />
        }
      >
        <ChartReadout
          label="Model details"
          factRows={2}
          entry={
            tracedRow != null
              ? modelEntry(domains, tracedRow, pointedDomain ?? null)
              : leader == null
                ? null
                : modelEntry(domains, leader, null)
          }
        />
        <SkyFigure
          layout={layout}
          width={width}
          pinned={{
            width: LEFT,
            marks: (
              <>
                <text className={styles.domainCount} x={0} y={HEAD.count}>
                  Benchmarks
                </text>
                {PODIUM.map(({ label }, index) => (
                  <text key={label} className={graphs.plotNote} x={0} y={placeTop(index) + 12}>
                    {label}
                  </text>
                ))}
                <text className={graphs.plotNote} x={0} y={plotTop + 14}>
                  Best
                </text>
                <text className={graphs.plotNote} x={0} y={plotBottom - 6}>
                  Lowest
                </text>
              </>
            ),
          }}
          height={height}
          bounds={bounds}
          stars={stars}
          flare={pointed == null ? null : `${pointed.domain}|${pointed.row}`}
          found={[...find.located].flatMap(([row, at]) =>
            marks.flatMap((mark) => (mark.standing.row.key === row ? [{ key: mark.key, at }] : [])),
          )}
          horizon
          label={`Every model's standing in each of ${domains.length} domains, with each domain's three best named`}
          onLeave={() => setHovered(null)}
        >
          <line className={graphs.rowRule} x1={LEFT} x2={width} y1={plotBottom} y2={plotBottom} />
          {domains.map((domain, index) => {
            const left = LEFT + index * column;
            return (
              <g key={domain.key}>
                {index > 0 ? (
                  <line
                    className={graphs.rowRule}
                    x1={left}
                    x2={left}
                    y1={HEAD.chip}
                    y2={plotBottom}
                  />
                ) : null}
                <DomainTile domain={domain.key} x={left + INSET} y={HEAD.chip} />
                <text className={styles.domainName} x={left + INSET} y={HEAD.name}>
                  {domain.name}
                </text>
                <text className={styles.domainCount} x={left + INSET} y={HEAD.count}>
                  {domain.weights.length}
                </text>
                <rect
                  className={styles.headerHit}
                  data-pans
                  x={left}
                  y={0}
                  width={column}
                  height={HEAD.height}
                  tabIndex={0}
                  aria-label={`${domain.name} benchmarks`}
                  onMouseEnter={(event) => card.show(event, domain.key)}
                  onFocus={(event) => card.show(event, domain.key)}
                  onMouseLeave={card.end}
                  onBlur={card.end}
                />
                {domain.ranked.slice(0, PODIUM.length).map((standing, place) => {
                  const [first, second] = podiumLines(standing.row.name);
                  const top = placeTop(place);
                  const dimmed = !lit(standing.row.key);
                  const logo = providerLogo(standing.row.provider);
                  return (
                    <g
                      key={standing.row.key}
                      opacity={dimmed ? 0.4 : 1}
                      {...point(standing.row.key, domain.key)}
                    >
                      {logo ? (
                        <image href={logo} x={left + INSET} y={top + 2} width={12} height={12} />
                      ) : null}
                      <text className={styles.podiumName} x={left + INSET + 16} y={top + 12}>
                        {first}
                      </text>
                      {second == null ? null : (
                        <text className={styles.podiumName} x={left + INSET} y={top + 25}>
                          {second}
                        </text>
                      )}
                      <text
                        className={graphs.plotNote}
                        x={left + INSET}
                        y={top + (second == null ? 25 : 38)}
                      >
                        {Math.round(standing.score * 100)}
                      </text>
                      <rect
                        className={graphs.hit}
                        x={left + 2}
                        y={top}
                        width={column - 4}
                        height={PLACE_ROW}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
          {lines.map((line) =>
            line.length < 2 ? null : (
              <polyline
                key={line[0]!.standing.row.key}
                className={graphs.traceLine}
                points={line.map((mark) => `${mark.x},${mark.y}`).join(" ")}
                fill="none"
                style={{ stroke: providerChartColor(line[0]!.standing.row.provider) }}
                pointerEvents="none"
              />
            ),
          )}
          {scores.map(({ mark: { key, standing, x, y }, right }) => (
            <text
              key={key}
              className={graphs.pointLabel}
              x={x + (right ? 8 : -8)}
              y={y}
              dy="0.35em"
              textAnchor={right ? "start" : "end"}
            >
              {Math.round(standing.score * 100)}
            </text>
          ))}
          {marks.map(({ key, standing, x, y }) => {
            const place = podiumPlace(standing);
            return (
              <g key={key} opacity={light(standing)}>
                <StarMark
                  cx={x}
                  cy={y}
                  provider={standing.row.provider}
                  radius={place == null ? FIELD_RADIUS : PODIUM[place]!.radius}
                />
              </g>
            );
          })}
          {marks.map(({ key, domain, standing, x, y }) => (
            <circle
              key={key}
              className={graphs.hit}
              cx={x}
              cy={y}
              r={6}
              {...point(standing.row.key, domain.key)}
            />
          ))}
        </SkyFigure>
      </FigureRegion>
      {card.tooltip == null || carded == null ? null : (
        <ColumnTooltip
          content={domainCard(carded)}
          anchor={card.tooltip.anchor}
          phase={card.tooltip.phase}
          onMouseEnter={card.hold}
          onMouseLeave={card.end}
        />
      )}
    </>
  );
}

/** Each domain's models, best first: a benchmark counts toward every domain it is labelled with, weighted by its share there, and a model's score is the weighted mean of its places in the observed range of the domain's benchmarks it reports, across every leaderboard row; only models reporting at least half the domain's weight are ranked. */
function domainStandings(data: ChartData): DomainStandings[] {
  return data.domains.map((domain) => {
    const benchmarks = data.benchmarks.filter((benchmark) => domain.key in benchmark.shares);
    const ranges = benchmarks.flatMap((benchmark) =>
      benchmark.range == null
        ? []
        : [{ benchmark, ...benchmark.range, weight: benchmark.shares[domain.key]! }],
    );
    const total = ranges.reduce((sum, range) => sum + range.weight, 0);
    const weights = ranges
      .map(({ benchmark, weight }) => ({ benchmark, weight: weight / total }))
      .sort((a, b) => b.weight - a.weight);
    const scored = data.rows
      .flatMap((row) => {
        const places = ranges.flatMap(({ benchmark, min, max, weight }) => {
          const value = row.benchmarks[benchmark.key];
          return value == null ? [] : [{ place: (value - min) / (max - min), weight }];
        });
        const reported = places.reduce((sum, { weight }) => sum + weight, 0);
        return places.length === 0
          ? []
          : [
              {
                row,
                score:
                  places.reduce((sum, { place, weight }) => sum + place * weight, 0) / reported,
                support: reported / total,
              },
            ];
      })
      .sort((a, b) => b.score - a.score);
    let ranks = 0;
    const standings = scored.map((standing) => ({
      ...standing,
      rank: standing.support >= 0.5 ? ++ranks : null,
    }));
    return {
      ...domain,
      weights,
      standings,
      ranked: standings.filter((standing) => standing.rank != null),
      byRow: new Map(standings.map((standing) => [standing.row.key, standing])),
    };
  });
}

// A domain's header card: its benchmarks as a weights map in the domain's colour, frontier and baseline benchmarks in a block each, every tile's area its share of the domain's weight.
function domainCard(domain: DomainStandings): DashboardColumnTooltip {
  const blocks = (["frontier", "baseline"] as const).flatMap((group): ColumnWeightGroup[] => {
    const items = domain.weights
      .filter(({ benchmark }) => benchmark.group === group)
      .map(({ benchmark, weight }) => ({
        name: benchmark.label,
        label: benchmark.columnLabel,
        share: weight * 100,
        domains: domainShares(benchmark.key),
      }));
    return items.length === 0
      ? []
      : [
          {
            title: group === "frontier" ? "Frontier" : "Baseline",
            domain: domain.key,
            items,
          },
        ];
  });
  return {
    title: domain.name,
    body: domain.definition,
    domain: domain.key,
    weights: { unit: "percent", caption: "Benchmarks", groups: blocks, unweighted: [] },
  };
}

// The podium place, from 0, of a model ranked among a domain's first three; null otherwise.
function podiumPlace(standing: Standing): number | null {
  return standing.rank != null && standing.rank <= PODIUM.length ? standing.rank - 1 : null;
}

/** A model's standing in the pointed domain, or with no domain pointed how many domains it leads, then its strongest and weakest ranked domains. */
function modelEntry(
  domains: readonly DomainStandings[],
  row: ChartRow,
  domain: DomainStandings | null,
): ReadoutEntry {
  const ranked = domains
    .flatMap((each) => {
      const own = each.byRow.get(row.key);
      return own?.rank == null ? [] : [{ domain: each, score: own.score }];
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const worst = ranked.at(-1);
  return {
    name: row.name,
    logo: providerLogo(row.provider),
    facts: [
      domain == null
        ? `leads ${domains.filter((each) => each.byRow.get(row.key)?.rank === 1).length} of ${domains.length} domains`
        : domainFact(domain, domain.byRow.get(row.key)!),
      ...(best == null || worst == null
        ? []
        : [
            `strongest in ${best.domain.name} ${Math.round(best.score * 100)}`,
            `weakest in ${worst.domain.name} ${Math.round(worst.score * 100)}`,
          ]),
    ],
  };
}

function domainFact(domain: DomainStandings, standing: Standing): string {
  const score = Math.round(standing.score * 100);
  return standing.rank == null
    ? `${domain.name} ${score}, unranked at ${Math.round(standing.support * 100)}% evidence support`
    : `${domain.name} ${score}, ${ordinal(standing.rank)} of ${domain.ranked.length}`;
}

function ordinal(rank: number): string {
  const teen = rank % 100 >= 11 && rank % 100 <= 13;
  return `${rank}${teen ? "th" : (["th", "st", "nd", "rd"][rank % 10] ?? "th")}`;
}

// A place in -1…1 across a column for the star at `position` in its domain's order: successive positions, which sit close in height, step by the golden ratio so they land far apart sideways, and a steady jitter from `key` breaks the steps' pattern so the field looks scattered.
function spread(position: number, key: string): number {
  const step = position * 0.618034 + (hashUnit(key) * 2 - 1) * 0.3;
  return (((step % 1) + 1) % 1) * 2 - 1;
}

// A podium name in at most two lines, the first beside the logo, broken at the space that keeps the longer line shortest with the logo counted as three characters: `Muse Wonder Full` → `Muse`, `Wonder Full`.
function podiumLines(name: string): [string, string | null] {
  if (name.length <= 9 || !name.includes(" ")) return [name, null];
  let best: [string, string | null] = [name, null];
  let widest = Infinity;
  for (let index = name.indexOf(" "); index >= 0; index = name.indexOf(" ", index + 1)) {
    const first = name.slice(0, index);
    const second = name.slice(index + 1);
    const longest = Math.max(first.length + 3, second.length);
    if (longest < widest) {
      widest = longest;
      best = [first, second];
    }
  }
  return best;
}
