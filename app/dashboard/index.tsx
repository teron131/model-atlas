"use client";

/** Client dashboard composition for live payloads, global model controls, graphs, and leaderboard. */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DashboardLeaderboard } from "./DashboardLeaderboard";
import { DashboardGraphs } from "./graphs/DashboardGraphs";
import { useLivePayload } from "./live-payload";
import { isGraphEligible, modelsForVariantDisplay, providerOptions } from "./shared/model-display";
import { providerFilterKey } from "./shared/provider-theme";
import { GRAPH_VARIANTS_COOKIE } from "./url-state";
import { useUrlState } from "./use-url-state";

const REASONING_VARIANT_STORAGE_KEY = "model-atlas:expand-reasoning-variants";

export function Dashboard({
  initialPayload,
  initialShowReasoningVariants = false,
}: {
  initialPayload: ModelAtlasPayload | null;
  initialShowReasoningVariants?: boolean;
}) {
  const [showReasoningVariants, setShowReasoningVariants] = useReasoningVariantDisplay(
    initialShowReasoningVariants,
  );
  const [requestedProviders, setSelectedProviders] = useUrlState("provider");
  const [maxCostFilter, setMaxCostFilter] = useUrlState("max-cost");
  const [modelRankFilter, setModelRankFilter] = useUrlState("rank");
  const [recencyFilter, setRecencyFilter] = useUrlState("days");
  const [globalModelFilterQuery, setGlobalModelFilterQuery] = useUrlState("q");
  const { payload, errorMessage } = useLivePayload(initialPayload);

  const referenceModels = useMemo(() => payload?.models ?? [], [payload]);
  const displayPayload = useMemo(() => {
    if (payload == null) {
      return null;
    }
    return {
      ...payload,
      models: modelsForVariantDisplay(
        payload.models.filter(isGraphEligible),
        showReasoningVariants,
        payload.benchmark_observations,
      ),
    };
  }, [payload, showReasoningVariants]);
  const providerChoices = useMemo(() => providerOptions(payload?.models ?? []), [payload]);
  const selectedProviders = useMemo(() => {
    const providers = new Set(payload?.models.map((model) => providerFilterKey(model.provider)));
    return requestedProviders.filter((slug) => providers.has(slug));
  }, [requestedProviders, payload]);
  const isInitialLoading = payload == null && errorMessage == null;

  return (
    <main className="dashboard-main" aria-busy={isInitialLoading}>
      <ModelAtlasHeader page="dashboard" />
      <DashboardGraphs
        payload={displayPayload}
        modelVariants={payload?.models ?? []}
        referenceModels={referenceModels}
        benchmarksLoading={isInitialLoading}
        selectedProviders={selectedProviders}
        providerChoices={providerChoices}
        maxCost={maxCostFilter}
        modelRankFilter={modelRankFilter}
        recencyFilter={recencyFilter}
        globalModelFilterQuery={globalModelFilterQuery}
        showReasoningVariants={showReasoningVariants}
        onShowReasoningVariantsChange={setShowReasoningVariants}
        onSelectedProvidersChange={setSelectedProviders}
        onMaxCostChange={setMaxCostFilter}
        onModelRankFilterChange={setModelRankFilter}
        onRecencyFilterChange={setRecencyFilter}
        onGlobalModelFilterQueryChange={setGlobalModelFilterQuery}
        afterLead={
          <DashboardLeaderboard
            payload={payload}
            errorMessage={errorMessage}
            isLoading={isInitialLoading}
            maxCost={maxCostFilter}
            modelRankFilter={modelRankFilter}
            recencyFilter={recencyFilter}
            globalModelFilterQuery={globalModelFilterQuery}
            selectedProviders={selectedProviders}
          />
        }
      />
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

  const [urlVariants, setUrlVariants] = useUrlState("graph-variants", showReasoningVariants);
  const setVariants = useCallback(
    (expanded: boolean) => {
      setShowReasoningVariants(expanded);
      setUrlVariants(expanded);
    },
    [setUrlVariants],
  );
  return [urlVariants, setVariants] as const;
}
