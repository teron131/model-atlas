"use client";

/** Shared hover, filter, and summary UI for Model Atlas charts. */

import { Boxes } from "lucide-react";
import { type CSSProperties, useState } from "react";

import { fmtCompact } from "./format";
import type { HoverState } from "./types";

import styles from "./graphs.module.css";

export function HoverCard({ hover }: { hover: HoverState }) {
  const left = Math.min(Math.max(14, hover.left + 16), window.innerWidth - 280);
  const top = Math.min(Math.max(14, hover.top + 16), window.innerHeight - 210);
  return (
    <div
      className={styles.hoverCard}
      style={
        {
          "--hover-color": hover.color,
          transform: `translate3d(${left}px, ${top}px, 0)`,
        } as CSSProperties
      }
    >
      <div className={styles.hoverCardHead}>
        <span className={styles.hoverCardLogo}>
          {hover.logo ? (
            <img
              src={hover.logo}
              alt=""
              width={26}
              height={26}
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
        </span>
        <div>
          <div className={styles.hoverCardTitle}>{hover.model}</div>
          <div className={styles.hoverCardProvider}>{hover.provider}</div>
        </div>
      </div>
      <div className={styles.hoverCardRows}>
        {hover.rows.map(([label, value]) => (
          <div key={label} className={styles.hoverCardRow}>
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyChart({
  message = "No models match the current filters.",
}: {
  message?: string;
}) {
  return <div className={styles.error}>{message}</div>;
}

export function FilterButton({
  active,
  color,
  logo,
  label,
  count,
  onClick,
}: {
  active: boolean;
  color: string;
  logo?: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const hasUsableLogo = logo != null && logo !== "" && failedLogo !== logo;

  return (
    <button
      type="button"
      className={styles.filterButton}
      aria-pressed={active}
      style={{ "--provider-color": color } as CSSProperties}
      onClick={onClick}
    >
      <span className={styles.filterIcon} aria-hidden="true">
        {hasUsableLogo ? (
          <img
            className={styles.filterLogo}
            src={logo}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            onError={() => {
              setFailedLogo(logo);
            }}
          />
        ) : logo ? (
          <span className={styles.filterIconFallback}>{label.slice(0, 1)}</span>
        ) : (
          <Boxes className={styles.filterAllIcon} strokeWidth={2.1} />
        )}
      </span>
      <span>{label}</span>
      <span>{fmtCompact(count)}</span>
    </button>
  );
}

export function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryLabel}>{label}</div>
      <span className={styles.summaryValue}>{value}</span>
      <span className={styles.summaryDetail}>{detail}</span>
    </div>
  );
}

export function ShapeScaleLegend() {
  return (
    <span className={styles.shapeScaleLegend}>
      <svg className={styles.shapeScaleGraphic} viewBox="0 0 46 26" aria-hidden="true">
        <line x1="27" y1="2" x2="27" y2="24" />
        <line x1="16" y1="13" x2="38" y2="13" />
        <polygon points="27,3 38,13 27,24 18,13" />
        <polygon points="7,8 13,15 7,21 2,15" />
      </svg>
      <span className={styles.shapeScaleCopy}>
        <b>Shape area · four-score mean</b>
        <span>I ↑ · A → · S ← · V ↓</span>
      </span>
    </span>
  );
}

export function PreviewLabelLegend() {
  return (
    <span className={styles.previewLabelLegend}>
      <i>*Italic labels</i> indicate preview models
    </span>
  );
}
