"use client";

/** A chart's dashboard region laid out as a figure: optional controls over the chart, an optional foot, and a caption the page shows but an exported image leaves out. */

import type { ReactNode } from "react";

import type { ResearchRegionId } from "../research-index";
import { ResearchRegion } from "../ResearchRegions";

import styles from "./graphs.module.css";

export function FigureRegion({
  id,
  capture,
  top,
  foot,
  caption,
  children,
}: {
  id: ResearchRegionId;
  capture: { title: string; fileName: string };
  top?: ReactNode;
  foot?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ResearchRegion id={id} className={styles.section} plane={styles.panel} capture={capture}>
      {/* A chart without controls keeps the row for the space it sets above the readout. */}
      <div className={styles.figureTop}>
        {top == null ? null : <div className={styles.axisControl}>{top}</div>}
      </div>
      {children}
      {foot ? <div className={styles.figureFoot}>{foot}</div> : null}
      {caption == null ? null : (
        <div className={styles.figureCaption} data-capture-exclude>
          {caption}
        </div>
      )}
    </ResearchRegion>
  );
}
