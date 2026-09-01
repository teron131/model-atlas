/** Segmented control shared by graph panels for choosing one analytical option. */

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
  return (
    <fieldset className={styles.metricToggle}>
      <legend className={styles.visuallyHidden}>{legend}</legend>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
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
