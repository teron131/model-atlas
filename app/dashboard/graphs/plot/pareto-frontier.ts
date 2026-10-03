/** Pareto frontier selection shared by the Pareto chart and the hero register, with independent goals per axis. */

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

function comparePreferred<Row>(target: ParetoTarget<Row>, left: Row, right: Row): number {
  return preferredValue(target, right) - preferredValue(target, left);
}

function preferredValue<Row>(target: ParetoTarget<Row>, row: Row): number {
  const value = target.get(row);
  return target.goal === "maximize" ? value : -value;
}
