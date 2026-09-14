/** Reconstruct diagnostic benchmark cells from matched observed context without turning estimates into score-transfer inputs. */
import { excludesVariantIndex } from "../benchmarks/index-policy";
import { prepareTimelineImputation, type TimelineRow } from "./imputation";
import type {
  HistoricalBenchmark,
  HistoricalDataset,
  TimelineBenchmarkEvidence,
  TimelineParameters,
  TimelinePredictor,
} from "./types";

const cache = new WeakMap<HistoricalDataset, Map<string, ReturnType<typeof buildEvidence>>>();

/** Both dimensions share diagnostic cells; immutable releases and parameter sets define the cache boundary. */
export function prepareTimelineBenchmarkEvidence(
  data: HistoricalDataset,
  parameters: TimelineParameters,
): { cells: TimelineBenchmarkEvidence[]; predictors: TimelinePredictor[] } {
  const key = JSON.stringify(parameters);
  if (data.prepared && JSON.stringify(data.prepared.parameters) === key)
    return data.prepared.evidence;
  const byParameters = cache.get(data) ?? new Map<string, ReturnType<typeof buildEvidence>>();
  if (!byParameters.has(key)) byParameters.set(key, buildEvidence(data, parameters));
  cache.set(data, byParameters);
  return byParameters.get(key)!;
}

function buildEvidence(data: HistoricalDataset, parameters: TimelineParameters) {
  const definitions = data.benchmarks.filter(
    (b) => !b.key.startsWith("model_atlas_") && !b.id.includes(":unresolved-edition"),
  );
  const tasks = definitions.filter((b) => b.kind === "task");
  const indexes = definitions.filter((b) => b.kind === "index");
  const byDefinition = new Map(definitions.map((b) => [b.id, b]));
  const raw = new Map(data.observations.map((o) => [o.modelId + "|" + o.benchmarkId, o]));
  const rows: TimelineRow[] = data.models.map((m) => ({
    id: m.id,
    name: m.name,
    reasoning_effort: m.effort,
    benchmarks: {},
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const observation of data.observations) {
    const definition = byDefinition.get(observation.benchmarkId);
    if (
      definition &&
      !excludesVariantIndex(
        byId.get(observation.modelId)!,
        definition.key.replace(/^atlas_benchmark_/, ""),
      ) &&
      informativeBenchmark(definition, observation.value, parameters)
    )
      byId.get(observation.modelId)!.benchmarks[definition.id] = observation.value;
  }
  const predictors: TimelinePredictor[] = [];
  const cells: TimelineBenchmarkEvidence[] = [];
  for (const task of tasks) {
    const related = tasks
      .filter(
        (b) =>
          b.id !== task.id &&
          Boolean(b.primary) === Boolean(task.primary) &&
          (b.weights.intelligence * task.weights.intelligence > 0 ||
            b.weights.agentic * task.weights.agentic > 0),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const contexts = new Map<string, ReturnType<typeof prepareTimelineImputation>>();
    const indexContexts = indexes
      .filter(
        (index) =>
          index.weights.intelligence * task.weights.intelligence > 0 ||
          index.weights.agentic * task.weights.agentic > 0,
      )
      .map((index) => {
        const predictor = prepareTimelineImputation(rows, rows, task, [index], parameters, "index");
        predictors.push(predictor.details);
        return predictor;
      });
    for (const row of rows) {
      const observation = raw.get(row.id + "|" + task.id);
      if (observation) {
        cells.push({
          modelId: row.id,
          benchmarkId: task.id,
          value: observation.value,
          observed: true,
          confidence: 1,
          informative: informativeBenchmark(task, observation.value, parameters),
          inputs: [task.id],
          viaIndex: false,
        });
        continue;
      }
      const inputs = related.filter((b) => row.benchmarks[b.id] != null);
      const key = inputs.map((b) => b.id).join("|");
      let context = contexts.get(key);
      if (!context && inputs.length >= 3) {
        context = prepareTimelineImputation(rows, rows, task, inputs, parameters, "components");
        contexts.set(key, context);
        if (context.details.models > 0) predictors.push(context.details);
      }
      const candidates = [context, ...indexContexts].flatMap((predictor) => {
        const prediction = predictor?.predict(row);
        return prediction && informativeBenchmark(task, prediction.value, parameters)
          ? [{ ...prediction, predictor: predictor! }]
          : [];
      });
      // Task context takes precedence; correlated index editions are alternatives rather than independent votes.
      const best = candidates.sort(
        (a, b) =>
          Number(a.predictor.details.kind === "index") -
            Number(b.predictor.details.kind === "index") ||
          b.confidence - a.confidence ||
          a.predictor.details.id.localeCompare(b.predictor.details.id),
      )[0];
      if (best)
        cells.push({
          modelId: row.id,
          benchmarkId: task.id,
          value: best.value,
          observed: false,
          confidence: best.confidence,
          informative: true,
          inputs: best.predictor.details.inputs,
          viaIndex: best.predictor.details.kind === "index",
        });
    }
  }
  return { cells, predictors };
}

/** Retain endpoints as measurements, but exclude near-floor and near-ceiling probability scores from exact transfers. */
export function informativeBenchmark(
  benchmark: HistoricalBenchmark,
  value: number,
  parameters: TimelineParameters,
): boolean {
  if (!Number.isFinite(value)) return false;
  const percentage =
    benchmark.scale === "probability"
      ? value * 100
      : benchmark.key === "aa_intelligence_index"
        ? value
        : null;
  return (
    percentage == null ||
    (percentage > parameters.saturationLow && percentage < parameters.saturationHigh)
  );
}
