/** Compact multi-select for choosing the benchmark evidence combined by the frontier chart. */

import { useEffect, useMemo, useRef, useState } from "react";

import { benchmarkTooltips } from "../../shared/constants";
import { filterSearchDocuments } from "../../shared/search";
import { formatCorrelation } from "../chart-stats";
import type { FrontierBenchmarkOption } from "./analysis";

import styles from "../graphs.module.css";

type BenchmarkSortKey = "benchmark" | "correlation" | "models";
type BenchmarkSortDirection = "ascending" | "descending";
type BenchmarkSortState = {
  key: BenchmarkSortKey;
  direction: BenchmarkSortDirection;
};

const DEFAULT_SORT_DIRECTION: Record<BenchmarkSortKey, BenchmarkSortDirection> = {
  benchmark: "ascending",
  correlation: "descending",
  models: "descending",
};

export function BenchmarkSelect({
  options,
  selectedKeys,
  correlationByBenchmark,
  onChange,
}: {
  options: FrontierBenchmarkOption[];
  selectedKeys: readonly string[];
  correlationByBenchmark: ReadonlyMap<string, number | null>;
  onChange: (keys: string[] | null) => void;
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sortState, setSortState] = useState<BenchmarkSortState>({
    key: "benchmark",
    direction: "ascending",
  });
  const optionKeys = options.map((option) => option.key);
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const visibleOptions = sortBenchmarkOptions(
    filterSearchDocuments(
      query,
      options.map((option) => ({
        value: option,
        primary: [option.label, option.key],
        context: benchmarkTooltips[option.key],
      })),
    ),
    correlationByBenchmark,
    sortState,
  );
  const allSelected = optionKeys.length > 0 && selectedKeySet.size === optionKeys.length;
  const partiallySelected = selectedKeySet.size > 0 && !allSelected;
  let summaryLabel =
    options.find((option) => selectedKeySet.has(option.key))?.label ?? "1 selected";
  if (selectedKeySet.size === 0) {
    summaryLabel = "None selected";
  } else if (allSelected) {
    summaryLabel = `All ${options.length}`;
  } else if (selectedKeySet.size > 1) {
    summaryLabel = `${selectedKeySet.size} selected`;
  }

  useEffect(() => {
    if (selectAllRef.current != null) {
      selectAllRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root?.open && !root.contains(event.target as Node)) {
        root.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (event.key === "Escape" && root?.open) {
        root.open = false;
        root.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function toggleBenchmark(key: string, selected: boolean) {
    const nextKeys = new Set(selectedKeySet);
    if (selected) {
      nextKeys.add(key);
    } else {
      nextKeys.delete(key);
    }
    const orderedKeys = optionKeys.filter((optionKey) => nextKeys.has(optionKey));
    onChange(orderedKeys.length === optionKeys.length ? null : orderedKeys);
  }

  function sortBy(key: BenchmarkSortKey) {
    setSortState((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "ascending"
            ? "descending"
            : "ascending"
          : DEFAULT_SORT_DIRECTION[key],
    }));
  }

  return (
    <details className={styles.benchmarkSelect} ref={rootRef}>
      <summary>
        <span>{summaryLabel}</span>
      </summary>
      <div className={styles.benchmarkSelectMenu}>
        <label className={styles.benchmarkSelectSearch}>
          <span className={styles.visuallyHidden}>
            Filter frontier benchmarks by name or description
          </span>
          <input
            type="search"
            value={query}
            placeholder="Filter benchmarks or descriptions"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className={styles.benchmarkSelectExplainer}>CORR = correlation to Intelligence score</p>
        <div className={styles.benchmarkSelectOptions}>
          <div className={styles.benchmarkSelectHeader} role="row">
            <span role="columnheader">
              <label className={styles.benchmarkSelectBulk}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onChange(allSelected ? [] : null)}
                />
                <span className={styles.benchmarkSelectBulkMark} aria-hidden="true" />
                <span className={styles.visuallyHidden}>All benchmarks</span>
              </label>
            </span>
            <BenchmarkSortHeader
              label="Benchmark"
              sortKey="benchmark"
              sortState={sortState}
              onSort={sortBy}
            />
            <BenchmarkSortHeader
              label="Corr"
              sortKey="correlation"
              sortState={sortState}
              onSort={sortBy}
            />
            <BenchmarkSortHeader
              label="Models"
              sortKey="models"
              sortState={sortState}
              onSort={sortBy}
            />
          </div>
          {visibleOptions.map((option) => {
            const selected = selectedKeySet.has(option.key);
            return (
              <label className={styles.benchmarkSelectOption} key={option.key}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => toggleBenchmark(option.key, event.target.checked)}
                />
                <span className={styles.benchmarkSelectOptionMark} aria-hidden="true" />
                <span className={styles.benchmarkSelectOptionLabel}>{option.label}</span>
                <span className={styles.benchmarkSelectOptionCorrelation}>
                  {formatCorrelation(correlationByBenchmark.get(option.key) ?? null).replace(
                    /^CORR\s*/,
                    "",
                  )}
                </span>
                <span className={styles.benchmarkSelectOptionCoverage}>{option.count}</span>
              </label>
            );
          })}
          {visibleOptions.length === 0 ? (
            <p className={styles.benchmarkSelectEmpty}>No matching benchmarks</p>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function BenchmarkSortHeader({
  label,
  sortKey,
  sortState,
  onSort,
}: {
  label: string;
  sortKey: BenchmarkSortKey;
  sortState: BenchmarkSortState;
  onSort: (key: BenchmarkSortKey) => void;
}) {
  const active = sortState.key === sortKey;
  return (
    <span
      className={styles.benchmarkSelectSortHeader}
      role="columnheader"
      aria-sort={active ? sortState.direction : "none"}
    >
      <button
        type="button"
        data-sort-state={active ? sortState.direction : "none"}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className={styles.benchmarkSelectSortIndicator} aria-hidden="true" />
      </button>
    </span>
  );
}

function sortBenchmarkOptions(
  options: FrontierBenchmarkOption[],
  correlationByBenchmark: ReadonlyMap<string, number | null>,
  sortState: BenchmarkSortState,
): FrontierBenchmarkOption[] {
  return [...options].sort((left, right) => {
    let comparison = 0;
    if (sortState.key === "benchmark") {
      comparison = left.label.localeCompare(right.label, undefined, { numeric: true });
    } else if (sortState.key === "models") {
      comparison = left.count - right.count;
    } else {
      const leftCorrelation = correlationByBenchmark.get(left.key) ?? null;
      const rightCorrelation = correlationByBenchmark.get(right.key) ?? null;
      if (leftCorrelation == null || rightCorrelation == null) {
        if (leftCorrelation == null && rightCorrelation != null) {
          return 1;
        }
        if (leftCorrelation != null && rightCorrelation == null) {
          return -1;
        }
      } else {
        comparison = leftCorrelation - rightCorrelation;
      }
    }
    const directedComparison = sortState.direction === "ascending" ? comparison : -comparison;
    return (
      directedComparison || left.label.localeCompare(right.label, undefined, { numeric: true })
    );
  });
}
