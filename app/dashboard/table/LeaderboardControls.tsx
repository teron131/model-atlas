"use client";

/** The table toolbar owns column presets, column search, and display limits; model selection belongs to the global filters. */

import { Columns3, Search } from "lucide-react";

import { DisplayControls, type DisplayControlsProps } from "../shared/DisplayControls";
import { TABLE_COLUMN_PRESETS, type TableColumnPreset } from "./column-views";

import styles from "./leaderboard-controls.module.css";

export function LeaderboardControls({
  preset,
  columnQuery,
  columnSearchResultLabel,
  isColumnSearch,
  display,
  onPresetChange,
  onColumnQueryChange,
}: {
  preset: TableColumnPreset;
  columnQuery: string;
  columnSearchResultLabel: string | null;
  isColumnSearch: boolean;
  display: DisplayControlsProps;
  onPresetChange: (preset: TableColumnPreset) => void;
  onColumnQueryChange: (query: string) => void;
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
            aria-label="Find columns"
            placeholder="Find columns…"
            value={columnQuery}
            onChange={(event) => onColumnQueryChange(event.currentTarget.value)}
          />
        </label>
        {columnSearchResultLabel ? (
          <output className={styles.result} aria-live="polite">
            {columnSearchResultLabel}
          </output>
        ) : null}
        <div className={styles.display}>
          <DisplayControls {...display} />
        </div>
      </div>
    </section>
  );
}
