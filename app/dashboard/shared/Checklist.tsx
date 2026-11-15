/** The dashboard's checklist: a searchable list of choices with an All row and sortable columns, which the benchmark, organization, and provider pickers render, and the sort control and ordering that the evidence tables share with it. */

import { Boxes } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { filterSearchDocuments } from "./search";

import styles from "./checklist.module.css";

type SortDirection = "ascending" | "descending";

export type ChecklistSort<K extends string> = { key: K; direction: SortDirection };

/** The name column: a lab carries its logo, or its initial when it has none, and a benchmark may carry its unit beneath. */
type NameColumn<T> = { label: string; sort: SortDirection; text: (item: T) => string } & (
  | { logo: (item: T) => string }
  | { detail?: (item: T) => string | undefined }
);

/** A column of figures, sorted by `value`, missing values last, and shown as `text`. */
type ChecklistColumn<T, K extends string> = {
  key: K;
  label: string;
  sort: SortDirection;
  value: (item: T) => number | null;
  text: (item: T) => string;
  title?: (item: T) => string;
};

/**
 * Searching and sorting change only which rows show and in what order, never what is ticked; `checked` and `onToggle` own the selection.
 * The All row ticks while `all.checked`, shows a dash while `all.mixed`, and leaves what choosing it means to `all.onSelect`.
 */
export function Checklist<T, K extends string>({
  items,
  itemKey,
  name,
  columns,
  initialSort,
  search,
  note,
  all,
  empty,
  checked,
  onToggle,
}: {
  items: readonly T[];
  itemKey: (item: T) => string;
  name: NameColumn<T>;
  columns: readonly ChecklistColumn<T, K>[];
  initialSort: ChecklistSort<"name" | K>;
  search: { label: string; placeholder: string; context?: (item: T) => unknown };
  note?: string;
  all: { label: string; checked: boolean; mixed?: boolean; onSelect: () => void };
  empty: string;
  checked: (item: T) => boolean;
  onToggle: (item: T, checked: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  // The name column is no figure column, so a key no column claims sorts by name.
  const [sort, sortBy] = useChecklistSort(
    (key: "name" | K) => columns.find((column) => column.key === key)?.sort ?? name.sort,
    initialSort,
  );
  const sortValue = columns.find((column) => column.key === sort.key)?.value ?? name.text;
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = all.mixed ?? false;
  }, [all.mixed]);
  const visible = sortChecklist(
    filterSearchDocuments(
      query,
      items.map((item) => ({
        value: item,
        primary: [name.text(item), itemKey(item)],
        context: search.context?.(item),
      })),
    ),
    sort,
    sortValue,
    name.text,
  );
  const logo = "logo" in name ? name.logo : null;
  return (
    <div className={styles.checklist}>
      <div className={styles.search}>
        <input
          type="search"
          aria-label={search.label}
          value={query}
          placeholder={search.placeholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
      <label className={`${styles.row} ${styles.all}`}>
        <input ref={allRef} type="checkbox" checked={all.checked} onChange={all.onSelect} />
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>
          {logo ? <Boxes className={styles.logo} aria-hidden="true" /> : null}
          <span className={styles.label}>{all.label}</span>
        </span>
      </label>
      <div className={styles.options} style={{ "--figures": columns.length } as CSSProperties}>
        <div className={styles.header} role="row">
          <span />
          <SortHeader label={name.label} sortKey="name" sort={sort} onSort={sortBy} />
          {columns.map((column) => (
            <SortHeader
              key={column.key}
              label={column.label}
              sortKey={column.key}
              sort={sort}
              onSort={sortBy}
            />
          ))}
        </div>
        {visible.map((item) => {
          const text = name.text(item);
          const detail = "detail" in name ? name.detail?.(item) : undefined;
          return (
            <label key={itemKey(item)} className={styles.row}>
              <input
                type="checkbox"
                aria-label={text}
                checked={checked(item)}
                onChange={(event) => onToggle(item, event.target.checked)}
              />
              <span className={styles.mark} aria-hidden="true" />
              <span className={styles.name}>
                {logo ? <Logo src={logo(item)} label={text} /> : null}
                <span className={styles.label}>
                  {text}
                  {detail ? <span className={styles.detail}>{detail}</span> : null}
                </span>
              </span>
              {columns.map((column) => (
                <span key={column.key} className={styles.figure} title={column.title?.(item)}>
                  {column.text(item)}
                </span>
              ))}
            </label>
          );
        })}
        {visible.length === 0 ? <p className={styles.empty}>{empty}</p> : null}
      </div>
    </div>
  );
}

/** A column's sort control: its label, then a mark lit on the way the column sorts, if it does; the header cell around it carries the matching `aria-sort`. */
export function SortButton({
  direction,
  onSort,
  className,
  children,
}: {
  direction: SortDirection | "none";
  onSort: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className ? `${styles.sortButton} ${className}` : styles.sortButton}
      data-sort-state={direction}
      onClick={onSort}
    >
      {children}
      <span className={styles.sortIndicator} aria-hidden="true" />
    </button>
  );
}

/** Clicking a column sorts by it in its natural direction, given by `directionOf`, and clicking it again reverses it. */
export function useChecklistSort<K extends string>(
  directionOf: (key: K) => SortDirection,
  initial: ChecklistSort<NoInfer<K>>,
) {
  const [sort, setSort] = useState(initial);
  const sortBy = (key: K) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "ascending"
            ? "descending"
            : "ascending"
          : directionOf(key),
    }));
  return [sort, sortBy] as const;
}

/** Items in the sorted column's order, missing values last in either direction and ties by label. */
export function sortChecklist<T, K extends string>(
  items: readonly T[],
  sort: ChecklistSort<K>,
  value: (item: T) => string | number | null,
  label: (item: T) => string,
): T[] {
  const byLabel = (left: T, right: T) =>
    label(left).localeCompare(label(right), undefined, { numeric: true });
  return [...items].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (a == null || b == null)
      return a == null && b == null ? byLabel(left, right) : a == null ? 1 : -1;
    const comparison =
      typeof a === "string" || typeof b === "string"
        ? String(a).localeCompare(String(b), undefined, { numeric: true })
        : a - b;
    return (sort.direction === "ascending" ? comparison : -comparison) || byLabel(left, right);
  });
}

function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: K;
  sort: ChecklistSort<K>;
  onSort: (key: K) => void;
}) {
  const direction = sort.key === sortKey ? sort.direction : "none";
  return (
    <span className={styles.sortHeader} role="columnheader" aria-sort={direction}>
      <SortButton direction={direction} onSort={() => onSort(sortKey)}>
        {label}
      </SortButton>
    </span>
  );
}

function Logo({ src, label }: { src: string; label: string }) {
  return src ? (
    <img className={styles.logo} src={src} alt="" width={18} height={18} loading="lazy" />
  ) : (
    <span className={styles.logo} aria-hidden="true">
      {label.slice(0, 1)}
    </span>
  );
}
