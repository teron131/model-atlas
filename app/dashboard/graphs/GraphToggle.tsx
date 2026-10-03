/** Segmented control shared by graph panels for choosing one analytical option. */

import { useHorizontalChoice } from "../../shared/use-horizontal-choice";

import styles from "./graphs.module.css";

type GraphToggleOption<TKey extends string> = {
  key: TKey;
  label: string;
  disabled?: boolean;
};

export function GraphToggle<TKey extends string>({
  legend,
  options,
  selectedKey,
  onSelect,
}: {
  legend: string;
  options: Array<GraphToggleOption<TKey>>;
  selectedKey: TKey;
  onSelect: (key: TKey) => void;
}) {
  const stripRef = useHorizontalChoice<HTMLFieldSetElement>(selectedKey);
  return (
    <fieldset className={`${styles.metricToggle} horizontal-choice-strip`} ref={stripRef}>
      <legend className={styles.visuallyHidden}>{legend}</legend>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className="selection-choice"
          aria-pressed={option.key === selectedKey}
          disabled={option.disabled}
          onClick={() => onSelect(option.key)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
