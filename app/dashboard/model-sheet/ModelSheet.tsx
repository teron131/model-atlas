"use client";

/** The model sheet: one model's complete catalogue entry, opened from any leaderboard row, chart star, or frontier role and shared by URL. */

import { X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import {
  canonicalModelKey,
  reasoningEffortRank,
} from "../../../src/model-atlas/identity/normalization";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { CopyDashboardLink } from "../CopyDashboardLink";
import { benchmarkLabels } from "../shared/constants";
import { BotIcon, BrainIcon, DollarIcon, LightningIcon } from "../shared/DashboardIcons";
import { modelName, modelsForVariantDisplay } from "../shared/model-display";
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
  leaderboardRows,
  resourceRatioReferenceSets,
  speedMetricColumns,
  type TableRow,
} from "../table/models";
import { inputModalities } from "../table/Rows";
import { scoreChangeTooltip, scoreDimensionLabel } from "../table/tooltips";
import { replaceDashboardUrl, useUrlState } from "../use-url-state";
import { closeModelSheet, isModelSheetModel } from "./open";

import captureStyles from "../capture/capture.module.css";
import styles from "./model-sheet.module.css";

type ScoreGetter = (model: ModelAtlasModel) => number | null | undefined;

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
// Labels follow the leaderboard's column headers, so a sheet reads against the table it was opened from.
const RESOURCE_RATIOS = [
  { kind: "cost", label: "Cost ×" },
  { kind: "time", label: "Time ×" },
  { kind: "tokens", label: "Tokens ×" },
] as const;
const PRICES: { label: string; text: (model: ModelAtlasModel) => string }[] = [
  { label: "Blended", text: (model) => formatCost(model.cost?.blended_price) },
  { label: "Input", text: (model) => formatCost(model.cost?.weighted_input) },
  { label: "Output", text: (model) => formatCost(model.cost?.weighted_output) },
];
const BENCHMARK_GROUPS = [
  { key: "frontier", label: "Frontier" },
  { key: "indexes", label: "Indexes" },
  { key: "baseline", label: "Baseline" },
] as const;
const COLLAPSED_TITLE =
  "The leaderboard's collapsed row: the strongest variant, with other efforts' direct results filling its gaps";

/**
 * Render the sheet named by the URL over the dashboard, measuring the model against the same display population as the leaderboard: collapsed models for a model, every reasoning variant for a variant.
 *
 * The sheet is non-modal, so another row or star can switch it in place. Opening from elsewhere moves focus to its heading; closing returns focus to whatever opened it.
 */
export function ModelSheet({ payload }: { payload: ModelAtlasPayload | null }) {
  const [modelKey] = useUrlState("model");
  const [effort] = useUrlState("effort");
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = modelKey != null && payload != null;
  const variantView = effort != null;

  const referenceSets = useMemo(
    () => (open && payload != null ? resourceRatioReferenceSets(payload) : []),
    [open, payload],
  );
  const rows = useMemo(
    () => (open && payload != null ? leaderboardRows(payload, variantView, referenceSets) : []),
    [open, payload, variantView, referenceSets],
  );
  const row = useMemo(
    () =>
      modelKey == null
        ? undefined
        : rows.find((candidate) => isModelSheetModel(candidate.model, modelKey, effort)),
    [rows, modelKey, effort],
  );
  const family = row == null ? null : canonicalModelKey(row.model);
  const variants = useMemo(
    () =>
      payload == null || family == null
        ? []
        : modelsForVariantDisplay(payload.models, true, payload.benchmark_observations)
            .filter(
              (model) => canonicalModelKey(model) === family && model.reasoning_effort != null,
            )
            .sort(
              (left, right) =>
                reasoningEffortRank(left.reasoning_effort) -
                reasoningEffortRank(right.reasoning_effort),
            ),
    [payload, family],
  );
  const target = modelKey == null ? null : `${modelKey}\u0000${effort ?? ""}`;
  const found = row != null;

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

  if (!open) return null;
  if (row == null) {
    return (
      <aside
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="false"
        aria-labelledby="model-sheet-title"
      >
        <header className={styles.head}>
          <h2 id="model-sheet-title" ref={headingRef} tabIndex={-1} className={styles.name}>
            Model not found
          </h2>
          <div className={styles.actions}>
            <CloseButton />
          </div>
        </header>
        <p className={styles.notice}>
          {modelKey}
          {effort == null ? "" : ` (${effort})`} is not in the current snapshot.
        </p>
      </aside>
    );
  }

  const model = row.model;
  const color = providerBrandColor(model.provider);
  const population = `${rows.length} ${variantView ? "reasoning variants" : "models"}`;
  return (
    <aside
      ref={sheetRef}
      className={styles.sheet}
      role="dialog"
      aria-modal="false"
      aria-labelledby="model-sheet-title"
      style={{ "--score-color": color, "--row-provider": color } as CSSProperties}
    >
      <header className={styles.head}>
        <div className={styles.identity}>
          <ProviderLogo model={model} />
          <div>
            <p className={styles.kicker}>
              {providerDisplayName(model)}
              {variantView ? ` · ${effort} effort` : variants.length > 1 ? " · Collapsed" : ""}
            </p>
            <h2 id="model-sheet-title" ref={headingRef} tabIndex={-1} className={styles.name}>
              {modelName({ ...model, reasoning_effort: null })}
            </h2>
            {model.id ? <p className={styles.slug}>{model.id}</p> : null}
          </div>
        </div>
        <div className={styles.actions}>
          <CopyDashboardLink />
          <CloseButton />
        </div>
      </header>

      <div className={styles.body}>
        <dl className={styles.facts}>
          <Fact label="Released">{model.release_date?.slice(0, 10) ?? "-"}</Fact>
          <Fact label="Context">{formatContext(contextWindowValue(model))}</Fact>
          <Fact label="Open weights">
            {model.open_weights == null ? "-" : model.open_weights ? "Yes" : "No"}
          </Fact>
          <Fact label="Input">
            <ModalityIcons inputs={model.modalities?.input} />
          </Fact>
        </dl>

        <section className={styles.section} aria-labelledby="model-sheet-scores">
          <h3 id="model-sheet-scores">
            Scores <small>Rank among {population}</small>
          </h3>
          <div className={styles.scoreHead} aria-hidden="true">
            <span>Rank</span>
            <span>Support</span>
          </div>
          <ul className={styles.scores}>
            {SCORES.map(({ label, icon, score, support }) => {
              const value = finiteScore(score(model));
              const rank = scoreRank(rows, value, score);
              return (
                <li
                  key={label}
                  className={styles.score}
                  style={value == null ? undefined : ({ "--score": value } as CSSProperties)}
                >
                  <span className={styles.scoreLabel}>
                    {icon}
                    {label}
                  </span>
                  <strong className={styles.scoreValue}>{formatScore(value)}</strong>
                  {value == null ? <span /> : <span className="score-meter" aria-hidden="true" />}
                  <span className={styles.rank}>
                    {rank == null ? "-" : `#${rank.rank}`}
                    {rank == null ? null : (
                      <span className="visually-hidden"> of {rank.total}</span>
                    )}
                  </span>
                  <span className={styles.support}>{formatConfidence(support(model))}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="model-sheet-resources">
          <h3 id="model-sheet-resources">
            Resources <small>1× is the benchmark median</small>
          </h3>
          <ul className={styles.ratios}>
            {RESOURCE_RATIOS.map(({ kind, label }) => {
              const summary = row.resourceRatios?.[kind];
              const ratio = summary?.ratio;
              const measured = ratio != null && Number.isFinite(ratio) && ratio > 0;
              return (
                <li
                  key={kind}
                  title={
                    summary == null
                      ? undefined
                      : `${summary.benchmarkCount} measured benchmarks · ${summary.sourceCount} source measurements`
                  }
                >
                  <span>{label}</span>
                  <strong>{formatResourceRatio(ratio)}</strong>
                  {measured ? (
                    <span
                      className="ratio-track"
                      style={ratioTrackStyle(ratio)}
                      aria-hidden="true"
                    />
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
          <div className={styles.amounts}>
            <div>
              <h4 className={styles.amountsTitle}>Price per million tokens</h4>
              <dl>
                {PRICES.map(({ label, text }) => (
                  <Fact key={label} label={label}>
                    {text(model)}
                  </Fact>
                ))}
              </dl>
            </div>
            <div>
              <h4 className={styles.amountsTitle}>Speed</h4>
              <dl>
                {speedMetricColumns.map((column) => (
                  <Fact key={column.key} label={column.label}>
                    {formatDashboardMetric(dashboardMetricValue(model, column), column)}
                  </Fact>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {variants.length > 1 ? (
          <section className={styles.section} aria-labelledby="model-sheet-efforts">
            <h3 id="model-sheet-efforts">
              Reasoning effort <small>Intelligence</small>
            </h3>
            <div className={styles.efforts} role="group" aria-label="Reasoning effort">
              <button
                type="button"
                className="selection-choice"
                aria-pressed={effort == null}
                title={COLLAPSED_TITLE}
                onClick={() => replaceDashboardUrl({ effort: null })}
              >
                Collapsed
              </button>
              {variants.map((variant) => (
                <button
                  key={variant.reasoning_effort}
                  type="button"
                  className="selection-choice"
                  aria-pressed={variant.reasoning_effort === effort}
                  onClick={() => replaceDashboardUrl({ effort: variant.reasoning_effort })}
                >
                  {variant.reasoning_effort}
                  <b>{formatScore(variant.scores.intelligence_score)}</b>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <BenchmarkEvidence row={row} />

        {model.latest_change ? <LatestChange model={model} change={model.latest_change} /> : null}
      </div>
    </aside>
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
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

/** Benchmark results in the table's evidence groups, each with the table's meter across the observed range. */
function BenchmarkEvidence({ row }: { row: TableRow }) {
  const groups = BENCHMARK_GROUPS.map(({ key, label }) => {
    const columns = benchmarkMetricColumns.filter(
      (column) => benchmarkEvidenceGroup(column.benchmark) === key,
    );
    const results = columns.flatMap((column) => {
      const value = benchmarkDisplayValue(row, column);
      if (typeof value !== "number" || !Number.isFinite(value)) return [];
      return [
        {
          key: column.key,
          label: benchmarkLabels[column.benchmark] ?? column.label,
          text: formatDashboardMetric(value, column),
          meter: benchmarkMeterValue(row, column),
        },
      ];
    });
    return { key, label, results, total: columns.length };
  }).filter((group) => group.total > 0);
  return (
    <section className={styles.section} aria-labelledby="model-sheet-benchmarks">
      <h3 id="model-sheet-benchmarks">Benchmarks</h3>
      {groups.map((group) => (
        <div key={group.key} className={styles.benchmarkGroup}>
          <h4>
            {group.label}
            <small>
              {group.results.length} of {group.total} measured
            </small>
          </h4>
          {group.results.length ? (
            <ul className={styles.benchmarks}>
              {group.results.map((result) => (
                <li
                  key={result.key}
                  style={
                    result.meter == null
                      ? undefined
                      : ({ "--score": result.meter } as CSSProperties)
                  }
                >
                  <span className={styles.benchmarkName} title={result.label}>
                    {result.label}
                  </span>
                  <strong>{result.text}</strong>
                  {result.meter == null ? (
                    <span />
                  ) : (
                    <span className="score-meter" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
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
            <Fact key={`${label}-${index}`} label={label}>
              {value}
            </Fact>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function finiteScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Rank a score within the sheet's display population; ties share the higher rank, as on the leaderboard. */
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
