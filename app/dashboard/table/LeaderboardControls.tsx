"use client";

/** Leaderboard controls share one model-and-column search alongside display limits and analytical presets. */

import { DisplayControls, type DisplayControlsProps } from "../shared/DisplayControls";
import {
  BENCHMARK_COLUMN_ORDERS,
  TABLE_COLUMN_PRESETS,
  type TableColumnPreset,
} from "./column-views";
import type { BenchmarkColumnOrder } from "./models";

import styles from "./leaderboard-controls.module.css";

export function LeaderboardControls({
  preset,
  benchmarkOrder,
  query,
  searchResultLabel,
  isColumnSearch,
  display,
  onBenchmarkOrderChange,
  onPresetChange,
  onQueryChange,
}: {
  preset: TableColumnPreset;
  benchmarkOrder: BenchmarkColumnOrder;
  query: string;
  searchResultLabel: string | null;
  isColumnSearch: boolean;
  display: DisplayControlsProps;
  onBenchmarkOrderChange: (order: BenchmarkColumnOrder) => void;
  onPresetChange: (preset: TableColumnPreset) => void;
  onQueryChange: (query: string) => void;
}) {
  const showsOrder = preset === "scores" && !isColumnSearch;
  return (
    <section className={styles.controls} aria-label="Leaderboard controls" data-capture-exclude>
      <div className={styles.display}>
        <DisplayControls {...display} />
      </div>
      <div className={styles.row}>
        <input
          className={styles.search}
          type="search"
          autoComplete="off"
          spellCheck="false"
          aria-label="Search models, columns or descriptions"
          placeholder="Search models, columns or descriptions"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
        {searchResultLabel != null ? (
          <output className={styles.result} aria-live="polite">
            {searchResultLabel}
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
              aria-pressed={!isColumnSearch && preset === option.key}
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
