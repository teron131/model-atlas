/** Leaderboard row rendering applies model display, cell formatting, and interaction rules. */

import { type CSSProperties, memo, type MouseEvent, useState } from "react";

import {
  isPreviewModel,
  type ModelAtlasModel,
  type ModelAtlasPublishedModel,
} from "../../../src/model-atlas/stats/types";
import {
  AudioInputIcon,
  ImageInputIcon,
  TextInputIcon,
  VideoInputIcon,
} from "../shared/DashboardIcons";
import { modelDisplayName } from "../shared/model-display";
import { providerBrandColor, providerLogo } from "../shared/provider-theme";
import {
  benchmarkPercentValue,
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
  dashboardMetricValue,
  speedMetricColumns,
  type TableColumnKey,
  type TableRow,
} from "./models";
import { scoreDimensionLabel } from "./tooltips";

const HIDDEN_MODEL_DISPLAY_TOKENS = new Set(["instruct", "preview"]);
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

export const ModelRow = memo(function ModelRow({
  rowData,
  metricColumns,
  visibleColumnKeySet,
  ruledColumnKeySet,
  onScoreChange,
}: {
  rowData: TableRow;
  metricColumns: DashboardMetricColumn[];
  visibleColumnKeySet: ReadonlySet<TableColumnKey>;
  ruledColumnKeySet: ReadonlySet<TableColumnKey>;
  onScoreChange: ScoreChangeHandler;
}) {
  const model = rowData.model;
  return (
    <tr
      className={isPreviewModel(model) ? "preview-row" : undefined}
      style={rowProviderStyle(model.provider)}
      title={
        isPreviewModel(model)
          ? "Preview based on direct evidence: either a recent model with limited benchmark coverage or a benchmark-qualified model with incomplete metadata. Unsupported Speed and Value scores remain unavailable; PREVIEW replaces a numeric rank."
          : undefined
      }
    >
      <ModelScoreCells
        rowData={rowData}
        visibleColumnKeySet={visibleColumnKeySet}
        ruledColumnKeySet={ruledColumnKeySet}
      />
      {visibleColumnKeySet.has("blend") ? (
        <TableCell
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
        <TableCell
          text={formatContext(contextWindowValue(model))}
          className={tableCellClassName("context", ruledColumnKeySet)}
        />
      ) : null}
      {metricColumns
        .filter((column) => visibleColumnKeySet.has(column.key))
        .map((column) => (
          <DashboardMetricCell
            key={column.key}
            rowData={rowData}
            column={column}
            hasRuleAfter={ruledColumnKeySet.has(column.key)}
          />
        ))}
      {visibleColumnKeySet.has("confidence") ? (
        <ConfidenceCell confidence={model.confidence} />
      ) : null}
      {visibleColumnKeySet.has("change") ? (
        <ScoreChangeCell model={model} onScoreChange={onScoreChange} />
      ) : null}
    </tr>
  );
});

/** Render the leaderboard identity and four score columns used by PNG exports. */
export function ScoreModelRow({ rowData }: { rowData: TableRow }) {
  return (
    <tr
      className={isPreviewModel(rowData.model) ? "preview-row" : undefined}
      style={rowProviderStyle(rowData.model.provider)}
    >
      <ModelScoreCells rowData={rowData} />
    </tr>
  );
}

function rowProviderStyle(provider: string | null | undefined) {
  return { "--row-provider": providerBrandColor(provider) } as CSSProperties;
}

function ModelScoreCells({
  rowData,
  visibleColumnKeySet,
  ruledColumnKeySet,
}: {
  rowData: TableRow;
  visibleColumnKeySet?: ReadonlySet<TableColumnKey>;
  ruledColumnKeySet?: ReadonlySet<TableColumnKey>;
}) {
  const model = rowData.model;
  const visibleName = visibleModelName(modelDisplayName(model));
  const visibleSlug = visibleModelSlug(model.id);
  const scores = model.scores ?? {};
  return (
    <>
      <TableCell
        text={
          rowData.intelligenceRank === "preview"
            ? "PREVIEW"
            : String(rowData.intelligenceRank).padStart(2, "0")
        }
        className="rank"
      />
      <td className="model-column">
        <div className="model-cell">
          <ProviderLogo model={model} />
          <div className="model-copy">
            <div className="model" title={model.name ?? undefined}>
              {visibleName}
            </div>
            <div className="id" title={model.id ?? undefined}>
              {visibleSlug}
            </div>
          </div>
        </div>
      </td>
      {visibleColumnKeySet == null || visibleColumnKeySet.has("intelligence")
        ? scoreCell(
            scores.intelligence_score,
            model.provider,
            ruledColumnKeySet?.has("intelligence") ? "column-group-end" : "",
          )
        : null}
      {visibleColumnKeySet == null || visibleColumnKeySet.has("agentic")
        ? scoreCell(
            scores.agentic_score,
            model.provider,
            ruledColumnKeySet?.has("agentic") ? "column-group-end" : "",
          )
        : null}
      {visibleColumnKeySet == null || visibleColumnKeySet.has("speed")
        ? scoreCell(
            scores.speed_score,
            model.provider,
            ruledColumnKeySet?.has("speed") ? "column-group-end" : "",
          )
        : null}
      {visibleColumnKeySet == null || visibleColumnKeySet.has("value")
        ? scoreCell(
            scores.value_score,
            model.provider,
            ruledColumnKeySet?.has("value") ? "column-group-end" : "",
          )
        : null}
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
  if ("benchmark" in column) {
    if (column.format === "currency") {
      return <TableCell text={formatDashboardMetric(value, column)} className={className} />;
    }
    const meterValue = benchmarkMeterValue(rowData, column);
    const meterPercent =
      column.format === "percent" ? benchmarkPercentValue(meterValue) : meterValue;
    return (
      <BenchmarkMetricCell
        meterPercent={typeof meterPercent === "number" ? meterPercent : null}
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
  return "benchmark" in column
    ? benchmarkDisplayValue(rowData, column)
    : dashboardMetricValue(rowData.model, column);
}

function metricCellMeterValue(rowData: TableRow, column: DashboardMetricColumn) {
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
  const availableSet = new Set((inputs ?? []).map((input) => input.toLowerCase()));
  const availableModalities = inputModalities.filter((modality) => availableSet.has(modality.key));
  const label =
    availableModalities.length === 0
      ? "none"
      : availableModalities.map((modality) => modality.label).join(", ");
  return (
    <td className={`data-cell modality-cell${hasRuleAfter ? " column-group-end" : ""}`}>
      <span className="modality-icons" title={`Input modalities: ${label}`}>
        <span className="visually-hidden">Input modalities: {label}</span>
        {inputModalities.map(({ Icon, key, label }) => {
          const isAvailable = availableSet.has(key);
          return (
            <span
              className={`modality-icon ${isAvailable ? "" : "unavailable"}`}
              key={key}
              title={`${label} input is ${isAvailable ? "available" : "unavailable"}`}
            >
              <Icon />
            </span>
          );
        })}
      </span>
    </td>
  );
}

const ConfidenceCell = memo(function ConfidenceCell({
  confidence,
}: {
  confidence?: ModelAtlasPublishedModel["confidence"];
}) {
  const intelligence = formatConfidence(confidence?.intelligence);
  const agentic = formatConfidence(confidence?.agentic);
  const speed = formatConfidence(confidence?.speed);
  const value = formatConfidence(confidence?.value);
  const missing = intelligence === "-" && agentic === "-" && speed === "-" && value === "-";
  return (
    <td
      aria-label={`Intelligence evidence support ${intelligence}; Agentic evidence support ${agentic}; Speed evidence support ${speed}; Value evidence support ${value}`}
      className={`data-cell confidence-cell${missing ? " missing" : ""}`}
    >
      <span aria-hidden="true" className="confidence-values">
        <span>
          <span className="confidence-dimension">I</span>
          {intelligence}
        </span>
        <span>
          <span className="confidence-dimension">A</span>
          {agentic}
        </span>
        <span>
          <span className="confidence-dimension">S</span>
          {speed}
        </span>
        <span>
          <span className="confidence-dimension">V</span>
          {value}
        </span>
      </span>
    </td>
  );
});

const ScoreChangeCell = memo(function ScoreChangeCell({
  model,
  onScoreChange,
}: {
  model: ModelAtlasPublishedModel;
  onScoreChange: ScoreChangeHandler;
}) {
  if (isPreviewModel(model)) {
    return <td className="data-cell change-cell missing">—</td>;
  }
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
        aria-label={`${scoreDimensionLabel(change.dimension)} change: ${scoreChangeButtonText(change)}`}
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
  const prefix = scoreDimensionLabel(change.dimension).slice(0, 1);
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

function ProviderLogo({ model }: { model: ModelAtlasPublishedModel }) {
  const [hidden, setHidden] = useState(false);
  const logoSrc = logoSource(model);

  if (hidden || !logoSrc) {
    return <span className="provider-logo provider-logo-empty" />;
  }

  return (
    <img
      className="provider-logo"
      src={logoSrc}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      onError={() => {
        setHidden(true);
      }}
    />
  );
}

function logoSource(model: ModelAtlasPublishedModel) {
  const logo = providerLogo(model.provider);
  if (logo.length > 0) {
    return logo;
  }
  if (typeof model.logo === "string" && model.logo.length > 0) {
    return model.logo;
  }
  return "";
}

function TableCell({ text, className }: { text: string; className?: string }) {
  const missingClass = text === "-" ? " missing" : "";
  return <td className={`${className ?? ""}${missingClass}`.trim()}>{text}</td>;
}

function scoreCell(
  value: number | null | undefined,
  provider: string | null | undefined,
  className = "",
) {
  const score = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (score == null) {
    return <TableCell text={formatScore(score)} className={`score-cell ${className}`.trim()} />;
  }
  const displayColor = providerBrandColor(provider);
  const style = {
    "--score": String(Math.max(0, Math.min(100, score))),
    "--score-color": displayColor,
  } as CSSProperties;
  return (
    <td className={`score-cell ${className}`.trim()} style={style}>
      <span className="score-value">{formatScore(score)}</span>
      <span className="score-meter" />
    </td>
  );
}
