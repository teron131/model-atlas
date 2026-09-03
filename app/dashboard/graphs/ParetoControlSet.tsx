/** Shared Pareto presentation content and responsive controls keep both score bases aligned across browser widths. */

import type { ReactNode } from "react";

import { ShapeScaleLegend } from "./ChartComponents";

import styles from "./graphs.module.css";

export const PARETO_PANEL_CONTENT = {
  sectionId: "pareto-analysis",
  sectionLabel: "Score tradeoffs",
  title: "Pareto Analysis",
  copy: "Each point is a visible model variant. The selected score basis is plotted against its comparison axis; the frontier traces the best displayed tradeoffs.",
} as const;

export function ParetoControlSet({
  scoreBasisControl,
  yAxisControl,
  xAxisControl,
}: {
  scoreBasisControl: ReactNode;
  yAxisControl: ReactNode;
  xAxisControl: ReactNode;
}) {
  return (
    <div className={`${styles.chartToolbar} ${styles.paretoControlSet}`}>
      <div className={styles.paretoControlGrid}>
        <div className={`${styles.toolbarControl} ${styles.paretoControlBasis}`}>
          <span className={styles.toolbarControlTitle} aria-hidden="true">
            Score basis
          </span>
          {scoreBasisControl}
        </div>
        <div className={styles.toolbarControl}>
          <span className={styles.toolbarControlTitle} aria-hidden="true">
            Y axis
          </span>
          {yAxisControl}
        </div>
        <div className={`${styles.toolbarControl} ${styles.paretoControlXAxis}`}>
          <span className={styles.toolbarControlTitle} aria-hidden="true">
            X axis
          </span>
          {xAxisControl}
        </div>
      </div>
      <div className={styles.chartToolbarCaption}>
        <ShapeScaleLegend />
      </div>
    </div>
  );
}
