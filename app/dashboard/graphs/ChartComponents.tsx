"use client";

/** Chart-point hover cards keep model identity and evidence rows together. */

import { type CSSProperties } from "react";

import type { HoverState } from "./hover-state";

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
