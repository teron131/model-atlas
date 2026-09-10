/** Pareto presentation keeps performance and resource choices on equal footing, with explicit evidence selection. */

import type { ReactNode } from "react";

import { ShapeScaleLegend } from "./ChartComponents";

import styles from "./graphs.module.css";

export const PARETO_PANEL_CONTENT = {
  sectionId: "pareto-analysis",
  sectionLabel: "Score tradeoffs",
  title: "Pareto Analysis",
  copy: "Each point is a visible model variant. The solid envelope traces the best displayed tradeoffs; hover a point or label to reveal its model’s variant connections in reasoning-effort order.",
} as const;

export function ParetoControlSet({
  yAxisControl,
  xAxisControl,
}: {
  yAxisControl: ReactNode;
  xAxisControl: ReactNode;
}) {
  return (
    <div className={`${styles.chartToolbar} ${styles.paretoControlSet}`}>
      <div className={styles.paretoControlGrid}>
        <div className={styles.toolbarControl}>
          <span className={styles.toolbarControlTitle} aria-hidden="true">
            Y · Performance
          </span>
          {yAxisControl}
        </div>
        <div className={`${styles.toolbarControl} ${styles.paretoControlXAxis}`}>
          <span className={styles.toolbarControlTitle} aria-hidden="true">
            X · Resources
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
