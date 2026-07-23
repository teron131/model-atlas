/** Quality-local and model-balanced resource-efficiency scoring. */

import { calibrationObservations } from "../../benchmarks/calibration-population";
import type { BenchmarkResourceQualityCoordinate } from "../../benchmarks/factory";
import {
	effectiveSampleSize,
	gaussianWeight,
	meanOfFinite,
	smoothstep,
	weightedPercentileRank,
	weightedQuantile,
} from "../../numeric";
import {
	logitUnitScore,
	weightedRobustDeviation,
	winsorizedMinMaxScores,
} from "./normalization";

const RESOURCE_QUALITY_SIGMA = 0.5;
const MIN_QUALITY_DEVIATION = 0.35;
const RESOURCE_TAIL_SHARE = 0.025;
const FULL_RESOURCE_SUPPORT = 3;

function observationsFromValues<T extends { id?: unknown; name?: unknown }>(
	models: readonly T[],
	values: readonly (number | null)[],
) {
	const valueByModel = new Map(
		models.map((model, index) => [model, values[index] ?? null] as const),
	);
	return calibrationObservations(
		models,
		(model) => valueByModel.get(model) ?? null,
	);
}

/** Apply model-balanced favorable-tail anchors to a completed signal. */
export function modelBalancedMinMaxScores<
	T extends { id?: unknown; name?: unknown },
>(
	models: readonly T[],
	scores: readonly (number | null)[],
	direction: "higher" | "lower",
): Array<number | null> {
	return winsorizedMinMaxScores(
		scores,
		observationsFromValues(models, scores),
		direction,
		RESOURCE_TAIL_SHARE,
	);
}

/** Score resource magnitude after removing the model-balanced local expectation at comparable quality. */
export function qualityLocalResourceScores<
	T extends { id?: unknown; name?: unknown },
>(
	models: readonly T[],
	qualityCoordinates: readonly (number | null)[],
	resourceSignals: readonly (number | null)[],
): Array<number | null> {
	const modelIndexByModel = new Map(
		models.map((model, index) => [model, index] as const),
	);
	const qualityObservations = calibrationObservations(models, (model) => {
		const modelIndex = modelIndexByModel.get(model);
		const qualityCoordinate =
			modelIndex == null ? null : (qualityCoordinates[modelIndex] ?? null);
		const resourceSignal =
			modelIndex == null ? null : (resourceSignals[modelIndex] ?? null);
		return qualityCoordinate == null || resourceSignal == null
			? null
			: qualityCoordinate;
	});
	const benchmarkQualityMedian = weightedQuantile(qualityObservations, 0.5);
	const benchmarkQualityDeviation = weightedRobustDeviation(
		qualityObservations,
		MIN_QUALITY_DEVIATION,
	);
	if (benchmarkQualityMedian == null || benchmarkQualityDeviation == null) {
		return models.map(() => null);
	}
	const points = qualityObservations.flatMap(
		({ modelKey, item: model, value: quality, weight }) => {
			const modelIndex = modelIndexByModel.get(model);
			const resourceSignal =
				modelIndex == null ? null : (resourceSignals[modelIndex] ?? null);
			return modelIndex == null || resourceSignal == null
				? []
				: [
						{
							modelIndex,
							modelKey,
							calibrationWeight: weight,
							qualityDeviation:
								(quality - benchmarkQualityMedian) /
								benchmarkQualityDeviation,
							resourceSignal,
						},
					];
		},
	);
	const residuals = models.map(() => null as number | null);
	const supportConfidence = models.map(() => 0);
	for (const point of points) {
		residuals[point.modelIndex] = 0;
		const comparisonsByModel = new Map<
			string,
			{ resourceTotal: number; weight: number }
		>();
		for (const comparisonPoint of points) {
			if (comparisonPoint.modelKey === point.modelKey) {
				continue;
			}
			const weight =
				comparisonPoint.calibrationWeight *
				gaussianWeight(
					point.qualityDeviation,
					comparisonPoint.qualityDeviation,
					RESOURCE_QUALITY_SIGMA,
				);
			const comparison = comparisonsByModel.get(comparisonPoint.modelKey) ?? {
				resourceTotal: 0,
				weight: 0,
			};
			comparison.resourceTotal += weight * comparisonPoint.resourceSignal;
			comparison.weight += weight;
			comparisonsByModel.set(comparisonPoint.modelKey, comparison);
		}
		const comparisons = [...comparisonsByModel.values()];
		const totalWeight = comparisons.reduce(
			(sum, comparison) => sum + comparison.weight,
			0,
		);
		if (totalWeight > 0) {
			residuals[point.modelIndex] =
				point.resourceSignal -
				comparisons.reduce(
					(sum, comparison) => sum + comparison.resourceTotal,
					0,
				) /
					totalWeight;
			const effectivePeers = Math.min(
				totalWeight,
				effectiveSampleSize(comparisons.map((comparison) => comparison.weight)),
			);
			supportConfidence[point.modelIndex] = smoothstep(
				(effectivePeers - 1) / (FULL_RESOURCE_SUPPORT - 1),
			);
		}
	}
	const supportedResiduals = residuals.map((residual, index) =>
		(supportConfidence[index] ?? 0) > 0 ? residual : null,
	);
	const finiteSupportedResiduals = supportedResiduals.filter(
		(residual): residual is number =>
			residual != null && Number.isFinite(residual),
	);
	const residualRange =
		finiteSupportedResiduals.length > 1
			? Math.max(...finiteSupportedResiduals) -
				Math.min(...finiteSupportedResiduals)
			: 0;
	const residualScale = Math.max(1, ...finiteSupportedResiduals.map(Math.abs));
	const hasMeaningfulSpread =
		residualRange > Number.EPSILON * residualScale * 32;
	if (!hasMeaningfulSpread) {
		return residuals.map((residual) => (residual == null ? null : 50));
	}
	const minMaxScores = modelBalancedMinMaxScores(
		models,
		supportedResiduals,
		"lower",
	);
	const inverseResidualObservations = observationsFromValues(
		models,
		supportedResiduals.map((residual) => (residual == null ? null : -residual)),
	);
	const percentileScores = supportedResiduals.map((residual) =>
		residual == null
			? null
			: weightedPercentileRank(inverseResidualObservations, -residual),
	);
	return residuals.map((residual, index) => {
		if (residual == null) {
			return null;
		}
		const confidence = supportConfidence[index] ?? 0;
		const hybridScore = meanOfFinite([
			minMaxScores[index] ?? null,
			percentileScores[index] ?? null,
		]);
		return 50 + confidence * ((hybridScore ?? 50) - 50);
	});
}

/** Score benchmark resource use within quality-local comparisons. */
export function benchmarkResourceEfficiencyScores<
	T extends { id?: unknown; name?: unknown },
>(
	models: readonly T[],
	benchmarkScores: readonly (number | null)[],
	resourceSignals: readonly (number | null)[],
	qualityCoordinate: BenchmarkResourceQualityCoordinate,
): Array<number | null> {
	return qualityLocalResourceScores(
		models,
		benchmarkScores.map((score) =>
			score == null || qualityCoordinate === "linear"
				? score
				: logitUnitScore(score),
		),
		resourceSignals,
	);
}
