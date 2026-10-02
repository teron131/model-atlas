"use client";

/** Model tables keep row limits and reasoning-variant display compact without restricting the requested count to presets. */

import { type SyntheticEvent, useEffect, useState } from "react";

import styles from "./display-controls.module.css";

const MINIMUM_DISPLAY_ITEMS = 3;
export const DEFAULT_DISPLAY_ITEMS = 50;

/** Keep a requested display count inside the available data-backed range. */
function clampDisplayLimit(limit: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.min(Math.max(Math.trunc(limit), Math.min(MINIMUM_DISPLAY_ITEMS, maximum)), maximum);
}

/** Clamp the rendered limit without discarding the user's requested value as filters change. */
export function useDisplayLimit(maximum: number): [number, (value: number) => void] {
  const [limit, setLimit] = useState(DEFAULT_DISPLAY_ITEMS);
  return [clampDisplayLimit(limit, maximum), setLimit];
}

export type DisplayControlsProps = {
  itemKind: "models" | "variants";
  maximum: number;
  value: number;
  onValueChange: (value: number) => void;
  showVariants: boolean;
  onShowVariantsChange: (show: boolean) => void;
};

/** Commit a typed count on Enter or blur so editing a multi-digit value does not prematurely clamp its first digit. */
export function DisplayControls({
  itemKind,
  maximum,
  value,
  onValueChange,
  showVariants,
  onShowVariantsChange,
}: DisplayControlsProps) {
  const [draft, setDraft] = useState(String(value));
  const minimum = Math.min(MINIMUM_DISPLAY_ITEMS, maximum);
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (event: SyntheticEvent<HTMLInputElement>) => {
    const requested = event.currentTarget.valueAsNumber;
    const next = Number.isFinite(requested) ? clampDisplayLimit(requested, maximum) : value;
    setDraft(String(next));
    if (next !== value) onValueChange(next);
  };
  return (
    <fieldset className={styles.controls} data-capture-exclude>
      <legend className="visually-hidden">Leaderboard display</legend>
      <label className={styles.limit} htmlFor="leaderboard-model-limit">
        <span>Top</span>
        <input
          id="leaderboard-model-limit"
          aria-label="Top models to show"
          type="number"
          min={minimum}
          max={maximum}
          step={1}
          value={draft}
          disabled={maximum === 0}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event);
            }
            if (event.key === "Escape") setDraft(String(value));
          }}
        />
      </label>
      <button
        className={styles.all}
        type="button"
        aria-label={`Show all ${maximum} ${itemKind}`}
        aria-pressed={maximum > 0 && value === maximum}
        disabled={maximum === 0}
        onClick={() => onValueChange(maximum)}
      >
        All
      </button>
      <label className={styles.variants}>
        <input
          type="checkbox"
          aria-label="Show table reasoning variants"
          checked={showVariants}
          onChange={(event) => onShowVariantsChange(event.target.checked)}
        />
        <span>Variants</span>
      </label>
    </fieldset>
  );
}
