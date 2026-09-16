"use client";

import { Crosshair } from "lucide-react";
/** Dense SVG matrices reserve detail space from deduplicated field alternatives before hover interaction. */
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./matrices.module.css";

type Axis = { id: string; label: string };
type Position = { row: string; column: string };
type Readout = {
  title: string;
  subtitle: string;
  status: string;
  tone?: "used" | "observed" | "inferred" | "warning";
  metrics?: { label: string; value: string }[];
  notes?: { label: string; value: string | string[] }[];
};

export function MatrixOverview({
  label,
  rows,
  columns,
  rowLabel,
  columnLabel,
  rowDescription,
  columnDescription,
  colors,
  status,
  cell,
}: {
  label: string;
  rows: Axis[];
  columns: Axis[];
  rowLabel: string;
  columnLabel: string;
  rowDescription: string;
  columnDescription: string;
  colors: readonly string[];
  status: (row: Axis, column: Axis) => number | null;
  cell: (row: Axis, column: Axis) => { detail: Readout; select?: () => void };
}) {
  const [active, setActive] = useState<Position | null>(null);
  const readoutId = useId();
  // Size every field independently before hovering, so visiting a new cell never grows the page.
  const sizing = useMemo(() => {
    const statuses = new Set<string>();
    const metrics = new Map<string, { label: string; values: Set<string> }[]>();
    const notes = new Map<string, { label: string; values: Map<string, string | string[]> }[]>();
    for (const row of rows) {
      for (const column of columns) {
        const { detail } = cell(row, column);
        statuses.add(detail.status);
        if (detail.metrics?.length) {
          const key = JSON.stringify(detail.metrics.map((item) => item.label));
          const group =
            metrics.get(key) ??
            detail.metrics.map(({ label }) => ({ label, values: new Set<string>() }));
          detail.metrics.forEach((item, index) =>
            group[index]!.values.add(item.value.replace(/\d/g, "0")),
          );
          metrics.set(key, group);
        }
        if (detail.notes?.length) {
          const key = JSON.stringify(detail.notes.map((item) => item.label));
          const group =
            notes.get(key) ??
            detail.notes.map(({ label }) => ({
              label,
              values: new Map<string, string | string[]>(),
            }));
          detail.notes.forEach((item, index) =>
            group[index]!.values.set(JSON.stringify(item.value), item.value),
          );
          notes.set(key, group);
        }
      }
    }
    return { statuses: [...statuses], metrics: [...metrics.values()], notes: [...notes.values()] };
  }, [rows, columns, cell]);
  // Metric digits use tabular figures, so equal-length digit runs share one sizing alternative.
  const sizingContent = useMemo(
    () => (
      <div className={styles.readoutSizer} aria-hidden="true">
        <div className={styles.readoutHeading}>
          <div>
            <SizingStack>
              {rows.map((row) => (
                <strong key={row.id}>{row.label}</strong>
              ))}
            </SizingStack>
            <SizingStack>
              {columns.map((column) => (
                <span key={column.id}>{column.label}</span>
              ))}
            </SizingStack>
          </div>
          <SizingStack>
            {sizing.statuses.map((value) => (
              <span key={value} className={styles.readoutStatus}>
                {value}
              </span>
            ))}
          </SizingStack>
        </div>
        <div className={styles.readoutMetricSizer}>
          <SizingStack>
            {sizing.metrics.map((group, index) => (
              <ReadoutFields
                key={index}
                className={styles.readoutMetrics}
                items={group.map(({ label, values }) => ({
                  label,
                  value: (
                    <SizingStack>
                      {[...values].map((value) => (
                        <span key={value}>{value}</span>
                      ))}
                    </SizingStack>
                  ),
                }))}
              />
            ))}
          </SizingStack>
        </div>
        <div className={styles.readoutNoteSizer}>
          <SizingStack>
            {sizing.notes.map((group, index) => (
              <ReadoutFields
                key={index}
                className={styles.readoutNotes}
                items={group.map(({ label, values }) => ({
                  label,
                  value: (
                    <SizingStack>
                      {[...values].map(([key, value]) => (
                        <div key={key}>
                          {Array.isArray(value) ? <ReadoutList items={value} /> : value}
                        </div>
                      ))}
                    </SizingStack>
                  ),
                }))}
              />
            ))}
          </SizingStack>
        </div>
      </div>
    ),
    [rows, columns, sizing],
  );
  const paths = useMemo(() => {
    const groups: string[][] = colors.map(() => []);
    rows.forEach((row, y) => {
      columns.forEach((column, x) => {
        const value = status(row, column);
        if (value != null) groups[value]!.push(`M${x},${y}h1v1h-1z`);
      });
    });
    return groups.map((group) => group.join(""));
  }, [rows, columns, colors, status]);
  const rowIndex = rows.findIndex((row) => row.id === active?.row);
  const columnIndex = columns.findIndex((column) => column.id === active?.column);
  const detail =
    rowIndex >= 0 && columnIndex >= 0 ? cell(rows[rowIndex]!, columns[columnIndex]!) : null;

  const activate = (row: number, column: number) => {
    const next = { row: rows[row]!.id, column: columns[column]!.id };
    setActive((previous) =>
      previous?.row === next.row && previous.column === next.column ? previous : next,
    );
  };

  /** Resolve one cell from the scaled SVG, including touch input and clicks along the lower/right boundary. */
  const locate = (event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const row = Math.max(
      0,
      Math.min(
        rows.length - 1,
        Math.floor(((event.clientY - bounds.top) / bounds.height) * rows.length),
      ),
    );
    const column = Math.max(
      0,
      Math.min(
        columns.length - 1,
        Math.floor(((event.clientX - bounds.left) / bounds.width) * columns.length),
      ),
    );
    activate(row, column);
    return { row, column };
  };

  const navigate = (event: KeyboardEvent<SVGSVGElement>) => {
    const row = Math.max(0, rowIndex),
      column = Math.max(0, columnIndex);
    const moves: Record<string, [number, number]> = {
      ArrowUp: [Math.max(0, row - 1), column],
      ArrowDown: [Math.min(rows.length - 1, row + 1), column],
      ArrowLeft: [row, Math.max(0, column - 1)],
      ArrowRight: [row, Math.min(columns.length - 1, column + 1)],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      activate(...move);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cell(rows[row]!, columns[column]!).select?.();
    }
  };

  if (!rows.length || !columns.length) return <p>No evidence matches this filter.</p>;

  return (
    <div className={styles.matrixOverview}>
      <div className={styles.matrixPlot}>
        <div className={styles.overviewAxes}>
          <div>
            <span>Rows</span>
            <strong>
              {rows.length} {rowLabel}
            </strong>
            <small>{rowDescription}</small>
          </div>
          <div>
            <span>Columns</span>
            <strong>
              {columns.length} {columnLabel}
            </strong>
            <small>{columnDescription}</small>
          </div>
        </div>
        <svg
          className={styles.overviewGrid}
          viewBox={`0 0 ${columns.length} ${rows.length}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}. Use arrow keys to explore cells.`}
          aria-describedby={readoutId}
          tabIndex={0}
          onFocus={() => {
            if (!detail) activate(0, 0);
          }}
          onPointerMove={locate}
          onClick={(event) => {
            const position = locate(event);
            if (position) cell(rows[position.row]!, columns[position.column]!).select?.();
          }}
          onKeyDown={navigate}
        >
          <rect width={columns.length} height={rows.length} fill="var(--hover)" />
          {paths.map((path, index) => (
            <path key={index} d={path} fill={colors[index]} />
          ))}
          {detail && (
            <g pointerEvents="none">
              <rect
                x={0}
                y={rowIndex}
                width={columns.length}
                height={1}
                fill="var(--ink)"
                fillOpacity={0.14}
              />
              <rect
                x={columnIndex}
                y={0}
                width={1}
                height={rows.length}
                fill="var(--ink)"
                fillOpacity={0.08}
              />
              <rect
                x={columnIndex}
                y={rowIndex}
                width={1}
                height={1}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>
        <div className={styles.matrixHint}>
          <Crosshair size={13} aria-hidden="true" />
          Hover or tap to inspect. Arrow keys move between cells.
        </div>
      </div>
      <aside className={styles.matrixInspector} aria-label={`${label} details`}>
        <div className={styles.inspectorLabel}>
          <Crosshair size={14} aria-hidden="true" />
          <span>Cell details</span>
        </div>
        <div id={readoutId} className={styles.overviewReadout} role="status">
          {sizingContent}
          <div className={styles.readoutContent}>
            {detail ? (
              <>
                <div className={styles.readoutHeading}>
                  <div>
                    <strong>{detail.detail.title}</strong>
                    <span>{detail.detail.subtitle}</span>
                  </div>
                  <span className={styles.readoutStatus} data-tone={detail.detail.tone}>
                    {detail.detail.status}
                  </span>
                </div>
                {detail.detail.metrics?.length ? (
                  <ReadoutFields className={styles.readoutMetrics} items={detail.detail.metrics} />
                ) : null}
                {detail.detail.notes?.length ? (
                  <ReadoutFields
                    className={styles.readoutNotes}
                    items={detail.detail.notes.map(({ label, value }) => ({
                      label,
                      value: Array.isArray(value) ? <ReadoutList items={value} /> : value,
                    }))}
                  />
                ) : null}
              </>
            ) : (
              <div className={styles.readoutEmpty}>
                <Crosshair size={28} strokeWidth={1.25} aria-hidden="true" />
                <strong>Explore a cell</strong>
                <p>Move across the map to see its evidence, values and inputs here.</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Active details and sizing alternatives share the same field markup and CSS geometry. */
function ReadoutFields({
  className,
  items,
}: {
  className?: string;
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className={className}>
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Overlaid alternatives reserve their largest natural size without contributing repeated rows. */
function SizingStack({ children }: { children: ReactNode }) {
  return <div className={styles.readoutSizingStack}>{children}</div>;
}

/** Pack the largest number of aligned columns that fits their actual text widths, preserving input order. */
function ReadoutList({ items }: { items: string[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState("minmax(0, 1fr)");
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !list.clientWidth) return;
      const widths = Array.from(list.querySelectorAll<HTMLElement>("[data-measure]")).map(
        (element) => Math.ceil(element.getBoundingClientRect().width),
      );
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      for (let count = widths.length; count > 0; count--) {
        const sizes = Array.from({ length: count }, () => 0);
        widths.forEach((width, index) => {
          sizes[index % count] = Math.max(sizes[index % count]!, width);
        });
        if (sizes.reduce((sum, width) => sum + width, 0) + gap * (count - 1) <= list.clientWidth) {
          setColumns(sizes.map((width) => `${width}px`).join(" "));
          return;
        }
      }
      setColumns("minmax(0, 1fr)");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    measure();
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [items]);
  return (
    <ul ref={ref} className={styles.readoutList} style={{ gridTemplateColumns: columns }}>
      {items.map((item) => (
        <li key={item}>
          <span className={styles.readoutMeasure} data-measure aria-hidden="true">
            {item}
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
