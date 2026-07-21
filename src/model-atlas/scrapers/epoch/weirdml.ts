/**
 * WeirdML Epoch adapter owns mirror parsing for crosswalk validation and eligible fallback rows.
 *
 * Page source: https://epoch.ai/benchmarks/weirdml?tab=leaderboard&metric=Accuracy
 * CSV source: https://epoch.ai/data/external_benchmarks/weirdml.csv
 * Benchmark source: https://htihle.github.io/weirdml.html
 * Score field: Accuracy
 */

import {
	asFiniteNumber,
	benchmarkModelEffort,
	canonicalReasoningEffort,
} from "../../shared";
import { parseCsvRecords } from "../csv-parser";

export const WEIRDML_EPOCH_CSV_URL =
	"https://epoch.ai/data/external_benchmarks/weirdml.csv";

export type WeirdMlEpochRow = {
	model_version: string;
	name: string;
	aliases: string[];
	base_model: string;
	reasoning_effort: string | null;
	provider: string | null;
	accuracy: number;
	cost_per_run_usd: number;
	code_len_p50: number;
	standard_error: number | null;
	observed_at: string | null;
};

const MODEL_VERSION_EFFORT_PATTERN =
	/_(no_thinking|extra-high|xhigh|max|high|medium|low|none|adaptive)$/i;

/** Prefer the displayed effort, then use Epoch's configuration suffix when the display omits it. */
function epochModelEffort(displayName: string, modelVersion: string) {
	const displayed = benchmarkModelEffort(displayName);
	if (displayed.reasoningEffort != null) return displayed;
	const suffix = MODEL_VERSION_EFFORT_PATTERN.exec(modelVersion)?.[1];
	if (suffix == null) return displayed;
	return {
		baseModel: displayName.replace(/\s+\([^()]*\)\s*$/, ""),
		reasoningEffort:
			suffix.toLowerCase() === "no_thinking"
				? "none"
				: canonicalReasoningEffort(suffix),
	};
}

/** Parse Epoch's mirror and convert its fractional-percent Accuracy SE to WeirdML's 0-1-scale standard error. */
export function processEpochWeirdMlCsv(csv: string): WeirdMlEpochRow[] {
	return parseCsvRecords(csv).flatMap((record) => {
		const modelVersion = record["Model version"]?.trim();
		const model = record.Model?.trim() || null;
		const displayName = record["Display name"]?.trim() || null;
		const uniqueDisplayName = record["Unique display name"]?.trim() || null;
		const name = uniqueDisplayName ?? displayName ?? model ?? modelVersion;
		const accuracy = asFiniteNumber(record.Accuracy);
		const costPerRun = asFiniteNumber(record["Cost per run"]);
		const medianCodeLength = asFiniteNumber(
			record["Median code length (lines)"],
		);
		const epochAccuracySe = asFiniteNumber(record["Accuracy SE"]);
		if (
			modelVersion == null ||
			modelVersion.length === 0 ||
			name == null ||
			name.length === 0 ||
			accuracy == null ||
			costPerRun == null ||
			medianCodeLength == null
		) {
			return [];
		}
		const effort = epochModelEffort(name, modelVersion);
		const displayAliases = [displayName, uniqueDisplayName].filter(
			(alias): alias is string => alias != null && alias.length > 0,
		);
		return [
			{
				model_version: modelVersion,
				name,
				aliases: [
					...new Set([
						modelVersion,
						...(displayAliases.length > 0 ? displayAliases : [name]),
					]),
				],
				base_model: effort.baseModel,
				reasoning_effort: effort.reasoningEffort,
				provider: record.Organization?.trim() || null,
				accuracy,
				cost_per_run_usd: costPerRun,
				code_len_p50: medianCodeLength,
				standard_error: epochAccuracySe == null ? null : epochAccuracySe * 100,
				observed_at: record["Version release date"]?.trim() || null,
			},
		];
	});
}
