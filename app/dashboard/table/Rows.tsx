/** Leaderboard row components and model display rules. */

import Image from "next/image";
import { type CSSProperties, useState } from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import {
	AudioInputIcon,
	ImageInputIcon,
	TextInputIcon,
	VideoInputIcon,
} from "../shared/DashboardIcons";
import {
	benchmarkPercentValue,
	formatContext,
	formatCost,
	formatDashboardMetric,
	formatScore,
} from "../shared/format";
import { modelDisplayName } from "../shared/modelDisplay";
import {
	providerAssetLogo,
	providerDisplayColor,
} from "../shared/providerTheme";
import {
	contextWindowValue,
	type DashboardMetricColumn,
	dashboardMetricValue,
	type SortKey,
	type TableRow,
} from "./models";

const HIDDEN_MODEL_DISPLAY_TOKENS = new Set(["instruct", "preview"]);
const RELEASE_DATE_TOKEN_PATTERN = /^\d{4}$/;
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

export function EmptyStateRow({
	message,
	columnCount,
}: {
	message: string;
	columnCount: number;
}) {
	return (
		<tr>
			<td className="empty" colSpan={columnCount}>
				{message}
			</td>
		</tr>
	);
}

export function LoadingRows({ columnKeys }: { columnKeys: SortKey[] }) {
	return (
		<>
			{LOADING_ROW_KEYS.map((key, index) => (
				<LoadingRow key={key} index={index} columnKeys={columnKeys} />
			))}
		</>
	);
}

function LoadingRow({
	index,
	columnKeys,
}: {
	index: number;
	columnKeys: SortKey[];
}) {
	return (
		<tr
			className="loading-row"
			style={{ "--loading-row-index": index } as CSSProperties}
		>
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
				<td className="data-cell" key={`loading-${key}`}>
					<span className="loading-block loading-metric" />
				</td>
			))}
		</tr>
	);
}

export function ModelRow({
	rowData,
	metricColumns,
}: {
	rowData: TableRow;
	metricColumns: DashboardMetricColumn[];
}) {
	const model = rowData.model;
	return (
		<tr>
			<ModelScoreCells rowData={rowData} />
			<TableCell
				text={formatCost(model.cost?.blended_price)}
				className="data-cell"
			/>
			<TableCell
				text={formatContext(contextWindowValue(model))}
				className="data-cell"
			/>
			{metricColumns.map((column) => (
				<DashboardMetricCell key={column.key} model={model} column={column} />
			))}
		</tr>
	);
}

/** Render the leaderboard identity and four score columns used by PNG exports. */
export function ScoreModelRow({ rowData }: { rowData: TableRow }) {
	return (
		<tr>
			<ModelScoreCells rowData={rowData} />
		</tr>
	);
}

function ModelScoreCells({ rowData }: { rowData: TableRow }) {
	const model = rowData.model;
	const visibleName = visibleModelName(modelDisplayName(model));
	const visibleSlug = visibleModelSlug(model.id);
	const scores = model.scores ?? {};
	return (
		<>
			<TableCell
				text={String(rowData.intelligenceRank).padStart(2, "0")}
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
			{scoreCell(scores.intelligence_score, model.provider)}
			{scoreCell(scores.agentic_score, model.provider)}
			{scoreCell(scores.speed_score, model.provider)}
			{scoreCell(scores.value_score, model.provider)}
		</>
	);
}

function DashboardMetricCell({
	model,
	column,
}: {
	model: LlmStatsModel;
	column: DashboardMetricColumn;
}) {
	if (column.group === "profile" && column.field === "modalities") {
		return <ModalityInputCell inputs={model.modalities?.input} />;
	}
	const value = dashboardMetricValue(model, column);
	if ("benchmark" in column) {
		return (
			<BenchmarkMetricCell
				value={typeof value === "number" ? value : null}
				text={formatDashboardMetric(value, column)}
				provider={model.provider}
			/>
		);
	}
	return (
		<TableCell
			text={formatDashboardMetric(value, column)}
			className="data-cell"
		/>
	);
}

function BenchmarkMetricCell({
	value,
	text,
	provider,
}: {
	value: number | null;
	text: string;
	provider: string | null | undefined;
}) {
	const normalizedValue = benchmarkPercentValue(value);
	const displayColor = providerDisplayColor(provider);
	const style = {
		"--score": String(Math.max(0, Math.min(100, normalizedValue ?? 0))),
		"--score-color": displayColor,
	} as CSSProperties;
	return (
		<td
			className={`data-cell benchmark-cell${
				normalizedValue == null ? " missing" : ""
			}`}
			style={style}
		>
			<span className="score-value">{text}</span>
			<span className="score-meter benchmark-meter" />
		</td>
	);
}

function ModalityInputCell({ inputs }: { inputs: string[] | undefined }) {
	const availableSet = inputModalitySet(inputs);
	const availableModalities = inputModalities.filter((modality) =>
		availableSet.has(modality.key),
	);
	const label =
		availableModalities.length === 0
			? "none"
			: availableModalities.map((modality) => modality.label).join(", ");
	return (
		<td className="data-cell modality-cell">
			<span className="modality-icons" title={`Inputs: ${label}`}>
				<span className="visually-hidden">Inputs: {label}</span>
				{inputModalities.map(({ Icon, key, label }) => {
					const isAvailable = availableSet.has(key);
					return (
						<span
							className={`modality-icon ${isAvailable ? "" : "unavailable"}`}
							key={key}
							title={`${label} input ${isAvailable ? "available" : "unavailable"}`}
						>
							<Icon />
						</span>
					);
				})}
			</span>
		</td>
	);
}

function inputModalitySet(inputs: string[] | undefined) {
	return new Set((inputs ?? []).map((input) => input.toLowerCase()));
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
	return stripModelDisplayTokens(
		slashIndex === -1 ? id : id.slice(slashIndex + 1),
		"-",
	);
}

function stripModelDisplayTokens(value: string, separator: " " | "-") {
	const tokens = value.split(separator).filter((token) => token.length > 0);
	const visibleTokens = tokens.filter((token) => !isHiddenDisplayToken(token));
	while (visibleTokens.length > 1 && isReleaseDateToken(visibleTokens.at(-1))) {
		visibleTokens.pop();
	}
	return visibleTokens.join(separator) || value;
}

function isHiddenDisplayToken(token: string) {
	return HIDDEN_MODEL_DISPLAY_TOKENS.has(token.toLowerCase());
}

function isReleaseDateToken(token: string | undefined) {
	return token != null && RELEASE_DATE_TOKEN_PATTERN.test(token);
}

function ProviderLogo({ model }: { model: LlmStatsModel }) {
	const [hidden, setHidden] = useState(false);
	const logoSrc = logoSource(model);

	if (hidden || !logoSrc) {
		return <span className="provider-logo provider-logo-empty" />;
	}

	return (
		<Image
			className="provider-logo"
			src={logoSrc}
			alt=""
			width={32}
			height={32}
			unoptimized
			onError={() => {
				setHidden(true);
			}}
		/>
	);
}

function logoSource(model: LlmStatsModel) {
	const providerLogo = providerAssetLogo(model.provider);
	if (providerLogo.length > 0) {
		return providerLogo;
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
	const score =
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const displayColor = providerDisplayColor(provider);
	const style = {
		"--score": String(Math.max(0, Math.min(100, score ?? 0))),
		"--score-color": displayColor,
	} as CSSProperties;
	return (
		<td
			className={`score-cell ${className}${score == null ? " missing" : ""}`.trim()}
			style={style}
		>
			<span className="score-value">{formatScore(score)}</span>
			<span className="score-meter" />
		</td>
	);
}
