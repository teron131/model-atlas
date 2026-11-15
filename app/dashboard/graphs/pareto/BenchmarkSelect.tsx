/** Horizontal performance choices keep published scores immediate and custom benchmark selection in one disclosure, whose menu sits in the top layer so the scrolling choice strip cannot clip it. */

import { useEffect, useMemo, useRef } from "react";

import { useHorizontalChoice } from "../../../shared/use-horizontal-choice";
import { benchmarkTooltips } from "../../shared/benchmark-display";
import { Checklist } from "../../shared/Checklist";
import { useDismissibleDetails } from "../../shared/use-dismissible-details";
import { type FrontierBenchmarkOption, type PerformanceMetric } from "./analysis";
import { PERFORMANCE_SCORES } from "./presentation";

import checklist from "../../shared/checklist.module.css";
import styles from "../graphs.module.css";

/** Switching to benchmarks selects every benchmark and index; activating the selected choice opens its editable basket. */
export function BenchmarkSelect({
  options,
  selectedKeys,
  correlationByBenchmark,
  onChange,
  performance,
}: {
  options: FrontierBenchmarkOption[];
  selectedKeys: readonly string[];
  correlationByBenchmark: ReadonlyMap<string, number | null>;
  onChange: (keys: string[] | null) => void;
  performance: { value: PerformanceMetric; onChange: (value: PerformanceMetric) => void };
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const stripRef = useHorizontalChoice<HTMLFieldSetElement>(performance.value);
  const optionKeys = options.map((option) => option.key);
  const selectsEvidence = performance.value === "benchmarks";
  const selectedKeySet = useMemo(
    () => new Set(selectsEvidence ? selectedKeys : []),
    [selectedKeys, selectsEvidence],
  );
  const allSelected = optionKeys.length > 0 && selectedKeySet.size === optionKeys.length;
  const partiallySelected = selectedKeySet.size > 0 && !allSelected;
  const summaryLabel = `Benchmarks · ${selectsEvidence ? selectedKeySet.size : options.length}`;

  useDismissibleDetails(rootRef);
  // The menu sits in the top layer at a fixed position, so it closes when the page under it moves.
  useEffect(() => {
    const closeOnMove = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (rootRef.current?.open) rootRef.current.open = false;
    };
    window.addEventListener("scroll", closeOnMove, true);
    window.addEventListener("resize", closeOnMove);
    return () => {
      window.removeEventListener("scroll", closeOnMove, true);
      window.removeEventListener("resize", closeOnMove);
    };
  }, []);

  /** Place the menu in the top layer so the horizontal strip cannot clip its content. */
  function positionMenu() {
    const root = rootRef.current;
    const menu = menuRef.current;
    if (root == null || menu == null) return;
    if (!root.open) {
      menu.hidePopover();
      return;
    }
    menu.showPopover();
    const bounds = root.getBoundingClientRect();
    const top = Math.min(bounds.bottom + 8, Math.max(12, window.innerHeight - 240));
    menu.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${window.innerHeight - top - 12}px`;
  }

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

  return (
    <fieldset
      className={`${styles.metricToggle} ${styles.performanceToggle} horizontal-choice-strip`}
      ref={stripRef}
    >
      <legend className="visually-hidden">Performance</legend>
      {PERFORMANCE_SCORES.map((option) => (
        <button
          type="button"
          key={option.key}
          className="selection-choice"
          aria-pressed={performance.value === option.key}
          onClick={() => {
            performance.onChange(option.key);
            if (rootRef.current) rootRef.current.open = false;
          }}
        >
          {option.label}
        </button>
      ))}
      <details
        className={checklist.picker}
        ref={rootRef}
        aria-label="Benchmarks"
        onToggle={positionMenu}
      >
        <summary
          className="selection-choice"
          aria-label={summaryLabel}
          aria-current={selectsEvidence ? "true" : undefined}
          onClick={(event) => {
            if (!selectsEvidence) {
              event.preventDefault();
              onChange(null);
            }
          }}
        >
          <span>{summaryLabel}</span>
        </summary>
        <div className={checklist.menu} ref={menuRef} popover="manual">
          <Checklist
            items={options}
            itemKey={(option) => option.key}
            name={{
              label: "Benchmark",
              sort: "ascending",
              text: (option) => option.label,
              detail: (option) => option.detail,
            }}
            columns={[
              {
                key: "correlation",
                label: "Corr",
                sort: "descending",
                value: (option) => correlationByBenchmark.get(option.key) ?? null,
                text: (option) => formatCorrelation(correlationByBenchmark.get(option.key) ?? null),
              },
              {
                key: "items",
                label: "#Items",
                sort: "descending",
                value: (option) => option.count,
                text: (option) => String(option.count),
              },
            ]}
            initialSort={{ key: "name", direction: "ascending" }}
            search={{
              label: "Search benchmarks and indexes by name or description",
              placeholder: "Search benchmarks or indexes",
              context: (option) => benchmarkTooltips[option.key],
            }}
            note="One benchmark: native units. Several: normalized performance. Corr: correlation with Intelligence."
            all={{
              label: "All benchmarks and indexes",
              checked: allSelected,
              mixed: partiallySelected,
              onSelect: () => onChange(allSelected ? [] : null),
            }}
            empty="No matching benchmarks"
            checked={(option) => selectedKeySet.has(option.key)}
            onToggle={(option, selected) => toggleBenchmark(option.key, selected)}
          />
        </div>
      </details>
    </fieldset>
  );
}

function formatCorrelation(correlation: number | null): string {
  return correlation == null ? "--" : `${correlation >= 0 ? "+" : ""}${correlation.toFixed(2)}`;
}
