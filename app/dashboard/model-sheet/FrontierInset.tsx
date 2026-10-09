"use client";

/** The sheet's frontier inset: its population as faint dust beneath the lit Intelligence-against-cost frontier, with the sheet's own models lit as stars. */

import { useMemo } from "react";

import { calloutLabelPlacements } from "../graphs/plot/label-placement";
import { paretoFrontier } from "../graphs/plot/pareto-frontier";
import {
  FrontierHorizon,
  horizonRim,
  starCore,
  StarGlows,
  TextPointLabel,
  useLabelSizes,
} from "../graphs/plot/Primitives";
import { modelName, modelVariantKey, shortLabel } from "../shared/model-display";
import { providerChartColor } from "../shared/provider-theme";
import { formatResourceRatio } from "../shared/resource-ratio-display";
import { formatScore } from "../table/format";
import type { TableRow } from "../table/models";
import type { SheetEntry } from "./entries";
import { LABEL_MARGIN, SheetPlotFrame, useSheetPlot } from "./SheetPlot";

import graphStyles from "../graphs/graphs.module.css";
import styles from "./model-sheet.module.css";

const INSET_HEIGHT = 176;
const SCORE_DOMAIN = [0, 100] as const;
const SCORE_TICKS = [0, 50, 100];
const STAR_RADIUS = 4.4;
const DUST_RADIUS = 1.5;

type InsetPoint = { row: TableRow; cost: number; intelligence: number };

/**
 * Plot every model in the opened model's population by Intelligence and Cost×, the sheet's own numbers, under the frontier those models reach.
 * A pinned model is read against the same population, so both stars share one sky.
 */
export function FrontierInset({
  population,
  entries,
}: {
  population: readonly TableRow[];
  entries: readonly SheetEntry[];
}) {
  const points = useMemo(
    () =>
      population.flatMap((row) => {
        const point = insetPoint(row);
        return point == null ? [] : [point];
      }),
    [population],
  );
  const frontier = useMemo(
    () =>
      paretoFrontier(points, {
        x: { get: (point) => point.cost, goal: "minimize" },
        y: { get: (point) => point.intelligence, goal: "maximize" },
      }),
    [points],
  );
  const comparing = entries.length > 1;
  const lit = entries.map((entry) => ({ entry, point: insetPoint(entry.row) }));
  const costs = [...points, ...lit.flatMap(({ point }) => (point == null ? [] : [point]))].map(
    (point) => point.cost,
  );
  const plot = useSheetPlot(INSET_HEIGHT, costs, SCORE_DOMAIN);
  // The sheet's own models that have a measured cost, placed once for their glow, core, and label.
  const stars = lit.flatMap(({ entry, point }) =>
    point == null
      ? []
      : [
          {
            key: entry.slot,
            model: entry.row.model,
            cx: plot.x(point.cost),
            cy: plot.y(point.intelligence),
            color: providerChartColor(entry.row.model.provider),
          },
        ],
  );
  const labels = comparing
    ? stars.map(({ key, model, cx, cy }) => ({
        key,
        label: shortLabel(model),
        cx,
        cy,
        radius: STAR_RADIUS,
      }))
    : [];
  const { svgRef, labelSizes } = useLabelSizes(
    labels.map((label) => label.label).join("\0"),
    false,
  );
  if (points.length < 3) return null;

  const statuses = lit.map(({ point }) => frontierStatus(point, points));
  const horizon = frontier.map((point) => ({
    x: plot.x(point.cost),
    y: plot.y(point.intelligence),
  }));
  const placements = calloutLabelPlacements({
    labels: labels.map((label) => ({ ...label, size: labelSizes[label.label] })),
    obstacles: labels.map(({ key, cx, cy, radius }) => ({ key, cx, cy, radius })),
    bounds: plot.bounds,
    reservedBoxes: plot.reservedBoxes,
    segments: horizonRim(horizon, plot.bounds, "right").flatMap((point, index, rim) =>
      index === 0
        ? []
        : [{ x1: rim[index - 1]!.x, y1: rim[index - 1]!.y, x2: point.x, y2: point.y }],
    ),
  });
  // The opened model, last in a comparison, owns the population.
  const noun = entries.at(-1)!.effort == null ? "models" : "reasoning variants";
  const description = [
    `Intelligence against Cost× for ${points.length} ${noun}, with the frontier they reach.`,
    ...lit.map(({ entry, point }, index) =>
      point == null
        ? `${modelName(entry.row.model)}: no measured cost.`
        : `${modelName(entry.row.model)}: Intelligence ${formatScore(point.intelligence)} at ${formatResourceRatio(point.cost)} cost, ${statuses[index]!.toLowerCase()}.`,
    ),
  ].join(" ");

  return (
    <section className={styles.section} aria-labelledby="model-sheet-frontier">
      <h3 id="model-sheet-frontier">
        Frontier <small>{comparing ? "Intelligence against cost" : statuses[0]}</small>
      </h3>
      <div ref={plot.chartRef} className={`${graphStyles.chartTokens} ${styles.plot}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${plot.width} ${plot.height}`}
          role="img"
          aria-label={description}
        >
          <SheetPlotFrame plot={plot} scoreTicks={SCORE_TICKS} />
          <FrontierHorizon points={horizon} bounds={plot.bounds} open="right" />
          <g className={styles.dust} aria-hidden="true">
            {points.map((point) => (
              <circle
                key={modelVariantKey(point.row.model)}
                cx={plot.x(point.cost)}
                cy={plot.y(point.intelligence)}
                r={DUST_RADIUS}
              />
            ))}
          </g>
          <StarGlows
            bounds={plot.bounds}
            stars={stars.map(({ key, cx, cy, color }) => ({
              key,
              cx,
              cy,
              radius: STAR_RADIUS,
              color,
              emphasis: "selected" as const,
            }))}
          />
          {stars.map(({ key, cx, cy, color }) => (
            <circle
              key={key}
              className={graphStyles.starCore}
              cx={cx}
              cy={cy}
              {...starCore(STAR_RADIUS, color)}
              aria-hidden="true"
            />
          ))}
          {labels.map((label) => (
            <TextPointLabel
              key={label.key}
              label={label.label}
              cx={label.cx}
              cy={label.cy}
              width={plot.width}
              height={plot.height}
              margin={LABEL_MARGIN}
              placement={placements.get(label.key)}
            />
          ))}
        </svg>
      </div>
      {comparing ? (
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Position</dt>
            {statuses.map((status, index) => (
              <dd key={entries[index]!.slot}>{status}</dd>
            ))}
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function insetPoint(row: TableRow): InsetPoint | null {
  const cost = row.resourceRatios?.cost?.ratio;
  const intelligence = row.model.scores.intelligence_score;
  return cost != null &&
    Number.isFinite(cost) &&
    cost > 0 &&
    typeof intelligence === "number" &&
    Number.isFinite(intelligence)
    ? { row, cost, intelligence }
    : null;
}

/**
 * Name where a model stands against the population: on the frontier when nothing matches its Intelligence for less, otherwise how many models score higher at a lower cost.
 * Ties that only match it on one axis still keep it off the frontier.
 */
function frontierStatus(point: InsetPoint | null, points: readonly InsetPoint[]): string {
  if (point == null) return "No measured cost";
  let ahead = 0;
  let dominated = false;
  for (const other of points) {
    if (other.row === point.row) continue;
    const atLeast = other.intelligence >= point.intelligence && other.cost <= point.cost;
    if (!atLeast || (other.intelligence === point.intelligence && other.cost === point.cost)) {
      continue;
    }
    dominated = true;
    if (other.intelligence > point.intelligence && other.cost < point.cost) ahead += 1;
  }
  if (!dominated) return "On the frontier";
  return ahead === 0
    ? "Behind the frontier"
    : `${ahead} ${ahead === 1 ? "model scores" : "models score"} higher for less`;
}
