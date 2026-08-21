/** Pareto frontier panel for model intelligence and value tradeoffs. */

import { median, pairs } from "d3-array";
import { scaleLinear } from "d3-scale";
import { type CSSProperties, memo } from "react";

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelVariantKey, shortLabel } from "../shared/model-display";
import { providerChartColor } from "../shared/provider-theme";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { valueDistribution } from "./chart-stats";
import { EmptyChart, ShapeScaleLegend } from "./ChartComponents";
import { finite, fmtTooltipMoney, fmtTooltipScore } from "./format";
import { Panel } from "./Panel";
import { scoreAxisScale } from "./plot/axis-scale";
import {
  CursorCapture,
  CursorProjectionLayer,
  PointHitTarget,
  useCursorProjection,
} from "./plot/Interaction";
import { calloutLabelPlacements } from "./plot/label-placement";
import {
  AxisTitles,
  DirectionArrow,
  MedianCross,
  ModelPointLabel,
  ModelScoreMark,
  plotBoundsFor,
  PlotFrame,
  SCATTER_CHART_HEIGHT,
  SCATTER_CHART_MARGIN,
  SCATTER_CHART_WIDTH,
  stableSvgScale,
  XAxisTicks,
  YAxisTicks,
} from "./plot/Primitives";
import { scoreQuadrilateralRadius } from "./plot/score-quadrilateral";
import type { HoverRow, HoverSetter } from "./types";

import styles from "./graphs.module.css";

const SCORE_AXIS_FORMAT_OPTIONS = {
  formatTick: (tick: number) => tick.toFixed(0),
};
export const ParetoFrontierPanel = memo(function ParetoFrontierPanel({
  models,
  setHover,
}: {
  models: ModelAtlasModel[];
  setHover: HoverSetter;
}) {
  const { cursorProjection, cursorHandlers, setCursorProjection } = useCursorProjection();
  const candidates = models
    .filter(
      (model) =>
        finite(model.scores?.intelligence_score) &&
        finite(model.scores?.value_score) &&
        finite(model.cost?.blended_price) &&
        Number(model.cost?.blended_price) > 0,
    )
    .sort((left, right) => Number(left.scores?.value_score) - Number(right.scores?.value_score));

  if (candidates.length === 0) {
    return (
      <Panel
        captureWidth={SCATTER_CHART_WIDTH}
        sectionId="pareto-frontier"
        sectionLabel="Tradeoff view · Intelligence × Value"
        title="Pareto Frontier"
        copy={
          <>
            Each point is a visible model variant. Up and right means stronger <em>Intelligence</em>{" "}
            and <em>Value</em>.
          </>
        }
      >
        <EmptyChart />
      </Panel>
    );
  }

  const width = SCATTER_CHART_WIDTH;
  const height = SCATTER_CHART_HEIGHT;
  const margin = SCATTER_CHART_MARGIN;
  const values = candidates.map((model) => Number(model.scores.value_score));
  const scores = candidates.map((model) => model.scores.intelligence_score);
  const frontierDescending: ModelAtlasModel[] = [];
  let bestFromRight = -Infinity;
  for (const model of [...candidates].sort(
    (left, right) => Number(right.scores.value_score) - Number(left.scores.value_score),
  )) {
    const score = model.scores.intelligence_score;
    if (score > bestFromRight) {
      frontierDescending.push(model);
      bestFromRight = score;
    }
  }
  const frontier = frontierDescending.reverse();
  const scoreDistribution = valueDistribution(scores);
  const valueAxis = scoreAxisScale(values, SCORE_AXIS_FORMAT_OPTIONS);
  const intelligenceAxis = scoreAxisScale(scores, SCORE_AXIS_FORMAT_OPTIONS);
  const xDomain = valueAxis.domain;
  const yDomain = intelligenceAxis.domain;
  const x = scaleLinear()
    .domain(xDomain)
    .range([margin.left, width - margin.right])
    .clamp(true);
  const y = scaleLinear()
    .domain(yDomain)
    .range([height - margin.bottom, margin.top])
    .clamp(true);
  const xPoint = stableSvgScale(x);
  const yPoint = stableSvgScale(y);
  const medianValue = median(values) ?? xDomain[0];
  const medianScore = median(scores) ?? 50;
  const frontierIds = new Set(frontier.map(modelVariantKey));
  const frontierSegments = pairs(frontier).map(([fromModel, toModel], index) => {
    const fromX = xPoint(Number(fromModel.scores.value_score));
    const fromY = yPoint(fromModel.scores.intelligence_score);
    const toX = xPoint(Number(toModel.scores.value_score));
    const toY = yPoint(toModel.scores.intelligence_score);
    return {
      gradientId: `pareto-frontier-gradient-${index + 1}`,
      fromColor: providerChartColor(fromModel.provider),
      toColor: providerChartColor(toModel.provider),
      fromX,
      fromY,
      toX,
      toY,
      path: `M${fromX},${fromY} H${toX} V${toY}`,
    };
  });
  const plot = plotBoundsFor(width, height, margin);
  const medianX = xPoint(medianValue);
  const medianY = yPoint(medianScore);
  const yTicks = intelligenceAxis.ticks;
  const xTicks = valueAxis.ticks;
  const plottedCandidates = candidates;
  const markRadius = (model: ModelAtlasModel) => scoreQuadrilateralRadius(model, 3, 10);
  const projectionPoints = plottedCandidates.map((model) => {
    const xValue = Number(model.scores.value_score);
    const yValue = model.scores.intelligence_score;
    return {
      x: xPoint(xValue),
      y: yPoint(yValue),
      xValue,
      yValue,
    };
  });
  const projectionHandlers = cursorHandlers({
    bounds: plot,
    points: projectionPoints,
  });
  const labelPlacements = calloutLabelPlacements({
    bounds: plot,
    obstacles: plottedCandidates.map((model) => ({
      cx: xPoint(Number(model.scores.value_score)),
      cy: yPoint(model.scores.intelligence_score),
      radius: markRadius(model),
    })),
    labels: frontier.map((model, index) => ({
      key: modelVariantKey(model),
      label: shortLabel(model),
      cx: xPoint(Number(model.scores.value_score)),
      cy: yPoint(model.scores.intelligence_score),
      radius: markRadius(model),
      priority: frontier.length - index,
    })),
    fontSize: 11,
    charWidth: 6.6,
    lineHeight: 13,
  });

  return (
    <Panel
      captureWidth={SCATTER_CHART_WIDTH}
      sectionId="pareto-frontier"
      sectionLabel="Tradeoff view · Intelligence × Value"
      title="Pareto Frontier"
      copy={
        <>
          Each point is a visible model variant. Up and right means stronger <em>Intelligence</em>{" "}
          and <em>Value</em>.
        </>
      }
      summary={
        <BoxWhiskerSummary
          label="Intelligence Score"
          distribution={scoreDistribution}
          domainMax={100}
          showDomainEndpoints
        />
      }
      note={
        <>
          Step line: displayed <em>Intelligence</em> versus <em>Value</em> tradeoff envelope.
        </>
      }
    >
      <div className={styles.chartToolbar}>
        <div className={styles.chartToolbarCaption}>
          <ShapeScaleLegend />
        </div>
      </div>
      <div
        className={styles.chartWrap}
        style={{ "--chart-max-width": `${width}px` } as CSSProperties}
        role="group"
        aria-label="Intelligence by Value Score chart viewport"
        tabIndex={0}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Intelligence by Value Score scatter plot"
          {...projectionHandlers}
        >
          <defs>
            {frontierSegments.map((segment) => (
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
          <PlotFrame width={width} height={height} margin={margin} />
          <CursorCapture bounds={plot} />
          <YAxisTicks
            ticks={yTicks}
            yPoint={yPoint}
            x={plot.left}
            format={(tick) => String(tick)}
            keyPrefix="frontier"
          />
          <XAxisTicks
            ticks={xTicks}
            xPoint={xPoint}
            y={plot.bottom}
            format={(tick) => tick.toFixed(0)}
            keyPrefix="frontier"
          />
          <AxisTitles
            width={width}
            height={height}
            margin={margin}
            x="Value Score"
            y="Intelligence Score"
            xTitleOffset={48}
          />
          <MedianCross
            x={medianX}
            y={medianY}
            bounds={plot}
            xLabel={medianValue.toFixed(0)}
            yLabel={medianScore.toFixed(0)}
          />
          <DirectionArrow bounds={plot} direction="upper-right" label="Better" />
          <CursorProjectionLayer
            projection={cursorProjection}
            bounds={plot}
            xLabel={cursorProjection ? cursorProjection.xValue.toFixed(1) : ""}
            yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
          />
          {frontierSegments.map((segment) => (
            <path
              className={styles.frontier}
              d={segment.path}
              key={segment.gradientId}
              stroke={`url(#${segment.gradientId})`}
            />
          ))}
          {plottedCandidates.map((model) => {
            const cx = xPoint(Number(model.scores.value_score));
            const cy = yPoint(model.scores.intelligence_score);
            const isFrontier = frontierIds.has(modelVariantKey(model));
            const rows: HoverRow[] = [
              ["Intelligence Score", fmtTooltipScore(model.scores.intelligence_score)],
              ["Agentic Score", fmtTooltipScore(model.scores.agentic_score)],
              ["Speed Score", fmtTooltipScore(model.scores.speed_score)],
              ["Value Score", fmtTooltipScore(model.scores.value_score)],
              ["Blended price", fmtTooltipMoney(Number(model.cost?.blended_price))],
            ];
            return (
              <g
                className={isFrontier ? styles.frontierPoint : styles.paretoBackgroundPoint}
                key={modelVariantKey(model) || `${cx}-${cy}`}
              >
                <ModelScoreMark
                  className={styles.datavizPoint}
                  model={model}
                  cx={cx}
                  cy={cy}
                  radius={markRadius(model)}
                  fill={providerChartColor(model.provider)}
                  stroke={
                    isFrontier ? "var(--chart-point-stroke-strong)" : "var(--chart-point-stroke)"
                  }
                  strokeWidth={isFrontier ? 1.4 : 1}
                  opacity={1}
                />
                <PointHitTarget
                  cx={cx}
                  cy={cy}
                  model={model}
                  rows={rows}
                  setHover={setHover}
                  snapProjection={{
                    x: cx,
                    y: cy,
                    xValue: Number(model.scores.value_score),
                    yValue: model.scores.intelligence_score,
                  }}
                  setCursorProjection={setCursorProjection}
                />
                {isFrontier ? (
                  <ModelPointLabel
                    model={model}
                    cx={cx}
                    cy={cy}
                    width={width}
                    margin={margin}
                    height={height}
                    placement={labelPlacements.get(modelVariantKey(model))}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
});
