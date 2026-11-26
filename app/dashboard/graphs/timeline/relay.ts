/** The Timeline's evidence relay as data: one thread per measure across the months it measured the shown models, each shown model's placement on the reference scale with its typical miss, and the words and lookups the relay's chart and readouts read. */

import { median } from "d3-array";

import {
  type HistoricalDataset,
  type HistoricalModel,
  isCatalogBenchmark,
  isReferenceBenchmark,
  measureKey,
  type TimelinePredictor,
} from "../../../../src/model-atlas/timeline/schemas";
import { DAY_MS, timelineModelName } from "./chart-data";

export type Prepared = NonNullable<HistoricalDataset["prepared"]>;

export type Thread = {
  id: string;
  label: string;
  index: boolean;
  start: number;
  end: number;
  /** The shown models measured on it. */
  models: ReadonlySet<string>;
  /** Shown models whose placement passes through it on the way to the scale. */
  carried: number;
  validation: { accepted: number; total: number; best: TimelinePredictor | null };
};

export type Placement = {
  id: string;
  name: string;
  provider: string;
  date: number;
  /** Reference-score points within which the position typically lies of where more benchmarks would settle it; `null` when no checked benchmark places the model. */
  miss: number | null;
  /** Reference-score points beyond every range its benchmarks were checked at. */
  beyond: number;
  paths: string[][];
};

/** A thread focus also names the model measured on it nearest the pointer's date, as the vertical the pointer reads. */
export type Focus = { kind: "thread"; id: string; model: string } | { kind: "model"; id: string };

// The running median gathers the models released within this many days either side of each sample, wide enough to smooth a quiet quarter.
const MEDIAN_WINDOW = 75 * DAY_MS;

export type Relay = ReturnType<typeof buildRelay>;

/** Derive the relay from the published evidence for the shown models: threads span the release dates of the shown models measured on them and count the shown models whose placement passes through them. */
export function buildRelay(data: HistoricalDataset, prepared: Prepared, models: HistoricalModel[]) {
  const calibration = prepared.calibrations.intelligence;
  const estimates = new Map(calibration.estimates.map((estimate) => [estimate.modelId, estimate]));
  const definitions = new Map(data.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const threadOf = measureThreads(data.benchmarks);
  const names = benchmarkNames(data.benchmarks, threadOf);
  const placements: Placement[] = models
    .flatMap((model) => {
      const estimate = estimates.get(model.id);
      if (!model.releaseDate || !estimate) return [];
      return [
        {
          id: model.id,
          name: timelineModelName(model),
          provider: model.provider,
          date: Date.parse(model.releaseDate),
          miss: estimate.uncertainty?.typicalMiss ?? null,
          beyond: estimate.uncertainty?.beyondChecked ?? 0,
          paths: estimate.paths,
        },
      ];
    })
    .sort((a, b) => a.date - b.date);
  const shown = new Map(placements.map((placement) => [placement.id, placement]));

  const spans = new Map<string, { start: number; end: number; models: Set<string> }>();
  const measuredCount = new Map<string, number>();
  for (const observation of data.observations) {
    const placement = shown.get(observation.modelId);
    const definition = definitions.get(observation.benchmarkId);
    if (!placement || !definition || isReferenceBenchmark(definition)) continue;
    const id = threadOf.get(definition.id)!;
    const span = spans.get(id) ?? {
      start: placement.date,
      end: placement.date,
      models: new Set(),
    };
    if (!span.models.has(placement.id))
      measuredCount.set(placement.id, (measuredCount.get(placement.id) ?? 0) + 1);
    span.start = Math.min(span.start, placement.date);
    span.end = Math.max(span.end, placement.date);
    span.models.add(placement.id);
    spans.set(id, span);
  }

  const carried = new Map<string, Set<string>>();
  for (const placement of placements) {
    for (const path of placement.paths) {
      for (const step of path.slice(0, -1)) {
        const id = threadOf.get(step)!;
        const through = carried.get(id) ?? new Set();
        through.add(placement.id);
        carried.set(id, through);
      }
    }
  }

  const thread = (id: string) => threadOf.get(id) ?? id;
  // A link between two records of one measure predicts nothing across benchmarks.
  const crossing = [...prepared.evidence.predictors, ...calibration.predictors].filter(
    (predictor) => predictor.inputs.some((input) => thread(input) !== thread(predictor.target)),
  );
  const predictors = new Map<string, TimelinePredictor[]>();
  for (const predictor of crossing) {
    const id = thread(predictor.target);
    const list = predictors.get(id) ?? [];
    list.push(predictor);
    predictors.set(id, list);
  }

  const threads: Thread[] = [...spans]
    .map(([id, span]) => {
      const definition = definitions.get(id)!;
      const validated = predictors.get(id) ?? [];
      const accepted = validated.filter(
        (predictor) => predictor.accepted && predictor.error != null,
      );
      return {
        id,
        label: names.get(id)!,
        index: definition.kind === "index",
        start: span.start,
        end: span.end,
        models: span.models,
        carried: carried.get(id)?.size ?? 0,
        validation: {
          accepted: accepted.length,
          total: validated.length,
          best: accepted.reduce<TimelinePredictor | null>(
            (best, predictor) =>
              best == null || predictor.error! < best.error! ? predictor : best,
            null,
          ),
        },
      };
    })
    .sort((a, b) => a.start - b.start || b.models.size - a.models.size);

  const pathed = placements.filter((placement) => placement.paths.length);
  const acceptedErrors = crossing.flatMap((predictor) =>
    predictor.accepted && predictor.error != null ? [predictor.error] : [],
  );
  const unpathed = placements.length - pathed.length;
  const signal = `${pathed.length} of ${placements.length} models reach the reference scale through ${threads.length} benchmarks and indexes${unpathed ? `; ${unpathed} have no recorded path` : ""}.`;
  const details = [
    `A placed model sits typically within ±${median(placements, (placement) => placement.miss)?.toFixed(1) ?? "n/a"} reference-score points of where more benchmarks would settle it: each benchmark is checked by leaving it out and comparing it with the other benchmarks of the models it measured, more benchmarks narrow a model's range, and sitting far from where its benchmarks were checked widens it.`,
    `Accepted predictors, each translating one benchmark's results into another's, predict withheld results within a median ${median(acceptedErrors)?.toFixed(1) ?? "n/a"} normalized points, each a percent of the predicted benchmark's range.`,
  ];

  return {
    threads,
    placements,
    signal,
    details,
    names,
    measuredCount,
    threadOf,
    threadById: new Map(threads.map((thread) => [thread.id, thread])),
    placementById: shown,
    placementIndex: new Map(placements.map((placement, index) => [placement.id, index])),
  };
}

/** What a focus lights: the threads its model was measured on or is placed through, and that model's star, or for a thread, the stars of every model measured on it. */
export function traceFocus(focus: Focus, relay: Relay) {
  const placement = relay.placementById.get(focus.kind === "model" ? focus.id : focus.model)!;
  const threads = new Set(placement.paths.flat().map((id) => relay.threadOf.get(id)!));
  for (const thread of relay.threads) if (thread.models.has(placement.id)) threads.add(thread.id);
  return {
    threads,
    models:
      focus.kind === "model" ? new Set([placement.id]) : relay.threadById.get(focus.id)!.models,
  };
}

/** The median typical miss of the models released within `MEDIAN_WINDOW` of each of 48 evenly spaced dates, skipping dates with fewer than five such models. */
export function runningMedian(
  placements: Placement[],
  [from, to]: [number, number],
): [number, number][] {
  const checked = placements.filter((placement) => placement.miss != null);
  return Array.from({ length: 48 }, (_, index) => from + ((to - from) * index) / 47).flatMap(
    (date) => {
      const near = checked.filter((placement) => Math.abs(placement.date - date) <= MEDIAN_WINDOW);
      return near.length < 5
        ? []
        : [[date, median(near, (placement) => placement.miss)!] as [number, number]];
    },
  );
}

/** Each benchmark's name is its thread's, so every record of one measure reads the same; only different measures sharing a label take their source, the id's first segment: "epoch:index:eci" → "epoch". */
function benchmarkNames(
  benchmarks: HistoricalDataset["benchmarks"],
  threadOf: ReadonlyMap<string, string>,
) {
  const definitions = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const threads = new Map<string, Set<string>>();
  for (const thread of new Set(threadOf.values())) {
    const label = benchmarkLabel(definitions.get(thread)!.label);
    threads.set(label, (threads.get(label) ?? new Set()).add(thread));
  }
  return new Map(
    benchmarks.map((benchmark) => {
      const thread = threadOf.get(benchmark.id)!;
      const label = benchmarkLabel(definitions.get(thread)!.label);
      return [
        benchmark.id,
        threads.get(label)!.size > 1 ? `${label} (${thread.split(":")[0]})` : label,
      ];
    }),
  );
}

/** Each benchmark's thread: all records of one measure, such as an index's versions or an index imported from its publisher's archive and read again by the catalog, draw as one thread under the catalog's record when there is one. */
function measureThreads(benchmarks: HistoricalDataset["benchmarks"]): Map<string, string> {
  const representative = new Map<string, string>();
  for (const benchmark of benchmarks) {
    const measure = measureKey(benchmark);
    if (!representative.has(measure) || isCatalogBenchmark(benchmark))
      representative.set(measure, benchmark.id);
  }
  return new Map(
    benchmarks.map((benchmark) => [benchmark.id, representative.get(measureKey(benchmark))!]),
  );
}

/** The import origin stays in source metadata rather than repeating in every benchmark label. */
function benchmarkLabel(label: string): string {
  return label.replace(/ \(Model Atlas\)$/, "");
}
