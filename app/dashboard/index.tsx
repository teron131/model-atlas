"use client";

/** Client dashboard composition: the hero sky, the research rail, the Leaderboard, Pareto, and Timeline regions in index order, and the model sheet over them. */

import {
  type ComponentProps,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { modelsForVariantDisplay } from "../../src/model-atlas/stats/model-variants";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DashboardLeaderboard } from "./DashboardLeaderboard";
import { GlobalModelControls } from "./GlobalModelControls";
import { type ChartData, chartData } from "./graphs/chart-data";
import { DuelsPanel } from "./graphs/duels/Panel";
import { EffortPanel } from "./graphs/effort/Panel";
import { ParetoPanel } from "./graphs/pareto/Panel";
import { SpectraPanel } from "./graphs/spectra/Panel";
import { TimelinePanel } from "./graphs/timeline/Panel";
import { useLivePayload } from "./live-payload";
import { ModelSheet } from "./model-sheet/ModelSheet";
import { ResearchRail, useRegionChart } from "./ResearchRegions";
import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  providerOptions,
} from "./shared/model-filters";
import { signaturePopulation } from "./signature/models";
import { ModelSignature } from "./signature/ModelSignature";
import { GRAPH_VARIANTS_COOKIE } from "./url-state";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

import graphStyles from "./graphs/graphs.module.css";

const REASONING_VARIANT_STORAGE_KEY = "model-atlas:expand-reasoning-variants";

export function Dashboard({
  initialShowReasoningVariants = false,
}: {
  initialShowReasoningVariants?: boolean;
}) {
  const [showReasoningVariants, setShowReasoningVariants] = useReasoningVariantDisplay(
    initialShowReasoningVariants,
  );
  const [q] = useUrlState("q");
  const [provider] = useUrlState("provider");
  const [maxCost] = useUrlState("max-cost");
  const [rank] = useUrlState("rank");
  const [days] = useUrlState("days");
  const filters = useMemo<GlobalModelFilters>(
    () => ({ q, provider, "max-cost": maxCost, rank, days }),
    [q, provider, maxCost, rank, days],
  );
  const { payload, errorMessage } = useLivePayload();

  const referenceModels = useMemo(() => payload?.models ?? [], [payload]);
  const displayPayload = useMemo(() => {
    if (payload == null) {
      return null;
    }
    return {
      ...payload,
      models: modelsForVariantDisplay(
        payload.models,
        showReasoningVariants,
        payload.benchmark_observations,
      ),
    };
  }, [payload, showReasoningVariants]);
  const providerChoices = useMemo(() => providerOptions(referenceModels), [referenceModels]);
  const isInitialLoading = payload == null && errorMessage == null;
  const regions = useRegionPopulations(
    displayPayload,
    referenceModels,
    filters,
    showReasoningVariants,
  );
  // The charts read results from the leaderboard's rows, which are shaped once per snapshot, so they take the snapshot itself rather than its variant display.
  const charts = useMemo(
    () =>
      payload == null || regions.payload == null
        ? null
        : chartData(payload, regions.modelRows, regions.variantModels),
    [payload, regions.payload, regions.modelRows, regions.variantModels],
  );

  // The hero and the leaderboard keep their places while the payload arrives, so neither remounts when the rail and the analyses join them.
  return (
    <main className="dashboard-main" aria-busy={isInitialLoading}>
      <ModelAtlasHeader page="dashboard" />
      <div className={graphStyles.atlas} data-capture-theme>
        <ModelSignature {...regions.signature} />
        {payload != null && regions.payload != null ? (
          <ResearchRail>
            <GlobalModelControls
              filters={filters}
              models={referenceModels}
              fetchedAt={payload.fetched_at_epoch_seconds}
              providerChoices={providerChoices}
              showReasoningVariants={showReasoningVariants}
              onShowReasoningVariantsChange={(show) => setShowReasoningVariants(show, true)}
            />
          </ResearchRail>
        ) : errorMessage != null ? (
          <div className={graphStyles.error}>Unable to load the Model Atlas snapshot.</div>
        ) : null}
        <LeaderboardRegion
          charts={charts}
          payload={payload}
          errorMessage={errorMessage}
          isLoading={isInitialLoading}
          filters={filters}
        />
        {regions.payload != null && charts != null ? (
          <ParetoRegion
            charts={charts}
            payload={regions.payload}
            models={regions.models}
            variantModels={regions.variantModels}
            referenceModels={regions.referenceModels}
            showVariants={showReasoningVariants}
            onShowVariantsChange={setShowReasoningVariants}
          />
        ) : null}
        {regions.payload != null ? <TimelinePanel currentModels={regions.referenceModels} /> : null}
      </div>
      <ModelSheet payload={payload} />
    </main>
  );
}

/** Mirror the saved browser preference into a cookie so refreshed server-rendered points use the same mode. */
function useReasoningVariantDisplay(initialShowReasoningVariants: boolean) {
  const hydratedModeRef = useRef(false);
  const [showReasoningVariants, setShowReasoningVariants] = useState(initialShowReasoningVariants);

  useLayoutEffect(() => {
    if (!hydratedModeRef.current) {
      hydratedModeRef.current = true;
      try {
        const saved = window.localStorage.getItem(REASONING_VARIANT_STORAGE_KEY);
        if (saved != null) {
          const expanded = saved === "true";
          setShowReasoningVariants(expanded);
          writeVariantsCookie(expanded);
        }
      } catch {}
      return;
    }
    try {
      window.localStorage.setItem(REASONING_VARIANT_STORAGE_KEY, String(showReasoningVariants));
    } catch {}
    writeVariantsCookie(showReasoningVariants);
  }, [showReasoningVariants]);

  const [urlVariants] = useUrlState("graph-variants", showReasoningVariants);
  const setVariants = useCallback((expanded: boolean, includeTable = false) => {
    setShowReasoningVariants(expanded);
    updateDashboardUrl(
      includeTable
        ? { "graph-variants": expanded, "table-variants": expanded }
        : { "graph-variants": expanded },
    );
  }, []);
  return [urlVariants, setVariants] as const;
}

function writeVariantsCookie(expanded: boolean) {
  document.cookie = `${GRAPH_VARIANTS_COOKIE}=${expanded ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * The populations the hero and the analyses draw, filtered from deferred copies of the payload and filters so typing never waits on them.
 * `payload` stays `null` until the deferred copy has the snapshot.
 */
function useRegionPopulations(
  displayPayload: ModelAtlasPayload | null,
  referenceModels: ModelAtlasModel[],
  filters: GlobalModelFilters,
  showReasoningVariants: boolean,
) {
  const payload = useDeferredValue(displayPayload);
  const reference = useDeferredValue(referenceModels);
  const deferredFilters = useDeferredValue(filters);
  const showVariants = useDeferredValue(showReasoningVariants);
  const filterScope = useMemo(
    () => ({
      observedAtEpochSeconds: payload?.fetched_at_epoch_seconds ?? null,
      rankingModels: reference,
    }),
    [payload?.fetched_at_epoch_seconds, reference],
  );
  // The payload already holds the displayed variants, so filtering keeps the chosen variant display.
  const models = useMemo(
    () =>
      filterByGlobalModelFilters(
        payload?.models ?? [],
        (model) => model,
        deferredFilters,
        filterScope,
      ),
    [payload, deferredFilters, filterScope],
  );
  // Pareto's evidence and Effort list every reasoning variant whatever the display shows, through the same filters.
  const variantModels = useMemo(
    () =>
      showVariants
        ? models
        : filterByGlobalModelFilters(
            modelsForVariantDisplay(reference, true),
            (model) => model,
            deferredFilters,
            filterScope,
          ),
    [showVariants, models, reference, deferredFilters, filterScope],
  );
  // Spectra and Duels plot one row per model whatever the display shows, as the leaderboard does with variants collapsed.
  const modelRows = useMemo(
    () =>
      showVariants
        ? filterByGlobalModelFilters(
            modelsForVariantDisplay(reference, false, payload?.benchmark_observations),
            (model) => model,
            deferredFilters,
            filterScope,
          )
        : models,
    [
      showVariants,
      models,
      reference,
      payload?.benchmark_observations,
      deferredFilters,
      filterScope,
    ],
  );
  // Pareto picks ignore the recency and rank filters, which only limit which models are shown.
  const paretoCandidateModels = useMemo(
    () =>
      filterByGlobalModelFilters(
        payload?.models ?? [],
        (model) => model,
        { ...deferredFilters, days: "all", rank: "all" },
        filterScope,
      ),
    [payload, deferredFilters, filterScope],
  );
  const signature = useMemo(
    () =>
      signaturePopulation({
        shownModels: models,
        paretoCandidates: paretoCandidateModels,
        referenceModels: reference,
        showVariants,
      }),
    [models, paretoCandidateModels, reference, showVariants],
  );
  return { payload, referenceModels: reference, models, modelRows, variantModels, signature };
}

/** The table holds the Leaderboard region until the charts' data arrives, whichever chart is chosen. */
function LeaderboardRegion({
  charts,
  ...table
}: ComponentProps<typeof DashboardLeaderboard> & { charts: ChartData | null }) {
  const { chosen } = useRegionChart("leaderboard");
  if (charts == null) return <DashboardLeaderboard {...table} />;
  switch (chosen) {
    case "leaderboard":
      return <DashboardLeaderboard {...table} />;
    case "spectra":
      return <SpectraPanel data={charts} />;
    case "duels":
      return <DuelsPanel data={charts} />;
    default:
      return chosen satisfies never;
  }
}

function ParetoRegion({
  charts,
  ...pareto
}: ComponentProps<typeof ParetoPanel> & { charts: ChartData }) {
  const { chosen } = useRegionChart("pareto");
  switch (chosen) {
    case "pareto":
      return <ParetoPanel {...pareto} />;
    case "effort":
      return <EffortPanel data={charts} />;
    default:
      return chosen satisfies never;
  }
}
