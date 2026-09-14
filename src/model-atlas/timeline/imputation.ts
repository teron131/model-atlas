/** Timeline transfers fit identical observed input editions, keeping query-only rows outside calibration and validation. */
import { calibrationObservations, effectiveModelCount } from "../benchmarks/calibration-population";
import { STAGE_CONFIG } from "../config/stage";
import { prepareBenchmarkImputation } from "../pipeline/scores/imputation/benchmark";
import type { HistoricalBenchmark, TimelineParameters, TimelinePredictor } from "./types";

export type TimelineRow = {
  id: string;
  name: string;
  reasoning_effort: string | null;
  benchmarks: Record<string, number>;
};

/** Each donor observes the target and every requested input; unavailable editions never silently change its basket. */
export function prepareTimelineImputation(
  referenceRows: TimelineRow[],
  queryRows: TimelineRow[],
  target: HistoricalBenchmark,
  inputs: HistoricalBenchmark[],
  parameters: TimelineParameters,
  kind: TimelinePredictor["kind"],
) {
  const definitions = [target, ...inputs];
  const donors = referenceRows.filter((row) =>
    definitions.every((b) => Number.isFinite(row.benchmarks[b.id])),
  );
  const ranges = new Map(
    inputs.map((b) => {
      const values = donors.map((row) => row.benchmarks[b.id]!);
      return [b.id, { min: Math.min(...values), max: Math.max(...values) }] as const;
    }),
  );
  const targets = calibrationObservations(donors, (row) => row.benchmarks[target.id]!);
  const targetValues = targets.map((row) => row.value);
  const usable =
    inputs.length > 0 &&
    effectiveModelCount(targets) >= parameters.minModels &&
    Math.max(...targetValues) > Math.min(...targetValues);
  const config = {
    ...STAGE_CONFIG.scoring,
    intelligenceBenchmarkKeys: definitions
      .filter((b) => b.weights.intelligence > 0)
      .map((b) => b.id),
    agenticBenchmarkKeys: definitions.filter((b) => b.weights.agentic > 0).map((b) => b.id),
    benchmarkPortfolio: Object.fromEntries(
      definitions.map((b) => [
        b.id,
        {
          group: "frontier" as const,
          benchmarkImportance: 1,
          dimensionLoadings: b.weights,
        },
      ]),
    ),
  };
  const result = usable
    ? prepareBenchmarkImputation(donors, config, [target.id], kind === "index" ? 1 : 3, queryRows)
    : null;
  const diagnostic = result?.imputationDiagnosticsByKey.get(target.id);
  const details: TimelinePredictor = {
    id: `${target.id}|${inputs.map((b) => b.id).join("|")}`,
    inputs: inputs.map((b) => b.id),
    target: target.id,
    kind,
    models: diagnostic?.effectiveModelCount ?? 0,
    error: diagnostic?.normalizedMedianAbsoluteError ?? null,
    baselineError: diagnostic?.normalizedBaselineMedianAbsoluteError ?? null,
    accepted:
      diagnostic?.imputationAllowed === true &&
      diagnostic.effectiveModelCount >= parameters.minModels &&
      diagnostic.normalizedMedianAbsoluteError != null &&
      diagnostic.normalizedMedianAbsoluteError <= parameters.maxError &&
      diagnostic.normalizedBaselineMedianAbsoluteError != null &&
      diagnostic.normalizedMedianAbsoluteError <
        diagnostic.normalizedBaselineMedianAbsoluteError - 1e-9,
  };
  return {
    details,
    donors,
    ranges,
    predict(row: TimelineRow, allowOutside = false) {
      if (
        !details.accepted ||
        (!allowOutside &&
          inputs.some((b) => {
            const value = row.benchmarks[b.id];
            const range = ranges.get(b.id)!;
            return value == null || value < range.min || value > range.max;
          }))
      )
        return null;
      const value = result?.imputationByModel.get(row)?.get(target.id);
      const confidence = result?.imputationConfidenceByModel.get(row)?.get(target.id);
      return value == null || confidence == null || confidence <= 0 ? null : { value, confidence };
    },
  };
}
