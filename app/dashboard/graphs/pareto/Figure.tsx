/** Pareto axis choices sit on the chart edges they control: the performance choice above the y-axis, and the resource choice with the variants toggle beneath the x-axis; the find field ends the top edge. The plot names its own axes, so the rows carry no names, and every width lays them out alike. */

import type { ReactNode } from "react";

import styles from "../graphs.module.css";

export function ParetoFigureTop({
  yAxisControl,
  find,
}: {
  yAxisControl: ReactNode;
  find: ReactNode;
}) {
  return (
    <div className={styles.figureTop}>
      <div className={styles.axisControl}>
        {yAxisControl}
        {find}
      </div>
    </div>
  );
}

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
        {xAxisControl}
        <button
          type="button"
          role="switch"
          className={styles.plotVariants}
          aria-checked={showVariants}
          aria-label="Show graph reasoning variants"
          title="Connect each model's reasoning efforts on the chart"
          data-capture-exclude
          onClick={() => onShowVariantsChange(!showVariants)}
        >
          Variants
          <span className={styles.variantsSwitch} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
