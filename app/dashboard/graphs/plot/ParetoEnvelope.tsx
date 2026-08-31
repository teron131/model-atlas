/** Shared Pareto frontier selection and SVG envelope rendering for two-dimensional charts. */

import { pairs } from "d3-array";

type ParetoGoal = "maximize" | "minimize";

type ParetoTarget<Row> = {
  get: (row: Row) => number;
  goal: ParetoGoal;
};

type ParetoTargets<Row> = {
  x: ParetoTarget<Row>;
  y: ParetoTarget<Row>;
};

/** Return non-dominated rows in ascending visual X order for independently configured X and Y goals. */
export function paretoFrontier<Row>(rows: readonly Row[], targets: ParetoTargets<Row>): Row[] {
  const preferredRows = [...rows].sort((left, right) => {
    const xDifference = comparePreferred(targets.x, left, right);
    return xDifference || comparePreferred(targets.y, left, right);
  });
  const frontier: Row[] = [];
  let bestY = -Infinity;
  for (const row of preferredRows) {
    const y = preferredValue(targets.y, row);
    if (y > bestY) {
      frontier.push(row);
      bestY = y;
    }
  }
  return frontier.sort((left, right) => targets.x.get(left) - targets.x.get(right));
}

/** Render a color-interpolated line through an already selected Pareto frontier. */
export function ParetoEnvelope<Row>({
  frontier,
  getX,
  getY,
  xPoint,
  yPoint,
  getColor,
  idPrefix,
  className,
}: {
  frontier: readonly Row[];
  getX: (row: Row) => number;
  getY: (row: Row) => number;
  xPoint: (value: number) => number;
  yPoint: (value: number) => number;
  getColor: (row: Row) => string;
  idPrefix: string;
  className: string;
}) {
  const segments = pairs(frontier).map(([fromRow, toRow], index) => {
    const fromX = xPoint(getX(fromRow));
    const fromY = yPoint(getY(fromRow));
    const toX = xPoint(getX(toRow));
    const toY = yPoint(getY(toRow));
    return {
      gradientId: `${idPrefix}-gradient-${index + 1}`,
      fromColor: getColor(fromRow),
      toColor: getColor(toRow),
      fromX,
      fromY,
      toX,
      toY,
    };
  });

  return (
    <>
      <defs>
        {segments.map((segment) => (
          <linearGradient
            id={segment.gradientId}
            key={segment.gradientId}
            gradientUnits="userSpaceOnUse"
            x1={segment.fromX}
            y1={segment.fromY}
            x2={segment.toX}
            y2={segment.toY}
          >
            <stop offset="0" stopColor={segment.fromColor} />
            <stop offset="1" stopColor={segment.toColor} />
          </linearGradient>
        ))}
      </defs>
      {segments.map((segment) => (
        <path
          className={className}
          d={`M${segment.fromX},${segment.fromY} L${segment.toX},${segment.toY}`}
          key={segment.gradientId}
          stroke={`url(#${segment.gradientId})`}
        />
      ))}
    </>
  );
}

function comparePreferred<Row>(target: ParetoTarget<Row>, left: Row, right: Row): number {
  return preferredValue(target, right) - preferredValue(target, left);
}

function preferredValue<Row>(target: ParetoTarget<Row>, row: Row): number {
  const value = target.get(row);
  return target.goal === "maximize" ? value : -value;
}
