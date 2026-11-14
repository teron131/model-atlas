"use client";

/** The Timeline panel owns the view's state and interactions (lab filter, time window, pick and pointer, replay) and renders what `scene.ts` derives from them, with the lab standings and the evidence disclosure beneath; it loads only the published chart points, leaving full evidence to `TimelineEvidence`. */

import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { type CSSProperties, memo, useCallback, useEffect, useId, useMemo, useState } from "react";

import { clamp01 } from "../../../../src/model-atlas/math-utils";
import type { ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { positionCatalogId } from "../../../../src/model-atlas/timeline/schemas";
import { openModelSheet } from "../../model-sheet/open";
import { ResearchRegion } from "../../ResearchRegions";
import { providerChartColor, providerDisplayName, providerLogo } from "../../shared/provider-theme";
import { useUrlState } from "../../use-url-state";
import { HoverCard, type HoverState } from "../HoverCard";
import {
  FrontierHorizon,
  LabelMask,
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
import {
  coverageFrontier,
  frontierTies,
  LAB_MINIMUM_MODELS,
  LEADING_LAB_COUNT,
  leadingLabs,
  RECORD_MINIMUM_SUPPORT,
} from "./frontier";
import { OrganizationSelect } from "./OrganizationSelect";
import { easeOut, followReplayPlan, useReplay } from "./replay";
import {
  constellationStroke,
  frontierNameCallouts,
  frontierNamesKey,
  labNameCallouts,
  labNamesKey,
  placeBesideStars,
  timelineScene,
} from "./scene";
import { TimelineNavigator } from "./TimelineNavigator";
import { useTimelineData } from "./use-timeline-data";

import styles from "../graphs.module.css";
import timeline from "./timeline.module.css";

const TIMELINE_CAPTION = `Compare model generations on a fixed Intelligence Index. The glowing frontier rises with each new record set by a model with at least ${Math.round(RECORD_MINIMUM_SUPPORT * 100)}% evidence support, and pointing at a model draws its lab's own records. This historical view uses its own filters.`;

// While a lab is pointed at, the other labs' names keep this share of their light, enough to stay legible as context.
const DIMMED_NAME_OPACITY = 0.35;

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
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  // A keyboard-focused star picks its model and shows its card where the star sits.
  const focusStar = useCallback((point: TimelinePoint, target: Element) => {
    const rect = target.getBoundingClientRect();
    setSelected(point.id);
    setPreview(point);
    setHover(timelineHover(point, rect.left + rect.width / 2, rect.top + rect.height / 2));
  }, []);
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
  // The leading labs ranked by the record each holds at the window's end, for the list beneath the chart.
  const labLeaders = useMemo(
    () =>
      leadingLabs(population)
        .flatMap((lab) => {
          const leader = lab.records.filter((point) => Date.parse(point.releaseDate) <= end).at(-1);
          return leader ? [leader] : [];
        })
        .sort((a, b) => b.score - a.score),
    [population, end],
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
  // A lab's leading model can lie outside the window, so a pick is found in the whole population.
  const picked = population.find((point) => point.id === selected);
  // Only the lab of the model under the pointer, or else of the picked one, draws its records, so its line is read against the field's frontier one lab at a time.
  const focusLab = (preview ?? picked)?.provider;
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
    labRecords,
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
  const chosenModel =
    chosen == null
      ? undefined
      : (currentModelLookup.byId.get(positionCatalogId(chosen.id) ?? "") ??
        currentModelLookup.byName.get(chosen.name));
  const chosenLogo = chosen == null ? "" : providerLogo(chosen.provider);
  useEffect(() => {
    setPreview(null);
    setHover(null);
  }, [start, end]);
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
    [...labelled, ...labNamed].map(timelinePointLabel).join("\0"),
    compact,
  );
  const layoutKey = frontierNamesKey(scene, labelSizes);
  const labelPlacements = useMemo(() => placeBesideStars(layoutKey), [layoutKey]);
  const frontierNames = frontierNameCallouts(scene, labelSizes, labelPlacements);
  const { callouts, crowded } = frontierNames;
  const labLayoutKey = labNamesKey(scene, labelSizes, frontierNames);
  const labPlacements = useMemo(() => placeBesideStars(labLayoutKey), [labLayoutKey]);
  const { labCallouts, labCrowded } = labNameCallouts(
    scene,
    labelSizes,
    labPlacements,
    frontierNames,
  );
  // Stars sit at their release day and score, and the camera places them through these four variables, so a frame that only moves the camera re-renders no star.
  const cameraStyle = {
    "--tx": `${x(new Date(fullStart))}px`,
    "--kx": `${x(new Date(fullStart + 86400000)) - x(new Date(fullStart))}px`,
    "--ty": `${y(0)}px`,
    "--ky": `${y(1) - y(0)}px`,
  } as CSSProperties;
  const guideMask = useId();
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
      <div className={timeline.content}>
        {/* The organization choice shares the figure's top edge with the picked model's catalogue entry, so reading a star never leaves the plot. */}
        <div className={timeline.top}>
          <div className={timeline.viewControls}>
            <OrganizationSelect
              points={points ?? []}
              selected={providers}
              onChange={chooseProviders}
            />
          </div>
          {points && visible.length > 0 ? (
            // The picked star's catalogue entry on one line, set in the figure's control type like Pareto's choices: its lab's logo and the model's name, then its figures.
            <div
              className={timeline.readout}
              aria-live="polite"
              aria-label="Timeline model details"
            >
              <strong>
                {chosenLogo ? (
                  <img
                    className={`provider-logo ${timeline.readoutLogo}`}
                    src={chosenLogo}
                    alt=""
                    width={18}
                    height={18}
                  />
                ) : null}
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
              <dl>
                <div>
                  <dt>Lab</dt>
                  <dd>{chosen && providerDisplayName(chosen.provider)}</dd>
                </div>
                <div>
                  <dt>Index</dt>
                  <dd>{chosen?.score.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Released</dt>
                  <dd>{chosen?.releaseDate}</dd>
                </div>
                <div>
                  <dt>Support</dt>
                  <dd>
                    {chosen?.coverage == null ? "Unknown" : `${Math.round(chosen.coverage * 100)}%`}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
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
                    setHover(
                      point == null ? null : timelineHover(point, event.clientX, event.clientY),
                    );
                  }}
                  onPointerLeave={() => {
                    setPreview(null);
                    setHover(null);
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === "touch") {
                      const point = nearestPoint(event);
                      setPreview(point);
                      if (point) setSelected(point.id);
                    }
                  }}
                  onBlur={() => {
                    setPreview(null);
                    setHover(null);
                  }}
                >
                  <defs>
                    <LabelMask
                      id={guideMask}
                      width={width}
                      height={height}
                      labels={[
                        ...callouts.filter(({ key }) => !crowded.has(key)),
                        ...labCallouts.filter(({ key }) => !labCrowded.has(key)),
                      ]}
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
                  />
                  <YAxisTicks
                    insetRight={compact ? width - margin.right : undefined}
                    showGridLines={false}
                    ticks={yTicks}
                    yPoint={y}
                    x={margin.left}
                    format={String}
                    keyPrefix="timeline"
                  />
                  <YAxisTitle
                    height={height}
                    margin={margin}
                    title="Intelligence Index"
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
                      muted={preview != null}
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
                        chosen?.id === point.id || frontierIds.has(point.id)
                          ? [
                              {
                                key: point.id,
                                cx: xPoint(point),
                                cy: y(point.score),
                                radius: pointRadius(point),
                                color: providerChartColor(point.provider),
                                emphasis: chosen?.id === point.id ? "selected" : "frontier",
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
                              label={timelinePointLabel(point)}
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
                            label={timelinePointLabel(point)}
                            cx={cx}
                            cy={y(point.score)}
                            width={width}
                            height={height}
                            margin={margin}
                            xOffset={markRadius(point) + 8}
                            placement={labelPlacements.get(point.id)}
                          />
                        </g>
                      );
                    })}
                    {labNamed.map((point) => (
                      // A crowded-out name still renders unseen, so its text stays measured for when room opens.
                      <g key={point.id} opacity={labCrowded.has(point.id) ? 0 : 1}>
                        <TextPointLabel
                          label={timelinePointLabel(point)}
                          cx={xPoint(point)}
                          cy={y(point.score)}
                          width={width}
                          height={height}
                          margin={margin}
                          xOffset={markRadius(point) + 8}
                          placement={labPlacements.get(point.id)}
                        />
                      </g>
                    ))}
                  </g>
                </svg>
              </SkyPlot>
            </div>
            {navigator}
            {labLeaders.length > 0 && (
              // The labs' standings sit beneath the chart they explain; an exported image is the figure alone.
              <div className={timeline.standings} data-capture-exclude>
                <p className={timeline.standingsTitle}>
                  {labLeaders.length === LEADING_LAB_COUNT
                    ? `Top ${LEADING_LAB_COUNT} labs`
                    : "Labs"}{" "}
                  with over {LAB_MINIMUM_MODELS} models
                </p>
                <ol aria-label="Lab standings">
                  {labLeaders.map((leader, index) => (
                    <li
                      key={leader.provider}
                      style={
                        {
                          "--lab": providerChartColor(leader.provider),
                          "--reach": `${Math.round(standingReach(leader.score, labLeaders) * 100)}%`,
                        } as CSSProperties
                      }
                      data-focused={focusLab === leader.provider || undefined}
                    >
                      <button
                        type="button"
                        aria-pressed={picked?.id === leader.id}
                        onPointerEnter={() => setPreview(leader)}
                        onPointerLeave={() => setPreview(null)}
                        onFocus={() => setPreview(leader)}
                        onBlur={() => setPreview(null)}
                        onClick={() => setSelected(picked?.id === leader.id ? null : leader.id)}
                      >
                        <span className={timeline.standingLab}>
                          <span className={timeline.standingRank}>{index + 1}</span>
                          {providerLogo(leader.provider) ? (
                            <img
                              src={providerLogo(leader.provider)}
                              alt=""
                              width="18"
                              height="18"
                            />
                          ) : null}
                          <strong>{providerDisplayName(leader.provider)}</strong>
                        </span>
                        <span className={timeline.standingScore}>{leader.score.toFixed(1)}</span>
                        <span className={timeline.standingModel}>{leader.name}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
        {!visible.length && navigator}
        {hover ? <HoverCard hover={hover} /> : null}
      </div>
      {/* The caption and evidence read on the page; an exported image is the figure alone. */}
      <div className={styles.figureCaption} data-capture-exclude>
        <p>{TIMELINE_CAPTION}</p>
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

/** How far a lab's rule is lit: across the standings' observed range, from a third of the rule for the lowest index to all of it for the highest. */
function standingReach(score: number, leaders: readonly TimelinePoint[]) {
  const scores = leaders.map((leader) => leader.score);
  const low = Math.min(...scores);
  const high = Math.max(...scores);
  return high === low ? 1 : 1 / 3 + ((2 / 3) * (score - low)) / (high - low);
}

/** The shared hover card for a Timeline point, which carries its release and evidence rather than the leaderboard's scores. */
function timelineHover(point: TimelinePoint, left: number, top: number): HoverState {
  return {
    left,
    top,
    model: point.name,
    provider: providerDisplayName(point.provider),
    color: providerChartColor(point.provider),
    logo: providerLogo(point.provider),
    rows: [
      ["Intelligence Index", point.score.toFixed(1)],
      ["Released", point.releaseDate],
      [
        "Evidence support",
        point.coverage == null ? "Unknown" : `${Math.round(point.coverage * 100)}%`,
      ],
      ["Basis", point.indexOnly ? "Index-only" : "Reference / task-supported"],
    ],
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
  onSelect,
  onFocus,
}: {
  point: TimelinePoint;
  /** Days since the population's first release. */
  day: number;
  radius: number;
  opacity: number;
  color: string;
  chosen: boolean;
  onSelect: (id: string) => void;
  onFocus: (point: TimelinePoint, target: Element) => void;
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
      aria-pressed={chosen}
      aria-label={`${point.name}, ${point.releaseDate}, Intelligence Index ${point.score.toFixed(1)}`}
      onClick={() => onSelect(point.id)}
      onFocus={(event) => onFocus(point, event.currentTarget)}
    />
  );
});
