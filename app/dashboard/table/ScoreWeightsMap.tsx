/** Draws a score header's weights as a treemap sized to its card: tiers or input groups as blocks toned by member weight, each label fitted to its tile, and the inputs that carry no share listed beneath. */

import { type CSSProperties, useMemo, useState } from "react";

import type { ScoreWeightGroup, ScoreWeightItem, ScoreWeights } from "./tooltips";

const shareFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const totalFormat = new Intl.NumberFormat("en", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// SF Mono and Menlo advance 0.6em a character, so a label's width is known before it renders; the extra hundredth covers Menlo's slightly wider advance and pixel rounding.
const monoAdvance = 0.61;
// A score's map takes the shortest of these heights at which every tile shows its share with a label of at least the legible size, or failing that the height whose smallest label is largest.
const mapHeight = { min: 140, max: 340, step: 20 };
// Blocks and tiles lean this many times wider than square, so a short label fits on one line.
const tileAspect = 1.6;
// A tile reads as a tile, not a strip, within these width-to-height ratios, and no row's tiles are more than this many times as wide as another's.
const tileShape = { minAspect: 0.5, maxAspect: 4, rowSpread: 1.5 };
// Blocks stand this much further apart than the 2px between tiles, so tiers read as blocks without headings.
const blockGutter = 4;
// Every label in a block takes one size, one of these half-pixel steps, and wraps to at most three lines; where no step fits, labels take the smallest and clip. Heavier tiles have room for larger steps, so type size follows weight.
const labelSize = { max: 14, legible: 10, min: 8 };
const labelSizes = Array.from(
  { length: (labelSize.max - labelSize.min) * 2 + 1 },
  (_, step) => labelSize.max - step / 2,
);
const maxLabelLines = 3;
const labelLineHeight = 1.15;
// The room a label leaves inside its tile, across and down.
const tileInset = { x: 8, y: 4 };
// A tile's share is set at the label's size up to this, below the label with a gap above it, or beside it as a ledger row with the label at the left, the share at the right and wider side padding; these match `.score-weights-share` and `.score-weights-tile[data-share="beside"]`.
const shareSize = { max: 10, lineHeight: 1.2, gap: 2, besideGap: 4, besidePadding: 4 };

type Rect = { x: number; y: number; width: number; height: number };

/** A score's weights as a treemap: a legend naming each block's members' share and the block's total, each group a block of its own tone, each member a tile whose area is its share, and the pointed tile named in full in the caption. */
export function ScoreWeightsMap({ weights, width }: { weights: ScoreWeights; width: number }) {
  const [pointed, setPointed] = useState<ScoreWeightItem | null>(null);
  const { height, blocks } = useMemo(() => mapLayout(weights.groups, width), [weights, width]);
  return (
    <div className="score-weights" data-dimension={weights.score}>
      <div className="score-weights-caption">
        <span>{pointed?.name ?? weights.caption}</span>
        <span>
          {pointed == null
            ? sum(blocks.map((block) => block.group.items.length))
            : `${shareFormat.format(pointed.share)}%`}
        </span>
      </div>
      <ul className="score-weights-legend">
        {blocks.map(({ group, rank, total, each, tone }) => (
          <li key={rank} style={tone}>
            <span>{group.title ?? `${group.items.length} × ${each}`}</span>
            <span>{totalFormat.format(total)}%</span>
          </li>
        ))}
      </ul>
      <div className="score-weights-map" style={{ height }}>
        {blocks.flatMap(({ group, labels, each, tone, tiles, size, share }) =>
          group.items.map((item, index) => {
            const tile = tiles[index]!;
            return (
              <div
                className="score-weights-tile"
                data-share={share ?? undefined}
                key={item.name}
                style={
                  {
                    ...tone,
                    "--label-size": `${size}px`,
                    left: tile.x + 1,
                    top: tile.y + 1,
                    width: tile.width - 2,
                    height: tile.height - 2,
                  } as CSSProperties
                }
                onMouseEnter={() => setPointed(item)}
                onMouseLeave={() => setPointed(null)}
              >
                <span className="score-weights-label">{labels[index]}</span>
                {share != null && <span className="score-weights-share">{each}</span>}
              </div>
            );
          }),
        )}
      </div>
      {weights.unweighted.map((group) => (
        <div className="score-weights-unweighted" key={group.title}>
          <div className="score-weights-heading">
            <span>
              {group.title} <span className="score-weights-count">{group.names.length}</span>
            </span>
            {group.note != null && <span>{group.note}</span>}
          </div>
          <p className="score-weights-names">{group.names.join(", ")}</p>
        </div>
      ))}
    </div>
  );
}

/** The map's height and its blocks, largest first, each toned by its rank in member share so a heavier benchmark always stands out more from the paper, with its tiles' layout. */
function mapLayout(groups: readonly ScoreWeightGroup[], width: number) {
  const byMemberShare = [...groups].sort((a, b) => b.items[0]!.share - a.items[0]!.share);
  const blocks = groups
    .map((group, rank) => {
      const tier = Math.min(byMemberShare.indexOf(group), 3) + 1;
      return {
        group,
        rank,
        total: sum(group.items.map((item) => item.share)),
        // A trailing direction arrow wraps with its word: "Latency ↓" → "Latency\u00a0↓".
        labels: group.items.map((item) => item.label.replace(/ ↓$/, "\u00a0↓")),
        each: `${shareFormat.format(group.items[0]!.share)}%`,
        tone: {
          "--weight-tone": `var(--weight-tone-${tier})`,
          "--weight-ink": `var(--weight-ink-${tier})`,
        } as CSSProperties,
      };
    })
    .sort((a, b) => b.total - a.total);
  let best = { height: 0, blocks: [] as ReturnType<typeof layBlocks>, smallest: -1 };
  for (let height = mapHeight.min; height <= mapHeight.max; height += mapHeight.step) {
    const laid = layBlocks(height);
    const smallest = Math.min(...laid.map((block) => (block.share == null ? 0 : block.size)));
    if (smallest >= labelSize.legible) return { height, blocks: laid };
    if (smallest > best.smallest) best = { height, blocks: laid, smallest };
  }
  return best;

  // Blocks are laid out half a gutter past the map's edges and then drawn half a gutter in, so gutters fall only between blocks.
  function layBlocks(height: number) {
    const half = blockGutter / 2;
    const rects = squarify(
      blocks.map((block) => block.total),
      { x: -half, y: -half, width: width + blockGutter, height: height + blockGutter },
    );
    return blocks.map((block, index) => {
      const rect = rects[index]!;
      return {
        ...block,
        ...blockTiles(block.labels, block.each, {
          x: rect.x + half,
          y: rect.y + half,
          width: rect.width - blockGutter,
          height: rect.height - blockGutter,
        }),
      };
    });
  }
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

type SharePlacement = "below" | "beside" | null;

/**
 * A block's tiles, which all weigh the same and so share one label size, `share` and placement of it.
 * Each row count is tried, rows sharing the tiles as evenly as they can and each filling the width at the height that keeps every tile's area equal.
 * The layout that shows the share wins, then one whose tiles keep `tileShape`, then the largest label size, then the share below rather than beside the label, then tiles nearest `tileAspect`; only where no layout fits the share do labels stand alone, and only where none fits a label do they clip at the smallest size.
 */
function blockTiles(labels: readonly string[], share: string, rect: Rect) {
  const area = (rect.width * rect.height) / labels.length;
  let best = {
    tiles: [] as Rect[],
    size: labelSize.min,
    share: null as SharePlacement,
    rank: [-1],
  };
  for (let rows = 1; rows <= labels.length; rows++) {
    const tiles: Rect[] = [];
    let y = rect.y;
    for (let row = 0; row < rows; row++) {
      const across = Math.floor(labels.length / rows) + (row < labels.length % rows ? 1 : 0);
      const width = rect.width / across;
      for (let column = 0; column < across; column++)
        tiles.push({ x: rect.x + column * width, y, width, height: area / width });
      y += area / width;
    }
    const aspects = tiles.map((tile) => tile.width / tile.height);
    const widths = tiles.map((tile) => tile.width);
    const shaped =
      Math.min(...aspects) >= tileShape.minAspect &&
      Math.max(...aspects) <= tileShape.maxAspect &&
      Math.max(...widths) <= Math.min(...widths) * tileShape.rowSpread + 0.01
        ? 1
        : 0;
    const aspectMiss = Math.max(
      ...aspects.map((aspect) => Math.abs(Math.log(aspect / tileAspect))),
    );
    const fitting = (["below", "beside", null] as const).flatMap((placement) => {
      const size = labelSizes.find((candidate) =>
        tiles.every((tile, index) => tileFits(labels[index]!, share, candidate, tile, placement)),
      );
      return size == null ? [] : [{ size, share: placement }];
    });
    const candidates = fitting.length > 0 ? fitting : [{ size: labelSize.min, share: null }];
    for (const candidate of candidates) {
      const fits = fitting.length === 0 ? 0 : candidate.share == null ? 1 : 2;
      const rank = [fits, shaped, candidate.size, candidate.share === "below" ? 1 : 0, -aspectMiss];
      if (outranks(rank, best.rank)) best = { tiles, ...candidate, rank };
    }
  }
  return { tiles: best.tiles, size: best.size, share: best.share };
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
