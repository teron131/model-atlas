/** Pareto choices sit on the chart edges they control: performance above the y-axis and resources beneath the x-axis, with explicit evidence selection. */

import type { ReactNode } from "react";

import styles from "../graphs.module.css";

export const PARETO_CAPTION =
  "Compare model performance and resources. The glowing frontier marks the best visible tradeoffs.";

export function ParetoFigureTop({ yAxisControl }: { yAxisControl: ReactNode }) {
  return (
    <div className={styles.figureTop}>
      <div className={styles.axisControl}>
        <span className={styles.axisControlTitle} aria-hidden="true">
          Y · Performance
        </span>
        {yAxisControl}
      </div>
    </div>
  );
}

export function ParetoFigureFoot({
  xAxisControl,
  logarithmic,
  showVariants,
  onShowVariantsChange,
}: {
  xAxisControl: ReactNode;
  logarithmic: boolean;
  showVariants: boolean;
  onShowVariantsChange: (show: boolean) => void;
}) {
  return (
    <div className={styles.figureFoot}>
      <div className={`${styles.axisControl} ${styles.axisControlX}`}>
        <span className={styles.axisControlTitle} aria-hidden="true">
          X · Resources{logarithmic ? " · log₁₀" : ""}
        </span>
        {xAxisControl}
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
    </div>
  );
}
