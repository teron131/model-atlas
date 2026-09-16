"use client";

/** The dashboard's historical view loads only published chart points and owns its independent time window. */

import { scaleLinear, scaleUtc } from "d3-scale";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { providerChartColor, providerDisplayName } from "../shared/provider-theme";
import { useUrlState } from "../use-url-state";
import { GraphToggle } from "./GraphToggle";
import { Panel } from "./Panel";
import { calloutLabelPlacements, type PointLabelSize } from "./plot/label-placement";
import {
  AxisTitles,
  PlotFrame,
  SCATTER_CHART_WIDTH,
  TextPointLabel,
  XAxisTicks,
  YAxisTicks,
} from "./plot/Primitives";
import type { TimelinePoint } from "./timeline/chart-data";
import { coverageFrontier, leadingLabs } from "./timeline/frontier";
import { LabsPlot } from "./timeline/LabsPlot";
import { OrganizationSelect } from "./timeline/OrganizationSelect";
import { TimelineNavigator } from "./timeline/TimelineNavigator";
import { useChartWidth, useCompactChartLayout } from "./use-media-query";

import styles from "./graphs.module.css";
import timeline from "./timeline.module.css";

const TimelineEvidence = dynamic(
  () => import("./timeline/DiagnosticMatrices").then((module) => module.TimelineEvidence),
  { loading: () => <p role="status">Loading evidence matrices…</p> },
);

/** Keep the historical population independent from present-day price, rank and recency filters. */
export function TimelinePanel() {
  const plotRef = useRef<SVGSVGElement>(null);
  const [labelSizes, setLabelSizes] = useState<Record<string, PointLabelSize>>({});
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
  const visible = useMemo(
    () =>
      population.filter((point) => {
        const date = Date.parse(point.releaseDate);
        return date >= start && date <= end;
      }),
    [population, start, end],
  );
  const frontier = useMemo(() => coverageFrontier(visible, 0.6), [visible]);
  const labLeaders = useMemo(
    () =>
      labs.flatMap((lab) => {
        const leader = lab.records.filter((point) => Date.parse(point.releaseDate) <= end).at(-1);
        return leader ? [leader] : [];
      }),
    [labs, end],
  );
  const chosen =
    preview ??
    (view === "labs"
      ? (population.find((point) => point.id === selected) ?? labLeaders[0])
      : (visible.find((point) => point.id === selected) ?? frontier.at(-1) ?? visible.at(-1)));
  const { chartRef, width } = useChartWidth(SCATTER_CHART_WIDTH);
  const height = compact ? 480 : 520;
  const margin = { top: 42, right: 30, bottom: 76, left: compact ? 78 : 72 };
  const padding = Math.max((end - start) * 0.025, 14 * 86400000 * (range[1] - range[0]));
  const x = scaleUtc()
    .domain([new Date(start - padding), new Date(end + padding)])
    .range([margin.left, width - margin.right]);
  const scores = visible.map((point) => point.score);
  const y = scaleLinear()
    .domain([
      Math.floor((Math.min(...scores) - 5) / 20) * 20,
      Math.ceil((Math.max(...scores) + 8) / 20) * 20,
    ])
    .range([height - margin.bottom, margin.top]);
  const xPoint = (point: TimelinePoint) => x(new Date(point.releaseDate));
  const frontierPath = frontier
    .map((point, index) => `${index ? "L" : "M"}${xPoint(point)},${y(point.score)}`)
    .join(" ");
  const highlights = [...visible].sort((a, b) => b.score - a.score).slice(0, 3);
  const gpt4 = visible.find(
    (point) =>
      point.name === "GPT-4 (Mar 2023)" ||
      (point.name === "GPT-4" && point.releaseDate === "2023-03-14"),
  );
  const labeled =
    view === "labs"
      ? []
      : [
          ...new Map(
            [
              ...highlights,
              ...(gpt4 ? [gpt4] : []),
              ...(selected ? visible.filter((point) => point.id === selected) : []),
            ].map((point) => [point.id, point]),
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
  const pointLabel = (point: TimelinePoint) => (point.id === gpt4?.id ? "GPT-4" : point.name);
  const previewName = preview ? pointLabel(preview) : "";
  const previewLabel = `${previewName.slice(0, compact ? 28 : 42)}${previewName.length > (compact ? 28 : 42) ? "…" : ""} · ${preview?.score.toFixed(1) ?? ""}`;
  const previewWidth = previewLabel.length * (compact ? 10.2 : 9.6);
  const previewOnLeft = preview
    ? xPoint(preview) > (width + margin.left - margin.right) / 2
    : false;
  const layoutKey = JSON.stringify({
    labels: labeled.map((point) => ({
      key: point.id,
      label: pointLabel(point),
      cx: xPoint(point),
      cy: y(point.score),
      radius: 6,
      size: labelSizes[pointLabel(point)] ?? {
        width: pointLabel(point).length * (compact ? 10.2 : 7.8),
        ascent: compact ? 15 : 12,
        descent: 3,
      },
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
      top: 8,
      bottom: height - margin.bottom - 8,
    },
    directions: [
      [1, -1],
      [-1, -1],
      [0, -1],
    ],
  });
  const labelPlacements = useMemo(() => calloutLabelPlacements(JSON.parse(layoutKey)), [layoutKey]);
  useLayoutEffect(() => {
    let active = true;
    const measure = () => {
      if (!active || !plotRef.current) return;
      const sizes: Record<string, PointLabelSize> = {};
      for (const text of Array.from(
        plotRef.current.querySelectorAll<SVGTextElement>(
          '[aria-label="Frontier model labels"] text',
        ),
      )) {
        const box = text.getBBox();
        const baseline = text.y.baseVal.getItem(0).value;
        sizes[text.textContent ?? ""] = {
          width: box.width,
          ascent: baseline - box.y,
          descent: box.y + box.height - baseline,
        };
      }
      setLabelSizes((previous) =>
        Object.entries(sizes).some(
          ([name, size]) =>
            !previous[name] ||
            Math.abs(previous[name].width - size.width) > 0.1 ||
            Math.abs(previous[name].ascent - size.ascent) > 0.1 ||
            Math.abs(previous[name].descent - size.descent) > 0.1,
        )
          ? { ...previous, ...sizes }
          : previous,
      );
    };
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
    };
  }, [layoutKey]);
  const ticks = x.ticks(compact ? 4 : 7).map(Number);
  const dateFormat = new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    year: "numeric",
    ...(period === "year" || range[1] - range[0] < 1 ? { month: "short" as const } : {}),
  });

  const navigator =
    population.length > 0 ? (
      <TimelineNavigator
        points={population}
        bounds={bounds}
        range={range}
        onChange={(range) => setWindowState({ scope, range })}
        preset={preset}
        onPreset={(value) => {
          setWindowState({ scope: "", range: [0, 1] });
          setPeriod(value);
        }}
      />
    ) : null;

  return (
    <Panel
      sectionId="timeline"
      sectionLabel="Timeline"
      title="Intelligence over time"
      captureWidth={1120}
      captureFileName="model-atlas-timeline"
      copy="Compare model generations on a fixed Intelligence Index. This historical view uses its own filters."
      wide
    >
      <div className={timeline.content}>
        <div className={timeline.viewControls}>
          <GraphToggle
            legend="Timeline view"
            selectedKey={view}
            onSelect={(value) => {
              setSelected(null);
              setView(value as "models" | "labs");
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
              onChange={setProviders}
            />
          ) : (
            <dl className={timeline.labScope} aria-label="Lab eligibility">
              <div>
                <dt>Labs</dt>
                <dd>Top 10</dd>
              </div>
              <div>
                <dt>Models per lab</dt>
                <dd>&gt; 5</dd>
              </div>
              <div>
                <dt>Frontier support</dt>
                <dd>≥ 60%</dd>
              </div>
            </dl>
          )}
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
                  ref={plotRef}
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
                  {y.ticks(5).map((tick) => (
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
                  <path
                    d={frontierPath}
                    fill="none"
                    stroke="var(--ink)"
                    strokeOpacity="0.45"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                  />
                  {visible.map((point) => (
                    <circle
                      key={point.id}
                      cx={xPoint(point)}
                      cy={y(point.score)}
                      r={chosen?.id === point.id ? 6 : 4}
                      fill={point.indexOnly ? "var(--paper)" : providerChartColor(point.provider)}
                      stroke={providerChartColor(point.provider)}
                      strokeWidth="1.5"
                      opacity={chosen?.id === point.id ? 1 : 0.35 + 0.65 * (point.coverage ?? 0)}
                      className={timeline.point}
                      role="button"
                      tabIndex={chosen?.id === point.id ? 0 : -1}
                      aria-pressed={chosen?.id === point.id}
                      aria-label={`${point.name}, ${point.releaseDate}, Intelligence Index ${point.score.toFixed(1)}`}
                      onClick={() => setSelected(point.id)}
                      onFocus={() => {
                        setSelected(point.id);
                        setPreview(point);
                      }}
                      onKeyDown={(event) => {
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
                            const circles =
                              event.currentTarget.parentElement?.querySelectorAll<SVGCircleElement>(
                                "circle[role=button]",
                              );
                            circles?.[visible.indexOf(next)]?.focus();
                          }
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(point.id);
                        }
                      }}
                    />
                  ))}
                  {preview && !labeled.some((point) => point.id === preview.id) && (
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
                        label={pointLabel(point)}
                        cx={xPoint(point)}
                        cy={y(point.score)}
                        width={width}
                        height={height}
                        margin={margin}
                        placement={labelPlacements.get(point.id)}
                      />
                    ))}
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
                  <span>┄ Frontier · ≥60% evidence support</span>
                </>
              ) : (
                <span>Lines connect each lab’s supported records.</span>
              )}
            </div>
            <div
              className={timeline.readout}
              aria-live="polite"
              aria-label="Timeline model details"
            >
              <div>
                <strong>{chosen?.name}</strong>
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
          </>
        )}
        {!visible.length && view === "models" && navigator}
      </div>
      <details
        className={styles.commonEvidence}
        aria-label="Timeline evidence"
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
            modelIds={[...visible].sort((a, b) => b.score - a.score).map((point) => point.id)}
            onSelect={setSelected}
          />
        )}
      </details>
    </Panel>
  );
}
