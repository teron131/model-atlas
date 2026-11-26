/** Draws a benchmark column's header tooltip: the benchmark, its Atlas weights, its domain shares, its coverage in view, and its leaders as stars on the benchmark's whole observed range above every result in view. */

import { type CSSProperties, useId } from "react";

import { DomainShareBar, usePointedShare } from "../../shared/ShareBar";
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
  const { version, group, details, weights, domains, coverage, leaders, cachedSince } = facts;
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
      {weights != null && <WeightsBlock weights={weights} />}
      {domains.length > 0 && (
        <div className="benchmark-tooltip-block">
          <BlockLabel label="Domains" />
          <DomainShareBar domains={domains} />
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

const dimensions = [
  { key: "intelligence", name: "Intelligence" },
  { key: "agentic", name: "Agentic" },
] as const;

function WeightsBlock({ weights }: { weights: NonNullable<BenchmarkTooltipFacts["weights"]> }) {
  const pointable = usePointedShare<(typeof dimensions)[number]["key"]>();
  return (
    <div className="benchmark-tooltip-block">
      {/* A benchmark with no direct score weight says so in words, which an empty bar would only obscure. */}
      {weights.intelligence + weights.agentic === 0 ? (
        <BlockLabel label="Weights" value="none" />
      ) : (
        <>
          <BlockLabel label="Weights" />
          <div className="benchmark-tooltip-bar">
            {dimensions.map(({ key }) => (
              <span
                key={key}
                data-dimension={key}
                style={{ flexGrow: weights[key] }}
                {...pointable(key)}
              />
            ))}
          </div>
          <div className="benchmark-tooltip-bar-labels">
            {dimensions.map(({ key, name }) => (
              <span key={key} data-dimension={key} {...pointable(key)}>
                {name} {percent(weights[key])}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
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
 * Each leader takes its own row, strongest first, drawn as the table's score star on the benchmark's observed range, with a ±1 standard error bar where the source publishes one.
 * Beneath the rows, the field strip shares their scale, marking every result in view as a faint tick with the leaders lit among them, so each leader's star stands straight above its tick.
 */
function LeadersInset({ leaders }: { leaders: BenchmarkTooltipLeaders }) {
  const { domain, domainLabels, field, stars, gapLabel, standardError, standardErrorLabel } =
    leaders;
  // An SVG id must be unique on the page and usable inside url().
  const trailId = useId().replace(/[^\w-]/g, "");
  // A standard error of padding at each end keeps every error bar on the track.
  const padding = standardError ?? 0;
  const trackRight = insetWidth - valueWidth;
  const x = scale(domain[0] - padding, domain[1] + padding, trackLeft, trackRight);
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
          const starX = x(star.value);
          return (
            <g key={star.name} style={{ "--star": star.color } as CSSProperties}>
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={`${trailId}-${index}`}
                x1={trackLeft}
                x2={starX}
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
              <line stroke={`url(#${trailId}-${index})`} x1={trackLeft} x2={starX} y1={y} y2={y} />
              {standardError != null && (
                <path
                  className="leaders-error"
                  d={`M${x(star.value - standardError)},${y - 3}v6m0,-3H${x(star.value + standardError)}m0,-3v6`}
                />
              )}
              <circle className="leaders-star" cx={starX} cy={y} r={3} />
              <text className="leaders-value" x={insetWidth} y={y + 4} textAnchor="end">
                {star.valueLabel}
              </text>
            </g>
          );
        })}
        <line className="leaders-axis" x1={trackLeft} x2={trackRight} y1={fieldY} y2={fieldY} />
        {field.map((value, index) => (
          <line
            className="leaders-field"
            key={index}
            x1={x(value)}
            x2={x(value)}
            y1={fieldY - 4}
            y2={fieldY + 4}
          />
        ))}
        {/* The strongest is drawn last, so it stays on top where leaders sit close together. */}
        {[...stars].reverse().map((star) => (
          <circle
            className="leaders-star"
            cx={x(star.value)}
            cy={fieldY}
            key={star.name}
            r={2.25}
            style={{ "--star": star.color } as CSSProperties}
          />
        ))}
        <text className="leaders-tick" x={x(domain[0])} y={fieldY + 19}>
          {domainLabels[0]}
        </text>
        <text className="leaders-tick" x={x(domain[1])} y={fieldY + 19} textAnchor="end">
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
