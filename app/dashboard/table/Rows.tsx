/** Leaderboard row rendering applies model display, cell formatting, and interaction rules. */

import {
  type CSSProperties,
  memo,
  type MouseEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { communityPlaceLabel } from "../../../src/model-atlas/community/catalog";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { openModelSheet } from "../model-sheet/open";
import {
  AudioInputIcon,
  ImageInputIcon,
  TextInputIcon,
  VideoInputIcon,
} from "../shared/DashboardIcons";
import { modelName } from "../shared/model-display";
import { providerBrandColor } from "../shared/provider-theme";
import { ProviderLogo } from "../shared/ProviderLogo";
import {
  formatResourceRatio,
  isDrawableRatio,
  ratioTrackStyle,
} from "../shared/resource-ratio-display";
import { resourceRatioColumns, scoreColumnsByDimension, scoreMetricColumns } from "./Columns";
import {
  formatConfidence,
  formatContext,
  formatCost,
  formatDashboardMetric,
  formatScore,
} from "./format";
import {
  benchmarkDisplayValue,
  benchmarkMeterValue,
  contextWindowValue,
  type DashboardMetricColumn,
  dashboardMetricColumns,
  dashboardMetricValue,
  isAmountColumn,
  speedMetricColumns,
  type TableColumnKey,
  type TableRow,
} from "./models";

const HIDDEN_MODEL_DISPLAY_TOKENS = new Set(["instruct", "preview"]);
// Every row leads with its rank and model cells, whichever columns are shown.
const IDENTITY_COLUMN_COUNT = 2;
const NO_COLUMN_KEYS: ReadonlySet<TableColumnKey> = new Set();
const LOADING_ROW_KEYS = [
  "loading-row-01",
  "loading-row-02",
  "loading-row-03",
  "loading-row-04",
  "loading-row-05",
  "loading-row-06",
  "loading-row-07",
  "loading-row-08",
  "loading-row-09",
  "loading-row-10",
  "loading-row-11",
  "loading-row-12",
] as const;
const inputModalities = [
  { key: "text", label: "text", Icon: TextInputIcon },
  { key: "image", label: "image", Icon: ImageInputIcon },
  { key: "audio", label: "audio", Icon: AudioInputIcon },
  { key: "video", label: "video", Icon: VideoInputIcon },
] as const;

export type ScoreChangeHandler = (
  event: MouseEvent<HTMLButtonElement>,
  model: ModelAtlasModel,
) => void;

export function EmptyStateRow({ message, columnCount }: { message: string; columnCount: number }) {
  return (
    <tr>
      <td className="empty" colSpan={columnCount}>
        {message}
      </td>
    </tr>
  );
}

export function LoadingRows({
  columnKeys,
  ruledColumnKeySet,
}: {
  columnKeys: readonly TableColumnKey[];
  ruledColumnKeySet: ReadonlySet<TableColumnKey>;
}) {
  return (
    <>
      {LOADING_ROW_KEYS.map((key, index) => (
        <LoadingRow
          key={key}
          index={index}
          columnKeys={columnKeys}
          ruledColumnKeySet={ruledColumnKeySet}
        />
      ))}
    </>
  );
}

function LoadingRow({
  index,
  columnKeys,
  ruledColumnKeySet,
}: {
  index: number;
  columnKeys: readonly TableColumnKey[];
  ruledColumnKeySet: ReadonlySet<TableColumnKey>;
}) {
  return (
    <tr className="loading-row" style={{ "--loading-row-index": index } as CSSProperties}>
      <td className="rank">
        <span className="loading-block loading-rank" />
      </td>
      <td className="model-column">
        <div className="model-cell loading-model-cell">
          <span className="provider-logo loading-logo" />
          <div className="model-copy loading-model-copy">
            <span className="loading-block loading-model-name" />
            <span className="loading-block loading-model-id" />
          </div>
        </div>
      </td>
      {columnKeys.slice(2).map((key) => (
        <td className={tableCellClassName(key, ruledColumnKeySet)} key={`loading-${key}`}>
          <span className="loading-block loading-metric" />
        </td>
      ))}
    </tr>
  );
}

/**
 * A `detailed` row draws every visible column, and so does a row holding keyboard focus, so a focused control is never removed by scrolling.
 * Otherwise the row keeps its rank and model, so it holds its height, stays findable by name, and still opens its model sheet, and leaves the remaining columns as one empty cell until it scrolls near the table's viewport.
 */
export const ModelRow = memo(function ModelRow({
  rowData,
  visibleColumnKeySet,
  ruledColumnKeySet,
  scoreStrip,
  sheetOpen,
  detailed,
  onScoreChange,
}: {
  rowData: TableRow;
  visibleColumnKeySet: ReadonlySet<TableColumnKey>;
  ruledColumnKeySet: ReadonlySet<TableColumnKey>;
  scoreStrip: boolean;
  sheetOpen: boolean;
  detailed: boolean;
  onScoreChange: ScoreChangeHandler;
}) {
  const model = rowData.model;
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [focusWithin, setFocusWithin] = useState(false);
  const drawsEveryColumn = detailed || focusWithin;
  // A focused control that an update removes fires no blur, so the flag is checked against the document after each render.
  useLayoutEffect(() => {
    if (focusWithin && !rowRef.current?.contains(document.activeElement)) setFocusWithin(false);
  });
  const pendingColumnCount = visibleColumnKeySet.size - IDENTITY_COLUMN_COUNT;
  return (
    <tr
      ref={rowRef}
      className="model-row"
      data-sheet-open={sheetOpen || undefined}
      style={rowProviderStyle(model.provider)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
      onClick={(event) => {
        // The name button and other controls handle their own clicks, and a drag that selects text is not a request to open.
        if (
          (event.target instanceof Element && event.target.closest("button, a, input, label")) ||
          window.getSelection()?.isCollapsed === false
        ) {
          return;
        }
        openModelSheet(model);
      }}
    >
      <ModelScoreCells
        rowData={rowData}
        visibleColumnKeySet={drawsEveryColumn ? visibleColumnKeySet : NO_COLUMN_KEYS}
        ruledColumnKeySet={ruledColumnKeySet}
        opensSheet
        scoreStrip={scoreStrip}
      />
      {drawsEveryColumn ? (
        <>
          {resourceRatioColumns
            .filter((column) => visibleColumnKeySet.has(column.key))
            .map((column) => {
              const summary = rowData.resourceRatios[column.kind];
              return (
                <RatioCell
                  key={column.key}
                  ratio={summary?.ratio}
                  className={tableCellClassName(column.key, ruledColumnKeySet)}
                  title={
                    summary == null
                      ? undefined
                      : `${summary.benchmarkCount} measured benchmarks · ${summary.sourceCount} source measurements`
                  }
                />
              );
            })}
          {visibleColumnKeySet.has("blend") ? (
            <AmountCell
              rowData={rowData}
              columnKey="blend"
              text={formatCost(model.cost?.blended_price)}
              className={tableCellClassName("blend", ruledColumnKeySet)}
            />
          ) : null}
          {speedMetricColumns
            .filter((column) => visibleColumnKeySet.has(column.key))
            .map((column) => (
              <DashboardMetricCell
                key={column.key}
                rowData={rowData}
                column={column}
                hasRuleAfter={ruledColumnKeySet.has(column.key)}
              />
            ))}
          {visibleColumnKeySet.has("context") ? (
            <AmountCell
              rowData={rowData}
              columnKey="context"
              text={formatContext(contextWindowValue(model))}
              className={tableCellClassName("context", ruledColumnKeySet)}
            />
          ) : null}
          {dashboardMetricColumns
            .filter((column) => visibleColumnKeySet.has(column.key))
            .map((column) => (
              <DashboardMetricCell
                key={column.key}
                rowData={rowData}
                column={column}
                hasRuleAfter={ruledColumnKeySet.has(column.key)}
              />
            ))}
          {visibleColumnKeySet.has("confidence") ? <ConfidenceCell model={model} /> : null}
          {visibleColumnKeySet.has("change") ? (
            <ScoreChangeCell model={model} onScoreChange={onScoreChange} />
          ) : null}
        </>
      ) : pendingColumnCount > 0 ? (
        <td colSpan={pendingColumnCount} />
      ) : null}
    </tr>
  );
});

/** Render the leaderboard identity and four score columns used by PNG exports. */
export function ScoreModelRow({ rowData }: { rowData: TableRow }) {
  return (
    <tr style={rowProviderStyle(rowData.model.provider)}>
      <ModelScoreCells rowData={rowData} />
    </tr>
  );
}

function rowProviderStyle(provider: string | null | undefined) {
  return { "--row-provider": providerBrandColor(provider) } as CSSProperties;
}

/** `opensSheet` makes the model name the keyboard path to the model sheet; exported rows stay plain text. `scoreStrip` sets the four scores under the name, for phones, where the caller leaves their columns out. */
function ModelScoreCells({
  rowData,
  visibleColumnKeySet,
  ruledColumnKeySet,
  opensSheet = false,
  scoreStrip = false,
}: {
  rowData: TableRow;
  visibleColumnKeySet?: ReadonlySet<TableColumnKey>;
  ruledColumnKeySet?: ReadonlySet<TableColumnKey>;
  opensSheet?: boolean;
  scoreStrip?: boolean;
}) {
  const model = rowData.model;
  const visibleName = visibleModelName(modelName(model));
  const visibleSlug = visibleModelSlug(model.id);
  return (
    <>
      <TableCell text={String(rowData.intelligenceRank).padStart(2, "0")} className="rank" />
      <td className="model-column">
        <div className="model-cell">
          <ProviderLogo model={model} />
          <div className="model-copy">
            <div className="model" title={model.name ?? undefined}>
              {opensSheet ? (
                <button
                  type="button"
                  className="model-sheet-trigger"
                  aria-haspopup="dialog"
                  onClick={() => openModelSheet(model)}
                >
                  {visibleName}
                </button>
              ) : (
                visibleName
              )}
            </div>
            <div className="id" title={model.id ?? undefined}>
              {visibleSlug}
            </div>
          </div>
          {scoreStrip ? <ScoreStrip model={model} /> : null}
        </div>
      </td>
      {scoreMetricColumns.map((column) =>
        visibleColumnKeySet == null || visibleColumnKeySet.has(column.key) ? (
          <ScoreCell
            key={column.key}
            score={column.score(model)}
            provider={model.provider}
            className={ruledColumnKeySet?.has(column.key) ? "column-group-end" : ""}
          />
        ) : null,
      )}
    </>
  );
}

const DashboardMetricCell = memo(function DashboardMetricCell({
  rowData,
  column,
  hasRuleAfter,
}: {
  rowData: TableRow;
  column: DashboardMetricColumn;
  hasRuleAfter: boolean;
}) {
  const model = rowData.model;
  if (column.group === "profile" && column.field === "modalities") {
    return <ModalityInputCell inputs={model.modalities?.input} hasRuleAfter={hasRuleAfter} />;
  }
  const value =
    "benchmark" in column
      ? benchmarkDisplayValue(rowData, column)
      : dashboardMetricValue(model, column);
  const className = `data-cell${hasRuleAfter ? " column-group-end" : ""}`;
  if (isAmountColumn(column)) {
    return (
      <AmountCell
        rowData={rowData}
        columnKey={column.key}
        text={formatDashboardMetric(value, column)}
        className={className}
      />
    );
  }
  if (column.group === "community") {
    const place = model.community_indexes?.[column.field];
    if (place == null) return <TableCell text="-" className={`${className} benchmark-cell`} />;
    // A hidden meter keeps the shared cell geometry; places have no 0–100 score.
    return (
      <td className={`${className} benchmark-cell place-cell`}>
        <span className="score-value">{communityPlaceLabel(place)}</span>
        <span className="score-meter benchmark-meter" aria-hidden="true" />
      </td>
    );
  }
  if ("benchmark" in column) {
    return (
      <BenchmarkMetricCell
        meterPercent={benchmarkMeterValue(rowData, column)}
        text={formatDashboardMetric(value, column)}
        provider={model.provider}
        className={className}
      />
    );
  }
  return <TableCell text={formatDashboardMetric(value, column)} className={className} />;
}, metricCellPropsEqual);

function metricCellPropsEqual(
  left: { rowData: TableRow; column: DashboardMetricColumn; hasRuleAfter: boolean },
  right: { rowData: TableRow; column: DashboardMetricColumn; hasRuleAfter: boolean },
) {
  if (
    left.column !== right.column ||
    left.hasRuleAfter !== right.hasRuleAfter ||
    left.rowData.model.provider !== right.rowData.model.provider
  ) {
    return false;
  }
  return (
    metricCellValue(left.rowData, left.column) === metricCellValue(right.rowData, right.column) &&
    metricCellMeterValue(left.rowData, left.column) ===
      metricCellMeterValue(right.rowData, right.column)
  );
}

function tableCellClassName(
  key: TableColumnKey,
  ruledColumnKeySet: ReadonlySet<TableColumnKey>,
): string {
  return `data-cell${ruledColumnKeySet.has(key) ? " column-group-end" : ""}`;
}

function metricCellValue(rowData: TableRow, column: DashboardMetricColumn) {
  if (column.group === "community") {
    const place = rowData.model.community_indexes?.[column.field];
    return place == null ? null : communityPlaceLabel(place);
  }
  return "benchmark" in column
    ? benchmarkDisplayValue(rowData, column)
    : dashboardMetricValue(rowData.model, column);
}

function metricCellMeterValue(rowData: TableRow, column: DashboardMetricColumn) {
  if (isAmountColumn(column)) return rowData.metricRatios[column.key] ?? null;
  return "benchmark" in column ? benchmarkMeterValue(rowData, column) : null;
}

function BenchmarkMetricCell({
  meterPercent,
  text,
  provider,
  className,
}: {
  meterPercent: number | null;
  text: string;
  provider: string | null | undefined;
  className: string;
}) {
  if (meterPercent == null) {
    return <TableCell text={text} className={`${className} benchmark-cell`} />;
  }
  const displayColor = providerBrandColor(provider);
  const style = {
    "--score": String(Math.max(0, Math.min(100, meterPercent))),
    "--score-color": displayColor,
  } as CSSProperties;
  return (
    <td className={`${className} benchmark-cell`} style={style}>
      <span className="score-value">{text}</span>
      <span className="score-meter benchmark-meter" />
    </td>
  );
}

function ModalityInputCell({
  inputs,
  hasRuleAfter,
}: {
  inputs: string[] | undefined;
  hasRuleAfter: boolean;
}) {
  return (
    <td className={`data-cell modality-cell${hasRuleAfter ? " column-group-end" : ""}`}>
      <ModalityIcons inputs={inputs} prefix="Input modalities: " />
    </td>
  );
}

/** The input modalities as one mark each, dimmed where the model lacks it, read aloud as `prefix` and the available list. */
export function ModalityIcons({
  inputs,
  prefix = "",
}: {
  inputs: string[] | undefined;
  prefix?: string;
}) {
  const available = new Set((inputs ?? []).map((input) => input.toLowerCase()));
  const label = `${prefix}${
    inputModalities
      .filter(({ key }) => available.has(key))
      .map(({ label }) => label)
      .join(", ") || "none"
  }`;
  return (
    <span className="modality-icons" title={label}>
      <span className="visually-hidden">{label}</span>
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

const ConfidenceCell = memo(function ConfidenceCell({ model }: { model: ModelAtlasModel }) {
  const supports = scoreMetricColumns.map((column) => ({
    column,
    text: formatConfidence(column.support(model)),
  }));
  return (
    <td
      aria-label={supports
        .map(({ column, text }) => `${column.name} evidence support ${text}`)
        .join("; ")}
      className={`data-cell confidence-cell${supports.every(({ text }) => text === "-") ? " missing" : ""}`}
    >
      <span aria-hidden="true" className="confidence-values">
        {supports.map(({ column, text }) => (
          <span key={column.key}>
            <span className="confidence-dimension">{column.name.charAt(0)}</span>
            {text}
          </span>
        ))}
      </span>
    </td>
  );
});

const ScoreChangeCell = memo(function ScoreChangeCell({
  model,
  onScoreChange,
}: {
  model: ModelAtlasModel;
  onScoreChange: ScoreChangeHandler;
}) {
  const change = model.latest_change;
  if (change == null) {
    return <td className="data-cell change-cell missing">—</td>;
  }
  const direction =
    change.score_delta == null
      ? "new"
      : change.score_delta > 0
        ? "up"
        : change.score_delta < 0
          ? "down"
          : "rank";
  return (
    <td className="data-cell change-cell">
      <button
        aria-haspopup="dialog"
        aria-label={`${scoreColumnsByDimension[change.dimension].name} change: ${scoreChangeButtonText(change)}`}
        className="score-change-button"
        data-direction={direction}
        onClick={(event) => onScoreChange(event, model)}
        type="button"
      >
        {scoreChangeButtonText(change)}
      </button>
    </td>
  );
});

function scoreChangeButtonText(change: NonNullable<ModelAtlasModel["latest_change"]>): string {
  const prefix = scoreColumnsByDimension[change.dimension].name.slice(0, 1);
  if (change.score_delta == null) {
    return change.rank_after === 1 ? `${prefix} New #1` : `${prefix} New`;
  }
  if (change.score_delta !== 0) {
    return `${prefix} ${change.score_delta > 0 ? "+" : "−"}${Math.abs(change.score_delta).toFixed(1)}`;
  }
  if (
    change.rank_before != null &&
    change.rank_after != null &&
    change.rank_before !== change.rank_after
  ) {
    return `${prefix} #${change.rank_before}→#${change.rank_after}`;
  }
  if (
    change.confidence_before != null &&
    change.confidence_after != null &&
    change.confidence_before !== change.confidence_after
  ) {
    return `${prefix} support`;
  }
  return `${prefix} changed`;
}

function visibleModelName(name: string | null | undefined) {
  if (name == null || name.length === 0) {
    return "-";
  }
  return stripModelDisplayTokens(name, " ");
}

function visibleModelSlug(id: string | null | undefined) {
  if (id == null || id.length === 0) {
    return "-";
  }
  const slashIndex = id.indexOf("/");
  return stripModelDisplayTokens(slashIndex === -1 ? id : id.slice(slashIndex + 1), "-");
}

function stripModelDisplayTokens(value: string, separator: " " | "-") {
  const tokens = value.split(separator).filter((token) => token.length > 0);
  const visibleTokens = tokens.filter((token) => !isHiddenDisplayToken(token));
  return visibleTokens.join(separator) || value;
}

function isHiddenDisplayToken(token: string) {
  return HIDDEN_MODEL_DISPLAY_TOKENS.has(token.toLowerCase());
}

function TableCell({
  text,
  className,
  title,
}: {
  text: string;
  className?: string;
  title?: string;
}) {
  const missingClass = text === "-" ? " missing" : "";
  return (
    <td className={`${className ?? ""}${missingClass}`.trim()} title={title}>
      {text}
    </td>
  );
}

function AmountCell({
  rowData,
  columnKey,
  text,
  className,
}: {
  rowData: TableRow;
  columnKey: TableColumnKey;
  text: string;
  className: string;
}) {
  const ratio = rowData.metricRatios[columnKey];
  return (
    <RatioCell
      ratio={ratio}
      text={text}
      className={className}
      title={ratio == null ? undefined : `${formatResourceRatio(ratio)} the column median`}
    />
  );
}

/** Draw a median-relative bar beneath its readout, the ratio itself or a measured amount, on a fixed doubling scale; the exact ratio stays in the number or the hover. */
function RatioCell({
  ratio,
  text = formatResourceRatio(ratio),
  className,
  title,
}: {
  ratio: number | null | undefined;
  text?: string;
  className: string;
  title?: string;
}) {
  // An unmeasured cell reserves its bar's width, so the column is as wide whichever rows are drawn in full.
  const cellClassName = `${className} ratio-cell`;
  if (!isDrawableRatio(ratio)) {
    return <TableCell text={text} className={cellClassName} title={title} />;
  }
  return (
    <td className={cellClassName} title={title}>
      {text}
      <RatioTrack ratio={ratio} />
    </td>
  );
}

/** The median-relative bar for a drawable ratio, in the row's provider colour unless `color` gives one. */
export function RatioTrack({ ratio, color }: { ratio: number; color?: string }) {
  return (
    <span
      className="ratio-track"
      style={
        color == null
          ? ratioTrackStyle(ratio)
          : ({ ...ratioTrackStyle(ratio), "--row-provider": color } as CSSProperties)
      }
      aria-hidden="true"
    />
  );
}

/** The 0–100 score track with the provider star at `score`, drawn in `color`. */
export function ScoreMeter({ score, color }: { score: number; color: string | undefined }) {
  return <span className="score-meter" style={scoreMeterStyle(score, color)} aria-hidden="true" />;
}

function ScoreStrip({ model }: { model: ModelAtlasModel }) {
  const color = providerBrandColor(model.provider);
  return (
    <span className="score-strip">
      {scoreMetricColumns.map((column) => {
        const value = column.score(model);
        const score = typeof value === "number" && Number.isFinite(value) ? value : null;
        return (
          <span
            key={column.key}
            className="score-strip-item"
            style={score == null ? undefined : scoreMeterStyle(score, color)}
          >
            <span className="visually-hidden">{column.name} </span>
            <span className="score-value">{formatScore(score)}</span>
            {score == null ? null : <span className="score-meter" aria-hidden="true" />}
          </span>
        );
      })}
    </span>
  );
}

/** Keep the marker on the same 0–100 scale as its displayed score, independent of table filters. */
function ScoreCell({
  score: value,
  provider,
  className,
}: {
  score: number | null;
  provider: string | null | undefined;
  className: string;
}) {
  const score = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (score == null) {
    return <TableCell text={formatScore(score)} className={`score-cell ${className}`.trim()} />;
  }
  return (
    <td
      className={`score-cell ${className}`.trim()}
      style={scoreMeterStyle(score, providerBrandColor(provider))}
    >
      <span className="score-value">{formatScore(score)}</span>
      <span className="score-meter" />
    </td>
  );
}

function scoreMeterStyle(score: number, color: string | undefined) {
  return {
    "--score": String(Math.max(0, Math.min(100, score))),
    "--score-color": color,
  } as CSSProperties;
}
