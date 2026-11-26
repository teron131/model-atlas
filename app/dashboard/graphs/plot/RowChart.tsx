"use client";

/** The kit the row charts share, where a row chart sets one model or lab per row, its name at the left, its value flush with the right edge, and its marks between on one axis: the row grid, the boxes a row's text and notes cover, row labels, trails, and domain tiles. */

import { useId } from "react";

import type { BenchmarkDomain } from "../../../../src/model-atlas/benchmarks/catalog";
import { domainIcons } from "../../../shared/DomainShares";
import { providerLogo } from "../../shared/provider-theme";
import { type Margin, monoWidth, type PlotBounds } from "./Primitives";
import { MUTED_STAR_GLOW } from "./sky-renderer";

import styles from "../graphs.module.css";

/** A row chart's margin: just enough above for the first row's note to clear the plot's edge, so the rows sit close under their head, room for each RowLabel on the left, the row's value set flush with the far right edge, and an axis beneath. */
function rowChartMargin(compact: boolean): Margin {
  return { top: 2, right: compact ? 60 : 76, bottom: 30, left: compact ? 140 : 204 };
}

const ROW_HEIGHT = 28;
// Where names and values beside the plot would leave it narrower than `leastPlot`, as on a phone, a row takes two lines: its name and value, then its marks across the full width. These are the two lines' centres within the row, its height, and the plot's side margins.
const TWO_LINE_ROW = { leastPlot: 240, text: 10, marks: 34, height: 46, side: 8 };

/** A row chart's rows at `width`: one line `ROW_HEIGHT` tall, or two lines where the plot beside the names would be too narrow; `markY` centres a row's marks and `textY` its name and value. */
export function rowChartRows(width: number, compact: boolean) {
  const oneLine = rowChartMargin(compact);
  const twoLine = width - oneLine.left - oneLine.right < TWO_LINE_ROW.leastPlot;
  const margin = twoLine
    ? { ...oneLine, left: TWO_LINE_ROW.side, right: TWO_LINE_ROW.side }
    : oneLine;
  const height = twoLine ? TWO_LINE_ROW.height : ROW_HEIGHT;
  const rowTop = (index: number) => margin.top + index * height;
  return {
    margin,
    rowHeight: height,
    rowTop,
    markY: (index: number) => rowTop(index) + (twoLine ? TWO_LINE_ROW.marks : height / 2),
    textY: (index: number) => rowTop(index) + (twoLine ? TWO_LINE_ROW.text : height / 2),
  };
}

// A row's name starts this far right of its logo's left edge.
const ROW_NAME_X = 22;
// A row name's 12.5px semibold sans runs about this wide per character.
const ROW_NAME_CHAR_WIDTH = 7.2;

/** The box a plot note covers, set at `x` as SVG anchors it with its baseline at `y`, for guides that pass behind it. */
export function noteBox(
  x: number,
  y: number,
  text: string,
  anchor: "start" | "middle" | "end",
): PlotBounds {
  const width = monoWidth(text, "micro");
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  // The 10px type rises about 8px above its baseline and drops 3px below it.
  return { left, right: left + width, top: y - 8, bottom: y + 3 };
}

/** The boxes a row's `RowLabel` centred on `y` and its value set flush with the right edge at `width` cover, for guides that pass behind them. */
export function rowTextBoxes(y: number, name: string, value: string, width: number): PlotBounds[] {
  return [
    { left: 0, right: ROW_NAME_X + name.length * ROW_NAME_CHAR_WIDTH, top: y - 8, bottom: y + 8 },
    { left: width - monoWidth(value, "caption"), right: width, top: y - 7, bottom: y + 7 },
  ];
}

/** The dashboard's trail: a hairline along `y` brightening from a dimmed star's light at `from` into `color` at its star at `to`. A plot draws it beneath its stars, so their light lies over it. */
export function Trail({
  from,
  to,
  y,
  color,
}: {
  from: number;
  to: number;
  y: number;
  color: string;
}) {
  const id = useId();
  return (
    <>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={from} x2={to} y1={y} y2={y}>
        <stop offset={0} stopColor={color} stopOpacity={MUTED_STAR_GLOW} />
        <stop offset={1} stopColor={color} />
      </linearGradient>
      <line stroke={`url(#${id})`} x1={from} x2={to} y1={y} y2={y} />
    </>
  );
}

/** A plot row's model: its lab's logo, then its name, vertically centred on `y`. */
export function RowLabel({
  y,
  name,
  provider,
  dimmed = false,
}: {
  y: number;
  name: string;
  provider: string;
  dimmed?: boolean;
}) {
  const logo = providerLogo(provider);
  return (
    <g opacity={dimmed ? 0.4 : 1}>
      {logo ? <image href={logo} x={0} y={y - 7} width={14} height={14} /> : null}
      <text className={styles.rowName} x={ROW_NAME_X} y={y} dy="0.34em">
        {name}
      </text>
    </g>
  );
}

// A domain's chip in a plot matches the weights map's legend: a 14px tile in the label's colour carrying its icon 2px in.
export const DOMAIN_TILE = { size: 14, inset: 2 };

/** A domain's icon on its label-coloured tile, its top left corner at `x`, `y`; a tile smaller than the legend's, for rows set closer, keeps the icon's inset. */
export function DomainTile({
  domain,
  x,
  y,
  size = DOMAIN_TILE.size,
}: {
  domain: BenchmarkDomain;
  x: number;
  y: number;
  size?: number;
}) {
  const Icon = domainIcons[domain];
  return (
    <>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={2}
        style={{ fill: `var(--domain-tone-${domain})` }}
      />
      <Icon
        className={styles.domainIcon}
        x={x + DOMAIN_TILE.inset}
        y={y + DOMAIN_TILE.inset}
        size={size - DOMAIN_TILE.inset * 2}
        strokeWidth={2}
        aria-hidden
      />
    </>
  );
}
