/** Measure historical support against actual observed index editions, independently of model age, score, and display filters. */
import { qualityIndexBreadth } from "../benchmarks/index-policy";
import { STAGE_CONFIG } from "../config/stage";
import { effectiveSampleSize } from "../math-utils";
import { evidenceMassConfidence } from "../pipeline/scores/normalization";
import type { HistoricalDataset, HistoricalEstimate, TimelineDimension } from "./schemas";

export const MINIMUM_TIMELINE_TASKS = 3;

/** Envelope support includes the breadth of selected observed indexes without creating direct tasks or adding overlapping portfolios together. */
export function timelineCoverage(
  data: HistoricalDataset,
  dimension: TimelineDimension,
  estimates: readonly Pick<HistoricalEstimate, "modelId" | "value" | "paths">[],
) {
  const definitions = new Map(data.benchmarks.map((b) => [b.id, b]));
  const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const taskNames = new Map<string, HistoricalDataset["benchmarks"][number]>();
  for (const benchmark of data.benchmarks) {
    if (benchmark.kind !== "task") continue;
    taskNames.set(nameKey(benchmark.label), benchmark);
    taskNames.set(nameKey(benchmark.key.replace(/^atlas_benchmark_/, "")), benchmark);
  }
  const portfolios = data.benchmarks.flatMap((index) => {
    if (index.kind !== "index" || index.key.startsWith("model_atlas_") || !index.componentIds)
      return [];
    const components = [
      ...new Map(
        index.componentIds.flatMap((id) => {
          const b = definitions.get(id);
          return b?.kind === "task" &&
            b.weights[dimension] > 0 &&
            !b.id.includes(":unresolved-edition")
            ? [[b.key, b] as const]
            : [];
        }),
      ).values(),
    ];
    return components.length < MINIMUM_TIMELINE_TASKS
      ? []
      : [
          {
            id: index.id,
            components,
            weight: components.reduce((sum, b) => sum + b.weights[dimension], 0),
          },
        ];
  });
  const observed = new Map<string, Set<string>>();
  const coverage = new Map<string, { fraction: number; source: string | null }>();
  const root = data.rootBenchmarkIds[dimension];
  for (const observation of data.observations) {
    const definition = definitions.get(observation.benchmarkId);
    if (
      !definition ||
      !Number.isFinite(observation.value) ||
      (definition.scale === "probability" && (observation.value < 0 || observation.value > 1))
    )
      continue;
    const ids = observed.get(observation.modelId) ?? new Set<string>();
    ids.add(observation.benchmarkId);
    observed.set(observation.modelId, ids);
    if (observation.benchmarkId === root)
      coverage.set(observation.modelId, {
        fraction: observation.referenceConfidence ?? 0,
        source: root,
      });
  }
  const observations = new Map(data.observations.map((o) => [`${o.modelId}|${o.benchmarkId}`, o]));
  const thresholds = STAGE_CONFIG.scoring.qualityCoverage[dimension];
  for (const estimate of estimates) {
    if (estimate.value == null) continue;
    let best = coverage.get(estimate.modelId) ?? { fraction: 0, source: null };
    const directTasks = new Map<string, number>();
    for (const path of estimate.paths) {
      const definition = definitions.get(path[0]!);
      if (
        definition?.kind === "task" &&
        definition.weights[dimension] > 0 &&
        observed.get(estimate.modelId)?.has(definition.id)
      )
        directTasks.set(definition.key, definition.weights[dimension]);
    }
    const directSupport = evidenceMassConfidence(
      effectiveSampleSize([...directTasks.values()]),
      thresholds.floor,
      thresholds.full,
    );
    if (directSupport > best.fraction) best = { fraction: directSupport, source: "direct" };
    for (const path of estimate.paths) {
      const id = path[0]!;
      const definition = definitions.get(id);
      const observation = observations.get(`${estimate.modelId}|${id}`);
      if (
        !definition ||
        definition.kind !== "index" ||
        definition.key.startsWith("model_atlas_") ||
        definition.weights[dimension] <= 0 ||
        !observation ||
        !observed.get(estimate.modelId)?.has(id)
      )
        continue;
      let breadth = qualityIndexBreadth(
        definition.key.replace(/^atlas_benchmark_/, ""),
        [],
        observation.benchmarkCount ?? definition.representedBenchmarks,
      );
      if (dimension === "agentic") {
        // General capability remains a scoring proxy; only identified Agentic constituents establish Agentic-specific envelope support.
        const members = [
          ...(definition.componentIds ?? []).flatMap((id) => definitions.get(id) ?? []),
          ...(observation.benchmarkNames ?? definition.benchmarkNames ?? []).flatMap(
            (name) => taskNames.get(nameKey(name)) ?? [],
          ),
        ];
        const relevant = new Set(
          members.filter((b) => b.kind === "task" && b.weights.agentic > 0).map((b) => b.key),
        );
        breadth = Math.min(breadth, relevant.size);
      }
      const fraction = evidenceMassConfidence(breadth, thresholds.floor, thresholds.full);
      if (fraction > best.fraction) best = { fraction, source: id };
    }
    coverage.set(estimate.modelId, best);
  }
  for (const model of data.models) {
    const ids = observed.get(model.id) ?? new Set<string>();
    let best = coverage.get(model.id) ?? { fraction: 0, source: null };
    for (const portfolio of portfolios) {
      if (!ids.has(portfolio.id)) continue;
      const measured = portfolio.components.filter((b) => ids.has(b.id));
      if (measured.length < MINIMUM_TIMELINE_TASKS) continue;
      const fraction =
        measured.reduce((sum, b) => sum + b.weights[dimension], 0) / portfolio.weight;
      if (fraction > best.fraction) best = { fraction, source: portfolio.id };
    }
    coverage.set(model.id, best);
  }
  return coverage;
}
