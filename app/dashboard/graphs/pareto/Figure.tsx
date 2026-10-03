/** Pareto choices sit on the chart edges they control: performance above the y-axis and resources beneath the x-axis, with explicit evidence selection. */

import type { ReactNode } from "react";

import styles from "../graphs.module.css";

export const PARETO_PANEL_CONTENT = {
  sectionId: "pareto-analysis",
  sectionLabel: "Pareto",
  title: "Performance tradeoffs",
} as const;

export const PARETO_CAPTION =
  "Compare model performance and resources. The glowing frontier marks the best visible tradeoffs.";

/** The figure's top edge: performance choices over the y-axis, and the score summary at the plot's right. */
export function ParetoFigureTop({
  yAxisControl,
  summary,
}: {
  yAxisControl: ReactNode;
  summary: ReactNode;
}) {
  return (
    <div className={styles.figureTop}>
      <div className={styles.axisControl}>
        <span className={styles.axisControlTitle} aria-hidden="true">
          Y · Performance
        </span>
        {yAxisControl}
      </div>
      {summary}
    </div>
  );
}

/** The figure's foot: resource choices under the x-axis, headed by their title and the local variant toggle. */
export function ParetoFigureFoot({
  xAxisControl,
  showVariants,
  onShowVariantsChange,
}: {
  xAxisControl: ReactNode;
  showVariants: boolean;
  onShowVariantsChange: (show: boolean) => void;
}) {
  return (
    <div className={styles.figureFoot}>
      <div className={`${styles.axisControl} ${styles.axisControlX}`}>
        <div className={styles.axisControlHeading}>
          <span className={styles.axisControlTitle} aria-hidden="true">
            X · Resources
          </span>
          <label className={styles.plotVariants} data-capture-exclude>
            <input
              type="checkbox"
              aria-label="Show graph reasoning variants"
              checked={showVariants}
              onChange={(event) => onShowVariantsChange(event.target.checked)}
            />
            <span>Variants</span>
          </label>
        </div>
        {xAxisControl}
      </div>
    </div>
  );
}
