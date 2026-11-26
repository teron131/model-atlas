/** Compact evidence disclosure: which selected benchmarks each model's shown variants share, drawn as a field of lit and unlit marks beside each model's variant count and residual index weight, sortable by rank or any summary column and narrowed to the models sharing every picked benchmark; it explains the comparison without owning graph selection. */

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { type ChecklistSort, SortButton, useChecklistSort } from "../../shared/Checklist";
import { modelName } from "../../shared/model-display";
import { providerChartColor } from "../../shared/provider-theme";
import { ProviderLogo } from "../../shared/ProviderLogo";
import {
  type FrontierBenchmarkAxisKey,
  type FrontierBenchmarkOption,
  isScoreAxis,
} from "./analysis";
import type { CommonBenchmarkComparison } from "./common-evidence";
import { frontierBenchmarkAxisConfig } from "./presentation";

import styles from "../graphs.module.css";

const BROAD_SHARE = 0.9;

const SORT_DIRECTIONS = {
  rank: "ascending",
  common: "descending",
  variants: "descending",
  index: "descending",
} as const;

type SortKey = keyof typeof SORT_DIRECTIONS;

const SORT_LABELS: Record<SortKey, string> = {
  rank: "Rank",
  common: "Common",
  variants: "Variants",
  index: "Index",
};

export function CommonEvidence({
  comparison,
  benchmarkOptions,
  activeBenchmarkKeys,
  axisKey,
  publishedPerformance,
}: {
  comparison: CommonBenchmarkComparison;
  benchmarkOptions: readonly FrontierBenchmarkOption[];
  activeBenchmarkKeys: readonly string[];
  axisKey: FrontierBenchmarkAxisKey;
  publishedPerformance: boolean;
}) {
  const [sort, sortBy] = useChecklistSort((key: SortKey) => SORT_DIRECTIONS[key], {
    key: "rank",
    direction: "ascending",
  });
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [pickedKeys, setPickedKeys] = useState<readonly string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const hasRows = comparison.groups.length > 0;
  // The scroll box's height counts the sticky header, which its tallest benchmark name sets, so the header is measured whenever it resizes.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const head = headRef.current;
    if (wrap == null || head == null) return;
    const observer = new ResizeObserver(() =>
      wrap.style.setProperty("--evidence-head", `${head.offsetHeight}px`),
    );
    observer.observe(head);
    return () => observer.disconnect();
  }, [hasRows]);
  const hasPicks = pickedKeys.length > 0;
  // Picked benchmarks hold until each is toggled off or a click lands anywhere but a header button, so sorting keeps them while the header's blank space clears them.
  useEffect(() => {
    if (!hasPicks) return;
    const clear = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button != null && headRef.current?.contains(button)) return;
      setPickedKeys([]);
    };
    document.addEventListener("click", clear);
    return () => document.removeEventListener("click", clear);
  }, [hasPicks]);
  const percent = (share: number) => `${(share * 100).toFixed(0)}%`;
  const indexShares = comparison.groups
    .filter((group) => group.effortCount > 0)
    .map((group) => group.indexShare);
  const leastIndex = Math.min(...indexShares);
  const mostIndex = Math.max(...indexShares);
  // Index appears only once some model leans on an index; a model that does not leaves its cell blank.
  const showIndex = indexShares.length > 0 && percent(mostIndex) !== "0%";
  const indexShareLabel =
    percent(leastIndex) === percent(mostIndex)
      ? percent(mostIndex)
      : `${(leastIndex * 100).toFixed(0)}–${percent(mostIndex)}`;
  const resourceLabel = axisKey === "cost" ? "cost" : axisKey === "time" ? "time" : "token-use";
  const label = (key: string) =>
    key === "aa_intelligence_index"
      ? "AA Index"
      : (benchmarkOptions.find((option) => option.key === key)?.label ?? key).replace(
          " (index)",
          "",
        );
  // Rank is the comparison's own leaderboard order.
  const ranked = comparison.groups.map((group, rank) => ({
    group,
    rank,
    common: new Set(group.benchmarkKeys),
  }));
  const sharedBy = (key: string) => ranked.filter((row) => row.common.has(key)).length;
  // Benchmarks most models share lead, so the sparse ones gather at the field's right edge; one no model shares is left out as an empty column.
  const columns = activeBenchmarkKeys
    .filter((key) => sharedBy(key) > 0)
    .sort((a, b) => sharedBy(b) - sharedBy(a) || label(a).localeCompare(label(b)));
  // A pick whose benchmark filters have since removed no longer narrows the rows.
  const picked = pickedKeys.filter((key) => columns.includes(key));
  const togglePick = (key: string) =>
    setPickedKeys((current) =>
      current.includes(key) ? current.filter((other) => other !== key) : [...current, key],
    );
  const summaryColumns: readonly Exclude<SortKey, "rank">[] = showIndex
    ? ["common", "variants", "index"]
    : ["common", "variants"];
  // A sort by an Index column that filters have since hidden falls back to rank, so the order always has a visible header.
  const order: ChecklistSort<SortKey> =
    sort.key === "index" && !showIndex ? { key: "rank", direction: "ascending" } : sort;
  const sortValue = (row: (typeof ranked)[number]) =>
    order.key === "rank"
      ? row.rank
      : order.key === "common"
        ? row.group.benchmarkKeys.length
        : order.key === "variants"
          ? row.group.effortCount
          : row.group.indexShare;
  // The sort is stable, so ties keep rank order in either direction.
  const rows = [...ranked].sort(
    (a, b) => (sortValue(a) - sortValue(b)) * (order.direction === "ascending" ? 1 : -1),
  );
  const shares = (row: (typeof ranked)[number]) => picked.every((key) => row.common.has(key));
  const shownCount = ranked.filter(shares).length;
  // What the comparison rests on alike: the benchmarks every listed model's variants have, or where none covers every model, those at least nine in ten share.
  const everyone = columns.filter((key) => sharedBy(key) === ranked.length);
  const core = everyone.length
    ? everyone
    : columns.filter((key) => sharedBy(key) >= BROAD_SHARE * ranked.length);
  const [closest] = columns;
  const coreSentence = everyone.length
    ? `Every model shares ${core.length} of ${activeBenchmarkKeys.length} selected benchmarks: ${core.map(label).join(", ")}.`
    : core.length
      ? `No selected benchmark is shared by every model; ${core.length} of ${activeBenchmarkKeys.length} are shared by at least ${Math.round(BROAD_SHARE * 100)}% of them: ${core.map(label).join(", ")}.`
      : closest == null
        ? null
        : `No selected benchmark is shared by every model; ${label(closest)} comes closest, shared by ${sharedBy(closest)} of ${ranked.length}.`;
  const hover = (column: string) => (column === hoveredColumn ? true : undefined);
  const picks = (column: string) => (picked.includes(column) ? true : undefined);
  // The pointer's column lights down the field, crossing the row's own hover light.
  const trackColumn = (event: PointerEvent<HTMLTableElement>) =>
    setHoveredColumn(
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>("[data-column]")?.dataset.column ?? null)
        : null,
    );
  return (
    <details className={styles.commonEvidence} aria-label="Common evidence" data-capture-exclude>
      <summary className={styles.chartFooterCaption}>
        <span>Common evidence</span>
        <span>{comparison.rows.length} variants</span>
        {showIndex ? <span>Index {indexShareLabel}</span> : null}
        <span>Details</span>
      </summary>
      <div className={styles.note}>
        {ranked.length > 0 && coreSentence != null ? (
          <p className={styles.evidenceCore}>{coreSentence}</p>
        ) : null}
        <p>
          {publishedPerformance
            ? `Each model's variants share ${resourceLabel} evidence; Y keeps the published score.`
            : isScoreAxis(axisKey)
              ? `Each model's variants share performance evidence; X keeps the published ${frontierBenchmarkAxisConfig[axisKey].label}.`
              : `Each model's variants share quality and ${resourceLabel} evidence, with the same weights on both axes.`}
        </p>
        {showIndex ? (
          <p>{`Index is the weight an index carries for the benchmarks it summarizes that a model lacks here; a model measured on all of them directly has none, since counting the index as well would count them twice.`}</p>
        ) : null}
        {comparison.excludedVariantCount > 0 ? (
          <p>{`${comparison.excludedVariantCount} variants lack selected index results. Deselect indexes to compare tasks.`}</p>
        ) : null}
        {ranked.length > 0 ? (
          <>
            <p className={styles.evidenceLegend}>
              <span>
                <i data-common aria-hidden="true" />
                Measured on every variant
              </span>
              <span>
                <i aria-hidden="true" />
                Not on every variant
              </span>
              <span className={styles.evidenceFilter} aria-live="polite">
                {picked.length === 0
                  ? null
                  : `${shownCount} of ${ranked.length} models share ${new Intl.ListFormat("en").format(picked.map(label))}`}
              </span>
            </p>
            <div
              ref={wrapRef}
              className={styles.evidenceTableWrap}
              role="region"
              aria-label="Evidence by model"
              tabIndex={0}
            >
              <table
                className={`${styles.evidenceTable} ${styles.evidenceField}`}
                style={{ "--rank-digits": String(ranked.length).length } as CSSProperties}
                onPointerOver={trackColumn}
                onPointerLeave={() => setHoveredColumn(null)}
              >
                <colgroup>
                  <col />
                  {[...columns, ...summaryColumns].map((column) => (
                    <col key={column} data-hover={hover(column)} data-picked={picks(column)} />
                  ))}
                </colgroup>
                <thead ref={headRef}>
                  <tr>
                    <SortHeader sortKey="rank" sort={order} onSort={sortBy}>
                      <span className={styles.evidenceSharing}>Models sharing</span>
                    </SortHeader>
                    {columns.map((key) => (
                      <th
                        key={key}
                        scope="col"
                        data-column={key}
                        data-hover={hover(key)}
                        data-picked={picks(key)}
                      >
                        <button
                          type="button"
                          className={styles.evidenceHead}
                          aria-pressed={picked.includes(key)}
                          onClick={() => togglePick(key)}
                        >
                          <span className={styles.evidenceUpright}>{label(key)}</span>
                          <span className={styles.evidenceCount}>
                            <span className="visually-hidden">shared by </span>
                            {sharedBy(key)}
                          </span>
                        </button>
                      </th>
                    ))}
                    {summaryColumns.map((column) => (
                      <SortHeader
                        key={column}
                        sortKey={column}
                        sort={order}
                        onSort={sortBy}
                        hovered={hover(column)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const { group, rank, common } = row;
                    const figures = {
                      common: `${group.benchmarkKeys.length}/${activeBenchmarkKeys.length}`,
                      variants: group.effortCount,
                      index: percent(group.indexShare) === "0%" ? null : percent(group.indexShare),
                    };
                    return (
                      <tr
                        key={group.modelKey}
                        data-out={!shares(row) || undefined}
                        style={
                          { "--lab": providerChartColor(group.model.provider) } as CSSProperties
                        }
                      >
                        <th scope="row">
                          <div className={styles.evidenceModel}>
                            <span className={styles.evidenceRank}>{rank + 1}</span>
                            <ProviderLogo model={group.model} />
                            <span>{modelName({ ...group.model, reasoning_effort: null })}</span>
                          </div>
                        </th>
                        {columns.map((key) => {
                          const shared = common.has(key);
                          return (
                            <td key={key} data-column={key} data-common={shared || undefined}>
                              <i aria-hidden="true" />
                              <span className="visually-hidden">
                                {shared ? "Measured on every variant" : "Not on every variant"}
                              </span>
                            </td>
                          );
                        })}
                        {summaryColumns.map((column) => (
                          <td key={column} className={styles.evidenceSummary} data-column={column}>
                            {figures[column]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {ranked.length === 0 ? <p>No common evidence. Select a model or one benchmark.</p> : null}
      </div>
    </details>
  );
}

function SortHeader({
  sortKey,
  sort,
  onSort,
  hovered,
  children,
}: {
  sortKey: SortKey;
  sort: ChecklistSort<SortKey>;
  onSort: (key: SortKey) => void;
  hovered?: true;
  children?: ReactNode;
}) {
  const direction = sort.key === sortKey ? sort.direction : "none";
  const button = (
    <SortButton
      direction={direction}
      onSort={() => onSort(sortKey)}
      className={styles.evidenceSort}
    >
      {sortKey === "rank" ? (
        SORT_LABELS[sortKey]
      ) : (
        <span className={styles.evidenceUpright}>{SORT_LABELS[sortKey]}</span>
      )}
    </SortButton>
  );
  return (
    <th
      scope="col"
      className={sortKey === "rank" ? undefined : styles.evidenceSummary}
      aria-sort={direction}
      data-column={sortKey === "rank" ? undefined : sortKey}
      data-hover={hovered}
    >
      {children == null ? (
        button
      ) : (
        <div className={styles.evidenceRankHead}>
          {button}
          {children}
        </div>
      )}
    </th>
  );
}
