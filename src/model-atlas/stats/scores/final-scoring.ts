/** Final component scoring for public Model Atlas model rows. */

import {
	coverageConfidence,
	effectiveSampleSize,
	gaussianWeight,
	log10OnePlusPositive,
	logInputMinMaxScores,
	logitBenchmarkScore,
	logitPercentageScore,
	meanOfFinite,
	positiveFiniteNumber,
	smoothstep,
	weightedFinitePartCount,
	weightedMeanOfFinite,
	weightedPercentileRank,
	weightedQuantile,
	weightedRobustDeviation,
	winsorizedMinMaxScores,
} from "../../math-utils";
import {
	benchmarkMetricValue,
	effectiveTaskSeconds,
	taskMetricFromModel,
} from "../resource-metrics";
import type {
	LlmStatsModelCandidate,
	LlmStatsScoredCandidate,
	LlmStatsTaskMetricValues,
	ScoringConfig,
} from "../types";
import { calibrationObservations } from "./calibration-population";
import { blendedPriceValue } from "./score-builders";
import {
	simulatedBlendSeconds,
	workflowPriceEfficiencySignal,
} from "./workflow-simulation";

const MIN_RAW_SPEED_COMPONENTS = 2;
const ACTIVE_COMPONENT_WEIGHT = 1;
const RESOURCE_QUALITY_SIGMA = 0.5;
const MIN_BENCHMARK_DEVIATION = 0.35;
const RESOURCE_TAIL_SHARE = 0.025;
const FULL_RESOURCE_SUPPORT = 3;
type WeightedSignal = {
	value: number | null;
	weight: number;
};

type ResourceEfficiencyEvidence = {
	benchmarkKeys: readonly string[];
	signalsByModel: number[][];
};

function meanSignal(
	signals: WeightedSignal[],
	minimumFiniteValues: number,
): number | null {
	if (weightedFinitePartCount(signals) < minimumFiniteValues) {
		return null;
	}
	return weightedMeanOfFinite(signals);
}

function hasPositiveResourceMetric(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): boolean {
	const task = resourceTaskMetric(model, key, scoringConfig);
	return (
		positiveFiniteNumber(task?.cost) != null ||
		effectiveTaskSeconds(model, task) != null
	);
}

/** A benchmark contributes resource scoring when any scored row carries matching task telemetry. */
function hasBenchmarkResourceMetric(
	models: LlmStatsModelCandidate[],
	key: string,
	scoringConfig: ScoringConfig,
): boolean {
	return models.some(
		(model) =>
			benchmarkMetricValue(model, key) != null &&
			hasPositiveResourceMetric(model, key, scoringConfig),
	);
}

function activeResourceBenchmarkKeys(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): string[] {
	const benchmarkKeys = new Set<string>();
	for (const model of models) {
		for (const key of Object.keys(model.evaluations ?? {})) {
			benchmarkKeys.add(key);
		}
		for (const key of Object.keys(model.intelligence ?? {})) {
			benchmarkKeys.add(key);
		}
	}
	return [...benchmarkKeys]
		.filter((key) => hasBenchmarkResourceMetric(models, key, scoringConfig))
		.sort((left, right) => left.localeCompare(right));
}

function resourceTaskMetricKey(
	key: string,
	scoringConfig: ScoringConfig,
): string {
	const resourcePolicy = scoringConfig.benchmarkPortfolio[key]?.resourcePolicy;
	return resourcePolicy?.source === "artificial_analysis"
		? "artificial_analysis"
		: key;
}

function hasUsableResourceTask(
	model: LlmStatsModelCandidate,
	task: LlmStatsTaskMetricValues | null,
): boolean {
	return (
		positiveFiniteNumber(task?.cost) != null ||
		effectiveTaskSeconds(model, task) != null
	);
}

function resourceTaskMetric(
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
): LlmStatsTaskMetricValues | null {
	const directTask = taskMetricFromModel(model, key);
	if (hasUsableResourceTask(model, directTask)) {
		return directTask;
	}
	const taskMetricKey = resourceTaskMetricKey(key, scoringConfig);
	return taskMetricFromModel(model, taskMetricKey);
}

function blendCost(
	model: LlmStatsModelCandidate,
	scoringConfig: ScoringConfig,
): number | null {
	return (
		positiveFiniteNumber(model.cost?.blended_price) ??
		blendedPriceValue(model.cost, scoringConfig)
	);
}

type TaskResourceAmount = (
	model: LlmStatsModelCandidate,
	key: string,
	scoringConfig: ScoringConfig,
) => number | null;

function activeResourceKeys(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
	resourceAmountFor: TaskResourceAmount,
): string[] {
	return activeResourceBenchmarkKeys(models, scoringConfig).filter((key) =>
		models.some((model) => {
			return (
				benchmarkMetricValue(model, key) != null &&
				resourceAmountFor(model, key, scoringConfig) != null
			);
		}),
	);
}

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

/** Score resource magnitude after removing the model-balanced local expectation at comparable quality. */
function qualityLocalResourceScores<T extends { id?: unknown; name?: unknown }>(
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
		MIN_BENCHMARK_DEVIATION,
	);
	if (benchmarkQualityMedian == null || benchmarkQualityDeviation == null) {
		return models.map(() => null);
	}
	const points = qualityObservations.flatMap(
		({ modelKey, item: model, value: logitQuality, weight }) => {
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
								(logitQuality - benchmarkQualityMedian) /
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
): Array<number | null> {
	return qualityLocalResourceScores(
		models,
		benchmarkScores.map((score) =>
			score == null ? null : logitBenchmarkScore(score),
		),
		resourceSignals,
	);
}

function resourceEfficiencyEvidence(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
	resourceAmountFor: TaskResourceAmount,
): ResourceEfficiencyEvidence {
	const benchmarkKeys = activeResourceKeys(
		models,
		scoringConfig,
		resourceAmountFor,
	);
	const signalsByModel = models.map(() => [] as number[]);
	for (const key of benchmarkKeys) {
		const scores = benchmarkResourceEfficiencyScores(
			models,
			models.map((model) => benchmarkMetricValue(model, key)),
			models.map((model) => {
				const resourceAmount = resourceAmountFor(model, key, scoringConfig);
				return resourceAmount == null ? null : Math.log(resourceAmount);
			}),
		);
		for (const [modelIndex, score] of scores.entries()) {
			if (score != null) {
				signalsByModel[modelIndex]?.push(score);
			}
		}
	}
	return {
		benchmarkKeys,
		signalsByModel,
	};
}

function equalWeightedScore(
	signals: Array<number | null>,
	totalCount: number,
): number | null {
	const meanValue = meanOfFinite(signals);
	return meanValue == null
		? null
		: meanValue *
				coverageConfidence(
					weightedFinitePartCount(
						signals.map((value) => ({
							value,
							weight: ACTIVE_COMPONENT_WEIGHT,
						})),
					),
					totalCount,
				);
}

/** Apply the scoring policy's model-balanced favorable-tail anchors to a completed signal. */
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

export function attachFinalScores(
	models: LlmStatsModelCandidate[],
	scoringConfig: ScoringConfig,
): LlmStatsScoredCandidate[] {
	const intelligenceScores = models.map(
		(model) => model.component_scores?.intelligence_score ?? null,
	);
	const agenticScores = models.map(
		(model) => model.component_scores?.agentic_score ?? null,
	);
	const qualityScores = models.map((_, index) =>
		meanOfFinite([
			intelligenceScores[index] ?? null,
			agenticScores[index] ?? null,
		]),
	);
	const logBlendedPriceSignals = models.map((model) =>
		log10OnePlusPositive(blendCost(model, scoringConfig)),
	);
	const workflowPriceEfficiencySignals = models.map((model) =>
		workflowPriceEfficiencySignal(model, scoringConfig),
	);
	const logBlendedPriceScores = modelBalancedMinMaxScores(
		models,
		logBlendedPriceSignals,
		"lower",
	);
	const qualityCoordinates = qualityScores.map((score) =>
		score == null ? null : logitPercentageScore(score),
	);
	const qualityAdjustedBlendedPriceScores = qualityLocalResourceScores(
		models,
		qualityCoordinates,
		logBlendedPriceSignals,
	);
	const workflowPriceEfficiencyScores = qualityLocalResourceScores(
		models,
		qualityCoordinates,
		workflowPriceEfficiencySignals.map((signal) =>
			signal == null ? null : -signal,
		),
	);
	const valueInputScoresByModel = models.map((_, index) => [
		logBlendedPriceScores[index] ?? null,
		qualityAdjustedBlendedPriceScores[index] ?? null,
		workflowPriceEfficiencyScores[index] ?? null,
	]);
	const throughputSpeedSignals = models.map((model) =>
		positiveFiniteNumber(model.speed?.throughput_tokens_per_second_median),
	);
	const latencySecondsSignals = models.map((model) =>
		positiveFiniteNumber(model.speed?.latency_seconds_median),
	);
	const e2eSecondsSignals = models.map((model) =>
		positiveFiniteNumber(model.speed?.e2e_latency_seconds_median),
	);
	const throughputSpeedScores = logInputMinMaxScores(
		throughputSpeedSignals,
		"higher",
	);
	const latencySpeedScores = logInputMinMaxScores(
		latencySecondsSignals,
		"lower",
	);
	const e2eSpeedScores = logInputMinMaxScores(e2eSecondsSignals, "lower");
	const workflowRuntimeSeconds = models.map((model) =>
		simulatedBlendSeconds(model.speed, scoringConfig),
	);
	const providerSpeedComponents = models.map((_, index) =>
		meanSignal(
			[
				{
					value: throughputSpeedScores[index] ?? null,
					weight: ACTIVE_COMPONENT_WEIGHT,
				},
				{
					value: latencySpeedScores[index] ?? null,
					weight: ACTIVE_COMPONENT_WEIGHT,
				},
				{
					value: e2eSpeedScores[index] ?? null,
					weight: ACTIVE_COMPONENT_WEIGHT,
				},
			],
			MIN_RAW_SPEED_COMPONENTS,
		),
	);
	const taskTimeComponentEvidence = resourceEfficiencyEvidence(
		models,
		scoringConfig,
		(model, key, config) =>
			effectiveTaskSeconds(model, resourceTaskMetric(model, key, config)),
	);
	const taskCostComponentEvidence = resourceEfficiencyEvidence(
		models,
		scoringConfig,
		(model, key, config) =>
			positiveFiniteNumber(resourceTaskMetric(model, key, config)?.cost),
	);
	const workflowSpeedComponents = logInputMinMaxScores(
		workflowRuntimeSeconds,
		"lower",
	);
	const blendedSpeedScores = models.map((_, index) =>
		equalWeightedScore(
			[
				providerSpeedComponents[index] ?? null,
				workflowSpeedComponents[index] ?? null,
				...(taskTimeComponentEvidence.signalsByModel[index] ?? []),
			],
			taskTimeComponentEvidence.benchmarkKeys.length + 2,
		),
	);
	const valueScores = models.map((_, index) =>
		equalWeightedScore(
			[
				...(valueInputScoresByModel[index] ?? []),
				...(taskCostComponentEvidence.signalsByModel[index] ?? []),
			],
			taskCostComponentEvidence.benchmarkKeys.length + 3,
		),
	);
	return models.map((model, index) => {
		const intelligenceScore = intelligenceScores[index] ?? null;
		const agenticScore = agenticScores[index] ?? null;
		const blendedSpeedScore = blendedSpeedScores[index] ?? null;
		const valueScore = valueScores[index] ?? null;
		return {
			...model,
			scores: {
				intelligence_score: intelligenceScore,
				agentic_score: agenticScore,
				speed_score: blendedSpeedScore,
				value_score: valueScore,
			},
		};
	});
}
