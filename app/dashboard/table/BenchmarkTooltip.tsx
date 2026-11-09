/** Draws a benchmark column's header tooltip: the benchmark, its Atlas weights and coverage in view, and its leaders as stars on a scale zoomed from the whole field. */

import { type CSSProperties, useId } from "react";

import type { BenchmarkTooltipFacts, BenchmarkTooltipLeaders } from "./tooltips";

const insetWidth = 332;
const nameWidth = 118;
const trackLeft = 126;
const valueWidth = 46;
const rowTop = 8;
const rowStep = 18;
// SF Mono at 11px advances about 6.6px per character, which sizes the name column without measuring text.
const characterWidth = 6.6;

export function BenchmarkTooltipBody({
  title,
  body,
  facts,
}: {
  title: string;
  body: string;
  facts: BenchmarkTooltipFacts;
}) {
  const { version, group, details, weights, coverage, leaders, cachedSince } = facts;
  return (
    <>
      <div className="benchmark-tooltip-head">
        <div className="column-tooltip-title">
          {title}
          {version != null && <span className="benchmark-tooltip-version">v{version}</span>}
        </div>
        {group != null && (
          <span className="benchmark-tooltip-class" data-group={group}>
            {group}
          </span>
        )}
      </div>
      <p className="column-tooltip-body">{body}</p>
      {details.length > 0 && (
        <dl className="benchmark-tooltip-details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {cachedSince != null && (
        <p className="benchmark-tooltip-alert">
          Couldn't refresh the source; showing results fetched {cachedSince}.
        </p>
      )}
      <div className="column-tooltip-rule" />
      {weights != null && (
        <div className="benchmark-tooltip-block">
          {/* Baseline benchmarks carry no direct score weight, which an empty bar would only obscure. */}
          {weights.intelligence + weights.agentic === 0 ? (
            <BlockLabel label="Weights" value="none" />
          ) : (
            <>
              <BlockLabel label="Weights" />
              <div className="benchmark-tooltip-bar">
                <span data-dimension="intelligence" style={{ flexGrow: weights.intelligence }} />
                <span data-dimension="agentic" style={{ flexGrow: weights.agentic }} />
              </div>
              <div className="benchmark-tooltip-bar-labels">
                <span data-dimension="intelligence">
                  Intelligence {percent(weights.intelligence)}
                </span>
                <span data-dimension="agentic">Agentic {percent(weights.agentic)}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div className="benchmark-tooltip-block">
        <BlockLabel
          label="Coverage"
          value={
            coverage.total === 0
              ? `No ${coverage.unit} in current view`
              : `${coverage.observed} of ${coverage.total} ${coverage.unit} (${Math.round((coverage.observed / coverage.total) * 100)}%)`
          }
        />
        {coverage.total > 0 && (
          <div className="benchmark-tooltip-bar" data-kind="coverage">
            <span style={{ width: `${(coverage.observed / coverage.total) * 100}%` }} />
          </div>
        )}
      </div>
      {leaders != null && <LeadersInset leaders={leaders} />}
    </>
  );
}

function BlockLabel({ label, value }: { label: string; value?: string }) {
  return (
    <div className="benchmark-tooltip-block-label">
      <span>{label}</span>
      {value != null && <span>{value}</span>}
    </div>
  );
}

/**
 * Each leader takes its own row, strongest first, drawn as the table's score star on one scale zoomed to the leaders, with a ±1 standard error bar where the source publishes one.
 * Beneath the rows, the field strip spans the observed range with every result in view as a faint tick and the leaders lit among them.
 */
function LeadersInset({ leaders }: { leaders: BenchmarkTooltipLeaders }) {
  const { domain, domainLabels, field, stars, gapLabel, standardError, standardErrorLabel } =
    leaders;
  // An SVG id must be unique on the page and usable inside url().
  const trailId = useId().replace(/[^\w-]/g, "");
  const values = stars.map((star) => star.value);
  const zoneLow = Math.min(...values);
  const zoneHigh = Math.max(...values);
  // Padding at least one standard error keeps every error bar on the track.
  const padding = Math.max(
    standardError ?? 0,
    (zoneHigh - zoneLow) * 0.12,
    (domain[1] - domain[0]) * 0.01,
  );
  const trackRight = insetWidth - valueWidth;
  const zoomX = scale(zoneLow - padding, zoneHigh + padding, trackLeft, trackRight);
  const fieldX = scale(domain[0], domain[1], 0, insetWidth);
  const fieldY = rowTop + (stars.length - 1) * rowStep + 24;
  const height = fieldY + 20;
  const summary = [
    gapLabel == null ? null : `gap ${gapLabel}`,
    standardErrorLabel == null ? null : `±${standardErrorLabel} std. error`,
  ]
    .filter((part) => part != null)
    .join(" · ");
  return (
    <div className="benchmark-tooltip-block benchmark-tooltip-leaders">
      <BlockLabel label="Leaders" value={summary || undefined} />
      <svg
        viewBox={`0 0 ${insetWidth} ${height}`}
        role="img"
        aria-label={`Top ${stars.length}: ${stars
          .map((star) => `${star.name} ${star.valueLabel}`)
          .join(", ")}`}
      >
        {stars.map((star, index) => {
          const y = rowTop + index * rowStep;
          const x = zoomX(star.value);
          return (
            <g key={star.name} style={{ "--star": star.color } as CSSProperties}>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={`${trailId}-${index}`}
                x1={trackLeft}
                x2={x}
                y1={y}
                y2={y}
              >
                <stop offset={0} style={{ stopColor: "var(--star)", stopOpacity: 0 }} />
                <stop offset={1} style={{ stopColor: "var(--star)" }} />
              </linearGradient>
              <text className="leaders-name" x={0} y={y + 4}>
                {truncate(star.name, Math.floor(nameWidth / characterWidth))}
              </text>
              <line className="leaders-track" x1={trackLeft} x2={trackRight} y1={y} y2={y} />
              <line stroke={`url(#${trailId}-${index})`} x1={trackLeft} x2={x} y1={y} y2={y} />
              {standardError != null && (
                <path
                  className="leaders-error"
                  d={`M${zoomX(star.value - standardError)},${y - 3}v6m0,-3H${zoomX(star.value + standardError)}m0,-3v6`}
                />
              )}
              <circle className="leaders-star" cx={x} cy={y} r={3} />
              <text className="leaders-value" x={insetWidth} y={y + 4} textAnchor="end">
                {star.valueLabel}
              </text>
            </g>
          );
        })}
        <line className="leaders-axis" x1={0} x2={insetWidth} y1={fieldY} y2={fieldY} />
        {field.map((value, index) => (
          <line
            className="leaders-field"
            key={index}
            x1={fieldX(value)}
            x2={fieldX(value)}
            y1={fieldY - 4}
            y2={fieldY + 4}
          />
        ))}
        {/* The strongest is drawn last, so it stays on top where leaders sit close together. */}
        {[...stars].reverse().map((star) => (
          <circle
            className="leaders-star"
            cx={fieldX(star.value)}
            cy={fieldY}
            key={star.name}
            r={2.25}
            style={{ "--star": star.color } as CSSProperties}
          />
        ))}
        <text className="leaders-tick" x={0} y={fieldY + 19}>
          {domainLabels[0]}
        </text>
        <text className="leaders-tick" x={insetWidth} y={fieldY + 19} textAnchor="end">
          {domainLabels[1]}
        </text>
      </svg>
    </div>
  );
}

function scale(low: number, high: number, left: number, right: number) {
  return (value: number) =>
    high === low ? (left + right) / 2 : left + ((value - low) / (high - low)) * (right - left);
}

function truncate(text: string, characters: number) {
  return text.length <= characters ? text : `${text.slice(0, Math.max(1, characters - 1))}…`;
}

function percent(weight: number) {
  return `${Number((weight * 100).toFixed(1))}%`;
}
