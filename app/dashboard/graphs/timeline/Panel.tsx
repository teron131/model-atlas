"use client";

/** The dashboard's historical view loads only published chart points and owns its independent time window. */

import { scaleLinear, scaleUtc } from "d3-scale";
import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { type CSSProperties, memo, useCallback, useEffect, useId, useMemo, useState } from "react";

import { clamp01 } from "../../../../src/model-atlas/math-utils";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { positionCatalogId } from "../../../../src/model-atlas/timeline/schemas";
import { openModelSheet } from "../../model-sheet/open";
import { ResearchRegion } from "../../ResearchRegions";
import { providerChartColor, providerDisplayName } from "../../shared/provider-theme";
import { useUrlState } from "../../use-url-state";
import { GraphToggle } from "../GraphToggle";
import {
  calloutLabelPlacements,
  type PointLabelPlacement,
  type PointLabelSize,
} from "../plot/label-placement";
import {
  AxisTitles,
  FrontierHorizon,
  type PlotBounds,
  plotBoundsFor,
  PlotFrame,
  SCATTER_CHART_WIDTH,
  starCore,
  StarGlows,
  TextPointLabel,
  useLabelSizes,
  XAxisTicks,
  YAxisTicks,
} from "../plot/Primitives";
import { useChartWidth, useCompactChartLayout } from "../use-chart-layout";
import { type TimelinePoint, timelinePointLabel, timelineScoreDomain } from "./chart-data";
import {
  coverageFrontier,
  frontierTies,
  LAB_MINIMUM_MODELS,
  LEADING_LAB_COUNT,
  leadingLabs,
  RECORD_MINIMUM_SUPPORT,
} from "./frontier";
import { LabsPlot } from "./LabsPlot";
import { OrganizationSelect } from "./OrganizationSelect";
import { arrival, easeOut, followReplayPlan, RECORD_RISE_MS, useReplay } from "./replay";
import { TimelineNavigator } from "./TimelineNavigator";

import styles from "../graphs.module.css";
import timeline from "./timeline.module.css";

const TIMELINE_CAPTION =
  "Compare model generations on a fixed Intelligence Index. The glowing frontier rises with each new record. This historical view uses its own filters.";

const REPLAY_DATE = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

const TimelineEvidence = dynamic(
  () => import("./TimelineEvidence").then((module) => module.TimelineEvidence),
  { loading: () => <p role="status">Loading evidence matrices…</p> },
);

/** Keep the historical population independent from present-day price, rank and recency filters; `currentModels` only links a selected model to its sheet when today's snapshot has it. */
export const TimelinePanel = memo(function TimelinePanel({
  currentModels,
}: {
  currentModels: readonly ModelAtlasModel[];
}) {
  const [points, setPoints] = useState<TimelinePoint[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useUrlState("timeline-view");
  const [period, setPeriod] = useUrlState("timeline-period");
  const [providers, setProviders] = useUrlState("timeline-provider");
  const [preview, setPreview] = useState<TimelinePoint | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [evidenceRequested, setEvidenceRequested] = useState(false);
  const [windowState, setWindowState] = useState<{ scope: string; range: [number, number] }>({
    scope: "",
    range: [0, 1],
  });
  // A running replay reveals models released up to the date it has reached and frames them with its own camera.
  const replay = useReplay();
  const frame = replay.frame;
  const stopReplay = replay.stop;
  const chooseProviders = useCallback(
    (keys: string[] | null) => {
      stopReplay();
      setProviders(keys);
    },
    [stopReplay, setProviders],
  );
  const scope = `${view}:${period}:${providers?.join(",") ?? "all"}`;
  const compact = useCompactChartLayout();

  useEffect(() => {
    const controller = new AbortController();
    // Warm the small chart payload while readers explore the dashboard; evidence stays on demand.
    setError("");
    void fetch("/api/timeline?view=chart", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load Timeline.");
        return body as TimelinePoint[];
      })
      .then((body) => {
        if (!controller.signal.aborted) setPoints(body);
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const labs = useMemo(() => leadingLabs(points ?? []), [points]);
  const population = useMemo(
    () =>
      view === "labs"
        ? labs.flatMap((lab) => lab.models)
        : (points?.filter((point) => providers == null || providers.includes(point.provider)) ??
          []),
    [points, providers, labs, view],
  );
  const times = population.map((point) => Date.parse(point.releaseDate));
  const fullStart = times.length ? Math.min(...times) : 0;
  const fullEnd = times.length ? Math.max(fullStart + 86400000, ...times) : 86400000;
  const bounds: [number, number] = [fullStart, fullEnd];
  const yearStart = Math.max(0, 1 - (365 * 86400000) / (fullEnd - fullStart));
  const range: [number, number] =
    windowState.scope === scope ? windowState.range : [period === "year" ? yearStart : 0, 1];
  const preset =
    range[0] === 0 && range[1] === 1
      ? "all"
      : Math.abs(range[0] - yearStart) < 0.000001 && range[1] === 1
        ? "year"
        : "";

  const start = fullStart + range[0] * (fullEnd - fullStart);
  const end = fullStart + range[1] * (fullEnd - fullStart);
  const windowed = useMemo(
    () =>
      population.filter((point) => {
        const date = Date.parse(point.releaseDate);
        return date >= start && date <= end;
      }),
    [population, start, end],
  );
  const cutoff = frame?.at ?? null;
  const visible = useMemo(
    () =>
      cutoff == null
        ? windowed
        : windowed.filter((point) => Date.parse(point.releaseDate) <= cutoff),
    [windowed, cutoff],
  );
  // Records are set against every model in the population, so a window that starts after a record still measures its models against it.
  const records = useMemo(() => coverageFrontier(population, RECORD_MINIMUM_SUPPORT), [population]);
  const reached = cutoff ?? end;
  const prior = records.filter((point) => Date.parse(point.releaseDate) < start).at(-1);
  const frontier = records.filter((point) => {
    const date = Date.parse(point.releaseDate);
    return date >= start && date <= reached;
  });
  const ties = useMemo(
    () => frontierTies(windowed, records, RECORD_MINIMUM_SUPPORT),
    [windowed, records],
  );
  // The models on the frontier curve: its records and the models level with them, in release order.
  const curve = [
    ...frontier,
    ...ties.filter((point) => Date.parse(point.releaseDate) <= reached),
  ].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  // Every curve model is labelled, except on a phone's settled chart, which has no room for all of them; a replay's camera frames few enough.
  const curveLabelled = frame != null || !compact ? curve : [];
  const evidenceModelIds = useMemo(
    () => [...visible].sort((a, b) => b.score - a.score).map((point) => point.id),
    [visible],
  );
  const frontierIds = new Set(frontier.map((point) => point.id));
  const labLeaders = useMemo(
    () =>
      labs.flatMap((lab) => {
        const leader = lab.records.filter((point) => Date.parse(point.releaseDate) <= end).at(-1);
        return leader ? [leader] : [];
      }),
    [labs, end],
  );
  const currentModelLookup = useMemo(() => {
    const byId = new Map<string, ModelAtlasModel>();
    const byName = new Map<string, ModelAtlasModel>();
    for (const model of currentModels) {
      if (model.id != null) byId.set(model.id, model);
      if (model.name != null) byName.set(model.name, model);
    }
    return { byId, byName };
  }, [currentModels]);
  const chosen =
    preview ??
    (view === "labs"
      ? (population.find((point) => point.id === selected) ?? labLeaders[0])
      : (visible.find((point) => point.id === selected) ?? frontier.at(-1) ?? visible.at(-1)));
  const chosenModel =
    chosen == null
      ? undefined
      : (currentModelLookup.byId.get(positionCatalogId(chosen.id) ?? "") ??
        currentModelLookup.byName.get(chosen.name));
  const { chartRef, width } = useChartWidth(SCATTER_CHART_WIDTH);
  const height = compact ? 400 : 520;
  const margin = {
    top: compact ? 64 : 42,
    right: compact ? 8 : 30,
    bottom: compact ? 60 : 76,
    left: compact ? 8 : 72,
  };
  const padding = Math.max((end - start) * 0.025, 14 * 86400000 * (range[1] - range[0]));
  // The window's scores and the record it opens under set the scale; a running replay frames its own stretch of the window and settles back onto this framing.
  const [low, high] = timelineScoreDomain(
    [...windowed, ...(prior ? [prior] : [])].map((point) => point.score),
  );
  const windowView = { start: start - padding, end: end + padding, low, high };
  const camera = frame?.view ?? windowView;
  const x = scaleUtc()
    .domain([new Date(camera.start), new Date(camera.end)])
    .range([margin.left, width - margin.right]);
  const y = scaleLinear()
    .domain([camera.low, camera.high])
    .range([height - margin.bottom, margin.top]);
  const xPoint = (point: TimelinePoint) => x(new Date(point.releaseDate));
  // A replay brings each model in a little larger and fainter than its mark, settling a moment after it is reached.
  const arrived = (point: TimelinePoint) => (frame == null ? 1 : arrival(frame.age(point.id)));
  // Stars share the Pareto plot's scale; this field is far denser, so they sit at the small end of it.
  const pointRadius = (point: TimelinePoint) =>
    (chosen?.id === point.id ? 3.6 : frontierIds.has(point.id) ? 2.8 : 2.4) *
    (1.4 - 0.4 * arrived(point));
  // Evidence support dims a star; the chosen model always shines at full strength.
  const pointOpacity = (point: TimelinePoint) =>
    (chosen?.id === point.id ? 1 : 0.35 + 0.65 * (point.coverage ?? 0)) * arrived(point);
  const highlights = [...visible].sort((a, b) => b.score - a.score).slice(0, 3);
  const gpt4 = visible.find(
    (point) =>
      point.name === "GPT-4 (Mar 2023)" ||
      (point.name === "GPT-4" && point.releaseDate === "2023-03-14"),
  );
  // The settled chart also labels its leaders, GPT-4 and the selected model wherever their curve labels are not shown.
  const labeled =
    view === "labs" || frame != null
      ? []
      : [
          ...new Map(
            [
              ...highlights,
              ...(gpt4 ? [gpt4] : []),
              ...(selected ? visible.filter((point) => point.id === selected) : []),
            ]
              .filter((point) => !curveLabelled.includes(point))
              .map((point) => [point.id, point]),
          ).values(),
        ];
  useEffect(() => {
    setPreview(null);
  }, [view, start, end]);
  const nearestPoint = (event: {
    clientX: number;
    clientY: number;
    currentTarget: SVGSVGElement;
  }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * width) / rect.width;
    const py = ((event.clientY - rect.top) * height) / rect.height;
    let nearest: TimelinePoint | null = null;
    let distance = ((14 * width) / rect.width) ** 2;
    for (const point of visible) {
      const d = (xPoint(point) - px) ** 2 + (y(point.score) - py) ** 2;
      if (d < distance) {
        distance = d;
        nearest = point;
      }
    }
    return nearest;
  };
  const { svgRef, labelSizes } = useLabelSizes(
    [...curveLabelled, ...labeled].map(timelinePointLabel).join("\0"),
    compact,
  );
  const labelSize = (label: string) =>
    labelSizes[label] ?? {
      width: label.length * (compact ? 10.2 : 7.8),
      ascent: compact ? 15 : 12,
      descent: 3,
    };
  const previewName = preview ? timelinePointLabel(preview) : "";
  const previewLabel = `${previewName.slice(0, compact ? 28 : 42)}${previewName.length > (compact ? 28 : 42) ? "…" : ""} · ${preview?.score.toFixed(1) ?? ""}`;
  const previewWidth = previewLabel.length * (compact ? 10.2 : 9.6);
  const previewOnLeft = preview
    ? xPoint(preview) > (width + margin.left - margin.right) / 2
    : false;
  const plotBounds = plotBoundsFor(width, height, margin);
  const labelTop = compact ? 28 : 8;
  const curveLabels = stackCurveLabels(
    curveLabelled.map((point) => ({
      point,
      cx: xPoint(point),
      cy: y(point.score),
      size: labelSize(timelinePointLabel(point)),
    })),
    plotBounds,
    labelTop,
  );
  const layoutKey =
    labeled.length === 0
      ? null
      : JSON.stringify({
          labels: labeled.map((point) => ({
            key: point.id,
            label: timelinePointLabel(point),
            cx: xPoint(point),
            cy: y(point.score),
            radius: 6,
            size: labelSize(timelinePointLabel(point)),
          })),
          obstacles: visible.map((point) => ({
            key: point.id,
            cx: xPoint(point),
            cy: y(point.score),
            radius: 5,
          })),
          bounds: {
            left: margin.left,
            right: width - margin.right,
            top: labelTop,
            bottom: height - margin.bottom - 8,
          },
          reservedBoxes: curveLabels.map(({ box }) => box),
          directions: [
            [1, -1],
            [-1, -1],
            [0, -1],
          ],
        });
  const labelPlacements = useMemo(
    () =>
      layoutKey == null
        ? new Map<string, PointLabelPlacement>()
        : calloutLabelPlacements(JSON.parse(layoutKey)),
    [layoutKey],
  );
  const ticks = x.ticks(compact ? 4 : 7).map(Number);
  // In a replay the newest record's level climbs from the one it beat, and the reached region ends at the reveal until the camera settles.
  const levels = [...(prior ? [prior] : []), ...frontier];
  const horizon = levels.map((point, index) => {
    const level = y(point.score);
    const below = y(levels[index - 1]?.score ?? point.score);
    const age = frame && index === levels.length - 1 ? frame.age(point.id) : null;
    return {
      x: point === prior ? x(new Date(start)) : xPoint(point),
      y: age == null ? level : below + (level - below) * easeOut(age / RECORD_RISE_MS),
    };
  });
  const reveal =
    frame == null
      ? plotBounds.right
      : x(new Date(frame.at)) + (plotBounds.right - x(new Date(frame.at))) * frame.settle;
  // Stars sit at their release day and score, and the camera places them through these four variables, so a frame that only moves the camera re-renders no star.
  const cameraStyle = {
    "--tx": `${x(new Date(fullStart))}px`,
    "--kx": `${x(new Date(fullStart + 86400000)) - x(new Date(fullStart))}px`,
    "--ty": `${y(0)}px`,
    "--ky": `${y(1) - y(0)}px`,
  } as CSSProperties;
  // A replay draws only the stars its camera frames.
  const drawn =
    frame == null
      ? visible
      : visible.filter((point) => {
          const cx = xPoint(point);
          return cx >= plotBounds.left - 8 && cx <= plotBounds.right + 8;
        });
  const cameraClip = useId();
  // Ticks are labelled at the resolution they are spaced at, so no two read the same.
  const tickSpacing = (ticks[1] ?? Infinity) - (ticks[0] ?? 0);
  const dateFormat = new Intl.DateTimeFormat(
    "en",
    tickSpacing < 28 * 86400000
      ? { timeZone: "UTC", month: "short", day: "numeric" }
      : tickSpacing < 360 * 86400000
        ? { timeZone: "UTC", month: "short", year: "numeric" }
        : { timeZone: "UTC", year: "numeric" },
  );

  const navigator =
    population.length > 0 ? (
      <TimelineNavigator
        points={population}
        bounds={bounds}
        // The overview's window travels with a replay's camera.
        range={
          frame == null
            ? range
            : [
                Math.max(range[0], (frame.view.start - fullStart) / (fullEnd - fullStart)),
                Math.min(range[1], (frame.view.end - fullStart) / (fullEnd - fullStart)),
              ]
        }
        onChange={(range) => {
          replay.stop();
          setWindowState({ scope, range });
        }}
        preset={preset}
        onPreset={(value) => {
          replay.stop();
          setWindowState({ scope: "", range: [0, 1] });
          setPeriod(value);
        }}
        // Only the models view has a record frontier to replay.
        replay={
          view === "models"
            ? {
                at: frame == null ? null : (frame.at - fullStart) / (fullEnd - fullStart),
                paused: replay.paused,
                onPlay: () =>
                  replay.paused
                    ? replay.resume()
                    : replay.start(
                        followReplayPlan(windowed, frontier, prior, start, end, windowView),
                      ),
                onPause: replay.pause,
                onStop: replay.stop,
              }
            : undefined
        }
      />
    ) : null;

  return (
    <ResearchRegion
      id="timeline"
      className={styles.section}
      plane={styles.panel}
      capture={{ title: "Intelligence over time", fileName: "model-atlas-timeline" }}
    >
      <div className={timeline.content}>
        {/* The view choices share the figure's top edge with the chosen model's catalogue entry, as Pareto's choices share it with their summary, so reading a star never leaves the plot. */}
        <div className={timeline.top}>
          <div className={timeline.viewControls}>
            <GraphToggle
              legend="Timeline view"
              selectedKey={view}
              onSelect={(value) => {
                replay.stop();
                setSelected(null);
                setView(value);
              }}
              options={[
                { key: "models", label: "Models" },
                { key: "labs", label: "Labs" },
              ]}
            />
            {view === "models" ? (
              <OrganizationSelect
                points={points ?? []}
                selected={providers}
                onChange={chooseProviders}
              />
            ) : (
              <dl className={timeline.labScope} aria-label="Lab eligibility">
                <div>
                  <dt>Labs</dt>
                  <dd>Top {LEADING_LAB_COUNT}</dd>
                </div>
                <div>
                  <dt>Models per lab</dt>
                  <dd>&gt; {LAB_MINIMUM_MODELS}</dd>
                </div>
                <div>
                  <dt>Frontier support</dt>
                  <dd>≥ {Math.round(RECORD_MINIMUM_SUPPORT * 100)}%</dd>
                </div>
              </dl>
            )}
          </div>
          {points && (visible.length > 0 || view === "labs") ? (
            // The selected star's catalogue entry, ringed in its provider colour like its mark in the chart.
            <div
              className={timeline.readout}
              aria-live="polite"
              aria-label="Timeline model details"
              style={
                chosen == null ? undefined : starCore(6, providerChartColor(chosen.provider)).style
              }
            >
              <div>
                <strong>
                  <span className={timeline.readoutStar} aria-hidden="true" />
                  {chosenModel == null ? (
                    <span className={timeline.readoutName} title={chosen?.name}>
                      {chosen?.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={timeline.readoutOpen}
                      aria-haspopup="dialog"
                      aria-label={`Show details for ${chosen?.name}`}
                      title={chosen?.name}
                      onClick={() => openModelSheet({ ...chosenModel, reasoning_effort: null })}
                    >
                      <span className={timeline.readoutName}>{chosen?.name}</span>
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  )}
                </strong>
                <span>{chosen && providerDisplayName(chosen.provider)}</span>
              </div>
              <div>
                <span>Intelligence Index</span>
                <strong>{chosen?.score.toFixed(1)}</strong>
              </div>
              <div>
                <span>Released</span>
                <strong>{chosen?.releaseDate}</strong>
              </div>
              <div>
                <span>Evidence support</span>
                <strong>
                  {chosen?.coverage == null ? "Unknown" : `${Math.round(chosen.coverage * 100)}%`}
                </strong>
              </div>
            </div>
          ) : null}
        </div>
        {!points ? (
          <div className={timeline.loading} role="status">
            {error || "Loading Timeline…"}
            {error && <button onClick={() => setAttempt((value) => value + 1)}>Retry</button>}
          </div>
        ) : !visible.length && view !== "labs" ? (
          <div className={timeline.loading} role="status">
            No dated models in this selection.
          </div>
        ) : (
          <>
            {view === "labs" ? (
              <LabsPlot
                labs={labs}
                start={start}
                end={end}
                compact={compact}
                navigator={navigator}
                onPreview={setPreview}
                onSelect={setSelected}
              />
            ) : (
              <div ref={chartRef} className={`${styles.chartWrap} ${timeline.chart}`}>
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${width} ${height}`}
                  role="group"
                  aria-label="Timeline: Intelligence Index by release date"
                  onPointerMove={(event) => {
                    if (event.pointerType !== "touch") {
                      const point = nearestPoint(event);
                      setPreview((previous) => (previous?.id === point?.id ? previous : point));
                    }
                  }}
                  onPointerLeave={() => setPreview(null)}
                  onPointerDown={(event) => {
                    if (event.pointerType === "touch") {
                      const point = nearestPoint(event);
                      setPreview(point);
                      if (point) setSelected(point.id);
                    }
                  }}
                  onBlur={() => setPreview(null)}
                >
                  <PlotFrame width={width} height={height} margin={margin} />
                  {!compact &&
                    y
                      .ticks(5)
                      .map((tick) => (
                        <line
                          key={tick}
                          x1={margin.left}
                          x2={width - margin.right}
                          y1={y(tick)}
                          y2={y(tick)}
                          stroke="var(--chart-grid)"
                        />
                      ))}
                  <XAxisTicks
                    ticks={ticks}
                    xPoint={(value) => x(new Date(value))}
                    y={height - margin.bottom}
                    format={(value) => dateFormat.format(value)}
                    keyPrefix="timeline"
                    labelMinGap={65}
                  />
                  <YAxisTicks
                    insetRight={compact ? width - margin.right : undefined}
                    ticks={y.ticks(5)}
                    yPoint={y}
                    x={margin.left}
                    format={String}
                    keyPrefix="timeline"
                  />
                  <AxisTitles
                    width={width}
                    height={height}
                    margin={margin}
                    x="Release date"
                    y="Intelligence Index"
                    compact={compact}
                  />
                  {frame == null ? null : (
                    <>
                      <defs>
                        {/* The camera frames part of the window, so what lies beyond it is cut at the plot's sides. */}
                        <clipPath id={cameraClip}>
                          <rect
                            x={plotBounds.left}
                            y={0}
                            width={plotBounds.right - plotBounds.left}
                            height={height}
                          />
                        </clipPath>
                      </defs>
                      <text
                        className={timeline.replayDate}
                        x={margin.left + 18}
                        y={margin.top + 14}
                        opacity={1 - frame.settle}
                      >
                        {REPLAY_DATE.format(frame.at)}
                      </text>
                    </>
                  )}
                  <g clipPath={frame == null ? undefined : `url(#${cameraClip})`}>
                    {/* Records hold until they are beaten, so the record standing at the window's start enters there, as each lab's line does, and the reached region runs on to the chart's present edge. */}
                    <FrontierHorizon
                      points={horizon}
                      bounds={{ ...plotBounds, right: reveal }}
                      open="right"
                    />
                    {frame == null || !horizon.length ? null : (
                      <circle
                        className={timeline.replayTip}
                        cx={reveal}
                        cy={horizon.at(-1)!.y}
                        r={1.8}
                        opacity={1 - frame.settle}
                      />
                    )}
                    {/* Only records on the frontier and the selected model glow. */}
                    <StarGlows
                      bounds={plotBounds}
                      stars={drawn.flatMap((point) =>
                        chosen?.id === point.id || frontierIds.has(point.id)
                          ? [
                              {
                                key: point.id,
                                cx: xPoint(point),
                                cy: y(point.score),
                                radius: pointRadius(point),
                                color: providerChartColor(point.provider),
                                emphasis: chosen?.id === point.id ? "selected" : "frontier",
                                opacity: pointOpacity(point),
                              },
                            ]
                          : [],
                      )}
                    />
                    <g
                      style={cameraStyle}
                      onKeyDown={(event) => {
                        const id =
                          event.target instanceof Element
                            ? event.target.getAttribute("data-point")
                            : null;
                        const point = drawn.find((star) => star.id === id);
                        if (!point) return;
                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                          event.preventDefault();
                          const index = visible.indexOf(point);
                          const next =
                            visible[
                              Math.max(
                                0,
                                Math.min(
                                  visible.length - 1,
                                  index + (event.key === "ArrowRight" ? 1 : -1),
                                ),
                              )
                            ];
                          if (next) {
                            setSelected(next.id);
                            event.currentTarget
                              .querySelectorAll<SVGCircleElement>("circle[role=button]")
                              [drawn.indexOf(next)]?.focus();
                          }
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(point.id);
                        }
                      }}
                    >
                      {drawn.map((point) => (
                        <TimelineStar
                          key={point.id}
                          point={point}
                          day={(Date.parse(point.releaseDate) - fullStart) / 86400000}
                          radius={pointRadius(point)}
                          opacity={pointOpacity(point)}
                          color={providerChartColor(point.provider)}
                          chosen={chosen?.id === point.id}
                          onSelect={setSelected}
                          onPreview={setPreview}
                        />
                      ))}
                    </g>
                  </g>
                  {preview &&
                    !labeled.some((point) => point.id === preview.id) &&
                    !curveLabelled.includes(preview) && (
                      <TextPointLabel
                        label={previewLabel}
                        placement={{
                          x: previewOnLeft
                            ? Math.max(margin.left + previewWidth, xPoint(preview) - 12)
                            : Math.min(width - margin.right - previewWidth, xPoint(preview) + 12),
                          y: Math.max(margin.top + 18, y(preview.score) - 14),
                          textAnchor: previewOnLeft ? "end" : "start",
                        }}
                        cx={xPoint(preview)}
                        cy={y(preview.score) - 8}
                        width={width}
                        height={height}
                        margin={margin}
                      />
                    )}
                  <g aria-label="Frontier model labels">
                    {labeled.map((point) => (
                      <TextPointLabel
                        key={point.id}
                        label={timelinePointLabel(point)}
                        cx={xPoint(point)}
                        cy={y(point.score)}
                        width={width}
                        height={height}
                        margin={margin}
                        placement={labelPlacements.get(point.id)}
                      />
                    ))}
                    {/* Labels waiting to fade in still render, so their text is measured before it shows. */}
                    {curveLabels.map(({ point, placement }) => {
                      const age = frame?.age(point.id);
                      const cx = xPoint(point);
                      return (
                        <g
                          key={point.id}
                          // In a replay a label fades in once its model arrives and out as its star leaves the plot.
                          opacity={
                            age == null
                              ? 1
                              : easeOut((age - 120) / 300) * clamp01((cx - plotBounds.left) / 24)
                          }
                        >
                          <TextPointLabel
                            label={timelinePointLabel(point)}
                            cx={cx}
                            cy={y(point.score)}
                            width={width}
                            height={height}
                            margin={margin}
                            placement={placement}
                          />
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}
            {view === "models" && navigator}
            <div className={timeline.legend}>
              <span>{visible.length} models</span>
              {view === "models" ? (
                <>
                  <span>● Reference / task-supported</span>
                  <span>○ Index-only</span>
                  <span>
                    <i className={timeline.frontierKey} aria-hidden="true" />
                    Frontier · ≥{Math.round(RECORD_MINIMUM_SUPPORT * 100)}% evidence support
                  </span>
                </>
              ) : (
                <span>Lines connect each lab’s supported records.</span>
              )}
            </div>
          </>
        )}
        {!visible.length && view === "models" && navigator}
        {/* The caption and evidence read on the page; an exported image is the figure alone. */}
        <div className={styles.figureCaption} data-capture-exclude>
          <p>{TIMELINE_CAPTION}</p>
        </div>
      </div>
      <details
        className={styles.commonEvidence}
        aria-label="Timeline evidence"
        data-capture-exclude
        onToggle={(event) => {
          if (event.currentTarget.open) setEvidenceRequested(true);
        }}
      >
        <summary className={styles.chartFooterCaption}>
          <span>Evidence & validation</span>
          <span>{visible.length} models</span>
          <span>Details</span>
        </summary>
        {evidenceRequested && (
          <TimelineEvidence modelIds={evidenceModelIds} onSelect={setSelected} />
        )}
      </details>
    </ResearchRegion>
  );
});

/**
 * Place curve labels up and left of their stars, in the open sky above the frontier, each moving up a line wherever it would meet an earlier one and sliding right rather than crossing the plot's left edge.
 * A label that would rise past `top` tries the up-right side instead. The rule depends only on positions, so a replay's labels end exactly where the settled chart's are.
 */
function stackCurveLabels(
  stars: { point: TimelinePoint; cx: number; cy: number; size: PointLabelSize }[],
  plot: PlotBounds,
  top: number,
) {
  const placed: { point: TimelinePoint; placement: PointLabelPlacement; box: PlotBounds }[] = [];
  for (const { point, cx, cy, size } of stars) {
    const stack = (left: number) => {
      let baseline = cy - 8;
      for (;;) {
        const blocker = placed.find(
          ({ box }) =>
            box.left < left + size.width &&
            box.right > left &&
            box.top < baseline + size.descent &&
            box.bottom > baseline - size.ascent,
        );
        if (!blocker) return baseline;
        baseline = blocker.box.top - size.descent - 2;
      }
    };
    let left = Math.max(plot.left + 2, cx - 8 - size.width);
    let baseline = stack(left);
    if (baseline - size.ascent < top) {
      const right = Math.min(plot.right - size.width, cx + 8);
      const rightBaseline = stack(right);
      if (rightBaseline > baseline) {
        left = right;
        baseline = rightBaseline;
      }
    }
    placed.push({
      point,
      placement: {
        x: left,
        y: baseline,
        textAnchor: "start",
        ...(baseline < cy - 8
          ? {
              line: {
                x1: cx,
                y1: cy - 3,
                x2: Math.min(left + size.width - 2, Math.max(left + 2, cx)),
                y2: baseline + size.descent,
              },
            }
          : {}),
      },
      box: {
        left,
        right: left + size.width,
        top: baseline - size.ascent,
        bottom: baseline + size.descent,
      },
    });
  }
  return placed;
}

/** A star placed by its release day and score through the camera variables its group sets, so it re-renders only when its own mark changes. */
const TimelineStar = memo(function TimelineStar({
  point,
  day,
  radius,
  opacity,
  color,
  chosen,
  onSelect,
  onPreview,
}: {
  point: TimelinePoint;
  /** Days since the population's first release. */
  day: number;
  radius: number;
  opacity: number;
  color: string;
  chosen: boolean;
  onSelect: (id: string) => void;
  onPreview: (point: TimelinePoint) => void;
}) {
  const core = point.indexOnly ? null : starCore(radius, color);
  // An inline position travels with the markup into image exports, which inline only a fixed set of computed styles.
  const transform = `translate(calc(var(--tx) + ${day} * var(--kx)), calc(var(--ty) + ${point.score} * var(--ky)))`;
  return (
    <circle
      data-point={point.id}
      {...(core ?? {
        r: radius,
        fill: "var(--paper)",
        stroke: color,
        strokeWidth: 1.1,
        vectorEffect: "non-scaling-stroke",
      })}
      style={{ ...core?.style, transform }}
      opacity={opacity}
      className={core ? `${timeline.point} ${styles.starCore}` : timeline.point}
      role="button"
      tabIndex={chosen ? 0 : -1}
      aria-pressed={chosen}
      aria-label={`${point.name}, ${point.releaseDate}, Intelligence Index ${point.score.toFixed(1)}`}
      onClick={() => onSelect(point.id)}
      onFocus={() => {
        onSelect(point.id);
        onPreview(point);
      }}
    />
  );
});
