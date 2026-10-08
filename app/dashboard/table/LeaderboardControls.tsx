"use client";

/** The table toolbar owns column presets, column search, and display limits; model selection belongs to the global filters. */

import { ArrowRight, Columns3, Search } from "lucide-react";

import { DisplayControls, type DisplayControlsProps } from "../shared/DisplayControls";
import { TABLE_COLUMN_PRESETS, type TableColumnPreset } from "./column-views";

import styles from "./leaderboard-controls.module.css";

/** `modelMatchCount` counts the models a column query would find as a model search; above zero, the toolbar offers that search. */
export function LeaderboardControls({
  preset,
  columnQuery,
  columnSearchResultLabel,
  modelMatchCount,
  isColumnSearch,
  display,
  onPresetChange,
  onColumnQueryChange,
  onSearchModels,
}: {
  preset: TableColumnPreset;
  columnQuery: string;
  columnSearchResultLabel: string | null;
  modelMatchCount: number;
  isColumnSearch: boolean;
  display: DisplayControlsProps;
  onPresetChange: (preset: TableColumnPreset) => void;
  onColumnQueryChange: (query: string) => void;
  onSearchModels: () => void;
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
        {modelMatchCount > 0 ? (
          <button
            type="button"
            className={styles.modelSearch}
            aria-label={`Search models for “${columnQuery.trim()}”: ${modelMatchCount} ${modelMatchCount === 1 ? "match" : "matches"}`}
            onClick={onSearchModels}
          >
            Search models · {modelMatchCount}
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        ) : null}
        <div className={styles.display}>
          <DisplayControls {...display} />
        </div>
      </div>
    </section>
  );
}
