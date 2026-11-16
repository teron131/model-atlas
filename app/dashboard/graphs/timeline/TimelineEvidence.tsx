"use client";

/**
 * The Timeline's evidence as a relay across time: every benchmark and index the shown models were measured on is one thread over the months it measured them, whatever its versions and records, under the reference scale their results are translated onto, and beneath, each model sits at its typical miss, so where the scale's evidence comes from and how sure each era's placements are both read on the chart's own time axis.
 * Pointing at a star reads it out, and pointing anywhere along a thread reads the thread with the model measured on it nearest the pointer; a focused model's plumb line marks each benchmark it was measured on at its release, and the model picked on the chart lights its benchmarks and tables its results with the path each carries to the scale; the relay follows the chart's population, so the chart's window and lab filter zoom it.
 */

import { median } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { type KeyboardEvent, memo, useId, useMemo, useRef, useState } from "react";

import {
  type HistoricalDataset,
  type HistoricalModel,
  isCatalogBenchmark,
  isReferenceBenchmark,
  measureKey,
  type TimelinePredictor,
} from "../../../../src/model-atlas/timeline/schemas";
import {
  type ChecklistSort,
  SortButton,
  sortChecklist,
  useChecklistSort,
} from "../../shared/Checklist";
import { providerLogo } from "../../shared/provider-theme";
import { ChartReadout, type ReadoutEntry } from "../ChartReadout";
import { HorizonLightStops } from "../plot/Primitives";
import { useChartLayout } from "../use-chart-layout";
import { timelineModelName } from "./chart-data";
import { useTimelineData } from "./use-timeline-data";

import graphStyles from "../graphs.module.css";
import styles from "./evidence.module.css";

type Prepared = NonNullable<HistoricalDataset["prepared"]>;

type Thread = {
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

type Placement = {
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
type Focus = { kind: "thread"; id: string; model: string } | { kind: "model"; id: string };

const MAX_WIDTH = 1120;
const MARGIN = { left: 12, right: 12 };
const SCALE_Y = 18;
const THREADS_TOP = 34;
const BAND_GAP = 44;
const MISS_HEIGHT = 150;
const DAY = 86_400_000;
// The running median gathers the models released within this many days either side of each sample, wide enough to smooth a quiet quarter.
const MEDIAN_WINDOW = 75 * DAY;
const POINTER_REACH = 14;
// The scale's caption and a month label, both in the 11px caption monospace: "Reference scale" is 15 characters and "Jan 2024" 8, each 6.6px plus 8px of clearance.
const CAPTION_WIDTH = 15 * 6.6 + 8;
const TICK_HALF_WIDTH = (8 * 6.6) / 2;
// Each thread is named on a row of its own, one name tall with a pixel to spare, so no two names meet: 8px names on wide plots, and on phones the micro size, below which a name held in the hand is too small to read.
const THREAD_NAME_SIZE = { compact: 10, wide: 8 } as const;

function EvidenceRelay({
  data,
  prepared,
  models,
  selectedId,
  onSelect,
}: {
  data: HistoricalDataset;
  prepared: Prepared;
  models: HistoricalModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const relay = useMemo(() => buildRelay(data, prepared, models), [data, prepared, models]);
  const { plotHost, width, compact } = useChartLayout(MAX_WIDTH);
  const [hover, setHover] = useState<Focus | null>(null);
  // What the pointer last pointed at, set before the render that shows it, so a click picks that even while the readout catches up.
  const pointed = useRef<Focus | null>(null);
  const readoutId = useId();
  const gradientId = useId();
  const { threads, placements, signal, details } = relay;

  const nameSize = THREAD_NAME_SIZE[compact ? "compact" : "wide"];
  const pitch = nameSize + 1;
  const threadsBottom = THREADS_TOP + threads.length * pitch;
  const missTop = threadsBottom + BAND_GAP;
  const missBottom = missTop + MISS_HEIGHT;
  const stripY = missBottom + 34;
  const height = stripY + 12;
  const rowY = (row: number) => THREADS_TOP + row * pitch + pitch / 2;
  const dates = placements.map((placement) => placement.date);
  const x = scaleUtc()
    .domain([new Date(Math.min(...dates) - 10 * DAY), new Date(Math.max(...dates) + 10 * DAY)])
    .range([MARGIN.left, width - MARGIN.right]);
  const missMax = Math.max(
    20,
    Math.ceil(Math.max(...placements.map((placement) => placement.miss ?? 0)) / 10) * 10,
  );
  const y = scaleLinear().domain([0, missMax]).range([missBottom, missTop]);
  const starY = (placement: Placement) => (placement.miss == null ? stripY : y(placement.miss));
  const busiest = Math.max(...threads.map((thread) => thread.models.size));
  const labels = threadLabels(threads, x, rowY, nameSize);

  const pinned = selectedId != null && relay.placementById.has(selectedId) ? selectedId : null;
  const focus = hover ?? (pinned == null ? null : { kind: "model" as const, id: pinned });
  const trace = focus == null ? null : traceFocus(focus, relay);

  const locate = (event: {
    clientX: number;
    clientY: number;
    currentTarget: SVGSVGElement;
  }): Focus | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * width) / rect.width;
    const py = ((event.clientY - rect.top) * height) / rect.height;
    if (py >= THREADS_TOP - pitch && py < threadsBottom + pitch / 2) {
      const row = Math.max(0, Math.min(threads.length - 1, Math.floor((py - THREADS_TOP) / pitch)));
      const thread = threads[row]!;
      // A row reads only where its thread is drawn, from its name to its last measurement, so the pointer over a row's empty stretch never jumps to a model far from it.
      if (px < labels[row]!.left || px > x(thread.end) + POINTER_REACH) return null;
      let model = "";
      let reach = Infinity;
      for (const id of thread.models) {
        const d = Math.abs(x(relay.placementById.get(id)!.date) - px);
        if (d < reach) {
          model = id;
          reach = d;
        }
      }
      return { kind: "thread", id: thread.id, model };
    }
    let nearest: Placement | null = null;
    let distance = POINTER_REACH ** 2;
    for (const placement of placements) {
      const d = (x(placement.date) - px) ** 2 + (starY(placement) - py) ** 2;
      if (d < distance) {
        nearest = placement;
        distance = d;
      }
    }
    return nearest == null ? null : { kind: "model", id: nearest.id };
  };
  // Arrows walk the models in release order; Enter picks the one read out on the chart.
  const navigate = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = focus?.kind === "model" ? (relay.placementIndex.get(focus.id) ?? -1) : -1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? -1 : 1;
      const next = Math.max(0, Math.min(placements.length - 1, current < 0 ? 0 : current + step));
      setHover({ kind: "model", id: placements[next]!.id });
    } else if (event.key === "Enter" && focus?.kind === "model") {
      event.preventDefault();
      onSelect(focus.id);
    }
  };

  const medianPath = runningMedian(placements, x.domain().map(Number) as [number, number])
    .map(
      ([date, value], index) => `${index ? "L" : "M"}${x(date).toFixed(1)},${y(value).toFixed(1)}`,
    )
    .join("");
  const missTicks = y.ticks(4);
  const timeTicks = x.ticks(compact ? 4 : 7);
  const focusPlacement =
    focus == null
      ? undefined
      : relay.placementById.get(focus.kind === "model" ? focus.id : focus.model);

  return (
    <div className={styles.relay}>
      <div className={graphStyles.note}>
        <p className={graphStyles.evidenceCore}>{signal}</p>
        {details.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
        <p className={styles.legend}>
          <span>
            <i aria-hidden="true" />
            Benchmark
          </span>
          <span>
            <i data-index aria-hidden="true" />
            Index
          </span>
          <span>
            <i data-measured aria-hidden="true" />
            Measured by the model in focus
          </span>
        </p>
      </div>
      <div id={readoutId} className={styles.readout} role="status">
        <FocusReadout focus={focus} relay={relay} />
      </div>
      <div className={styles.plot} {...plotHost}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Evidence relay: ${threads.length} benchmarks and indexes as threads across time above each model's typical miss. Use the left and right arrow keys to read models in release order, and Enter to pick one.`}
          aria-describedby={readoutId}
          tabIndex={0}
          // A click picks without taking focus, so the focus ring shows only for keyboard use.
          onMouseDown={(event) => event.preventDefault()}
          onPointerMove={(event) => {
            pointed.current = locate(event);
            setHover(pointed.current);
          }}
          onPointerLeave={() => {
            pointed.current = null;
            setHover(null);
          }}
          // A click picks what the pointer last read out: pointer moves carry fractional pixels and clicks whole ones, so locating again can land on a neighbouring star; a tap, which leaves nothing pointed at, locates.
          onClick={(event) => {
            const hit = pointed.current ?? locate(event);
            if (hit) onSelect(hit.kind === "model" ? hit.id : hit.model);
          }}
          onKeyDown={navigate}
          onBlur={() => setHover(null)}
        >
          <defs>
            {/* A horizontal line has no height for a bounding-box gradient to span, so the light is laid in plot units. */}
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={0}
              y2={0}
            >
              <HorizonLightStops />
            </linearGradient>
          </defs>
          <text className={styles.caption} x={MARGIN.left} y={SCALE_Y - 7}>
            Reference scale
          </text>
          {/* The threads read their dates here too, far above the miss plot's axis; a date that would run into the caption is left to that axis. */}
          {timeTicks.map((tick) =>
            x(tick) - TICK_HALF_WIDTH < MARGIN.left + CAPTION_WIDTH ? null : (
              <text
                key={tick.getTime()}
                className={styles.tick}
                x={x(tick)}
                y={SCALE_Y - 7}
                textAnchor="middle"
              >
                {MONTH.format(tick)}
              </text>
            ),
          )}
          <line
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={SCALE_Y}
            y2={SCALE_Y}
            stroke={`url(#${gradientId})`}
            strokeWidth={1.5}
          />
          {threads.map((thread, row) => {
            const lit = trace == null || trace.threads.has(thread.id);
            const weight = 0.3 + 0.7 * Math.sqrt(thread.models.size / busiest);
            return (
              <line
                key={thread.id}
                className={styles.thread}
                data-index={thread.index || undefined}
                data-lit={(trace != null && lit) || undefined}
                data-focus={(focus?.kind === "thread" && focus.id === thread.id) || undefined}
                x1={x(thread.start)}
                x2={Math.max(x(thread.start) + 2, x(thread.end))}
                y1={rowY(row)}
                y2={rowY(row)}
                strokeWidth={compact ? 1.2 : 1.6}
                strokeOpacity={lit ? weight : 0.1}
              />
            );
          })}
          {labels.map(({ thread, left, width: labelWidth, y: labelY }, row) => (
            <g
              key={thread.id}
              data-focus={(focus?.kind === "thread" && focus.id === thread.id) || undefined}
              opacity={trace == null || trace.threads.has(thread.id) ? 1 : 0.25}
            >
              <rect
                className={styles.labelBack}
                x={left - 3}
                y={rowY(row) - pitch / 2}
                width={labelWidth + 6}
                height={pitch}
              />
              <text className={styles.label} x={left} y={labelY} fontSize={nameSize}>
                {thread.label}
              </text>
            </g>
          ))}
          <text className={styles.caption} x={MARGIN.left} y={missTop - 20}>
            Typical miss, ± reference-score points
          </text>
          {missTicks.map((tick) => (
            <g key={tick}>
              <line
                className={styles.grid}
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className={styles.tick} x={MARGIN.left} y={y(tick) - 3}>
                {tick}
              </text>
            </g>
          ))}
          {timeTicks.map((tick) => (
            <text
              key={tick.getTime()}
              className={styles.tick}
              x={x(tick)}
              y={missBottom + 16}
              textAnchor="middle"
            >
              {MONTH.format(tick)}
            </text>
          ))}
          <text className={styles.caption} x={MARGIN.left} y={stripY - 7}>
            No typical miss
          </text>
          {focusPlacement ? (
            <>
              <line
                className={styles.plumb}
                x1={x(focusPlacement.date)}
                x2={x(focusPlacement.date)}
                y1={starY(focusPlacement)}
                y2={SCALE_Y}
              />
              {threads.map((thread, row) =>
                thread.models.has(focusPlacement.id) ? (
                  <circle
                    key={thread.id}
                    className={styles.crossing}
                    cx={x(focusPlacement.date)}
                    cy={rowY(row)}
                    r={2.2}
                  />
                ) : null,
              )}
            </>
          ) : null}
          {placements.map((placement) => {
            const lit = trace?.models.has(placement.id) ?? false;
            return (
              <circle
                key={placement.id}
                className={styles.star}
                data-lit={lit || undefined}
                data-strip={placement.miss == null || undefined}
                cx={x(placement.date)}
                cy={starY(placement)}
                r={lit ? 2.6 : 1.6}
                opacity={trace == null || lit ? undefined : 0.15}
              />
            );
          })}
          {medianPath ? <path className={styles.median} d={medianPath} /> : null}
        </svg>
      </div>
      {pinned != null ? (
        <PickedResults
          placement={relay.placementById.get(pinned)!}
          names={relay.names}
          threadOf={relay.threadOf}
          data={data}
          prepared={prepared}
        />
      ) : null}
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });

function FocusReadout({ focus, relay }: { focus: Focus | null; relay: Relay }) {
  if (focus == null)
    return (
      <p className={styles.hint}>
        Point at a star, or anywhere along a thread to read it with the model measured nearest the
        pointer; picking a model on the chart lights the benchmarks it was measured on.
      </p>
    );
  const model = modelEntry(
    relay.placementById.get(focus.kind === "model" ? focus.id : focus.model)!,
    relay,
  );
  if (focus.kind === "model") return <ChartReadout label="Model in focus" entry={model} />;
  return (
    <>
      <ChartReadout
        label="Benchmark in focus"
        entry={threadEntry(relay.threadById.get(focus.id)!)}
      />
      <ChartReadout label="Model in focus" entry={model} />
    </>
  );
}

function threadEntry(thread: Thread): ReadoutEntry {
  const { best, accepted, total } = thread.validation;
  return {
    name: thread.label,
    logo: "",
    facts: [
      thread.index ? "Index" : "Benchmark",
      `${thread.models.size} models measured`,
      `${MONTH.format(thread.start)} – ${MONTH.format(thread.end)}`,
      `carries ${thread.carried} to the scale`,
      ...(best?.error == null
        ? ["no validated prediction"]
        : [
            `best accepted prediction within ${best.error.toFixed(1)} normalized points, baseline ${best.baselineError?.toFixed(1) ?? "n/a"}`,
            `${accepted} of ${total} predictors accepted`,
          ]),
    ],
  };
}

function modelEntry(placement: Placement, relay: Relay): ReadoutEntry {
  const placing = placement.paths.length;
  const measured = relay.measuredCount.get(placement.id) ?? 0;
  return {
    name: placement.name,
    logo: providerLogo(placement.provider),
    facts: [
      MONTH.format(placement.date),
      placement.miss != null
        ? `typically within ±${placement.miss.toFixed(1)}`
        : placing
          ? "placed only by benchmarks too rarely measured alongside others"
          : "no benchmark path",
      `${measured} benchmark${measured === 1 ? "" : "s"} measured`,
      ...(placing ? [`placed by ${placing} benchmark${placing === 1 ? "" : "s"}`] : []),
      ...(placement.beyond >= 1
        ? [
            `${Math.round(placement.beyond)} points beyond where ${placing === 1 ? "it was" : "they were"} checked`,
          ]
        : []),
    ],
  };
}

type ResultRow = {
  id: string;
  name: string;
  value: number;
  /** An estimate's evidence factor; `null` for a measured result. */
  factor: number | null;
  /** The benchmarks between this one and the reference scale, empty for a direct path; `null` when no path starts here. */
  via: string[] | null;
};

const RESULT_SORT_DIRECTIONS = {
  benchmark: "ascending",
  evidence: "descending",
  path: "ascending",
} as const;

type ResultSortKey = keyof typeof RESULT_SORT_DIRECTIONS;

/** The picked model's results, one row per benchmark: each it was measured on with its reported value and the path to the reference scale that starts there, if any, then each the evidence estimates for it at the estimate's evidence factor. */
function PickedResults({
  placement,
  names,
  threadOf,
  data,
  prepared,
}: {
  placement: Placement;
  names: ReadonlyMap<string, string>;
  threadOf: ReadonlyMap<string, string>;
  data: HistoricalDataset;
  prepared: Prepared;
}) {
  const [sort, sortBy] = useChecklistSort((key: ResultSortKey) => RESULT_SORT_DIRECTIONS[key], {
    key: "evidence",
    direction: "descending",
  });
  const reference = new Set(
    data.benchmarks.filter(isReferenceBenchmark).map((benchmark) => benchmark.id),
  );
  const name = (id: string) => names.get(id) ?? id;
  // Every path starts at a benchmark the model was measured on, and no two start at the same one.
  // A path reads by measure, so a step through another version or record of the benchmark itself, or a repeat of the step before, is not shown: "AA 4.0 → AA 4.1.1 → scale" reaches the scale directly.
  const viaByStart = new Map(
    placement.paths.map(([start, ...rest]) => {
      const steps = rest.slice(0, -1).map((id) => threadOf.get(id) ?? id);
      const own = threadOf.get(start!) ?? start!;
      return [start!, steps.filter((id, i) => id !== own && id !== steps[i - 1])];
    }),
  );
  const observed: ResultRow[] = data.observations.flatMap((observation) =>
    observation.modelId === placement.id && !reference.has(observation.benchmarkId)
      ? [
          {
            id: observation.benchmarkId,
            name: name(observation.benchmarkId),
            value: observation.rawValue ?? observation.value,
            factor: null,
            via: viaByStart.get(observation.benchmarkId) ?? null,
          },
        ]
      : [],
  );
  // Two records of one measure share a name and read as one row, the one that places the model when either does.
  const byName = new Map<string, ResultRow>();
  for (const row of observed)
    if (!byName.has(row.name) || (row.via != null && byName.get(row.name)!.via == null))
      byName.set(row.name, row);
  const measured = [...byName.values()];
  const estimated: ResultRow[] = prepared.evidence.cells.flatMap((cell) =>
    cell.modelId === placement.id && !cell.observed
      ? [
          {
            id: cell.benchmarkId,
            name: name(cell.benchmarkId),
            value: cell.value,
            factor: cell.confidence,
            via: null,
          },
        ]
      : [],
  );
  const rows = sortChecklist(
    [...measured, ...estimated],
    sort,
    (row) =>
      sort.key === "benchmark"
        ? row.name
        : sort.key === "evidence"
          ? (row.factor ?? 1)
          : (row.via?.length ?? null),
    (row) => row.name,
  );
  const carriers = placement.paths.length;
  return (
    <div className={styles.results}>
      <p>
        <strong>{placement.name}</strong> is measured on {measured.length} benchmark
        {measured.length === 1 ? "" : "s"}
        {carriers
          ? `, ${carriers} of which ${carriers === 1 ? "carries" : "carry"} it to the reference scale`
          : ", none of which carries it to the reference scale"}
        {estimated.length
          ? `, and estimated on ${estimated.length}, each counting at its evidence factor`
          : ""}
        .
      </p>
      <div className={graphStyles.evidenceTableWrap}>
        <table className={`${graphStyles.evidenceTable} ${styles.resultsTable}`}>
          <thead>
            <tr>
              <ResultSortHeader label="Benchmark" sortKey="benchmark" sort={sort} onSort={sortBy} />
              <th scope="col">Result</th>
              <ResultSortHeader label="Evidence" sortKey="evidence" sort={sort} onSort={sortBy} />
              <ResultSortHeader label="Path to scale" sortKey="path" sort={sort} onSort={sortBy} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-estimated={row.factor != null || undefined}>
                <th scope="row">{row.name}</th>
                <td>{Number(row.value.toPrecision(4))}</td>
                <td>
                  {row.factor == null ? (
                    "Measured"
                  ) : (
                    <>
                      Estimated <em>{Math.round(row.factor * 100)}%</em>
                    </>
                  )}
                </td>
                <td>
                  {row.via == null
                    ? null
                    : row.via.length
                      ? `via ${row.via.map(name).join(" → ")}`
                      : "direct"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultSortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: ResultSortKey;
  sort: ChecklistSort<ResultSortKey>;
  onSort: (key: ResultSortKey) => void;
}) {
  const direction = sort.key === sortKey ? sort.direction : "none";
  return (
    <th scope="col" aria-sort={direction}>
      <SortButton direction={direction} onSort={() => onSort(sortKey)}>
        {label}
      </SortButton>
    </th>
  );
}

type Relay = ReturnType<typeof buildRelay>;

/** Derive the relay from the published evidence for the shown models: threads span the release dates of the shown models measured on them and count the shown models whose placement passes through them. */
function buildRelay(data: HistoricalDataset, prepared: Prepared, models: HistoricalModel[]) {
  const root = data.rootBenchmarkIds.intelligence;
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
    root,
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
function traceFocus(focus: Focus, relay: Relay) {
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
function runningMedian(placements: Placement[], [from, to]: [number, number]): [number, number][] {
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

/** Name every thread just before its start, or from the plot's left edge where the name would not fit there, backed by paper where it covers the thread's own start. */
function threadLabels(
  threads: Thread[],
  x: (date: number) => number,
  rowY: (row: number) => number,
  size: number,
) {
  return threads.map((thread, row) => {
    // The monospace's advance is about 0.6 of its size, and a baseline 0.3 of its size below the row's middle centres its lowercase there.
    const width = thread.label.length * size * 0.6;
    return {
      thread,
      left: Math.max(MARGIN.left, x(thread.start) - 5 - width),
      width,
      y: rowY(row) + size * 0.3,
    };
  });
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

/** Mounting requests the full `/api/timeline` evidence, so the panel mounts this only once its disclosure opens; the relay follows `modelIds`, the chart's current population, and lights `selectedId`, the chart's picked model. */
export const TimelineEvidence = memo(function TimelineEvidence({
  modelIds,
  selectedId,
  onSelect,
}: {
  modelIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, error, retry } = useTimelineData(
    "/api/timeline",
    "Unable to load evidence.",
    requirePrepared,
  );
  const models = useMemo(() => {
    const byId = new Map(data?.models.map((model) => [model.id, model]));
    return modelIds.flatMap((id) => {
      const model = byId.get(id);
      return model ? [model] : [];
    });
  }, [data, modelIds]);
  if (!data?.prepared)
    return (
      <p role="status">
        {error || "Loading evidence…"}
        {error && (
          <button type="button" onClick={retry}>
            Retry
          </button>
        )}
      </p>
    );
  if (!models.length) return <p role="status">No charted models in this window.</p>;
  return (
    <EvidenceRelay
      data={data}
      prepared={data.prepared}
      models={models}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
});

function requirePrepared(body: HistoricalDataset) {
  if (!body.prepared) throw new Error("Published evidence is unavailable.");
}
