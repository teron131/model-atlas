"use client";

/** Model tables keep row limits and the efforts their reasoning variants show compact, without restricting the requested count to presets. */

import { type SyntheticEvent, useEffect, useRef, useState } from "react";

import { useDismissibleDetails } from "../shared/use-dismissible-details";
import type { EffortChoice } from "./models";

import basket from "../graphs/graphs.module.css";
import styles from "./display-controls.module.css";

const MINIMUM_DISPLAY_ITEMS = 3;
const DEFAULT_DISPLAY_ITEMS = 50;

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
  efforts: EffortSelectProps;
};

type EffortSelectProps = {
  options: readonly EffortChoice[];
  /** `null` keeps every effort; an empty basket keeps none. */
  selected: readonly string[] | null;
  onChange: (keys: string[] | null) => void;
};

/** Commit a typed count on Enter or blur so editing a multi-digit value does not prematurely clamp its first digit. */
export function DisplayControls({
  itemKind,
  maximum,
  value,
  onValueChange,
  efforts,
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
          aria-label={`Top ${itemKind} to show`}
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
      <EffortSelect {...efforts} />
    </fieldset>
  );
}

/** The variant rows' efforts as a checklist; choosing every effort reports `null`, so efforts that later enter the options stay chosen. */
function EffortSelect({ options, selected, onChange }: EffortSelectProps) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);
  useDismissibleDetails(rootRef);
  const keys = options.map((option) => option.key);
  const active = new Set(selected ?? keys);
  const all = keys.length > 0 && keys.every((key) => active.has(key));
  const some = keys.some((key) => active.has(key));
  useEffect(() => {
    if (bulkRef.current) bulkRef.current.indeterminate = !all && some;
  }, [all, some]);
  const summary =
    selected == null ? "All" : selected.length === 1 ? selected[0] : String(selected.length);
  return (
    <details ref={rootRef} className={`${basket.benchmarkSelect} ${styles.effort}`}>
      <summary
        aria-label={`Reasoning efforts: ${selected == null ? "all" : selected.join(", ") || "none"}`}
      >
        Effort · {summary}
      </summary>
      <div className={`${basket.benchmarkSelectMenu} ${styles.effortMenu}`}>
        <div className={basket.benchmarkSelectOptions}>
          <div className={`${basket.benchmarkSelectHeader} ${styles.effortRow}`}>
            <label className={basket.benchmarkSelectBulk}>
              <input
                ref={bulkRef}
                type="checkbox"
                aria-label="All efforts"
                checked={all}
                onChange={() => onChange(all ? [] : null)}
              />
              <span className={basket.benchmarkSelectBulkMark} aria-hidden="true" />
            </label>
            <span>Effort</span>
            <span className={basket.benchmarkSelectOptionCoverage}>#Variants</span>
          </div>
          {options.map((option) => (
            <label
              key={option.key}
              className={`${basket.benchmarkSelectOption} ${styles.effortRow}`}
            >
              <input
                type="checkbox"
                aria-label={option.key}
                checked={active.has(option.key)}
                onChange={(event) => {
                  const next = new Set(active);
                  if (event.target.checked) next.add(option.key);
                  else next.delete(option.key);
                  const chosen = keys.filter((key) => next.has(key));
                  onChange(chosen.length === keys.length ? null : chosen);
                }}
              />
              <span className={basket.benchmarkSelectOptionMark} aria-hidden="true" />
              <span className={basket.benchmarkSelectOptionLabel}>{option.key}</span>
              <span className={basket.benchmarkSelectOptionCoverage}>{option.count}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
