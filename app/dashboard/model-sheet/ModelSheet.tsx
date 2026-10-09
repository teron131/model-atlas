"use client";

/** The model sheet: one model's complete catalogue entry, opened from any leaderboard row, chart star, or frontier role and shared by URL; a pinned model sits beside it with every row aligned for comparison. */

import { Columns2, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import type { ModelAtlasModel, ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { CaptureButton } from "../capture/CaptureButton";
import { ARTIFACT_WIDTH, WIDE_ARTIFACT_WIDTH } from "../capture/png";
import { CopyDashboardLink } from "../CopyDashboardLink";
import { benchmarkLabels } from "../shared/constants";
import { BotIcon, BrainIcon, DollarIcon, LightningIcon } from "../shared/DashboardIcons";
import { providerBrandColor, providerDisplayName } from "../shared/provider-theme";
import { ProviderLogo } from "../shared/ProviderLogo";
import { formatResourceRatio, ratioTrackStyle } from "../shared/resource-ratio-display";
import {
  formatConfidence,
  formatContext,
  formatCost,
  formatDashboardMetric,
  formatScore,
} from "../table/format";
import {
  benchmarkDisplayValue,
  benchmarkEvidenceGroup,
  benchmarkMeterValue,
  benchmarkMetricColumns,
  contextWindowValue,
  dashboardMetricValue,
  isAmountColumn,
  speedMetricColumns,
  type TableRow,
} from "../table/models";
import { inputModalities } from "../table/Rows";
import { scoreChangeTooltip, scoreDimensionLabel } from "../table/tooltips";
import { useUrlState } from "../use-url-state";
import { CompareSearch } from "./CompareSearch";
import { familyName, type SheetEntry, useSheetEntries } from "./entries";
import { FrontierInset } from "./FrontierInset";
import {
  closeModelSheet,
  dismissModelSheet,
  modelSheetOpenedSince,
  pinModelSheet,
  unpinModelSheet,
} from "./open";
import { ReasoningEffort } from "./ReasoningEffort";

import captureStyles from "../capture/capture.module.css";
import styles from "./model-sheet.module.css";

type ScoreGetter = (model: ModelAtlasModel) => number | null | undefined;
/** Where a compared value stands against the other in its row's direction. */
type Lead = "better" | "worse";
/** A row's sort direction: `descending` rows favour the higher value, `ascending` rows the lower. */
type Direction = "ascending" | "descending";
/** How a row's values differ: by points on a score scale, or by proportion for amounts. */
type Difference = "points" | "proportion";
/** One compared value: whether it leads, and for the better value its margin over the other. */
type Comparison = { lead?: Lead; delta?: string };

const SCORES: { label: string; icon: ReactNode; score: ScoreGetter; support: ScoreGetter }[] = [
  {
    label: "Intelligence",
    icon: <BrainIcon />,
    score: (model) => model.scores.intelligence_score,
    support: (model) => model.confidence?.intelligence,
  },
  {
    label: "Agentic",
    icon: <BotIcon />,
    score: (model) => model.scores.agentic_score,
    support: (model) => model.confidence?.agentic,
  },
  {
    label: "Speed",
    icon: <LightningIcon />,
    score: (model) => model.scores.speed_score,
    support: (model) => model.confidence?.speed,
  },
  {
    label: "Value",
    icon: <DollarIcon />,
    score: (model) => model.scores.value_score,
    support: (model) => model.confidence?.value,
  },
];
// Labels follow the leaderboard's column headers, so a sheet reads against the table it was opened from; directions follow its sort arrows, and fewer tokens are not plainly better.
// The exported card's benchmark lists take this many columns, for one model and for a comparison.
const CARD_COLUMNS = 3;
const COMPARE_CARD_COLUMNS = 2;

const RESOURCE_RATIOS = [
  { kind: "cost", label: "Cost×", direction: "ascending" },
  { kind: "time", label: "Time×", direction: "ascending" },
  { kind: "tokens", label: "Tokens×", direction: null },
] as const;
const PRICES: { label: string; value: (model: ModelAtlasModel) => number | null | undefined }[] = [
  { label: "Blended", value: (model) => model.cost?.blended_price },
  { label: "Input", value: (model) => model.cost?.weighted_input },
  { label: "Output", value: (model) => model.cost?.weighted_output },
];
const BENCHMARK_GROUPS = [
  { key: "indexes", label: "Indexes" },
  { key: "frontier", label: "Frontier" },
  { key: "baseline", label: "Baseline" },
] as const;

/**
 * Render the sheet named by the URL over the dashboard, measuring each model against the same display population as the leaderboard: collapsed models for a model, every reasoning variant for a variant.
 *
 * The sheet is non-modal, so another row or star can switch it in place. Opening from elsewhere moves focus to its heading; closing returns focus to whatever opened it.
 * A pinned model takes the left column and the opened model the right, so choosing other models keeps comparing against the pin.
 */
export function ModelSheet({ payload }: { payload: ModelAtlasPayload | null }) {
  const [modelKey] = useUrlState("model");
  const [effort] = useUrlState("effort");
  const [compareKey] = useUrlState("compare");
  const [compareEffort] = useUrlState("compare-effort");
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = modelKey != null && payload != null;
  const { opened, pinned } = useSheetEntries(payload, modelKey, effort, compareKey, compareEffort);
  const target = modelKey == null ? null : `${modelKey}\u0000${effort ?? ""}`;
  const found = opened != null;

  // A model chosen outside the sheet takes focus into it and remembers the opener; choices inside the sheet keep their own focus.
  useLayoutEffect(() => {
    if (target == null || !found) return;
    sheetRef.current?.scrollTo({ top: 0 });
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheetRef.current?.contains(active)) return;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    headingRef.current?.focus({ preventScroll: true });
  }, [target, found]);

  // Closing by button, Escape, or Back unmounts the sheet; focus then returns to its opener.
  useLayoutEffect(() => {
    if (open) return;
    const opener = returnFocusRef.current;
    returnFocusRef.current = null;
    const active = document.activeElement;
    if (opener?.isConnected && (active == null || active === document.body)) {
      opener.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const typing =
        event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select") &&
        !sheetRef.current?.contains(event.target);
      if (typing || document.querySelector(":popover-open") != null) return;
      closeModelSheet();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  // A click elsewhere on the page hides the sheet but keeps a pinned model; Escape and the close button let it go.
  useEffect(() => {
    if (!open) return;
    const dismissOnClickElsewhere = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || sheetRef.current?.contains(event.target)) return;
      // Openers act anywhere along the click's path, the sky's on the window itself, so decide once the click has finished.
      window.setTimeout(() => {
        if (!modelSheetOpenedSince(event.timeStamp)) dismissModelSheet();
      });
    };
    document.addEventListener("click", dismissOnClickElsewhere);
    return () => document.removeEventListener("click", dismissOnClickElsewhere);
  }, [open]);

  if (!open) return null;
  if (opened == null) {
    return (
      <aside
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="false"
        aria-labelledby="model-sheet-title"
      >
        <header className={styles.head}>
          <div className={styles.headEntry}>
            <h2 id="model-sheet-title" ref={headingRef} tabIndex={-1} className={styles.name}>
              Model not found
            </h2>
            <div className={styles.actions}>
              <CloseButton />
            </div>
          </div>
        </header>
        <p className={styles.notice}>
          {modelKey}
          {effort == null ? "" : ` (${effort})`} is not in the current snapshot.
        </p>
      </aside>
    );
  }

  // A pin naming the opened model itself waits for another model before the sheet splits.
  const comparing = pinned != null && pinned.row !== opened.row;
  const entries = comparing ? [pinned, opened] : [opened];
  const captureTitle = entries.map(familyName).join(" vs ");
  // The image is a wide card for sharing, laid out in columns rather than the panel's single tall column.
  const capture = (
    <CaptureButton
      targetRef={sheetRef}
      title={captureTitle}
      kind="sheet"
      captureWidth={comparing ? WIDE_ARTIFACT_WIDTH : ARTIFACT_WIDTH}
    />
  );
  return (
    <aside
      ref={sheetRef}
      className={styles.sheet}
      data-compare={comparing || undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={
        comparing ? "model-sheet-pinned-title model-sheet-title" : "model-sheet-title"
      }
      style={{ "--sheet-entries": entries.length } as CSSProperties}
    >
      <header className={styles.head}>
        {comparing ? (
          <>
            {/* The Compare toggle holds the label column, which stays in the image without it; the other actions keep the single sheet's top-right corner, so each name keeps its column's full width. */}
            <div className={styles.compareControls}>
              <CompareToggle entry={opened} comparing />
            </div>
            <SheetIdentity entry={pinned} titleId="model-sheet-pinned-title" />
            <SheetIdentity entry={opened} titleId="model-sheet-title" headingRef={headingRef} />
            <div className={`${styles.actions} ${styles.compareActions}`} data-capture-exclude>
              {capture}
              <CopyDashboardLink />
              <CloseButton />
            </div>
          </>
        ) : (
          <SheetIdentity
            entry={opened}
            titleId="model-sheet-title"
            headingRef={headingRef}
            actions={
              <>
                <CompareToggle entry={opened} comparing={compareKey != null} />
                {capture}
                <CopyDashboardLink />
                <CloseButton />
              </>
            }
          />
        )}
        {/* The waiting comparison stays in the sticky head, so its search reads wherever the sheet is scrolled. */}
        {compareKey != null && !comparing ? (
          pinned == null ? (
            <p className={styles.pinNote} role="status" data-capture-exclude>
              {compareKey} is set to compare but is not in the current snapshot.
            </p>
          ) : (
            <CompareSearch pinned={pinned} models={payload.models} />
          )
        ) : null}
      </header>

      <div className={styles.body}>
        <Facts entries={entries} />
        <Scores entries={entries} />
        <Resources entries={entries} />
        <FrontierInset population={opened.rows} entries={entries} />
        {entries.some((entry) => entry.variants.length > 1) ? (
          <ReasoningEffort entries={entries} />
        ) : null}
        <BenchmarkEvidence entries={entries} />
        {!comparing && opened.row.model.latest_change ? (
          <LatestChange model={opened.row.model} change={opened.row.model.latest_change} />
        ) : null}
      </div>
    </aside>
  );
}

/** A model's catalogue identity: provider, the effort it shows, its name at the readout size, and its slug, with the sheet's actions beside a single model. */
function SheetIdentity({
  entry,
  titleId,
  headingRef,
  actions,
}: {
  entry: SheetEntry;
  titleId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  actions?: ReactNode;
}) {
  const model = entry.row.model;
  const view =
    entry.effort != null
      ? ` · ${entry.effort} effort`
      : entry.variants.length > 1
        ? " · Collapsed"
        : "";
  return (
    <div className={styles.headEntry}>
      <div className={styles.identity}>
        <ProviderLogo model={model} />
        <div>
          <p className={styles.kicker}>
            {providerDisplayName(model)}
            {view}
          </p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.name}>
            {familyName(entry)}
          </h2>
          {model.id ? <p className={styles.slug}>{model.id}</p> : null}
        </div>
      </div>
      {actions == null ? null : (
        <div className={styles.actions} data-capture-exclude>
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * A labelled toggle, lit by the selection star while on: turning it on keeps this model in the sheet so the next model opened from any row, star, or role appears beside it; turning it off returns to the opened model alone.
 */
function CompareToggle({ entry, comparing }: { entry: SheetEntry; comparing: boolean }) {
  const key = entry.row.model.id ?? entry.row.model.name;
  if (key == null) return null;
  return (
    <button
      type="button"
      className={`selection-choice ${styles.compareToggle}`}
      data-compare-toggle
      data-capture-exclude
      aria-pressed={comparing}
      title={comparing ? "Stop comparing" : "Keep this model here and open another to compare"}
      onClick={() => (comparing ? unpinModelSheet() : pinModelSheet(key, entry.effort))}
    >
      <Columns2 aria-hidden="true" />
      Compare
    </button>
  );
}

function CloseButton() {
  return (
    <button
      type="button"
      className={captureStyles.actionButton}
      aria-label="Close model sheet"
      title="Close"
      onClick={closeModelSheet}
    >
      <X aria-hidden="true" />
    </button>
  );
}

/** One fact per row in a comparison, or the label above its value on a single sheet. */
function Fact({
  label,
  values,
  comparisons,
}: {
  label: string;
  values: ReactNode[];
  comparisons?: Comparison[];
}) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
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

/**
 * A measured cell's value, with its lead spoken to screen readers and, in a comparison, its margin column.
 * The margin column is always drawn in a comparison, empty for the trailing value, so each cell keeps the same tracks and values stay aligned.
 */
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

/** A compared value's margin over the other. */
function Delta({ comparison }: { comparison: Comparison }) {
  return <span className={styles.delta}>{comparison.delta}</span>;
}

/** The better value's lead, which the sheet otherwise shows only as ink and dimming, spoken to screen readers. */
function BetterNote({ lead }: { lead?: Lead }) {
  return lead === "better" ? <span className="visually-hidden"> (better)</span> : null;
}

/** The leaderboard's 0–100 score track with the model's provider star at `score`. */
function ScoreMeter({ score, color }: { score: number; color: string }) {
  return (
    <span
      className="score-meter"
      style={{ "--score": score, "--score-color": color } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/** The leaderboard's median-relative bar for a positive ratio, in the model's provider colour. */
function RatioTrack({ ratio, color }: { ratio: number; color: string }) {
  return (
    <span
      className="ratio-track"
      style={{ ...ratioTrackStyle(ratio), "--row-provider": color } as CSSProperties}
      aria-hidden="true"
    />
  );
}

function Facts({ entries }: { entries: readonly SheetEntry[] }) {
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

/** Score rows mirror the leaderboard cell: the number carries the row and the provider star sits on its 0–100 track, ranked within each model's own population. */
function Scores({ entries }: { entries: readonly SheetEntry[] }) {
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
        {SCORES.map(({ label, icon, score, support }) => {
          const values = entries.map((entry) => finiteScore(score(entry.row.model)));
          const comparisons = compareValues(
            values,
            values.map(formatScore),
            "descending",
            "points",
          );
          return (
            <li key={label} className={styles.score}>
              <span className={styles.scoreLabel}>
                {icon}
                <span>{label}</span>
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

function Resources({ entries }: { entries: readonly SheetEntry[] }) {
  const models = entries.map((entry) => entry.row.model);
  const comparing = entries.length > 1;
  return (
    <section className={styles.section} aria-labelledby="model-sheet-resources">
      <h3 id="model-sheet-resources">
        Resources <small>1× is the benchmark median</small>
      </h3>
      <ul className={styles.ratios}>
        {RESOURCE_RATIOS.map(({ kind, label, direction }) => {
          const ratios = entries.map((entry) => entry.row.resourceRatios?.[kind]?.ratio);
          const comparisons = compareValues(
            ratios,
            ratios.map(formatResourceRatio),
            direction,
            "proportion",
          );
          return (
            <li key={kind}>
              <span>{label}</span>
              {entries.map((entry, index) => {
                const summary = entry.row.resourceRatios?.[kind];
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
                    {ratio != null && Number.isFinite(ratio) && ratio > 0 ? (
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
            {PRICES.map(({ label, value }) => {
              const prices = models.map(value);
              const texts = prices.map(formatCost);
              return (
                <Fact
                  key={label}
                  label={label}
                  values={texts}
                  comparisons={compareValues(prices, texts, "ascending", "proportion")}
                />
              );
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

function ModalityIcons({ inputs }: { inputs: string[] | undefined }) {
  const available = new Set((inputs ?? []).map((input) => input.toLowerCase()));
  const label = inputModalities
    .filter(({ key }) => available.has(key))
    .map(({ label }) => label)
    .join(", ");
  return (
    <span className="modality-icons">
      <span className="visually-hidden">{label || "none"}</span>
      {inputModalities.map(({ Icon, key, label }) => (
        <span
          key={key}
          className={`modality-icon ${available.has(key) ? "" : "unavailable"}`}
          title={`${label} input is ${available.has(key) ? "available" : "unavailable"}`}
          aria-hidden="true"
        >
          <Icon />
        </span>
      ))}
    </span>
  );
}

type BenchmarkResult = { value: number; text: string; meter: number | null; ratio: number | null };

/**
 * Benchmark results in the table's evidence groups, each with the table's meter across the observed range.
 * A comparison lists every benchmark either model measured, so each row holds both results or a dash.
 */
function BenchmarkEvidence({ entries }: { entries: readonly SheetEntry[] }) {
  const comparing = entries.length > 1;
  const groups = BENCHMARK_GROUPS.map(({ key, label }) => {
    const columns = benchmarkMetricColumns.filter(
      (column) => benchmarkEvidenceGroup(column.benchmark) === key,
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
    return { key, label, rows, counts, total: columns.length };
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
    ratio: ratio != null && Number.isFinite(ratio) && ratio > 0 ? ratio : null,
  };
}

/** The leaderboard's latest material score event, named by the score it moved. */
function LatestChange({
  model,
  change,
}: {
  model: ModelAtlasModel;
  change: NonNullable<ModelAtlasModel["latest_change"]>;
}) {
  const event = scoreChangeTooltip(model);
  return (
    <section className={styles.section} aria-labelledby="model-sheet-change">
      <h3 id="model-sheet-change">
        Latest change <small>{scoreDimensionLabel(change.dimension)}</small>
      </h3>
      <p className={styles.note}>{event.body}</p>
      {event.rows?.length ? (
        <dl className={styles.changeRows}>
          {event.rows.map(([label, value], index) => (
            <Fact key={`${label}-${index}`} label={label} values={[value]} />
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * In a comparison, mark the better of two values in its row's direction and give it its margin, so each column's wins and their size read at a glance.
 * Values that read the same at their displayed precision, missing values, rows without a plain direction, and single sheets mark nothing.
 */
function compareValues(
  values: readonly unknown[],
  texts: readonly string[],
  direction: Direction | null,
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
function proportion(better: number, worse: number, direction: Direction): string | undefined {
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
