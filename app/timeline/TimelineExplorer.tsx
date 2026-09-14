"use client";

/** Explore a frozen cross-era calibration without letting display filters alter its reference population. */

import { useEffect, useMemo, useState } from "react";

import { modelDisplayExclusion } from "../../src/model-atlas/stats/model-visibility";
import {
  anchorTimeline,
  DEFAULT_TIMELINE_ANCHORS,
  DEFAULT_TIMELINE_PARAMETERS,
} from "../../src/model-atlas/timeline/calibration";
import { timelineCoverage } from "../../src/model-atlas/timeline/coverage";
import type { HistoricalDataset, TimelineDimension } from "../../src/model-atlas/timeline/types";
import { providerDisplayName } from "../dashboard/shared/provider-theme";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DiagnosticMatrices } from "./DiagnosticMatrices";
import { TIMELINE_START_DATE } from "./frontier";
import { timelineModelName } from "./model-display";
import { modelRepresentatives, representativeScores } from "./model-representatives";
import { TimelinePlot } from "./TimelinePlot";

import styles from "./timeline.module.css";

export function TimelineExplorer() {
  const [data, setData] = useState<HistoricalDataset | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let etag: string | null = null;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch("/api/timeline", {
          signal: controller.signal,
          cache: "no-store",
          headers: etag ? { "If-None-Match": etag } : {},
        });
        if (response.status === 304) {
          if (!controller.signal.aborted) setError("");
          return;
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load historical evidence.");
        if (controller.signal.aborted) return;
        etag = response.headers.get("ETag");
        setData(body);
        setError("");
      } catch (reason) {
        if (!controller.signal.aborted) setError((reason as Error).message);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    // Follow the dashboard's active-page refresh cadence without downloading unchanged evidence.
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return (
    <main className={styles.page}>
      <ModelAtlasHeader page="timeline" />
      <div className={styles.heading}>
        <div>
          <h1>Timeline</h1>
          <p>Model capability over time.</p>
        </div>
        <span className={styles.badge}>Experimental</span>
      </div>
      {data ? (
        <>
          {error && (
            <p role="status">Unable to refresh: {error}. Showing the last loaded release.</p>
          )}
          <TimelineContent data={data} />
        </>
      ) : (
        <p role="status">{error || "Loading retained observations…"}</p>
      )}
    </main>
  );
}

function TimelineContent({ data }: { data: HistoricalDataset }) {
  const [dimension, setDimension] = useState<TimelineDimension>("intelligence");
  const parameters = DEFAULT_TIMELINE_PARAMETERS;
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const visibleFromDate = fromDate > TIMELINE_START_DATE ? fromDate : TIMELINE_START_DATE;
  const [selected, setSelected] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const releaseDates = data.models
    .flatMap((model) => (model.releaseDate ? [model.releaseDate] : []))
    .sort();
  const [calculated, setCalculated] = useState<{
    releaseId: string;
    scaleId: string;
    result: HistoricalDataset["prepared"];
  } | null>(null);
  const [calculationError, setCalculationError] = useState("");
  const useDefault =
    data.prepared && JSON.stringify(data.prepared.parameters) === JSON.stringify(parameters);
  const prepared = useDefault
    ? data.prepared
    : calculated?.releaseId === data.releaseId && calculated.scaleId === data.scale?.id
      ? calculated.result
      : undefined;
  const ready = prepared && JSON.stringify(prepared.parameters) === JSON.stringify(parameters);
  useEffect(() => {
    if (data.prepared && JSON.stringify(data.prepared.parameters) === JSON.stringify(parameters)) {
      setCalculationError("");
      return;
    }
    const controller = new AbortController();
    setCalculationError("");
    fetch("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parameters),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Unable to reconstruct benchmark evidence.");
        if (body.releaseId !== data.releaseId || body.scaleId !== data.scale?.id)
          throw new Error(
            "The evidence release changed during calculation. Return to this page to load the current release.",
          );
        if (!controller.signal.aborted)
          setCalculated({ releaseId: body.releaseId, scaleId: body.scaleId, result: body });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCalculationError(error.message);
      });
    return () => controller.abort();
  }, [data, parameters]);
  const calibration = ready ? prepared.calibrations[dimension] : null;
  const anchors = DEFAULT_TIMELINE_ANCHORS;
  const projection = useMemo(() => {
    if (!calibration) return { scores: new Map<string, number>(), error: calculationError };
    try {
      return { scores: anchorTimeline(calibration, data, anchors, dimension), error: "" };
    } catch (error) {
      return { scores: new Map<string, number>(), error: (error as Error).message };
    }
  }, [calibration, calculationError, data, anchors, dimension]);
  const estimates = new Map(calibration?.estimates.map((estimate) => [estimate.modelId, estimate]));
  const coverageDetails = useMemo(
    () => timelineCoverage(data, dimension, calibration?.estimates ?? []),
    [data, dimension, calibration],
  );
  const coverage = new Map([...coverageDetails].map(([id, support]) => [id, support.fraction]));
  const intelligenceScores = representativeScores(data, prepared?.calibrations.intelligence);
  const representatives = modelRepresentatives(
    data.models.map((model) => ({
      ...model,
      score: projection.scores.get(model.id) ?? null,
      coverage: coverage.get(model.id) ?? null,
      representativeScore: intelligenceScores.get(model.id) ?? null,
    })),
  );
  const matching = representatives.filter((model) => {
    if (model.score != null && model.score < 70) return false;
    if (query && !`${model.name} ${model.provider}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (visibleFromDate && (!model.releaseDate || model.releaseDate < visibleFromDate))
      return false;
    if (toDate && (!model.releaseDate || model.releaseDate > toDate)) return false;
    return true;
  });
  const visible = matching.filter((model) => modelDisplayExclusion(model) == null);
  const points = visible.flatMap((model) => {
    const score = projection.scores.get(model.id);
    const estimate = estimates.get(model.id);
    return score == null || !model.releaseDate || !estimate
      ? []
      : [{ ...model, score, estimate, coverage: coverage.get(model.id) ?? null }];
  });
  const sorted = [...points].sort((a, b) => b.score - a.score);
  const chosen = data.models.find((model) => model.id === selected);
  const chosenEstimate = selected ? estimates.get(selected) : null;
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} aria-label="Capability dimension">
          {(["intelligence", "agentic"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={dimension === value}
              onClick={() => setDimension(value)}
            >
              {value === "intelligence" ? "Intelligence" : "Agentic"}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          Find models
          <input
            aria-label="Find models"
            placeholder="Model or organization"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          From
          <input
            aria-label="From date"
            type="date"
            min={TIMELINE_START_DATE}
            value={visibleFromDate || releaseDates[0] || ""}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="To date"
            type="date"
            value={toDate || releaseDates.at(-1) || ""}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
      </div>
      {projection.error ? (
        <p role="alert" className={styles.error}>
          {projection.error}
        </p>
      ) : null}
      {!ready && !calculationError ? <p role="status">Reconstructing benchmark evidence…</p> : null}
      {ready && !projection.error ? (
        <>
          <div className={styles.chartHeading}>
            <span>{dimension === "intelligence" ? "Intelligence" : "Agentic"} score</span>
            <span>{points.length} models</span>
          </div>
          <TimelinePlot points={points} selected={selected} onSelect={setSelected} />
        </>
      ) : null}
      <div className={styles.legend}>
        <span>
          <i className={styles.solid} />
          Benchmark-supported
        </span>
        <span>
          <i />
          Index-based
        </span>
        <span className={styles.frontierKey}>┄ Estimated frontier</span>
      </div>
      <section className={styles.modelSummary} aria-label="Selected model" aria-live="polite">
        {chosen && chosenEstimate ? (
          <>
            <h2>{timelineModelName(chosen)}</h2>
            <p>{providerDisplayName(chosen.provider)}</p>
            <dl className={styles.modelStats}>
              <div>
                <dt>{dimension === "intelligence" ? "Intelligence" : "Agentic"} score</dt>
                <dd>{projection.scores.get(chosen.id)?.toFixed(1) ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Released</dt>
                <dd>{chosen.releaseDate ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>Evidence coverage</dt>
                <dd>
                  {coverage.has(chosen.id)
                    ? ((coverage.get(chosen.id) ?? 0) * 100).toFixed(0) + "%"
                    : "Unknown"}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p>Select a model on the chart to see its score and coverage.</p>
        )}
      </section>
      <details
        className={styles.diagnostics}
        onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
      >
        <summary>Evidence and imputation heat maps</summary>
        {diagnosticsOpen && (
          <DiagnosticMatrices
            data={data}
            models={sorted}
            calibration={calibration}
            evidence={ready ? prepared.evidence.cells : []}
            benchmarkPredictors={ready ? prepared.evidence.predictors : []}
            maxError={parameters.maxError}
            onSelect={setSelected}
          />
        )}
      </details>
      <footer className={styles.footer}>
        <span>Scale: GPT-4 = 100 · Claude Opus 4.5 = 150</span>
        <a href="/methodology/timeline">How scoring works</a>
      </footer>
    </>
  );
}
