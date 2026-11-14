"use client";

/** The model sheet's stateless content sections: facts, scores, resources, and benchmark evidence for one model or an aligned comparison of two. */

import { type CSSProperties, type ReactNode } from "react";

import {
  BENCHMARK_DISPLAY_GROUPS,
  benchmarkDisplayGroup,
} from "../../../src/model-atlas/benchmarks/catalog";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { ModalityIcons, RatioTrack, ScoreMeter } from "../../shared/DashboardMarks";
import { formatResourceRatio, isDrawableRatio } from "../../shared/resource-ratio-display";
import { benchmarkLabels } from "../shared/benchmark-display";
import { providerBrandColor } from "../shared/provider-theme";
import {
  benchmarkMetricColumns,
  isAmountColumn,
  speedMetricColumns,
  TABLE_COLUMN_GROUP_LABELS,
} from "../table/column-registry";
import { resourceRatioColumns, scoreMetricColumns } from "../table/Columns";
import {
  formatConfidence,
  formatContext,
  formatCost,
  formatDashboardMetric,
  formatScore,
} from "../table/format";
import {
  benchmarkDisplayValue,
  benchmarkMeterValue,
  contextWindowValue,
  dashboardMetricValue,
  type TableRow,
} from "../table/leaderboard-rows";
import { type SortDirection } from "../table/sort";
import type { SheetEntry } from "./entries";

import styles from "./model-sheet.module.css";

type ScoreGetter = (model: ModelAtlasModel) => number | null;
/** Where a compared value stands against the other in its row's direction. */
type Lead = "better" | "worse";
/** How a row's values differ: by points on a score scale, or by proportion for amounts. */
type Difference = "points" | "proportion";
/** One compared value: whether it leads, and for the better value its margin over the other. */
type Comparison = { lead?: Lead; delta?: string };

// The exported card's benchmark lists take this many columns, for one model and for a comparison.
const CARD_COLUMNS = 3;
const COMPARE_CARD_COLUMNS = 2;

const PRICES: {
  label: string;
  value: (model: ModelAtlasModel) => number | null | undefined;
  range?: (model: ModelAtlasModel) => string;
}[] = [
  { label: "Blended", value: (model) => model.cost?.blended_price, range: blendRange },
  { label: "Input", value: (model) => model.cost?.weighted_input },
  { label: "Cache read", value: (model) => model.cost?.weighted_cache_read },
  { label: "Output", value: (model) => model.cost?.weighted_output },
];

function Fact({
  label,
  hint,
  values,
  comparisons,
}: {
  label: string;
  hint?: string;
  values: ReactNode[];
  comparisons?: Comparison[];
}) {
  return (
    <div className={styles.fact}>
      <dt title={hint}>{label}</dt>
      {values.map((value, index) => {
        const comparison = comparisons?.[index];
        return (
          <dd key={index} data-lead={comparison?.lead}>
            {value}
            {comparison?.delta == null ? null : <Delta comparison={comparison} />}
            <BetterNote lead={comparison?.lead} />
          </dd>
        );
      })}
    </div>
  );
}

/** In a comparison the margin column is always drawn, empty for the trailing value, so each cell keeps the same tracks and values stay aligned. */
function ComparedValue({
  text,
  comparison,
  comparing,
  className,
}: {
  text: string;
  comparison: Comparison;
  comparing: boolean;
  className?: string;
}) {
  return (
    <>
      <strong className={className}>
        {text}
        <BetterNote lead={comparison.lead} />
      </strong>
      {comparing ? <Delta comparison={comparison} /> : null}
    </>
  );
}

function Delta({ comparison }: { comparison: Comparison }) {
  return <span className={styles.delta}>{comparison.delta}</span>;
}

/** The better value's lead, which the sheet otherwise shows only as ink and dimming, spoken to screen readers. */
function BetterNote({ lead }: { lead?: Lead }) {
  return lead === "better" ? <span className="visually-hidden"> (better)</span> : null;
}

export function Facts({ entries }: { entries: readonly SheetEntry[] }) {
  const models = entries.map((entry) => entry.row.model);
  return (
    <dl className={styles.facts}>
      <Fact
        label="Released"
        values={models.map((model) => model.release_date?.slice(0, 10) ?? "-")}
      />
      <Fact
        label="Context"
        values={models.map((model) => formatContext(contextWindowValue(model)))}
      />
      <Fact
        label="Open weights"
        values={models.map((model) =>
          model.open_weights == null ? "-" : model.open_weights ? "Yes" : "No",
        )}
      />
      <Fact
        label="Input"
        values={models.map((model) => (
          <ModalityIcons key={model.id ?? model.name} inputs={model.modalities?.input} />
        ))}
      />
    </dl>
  );
}

export function Scores({ entries }: { entries: readonly SheetEntry[] }) {
  const populations = [...new Set(entries.map(populationLabel))].join(" · ");
  const comparing = entries.length > 1;
  return (
    <section className={styles.section} aria-labelledby="model-sheet-scores">
      <h3 id="model-sheet-scores">
        Scores <small>Rank among {populations}</small>
      </h3>
      <div className={styles.scoreHead} aria-hidden="true">
        <span />
        {entries.map((entry) => (
          <span key={entry.slot} className={styles.scoreCell}>
            <span />
            {comparing ? <span /> : null}
            <span />
            <span>Rank</span>
            <span>Support</span>
          </span>
        ))}
      </div>
      <ul className={styles.scores}>
        {scoreMetricColumns.map(({ key, name, icon, score, support }) => {
          const values = entries.map((entry) => finiteScore(score(entry.row.model)));
          const comparisons = compareValues(
            values,
            values.map(formatScore),
            "descending",
            "points",
          );
          return (
            <li key={key} className={styles.score}>
              <span className={styles.scoreLabel}>
                {icon}
                <span>{name}</span>
              </span>
              {entries.map((entry, index) => {
                const model = entry.row.model;
                const value = values[index]!;
                const comparison = comparisons[index]!;
                const rank = scoreRank(entry.rows, value, score);
                return (
                  <span key={entry.slot} className={styles.scoreCell} data-lead={comparison.lead}>
                    <ComparedValue
                      text={formatScore(value)}
                      comparison={comparison}
                      comparing={comparing}
                      className={styles.scoreValue}
                    />
                    {value == null ? (
                      <span />
                    ) : (
                      <ScoreMeter score={value} color={providerBrandColor(model.provider)} />
                    )}
                    <span className={styles.rank}>
                      {rank == null ? "-" : `#${rank.rank}`}
                      {rank == null ? null : (
                        <span className="visually-hidden"> of {rank.total}</span>
                      )}
                    </span>
                    <span className={styles.support}>{formatConfidence(support(model))}</span>
                  </span>
                );
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Resources({ entries }: { entries: readonly SheetEntry[] }) {
  const models = entries.map((entry) => entry.row.model);
  const comparing = entries.length > 1;
  return (
    <section className={styles.section} aria-labelledby="model-sheet-resources">
      <h3 id="model-sheet-resources">
        Resources <small>1× is the benchmark median</small>
      </h3>
      <ul className={styles.ratios}>
        {resourceRatioColumns.map(({ kind, name, better }) => {
          const ratios = entries.map((entry) => entry.row.resourceRatios[kind].ratio);
          const comparisons = compareValues(
            ratios,
            ratios.map(formatResourceRatio),
            better,
            "proportion",
          );
          return (
            <li key={kind}>
              <span>{name}</span>
              {entries.map((entry, index) => {
                const summary = entry.row.resourceRatios[kind];
                const ratio = summary?.ratio;
                const comparison = comparisons[index]!;
                return (
                  <span
                    key={entry.slot}
                    className={styles.ratioCell}
                    data-lead={comparison.lead}
                    title={
                      summary == null
                        ? undefined
                        : `${summary.benchmarkCount} measured benchmarks · ${summary.sourceCount} source measurements`
                    }
                  >
                    <ComparedValue
                      text={formatResourceRatio(ratio)}
                      comparison={comparison}
                      comparing={comparing}
                    />
                    {isDrawableRatio(ratio) ? (
                      <RatioTrack
                        ratio={ratio}
                        color={providerBrandColor(entry.row.model.provider)}
                      />
                    ) : (
                      <span />
                    )}
                  </span>
                );
              })}
            </li>
          );
        })}
      </ul>
      <div className={styles.amounts}>
        <div>
          <h4 className={styles.amountsTitle}>Price per million tokens</h4>
          <dl>
            {PRICES.flatMap(({ label, value, range }) => {
              const prices = models.map(value);
              const texts = prices.map(formatCost);
              const fact = (
                <Fact
                  key={label}
                  label={label}
                  values={texts}
                  comparisons={compareValues(prices, texts, "ascending", "proportion")}
                />
              );
              return range == null
                ? [fact]
                : [
                    fact,
                    <Fact
                      key={`${label} range`}
                      label="Range"
                      hint="From long agent sessions to short agent tasks"
                      values={models.map((model) => (
                        <span className={styles.priceRange}>{range(model)}</span>
                      ))}
                    />,
                  ];
            })}
          </dl>
        </div>
        <div>
          <h4 className={styles.amountsTitle}>Speed</h4>
          <dl>
            {speedMetricColumns.map((column) => {
              const amounts = models.map((model) => dashboardMetricValue(model, column));
              const texts = amounts.map((amount) => formatDashboardMetric(amount, column));
              return (
                <Fact
                  key={column.key}
                  label={column.label}
                  values={texts}
                  comparisons={compareValues(amounts, texts, column.direction, "proportion")}
                />
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}

type BenchmarkResult = { value: number; text: string; meter: number | null; ratio: number | null };

/**
 * Benchmark results in the table's evidence groups, each with the table's meter across the observed range.
 * A comparison lists every benchmark either model measured, so each row holds both results or a dash.
 */
export function BenchmarkEvidence({ entries }: { entries: readonly SheetEntry[] }) {
  const comparing = entries.length > 1;
  const groups = BENCHMARK_DISPLAY_GROUPS.map((key) => {
    const columns = benchmarkMetricColumns.filter(
      (column) => benchmarkDisplayGroup(column.benchmark) === key,
    );
    const rows = columns.flatMap((column) => {
      const results = entries.map((entry) => benchmarkResult(entry.row, column));
      if (results.every((result) => result == null)) return [];
      return [
        {
          key: column.key,
          label: benchmarkLabels[column.benchmark] ?? column.label,
          results,
          // Results reported as amounts differ by proportion; every other result by points on its own scale.
          comparisons: compareValues(
            results.map((result) => result?.value),
            results.map((result) => result?.text ?? "-"),
            column.direction,
            isAmountColumn(column) ? "proportion" : "points",
          ),
        },
      ];
    });
    const counts = entries.map(
      (_, index) => rows.filter((row) => row.results[index] != null).length,
    );
    return { key, label: TABLE_COLUMN_GROUP_LABELS[key], rows, counts, total: columns.length };
  }).filter((group) => group.total > 0);
  return (
    <section className={styles.section} aria-labelledby="model-sheet-benchmarks">
      <h3 id="model-sheet-benchmarks">Benchmarks</h3>
      {groups.map((group) => (
        <div key={group.key} className={styles.benchmarkGroup}>
          <h4>
            {group.label}
            <small>
              {group.counts.join(" · ")} of {group.total} measured
            </small>
          </h4>
          {group.rows.length ? (
            <ul
              className={styles.benchmarks}
              style={
                {
                  "--card-benchmark-rows": Math.ceil(
                    group.rows.length / (comparing ? COMPARE_CARD_COLUMNS : CARD_COLUMNS),
                  ),
                } as CSSProperties
              }
            >
              {group.rows.map((row) => (
                <li key={row.key}>
                  <span className={styles.benchmarkName} title={row.label}>
                    {row.label}
                  </span>
                  {row.results.map((result, index) => {
                    const entry = entries[index]!;
                    const comparison = row.comparisons[index]!;
                    const color = providerBrandColor(entry.row.model.provider);
                    return (
                      <span
                        key={entry.slot}
                        className={styles.benchmarkCell}
                        data-lead={comparison.lead}
                        title={
                          result?.ratio == null
                            ? undefined
                            : `${formatResourceRatio(result.ratio)} the column median`
                        }
                      >
                        <ComparedValue
                          text={result?.text ?? "-"}
                          comparison={comparison}
                          comparing={comparing}
                        />
                        {result?.meter != null ? (
                          <ScoreMeter score={result.meter} color={color} />
                        ) : result?.ratio != null ? (
                          <RatioTrack ratio={result.ratio} color={color} />
                        ) : (
                          <span />
                        )}
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function benchmarkResult(
  row: TableRow,
  column: (typeof benchmarkMetricColumns)[number],
): BenchmarkResult | null {
  const value = benchmarkDisplayValue(row, column);
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const ratio = isAmountColumn(column) ? row.metricRatios[column.key] : null;
  return {
    value,
    text: formatDashboardMetric(value, column),
    meter: benchmarkMeterValue(row, column),
    // A result reported as an amount draws the table's bar from the column median rather than a score track.
    ratio: isDrawableRatio(ratio) ? ratio : null,
  };
}

function blendRange(model: ModelAtlasModel): string {
  const longSessions = model.cost?.blended_price_long_sessions;
  const shortTasks = model.cost?.blended_price_short_tasks;
  return longSessions == null || shortTasks == null
    ? "-"
    : `${formatCost(longSessions)}–${formatCost(shortTasks)}`;
}

/**
 * In a comparison, mark the better of two values in its row's direction and give it its margin, so each column's wins and their size read at a glance.
 * Values that read the same at their displayed precision, missing values, rows without a plain direction, and single sheets mark nothing.
 */
function compareValues(
  values: readonly unknown[],
  texts: readonly string[],
  direction: SortDirection | null,
  difference: Difference,
): Comparison[] {
  const [first, second] = values;
  if (
    values.length !== 2 ||
    direction == null ||
    typeof first !== "number" ||
    typeof second !== "number" ||
    !Number.isFinite(first) ||
    !Number.isFinite(second) ||
    texts[0] === texts[1]
  ) {
    return values.map(() => ({}));
  }
  const betterIndex = (direction === "descending" ? first > second : first < second) ? 0 : 1;
  const [better, worse] = betterIndex === 0 ? [first, second] : [second, first];
  const delta =
    difference === "points"
      ? `+${Math.abs(displayedNumber(texts[betterIndex]!) - displayedNumber(texts[1 - betterIndex]!)).toFixed(1)}`
      : proportion(better, worse, direction);
  return values.map((_, index) =>
    index === betterIndex ? { lead: "better", delta } : { lead: "worse" },
  );
}

/** A points margin is read from the displayed numbers, so it always matches the values on screen whatever scale the source reports. */
function displayedNumber(text: string): number {
  return Number(text.replace(/[^\d.-]/g, ""));
}

/** An amount's margin as a share of the other value: how much less it spends or takes, or how much more it delivers, as a multiple once it doubles. */
function proportion(better: number, worse: number, direction: SortDirection): string | undefined {
  if (!(better > 0 && worse > 0)) return undefined;
  if (direction === "ascending") return `−${percent(1 - better / worse)}`;
  const ratio = better / worse;
  return ratio < 2 ? `+${percent(ratio - 1)}` : `${ratio.toPrecision(2)}×`;
}

function percent(fraction: number): string {
  const value = fraction * 100;
  return `${value < 1 ? value.toFixed(1) : Math.round(value)}%`;
}

function populationLabel(entry: SheetEntry): string {
  return `${entry.rows.length} ${entry.effort == null ? "models" : "reasoning variants"}`;
}

function finiteScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Rank a score within a sheet model's display population; ties share the higher rank, as on the leaderboard. */
function scoreRank(rows: readonly TableRow[], score: number | null, get: ScoreGetter) {
  if (score == null) return null;
  let above = 0;
  let total = 0;
  for (const candidate of rows) {
    const value = finiteScore(get(candidate.model));
    if (value == null) continue;
    total += 1;
    if (value > score) above += 1;
  }
  return { rank: above + 1, total };
}
