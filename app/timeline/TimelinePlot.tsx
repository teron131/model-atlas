"use client";

/** Plot release cohorts on one anchored ruler with a coverage-qualified frontier and keyboard-selectable evidence points. */

import { scaleLinear } from "d3-scale";
import { ChevronLeft, ChevronRight, Minus, Plus, Scan } from "lucide-react";
import { type PointerEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { HistoricalEstimate, HistoricalModel } from "../../src/model-atlas/timeline/types";
import {
  calloutLabelPlacements,
  type PointLabelSize,
  pointSegmentDistance,
} from "../dashboard/graphs/plot/label-placement";
import {
  providerChartColor,
  providerDisplayName,
  providerFilterKey,
  providerLogo,
} from "../dashboard/shared/provider-theme";
import { coverageFrontier, TIMELINE_START_DATE } from "./frontier";
import { timelineModelLabel, timelineModelName } from "./model-display";

import styles from "./timeline.module.css";

type Point = HistoricalModel & {
  score: number;
  estimate: HistoricalEstimate;
  coverage: number | null;
};

export function TimelinePlot({
  points,
  selected,
  onSelect,
}: {
  points: Point[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const minimumCoverage = 60;
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoveredLab, setHoveredLab] = useState<string | null>(null);
  const [focusedLab, setFocusedLab] = useState<string | null>(null);
  const [view, setView] = useState<"models" | "labs">("models");
  const [selectedLabs, setSelectedLabs] = useState<string[] | null>(null);
  const [window, setWindow] = useState<[number, number]>([0, 1]);
  const clipId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelSizes, setLabelSizes] = useState<Record<string, PointLabelSize>>({});
  // Match the main graph's font-aware measurements instead of estimating character widths.
  useLayoutEffect(() => {
    let disposed = false;
    const measure = () => {
      if (disposed || !svgRef.current) return;
      const measured: Record<string, PointLabelSize> = {};
      for (const text of Array.from(
        svgRef.current.querySelectorAll<SVGTextElement>("text[data-model-label]"),
      )) {
        const box = text.getBBox();
        const baseline = text.y.baseVal.getItem(0).value;
        measured[text.textContent ?? ""] = {
          width: box.width,
          ascent: baseline - box.y,
          descent: box.y + box.height - baseline,
        };
      }
      setLabelSizes((previous) =>
        Object.entries(measured).some(
          ([key, size]) =>
            !previous[key] ||
            Math.abs(previous[key].width - size.width) > 0.1 ||
            Math.abs(previous[key].ascent - size.ascent) > 0.1 ||
            Math.abs(previous[key].descent - size.descent) > 0.1,
        )
          ? { ...previous, ...measured }
          : previous,
      );
    };
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
    };
  }, [points, window, view, selectedLabs, minimumCoverage]);
  const drag = useRef<{
    x: number;
    width: number;
    window: [number, number];
    mode: "pan" | "start" | "end";
    chart: boolean;
  } | null>(null);
  const span = window[1] - window[0];
  const moveWindow = (start: number, width = span) => {
    const boundedWidth = Math.max(1 / 64, Math.min(1, width));
    const boundedStart = Math.max(0, Math.min(1 - boundedWidth, start));
    setWindow([boundedStart, boundedStart + boundedWidth]);
  };
  const zoom = (width: number) => moveWindow((window[0] + window[1] - width) / 2, width);
  /** Capture one pointer so panning and range handles continue smoothly outside the chart. */
  const beginDrag = (
    event: PointerEvent<HTMLElement | SVGSVGElement>,
    mode: "pan" | "start" | "end",
    chart = false,
  ) => {
    if (event.button !== 0 || (chart && (event.target as Element).closest('[role="button"]')))
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      width: bounds.width * (chart ? (view === "labs" ? 1085 : 990) / 1200 : 1),
      window: [...window],
      mode,
      chart,
    };
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent<HTMLElement | SVGSVGElement>) => {
    const active = drag.current;
    if (!active) return;
    const [start, end] = active.window;
    const delta = ((event.clientX - active.x) / active.width) * (active.chart ? -(end - start) : 1);
    if (active.mode === "start")
      setWindow([Math.max(0, Math.min(end - 1 / 64, start + delta)), end]);
    else if (active.mode === "end")
      setWindow([start, Math.min(1, Math.max(start + 1 / 64, end + delta))]);
    else moveWindow(start + delta, end - start);
  };
  const endDrag = () => {
    drag.current = null;
  };
  const plot = useMemo(() => {
    if (!points.length) return null;
    const ordered = [...points].sort(
      (a, b) => a.releaseDate!.localeCompare(b.releaseDate!) || b.score - a.score,
    );
    const labs = new Map<string, Point[]>();
    const modelFamilies = new Map<string, Set<string>>();
    for (const point of ordered) {
      if (point.estimate.indexOnly) continue;
      const key = providerFilterKey(point.provider);
      const families = modelFamilies.get(key) ?? new Set<string>();
      families.add(point.family);
      modelFamilies.set(key, families);
      const records = labs.get(key) ?? [];
      records.push(point);
      labs.set(key, records);
    }
    const series = [...labs]
      .filter(([key]) => modelFamilies.get(key)!.size >= 5)
      .map(([key, records]) => ({
        key,
        provider: records[0]!.provider,
        records: coverageFrontier(records, minimumCoverage / 100),
      }))
      .filter((lab) => lab.records.length > 0);
    series.sort(
      (a, b) => b.records.at(-1)!.score - a.records.at(-1)!.score || a.key.localeCompare(b.key),
    );
    const activeLabs = selectedLabs ?? series.slice(0, 10).map((lab) => lab.key);
    const activeSeries = series.filter((lab) => activeLabs.includes(lab.key));
    const labPoints = activeSeries.flatMap((lab) => lab.records);
    const plotted = view === "labs" ? labPoints : ordered;
    const scores = (plotted.length ? plotted : ordered).map((point) => point.score);
    const times = (plotted.length ? plotted : ordered).map((point) =>
      Date.parse(point.releaseDate!),
    );
    const left = view === "labs" ? 65 : 160;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const fullStart = minTime - 30 * 86400000;
    const fullEnd = Math.max(maxTime, minTime + 60 * 86400000) + 30 * 86400000;
    const overviewX = scaleLinear().domain([fullStart, fullEnd]).range([0, 1200]);
    const domain = window.map((value) => fullStart + value * (fullEnd - fullStart));
    const x = scaleLinear().domain(domain).range([left, 1150]);
    const visible = plotted.filter((point) => {
      const time = Date.parse(point.releaseDate!);
      return time >= domain[0]! && time <= domain[1]!;
    });
    const visiblePoints = new Set(visible);
    // Empty time windows retain the full score range instead of producing an invalid axis.
    const visibleScores = visible.length ? visible.map((point) => point.score) : scores;
    const lower = Math.min(...visibleScores);
    const upper = Math.max(...visibleScores);
    const overviewY = scaleLinear()
      .domain([Math.min(...scores), Math.max(...scores)])
      .range([54, 8]);
    const margin = upper > lower ? (upper - lower) * 0.04 : Math.max(Math.abs(upper) * 0.04, 1);
    const y = scaleLinear()
      .domain([lower >= 0 ? Math.max(0, lower - margin) : lower - margin, upper + margin])
      .range([935, 30]);
    // Start the displayed envelope at GPT-4's release; earlier observations remain inspectable dots.
    const frontier = coverageFrontier(ordered, minimumCoverage / 100).filter(
      (point) => point.releaseDate! >= TIMELINE_START_DATE,
    );
    const first = frontier[0];
    const leadIn =
      first &&
      visiblePoints.has(first) &&
      ordered.some((point) => point.releaseDate! < TIMELINE_START_DATE)
        ? `M${x(Date.parse(first.releaseDate!)) - 45},${Math.min(925, y(first.score) + 12)} L${x(Date.parse(first.releaseDate!))},${y(first.score)}`
        : null;
    const linePath = (records: Point[]) =>
      records
        .map(
          (point, index) =>
            `${index ? "L" : "M"}${x(Date.parse(point.releaseDate!))},${y(point.score)}`,
        )
        .join(" ");
    const path = linePath(frontier);
    const labLines = activeSeries.map((lab) => ({ ...lab, path: linePath(lab.records) }));
    const labels =
      view === "labs"
        ? activeSeries.flatMap((lab) => {
            const last = lab.records.filter((point) => visiblePoints.has(point)).at(-1);
            return last ? [last] : [];
          })
        : frontier.filter((point) => visiblePoints.has(point));
    const placements = calloutLabelPlacements({
      directions: view === "labs" ? undefined : [[-1, -1]],
      segmentWeight: view === "labs" ? 1000 : 1,
      labels: labels.map((point) => ({
        key: point.id,
        label:
          view === "labs"
            ? providerDisplayName(providerFilterKey(point.provider))
            : timelineModelLabel(point),
        cx: x(Date.parse(point.releaseDate!)),
        cy: y(point.score),
        radius: 5,
        size:
          view === "labs"
            ? { width: 22, ascent: 11, descent: 11 }
            : labelSizes[timelineModelLabel(point)],
      })),
      obstacles: visible.map((point) => ({
        key: point.id,
        cx: x(Date.parse(point.releaseDate!)),
        cy: y(point.score),
        radius: 5,
        weight: view === "labs" ? 1 : 0.15,
      })),
      bounds: { left: 5, right: 1180, top: 10, bottom: 935 },
      segments:
        view === "labs"
          ? activeSeries.flatMap((lab) =>
              lab.records.slice(1).map((point, index) => ({
                x1: x(Date.parse(lab.records[index]!.releaseDate!)),
                y1: y(lab.records[index]!.score),
                x2: x(Date.parse(point.releaseDate!)),
                y2: y(point.score),
              })),
            )
          : frontier.slice(1).flatMap((point, index) => {
              const previous = frontier[index]!;
              const x1 = x(Date.parse(previous.releaseDate!)),
                x2 = x(Date.parse(point.releaseDate!));
              const y1 = y(previous.score),
                y2 = y(point.score);
              return [{ x1, y1, x2, y2 }];
            }),
    });
    return {
      x,
      y,
      left,
      overviewPoints: plotted,
      frontier,
      leadIn,
      path,
      series,
      activeLabs,
      labLines,
      labels,
      placements,
      visible,
      overviewX,
      overviewY,
      yTicks: y.ticks(6),
      domain,
      fullStart,
      fullEnd,
    };
  }, [points, window, labelSizes, view, selectedLabs, minimumCoverage]);
  if (!plot)
    return (
      <div className={styles.empty}>
        No dated models have a supported position in this selection.
      </div>
    );
  const activeLab = hoveredLab ?? focusedLab;
  const highlightedLab = activeLab && plot.activeLabs.includes(activeLab) ? activeLab : null;
  const labEndpoints = new Set(plot.labLines.map((lab) => lab.records.at(-1)?.id));
  const comparisonTime = hoverTime ?? plot.domain[1]!;
  // Keep DOM rows in the established lab order while the crosshair updates values and ranks.
  const labLeaders = plot.labLines.map((lab) => ({
    ...lab,
    record: lab.records.filter((point) => Date.parse(point.releaseDate!) <= comparisonTime).at(-1),
  }));
  const rankedLeaders = [...labLeaders].sort(
    (a, b) =>
      (b.record?.score ?? -Infinity) - (a.record?.score ?? -Infinity) || a.key.localeCompare(b.key),
  );

  return (
    <div className={styles.plot}>
      <div className={styles.tabs} role="group" aria-label="Timeline view">
        <button aria-pressed={view === "models"} onClick={() => setView("models")}>
          Models
        </button>
        <button aria-pressed={view === "labs"} onClick={() => setView("labs")}>
          Labs
        </button>
      </div>
      <p className={styles.labHint}>Fainter points have less evidence coverage.</p>
      {view === "labs" ? (
        <>
          <p className={styles.labHint}>Each line follows a lab’s leading models.</p>
          <table className={styles.labStandings}>
            <caption>
              <strong>Lab leaders</strong>
              <span>
                As of{" "}
                {new Date(comparisonTime).toLocaleDateString("en", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </span>
            </caption>
            <thead>
              <tr>
                <th scope="col" className={styles.labRank} aria-label="Rank">
                  #
                </th>
                <th scope="col" className={styles.labName}>
                  Lab
                </th>
                <th scope="col" className={styles.labModel}>
                  Leading model
                </th>
                <th scope="col" className={styles.labScore}>
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {labLeaders.map((lab) => {
                const name = lab.record ? timelineModelName(lab.record) : "No model released yet";
                const logo = providerLogo(lab.provider);
                const rank = lab.record
                  ? rankedLeaders.findIndex((entry) => entry.record?.score === lab.record!.score) +
                    1
                  : null;
                return (
                  <tr
                    key={lab.key}
                    tabIndex={0}
                    data-unreleased={!lab.record || undefined}
                    data-highlighted={highlightedLab === lab.key || undefined}
                    onPointerEnter={() => setHoveredLab(lab.key)}
                    onPointerLeave={() => setHoveredLab(null)}
                    onFocus={() => setFocusedLab(lab.key)}
                    onBlur={() => setFocusedLab(null)}
                  >
                    <td className={`${styles.labRank} rank`}>{rank ?? "—"}</td>
                    <th scope="row" className={styles.labName}>
                      <span className={styles.labIdentity}>
                        <i
                          className={styles.labSwatch}
                          style={{ background: providerChartColor(lab.provider) }}
                          aria-hidden="true"
                        />
                        <span className={styles.labIcon}>
                          {logo ? <img src={logo} alt="" width="18" height="18" /> : null}
                        </span>
                        <span className={styles.labText}>
                          <span>{providerDisplayName(lab.provider)}</span>
                          <span className={styles.labMobileModel} title={name}>
                            {name}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className={styles.labModel} title={name}>
                      {name}
                    </td>
                    <td className={styles.labScore}>
                      {lab.record ? lab.record.score.toFixed(1) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <details className={styles.labPicker}>
            <summary>Choose labs · {plot.labLines.length} selected</summary>
            <div className={styles.labLegend} aria-label="Visible labs">
              {plot.series.map((lab) => (
                <button
                  key={lab.key}
                  aria-pressed={plot.activeLabs.includes(lab.key)}
                  onClick={() =>
                    setSelectedLabs((previous) => {
                      const active = previous ?? plot.activeLabs;
                      return active.includes(lab.key)
                        ? active.filter((key) => key !== lab.key)
                        : [...active, lab.key];
                    })
                  }
                >
                  <span className={styles.labIcon}>
                    {providerLogo(lab.provider) ? (
                      <img src={providerLogo(lab.provider)} alt="" width="18" height="18" />
                    ) : (
                      <i style={{ background: providerChartColor(lab.provider) }} />
                    )}
                  </span>
                  {providerDisplayName(lab.provider)}
                </button>
              ))}
            </div>
          </details>
        </>
      ) : null}
      <div className={styles.transport}>
        <div className={styles.transportButtons}>
          <button
            aria-label="Pan earlier"
            disabled={window[0] <= 0}
            onClick={() => moveWindow(window[0] - span / 3)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Pan later"
            disabled={window[1] >= 1}
            onClick={() => moveWindow(window[0] + span / 3)}
          >
            <ChevronRight size={16} />
          </button>
          <span className={styles.windowDates}>
            {new Date(plot.domain[0]!).toLocaleDateString("en", {
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}{" "}
            —{" "}
            {new Date(plot.domain[1]!).toLocaleDateString("en", {
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>
        <div className={styles.transportButtons}>
          <button
            aria-label="Zoom out"
            disabled={span >= 1}
            onClick={() => zoom(Math.min(1, span * 2))}
          >
            <Minus size={16} />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min="0"
            max="6"
            step="0.05"
            value={Math.log2(1 / span)}
            onChange={(event) => zoom(2 ** -Number(event.target.value))}
          />
          <button
            aria-label="Zoom in"
            disabled={span <= 1 / 64}
            onClick={() => zoom(Math.max(1 / 64, span / 2))}
          >
            <Plus size={16} />
          </button>
          <button onClick={() => setWindow([0, 1])}>
            <Scan size={15} /> Fit all
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
        className={styles.mainPlot}
        onPointerDown={(event) => beginDrag(event, "pan", true)}
        onPointerMove={(event) => {
          moveDrag(event);
          if (view === "labs" && !drag.current) {
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(
              matrix.inverse(),
            );
            const inside =
              cursor.x >= plot.left && cursor.x <= 1150 && cursor.y >= 30 && cursor.y <= 935;
            setHoverTime(inside ? plot.x.invert(cursor.x) : null);
            let nearest: string | null = null;
            let distance = 8 / Math.hypot(matrix.a, matrix.b);
            if (inside)
              for (const lab of plot.labLines) {
                for (const [index, point] of lab.records.entries()) {
                  const previous = lab.records[Math.max(0, index - 1)]!;
                  const gap = pointSegmentDistance(cursor.x, cursor.y, {
                    x1: plot.x(Date.parse(previous.releaseDate!)),
                    y1: plot.y(previous.score),
                    x2: plot.x(Date.parse(point.releaseDate!)),
                    y2: plot.y(point.score),
                  });
                  if (gap < distance) {
                    distance = gap;
                    nearest = lab.key;
                  }
                }
              }
            setHoveredLab(nearest);
          }
        }}
        onPointerLeave={() => {
          setHoverTime(null);
          setHoveredLab(null);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        viewBox="0 0 1200 1000"
        role="img"
        aria-label="Anchored capability by model release date. Linear score axis. Hover or focus a model point to inspect its evidence."
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={plot.left} y="10" width={1150 - plot.left} height="925" />
          </clipPath>
        </defs>
        {plot.yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={plot.left}
              x2="1170"
              y1={plot.y(tick)}
              y2={plot.y(tick)}
              className={styles.grid}
            />
            <text x={plot.left - 13} y={plot.y(tick) + 4} textAnchor="end" className={styles.tick}>
              {tick}
            </text>
          </g>
        ))}
        {plot.x.ticks(7).map((tick) => (
          <g key={tick}>
            <line x1={plot.x(tick)} x2={plot.x(tick)} y1="30" y2="935" className={styles.grid} />
            <text x={plot.x(tick)} y="961" textAnchor="middle" className={styles.tick}>
              {new Date(tick).toLocaleDateString("en", {
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}
            </text>
          </g>
        ))}
        {view === "models" && plot.leadIn ? (
          <path
            d={plot.leadIn}
            className={styles.frontier}
            opacity="0.55"
            aria-label="Earlier models omitted from the frontier"
          >
            <title>
              Earlier models omitted from the frontier; this continuation is not a model score.
            </title>
          </path>
        ) : null}
        <g clipPath={`url(#${clipId})`}>
          {view === "labs" ? (
            plot.labLines.map((lab) => (
              <path
                key={lab.key}
                d={lab.path}
                className={styles.labLine}
                data-highlighted={highlightedLab === lab.key || undefined}
                data-muted={Boolean(highlightedLab && highlightedLab !== lab.key) || undefined}
                stroke={providerChartColor(lab.provider)}
                aria-label={providerDisplayName(lab.provider) + " frontier"}
              />
            ))
          ) : (
            <path d={plot.path} className={styles.frontier} />
          )}
          {view === "labs" && hoverTime != null ? (
            <line
              x1={plot.x(hoverTime)}
              x2={plot.x(hoverTime)}
              y1="30"
              y2="935"
              className={styles.crosshair}
            />
          ) : null}
          {plot.visible.map((point) => {
            const hidden = view === "labs" && selected !== point.id && !labEndpoints.has(point.id);
            return (
              <circle
                key={point.id}
                cx={plot.x(Date.parse(point.releaseDate!))}
                cy={plot.y(point.score)}
                r={
                  selected === point.id
                    ? 7
                    : view === "labs"
                      ? 5
                      : point.estimate.indexOnly
                        ? 4
                        : 4.5
                }
                fill={
                  point.estimate.indexOnly
                    ? "var(--paper)"
                    : providerChartColor(
                        view === "labs" ? providerFilterKey(point.provider) : point.provider,
                      )
                }
                stroke={providerChartColor(
                  view === "labs" ? providerFilterKey(point.provider) : point.provider,
                )}
                strokeWidth={selected === point.id ? 2.8 : 1.4}
                opacity={
                  hidden
                    ? 0
                    : coverageOpacity(point.coverage) *
                      (view === "labs" &&
                      highlightedLab &&
                      providerFilterKey(point.provider) !== highlightedLab
                        ? 0.15
                        : 1)
                }
                pointerEvents={hidden ? "none" : undefined}
                tabIndex={hidden ? -1 : 0}
                role="button"
                aria-label={`${timelineModelName(point)}: ${point.score.toFixed(1)}, ${point.releaseDate}, ${coverageLabel(point.coverage)}`}
                onPointerEnter={(event) => {
                  if (view === "models" && event.pointerType === "mouse" && !drag.current)
                    onSelect(point.id);
                }}
                onFocus={() => {
                  if (view === "labs") setFocusedLab(providerFilterKey(point.provider));
                  else onSelect(point.id);
                }}
                onBlur={() => {
                  if (view === "labs") setFocusedLab(null);
                }}
                onClick={() => onSelect(point.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(point.id);
                  }
                }}
              >
                <title>
                  {`${timelineModelName(point)} · ${point.score.toFixed(1)} · ${point.releaseDate} · ${coverageLabel(point.coverage)}${point.estimate.versionAdjustment ? " · version-reconciled" : ""}`}
                </title>
              </circle>
            );
          })}
        </g>
        <g>
          {plot.labels.map((point) => {
            const placement = plot.placements.get(point.id)!;
            const labKey = providerFilterKey(point.provider);
            const logo = view === "labs" ? providerLogo(labKey) : "";
            if (view === "labs")
              return logo ? (
                <g key={point.id} opacity={highlightedLab && highlightedLab !== labKey ? 0.15 : 1}>
                  {placement.line ? (
                    <line {...placement.line} stroke={providerChartColor(labKey)} opacity={0.65} />
                  ) : null}
                  <image
                    href={logo}
                    x={placement.x}
                    y={placement.y - 11}
                    width="22"
                    height="22"
                    aria-label={providerDisplayName(labKey)}
                  >
                    <title>{providerDisplayName(labKey)}</title>
                  </image>
                </g>
              ) : null;
            return (
              <g key={point.id}>
                {placement.line ? (
                  <line
                    {...placement.line}
                    stroke={providerChartColor(point.provider)}
                    opacity={0.5}
                  />
                ) : null}
                <text
                  x={placement.x}
                  y={placement.y}
                  textAnchor={placement.textAnchor}
                  data-model-label={point.id}
                  className={styles.pointLabel}
                  fill={providerChartColor(point.provider)}
                >
                  {timelineModelLabel(point)}
                </text>
              </g>
            );
          })}
        </g>
        {view === "labs" && hoverTime != null ? (
          <g pointerEvents="none">
            <rect
              x={Math.max(plot.left, Math.min(1050, plot.x(hoverTime) - 50))}
              y="943"
              width="100"
              height="25"
              rx="3"
              fill="var(--ink)"
            />
            <text
              x={Math.max(plot.left + 50, Math.min(1100, plot.x(hoverTime)))}
              y="960"
              textAnchor="middle"
              fill="var(--paper)"
              fontSize="12"
            >
              {new Date(hoverTime).toISOString().slice(0, 10)}
            </text>
          </g>
        ) : null}
        <text x={(plot.left + 1150) / 2} y="993" textAnchor="middle" className={styles.tick}>
          Model release date
        </text>
      </svg>
      <div className={styles.navigator} aria-label="Timeline overview">
        <svg viewBox="0 0 1200 64" preserveAspectRatio="none" aria-hidden="true">
          {plot.overviewPoints.map((point) => (
            <circle
              key={point.id}
              cx={plot.overviewX(Date.parse(point.releaseDate!))}
              cy={plot.overviewY(point.score)}
              r="2.5"
              fill={providerChartColor(point.provider)}
              opacity={coverageOpacity(point.coverage)}
            />
          ))}
        </svg>
        <div className={styles.rangeShade} style={{ left: 0, width: `${window[0] * 100}%` }} />
        <div className={styles.rangeShade} style={{ left: `${window[1] * 100}%`, right: 0 }} />
        <div
          className={styles.rangeWindow}
          style={{ left: `${window[0] * 100}%`, width: `${span * 100}%` }}
        />
        <div
          className={styles.rangeInteraction}
          onPointerDown={(event) => {
            const mode = (event.target as HTMLElement).dataset.handle;
            if (!mode) {
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = (event.clientX - bounds.left) / bounds.width;
              if (position < window[0] || position > window[1]) {
                moveWindow(position - span / 2);
                return;
              }
            }
            beginDrag(event, mode === "start" || mode === "end" ? mode : "pan");
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          {(["start", "end"] as const).map((edge, index) => (
            <button
              key={edge}
              data-handle={edge}
              className={styles.rangeHandle}
              style={{ left: `${window[index]! * 100}%` }}
              role="slider"
              aria-label={edge === "start" ? "Visible range start" : "Visible range end"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(window[index]! * 100)}
              aria-valuetext={new Date(plot.domain[index]!).toISOString().slice(0, 10)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const delta = (event.key === "ArrowLeft" ? -1 : 1) / 100;
                if (edge === "start")
                  setWindow([
                    Math.max(0, Math.min(window[1] - 1 / 64, window[0] + delta)),
                    window[1],
                  ]);
                else
                  setWindow([
                    window[0],
                    Math.min(1, Math.max(window[0] + 1 / 64, window[1] + delta)),
                  ]);
              }}
            />
          ))}
        </div>
      </div>
      <div className={styles.navigatorCaption}>
        <span>{new Date(plot.fullStart).getUTCFullYear()}</span>
        <span>Drag to pan · Resize the handles to zoom · {plot.visible.length} visible models</span>
        <span>{new Date(plot.fullEnd).getUTCFullYear()}</span>
      </div>
    </div>
  );
}

/** Keep sparse or unknown evidence visible while opacity consistently encodes coverage, including during selection. */
function coverageOpacity(coverage: number | null): number {
  return 0.25 + 0.75 * Math.max(0, Math.min(1, coverage ?? 0));
}

function coverageLabel(coverage: number | null): string {
  return coverage == null
    ? "Evidence coverage unknown"
    : `${(coverage * 100).toFixed(1)}% evidence coverage`;
}
