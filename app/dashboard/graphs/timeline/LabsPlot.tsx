"use client";

/** Lab frontiers share one time axis and a bounded icon lane; historical window edges retain the preceding record. */
import { scaleLinear, scaleUtc } from "d3-scale";
import { type PointerEvent, type ReactNode, useMemo, useState } from "react";

import { providerChartColor, providerDisplayName, providerLogo } from "../../shared/provider-theme";
import { calloutLabelPlacements } from "../plot/label-placement";
import {
  AxisTitles,
  PlotFrame,
  TextPointLabel,
  useLabelSizes,
  XAxisTicks,
  YAxisTicks,
} from "../plot/Primitives";
import type { TimelinePoint } from "./chart-data";
import type { LabFrontier } from "./frontier";

import styles from "../graphs.module.css";
import timeline from "../timeline.module.css";

/** Share hover and pinned selection across each lab’s complete line, endpoint icon and ranked row. */
export function LabsPlot({
  labs,
  start,
  end,
  compact,
  onSelect,
  onPreview,
  navigator,
}: {
  navigator: ReactNode;
  labs: LabFrontier<TimelinePoint>[];
  start: number;
  end: number;
  compact: boolean;
  onSelect: (id: string) => void;
  onPreview: (point: TimelinePoint | null) => void;
}) {
  const [inspection, setInspection] = useState<TimelinePoint | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  /** Keep line, icon and list previews synchronized without changing the pinned lab. */
  function showPreview(point: TimelinePoint | null) {
    setHovered(point?.provider ?? null);
    setInspection(point);
    onPreview(point);
  }

  function toggleLab(point: TimelinePoint) {
    setActive(active === point.provider ? null : point.provider);
    onSelect(point.id);
  }

  const highlight = hovered ?? active;
  const width = compact ? 480 : 1120;
  const height = compact ? 600 : 540;
  const margin = { top: 28, right: compact ? 112 : 96, bottom: 76, left: 72 };
  const right = width - margin.right;
  const bottom = height - margin.bottom;
  const timePadding = (end - start) * 0.04;
  const x = scaleUtc()
    .domain([new Date(start - timePadding), new Date(end + timePadding)])
    .range([margin.left, right]);
  const series = useMemo(
    () =>
      labs.flatMap((lab) => {
        const past = lab.records.filter((p) => Date.parse(p.releaseDate) <= end);
        const leading = past.at(-1);
        if (!leading) return [];
        const prior = past.filter((p) => Date.parse(p.releaseDate) < start).at(-1);
        const records = past.filter((p) => Date.parse(p.releaseDate) >= start);
        const samples = [
          ...(prior ? [{ time: start, point: prior }] : []),
          ...records.map((point) => ({ time: Date.parse(point.releaseDate), point })),
        ];
        return [{ ...lab, leading, records, samples }];
      }),
    [labs, start, end],
  );
  /** Treat the complete segment as a hover target and inspect the nearest actual release, not an interpolated model. */
  function previewLine(event: PointerEvent<SVGPathElement>, lab: (typeof series)[number]) {
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const time = +x.invert(((event.clientX - rect.left) * width) / rect.width);
    const nearest = lab.samples.reduce((best, sample) =>
      Math.abs(sample.time - time) < Math.abs(best.time - time) ? sample : best,
    ).point;
    setHovered(lab.provider);
    if (inspection?.id !== nearest.id) showPreview(nearest);
  }
  const scores = series.flatMap((lab) => lab.samples.map((p) => p.point.score));
  const y = scaleLinear()
    .domain(
      scores.length
        ? [
            Math.floor((Math.min(...scores) - 5) / 20) * 20,
            Math.ceil((Math.max(...scores) + 8) / 20) * 20,
          ]
        : [60, 200],
    )
    .range([bottom, margin.top]);
  // Keep all ten marks inside the plot with a fixed minimum gap, preserving score order.
  const endpoints = [...series]
    .sort((a, b) => b.leading.score - a.leading.score)
    .map((lab) => ({ ...lab, iconY: y(lab.leading.score) }));
  for (let i = 0; i < endpoints.length; i++)
    endpoints[i]!.iconY = Math.max(
      endpoints[i]!.iconY,
      i ? endpoints[i - 1]!.iconY + (compact ? 44 : 32) : margin.top + 16,
    );
  if (endpoints.length && endpoints.at(-1)!.iconY > bottom - 16) {
    endpoints[endpoints.length - 1]!.iconY = bottom - 16;
    for (let i = endpoints.length - 2; i >= 0; i--)
      endpoints[i]!.iconY = Math.min(
        endpoints[i]!.iconY,
        endpoints[i + 1]!.iconY - (compact ? 44 : 32),
      );
  }
  const labeled = series.find((lab) => lab.provider === highlight)?.samples ?? [];
  const modelLabel = (point: TimelinePoint) =>
    point.name === "GPT-4 (Mar 2023)" ? "GPT-4" : point.name;
  const { svgRef, labelSizes } = useLabelSizes(
    labeled.map(({ point }) => modelLabel(point)).join("\0"),
    compact,
  );
  const labelLayoutKey = JSON.stringify({
    labels: labeled.map(({ time, point }) => ({
      key: point.id,
      label: modelLabel(point),
      cx: x(new Date(time)),
      cy: y(point.score),
      radius: 4,
      size: labelSizes[modelLabel(point)],
    })),
    obstacles: labeled.map(({ time, point }) => ({
      key: point.id,
      cx: x(new Date(time)),
      cy: y(point.score),
      radius: 6,
    })),
    segments: labeled.slice(1).map((sample, index) => ({
      x1: x(new Date(labeled[index]!.time)),
      y1: y(labeled[index]!.point.score),
      x2: x(new Date(sample.time)),
      y2: y(sample.point.score),
    })),
    bounds: {
      left: margin.left + 12,
      right: right - 12,
      top: margin.top + 12,
      bottom: bottom - 12,
    },
  });
  const labelPlacements = useMemo(
    () => calloutLabelPlacements(JSON.parse(labelLayoutKey)),
    [labelLayoutKey],
  );
  const dateFormat = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC",
    ...(end - start < 730 * 86400000 ? { month: "short" as const } : {}),
  });
  return (
    <>
      <div className={`${styles.chartWrap} ${timeline.chart}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Labs: Intelligence Index frontier by release date"
        >
          <PlotFrame width={width} height={height} margin={margin} />
          {y.ticks(6).map((tick) => (
            <line
              key={tick}
              x1={margin.left}
              x2={right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--chart-grid)"
            />
          ))}
          <XAxisTicks
            ticks={x.ticks(compact ? 4 : 7).map(Number)}
            xPoint={(value) => x(new Date(value))}
            y={bottom}
            format={(value) => dateFormat.format(value)}
            keyPrefix="labs"
            labelMinGap={65}
          />
          <YAxisTicks
            ticks={y.ticks(6)}
            yPoint={y}
            x={margin.left}
            format={String}
            keyPrefix="labs"
          />
          <AxisTitles
            width={width}
            height={height}
            margin={margin}
            x="Release date"
            y="Intelligence Index"
            compact={compact}
          />
          {series.map((lab) => {
            const first = lab.samples[0]!;
            const path =
              `M${x(new Date(first.time))},${y(first.point.score)}` +
              lab.samples
                .slice(1)
                .map((p) => `L${x(new Date(p.time))},${y(p.point.score)}`)
                .join("");
            const color = providerChartColor(lab.provider);
            return (
              <g key={lab.provider} opacity={highlight && highlight !== lab.provider ? 0.16 : 0.8}>
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={highlight === lab.provider ? 2.5 : 1.5}
                  pointerEvents="none"
                />
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  data-lab-line={lab.provider}
                  role="button"
                  tabIndex={0}
                  aria-label={`${providerDisplayName(lab.provider)} frontier line`}
                  aria-pressed={active === lab.provider}
                  className={timeline.labEndpoint}
                  onPointerEnter={(event) => previewLine(event, lab)}
                  onPointerMove={(event) => previewLine(event, lab)}
                  onPointerLeave={() => showPreview(null)}
                  onFocus={() => showPreview(lab.leading)}
                  onBlur={() => showPreview(null)}
                  onClick={() =>
                    toggleLab(inspection?.provider === lab.provider ? inspection : lab.leading)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleLab(lab.leading);
                    }
                  }}
                />
                {lab.records.map((point) => (
                  <g
                    key={point.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${point.name}, Intelligence Index ${point.score.toFixed(1)}`}
                    className={timeline.labEndpoint}
                    onPointerEnter={() => showPreview(point)}
                    onPointerLeave={() => showPreview(null)}
                    onFocus={() => showPreview(point)}
                    onBlur={() => showPreview(null)}
                    onClick={() => onSelect(point.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(point.id);
                      }
                    }}
                  >
                    <circle
                      cx={x(new Date(point.releaseDate))}
                      cy={y(point.score)}
                      r="9"
                      fill="transparent"
                    />
                    <circle
                      cx={x(new Date(point.releaseDate))}
                      cy={y(point.score)}
                      r={highlight === lab.provider ? 4 : 3}
                      fill={color}
                      pointerEvents="none"
                    />
                  </g>
                ))}
              </g>
            );
          })}
          {endpoints.map((lab) => {
            const color = providerChartColor(lab.provider);
            const logo = providerLogo(lab.provider);
            const name = providerDisplayName(lab.provider);
            return (
              <g
                key={lab.provider}
                role="button"
                tabIndex={0}
                aria-label={`${name}, ${lab.leading.name}, Intelligence Index ${lab.leading.score.toFixed(1)}`}
                aria-pressed={active === lab.provider}
                className={timeline.labEndpoint}
                onPointerEnter={() => showPreview(lab.leading)}
                onPointerLeave={() => showPreview(null)}
                onFocus={() => showPreview(lab.leading)}
                onBlur={() => showPreview(null)}
                onClick={() => toggleLab(lab.leading)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleLab(lab.leading);
                  }
                }}
              >
                <rect
                  x={right + (compact ? 18 : 10)}
                  y={lab.iconY - 14}
                  width={margin.right - (compact ? 18 : 10)}
                  height="28"
                  rx="3"
                  fill="var(--paper)"
                  stroke="transparent"
                />
                {logo ? (
                  <image
                    href={logo}
                    x={right + (compact ? 22 : 14)}
                    y={lab.iconY - (compact ? 12 : 10)}
                    width={compact ? 24 : 20}
                    height={compact ? 24 : 20}
                  />
                ) : (
                  <text
                    className={styles.axisLabel}
                    x={right + (compact ? 32 : 24)}
                    y={lab.iconY + 4}
                    textAnchor="middle"
                    fill={color}
                  >
                    {name.slice(0, 2)}
                  </text>
                )}
                <text
                  className={styles.axisLabel}
                  x={width - (compact ? 9 : 8)}
                  y={lab.iconY + 4}
                  textAnchor="end"
                  fill="var(--ink)"
                  fontFamily="var(--font-mono)"
                >
                  {lab.leading.score.toFixed(1)}
                </text>
              </g>
            );
          })}
          <g pointerEvents="none" aria-label="Highlighted lab model labels">
            {labeled.map(({ time, point }) => (
              <TextPointLabel
                key={point.id}
                label={modelLabel(point)}
                cx={x(new Date(time))}
                cy={y(point.score)}
                width={width}
                height={height}
                margin={margin}
                placement={labelPlacements.get(point.id)}
              />
            ))}
          </g>
          {!series.length && (
            <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--muted)">
              No supported lab records in this period.
            </text>
          )}
        </svg>
      </div>
      {navigator}
      <div className={timeline.labList} aria-label="Lab rankings">
        <div className={timeline.labListHead}>
          <span>Lab</span>
          <span>Leading model</span>
          <span>Index</span>
        </div>
        {endpoints.map((lab, index) => (
          <button
            key={lab.provider}
            type="button"
            className={timeline.labListRow}
            data-highlighted={highlight === lab.provider || undefined}
            aria-pressed={active === lab.provider}
            onPointerEnter={() => showPreview(lab.leading)}
            onPointerLeave={() => showPreview(null)}
            onFocus={() => showPreview(lab.leading)}
            onBlur={() => showPreview(null)}
            onClick={() => toggleLab(lab.leading)}
          >
            <span className={timeline.labIdentity}>
              <span className={timeline.labRank}>{index + 1}</span>
              {providerLogo(lab.provider) && (
                <img src={providerLogo(lab.provider)} alt="" width="20" height="20" />
              )}
              <span>{providerDisplayName(lab.provider)}</span>
            </span>
            <span className={timeline.labModel}>{lab.leading.name}</span>
            <strong>{lab.leading.score.toFixed(1)}</strong>
          </button>
        ))}
      </div>
    </>
  );
}
