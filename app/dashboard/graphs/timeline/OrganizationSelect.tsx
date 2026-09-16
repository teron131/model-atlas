/** Searchable organization selection follows the benchmark picker while keeping historical filters local to Timeline. */
import { useEffect, useRef, useState } from "react";

import { providerDisplayName } from "../../shared/provider-theme";
import type { TimelinePoint } from "./chart-data";

import styles from "../graphs.module.css";
import timeline from "../timeline.module.css";

/** Null selects all labs; an empty basket selects none, including when search hides selected rows. */
export function OrganizationSelect({
  points,
  selected,
  onChange,
}: {
  points: TimelinePoint[];
  selected: string[] | null;
  onChange: (keys: string[] | null) => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const bulk = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const organizations = new Map<string, { count: number; best: TimelinePoint }>();
  for (const point of points) {
    const current = organizations.get(point.provider);
    organizations.set(point.provider, {
      count: (current?.count ?? 0) + 1,
      best: !current || point.score > current.best.score ? point : current.best,
    });
  }
  const options = [...organizations]
    .map(([key, value]) => ({
      key,
      count: value.count,
      best: value.best.score,
      bestModel: value.best.name,
      label: providerDisplayName(key),
    }))
    .sort((a, b) => b.best - a.best || a.label.localeCompare(b.label));
  const keys = options.map((option) => option.key);
  const active = new Set(selected ?? keys);
  const all = keys.length > 0 && keys.every((key) => active.has(key));
  useEffect(() => {
    if (bulk.current) bulk.current.indeterminate = !all && active.size > 0;
  }, [all, active.size]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current?.open && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && root.current?.open) {
        root.current.open = false;
        root.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const visible = options.filter((option) =>
    `${option.label} ${option.key}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={`${styles.metricToggle} ${timeline.organizationPicker}`} data-capture-exclude>
      <details ref={root} className={styles.benchmarkSelect} aria-label="Timeline organizations">
        <summary>
          <span>Organizations · {selected == null ? "All" : active.size}</span>
        </summary>
        <div className={styles.benchmarkSelectMenu}>
          <label className={styles.benchmarkSelectSearch}>
            <span className={styles.visuallyHidden}>Filter organizations</span>
            <input
              type="search"
              placeholder="Filter organizations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.benchmarkSelectOptions}>
            <div className={`${styles.benchmarkSelectHeader} ${timeline.organizationRow}`}>
              <label className={styles.benchmarkSelectBulk}>
                <input
                  ref={bulk}
                  type="checkbox"
                  aria-label="All organizations"
                  checked={all}
                  onChange={() => onChange(all ? [] : null)}
                />
                <span className={styles.benchmarkSelectBulkMark} aria-hidden="true" />
              </label>
              <span>Organization</span>
              <span className={styles.benchmarkSelectOptionCoverage}>Best index</span>
              <span className={styles.benchmarkSelectOptionCoverage}>#Models</span>
            </div>
            {visible.map((option) => (
              <label
                key={option.key}
                className={`${styles.benchmarkSelectOption} ${timeline.organizationRow}`}
              >
                <input
                  type="checkbox"
                  aria-label={option.label}
                  checked={active.has(option.key)}
                  onChange={(event) => {
                    const next = new Set(active);
                    if (event.target.checked) next.add(option.key);
                    else next.delete(option.key);
                    const chosen = keys.filter((key) => next.has(key));
                    onChange(chosen.length === keys.length ? null : chosen);
                  }}
                />
                <span className={styles.benchmarkSelectOptionMark} aria-hidden="true" />
                <span className={styles.benchmarkSelectOptionLabel}>{option.label}</span>
                <span
                  className={styles.benchmarkSelectOptionCoverage}
                  title={`${option.bestModel} · Intelligence Index`}
                >
                  {option.best.toFixed(1)}
                </span>
                <span className={styles.benchmarkSelectOptionCoverage}>{option.count}</span>
              </label>
            ))}
            {!visible.length && (
              <p className={styles.benchmarkSelectExplainer}>No matching organizations.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
