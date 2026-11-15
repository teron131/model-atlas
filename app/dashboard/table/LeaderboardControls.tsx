"use client";

/** The table toolbar owns column presets, the table search, and how rows display (their limit and the efforts variant rows keep); the table search narrows the rows the global filters admit. */

import { Columns3, Search } from "lucide-react";

import { TABLE_COLUMN_PRESETS, type TableColumnPreset } from "./column-views";
import { DisplayControls, type DisplayControlsProps } from "./DisplayControls";

import styles from "./leaderboard-controls.module.css";

export function LeaderboardControls({
  preset,
  query,
  resultLabel,
  isColumnSearch,
  display,
  onPresetChange,
  onQueryChange,
}: {
  preset: TableColumnPreset;
  query: string;
  resultLabel: string | null;
  isColumnSearch: boolean;
  display: DisplayControlsProps;
  onPresetChange: (preset: TableColumnPreset) => void;
  onQueryChange: (query: string) => void;
}) {
  return (
    <section className={styles.controls} aria-label="Leaderboard controls" data-capture-exclude>
      <div className={styles.row}>
        <div className={styles.presets} role="group" aria-label="Column preset">
          <Columns3 size={15} aria-hidden="true" />
          {TABLE_COLUMN_PRESETS.map((option) => (
            <button
              type="button"
              key={option.key}
              className="selection-choice"
              aria-pressed={!isColumnSearch && preset === option.key}
              onClick={() => onPresetChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search table"
            placeholder="Search table …"
            title="Name columns to show them and models to list only them; separate parts with commas and use * as a wildcard."
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        {resultLabel ? (
          <output className={styles.result} aria-live="polite">
            {resultLabel}
          </output>
        ) : null}
        <div className={styles.display}>
          <DisplayControls {...display} />
        </div>
      </div>
    </section>
  );
}
