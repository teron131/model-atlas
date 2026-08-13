"use client";

/** Column view controls expose temporary full-catalog search and fixed analytical presets. */

import { TABLE_COLUMN_PRESETS, type TableColumnPreset } from "./column-views";

import styles from "./column-view-controls.module.css";

export function ColumnViewControls({
  preset,
  query,
  searchMatchCount,
  onPresetChange,
  onQueryChange,
}: {
  preset: TableColumnPreset;
  query: string;
  searchMatchCount: number;
  onPresetChange: (preset: TableColumnPreset) => void;
  onQueryChange: (query: string) => void;
}) {
  const isSearching = query.trim().length > 0;
  return (
    <section className={styles.controls} aria-label="Table column view" data-capture-exclude>
      <div className={styles.row}>
        <input
          className={styles.search}
          type="search"
          autoComplete="off"
          spellCheck="false"
          aria-label="Search table columns"
          placeholder="Search columns or benchmarks"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        {isSearching ? (
          <output className={styles.result} aria-live="polite">
            {searchMatchCount === 0
              ? "Search · No columns"
              : `Search · ${searchMatchCount} ${searchMatchCount === 1 ? "column" : "columns"}`}
          </output>
        ) : null}
        <div className={styles.presets} role="group" aria-label="Column presets">
          {TABLE_COLUMN_PRESETS.map((option) => (
            <button
              className={styles.preset}
              type="button"
              aria-pressed={!isSearching && preset === option.key}
              key={option.key}
              onClick={() => onPresetChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
