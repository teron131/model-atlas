/** Pareto frontier panel for model intelligence and value tradeoffs. */

import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import { type CSSProperties, memo, useState } from "react";

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelVariantKey, reasoningVariantGroups, shortLabel } from "../shared/model-display";
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
import { ParetoEnvelope, paretoFrontier } from "./plot/ParetoEnvelope";
import {
  AxisTitles,
  DirectionArrow,
  MedianCross,
  ModelScoreMark,
  plotBoundsFor,
  PlotFrame,
  SCATTER_CHART_HEIGHT,
  SCATTER_CHART_MARGIN,
  SCATTER_CHART_WIDTH,
  stableSvgScale,
  TextPointLabel,
  XAxisTicks,
  YAxisTicks,
} from "./plot/Primitives";
import {
  scoreQuadrilateralConnectorSegments,
  scoreQuadrilateralRadius,
} from "./plot/score-quadrilateral";
import type { HoverRow, HoverSetter } from "./types";

import styles from "./graphs.module.css";

const SCORE_AXIS_FORMAT_OPTIONS = {
  formatTick: (tick: number) => tick.toFixed(0),
};
const intelligenceScore = (model: ModelAtlasModel) => model.scores.intelligence_score;
const valueScore = (model: ModelAtlasModel) => Number(model.scores.value_score);

export const ParetoFrontierPanel = memo(function ParetoFrontierPanel({
  models,
  showVariants,
  setHover,
}: {
  models: ModelAtlasModel[];
  showVariants: boolean;
  setHover: HoverSetter;
}) {
  const { cursorProjection, cursorHandlers, setCursorProjection } = useCursorProjection();
  const [highlightedVariantKey, setHighlightedVariantKey] = useState<string | null>(null);
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
  const values = candidates.map(valueScore);
  const scores = candidates.map(intelligenceScore);
  const frontier = paretoFrontier(candidates, {
    x: { get: valueScore, goal: "maximize" },
    y: { get: intelligenceScore, goal: "maximize" },
  });
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
  const markRadius = (model: ModelAtlasModel) => scoreQuadrilateralRadius(model, 2.5, 8);
  const reasoningGroups = showVariants ? reasoningVariantGroups(candidates, (model) => model) : [];
  const reasoningGroupByVariant = new Map(
    reasoningGroups.flatMap((group) =>
      group.variants.map((model) => [modelVariantKey(model), group.key] as const),
    ),
  );
  const activeVariant = candidates.find(
    (model) => modelVariantKey(model) === highlightedVariantKey,
  );
  const activeVariantKey = activeVariant == null ? null : highlightedVariantKey;
  const activeReasoningGroup =
    activeVariantKey == null ? null : (reasoningGroupByVariant.get(activeVariantKey) ?? null);
  const reasoningVariantLines = reasoningGroups.flatMap((group) => {
    const first = group.variants[0];
    if (first == null) {
      return [];
    }
    return [
      {
        key: group.key,
        color: providerChartColor(first.provider),
        segments: scoreQuadrilateralConnectorSegments(
          group.variants.map((model) => ({
            model,
            cx: xPoint(Number(model.scores.value_score)),
            cy: yPoint(model.scores.intelligence_score),
            radius: markRadius(model),
          })),
        ),
      },
    ];
  });
  const activeHighlightColor =
    activeVariant == null ? undefined : providerChartColor(activeVariant.provider);
  const plot = plotBoundsFor(width, height, margin);
  const medianX = xPoint(medianValue);
  const medianY = yPoint(medianScore);
  const yTicks = intelligenceAxis.ticks;
  const xTicks = valueAxis.ticks;
  const plottedCandidates = candidates;
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
          Frontier line: displayed <em>Intelligence</em> versus <em>Value</em> tradeoff envelope.
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
            color={activeHighlightColor}
          />
          {reasoningVariantLines.flatMap((line) =>
            line.segments.map((segment, index) => (
              <line
                {...segment}
                aria-hidden="true"
                className={[
                  styles.reasoningVariantLine,
                  activeVariantKey == null
                    ? ""
                    : activeReasoningGroup != null && line.key === activeReasoningGroup
                      ? styles.reasoningVariantLineActive
                      : styles.reasoningVariantLineMuted,
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={`${line.key}-${index}`}
                style={{ "--line-color": line.color } as CSSProperties}
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
          <ParetoEnvelope
            frontier={frontier}
            getX={valueScore}
            getY={intelligenceScore}
            xPoint={xPoint}
            yPoint={yPoint}
            getColor={(model) => providerChartColor(model.provider)}
            idPrefix="pareto-frontier"
            className={[
              styles.frontier,
              activeVariantKey == null ? "" : styles.reasoningContextMuted,
            ]
              .filter(Boolean)
              .join(" ")}
          />
          {plottedCandidates.map((model) => {
            const cx = xPoint(Number(model.scores.value_score));
            const cy = yPoint(model.scores.intelligence_score);
            const isFrontier = frontierIds.has(modelVariantKey(model));
            const variantKey = modelVariantKey(model);
            const reasoningGroupKey = reasoningGroupByVariant.get(variantKey);
            const isActiveVariant =
              activeVariantKey != null &&
              (activeReasoningGroup == null
                ? variantKey === activeVariantKey
                : reasoningGroupKey === activeReasoningGroup);
            const reasoningHighlightClass =
              activeVariantKey == null
                ? ""
                : isActiveVariant
                  ? styles.reasoningVariantPointActive
                  : styles.reasoningVariantPointMuted;
            const rows: HoverRow[] = [
              ["Intelligence Score", fmtTooltipScore(model.scores.intelligence_score)],
              ["Agentic Score", fmtTooltipScore(model.scores.agentic_score)],
              ["Speed Score", fmtTooltipScore(model.scores.speed_score)],
              ["Value Score", fmtTooltipScore(model.scores.value_score)],
              ["Blended price", fmtTooltipMoney(Number(model.cost?.blended_price))],
            ];
            return (
              <g
                className={[
                  isFrontier ? styles.frontierPoint : styles.paretoBackgroundPoint,
                  styles.reasoningVariantPoint,
                  reasoningHighlightClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
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
                  clearance={showVariants ? 2 : 0}
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
                  onActiveChange={(active) => setHighlightedVariantKey(active ? variantKey : null)}
                />
                {isFrontier ? (
                  <TextPointLabel
                    label={shortLabel(model)}
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
