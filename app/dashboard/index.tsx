"use client";

/** Client dashboard composition: the hero sky, the research rail, the leaderboard, Pareto, and Timeline regions in index order, and the model sheet over them. */

import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";

import { canonicalModelKey } from "../../src/model-atlas/identity/normalization";
import type { ModelAtlasModel, ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DashboardLeaderboard } from "./DashboardLeaderboard";
import { GlobalModelControls } from "./GlobalModelControls";
import { finite } from "./graphs/format";
import { ParetoPanel } from "./graphs/pareto/Panel";
import { TimelinePanel } from "./graphs/timeline/Panel";
import { useLivePayload } from "./live-payload";
import { ModelSheet } from "./model-sheet/ModelSheet";
import { ResearchRail } from "./ResearchRegions";
import {
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  modelsForVariantDisplay,
  providerOptions,
} from "./shared/model-display";
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
        <DashboardLeaderboard
          payload={payload}
          errorMessage={errorMessage}
          isLoading={isInitialLoading}
          filters={filters}
        />
        {regions.payload != null ? (
          <ParetoPanel
            payload={regions.payload}
            models={regions.models}
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
          document.cookie = `${GRAPH_VARIANTS_COOKIE}=${expanded ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
        }
      } catch {}
      return;
    }
    try {
      window.localStorage.setItem(REASONING_VARIANT_STORAGE_KEY, String(showReasoningVariants));
    } catch {}
    document.cookie = `${GRAPH_VARIANTS_COOKIE}=${showReasoningVariants ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
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
  const signatureModels = useMemo(() => {
    const ranked = models
      .filter((model) => model.name != null && finite(model.scores?.intelligence_score))
      .sort(
        (left, right) =>
          Number(right.scores.intelligence_score) - Number(left.scores.intelligence_score),
      );
    if (showVariants) {
      return ranked;
    }
    const visibleModelKeys = new Set(ranked.map(canonicalModelKey));
    return reference.filter((model) => visibleModelKeys.has(canonicalModelKey(model)));
  }, [reference, showVariants, models]);
  const paretoSignatureModels = useMemo(() => {
    const candidateModelKeys = new Set(paretoCandidateModels.map(canonicalModelKey));
    return reference.filter((model) => candidateModelKeys.has(canonicalModelKey(model)));
  }, [reference, paretoCandidateModels]);
  return {
    payload,
    referenceModels: reference,
    models,
    signature: {
      models: signatureModels,
      paretoModels: paretoSignatureModels,
      referenceModels: reference,
    },
  };
}
