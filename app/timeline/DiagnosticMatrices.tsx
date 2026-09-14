"use client";

/** Color-only matrices expose retained model evidence and contextual imputation validation without a wall of numerical cells. */
import { useMemo, useState } from "react";

import type {
  HistoricalCalibration,
  HistoricalDataset,
  HistoricalModel,
  TimelineBenchmarkEvidence,
  TimelinePredictor,
} from "../../src/model-atlas/timeline/types";
import { MatrixOverview } from "./MatrixOverview";
import { timelineModelName } from "./model-display";

import styles from "./timeline.module.css";

type Axis = { id: string; label: string };
const EVIDENCE_COLORS = ["#51aa91", "#567caa", "#a57bd6"] as const;
const ERROR_COLORS = Array.from(
  { length: 16 },
  (_, index) => `hsl(25 80% ${20 + (index * 45) / 15}%)`,
);

export function DiagnosticMatrices({
  data,
  models,
  calibration,
  evidence,
  benchmarkPredictors,
  maxError,
  onSelect,
}: {
  data: HistoricalDataset;
  models: HistoricalModel[];
  calibration: HistoricalCalibration | null;
  evidence: TimelineBenchmarkEvidence[];
  benchmarkPredictors: TimelinePredictor[];
  maxError: number;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const observations = useMemo(
    () => new Map(data.observations.map((row) => [`${row.modelId}|${row.benchmarkId}`, row])),
    [data],
  );
  const reconstructed = useMemo(
    () => new Map(evidence.map((cell) => [`${cell.modelId}|${cell.benchmarkId}`, cell])),
    [evidence],
  );
  const estimates = useMemo(
    () => new Map(calibration?.estimates.map((row) => [row.modelId, row]) ?? []),
    [calibration],
  );
  const usedBenchmarks = useMemo(
    () => new Map([...estimates].map(([id, estimate]) => [id, new Set(estimate.paths.flat())])),
    [estimates],
  );
  const names = useMemo(
    () =>
      new Map(data.benchmarks.map((benchmark) => [benchmark.id, benchmarkLabel(benchmark.label)])),
    [data.benchmarks],
  );
  const validation = useMemo(() => {
    const targets = new Map<string, Axis>();
    const contexts = new Map<string, Axis>();
    const cells = new Map<string, NonNullable<HistoricalCalibration>["predictors"][number]>();
    for (const predictor of [...benchmarkPredictors, ...(calibration?.predictors ?? [])]) {
      const context = predictor.inputs.join("|");
      targets.set(predictor.target, {
        id: predictor.target,
        label: names.get(predictor.target) ?? predictor.target,
      });
      if (!contexts.has(context))
        contexts.set(context, {
          id: context,
          label:
            predictor.inputs.length === 1
              ? (names.get(context) ?? context)
              : `${predictor.inputs.length} benchmark inputs`,
        });
      cells.set(`${predictor.target}|${context}`, predictor);
    }
    return { rows: [...targets.values()], columns: [...contexts.values()], cells };
  }, [names, calibration, benchmarkPredictors]);
  const columns = data.benchmarks.map((row) => ({ id: row.id, label: benchmarkLabel(row.label) }));
  const search = query.toLowerCase();
  const rows = models
    .map((model) => ({ id: model.id, label: timelineModelName(model) }))
    .filter((row) => row.label.toLowerCase().includes(search));
  return (
    <div className={styles.matrices}>
      <section className={styles.matrixSection}>
        <header className={styles.matrixHeader}>
          <div>
            <h2>Model evidence</h2>
            <p>Measured results and estimated gaps across the model landscape.</p>
          </div>
          <label className={styles.matrixSearch}>
            Find a model
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search model names"
            />
          </label>
        </header>
        <div className={styles.matrixLegend}>
          <span>
            <i style={{ background: "#51aa91" }} />
            Used measurement
          </span>
          <span>
            <i style={{ background: "#567caa" }} />
            Other measurement
          </span>
          <span>
            <i style={{ background: "#a57bd6" }} />
            Estimated result
          </span>
          <span>
            <i style={{ background: "var(--hover)" }} />
            No evidence
          </span>
        </div>
        <MatrixOverview
          label="Model evidence overview"
          rowLabel="models"
          rowDescription="Highest score at the top"
          columnDescription="Each column is one evaluation edition"
          columnLabel="benchmark editions"
          colors={EVIDENCE_COLORS}
          rows={rows}
          columns={columns}
          status={(row, column) => {
            const key = row.id + "|" + column.id;
            if (observations.has(key)) return usedBenchmarks.get(row.id)?.has(column.id) ? 0 : 1;
            return reconstructed.has(key) ? 2 : null;
          }}
          cell={(row, column) => {
            const observation = observations.get(`${row.id}|${column.id}`);
            const estimate = estimates.get(row.id);
            const path = estimate?.paths.find((path) => path.includes(column.id));
            const inferred = reconstructed.get(`${row.id}|${column.id}`);
            if (!observation && inferred)
              return {
                detail: {
                  title: row.label,
                  subtitle: column.label,
                  status: "Estimated",
                  tone: "inferred",
                  metrics: [
                    { label: "Estimated value", value: inferred.value.toPrecision(4) },
                    {
                      label: "Validation credit",
                      value: (inferred.confidence * 100).toFixed(1) + "%",
                    },
                  ],
                  notes: [
                    {
                      label: inferred.viaIndex ? "Index context" : "Benchmark context",
                      value: inferred.inputs.map((id) => names.get(id) ?? benchmarkLabel(id)),
                    },
                    {
                      label: "Score use",
                      value: path ? "Used in this estimate" : "Not used in the displayed score",
                    },
                    {
                      label: "Evidence",
                      value: "Estimated from other results; not a measured observation.",
                    },
                  ],
                },
                select: () => onSelect(row.id),
              };
            if (!observation)
              return {
                detail: { title: row.label, subtitle: column.label, status: "No observation" },
              };
            const pathNames = path?.map((id) => names.get(id) ?? benchmarkLabel(id)).join(" → ");
            return {
              detail: {
                title: row.label,
                subtitle: column.label,
                status: path ? "Used measurement" : "Other measurement",
                tone: path ? "used" : "observed",
                metrics: [
                  { label: "Raw value", value: String(observation.rawValue ?? observation.value) },
                  { label: "Normalized value", value: observation.value.toPrecision(4) },
                ],
                notes: [
                  { label: "Source", value: observation.source },
                  ...(pathNames ? [{ label: "Transfer path", value: pathNames }] : []),
                ],
              },
              select: () => onSelect(row.id),
            };
          }}
        />
      </section>
      <section className={styles.matrixSection}>
        <header className={styles.matrixHeader}>
          <div>
            <h2>Imputation validation</h2>
            <p>How well known benchmark results predict a missing result. Lower error is better.</p>
          </div>
        </header>
        <div className={styles.matrixLegend}>
          <span>Lower error</span>
          <span className={styles.errorGradient} aria-hidden="true" />
          <span>Higher error</span>
          <span>
            <i style={{ background: "var(--hover)" }} />
            No validation result
          </span>
        </div>
        <MatrixOverview
          label="Imputation validation matrix"
          rows={validation.rows}
          columns={validation.columns}
          rowLabel="target benchmarks"
          rowDescription="The benchmark being predicted"
          columnDescription="The results used to make that prediction"
          columnLabel="input combinations"
          colors={ERROR_COLORS}
          status={(row, column) => {
            const error = validation.cells.get(row.id + "|" + column.id)?.error;
            return error == null
              ? null
              : Math.round(Math.min(1, Math.max(0, error / maxError)) * (ERROR_COLORS.length - 1));
          }}
          cell={(row, column) => {
            const predictor = validation.cells.get(`${row.id}|${column.id}`);
            if (!predictor)
              return {
                detail: {
                  title: row.label,
                  subtitle: column.label,
                  status: "No validation result",
                },
              };
            return {
              detail: {
                title: row.label,
                subtitle: column.label,
                status: predictor.accepted ? "Accepted" : "Not accepted",
                tone: predictor.accepted ? "used" : "warning",
                metrics: [
                  {
                    label: "Prediction error",
                    value:
                      predictor.error == null ? "Unavailable" : predictor.error.toFixed(2) + " pts",
                  },
                  {
                    label: "Baseline error",
                    value:
                      predictor.baselineError == null
                        ? "Unavailable"
                        : predictor.baselineError.toFixed(2) + " pts",
                  },
                  { label: "Validation models", value: String(predictor.models) },
                ],
                notes: [
                  {
                    label: "Inputs",
                    value: predictor.inputs.map((id) => names.get(id) ?? id),
                  },
                  { label: "Units", value: "Normalized error points; lower is better." },
                ],
              },
            };
          }}
        />
      </section>
    </div>
  );
}

/** The import origin stays in source metadata rather than repeating in every benchmark label. */
function benchmarkLabel(label: string): string {
  return label.replace(/ \(Model Atlas\)$/, "");
}
