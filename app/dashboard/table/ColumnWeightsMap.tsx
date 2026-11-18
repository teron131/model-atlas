/** Draws a score header's weights, or the benchmarks a resource ratio header counts, as a treemap sized to its card: blocks of benchmarks sharing a primary domain, each in that domain's colour, or groups of other inputs in a neutral grey, each member a tile sized and type-sized by its share with its label fitted to it, and the inputs that carry no share listed beneath. Also draws one benchmark's domain shares as a bar, which a pointed tile shows in place of the legend and a benchmark header's card shows outright. */

import { type CSSProperties, useMemo, useState } from "react";

import type { BenchmarkDomain } from "../../../src/model-atlas/benchmarks/catalog";
import { domainIcons } from "../shared/benchmark-display";
import type { ColumnWeightGroup, ColumnWeightItem, ColumnWeights, DomainShare } from "./tooltips";

// A score's tile shares read to two decimals and its block totals to one; a counted benchmark carries no figure and its block shows how many it holds.
const shareFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const totalFormat = new Intl.NumberFormat("en", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// SF Mono and Menlo advance 0.6em a character, so a label's width is known before it renders; the extra hundredth covers Menlo's slightly wider advance and pixel rounding.
const monoAdvance = 0.61;
// A domain's icon leads its block's heaviest label at 1em plus a 0.25em gap, so fitting counts it as a two-character word.
const iconWord = "##";
// A score's map takes the shortest of these heights at which every tile shows its share with a label of at least the legible size, or failing that the one fitting the most labels, then showing the most shares, then with the largest smallest label.
const mapHeight = { min: 140, max: 340, step: 20 };
// Blocks and tiles lean this many times wider than square, so a short label fits on one line.
const tileAspect = 1.6;
// A tile reads as a tile, not a strip, within these width-to-height ratios, and no tile's ratio is more than `spread` times another's in its block, which keeps equal tiles in one row within 1.5 times another row's width.
const tileShape = { minAspect: 0.5, maxAspect: 4, spread: 2.25 };
// Each tile is drawn half this inside its cell on every side, so neighbouring tiles stand this far apart.
const tileGap = 2;
// Blocks stand this much further apart than the tiles, so they read as blocks without headings.
const blockGutter = 4;
// Re-weighing blocks for their gutters stops once every block's drawn area per share is within `spread` of every other's, or after `passes`, keeping the most even pass; each pass lays out every tile again.
const blockEvenness = { spread: 1.005, passes: 6 };
// Every label of one share takes one size, one of these half-pixel steps, and wraps to at most three lines; where no step fits, labels take the smallest and clip. Heavier tiles have room for larger steps, so type size follows weight.
const labelSize = { max: 14, legible: 10, min: 8 };
const labelSizes = Array.from(
  { length: (labelSize.max - labelSize.min) * 2 + 1 },
  (_, step) => labelSize.max - step / 2,
);
const maxLabelLines = 3;
const labelLineHeight = 1.15;
// The room a label leaves inside its tile, across and down.
const tileInset = { x: 8, y: 4 };
// A tile's share is set at the label's size up to this, below the label with a gap above it, or beside it as a ledger row with the label at the left, the share at the right and wider side padding; these match `.column-weights-share` and `.column-weights-tile[data-share="beside"]`.
const shareSize = { max: 10, lineHeight: 1.2, gap: 2, besideGap: 4, besidePadding: 4 };

type Rect = { x: number; y: number; width: number; height: number };
type SharePlacement = "below" | "beside" | null;
type TierFit = { size: number; share: SharePlacement; labels: number; shares: number };
type Member = {
  item: ColumnWeightItem;
  /** The type step of the member's share among the score's distinct shares, from 0 for the heaviest. */
  tier: number;
  /** The label as fitted: the icon counted as a word, and a trailing direction arrow kept with its word. */
  fitted: string;
  label: string;
  icon: boolean;
  share: string | null;
};

/** A column's weights as a treemap: a legend naming each block with its colour and total, each block a group of tiles whose areas are their shares, and the pointed tile named in full in the caption. */
export function ColumnWeightsMap({ weights, width }: { weights: ColumnWeights; width: number }) {
  const [pointed, setPointed] = useState<ColumnWeightItem | null>(null);
  const { height, blocks, sizes } = useMemo(
    () => mapLayout(weights.groups, weights.unit, width),
    [weights, width],
  );
  const labelled = weights.groups.flatMap((group) =>
    group.items.filter((item) => item.domains.length > 0),
  );
  const shown = pointed != null && pointed.domains.length > 0 ? pointed.name : null;
  return (
    <div className="column-weights">
      <div className="column-weights-caption">
        <span>{pointed?.name ?? weights.caption}</span>
        {weights.unit === "percent" && (
          <span>
            {pointed == null
              ? sum(blocks.map((block) => block.group.items.length))
              : shareText(pointed.share, weights.unit, shareFormat)}
          </span>
        )}
      </div>
      {/* A pointed benchmark's domain bar takes the legend's place; every bar holds that place hidden, so it keeps the tallest one's height and the map never moves. */}
      <div className="column-weights-key">
        <ul className="column-weights-legend" data-shown={shown == null}>
          {blocks.map(({ group, tone, total }) => {
            const Icon = group.domain == null ? null : domainIcons[group.domain];
            return (
              <li key={group.title} data-domain={group.domain ?? undefined} style={tone}>
                {Icon != null && (
                  <span className="column-weights-chip">
                    <Icon className="column-weights-icon" aria-hidden />
                  </span>
                )}
                <span>{group.title}</span>
                <span>{shareText(total, weights.unit, totalFormat) ?? group.items.length}</span>
              </li>
            );
          })}
        </ul>
        {labelled.map((item) => (
          <div key={item.name} data-shown={item.name === shown}>
            <DomainShareBar domains={item.domains} />
          </div>
        ))}
      </div>
      <div className="column-weights-map" style={{ height }}>
        {blocks.flatMap(({ group, tone, members, tiles, placements }) =>
          members.map((member, index) => {
            const tile = tiles[index]!;
            const share = placements[index]!;
            const Icon = member.icon && group.domain != null ? domainIcons[group.domain] : null;
            return (
              <div
                className="column-weights-tile"
                data-share={share ?? undefined}
                key={member.item.name}
                style={
                  {
                    ...tone,
                    "--label-size": `${sizes[member.tier]}px`,
                    left: tile.x + tileGap / 2,
                    top: tile.y + tileGap / 2,
                    width: tile.width - tileGap,
                    height: tile.height - tileGap,
                  } as CSSProperties
                }
                onMouseEnter={() => setPointed(member.item)}
                onMouseLeave={() => setPointed(null)}
              >
                <span className="column-weights-label">
                  {Icon != null && <Icon className="column-weights-icon" aria-hidden />}
                  {member.label}
                </span>
                {share != null && member.share != null && (
                  <span className="column-weights-share">{member.share}</span>
                )}
              </div>
            );
          }),
        )}
      </div>
      {weights.unweighted.map((group) => (
        <div className="column-weights-unweighted" key={group.title}>
          <div className="column-weights-heading">
            <span>
              {group.title} <span className="column-weights-count">{group.names.length}</span>
            </span>
            {group.note != null && <span>{group.note}</span>}
          </div>
          <p className="column-weights-names">{group.names.join(", ")}</p>
        </div>
      ))}
    </div>
  );
}

/** A benchmark's domain shares as one bar of their colours, heaviest first, each then named with its icon and percent as the map's legend names a block. */
export function DomainShareBar({ domains }: { domains: readonly DomainShare[] }) {
  return (
    <div className="domain-shares">
      <div className="benchmark-tooltip-bar" aria-hidden>
        {domains.map(({ domain, share }) => (
          <span
            key={domain}
            style={{ flexGrow: share, background: `var(--domain-tone-${domain})` }}
          />
        ))}
      </div>
      <ul className="column-weights-legend">
        {domains.map(({ domain, name, share }) => {
          const Icon = domainIcons[domain];
          return (
            <li key={domain} data-domain={domain} style={domainTone(domain)}>
              <span className="column-weights-chip">
                <Icon className="column-weights-icon" aria-hidden />
              </span>
              <span>{name}</span>
              <span>{share}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function domainTone(domain: BenchmarkDomain | null) {
  return (
    domain == null
      ? { "--tile-tone": "var(--input-tone)", "--tile-ink": "var(--input-ink)" }
      : { "--tile-tone": `var(--domain-tone-${domain})`, "--tile-ink": "var(--domain-ink)" }
  ) as CSSProperties;
}

/** The map's height, its blocks largest first with their tone, their tiles' layout and where each tile sets its share, and each tier's label size; a tier is the rank of a share among the score's distinct shares. */
function mapLayout(
  groups: readonly ColumnWeightGroup[],
  unit: ColumnWeights["unit"],
  width: number,
) {
  const shares = [
    ...new Set(groups.flatMap((group) => group.items.map((item) => item.share))),
  ].sort((a, b) => b - a);
  const tierCount = shares.length;
  const blocks = groups
    .map((group) => ({
      group,
      tone: domainTone(group.domain),
      total: sum(group.items.map((item) => item.share)),
      members: group.items.map((item, index): Member => {
        const icon = index === 0 && group.domain != null;
        // A trailing direction arrow wraps with its word: "Latency ↓" → "Latency\u00a0↓".
        const label = item.label.replace(/ ↓$/, "\u00a0↓");
        return {
          item,
          tier: shares.indexOf(item.share),
          fitted: icon ? `${iconWord} ${label}` : label,
          label,
          icon,
          share: shareText(item.share, unit, shareFormat),
        };
      }),
    }))
    .sort((a, b) => b.total - a.total);
  const shareCount = sum(
    blocks.map((block) => block.members.filter((member) => member.share != null).length),
  );
  let best = {
    height: 0,
    laid: [] as ReturnType<typeof layBlocks>,
    tiers: [] as TierFit[],
    rank: [-1],
  };
  for (let height = mapHeight.min; height <= mapHeight.max; height += mapHeight.step) {
    const laid = layBlocks(height);
    const tiers = Array.from({ length: tierCount }, (_, tier) =>
      tierFit(
        laid.flatMap((block) =>
          block.members.flatMap((member, index) =>
            member.tier === tier ? [{ member, tile: block.tiles[index]! }] : [],
          ),
        ),
      ),
    );
    const rank = [
      sum(tiers.map((tier) => tier.labels)),
      sum(tiers.map((tier) => tier.shares)),
      Math.min(...tiers.map((tier) => tier.size)),
    ];
    if (outranks(rank, best.rank)) best = { height, laid, tiers, rank };
    if (rank[1] === shareCount && rank[2]! >= labelSize.legible) break;
  }
  return {
    height: best.height,
    sizes: best.tiers.map((tier) => tier.size),
    blocks: best.laid.map((block) => ({
      ...block,
      placements: block.members.map((member, index) => {
        const tier = best.tiers[member.tier]!;
        return sharesFit(member, block.tiles[index]!, tier) ? tier.share : null;
      }),
    })),
  };

  /**
   * Blocks are laid out half a gutter past the map's edges and then drawn half a gutter in, so gutters fall only between blocks.
   * A gutter takes a larger part of a small block than of a large one, so the blocks are re-weighed until each one's drawn tile area per unit of share matches the map's, keeping the most even pass.
   */
  function layBlocks(height: number) {
    const half = blockGutter / 2;
    let values = blocks.map((block) => block.total);
    let best = { laid: [] as ReturnType<typeof placeBlocks>, spread: Infinity };
    for (let pass = 0; pass < blockEvenness.passes; pass++) {
      const laid = placeBlocks(values);
      const perShare = laid.map((block) => drawnArea(block.tiles) / block.total);
      const mapPerShare =
        sum(laid.map((block) => drawnArea(block.tiles))) / sum(blocks.map((block) => block.total));
      const spread = Math.max(...perShare) / Math.min(...perShare);
      if (spread < best.spread) best = { laid, spread };
      if (spread <= blockEvenness.spread) break;
      values = values.map((value, index) => (value * mapPerShare) / perShare[index]!);
    }
    return best.laid;

    function placeBlocks(blockValues: readonly number[]) {
      const rects = squarify(blockValues, {
        x: -half,
        y: -half,
        width: width + blockGutter,
        height: height + blockGutter,
      });
      return blocks.map((block, index) => {
        const rect = rects[index]!;
        return {
          ...block,
          tiles: blockTiles(block.members, tierCount, {
            x: rect.x + half,
            y: rect.y + half,
            width: rect.width - blockGutter,
            height: rect.height - blockGutter,
          }),
        };
      });
    }
  }
}

function drawnArea(tiles: readonly Rect[]) {
  return sum(tiles.map((tile) => (tile.width - tileGap) * (tile.height - tileGap)));
}

function shareText(share: number, unit: ColumnWeights["unit"], format: Intl.NumberFormat) {
  return unit === "percent" ? `${format.format(share)}%` : null;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * A block's tiles, heaviest first. Each row count is tried, rows sharing the members in order as evenly as they can.
 * Every tile is drawn `tileGap` smaller than its cell, which costs a row of many narrow tiles more width than a row of few, so each row's gaps come off before its width is split by share and the rows' heights are set after theirs: every tile then draws an area in proportion to its share.
 * The layout fitting the most labels and then showing the most shares wins, then one whose tiles keep `tileShape`, then the largest labels, heaviest tier first, then tiles nearest `tileAspect`.
 */
function blockTiles(members: readonly Member[], tierCount: number, rect: Rect): Rect[] {
  let best = { tiles: [] as Rect[], rank: [-1] };
  for (let rows = 1; rows <= members.length; rows++) {
    const rowMembers = Array.from({ length: rows }, (_, row) => {
      const start = row * Math.floor(members.length / rows) + Math.min(row, members.length % rows);
      const across = Math.floor(members.length / rows) + (row < members.length % rows ? 1 : 0);
      return members.slice(start, start + across);
    });
    // A row too narrow for its gaps is a layout no label fits; one pixel keeps its arithmetic finite.
    const drawnWidths = rowMembers.map((row) => Math.max(rect.width - tileGap * row.length, 1));
    const rowShares = rowMembers.map((row) => sum(row.map((member) => member.item.share)));
    const perShare =
      (rect.height - tileGap * rows) /
      sum(rowShares.map((rowShare, row) => rowShare / drawnWidths[row]!));
    const tiles: Rect[] = [];
    let y = rect.y;
    rowMembers.forEach((row, index) => {
      const height = tileGap + (perShare * rowShares[index]!) / drawnWidths[index]!;
      let x = rect.x;
      for (const member of row) {
        const width = tileGap + (drawnWidths[index]! * member.item.share) / rowShares[index]!;
        tiles.push({ x, y, width, height });
        x += width;
      }
      y += height;
    });
    const aspects = tiles.map((tile) => tile.width / tile.height);
    const shaped =
      Math.min(...aspects) >= tileShape.minAspect &&
      Math.max(...aspects) <= tileShape.maxAspect &&
      Math.max(...aspects) <= Math.min(...aspects) * tileShape.spread + 0.01
        ? 1
        : 0;
    const aspectMiss = Math.max(
      ...aspects.map((aspect) => Math.abs(Math.log(aspect / tileAspect))),
    );
    const fits = members.map((member, index) => tierFit([{ member, tile: tiles[index]! }]));
    const tierSizes = Array.from({ length: tierCount }, (_, tier) =>
      Math.min(
        labelSize.max,
        ...fits.flatMap((fit, index) => (members[index]!.tier === tier ? [fit.size] : [])),
      ),
    );
    const rank = [
      sum(fits.map((fit) => fit.labels)),
      sum(fits.map((fit) => fit.shares)),
      shaped,
      ...tierSizes,
      -aspectMiss,
    ];
    if (outranks(rank, best.rank)) best = { tiles, rank };
  }
  return best.tiles;
}

/**
 * The label size and share placement that every one of `placed` takes, with how many of their labels fit and how many of those also fit the share.
 * The most labels fitting wins, then the most shares shown, then the largest size, then the share below rather than beside the label; so labels clip only where no size fits them, and a tile without room for the placement leaves its share out.
 */
function tierFit(placed: readonly { member: Member; tile: Rect }[]): TierFit {
  let best = { size: labelSize.min, share: null as SharePlacement, labels: -1, shares: -1 };
  let bestRank = [-1];
  for (const share of ["below", "beside", null] as const) {
    for (const size of labelSizes) {
      const fit = {
        size,
        share,
        labels: placed.filter(({ member, tile }) => tileFits(member.fitted, "", size, tile, null))
          .length,
        shares: placed.filter(({ member, tile }) => sharesFit(member, tile, { size, share }))
          .length,
      };
      const rank = [fit.labels, fit.shares, size, share === "below" ? 1 : 0];
      if (outranks(rank, bestRank)) {
        best = fit;
        bestRank = rank;
      }
    }
  }
  return best;
}

function sharesFit(member: Member, tile: Rect, { size, share }: Pick<TierFit, "size" | "share">) {
  return (
    share != null &&
    member.share != null &&
    tileFits(member.fitted, member.share, size, tile, share)
  );
}

/** Whether `label` at `size`, with `share` set as `placement` or left out when that is null, fits inside `tile`. */
function tileFits(
  label: string,
  share: string,
  size: number,
  tile: Rect,
  placement: SharePlacement,
) {
  const room = { width: tile.width - tileInset.x, height: tile.height - tileInset.y };
  const shareFont = Math.min(size, shareSize.max);
  if (placement === "beside")
    return (
      label.length * size * monoAdvance +
        shareSize.besideGap +
        share.length * shareFont * monoAdvance +
        shareSize.besidePadding <=
        room.width && Math.max(size, shareFont) * labelLineHeight <= room.height
    );
  const lines = wrappedLines(label, Math.floor(room.width / (size * monoAdvance)));
  const shareHeight = placement === "below" ? shareSize.gap + shareFont * shareSize.lineHeight : 0;
  return (
    lines != null &&
    lines <= maxLabelLines &&
    lines * size * labelLineHeight + shareHeight <= room.height
  );
}

/** Lines `label` breaks into at spaces with `perLine` characters a line, or null when a word is longer than a line. Breaks after hyphens are left out, so the count errs high. */
function wrappedLines(label: string, perLine: number): number | null {
  let lines = 1;
  let used = 0;
  for (const word of label.split(" ")) {
    if (word.length > perLine) return null;
    if (used > 0 && used + 1 + word.length > perLine) {
      lines += 1;
      used = word.length;
    } else used += (used > 0 ? 1 : 0) + word.length;
  }
  return lines;
}

/** Whether `rank` sorts above `other`, comparing entries in order. */
function outranks(rank: readonly number[], other: readonly number[]) {
  const index = rank.findIndex((value, at) => value !== other[at]);
  return index !== -1 && (other[index] == null || rank[index]! > other[index]!);
}

/**
 * Rectangles filling `rect` with areas in proportion to `values`, which run largest first, by the squarified treemap of Bruls, Huizing and van Wijk.
 * Values join a row along the free space's shorter side while the next one would not make the row's most elongated rectangle worse; the row is then fixed and the rest fill what remains.
 * The layout runs in a space narrowed by `tileAspect` and is stretched back, so rectangles come out that many times wider than square.
 */
function squarify(values: readonly number[], rect: Rect): Rect[] {
  let free = { ...rect, x: rect.x / tileAspect, width: rect.width / tileAspect };
  const scale = (free.width * free.height) / sum(values);
  const placed: Rect[] = [];
  const worst = (areas: readonly number[], side: number) => {
    const rowArea = sum(areas);
    return Math.max(
      ...areas.map((area) =>
        Math.max(
          (side * side * area) / (rowArea * rowArea),
          (rowArea * rowArea) / (side * side * area),
        ),
      ),
    );
  };
  const lay = (areas: readonly number[]) => {
    const rowArea = sum(areas);
    if (free.width >= free.height) {
      const rowWidth = rowArea / free.height;
      let y = free.y;
      for (const area of areas) {
        placed.push({ x: free.x, y, width: rowWidth, height: area / rowWidth });
        y += area / rowWidth;
      }
      free = { ...free, x: free.x + rowWidth, width: free.width - rowWidth };
    } else {
      const rowHeight = rowArea / free.width;
      let x = free.x;
      for (const area of areas) {
        placed.push({ x, y: free.y, width: area / rowHeight, height: rowHeight });
        x += area / rowHeight;
      }
      free = { ...free, y: free.y + rowHeight, height: free.height - rowHeight };
    }
  };
  let row: number[] = [];
  for (const value of values) {
    const area = value * scale;
    const side = Math.min(free.width, free.height);
    if (row.length > 0 && worst([...row, area], side) > worst(row, side)) {
      lay(row);
      row = [];
    }
    row.push(area);
  }
  lay(row);
  return placed.map((placedRect) => ({
    ...placedRect,
    x: placedRect.x * tileAspect,
    width: placedRect.width * tileAspect,
  }));
}
