"use client";

/** Column view controls expose temporary full-catalog search and fixed analytical presets. */

import {
  BENCHMARK_COLUMN_ORDERS,
  TABLE_COLUMN_PRESETS,
  type TableColumnPreset,
} from "./column-views";
import type { BenchmarkColumnOrder } from "./models";

import styles from "./column-view-controls.module.css";

export function ColumnViewControls({
  preset,
  benchmarkOrder,
  query,
  searchMatchCount,
  onBenchmarkOrderChange,
  onPresetChange,
  onQueryChange,
}: {
  preset: TableColumnPreset;
  benchmarkOrder: BenchmarkColumnOrder;
  query: string;
  searchMatchCount: number;
  onBenchmarkOrderChange: (order: BenchmarkColumnOrder) => void;
  onPresetChange: (preset: TableColumnPreset) => void;
  onQueryChange: (query: string) => void;
}) {
  const isSearching = query.trim().length > 0;
  const showsOrder = preset === "scores" && !isSearching;
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
        {showsOrder ? (
          <div className={styles.ordering} role="group" aria-label="Benchmark column order">
            <span className={styles.orderingLabel}>Order</span>
            {BENCHMARK_COLUMN_ORDERS.map((option) => (
              <button
                className={styles.orderButton}
                type="button"
                aria-pressed={benchmarkOrder === option.key}
                key={option.key}
                onClick={() => onBenchmarkOrderChange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
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
