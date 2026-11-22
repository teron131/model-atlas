"use client";

/** Effort: the strongest models' reasoning efforts, and those of any model the find field brings in, as bars rising from zero on one shared scale, for a score or the leaderboard's Cost×, Time×, or Tokens×; each effort keeps one solid shade of its lab's colour, from faint at low to full at max, so a model's bars read in effort order without labels. */

import { group } from "d3-array";
import { scaleLinear, scaleSqrt } from "d3-scale";
import { type CSSProperties, useState } from "react";

import { formatResourceRatio } from "../../../shared/resource-ratio-display";
import { providerChartColor, providerLogo } from "../../shared/provider-theme";
import type { DashboardUrlState } from "../../url-state";
import { useUrlState } from "../../use-url-state";
import {
  type ChartData,
  type ChartVariant,
  findDocuments,
  findId,
  findSuggestion,
  NOTHING_FOUND,
  TOP_MODELS,
} from "../chart-data";
import {
  ChartFind,
  chartFindTargets,
  foundModelsPhrase,
  lastLocated,
  useChartFind,
} from "../ChartFind";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { FigureRegion } from "../FigureRegion";
import { formatTooltipScore } from "../format";
import { GraphToggle } from "../GraphToggle";
import { usePick } from "../plot/Interaction";
import { type Margin, plotBoundsFor } from "../plot/Primitives";
import { SkyFigure } from "../plot/SkyFigure";
import { useChartLayout } from "../use-chart-layout";

import graphs from "../graphs.module.css";

// Each measure under its link's name, `/effort?measure=time`, named as the leaderboard's column and, in the readout, as a word; a score reads 0–100 and a ratio is a multiple of the benchmark medians.
type Metric = {
  key: DashboardUrlState["effort-measure"];
  label: string;
  word: string;
  kind: "score" | "ratio";
  read: (variant: ChartVariant) => number | null;
};
const INTELLIGENCE: Metric = {
  key: "intelligence",
  label: "Intelligence",
  word: "Intelligence",
  kind: "score",
  read: (variant) => variant.intelligence,
};
const AGENTIC: Metric = {
  key: "agentic",
  label: "Agentic",
  word: "Agentic",
  kind: "score",
  read: (variant) => variant.agentic,
};
const COST: Metric = {
  key: "cost",
  label: "Cost×",
  word: "Cost",
  kind: "ratio",
  read: (variant) => variant.ratios.cost,
};
const TIME: Metric = {
  key: "time",
  label: "Time×",
  word: "Time",
  kind: "ratio",
  read: (variant) => variant.ratios.time,
};
const TOKENS: Metric = {
  key: "tokens",
  label: "Tokens×",
  word: "Tokens",
  kind: "ratio",
  read: (variant) => variant.ratios.tokens,
};
const METRICS = [INTELLIGENCE, AGENTIC, COST, TIME, TOKENS];

const HEIGHT = 448;
// The bottom margin holds each model's logo and two-line name, and the left one the axis labels up to the median's "MED 1.0×".
const MARGIN: Margin = { top: 12, right: 12, bottom: 64, left: 72 };
// The tallest bar stops this far under the plot's top, leaving room for its value.
const VALUE_ROOM = 26;
// A model's band never gets narrower than this, room for its name's longer line and five bars; a narrower host scrolls the plot sideways instead.
const MODEL_ROOM = 96;
const BAR = { most: 14, gap: 3 };
// A ratio axis steps 1, 2, 5 through each decade from 0.1× up, and keeps this much height between two tick labels, since the steps crowd toward zero.
const RATIO_STEPS = [0.1, 1, 10, 100].flatMap((decade) => [decade, 2 * decade, 5 * decade]);
const TICK_ROOM = 20;
// A ratio of 1× is the benchmark median the leaderboard's ratios measure from, where Pareto draws its dashed guide too.
const MEDIAN_RATIO = 1;
// Each effort's share of its lab's colour: one shade per effort across every model, so a model's bars read in effort order and the legend names them once; a model's only, default effort takes the middle shade.
const EFFORT_SHADES: Record<string, number> = {
  none: 0.2,
  minimal: 0.26,
  low: 0.34,
  medium: 0.48,
  high: 0.62,
  xhigh: 0.78,
  max: 0.95,
};
const DEFAULT_SHADE = EFFORT_SHADES.high!;
const LEGEND = ["low", "medium", "high", "xhigh", "max"] as const;
// A paper outline around a reading, so a guide or grid line behind it never runs through its digits.
const HALO = {
  stroke: "var(--paper)",
  strokeWidth: 4,
  strokeLinejoin: "round",
  paintOrder: "stroke",
} as const satisfies CSSProperties;

export function EffortPanel({ data }: { data: ChartData }) {
  const [measure, setMeasure] = useUrlState("effort-measure");
  const documents = findDocuments(data.rows);
  const [find, setFind] = useChartFind("effort-find", documents, findSuggestion, findId);
  // The find field locates leaderboard rows; the chart groups a model's efforts by the row's family.
  const familyByRow = new Map(data.rows.map((row) => [row.key, row.family]));
  const found = new Set([...find.located.keys()].map((key) => familyByRow.get(key)));
  const targets = chartFindTargets(find, documents, findSuggestion);
  const matches = targets == null ? null : new Set(targets.map((row) => row.family));
  const metric = METRICS.find((each) => each.key === measure)!;
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = usePick<string>();
  const layout = useChartLayout(1120);
  // Each model's efforts the measure covers, strongest model first; a model the measure covers at none has no bars, so it gives its place to the next and a find naming it adds nothing until another measure is chosen.
  const measured = [...group(data.variants, (variant) => variant.family).values()]
    .sort((a, b) => strongest(b) - strongest(a))
    .map((family) => family.filter((variant) => metric.read(variant) != null))
    .filter((family) => family.length > 0);
  const strongestFamilies = measured.slice(0, TOP_MODELS);
  const foundFamilies = measured.filter(
    (family) => found.has(family[0]!.family) && !strongestFamilies.includes(family),
  );
  const families = [...strongestFamilies, ...foundFamilies].sort(
    (a, b) => peak(a, metric) - peak(b, metric),
  );
  const width = Math.max(layout.width, MARGIN.left + MARGIN.right + families.length * MODEL_ROOM);
  const bounds = plotBoundsFor(width, HEIGHT, MARGIN);
  const { y, ticks } = measureAxis(
    metric,
    families.flatMap((family) => family.map((variant) => metric.read(variant)!)),
    [bounds.bottom, bounds.top + VALUE_ROOM],
  );
  const band = (bounds.right - bounds.left) / Math.max(1, families.length);
  // Each model's bars centred in its band; a model's value names its tallest bar, and a pointed bar names its own value instead, above it.
  const columns = families.map((family, index) => {
    const centre = bounds.left + index * band + band / 2;
    const barWidth = Math.min(BAR.most, (band - 24) / family.length - BAR.gap);
    const start = centre - (family.length * (barWidth + BAR.gap) - BAR.gap) / 2;
    const bars = family.map((variant, column) => ({
      variant,
      x: start + column * (barWidth + BAR.gap),
      width: barWidth,
      top: y(metric.read(variant)!),
    }));
    const tallest = bars.reduce((held, bar) => (bar.top < held.top ? bar : held));
    const label = formatValue(metric, metric.read(tallest.variant)!);
    return { id: family[0]!.family, model: family[0]!, family, centre, bars, tallest, label };
  });
  const bars = columns.flatMap((column) => column.bars);
  // The bar under the pointer, else the one a click holds.
  const pointed = bars.find((bar) => bar.variant.key === (hovered ?? picked));
  // The pointed bar's guide and its reading take its lab's colour, as the Pareto pointer's guides do.
  const projection =
    pointed == null
      ? undefined
      : ({ "--projection-color": providerChartColor(pointed.variant.provider) } as CSSProperties);
  // At rest the readout spans the model found last, else the one with the highest value, the one the plot ends on; a plot that scrolls keeps it in view.
  const foundLast = lastLocated(find.located);
  const restingId = foundLast == null ? undefined : familyByRow.get(foundLast);
  const resting = columns.find((column) => column.id === restingId) ?? columns.at(-1);
  // With nothing pointed, a query in the find field quiets the models it does not name, as in Duels; a pointed bar quiets every other bar and every model's value instead.
  const outsideFind = (id: string) => pointed == null && matches != null && !matches.has(id);
  const foundPhrase = foundModelsPhrase(foundFamilies.length);

  return (
    <FigureRegion
      id="pareto"
      capture={{ title: "Reasoning effort", fileName: "model-atlas-effort" }}
      top={
        <>
          <GraphToggle
            legend="Measure"
            options={[...METRICS]}
            selectedKey={measure}
            onSelect={setMeasure}
          />
          <ChartFind
            label="Bring models into the Effort chart"
            find={find}
            documents={documents}
            describe={findSuggestion}
            onChange={setFind}
            nothingFound={() => NOTHING_FOUND}
          />
        </>
      }
      foot={<ShadeLegend />}
      caption={
        <p>
          {`Compare each reasoning effort's ${metric.label} for the ${strongestFamilies.length} strongest models${foundPhrase == null ? "" : `, ${foundPhrase}`}, ordered by their highest value.`}
        </p>
      }
    >
      <ChartReadout
        label="Effort details"
        factRows={2}
        entry={
          pointed != null
            ? variantEntry(pointed.variant)
            : resting == null
              ? null
              : resting.family.length === 1
                ? variantEntry(resting.model)
                : spanEntry(resting.family, metric)
        }
      />
      <SkyFigure
        layout={layout}
        width={width}
        pinned={{
          width: MARGIN.left,
          marks: ticks.map(({ tick, label, median }) => (
            <text
              key={tick}
              className={median ? graphs.medianLabel : graphs.axisLabel}
              x={bounds.left - 12}
              y={y(tick) + 4}
              textAnchor="end"
            >
              {label}
            </text>
          )),
        }}
        height={HEIGHT}
        bounds={bounds}
        sky={false}
        stars={[]}
        flare={null}
        label={`${metric.label} by reasoning effort for ${families.length} models`}
        reveal={resting?.centre}
        onLeave={() => setHovered(null)}
      >
        {/* Pressing anywhere on the plot, between models too, pans it sideways when it scrolls; pointing between models lets the hovered bar go, and a click there lets the held one go. */}
        <rect
          className={graphs.cursorCapture}
          x={0}
          y={0}
          width={width}
          height={HEIGHT}
          data-pans
          onPointerMove={() => setHovered(null)}
        />
        {families.length === 0 ? (
          <text
            className={graphs.axisLabel}
            x={(bounds.left + bounds.right) / 2}
            y={(bounds.top + bounds.bottom) / 2}
            textAnchor="middle"
          >
            {data.variants.length === 0
              ? NOTHING_FOUND
              : `No model the dashboard's filters admit reports ${metric.label}.`}
          </text>
        ) : null}
        {ticks.map(({ tick, median }) =>
          median ? (
            <line
              key={tick}
              className={graphs.medianAxis}
              x1={bounds.left}
              x2={bounds.right}
              y1={y(tick)}
              y2={y(tick)}
              strokeDasharray="3 4"
              aria-label="1× benchmark-median resource use"
            />
          ) : (
            <line
              key={tick}
              className={graphs.rowRule}
              x1={bounds.left}
              x2={bounds.right}
              y1={y(tick)}
              y2={y(tick)}
            />
          ),
        )}
        {columns.map(({ id, model, centre, bars: modelBars }) => {
          const color = providerChartColor(model.provider);
          const logo = providerLogo(model.provider);
          const [line1, line2] = splitName(model.name);
          return (
            <g key={id}>
              {modelBars.map((bar) => (
                <rect
                  key={bar.variant.key}
                  x={bar.x}
                  y={bar.top}
                  width={bar.width}
                  height={Math.max(0, bounds.bottom - bar.top)}
                  style={{
                    fill:
                      outsideFind(id) || (pointed != null && bar !== pointed)
                        ? quieted(shadeFill(color, bar.variant.effort))
                        : shadeFill(color, bar.variant.effort),
                  }}
                />
              ))}
              {modelBars.map((bar) => (
                <rect
                  key={bar.variant.key}
                  className={graphs.hit}
                  data-pans
                  data-keeps-pick
                  x={bar.x - BAR.gap / 2}
                  y={bounds.top}
                  width={bar.width + BAR.gap}
                  height={bounds.bottom - bounds.top}
                  onPointerMove={() => setHovered(bar.variant.key)}
                  onClick={() => setPicked(bar.variant.key)}
                />
              ))}
              <g opacity={outsideFind(id) ? 0.4 : 1}>
                {logo ? (
                  <image href={logo} x={centre - 7} y={bounds.bottom + 12} width={14} height={14} />
                ) : null}
                <text
                  className={graphs.rowName}
                  x={centre}
                  y={bounds.bottom + 42}
                  textAnchor="middle"
                >
                  <tspan x={centre}>{line1}</tspan>
                  {line2 ? (
                    <tspan x={centre} dy="1.25em">
                      {line2}
                    </tspan>
                  ) : null}
                </text>
              </g>
            </g>
          );
        })}
        {/* The pointed bar's guide runs across the whole plot in front of every bar, and the readings stand in front of it on their halos, so it never runs through their digits. */}
        {pointed == null ? null : (
          <g className={graphs.cursorProjection} style={projection}>
            <line x1={bounds.left} x2={bounds.right} y1={pointed.top} y2={pointed.top} />
          </g>
        )}
        {columns.map(({ id, bars: modelBars, tallest, label }) =>
          pointed != null && modelBars.includes(pointed) ? null : (
            <text
              key={id}
              className={graphs.plotValue}
              x={tallest.x + tallest.width / 2}
              y={tallest.top - 11}
              textAnchor="middle"
              fillOpacity={pointed != null || outsideFind(id) ? 0.4 : 1}
              pointerEvents="none"
              style={HALO}
            >
              {label}
            </text>
          ),
        )}
        {pointed == null ? null : (
          <text
            className={graphs.cursorProjectionLabel}
            x={pointed.x + pointed.width / 2}
            y={pointed.top - 10}
            textAnchor="middle"
            pointerEvents="none"
            style={{ ...projection, ...HALO }}
          >
            {formatValue(metric, metric.read(pointed.variant)!)}
          </text>
        )}
      </SkyFigure>
    </FigureRegion>
  );
}

/** The efforts' shades in neutral ink, named at their ends, so the shades read the same whatever a lab's colour; it sits beneath the plot rather than in it, so a plot that scrolls never takes it out of view. */
function ShadeLegend() {
  const swatch = { size: 9, gap: 3 };
  const left = 30;
  const end = left + LEGEND.length * (swatch.size + swatch.gap) + 4;
  return (
    <svg width={end + 64} height={12} overflow="visible" aria-hidden="true">
      <text className={graphs.plotNote} x={0} y={6} dy="0.34em">
        low
      </text>
      {LEGEND.map((effort, index) => (
        <rect
          key={effort}
          x={left + index * (swatch.size + swatch.gap)}
          y={6 - swatch.size / 2}
          width={swatch.size}
          height={swatch.size}
          style={{ fill: shadeFill("var(--ink)", effort) }}
        />
      ))}
      <text className={graphs.plotNote} x={end} y={6} dy="0.34em">
        max effort
      </text>
    </svg>
  );
}

// An effort's shade mixed into the panel's paper rather than laid over it, so the bar stays solid and the grid never shows through.
function shadeFill(color: string, effort: string | null): string {
  const shade = effort == null ? DEFAULT_SHADE : (EFFORT_SHADES[effort] ?? DEFAULT_SHADE);
  return `color-mix(in oklab, ${color} ${Math.round(shade * 100)}%, var(--paper))`;
}

// Every other bar's shade mixed further into the paper while one is pointed, so it recedes and still stays solid over the grid.
function quieted(fill: string): string {
  return `color-mix(in oklab, ${fill} 40%, var(--paper))`;
}

/** The measure's scale over `range`, bottom then top, every bar rising from zero. A score's is linear. A ratio's follows the square root, so heights still order and compare from zero while a cheap model's efforts stay readable beside one many times costlier: 4× stands twice as tall as 1×. */
function measureAxis(metric: Metric, values: number[], range: [number, number]) {
  if (metric.kind === "ratio") {
    const peak = Math.max(1, ...values);
    // The scale ends on the first step at or past the highest value, so a line frames the tallest bar as 100 frames a score.
    const y = scaleSqrt()
      .domain([0, RATIO_STEPS.find((step) => step >= peak) ?? peak])
      .range(range);
    // Zero and each step inside the domain, bottom up, skipping any whose label would crowd the one beneath; the median always stands, displacing the step under it instead, since its dashed line needs its name.
    const ticks = [0, ...RATIO_STEPS]
      .filter((tick) => tick <= y.domain()[1]!)
      .reduce<number[]>((kept, tick) => {
        if (kept.length === 0 || y(kept.at(-1)!) - y(tick) >= TICK_ROOM) return [...kept, tick];
        return tick === MEDIAN_RATIO && kept.length > 1 ? [...kept.slice(0, -1), tick] : kept;
      }, []);
    return {
      y,
      ticks: ticks.map((tick) =>
        tick === MEDIAN_RATIO
          ? { tick, label: `MED ${formatResourceRatio(tick)}`, median: true }
          : { tick, label: formatResourceRatio(tick), median: false },
      ),
    };
  }
  const y = scaleLinear()
    .domain([0, Math.max(1, ...values)])
    .range(range)
    .nice();
  const label = y.tickFormat(5, "~f");
  return { y, ticks: y.ticks(5).map((tick) => ({ tick, label: label(tick), median: false })) };
}

function strongest(family: readonly ChartVariant[]): number {
  return Math.max(...family.map((variant) => variant.intelligence));
}

function peak(family: readonly ChartVariant[], metric: Metric): number {
  return Math.max(...family.map((variant) => metric.read(variant) ?? 0));
}

function variantEntry(variant: ChartVariant): ReadoutEntry {
  return {
    name: variant.name,
    logo: providerLogo(variant.provider),
    facts: [
      `${effortName(variant.effort)} effort`,
      ...METRICS.flatMap((metric) => {
        const value = metric.read(variant);
        return value == null ? [] : [`${metric.word} ${formatValue(metric, value)}`];
      }),
    ],
  };
}

/** A model from its lowest effort to its highest: the Intelligence it reaches and the measure shown at each end, or its Cost× while the measure is Intelligence. */
function spanEntry(family: readonly ChartVariant[], metric: Metric): ReadoutEntry {
  const low = family[0]!;
  const high = family.at(-1)!;
  return {
    name: low.name,
    logo: providerLogo(low.provider),
    facts: [
      `${effortName(low.effort)} to ${effortName(high.effort)} effort`,
      ...[INTELLIGENCE, metric === INTELLIGENCE ? COST : metric].flatMap((each) => {
        const from = each.read(low);
        const to = each.read(high);
        return from == null || to == null
          ? []
          : [`${each.word} ${formatValue(each, from)} → ${formatValue(each, to)}`];
      }),
    ],
  };
}

function formatValue(metric: Metric, value: number): string {
  return metric.kind === "ratio" ? formatResourceRatio(value) : formatTooltipScore(value);
}

/** A model name in at most two lines, broken at the space nearest its middle that keeps a version number with the word before it, else after the hyphen nearest its middle: `Gemini 4 Neon` → `Gemini 4`, `Neon`; `MiniMax-M3.1-Flash` → `MiniMax-`, `M3.1-Flash`. */
function splitName(name: string): [string, string | null] {
  if (name.length <= 12) return [name, null];
  const middle = name.length / 2;
  const nearest = (cuts: number[]) =>
    cuts.reduce<number | null>(
      (held, cut) =>
        held == null || Math.abs(cut - middle) < Math.abs(held - middle) ? cut : held,
      null,
    );
  const space = nearest([...name.matchAll(/ (?!\d)/g)].map((match) => match.index));
  if (space != null) return [name.slice(0, space), name.slice(space + 1)];
  const hyphen = nearest([...name.matchAll(/-/g)].map((match) => match.index + 1));
  return hyphen == null ? [name, null] : [name.slice(0, hyphen), name.slice(hyphen)];
}

/** An effort as the leaderboard names it; an unlabelled variant is the model's only, default effort. */
function effortName(effort: string | null): string {
  return effort ?? "default";
}
