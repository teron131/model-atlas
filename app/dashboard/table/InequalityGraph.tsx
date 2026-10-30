/** Draws a community index's inequalities left to right, strongest first, with each relation sign as its link's arrowhead. */

import type { CSSProperties } from "react";
import { useState } from "react";

import type { ModelAtlasColumnTooltipGraph } from "../../../src/model-atlas/config/tooltips";
import { providerChartColor, providerLogo } from "../shared/provider-theme";

type Relation = ModelAtlasColumnTooltipGraph["edges"][number]["relation"];
type OrderedRelation = Exclude<Relation, "=">;
type Point = { x: number; y: number };

// Node text is 11px monospace, so every character advances the same width.
const CHAR_WIDTH = 6.7;
// A row is one line of text beside the 16px icon.
const NODE_HEIGHT = 20;
const PLACE_HEIGHT = 13;
// Each model's mark is its provider icon, or a score star when the provider has none.
const ICON_SIZE = 16;
const MARK_SPACE = ICON_SIZE + 6;
const SIGN_SPACE = 22;
const COLUMN_GAP = 20;
const NODE_GAP = 14;
const BEND_GAP = 7;
const EQUAL_GAP = 12;
const PORT_GAP = 12;
const PADDING = 6;
// A sign sits this far before its model's label, and its links stop this far before the sign, which keeps line and sign visibly apart.
const SIGN_INSET = 9;
const STRENGTH: Record<OrderedRelation, number> = { "≥": 1, ">": 2, "≫": 3 };
// Close calls draw quieter and large gaps louder.
const RELATION_TONE: Record<Relation, string> = {
  "=": "is-tie",
  "≥": "is-close",
  ">": "is-clear",
  "≫": "is-large",
};

type Unit = { layer: number; members: string[]; order: number; y: number };
type Link = { from: string; to: string; relation: OrderedRelation; route: Unit[] };

type InequalityGraphLayout = ReturnType<typeof layoutInequalityGraph>;

export function InequalityGraph({ layout }: { layout: InequalityGraphLayout }) {
  const [focus, setFocus] = useState<string | null>(null);
  const lit = focus == null ? null : chainGroups(layout, focus);
  const state = (to: string, from: readonly string[]) =>
    lit == null ? undefined : lit.has(to) && from.some((group) => lit.has(group)) ? "lit" : "dim";
  return (
    <div className="column-tooltip-graph">
      <svg
        aria-label={layout.description}
        height={layout.height}
        role="img"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
      >
        {layout.links.map((link) => (
          <path
            className={`column-tooltip-graph-link ${RELATION_TONE[link.relation]}`}
            d={link.path}
            data-state={state(link.to, [link.from])}
            key={link.key}
          />
        ))}
        {layout.signs.map((sign) => (
          <text
            className={`column-tooltip-graph-sign ${RELATION_TONE[sign.relation]}`}
            data-state={state(sign.to, sign.from)}
            key={sign.key}
            x={sign.x}
            y={sign.y}
          >
            {sign.relation}
          </text>
        ))}
        {layout.nodes.map((node) => {
          const logo = providerLogo(node.provider);
          return (
            <g
              data-state={state(node.group, [node.group])}
              key={node.id}
              onPointerEnter={(event) => event.pointerType === "mouse" && setFocus(node.id)}
              onPointerLeave={(event) => event.pointerType === "mouse" && setFocus(null)}
              onPointerUp={(event) =>
                event.pointerType !== "mouse" &&
                setFocus((current) => (current === node.id ? null : node.id))
              }
            >
              <title>{`${node.name} · ${node.place}`}</title>
              <rect
                className="column-tooltip-graph-hit"
                height={NODE_HEIGHT}
                width={node.width}
                x={node.x}
                y={node.y - NODE_HEIGHT / 2}
              />
              {logo ? (
                <image
                  className="column-tooltip-graph-icon"
                  height={ICON_SIZE}
                  href={logo}
                  width={ICON_SIZE}
                  x={node.x}
                  y={node.y - ICON_SIZE / 2}
                />
              ) : (
                <circle
                  className="column-tooltip-graph-star"
                  cx={node.x + ICON_SIZE / 2}
                  cy={node.y}
                  r={2.5}
                  style={{ "--star": providerChartColor(node.provider) } as CSSProperties}
                />
              )}
              <text className="column-tooltip-graph-name" x={node.x + MARK_SPACE} y={node.y}>
                {node.label}
              </text>
              {focus === node.id && (
                // Links leave from the name's right end, so the place sits above the name, on a plate in the card's colour so links passing behind never cut through it.
                <g className="column-tooltip-graph-place">
                  <rect
                    height={PLACE_HEIGHT}
                    width={node.place.length * CHAR_WIDTH + 6}
                    x={node.x + MARK_SPACE - 3}
                    y={node.y - NODE_HEIGHT / 2 - PLACE_HEIGHT}
                  />
                  <text x={node.x + MARK_SPACE} y={node.y - NODE_HEIGHT / 2 - PLACE_HEIGHT / 2}>
                    {node.place}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Stage map:
 * 1. Join "=" models into one stacked unit and keep the strongest relation per ordered pair.
 * 2. Drop links that another path already implies.
 * 3. Place each unit in the leftmost column its relations allow, with a bend point in every column a long link crosses.
 * 4. Order each column by its neighbours' positions.
 * 5. Pull each unit toward its neighbours' heights without breaking order or spacing.
 * 6. Size columns by their widest name, then place relation signs and route links to them.
 */
export function layoutInequalityGraph(graph: ModelAtlasColumnTooltipGraph) {
  const groupOf = new Map(graph.nodes.map((node) => [node.id, node.id]));
  const root = (id: string): string => {
    const parent = groupOf.get(id)!;
    return parent === id ? id : root(parent);
  };
  for (const edge of graph.edges) {
    if (edge.relation === "=") groupOf.set(root(edge.to), root(edge.from));
  }
  const members = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const group = root(node.id);
    members.set(group, [...(members.get(group) ?? []), node.id]);
  }

  const strongest = new Map<string, { from: string; to: string; relation: OrderedRelation }>();
  for (const edge of graph.edges) {
    if (edge.relation === "=") continue;
    const key = `${root(edge.from)}>${root(edge.to)}`;
    const current = strongest.get(key);
    if (current == null || STRENGTH[edge.relation] > STRENGTH[current.relation]) {
      strongest.set(key, { from: edge.from, to: edge.to, relation: edge.relation });
    }
  }
  const successors = new Map<string, Set<string>>();
  for (const link of strongest.values()) {
    successors.set(
      root(link.from),
      (successors.get(root(link.from)) ?? new Set()).add(root(link.to)),
    );
  }
  const reachable = (from: string, target: string): boolean =>
    [...(successors.get(from) ?? [])].some((next) => next === target || reachable(next, target));
  const drawn = [...strongest.values()].filter(
    (link) =>
      ![...successors.get(root(link.from))!].some(
        (next) => next !== root(link.to) && reachable(next, root(link.to)),
      ),
  );

  const layer = new Map([...members.keys()].map((group) => [group, 0]));
  for (let pass = 0; pass < members.size; pass++) {
    for (const link of drawn) {
      layer.set(
        root(link.to),
        Math.max(layer.get(root(link.to))!, layer.get(root(link.from))! + 1),
      );
    }
  }
  const layers = Array.from({ length: Math.max(...layer.values()) + 1 }, () => [] as Unit[]);
  const units = new Map<string, Unit>();
  for (const [group, ids] of members) {
    const unit = { layer: layer.get(group)!, members: ids, order: 0, y: 0 };
    units.set(group, unit);
    layers[unit.layer]!.push(unit);
  }
  const links: Link[] = drawn.map((link) => {
    const start = units.get(root(link.from))!;
    const end = units.get(root(link.to))!;
    const bends = Array.from({ length: end.layer - start.layer - 1 }, (_, index) => {
      const bend = { layer: start.layer + index + 1, members: [], order: 0, y: 0 };
      layers[bend.layer]!.push(bend);
      return bend;
    });
    return { ...link, route: [start, ...bends, end] };
  });

  const neighbours = new Map<Unit, Unit[]>();
  for (const { route } of links) {
    route.slice(1).forEach((unit, index) => {
      neighbours.set(unit, [...(neighbours.get(unit) ?? []), route[index]!]);
      neighbours.set(route[index]!, [...(neighbours.get(route[index]!) ?? []), unit]);
    });
  }
  const adjacent = (unit: Unit, side: number) =>
    (neighbours.get(unit) ?? []).filter((other) => other.layer === unit.layer + side);
  layers.forEach((column) => column.forEach((unit, index) => (unit.order = index)));
  for (let sweep = 0; sweep < 4; sweep++) {
    const side = sweep % 2 === 0 ? -1 : 1;
    for (const column of side === -1 ? layers.slice(1) : layers.slice(0, -1).reverse()) {
      const weight = (unit: Unit) => {
        const near = adjacent(unit, side);
        return near.length === 0
          ? unit.order
          : near.reduce((sum, other) => sum + other.order, 0) / near.length;
      };
      column.sort((left, right) => weight(left) - weight(right) || left.order - right.order);
      column.forEach((unit, index) => (unit.order = index));
    }
  }

  const height = (unit: Unit) =>
    unit.members.length === 0
      ? 0
      : unit.members.length * NODE_HEIGHT + (unit.members.length - 1) * EQUAL_GAP;
  const gap = (upper: Unit, lower: Unit) =>
    (height(upper) + height(lower)) / 2 +
    (upper.members.length > 0 && lower.members.length > 0 ? NODE_GAP : BEND_GAP);
  const settle = (column: Unit[], wanted: (unit: Unit) => number) => {
    const targets = column.map(wanted);
    const placed = targets.slice();
    for (let index = 1; index < column.length; index++) {
      placed[index] = Math.max(
        placed[index]!,
        placed[index - 1]! + gap(column[index - 1]!, column[index]!),
      );
    }
    const shift =
      targets.reduce((sum, target, index) => sum + target - placed[index]!, 0) / column.length;
    column.forEach((unit, index) => (unit.y = placed[index]! + shift));
  };
  layers.forEach((column) => settle(column, () => 0));
  for (let pass = 0; pass < 12; pass++) {
    for (const column of pass % 2 === 0 ? layers : layers.slice().reverse()) {
      settle(column, (unit) => {
        const near = neighbours.get(unit) ?? [];
        return near.length === 0
          ? unit.y
          : near.reduce((sum, other) => sum + other.y, 0) / near.length;
      });
    }
  }
  // Move onto the canvas, leaving room above the top row for a hovered model's place.
  const offset =
    PADDING + PLACE_HEIGHT - Math.min(...layers.flat().map((unit) => unit.y - height(unit) / 2));
  for (const unit of layers.flat()) unit.y += offset;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const textWidth = (id: string) => MARK_SPACE + nodeById.get(id)!.label.length * CHAR_WIDTH;
  const columnWidth = (column: Unit[]) =>
    Math.max(...column.flatMap((unit) => unit.members.map(textWidth)));
  const textLeft = [PADDING];
  for (const column of layers.slice(0, -1)) {
    textLeft.push(textLeft.at(-1)! + columnWidth(column) + COLUMN_GAP + SIGN_SPACE);
  }
  const nodeY = new Map<string, number>();
  for (const unit of units.values()) {
    unit.members.forEach((id, index) =>
      nodeY.set(
        id,
        unit.y - height(unit) / 2 + NODE_HEIGHT / 2 + index * (NODE_HEIGHT + EQUAL_GAP),
      ),
    );
  }

  // Links with the same relation into the same model converge on one shared sign.
  const arrivals = new Map<string, Map<OrderedRelation, Link[]>>();
  for (const link of links) {
    const byRelation = arrivals.get(link.to) ?? new Map<OrderedRelation, Link[]>();
    byRelation.set(link.relation, [...(byRelation.get(link.relation) ?? []), link]);
    arrivals.set(link.to, byRelation);
  }
  const beforeEnd = (link: Link) => {
    const previous = link.route.at(-2)!;
    return previous.members.length === 0 ? previous.y : nodeY.get(link.from)!;
  };
  const meanBeforeEnd = (group: Link[]) =>
    group.reduce((sum, link) => sum + beforeEnd(link), 0) / group.length;
  const port = new Map<Link, number>();
  const signs: {
    key: string;
    relation: Relation;
    from: string[];
    to: string;
    x: number;
    y: number;
  }[] = [];
  for (const [id, byRelation] of arrivals) {
    const groups = [...byRelation.values()].sort(
      (left, right) => meanBeforeEnd(left) - meanBeforeEnd(right),
    );
    const spacing = Math.min(PORT_GAP, (NODE_HEIGHT - 4) / Math.max(1, groups.length - 1));
    groups.forEach((group, index) => {
      const y = nodeY.get(id)! + (index - (groups.length - 1) / 2) * spacing;
      for (const link of group) port.set(link, y);
      signs.push({
        key: `${id}${group[0]!.relation}`,
        relation: group[0]!.relation,
        from: group.map((link) => root(link.from)),
        to: root(id),
        x: textLeft[units.get(root(id))!.layer]! - SIGN_INSET,
        y,
      });
    });
  }

  const drawnLinks = links.map((link) => {
    const signX = textLeft[link.route.at(-1)!.layer]! - SIGN_INSET;
    const points: Point[] = [
      { x: textLeft[link.route[0]!.layer]! + textWidth(link.from) + 5, y: nodeY.get(link.from)! },
      ...link.route.slice(1, -1).map((bend) => ({
        x: textLeft[bend.layer]! + columnWidth(layers[bend.layer]!) / 2,
        y: bend.y,
      })),
      { x: signX - SIGN_INSET, y: port.get(link)! },
    ];
    return {
      key: `${link.from}>${link.to}`,
      relation: link.relation,
      from: root(link.from),
      to: root(link.to),
      path: smoothPath(points),
    };
  });

  for (const [group, unit] of units) {
    unit.members.slice(1).forEach((id, index) =>
      signs.push({
        key: `${unit.members[index]}=${id}`,
        relation: "=",
        from: [group],
        to: group,
        x: textLeft[unit.layer]! + 3,
        y: (nodeY.get(unit.members[index]!)! + nodeY.get(id)!) / 2,
      }),
    );
  }

  const nodes = graph.nodes.map((node) => ({
    ...node,
    group: root(node.id),
    width: textWidth(node.id),
    x: textLeft[units.get(root(node.id))!.layer]!,
    y: nodeY.get(node.id)!,
  }));
  return {
    description: graph.edges
      .map(
        (edge) =>
          `${nodeById.get(edge.from)!.name} ${edge.relation} ${nodeById.get(edge.to)!.name}`,
      )
      .join("; "),
    width: textLeft.at(-1)! + columnWidth(layers.at(-1)!) + PADDING,
    height: Math.max(...nodes.map((node) => node.y + NODE_HEIGHT / 2)) + PADDING,
    nodes,
    links: drawnLinks,
    signs,
  };
}

/** Joins the points with curves that leave and arrive horizontally, so every link ends level with its sign. */
function smoothPath(points: readonly Point[]) {
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]!;
    const reach = (point.x - previous.x) / 2;
    return `${path} C ${previous.x + reach} ${previous.y} ${point.x - reach} ${point.y} ${point.x} ${point.y}`;
  }, `M ${points[0]!.x} ${points[0]!.y}`);
}

/** Groups that reach the focused model or that it reaches, so hovering lights its whole chain. */
function chainGroups(layout: InequalityGraphLayout, id: string) {
  const start = layout.nodes.find((node) => node.id === id)!.group;
  const lit = new Set([start]);
  for (const forward of [true, false]) {
    const queue = [start];
    while (queue.length > 0) {
      const group = queue.pop()!;
      for (const link of layout.links) {
        const [from, to] = forward ? [link.from, link.to] : [link.to, link.from];
        if (from === group && !lit.has(to)) {
          lit.add(to);
          queue.push(to);
        }
      }
    }
  }
  return lit;
}
