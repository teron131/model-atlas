/** Segmented control for choosing one option beside a plot: the Pareto x-axis, the Timeline's range presets, and the model sheet's reasoning efforts. */

import { useHorizontalChoice } from "../../shared/use-horizontal-choice";

import styles from "./graphs.module.css";

type GraphToggleOption<TKey extends string> = {
  key: TKey;
  label: string;
  title?: string;
};

/** `onPreview` reports the option under the pointer or keyboard focus, and `null` when it leaves, so a plot can light the mark an option names. */
export function GraphToggle<TKey extends string>({
  legend,
  options,
  selectedKey,
  onSelect,
  onPreview,
}: {
  legend: string;
  options: Array<GraphToggleOption<TKey>>;
  selectedKey: TKey;
  onSelect: (key: TKey) => void;
  onPreview?: (key: TKey | null) => void;
}) {
  const stripRef = useHorizontalChoice<HTMLFieldSetElement>(selectedKey);
  return (
    <fieldset className={`${styles.metricToggle} horizontal-choice-strip`} ref={stripRef}>
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className="selection-choice"
          aria-pressed={option.key === selectedKey}
          title={option.title}
          onClick={() => onSelect(option.key)}
          onPointerEnter={() => onPreview?.(option.key)}
          onPointerLeave={() => onPreview?.(null)}
          onFocus={() => onPreview?.(option.key)}
          onBlur={() => onPreview?.(null)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
