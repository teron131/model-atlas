"use client";

/** The Timeline panel owns the view's state and interactions (lab filter, find field, time window, pick and pointer, replay) and renders what `scene.ts` derives from them, with Labs, Lookback, and the evidence disclosure beneath; it loads only the published chart points, leaving full evidence to `TimelineEvidence`. */

import dynamic from "next/dynamic";
import { type CSSProperties, memo, useCallback, useEffect, useId, useMemo, useState } from "react";

import { clamp01 } from "../../../../src/model-atlas/math-utils";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { positionCatalogId } from "../../../../src/model-atlas/timeline/schemas";
import { openModelSheet } from "../../model-sheet/open";
import { ResearchRegion } from "../../ResearchRegions";
import type { ModelSuggestionRow } from "../../shared/ModelSuggestions";
import { providerChartColor, providerDisplayName, providerLogo } from "../../shared/provider-theme";
import type { SearchDocument } from "../../shared/search";
import { useUrlState } from "../../use-url-state";
import { ChartFind, type ChartFindState, chartFindTargets, useChartFind } from "../ChartFind";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { CursorProjectionLayer } from "../plot/Interaction";
import { placeBesideStars } from "../plot/label-placement";
import {
  FrontierHorizon,
  LabelMask,
  NameMask,
  PlotFrame,
  SCATTER_CHART_WIDTH,
  starCore,
  StarGlows,
  TextPointLabel,
  useLabelSizes,
  XAxisTicks,
  YAxisTicks,
  YAxisTitle,
} from "../plot/Primitives";
import { SkyPlot } from "../plot/SkyPlot";
import { useChartLayout } from "../use-chart-layout";
import { type TimelinePoint, timelinePointLabel } from "./chart-data";
import { coverageFrontier, frontierTies, RECORD_MINIMUM_SUPPORT } from "./frontier";
import { TimelineLabs } from "./Labs";
import { TimelineLookback } from "./Lookback";
import { OrganizationSelect } from "./OrganizationSelect";
import { easeOut, followReplayPlan, useReplay } from "./replay";
import {
  constellationStroke,
  frontierNameCallouts,
  frontierNamesKey,
  labNameCallouts,
  labNamesKey,
  placeFrontierNames,
  timelineScene,
} from "./scene";
import { TimelineNavigator } from "./TimelineNavigator";
import { useTimelineData } from "./use-timeline-data";

import styles from "../graphs.module.css";
import timeline from "./timeline.module.css";

const TIMELINE_CAPTION = `A model sets a record only with at least ${Math.round(RECORD_MINIMUM_SUPPORT * 100)}% evidence support. This historical view uses its own filters.`;

// While a lab is pointed at, the other labs' names keep this share of their light, enough to stay legible as context.
const DIMMED_NAME_OPACITY = 0.35;

const READOUT_DATE = new Intl.DateTimeFormat("en", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

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
  const [period, setPeriod] = useUrlState("timeline-period");
  const [providers, setProviders] = useUrlState("timeline-provider");
  const [preview, setPreview] = useState<TimelinePoint | null>(null);
  // The lab a Labs row points at, the one hover that lights a lab; a star the pointer passes over only flares and fills the readout.
  const [rowLab, setRowLab] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const pointLabRow = (model: TimelinePoint | null) => {
    setPreview(model);
    setRowLab(model?.provider ?? null);
  };
  // A keyboard-focused star picks its model.
  const focusStar = useCallback((point: TimelinePoint) => {
    setSelected(point.id);
    setPreview(point);
  }, []);
  // A pick holds while clicks stay on the Timeline or in a model sheet and lets go at a click anywhere else; on the chart itself, pressing open sky lets it go.
  useEffect(() => {
    if (selected == null) return;
    const release = (event: MouseEvent) => {
      if (
        !(
          event.target instanceof Element &&
          event.target.closest("[data-keeps-pick], [role=dialog]")
        )
      )
        setSelected(null);
    };
    document.addEventListener("click", release);
    return () => document.removeEventListener("click", release);
  }, [selected]);
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
  const scope = `${period}:${providers?.join(",") ?? "all"}`;
  const { plotHost, width, compact } = useChartLayout(SCATTER_CHART_WIDTH);
  // Warm the small chart payload while readers explore the dashboard; evidence stays on demand.
  const {
    data: points,
    error,
    retry,
  } = useTimelineData<TimelinePoint[]>("/api/timeline?view=chart", "Unable to load Timeline.");

  const population = useMemo(
    () => points?.filter((point) => providers == null || providers.includes(point.provider)) ?? [],
    [points, providers],
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
  const records = useMemo(() => coverageFrontier(population), [population]);
  const reached = cutoff ?? end;
  const ties = useMemo(() => frontierTies(windowed, records), [windowed, records]);
  const byScore = useMemo(() => [...visible].sort((a, b) => b.score - a.score), [visible]);
  const evidenceModelIds = useMemo(() => byScore.map((point) => point.id), [byScore]);
  const currentModelLookup = useMemo(() => {
    const byId = new Map<string, ModelAtlasModel>();
    const byName = new Map<string, ModelAtlasModel>();
    for (const model of currentModels) {
      if (model.id != null) byId.set(model.id, model);
      if (model.name != null) byName.set(model.name, model);
    }
    return { byId, byName };
  }, [currentModels]);
  // A lab's leading model can lie outside the window, so a pick is found in the whole population.
  const picked = population.find((point) => point.id === selected);
  // The field searches every lab and date.
  const findDocuments = useMemo(() => (points ?? []).map(timelineSearchDocument), [points]);
  const [find, setFind] = useChartFind(
    "timeline-find",
    findDocuments,
    timelineSuggestionRow,
    timelinePointModelId,
  );
  const matches = useMemo(() => {
    const targets = chartFindTargets(find, findDocuments, timelineSuggestionRow);
    return targets == null ? null : new Set(targets.map((point) => point.id));
  }, [find, findDocuments]);
  // Only the lab a Labs row points at, or else the picked model's, draws its records, so its line is read against the field's frontier one lab at a time.
  const focusLab = rowLab ?? picked?.provider;
  const labRecords = useMemo(
    () =>
      focusLab == null
        ? []
        : coverageFrontier(population.filter((point) => point.provider === focusLab)),
    [population, focusLab],
  );
  const scene = timelineScene({
    width,
    compact,
    frame,
    start,
    end,
    range,
    reached,
    windowed,
    visible,
    records,
    ties,
    byScore,
    picked,
    preview,
    rowLab,
    labRecords,
    matches,
    located: find.located,
  });
  const {
    prior,
    frontier,
    frontierIds,
    chosen,
    height,
    margin,
    windowView,
    x,
    y,
    xPoint,
    arrived,
    markRadius,
    pointRadius,
    dimmed,
    pointOpacity,
    plotBounds,
    drawn,
    labelled,
    labNamed,
    yTicks,
    ticks,
    horizon,
    reveal,
    labPrior,
    labSegments,
    sky,
  } = scene;
  // The readout names the star under the pointer, or else the picked model, or else the frontier's newest record.
  const shown = preview ?? chosen;
  // Pareto's pointer guides drop from the pointed or picked star, never from the readout's resting record, and only while that star is on the plot.
  const guided = preview ?? picked;
  const projection =
    guided == null || !visible.includes(guided)
      ? null
      : {
          x: xPoint(guided),
          y: y(guided.score),
          xValue: Date.parse(guided.releaseDate),
          yValue: guided.score,
        };
  const shownModel =
    shown == null
      ? undefined
      : (currentModelLookup.byId.get(positionCatalogId(shown.id) ?? "") ??
        currentModelLookup.byName.get(shown.name));
  const readout: ReadoutEntry | null =
    shown == null
      ? null
      : {
          name: shown.name,
          logo: providerLogo(shown.provider),
          facts: [
            providerDisplayName(shown.provider),
            { label: "Intelligence Index", value: shown.score.toFixed(1) },
            READOUT_DATE.format(Date.parse(shown.releaseDate)),
            shown.coverage == null
              ? "support unknown"
              : `${Math.round(shown.coverage * 100)}% support`,
            ...(shown.indexOnly ? ["index only"] : []),
          ],
          ...(shownModel == null
            ? {}
            : { open: () => openModelSheet({ ...shownModel, reasoning_effort: null }) }),
        };
  useEffect(() => {
    setPreview(null);
  }, [start, end]);
  // Located models outside the window or among hidden labs bring their labs and the whole span back, so their stars are on the chart when they flare; a single located model is also picked, so the readout shows it.
  const changeFind = (next: ChartFindState, located: readonly TimelinePoint[]) => {
    if (selected != null && find.located.has(selected) && !next.located.has(selected))
      setSelected(null);
    setFind(next);
    if (!located.length) return;
    stopReplay();
    const hiddenLabs =
      providers == null
        ? []
        : [...new Set(located.map((point) => point.provider))].filter(
            (provider) => !providers.includes(provider),
          );
    if (providers != null && hiddenLabs.length) setProviders([...providers, ...hiddenLabs]);
    const outside = located.some((point) => {
      const date = Date.parse(point.releaseDate);
      return date < start || date > end;
    });
    if (hiddenLabs.length || outside) {
      setWindowState({ scope: "", range: [0, 1] });
      setPeriod("all");
    }
    if (located.length === 1) setSelected(located[0]!.id);
  };
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
    [...labelled, ...labNamed].map((point) => timelinePointLabel(point, compact)).join("\0"),
    compact,
  );
  const layoutKey = frontierNamesKey(scene, labelSizes);
  const labelPlacements = useMemo(
    () => placeFrontierNames(layoutKey, compact),
    [layoutKey, compact],
  );
  const frontierNames = frontierNameCallouts(scene, labelSizes, labelPlacements);
  const { callouts, crowded } = frontierNames;
  const labLayoutKey = labNamesKey(scene, labelSizes, frontierNames);
  const labPlacements = useMemo(
    () => placeBesideStars(labLayoutKey, compact),
    [labLayoutKey, compact],
  );
  const { labCallouts, labCrowded } = labNameCallouts(
    scene,
    labelSizes,
    labPlacements,
    frontierNames,
  );
  const shownCallouts = [
    ...callouts.filter(({ key }) => !crowded.has(key)),
    ...labCallouts.filter(({ key }) => !labCrowded.has(key)),
  ];
  // Stars sit at their release day and score, and the camera places them through these four variables, so a frame that only moves the camera re-renders no star.
  const cameraStyle = {
    "--tx": `${x(new Date(fullStart))}px`,
    "--kx": `${x(new Date(fullStart + 86400000)) - x(new Date(fullStart))}px`,
    "--ty": `${y(0)}px`,
    "--ky": `${y(1) - y(0)}px`,
  } as CSSProperties;
  const guideMask = useId();
  const leaderMask = useId();
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
        // The window travels with a replay's camera.
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
        replay={{
          at: frame == null ? null : (frame.at - fullStart) / (fullEnd - fullStart),
          paused: replay.paused,
          onPlay: () =>
            replay.paused
              ? replay.resume()
              : replay.start(followReplayPlan(windowed, frontier, prior, start, end, windowView)),
          onPause: replay.pause,
          onStop: replay.stop,
        }}
      />
    ) : null;

  return (
    <ResearchRegion
      id="timeline"
      className={styles.section}
      plane={styles.panel}
      capture={{ title: "Intelligence over time", fileName: "model-atlas-timeline" }}
    >
      <div className={timeline.content} data-keeps-pick>
        {/* The organization choice and the find field share the figure's top edge, as Pareto's performance choice and its field do; the readout runs beneath them. */}
        <div className={timeline.top}>
          <OrganizationSelect
            points={points ?? []}
            selected={providers}
            onChange={chooseProviders}
          />
          {points ? (
            <ChartFind
              label="Locate models on the Timeline"
              find={find}
              documents={findDocuments}
              describe={timelineSuggestionRow}
              onChange={changeFind}
              nothingFound={() => "No Timeline model matches."}
            />
          ) : null}
        </div>
        {points ? <ChartReadout label="Timeline model details" entry={readout} /> : null}
        {!points ? (
          <div className={timeline.loading} role="status">
            {error || "Loading Timeline…"}
            {error && <button onClick={retry}>Retry</button>}
          </div>
        ) : !visible.length ? (
          <div className={timeline.loading} role="status">
            No dated models in this selection.
          </div>
        ) : (
          <>
            <div {...plotHost} className={`${styles.chartWrap} ${timeline.chart}`}>
              <SkyPlot scene={sky}>
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${width} ${height}`}
                  role="group"
                  aria-label="Timeline: Intelligence Index by release date"
                  onPointerMove={(event) => {
                    if (event.pointerType === "touch") return;
                    const point = nearestPoint(event);
                    if (point?.id === preview?.id) return;
                    setPreview(point);
                  }}
                  onPointerLeave={() => setPreview(null)}
                  // Pressing a star, or within reach of one, picks it; pressing open sky lets the pick go.
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const point = nearestPoint(event);
                    if (event.pointerType === "touch") setPreview(point);
                    setSelected(point?.id ?? null);
                  }}
                  onBlur={() => setPreview(null)}
                >
                  <defs>
                    <LabelMask
                      id={guideMask}
                      width={width}
                      height={height}
                      labels={shownCallouts}
                    />
                    <NameMask
                      id={leaderMask}
                      width={width}
                      height={height}
                      labels={shownCallouts}
                    />
                  </defs>
                  <PlotFrame width={width} height={height} margin={margin} />
                  <XAxisTicks
                    ticks={ticks}
                    xPoint={(value) => x(new Date(value))}
                    y={height - margin.bottom}
                    format={(value) => dateFormat.format(value)}
                    keyPrefix="timeline"
                    labelMinGap={65}
                    readings={
                      projection == null
                        ? []
                        : [
                            {
                              x: projection.x,
                              text: READOUT_DATE.format(projection.xValue),
                              anchor: "middle",
                            },
                          ]
                    }
                  />
                  <YAxisTicks
                    ticks={yTicks}
                    yPoint={y}
                    x={margin.left}
                    format={String}
                    keyPrefix="timeline"
                    reading={projection?.y}
                  />
                  <YAxisTitle
                    height={height}
                    margin={margin}
                    title="Intelligence Index"
                    compact={compact}
                  />
                  {/* The guides pass behind model names, as the lab line does. */}
                  <g mask={`url(#${guideMask})`}>
                    <CursorProjectionLayer
                      projection={projection}
                      bounds={plotBounds}
                      stars={sky.stars}
                      xLabel={projection == null ? "" : READOUT_DATE.format(projection.xValue)}
                      yLabel={projection == null ? "" : projection.yValue.toFixed(1)}
                      color={guided == null ? undefined : providerChartColor(guided.provider)}
                    />
                  </g>
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
                      muted={sky.muted}
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
                    {focusLab == null ? null : (
                      // The focused lab's records are joined as a constellation, its strokes stopping short of each star and cut around the names.
                      <g
                        className={timeline.labLine}
                        mask={`url(#${guideMask})`}
                        style={{ "--lab": providerChartColor(focusLab) } as CSSProperties}
                        aria-hidden="true"
                      >
                        {labSegments.flatMap((segment, index) => {
                          const stroke = constellationStroke(
                            segment,
                            index === 0 && labPrior != null,
                          );
                          return stroke == null ? [] : [<line key={index} {...stroke} />];
                        })}
                      </g>
                    )}
                    <StarGlows
                      bounds={plotBounds}
                      stars={drawn.flatMap((point) =>
                        picked?.id === point.id || frontierIds.has(point.id)
                          ? [
                              {
                                key: point.id,
                                cx: xPoint(point),
                                cy: y(point.score),
                                radius: pointRadius(point),
                                color: providerChartColor(point.provider),
                                emphasis: picked?.id === point.id ? "selected" : "frontier",
                                opacity: dimmed(point) ? 0 : arrived(point),
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
                          picked={picked?.id === point.id}
                          onSelect={setSelected}
                          onFocus={focusStar}
                        />
                      ))}
                    </g>
                  </g>
                  <g aria-label="Frontier model labels">
                    {labelled.map((point) => {
                      const cx = xPoint(point);
                      const age = frame?.age(point.id);
                      // A crowded-out name still renders unseen, so its text stays measured for when room opens.
                      if (crowded.has(point.id)) {
                        return (
                          <g key={point.id} opacity={0} aria-hidden="true">
                            <TextPointLabel
                              label={timelinePointLabel(point, compact)}
                              cx={cx}
                              cy={y(point.score)}
                              width={width}
                              height={height}
                              margin={margin}
                            />
                          </g>
                        );
                      }
                      return (
                        <g
                          key={point.id}
                          // In a replay a label fades in once its model arrives, out as its star leaves the plot, and out as the camera settles, when the placed labels take over; while a lab is pointed at, the other labs' names recede with their stars.
                          opacity={
                            frame == null || age == null
                              ? dimmed(point)
                                ? DIMMED_NAME_OPACITY
                                : 1
                              : easeOut((age - 120) / 300) *
                                clamp01((cx - plotBounds.left) / 24) *
                                (1 - frame.settle)
                          }
                        >
                          <TextPointLabel
                            label={timelinePointLabel(point, compact)}
                            cx={cx}
                            cy={y(point.score)}
                            width={width}
                            height={height}
                            margin={margin}
                            xOffset={markRadius(point) + 8}
                            placement={labelPlacements.get(point.id)}
                            leaderMask={leaderMask}
                          />
                        </g>
                      );
                    })}
                    {labNamed.map((point) => (
                      // A crowded-out name still renders unseen, so its text stays measured for when room opens.
                      <g key={point.id} opacity={labCrowded.has(point.id) ? 0 : 1}>
                        <TextPointLabel
                          label={timelinePointLabel(point, compact)}
                          cx={xPoint(point)}
                          cy={y(point.score)}
                          width={width}
                          height={height}
                          margin={margin}
                          xOffset={markRadius(point) + 8}
                          placement={labPlacements.get(point.id)}
                          leaderMask={leaderMask}
                        />
                      </g>
                    ))}
                  </g>
                </svg>
              </SkyPlot>
            </div>
            {navigator}
            <TimelineLabs
              points={population}
              end={end}
              focusLab={focusLab ?? null}
              pickedId={picked?.id ?? null}
              onPoint={pointLabRow}
              onPick={(model) => setSelected(picked?.id === model.id ? null : model.id)}
            />
            <TimelineLookback points={population} located={find.located} matches={matches} />
          </>
        )}
        {!visible.length && navigator}
      </div>
      {/* The caption and evidence read on the page; an exported image is the figure alone. */}
      <div className={styles.figureCaption} data-capture-exclude>
        <p>{TIMELINE_CAPTION}</p>
      </div>
      <details
        className={styles.commonEvidence}
        aria-label="Timeline evidence"
        data-capture-exclude
        data-keeps-pick
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
          <TimelineEvidence
            modelIds={evidenceModelIds}
            selectedId={selected}
            onSelect={setSelected}
          />
        )}
      </details>
    </ResearchRegion>
  );
});

export function timelineSearchDocument(point: TimelinePoint): SearchDocument<TimelinePoint> {
  return {
    value: point,
    primary: [point.name, point.provider, providerDisplayName(point.provider)],
  };
}

// A point's published model id; an archived model has none, so a pill naming it stays as typed.
export function timelinePointModelId(point: TimelinePoint): string | null {
  return positionCatalogId(point.id);
}

/** A Timeline suggestion carries the Timeline's own Intelligence Index, the scale its y-axis reads. */
export function timelineSuggestionRow(point: TimelinePoint): ModelSuggestionRow {
  return {
    key: point.id,
    name: point.name,
    provider: point.provider,
    logo: providerLogo(point.provider),
    intelligence: point.score,
  };
}

/** A star placed by its release day and score through the camera variables its group sets, so it re-renders only when its own mark changes. */
const TimelineStar = memo(function TimelineStar({
  point,
  day,
  radius,
  opacity,
  color,
  chosen,
  picked,
  onSelect,
  onFocus,
}: {
  point: TimelinePoint;
  /** Days since the population's first release. */
  day: number;
  radius: number;
  opacity: number;
  color: string;
  /** The picked model, or the frontier's newest record when none is picked, which is the chart's one tab stop. */
  chosen: boolean;
  picked: boolean;
  onSelect: (id: string) => void;
  onFocus: (point: TimelinePoint) => void;
}) {
  const core = starCore(radius, color);
  // An inline position travels with the markup into image exports, which inline only a fixed set of computed styles.
  const transform = `translate(calc(var(--tx) + ${day} * var(--kx)), calc(var(--ty) + ${point.score} * var(--ky)))`;
  return (
    <circle
      data-point={point.id}
      {...core}
      style={{ ...core.style, transform }}
      opacity={opacity}
      className={`${timeline.point} ${styles.starCore}`}
      role="button"
      tabIndex={chosen ? 0 : -1}
      aria-pressed={picked}
      aria-label={`${point.name}, ${point.releaseDate}, Intelligence Index ${point.score.toFixed(1)}`}
      onClick={() => onSelect(point.id)}
      onFocus={() => onFocus(point)}
    />
  );
});
