"use client";

/** Frontier benchmark scatter plot owns axes, the Pareto frontier horizon, labels, the pointed star and its guides, effort lines, and the readout above the plot. */

import { greatest, median, quantileSorted } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { canonicalModelKey } from "../../../../src/model-atlas/identity/normalization";
import { type ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { formatRatioTick, formatResourceRatio } from "../../../shared/resource-ratio-display";
import { openModelSheet } from "../../model-sheet/open";
import { modelLogo, modelName, reasoningVariantGroups } from "../../shared/model-display";
import { paretoFrontier } from "../../shared/pareto-frontier";
import { providerChartColor, providerDisplayName } from "../../shared/provider-theme";
import type { ChartFindState } from "../ChartFind";
import { ChartReadout, type ReadoutEntry, type ReadoutFact } from "../ChartReadout";
import {
  CursorCapture,
  CursorProjectionLayer,
  nearestPoint,
  pointerPosition,
  PointHitTarget,
} from "../plot/Interaction";
import {
  boxesMeet,
  calloutLabelPlacements,
  labelBox,
  NAME_CLEARANCE,
  placeInSky,
  type PointLabelPlacement,
} from "../plot/label-placement";
import {
  CHART_WIDTH,
  DirectionArrow,
  FrontierHorizon,
  horizonRim,
  horizonSegments,
  horizonTrail,
  labelBounds,
  LabelMask,
  type Margin,
  MedianCross,
  medianReadingBoxes,
  NameMask,
  plotBoundsFor,
  PlotFrame,
  polylineSegments,
  SCATTER_CHART_HEIGHT,
  scatterChartMargin,
  stableSvgNumber,
  stableSvgScale,
  starCore,
  StarGlows,
  TextPointLabel,
  useLabelSizes,
  XAxisTicks,
  YAxisTicks,
  YAxisTitle,
} from "../plot/Primitives";
import { MUTED_STAR_GLOW, type SkyPlotScene } from "../plot/sky-renderer";
import { SkyPlot } from "../plot/SkyPlot";
import { starConnectorSegments, starMarkRadius } from "../plot/star-marks";
import { useChartLayout } from "../use-chart-layout";

import styles from "../graphs.module.css";

type ScatterMetric<Row> = {
  /** What the X axis measures, as a frontier step names its trade: `6.3× cost`, `−12.3 Speed Score`. */
  noun: string;
  get: (row: Row) => number;
  format: (value: number) => string;
  xHigherIsBetter?: boolean;
  /** Only a ratio axis is logarithmic, so its ticks print as exact steps (`1×`) while readings keep `format`. */
  logarithmic?: boolean;
};

const PLOT_EDGE_GUTTER = 20;
const DIRECTION_LABEL_WIDTH = 100;
const DIRECTION_LABEL_HEIGHT = 32;
// Reserve room above the highest score for full model callouts.
const PLOT_TOP_GUTTER = 48;
const MEDIAN_LABEL_CLEARANCE = 64;
// An axis's spread straddles the plot's edge this far either side, so its whisker is the axis line; the axis's tick marks and inset scale labels take it as their `tickGap` so none crosses the box.
const SPREAD_HALF_WIDTH = 4;
const HOVER_EXIT_DELAY_MS = 150;

export function FrontierBenchmarkScatterPlot<Row>({
  rows,
  metric,
  xDomain,
  xTicks,
  yDomain,
  yTicks,
  yAxisLabel,
  formatScore,
  keyPrefix,
  ariaLabel,
  getScore,
  getModel,
  getKey,
  getFacts,
  getLabel,
  connectReasoningVariants,
  margin,
  matches,
  located,
}: {
  rows: Row[];
  metric: ScatterMetric<Row>;
  xDomain: [number, number];
  xTicks: number[];
  yDomain: [number, number];
  yTicks: number[];
  yAxisLabel: string;
  formatScore: (value: number) => string;
  keyPrefix: string;
  ariaLabel: string;
  getScore: (row: Row) => number;
  getModel: (row: Row) => ModelAtlasModel;
  getKey: (row: Row) => string;
  /** The readout's facts about a model beyond its lab, which leads them, and its frontier step, which ends them. */
  getFacts: (row: Row) => ReadoutFact[];
  getLabel: (row: Row) => string;
  connectReasoningVariants: boolean;
  margin: Margin;
  /** The model families, by `canonicalModelKey`, that the find field's query matches, or `null` while it holds none. */
  matches: ReadonlySet<string> | null;
  located: ChartFindState["located"];
}) {
  const { plotHost, width, compact } = useChartLayout(CHART_WIDTH);
  const height = compact ? Math.min(SCATTER_CHART_HEIGHT, 400) : SCATTER_CHART_HEIGHT;
  const [highlightedVariantKey, setHighlightedVariantKey] = useVariantHighlight();
  // The star a click or tap picked, which stays lit while the pointer is elsewhere; a hovered or focused star shows over it.
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const guideMaskId = useId();
  const leaderMaskId = useId();
  const litNameMaskId = useId();
  const chartMargin = scatterChartMargin(margin, compact);
  const plot = plotBoundsFor(width, height, chartMargin);
  const edgeGutter = compact ? 12 : PLOT_EDGE_GUTTER;
  const topGutter = compact ? 24 : PLOT_TOP_GUTTER;
  const x = (metric.logarithmic ? scaleLog().base(10) : scaleLinear())
    .domain(xDomain)
    .range([plot.left + edgeGutter, plot.right - edgeGutter])
    .clamp(true);
  const y = scaleLinear()
    .domain(yDomain)
    .range([plot.bottom - edgeGutter, plot.top + topGutter])
    .clamp(true);
  const xPoint = stableSvgScale(x);
  const yPoint = stableSvgScale(y);
  const frontier = paretoFrontier(rows, {
    x: { get: metric.get, goal: metric.xHigherIsBetter ? "maximize" : "minimize" },
    y: { get: getScore, goal: "maximize" },
  });
  const metricValues = rows.map(metric.get);
  const medianMetric = median(metricValues) ?? xDomain[0];
  const scores = rows.map(getScore);
  const medianScore = median(scores) ?? yDomain[0];
  const medianXLabel = `MED ${metric.format(medianMetric)}`;
  const medianYLabel = `MED ${formatScore(medianScore)}`;
  const frontierRows = new Set(frontier);
  // The reached region continues away from the better side: rightward when lower resources win.
  const horizonOpenSide = metric.xHigherIsBetter ? "left" : "right";
  const frontierPoints = frontier.map((row) => ({
    x: xPoint(metric.get(row)),
    y: yPoint(getScore(row)),
  }));
  const rim = horizonRim(frontierPoints, plot, horizonOpenSide);
  const trail = horizonTrail(frontierPoints, plot, horizonOpenSide);
  // The frontier step being read, by the position of the model it reaches.
  const [activeStep, setActiveStep] = useState<number | null>(null);
  // A frontier model's readout ends with its step from the frontier model before it in X order, whether read from its star or from the frontier between them.
  const readoutEntry = (row: Row): ReadoutEntry => {
    const model = getModel(row);
    const index = frontier.indexOf(row);
    const from = index > 0 ? frontier[index - 1]! : null;
    return {
      name: modelName(model),
      logo: modelLogo(model),
      facts: [
        providerDisplayName(model),
        ...getFacts(row),
        ...(from == null ? [] : [`${stepTrade(from, row)} over ${getLabel(from)}`]),
      ],
      open: () => openModelSheet(model),
    };
  };
  /** One step's trade, worded as the sheet's effort steps are: the signed score change at the X change, a multiple on log axes and a signed amount on linear ones. */
  const stepTrade = (from: Row, to: Row) => {
    const gain = getScore(to) - getScore(from);
    const [fromX, toX] = [metric.get(from), metric.get(to)];
    const change = metric.logarithmic
      ? formatResourceRatio(toX / fromX)
      : `${toX < fromX ? "−" : "+"}${metric.format(Math.abs(toX - fromX))}`;
    return `${gain < 0 ? "−" : "+"}${Math.abs(gain).toFixed(1)} at ${change} ${metric.noun}`;
  };
  // A mid-scoring model matches the leaderboard's score star: 6px wide, or 5px on compact layouts.
  const [minMarkRadius, maxMarkRadius] = compact ? [1.75, 3.25] : [2, 3.75];
  const markRadius = (row: Row) => starMarkRadius(getModel(row), minMarkRadius, maxMarkRadius);
  const reasoningGroups = connectReasoningVariants ? reasoningVariantGroups(rows, getModel) : [];
  const reasoningGroupByRow = new Map(
    reasoningGroups.flatMap((group) => group.variants.map((row) => [row, group.key] as const)),
  );
  const family = (row: Row) => canonicalModelKey(getModel(row));
  // Each located family is named and flared at its highest-scoring row.
  const locatedRows = new Map<string, Row>();
  for (const row of rows) {
    const key = family(row);
    const held = locatedRows.get(key);
    if (located.has(key) && (held == null || getScore(row) > getScore(held)))
      locatedRows.set(key, row);
  }
  const activeRow = rows.find((row) => getKey(row) === (highlightedVariantKey ?? pinnedKey));
  const activeVariantKey = activeRow == null ? null : getKey(activeRow);
  // The pointer's guides drop from the pointed star, so they always meet the star whose name is lit.
  const projection =
    activeRow == null
      ? null
      : {
          x: xPoint(metric.get(activeRow)),
          y: yPoint(getScore(activeRow)),
          xValue: metric.get(activeRow),
          yValue: getScore(activeRow),
        };
  const activeReasoningGroup =
    activeRow == null ? null : (reasoningGroupByRow.get(activeRow) ?? null);
  // Place the hovered family's labels first so every connected effort remains identifiable.
  const highlightedRows =
    reasoningGroups.find((group) => group.key === activeReasoningGroup)?.variants ??
    (activeRow == null ? [] : [activeRow]);
  const labeledRows = [
    ...new Set([
      ...highlightedRows,
      ...[...located.keys()].flatMap((key) => locatedRows.get(key) ?? []),
      ...frontier,
    ]),
  ];
  const isHighlighted = (row: Row) =>
    activeReasoningGroup == null
      ? getKey(row) === activeVariantKey
      : reasoningGroupByRow.get(row) === activeReasoningGroup;
  // A focused model dims every other one; while the find field holds a query, the families it matches stay lit and the rest dim.
  const dimmed = (row: Row) =>
    activeVariantKey != null ? !isHighlighted(row) : matches != null && !matches.has(family(row));
  const { svgRef, labelSizes } = useLabelSizes(labeledRows.map(getLabel).join("\0"), compact);
  const nameRequest = (row: Row) => ({
    key: getKey(row),
    label: getLabel(row),
    size: labelSizes[getLabel(row)],
    cx: xPoint(metric.get(row)),
    cy: yPoint(getScore(row)),
    radius: markRadius(row),
  });
  // Protect the corner direction glyph and caption and the medians' names from both text and leaders.
  const reservedBoxes = [
    {
      left: metric.xHigherIsBetter ? plot.right - DIRECTION_LABEL_WIDTH : plot.left,
      right: metric.xHigherIsBetter ? plot.right : plot.left + DIRECTION_LABEL_WIDTH,
      top: plot.top,
      bottom: plot.top + DIRECTION_LABEL_HEIGHT,
    },
    ...medianReadingBoxes(xPoint(medianMetric), yPoint(medianScore), plot, [
      medianXLabel,
      medianYLabel,
    ]),
  ];
  const horizon = horizonSegments(rim, trail);
  const callout = (row: Row, placements: ReadonlyMap<string, PointLabelPlacement>) => {
    const key = getKey(row);
    const label = getLabel(row);
    return {
      key,
      row,
      label,
      cx: xPoint(metric.get(row)),
      cy: yPoint(getScore(row)),
      placement: placements.get(key),
      size: labelSizes[label],
    };
  };
  // The text boxes of the names that are measured and placed.
  const textBoxes = (names: readonly ReturnType<typeof callout>[]) =>
    names.flatMap(({ placement, size }) =>
      placement == null || size == null ? [] : [labelBox(placement, size, 0)],
    );
  const rises: "left" | "right" = metric.xHigherIsBetter ? "left" : "right";
  const skyNames = {
    bounds: labelBounds(plot),
    segments: horizon,
    rises,
    clearance: NAME_CLEARANCE.compact,
  };
  // On a phone every frontier model is named as the Timeline names its curve: in the open sky beside the frontier, or under it where the sky has no room, on a leader where it cannot sit close and never within the name clearance of another.
  const skyKey = compact
    ? JSON.stringify({
        ...skyNames,
        labels: frontier.map(nameRequest),
        reserved: reservedBoxes,
      } satisfies Parameters<typeof placeInSky>[0])
    : null;
  const skyPlacements = useMemo(
    () =>
      skyKey == null ? new Map<string, PointLabelPlacement>() : placeInSky(JSON.parse(skyKey)),
    [skyKey],
  );
  // A phone's frontier names keep their sky places even while pointed, since a name that moved away would leave the finger or cursor that picked it, which would then pick another.
  const skyNamed = compact ? frontier : [];
  const skyCallouts = skyNamed.map((row) => callout(row, skyPlacements));
  const searchedRows = labeledRows.filter((row) => !skyNamed.includes(row));
  // Pointer projections rerender this chart; only changed label geometry should run the search.
  // On a phone the names left to place, a lit model's other efforts and found models, go beside their own stars and keep clear only of lit names, since a dimmed name in their way gives way to them. Wider plots search for every name.
  const layoutKey = compact
    ? JSON.stringify({
        ...skyNames,
        labels: searchedRows.map(nameRequest),
        reserved: [...reservedBoxes, ...textBoxes(skyCallouts.filter(({ row }) => !dimmed(row)))],
      } satisfies Parameters<typeof placeInSky>[0])
    : JSON.stringify({
        bounds: labelBounds(plot),
        reservedBoxes,
        obstacles: rows.map((row) => ({
          key: getKey(row),
          cx: xPoint(metric.get(row)),
          cy: yPoint(getScore(row)),
          radius: markRadius(row),
          weight: activeReasoningGroup != null && !highlightedRows.includes(row) ? 0.15 : 1,
        })),
        segments: [
          ...horizon,
          ...reasoningGroups
            .filter((group) => group.key === activeReasoningGroup)
            .flatMap((group) =>
              polylineSegments(
                group.variants.map((row) => ({
                  x: xPoint(metric.get(row)),
                  y: yPoint(getScore(row)),
                })),
              ),
            ),
        ],
        labels: labeledRows.map((row, index) => {
          const name = nameRequest(row);
          return {
            ...name,
            priority: labeledRows.length - index,
            // The pointer's guides run from its star to both axes, so that star's own name keeps off them; other names may still sit on them.
            ...(getKey(row) === activeVariantKey
              ? {
                  pointerGuides: polylineSegments([
                    { x: plot.left, y: name.cy },
                    { x: name.cx, y: name.cy },
                    { x: name.cx, y: plot.bottom },
                  ]),
                }
              : {}),
          };
        }),
      } satisfies Parameters<typeof calloutLabelPlacements>[0]);
  const placementCache = useRef(new Map<string, Map<string, PointLabelPlacement>>());
  const labelPlacements = useMemo(() => {
    const cache = placementCache.current;
    const cached = cache.get(layoutKey);
    if (cached) return cached;
    const placements = compact
      ? placeInSky(JSON.parse(layoutKey))
      : calloutLabelPlacements(JSON.parse(layoutKey));
    // Retain at most one layout per displayed point plus the resting view; geometry changes use new keys.
    while (cache.size >= rows.length + 1) cache.delete(cache.keys().next().value!);
    cache.set(layoutKey, placements);
    return placements;
  }, [layoutKey, rows.length, compact]);
  const searchedCallouts = searchedRows.map((row) => callout(row, labelPlacements));
  const litBoxes = textBoxes(searchedCallouts.filter(({ row }) => !dimmed(row)));
  // A dimmed sky name under a lit name gives way while the light lasts, rather than show through it.
  const callouts = [
    ...searchedCallouts,
    ...skyCallouts.filter(
      (name) =>
        !dimmed(name.row) ||
        !textBoxes([name]).some((box) => litBoxes.some((lit) => boxesMeet(box, lit))),
    ),
  ];
  // The pointer picks one star at a time, so its guides, colour, and name always agree: a name under the pointer or a tap picks its own star, so a name far from its star is read back to it without following the leader, and elsewhere the nearest star within reach is picked.
  const starAt = (event: ReactMouseEvent<SVGSVGElement>) => {
    const at = pointerPosition(event);
    const named = callouts.find(({ placement, size }) => {
      if (!placement || !size) return false;
      const box = labelBox(placement, size, 3);
      return at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom;
    });
    const star = nearestPoint(
      at,
      plot,
      rows.map((row) => ({
        key: getKey(row),
        x: xPoint(metric.get(row)),
        y: yPoint(getScore(row)),
      })),
    );
    return named?.key ?? star?.key ?? null;
  };
  // A click or tap pins the star it picks, the same on desktop and phones; picking the pinned star again opens its sheet, and picking empty sky lets the pin go.
  const pin = (event: ReactMouseEvent<SVGSVGElement>) => {
    const key = starAt(event);
    const row = rows.find((candidate) => getKey(candidate) === key);
    if (row != null && key === pinnedKey) openModelSheet(getModel(row));
    else setPinnedKey(key);
  };
  const matched = (row: Row) => activeVariantKey == null && matches?.has(family(row)) === true;
  const muted = activeVariantKey != null || matches != null;
  const variantClass = (row: Row) =>
    [
      styles.reasoningVariantPoint,
      dimmed(row)
        ? styles.reasoningVariantPointMuted
        : activeVariantKey == null
          ? ""
          : styles.reasoningVariantPointActive,
      getKey(row) === activeVariantKey ? styles.reasoningVariantPointSelected : "",
    ]
      .filter(Boolean)
      .join(" ");
  const reasoningVariantLines = reasoningGroups.map((group) => ({
    key: group.key,
    color: providerChartColor(getModel(group.variants[0]!).provider),
    segments: starConnectorSegments(
      group.variants.map((row) => ({
        cx: xPoint(metric.get(row)),
        cy: yPoint(getScore(row)),
        radius: markRadius(row),
      })),
    ),
  }));
  const activeHighlightColor =
    activeRow == null ? undefined : providerChartColor(getModel(activeRow).provider);
  const leader = frontier.reduce<Row | undefined>(
    (best, row) => (best == null || getScore(row) > getScore(best) ? row : best),
    undefined,
  );
  const sky: SkyPlotScene = {
    width,
    height,
    bounds: plot,
    sky: true,
    rim,
    trail,
    muted,
    stars: rows.map((row) => ({
      key: getKey(row),
      x: xPoint(metric.get(row)),
      y: yPoint(getScore(row)),
      color: providerChartColor(getModel(row).provider),
      // A star a find query matches takes the frontier's rays, so it stands out of the dimmed field.
      role: row === leader ? "leader" : frontierRows.has(row) || matched(row) ? "frontier" : "star",
      glow: dimmed(row) ? MUTED_STAR_GLOW : 1,
    })),
    flare: activeVariantKey,
    found: [...located].flatMap(([key, at]) => {
      const row = locatedRows.get(key);
      return row == null ? [] : [{ key: getKey(row), at }];
    }),
    compact,
  };
  // The readout names the frontier step or star under the pointer, and rests on the frontier's best-scoring model.
  const readoutRow =
    (activeStep == null ? undefined : frontier[activeStep]) ??
    activeRow ??
    greatest(frontier, getScore);

  return (
    <>
      <ChartReadout
        label="Pareto model details"
        // A frontier model's facts end with its step, which takes a row of its own on phones.
        factRows={2}
        entry={readoutRow == null ? null : readoutEntry(readoutRow)}
      />
      <div
        {...plotHost}
        className={styles.chartWrap}
        style={{ "--chart-max-width": `${CHART_WIDTH}px` } as CSSProperties}
        role="group"
        aria-label={`${ariaLabel} viewport`}
        tabIndex={0}
      >
        <SkyPlot scene={sky}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            ref={svgRef}
            style={highlightedVariantKey == null ? undefined : { cursor: "pointer" }}
            onPointerMove={(event) => {
              if (event.pointerType !== "touch") setHighlightedVariantKey(starAt(event));
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") setHighlightedVariantKey(null);
            }}
            onClick={pin}
          >
            <defs>
              <LabelMask id={guideMaskId} width={width} height={height} labels={callouts} />
              <NameMask id={leaderMaskId} width={width} height={height} labels={callouts} />
              <NameMask
                id={litNameMaskId}
                width={width}
                height={height}
                labels={callouts.filter(({ row }) => !dimmed(row))}
              />
            </defs>
            <PlotFrame width={width} height={height} margin={chartMargin} />
            <CursorCapture bounds={plot} />
            <YAxisTicks
              ticks={yTicks}
              yPoint={yPoint}
              x={plot.left}
              format={formatScore}
              keyPrefix={keyPrefix}
              tickGap={SPREAD_HALF_WIDTH}
              reading={projection?.y}
            />
            <XAxisTicks
              ticks={xTicks}
              xPoint={xPoint}
              y={plot.bottom}
              format={metric.logarithmic ? formatRatioTick : metric.format}
              keyPrefix={keyPrefix}
              labelMinGap={62}
              tickGap={SPREAD_HALF_WIDTH}
              readings={
                projection == null
                  ? []
                  : [
                      {
                        x: projection.x,
                        text: metric.format(projection.xValue),
                        anchor: "middle",
                      },
                    ]
              }
            />
            <YAxisTitle height={height} margin={chartMargin} title={yAxisLabel} compact={compact} />
            <g mask={`url(#${guideMaskId})`}>
              {metric.logarithmic ? (
                <line
                  className={styles.medianAxis}
                  x1={xPoint(1)}
                  x2={xPoint(1)}
                  y1={plot.top}
                  y2={plot.bottom}
                  strokeDasharray="3 4"
                  aria-label="1× benchmark-median resource use"
                />
              ) : null}
              <MedianCross
                x={xPoint(medianMetric)}
                y={yPoint(medianScore)}
                bounds={plot}
                xLabel={
                  projection &&
                  Math.abs(projection.x - xPoint(medianMetric)) < MEDIAN_LABEL_CLEARANCE
                    ? ""
                    : medianXLabel
                }
                yLabel={medianYLabel}
              />
              <AxisDistribution
                axis="y"
                values={scores}
                edge={plot.left}
                point={yPoint}
                label={yAxisLabel}
                format={formatScore}
              />
              <AxisDistribution
                axis="x"
                values={metricValues}
                edge={plot.bottom}
                point={xPoint}
                label={metric.noun}
                format={metric.format}
              />
            </g>
            <DirectionArrow
              bounds={plot}
              direction={metric.xHigherIsBetter ? "upper-right" : "upper-left"}
              label="Better"
            />
            {/* The pointer's guides run unbroken through dimmed names to both axes, and pass behind the lit names, whose colour they share. */}
            <g mask={`url(#${litNameMaskId})`}>
              <CursorProjectionLayer
                projection={projection}
                bounds={plot}
                stars={sky.stars}
                xLabel={projection ? metric.format(projection.xValue) : ""}
                yLabel={projection ? formatScore(projection.yValue) : ""}
                color={activeHighlightColor}
              />
            </g>
            {reasoningVariantLines.flatMap((line) =>
              line.segments.map((segment, index) => (
                <line
                  {...segment}
                  x1={stableSvgNumber(segment.x1)}
                  y1={stableSvgNumber(segment.y1)}
                  x2={stableSvgNumber(segment.x2)}
                  y2={stableSvgNumber(segment.y2)}
                  aria-hidden="true"
                  key={`${line.key}-${index}`}
                  className={[
                    styles.reasoningVariantLine,
                    activeReasoningGroup != null && line.key === activeReasoningGroup
                      ? styles.reasoningVariantLineActive
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    {
                      "--line-color": line.color,
                    } as CSSProperties
                  }
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}
            <FrontierHorizon
              points={frontierPoints}
              bounds={plot}
              open={horizonOpenSide}
              muted={muted}
            />
            {/* Each step along the frontier answers the pointer with the trade it makes; the stars' own targets sit above it. */}
            {frontier.map((row, index) => {
              if (index === 0) return null;
              const segment = {
                x1: frontierPoints[index - 1]!.x,
                y1: frontierPoints[index - 1]!.y,
                x2: frontierPoints[index]!.x,
                y2: frontierPoints[index]!.y,
              };
              return (
                <g key={`step-${getKey(row)}`}>
                  {activeStep === index ? (
                    <line className={styles.frontierStep} {...segment} />
                  ) : null}
                  <line
                    className={styles.frontierStepReach}
                    data-capture-exclude
                    {...segment}
                    onPointerEnter={() => setActiveStep(index)}
                    onPointerLeave={() => setActiveStep(null)}
                  />
                </g>
              );
            })}
            {/* Only frontier models glow; a muted effort variant loses its glow while another model is hovered. */}
            <StarGlows
              bounds={plot}
              stars={frontier.map((row) => ({
                key: getKey(row),
                cx: xPoint(metric.get(row)),
                cy: yPoint(getScore(row)),
                radius: markRadius(row),
                color: providerChartColor(getModel(row).provider),
                emphasis: "frontier",
                opacity: dimmed(row) ? 0 : 1,
              }))}
            />
            {rows.map((row) => {
              const cx = xPoint(metric.get(row));
              const cy = yPoint(getScore(row));
              const model = getModel(row);
              const variantKey = getKey(row);
              return (
                <g className={variantClass(row)} key={getKey(row)}>
                  <circle
                    className={`${styles.starCore} ${styles.datavizPoint}`}
                    cx={cx}
                    cy={cy}
                    {...starCore(markRadius(row), providerChartColor(model.provider))}
                    opacity={frontierRows.has(row) ? 1 : 0.86}
                  />
                  <PointHitTarget
                    cx={cx}
                    cy={cy}
                    model={model}
                    onActiveChange={(active) =>
                      setHighlightedVariantKey(active ? variantKey : null)
                    }
                  />
                </g>
              );
            })}
            {callouts.map(({ key, row, label, cx, cy, placement }) => {
              return (
                <g
                  className={variantClass(row)}
                  key={`label-${key}`}
                  style={
                    isHighlighted(row)
                      ? ({ "--projection-color": activeHighlightColor } as CSSProperties)
                      : undefined
                  }
                >
                  <TextPointLabel
                    label={label}
                    cx={cx}
                    cy={cy}
                    width={width}
                    margin={chartMargin}
                    height={height}
                    xOffset={markRadius(row) + 8}
                    placement={placement}
                    leaderMask={leaderMaskId}
                  />
                </g>
              );
            })}
          </svg>
        </SkyPlot>
      </div>
    </>
  );
}

/** Bridge the small pointer gap between a point and its temporary label without retaining an abandoned hover. */
function useVariantHighlight() {
  const [key, setKey] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearTimer.current != null) clearTimeout(clearTimer.current);
    },
    [],
  );
  const highlight = (next: string | null) => {
    if (clearTimer.current != null) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    if (next == null) clearTimer.current = setTimeout(() => setKey(null), HOVER_EXIT_DELAY_MS);
    else setKey(next);
  };
  return [key, highlight] as const;
}

/** An axis carries its plotted values' spread: a box over the middle half, whiskers from it out to the lowest and highest values, and a mark at the median the median guide continues. */
function AxisDistribution({
  axis,
  values,
  edge,
  point,
  label,
  format,
}: {
  axis: "x" | "y";
  values: readonly number[];
  /** The plot edge the axis runs along: its left for `y`, its bottom for `x`. */
  edge: number;
  point: (value: number) => number;
  label: string;
  format: (value: number) => string;
}) {
  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0]!;
  const max = sorted.at(-1)!;
  const q1 = quantileSorted(sorted, 0.25)!;
  const median = quantileSorted(sorted, 0.5)!;
  const q3 = quantileSorted(sorted, 0.75)!;
  // Marks are laid out along the axis and across it, then set as SVG x and y for the axis's direction.
  const segment = (from: number, to: number, reach: number) =>
    axis === "y"
      ? { x1: edge - reach, x2: edge + reach, y1: from, y2: to }
      : { x1: from, x2: to, y1: edge - reach, y2: edge + reach };
  const tick = (value: number, reach: number) => segment(point(value), point(value), reach);
  const boxStart = Math.min(point(q1), point(q3));
  const boxLength = Math.abs(point(q3) - point(q1));
  return (
    <g
      role="img"
      aria-label={`${label} distribution from ${format(min)} to ${format(max)}, first quartile ${format(q1)}, median ${format(median)}, and third quartile ${format(q3)}`}
    >
      <line className={styles.axisRange} {...segment(point(min), point(q1), 0)} />
      <line className={styles.axisRange} {...segment(point(q3), point(max), 0)} />
      <line className={styles.axisRange} {...tick(min, SPREAD_HALF_WIDTH)} />
      <line className={styles.axisRange} {...tick(max, SPREAD_HALF_WIDTH)} />
      <rect
        className={styles.axisQuartiles}
        {...(axis === "y"
          ? {
              x: edge - SPREAD_HALF_WIDTH,
              y: boxStart,
              width: SPREAD_HALF_WIDTH * 2,
              height: boxLength,
            }
          : {
              x: boxStart,
              y: edge - SPREAD_HALF_WIDTH,
              width: boxLength,
              height: SPREAD_HALF_WIDTH * 2,
            })}
      />
      <line className={styles.axisMedian} {...tick(median, SPREAD_HALF_WIDTH)} />
    </g>
  );
}
