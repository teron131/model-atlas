"use client";

/** Chart hover cards: the card a plot shows for the model under the pointer or in focus, and the state that places and fills it. */

import { type CSSProperties, type Dispatch, type PointerEvent, type SetStateAction } from "react";

import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelLogo, modelName } from "../shared/model-display";
import { providerChartColor, providerDisplayName } from "../shared/provider-theme";

import styles from "./graphs.module.css";

export type HoverRow = readonly [string, string];

export type HoverState = {
  left: number;
  top: number;
  model: string;
  provider: string;
  color: string;
  logo: string;
  rows: HoverRow[];
};

export type HoverSetter = Dispatch<SetStateAction<HoverState | null>>;

export function pointHover(
  event: PointerEvent<Element>,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName = modelName(model),
): HoverState {
  return hoverAt(event.clientX, event.clientY, model, rows, displayName);
}

export function focusHover(
  target: Element,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName = modelName(model),
): HoverState {
  const rect = target.getBoundingClientRect();
  return hoverAt(rect.left + rect.width / 2, rect.top + rect.height / 2, model, rows, displayName);
}

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
        {/* A lab without a logo leaves no empty tile; its name leads the card. */}
        {hover.logo ? (
          <span className={styles.hoverCardLogo}>
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
          </span>
        ) : null}
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

function hoverAt(
  left: number,
  top: number,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName: string,
): HoverState {
  return {
    left,
    top,
    model: displayName,
    provider: providerDisplayName(model),
    color: providerChartColor(model.provider),
    logo: modelLogo(model),
    rows,
  };
}
