/** Shared retained-data schemas, compact persistence, and fit-policy validation for the Intelligence Index. */

import { MAX_NORMALIZED_IMPUTATION_ERROR } from "../config/stage";

export type TimelineDimension = "intelligence" | "agentic";

export type HistoricalBenchmark = {
  id: string;
  key: string;
  label: string;
  kind: "task" | "index";
  scale: "probability" | "linear";
  weights: Record<TimelineDimension, number>;
  releaseDate?: string | null;
  normalization?: string;
  supersededBy?: string;
  editions?: string[];
  componentIds?: string[];
  representedBenchmarks?: number;
  benchmarkNames?: string[];
  primary?: boolean;
};

export type HistoricalModel = {
  id: string;
  family: string;
  name: string;
  provider: string;
  effort: string | null;
  releaseDate: string | null;
  current: boolean;
};

export type HistoricalObservation = {
  modelId: string;
  benchmarkId: string;
  value: number;
  observedAt: string;
  source: string;
  rawValue?: number;
  evaluatedAt?: string | null;
  sourceModelVersion?: string;
  sourceModelName?: string;
  sourceReleaseDate?: string | null;
  sourceSnapshot?: string;
  referenceConfidence?: number;
  benchmarkCount?: number;
  benchmarkNames?: string[];
};

export type HistoricalPortfolio = {
  id: string;
  label: string;
  source: string;
  components: { label: string; benchmarkId: string | null }[];
  note: string;
};

export type HistoricalSourceRelease = {
  id: string;
  capturedAt: string;
  artifacts: { url: string; sha256: string }[];
  models: HistoricalModel[];
  benchmarks: HistoricalBenchmark[];
  observations: HistoricalObservation[];
  portfolios: HistoricalPortfolio[];
};

export type HistoricalDataset = {
  releaseId: string;
  capturedAt: string;
  rootBenchmarkIds: Record<TimelineDimension, string>;
  reference: { id: string; capturedAt: string; models: number };
  models: HistoricalModel[];
  benchmarks: HistoricalBenchmark[];
  observations: HistoricalObservation[];
  archiveEntries: number;
  portfolios: HistoricalPortfolio[];
  sourceReleases: {
    id: string;
    capturedAt: string;
    artifacts: { url: string; sha256: string }[];
  }[];
  conflicts: number;
  activeBenchmarkIds?: string[];
  displayAnchors?: TimelineAnchors;
  scale?: TimelineScale;
  prepared?: {
    parameters: TimelineParameters;
    evidence: { cells: TimelineBenchmarkEvidence[]; predictors: TimelinePredictor[] };
    calibrations: { intelligence: HistoricalCalibration; agentic?: HistoricalCalibration };
  };
};

export type TimelineParameters = {
  saturationLow: number;
  saturationHigh: number;
  minModels: number;
  maxError: number;
};

export type TimelinePredictor = {
  id: string;
  inputs: string[];
  target: string;
  kind: "index" | "components";
  models: number;
  error: number | null;
  baselineError: number | null;
  accepted: boolean;
};

export type TimelineBenchmarkEvidence = {
  modelId: string;
  benchmarkId: string;
  value: number;
  observed: boolean;
  confidence: number;
  informative: boolean;
  inputs: string[];
  viaIndex: boolean;
};

export type HistoricalEstimate = {
  modelId: string;
  value: number | null;
  evidence: number;
  saturated: number;
  paths: string[][];
  indexOnly: boolean;
  reference: boolean;
  source: "current" | "index" | "blended" | "components" | "unplaced";
  confidence: number | null;
  disagreement: number | null;
  uncertainty?: {
    transferError: number;
    steps: number;
    weakestModels: number;
    outsideOverlap: boolean;
  } | null;
  versionAdjustment?: { kind: "successor"; modelIds: string[]; unadjustedValue: number };
  benchmarkSupport: {
    observed: number;
    inferred: number;
    direct: number;
    effective: number;
  };
};

export type HistoricalCalibration = {
  estimates: HistoricalEstimate[];
  predictors: TimelinePredictor[];
  connectedBenchmarks: number;
  scaleId?: string;
};

/** Link statistics come only from paired observations of the same model configuration, with whole-family validation. */
export type TimelineLink = {
  id: string;
  left: string;
  right: string;
  models: number;
  correlation: number;
  error: number;
  baselineError: number;
  leftMean: number;
  rightMean: number;
  leftDeviation: number;
  rightDeviation: number;
  leftError: number;
  rightError: number;
  leftMin: number;
  leftMax: number;
  rightMin: number;
  rightMax: number;
  weight: number;
};

export type TimelineBridgeError = {
  linkId: string;
  center: number;
  deviation: number;
  min: number;
  max: number;
  error: number;
  models: number;
  normalizedError: number;
};

export type TimelineBenchmarkCalibration = {
  benchmarkId: string;
  slope: number;
  offset: number;
  path: string[];
  errors: TimelineBridgeError[];
  disagreement: number;
};

/** Published mappings stay fixed while later releases extend observed links and retain the initial reference. */
export type TimelineScale = {
  id: string;
  parentId: string | null;
  parameters: TimelineParameters;
  minimumReferenceConfidence: number;
  reference: HistoricalDataset["reference"];
  rootBenchmarkIds: Record<TimelineDimension, string>;
  models: HistoricalModel[];
  benchmarks: HistoricalBenchmark[];
  observations: HistoricalObservation[];
  dimensions: Record<
    TimelineDimension,
    {
      nodes: TimelineBenchmarkCalibration[];
      links: TimelineLink[];
    }
  >;
};

export type TimelineAnchors = {
  mode: "models" | "spread";
  lowModelId: string;
  highModelId: string;
  lowScore: number;
  highScore: number;
  pointsPerDeviation: number;
  /** A saved historical estimate can label the display without becoming observed evidence for calibration. */
  frozenReferences?: {
    modelId: string;
    referenceId: string;
    scaleId: string;
    values: Record<TimelineDimension, number>;
  }[];
};

type PackedDataset = Omit<HistoricalDataset, "scale"> & {
  scale?: Omit<TimelineScale, "models" | "benchmarks" | "observations">;
};

/** Calibration owns fixed mappings; the enclosing dataset owns the retained model and observation collections. */
export function packTimelineDataset(data: HistoricalDataset): PackedDataset {
  if (!data.scale) return data;
  const {
    models: _models,
    benchmarks: _benchmarks,
    observations: _observations,
    ...scale
  } = data.scale;
  return { ...data, scale };
}

export function unpackTimelineDataset(data: PackedDataset): HistoricalDataset {
  const { scale, ...dataset } = data;
  return {
    ...dataset,
    ...(scale
      ? {
          scale: {
            ...scale,
            models: data.models,
            benchmarks: data.benchmarks,
            observations: data.observations,
          },
        }
      : {}),
  };
}

/** Validate the fit exclusion and query clipping interval together with minimum link-validation requirements. */
export function validateTimelineParameters(parameters: TimelineParameters): void {
  if (
    !(
      parameters.saturationLow >= 0 &&
      parameters.saturationLow < parameters.saturationHigh &&
      parameters.saturationHigh <= 100
    )
  )
    throw new Error("Use a saturation interval within 0–100%.");
  if (
    !Number.isInteger(parameters.minModels) ||
    parameters.minModels < 4 ||
    !Number.isFinite(parameters.maxError) ||
    parameters.maxError <= 0 ||
    parameters.maxError > MAX_NORMALIZED_IMPUTATION_ERROR
  )
    throw new Error(
      "Use at least four validation models and a normalized error threshold above zero and at most 25 points.",
    );
}
