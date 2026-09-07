"use client";

/** Client dashboard composition for live payloads, global model controls, graphs, and leaderboard. */

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { type ModelAtlasPayload, rankedModels } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DashboardLeaderboard } from "./DashboardLeaderboard";
import { DashboardGraphs } from "./graphs/DashboardGraphs";
import { isGraphEligible } from "./graphs/model-series";
import { useLivePayload } from "./live-payload";
import {
  type CostFilter,
  DEFAULT_MODEL_RANK_FILTER,
  DEFAULT_RECENCY_FILTER,
  type ModelRankFilter,
  modelsForVariantDisplay,
  type ProviderFilters,
  providerOptions,
  type RecencyFilter,
} from "./shared/model-display";

const REASONING_VARIANT_STORAGE_KEY = "model-atlas:expand-reasoning-variants";

export function Dashboard({ initialPayload }: { initialPayload: ModelAtlasPayload | null }) {
  const [showReasoningVariants, setShowReasoningVariants] = useReasoningVariantDisplay();
  const [selectedProviders, setSelectedProviders] = useState<ProviderFilters>([]);
  const [maxCostFilter, setMaxCostFilter] = useState<CostFilter>("all");
  const [modelRankFilter, setModelRankFilter] =
    useState<ModelRankFilter>(DEFAULT_MODEL_RANK_FILTER);
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>(DEFAULT_RECENCY_FILTER);
  const [globalModelFilterQuery, setGlobalModelFilterQuery] = useState("");
  const { payload, errorMessage } = useLivePayload(initialPayload);

  const referenceModels = useMemo(() => rankedModels(payload?.models ?? []), [payload]);
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

function useReasoningVariantDisplay() {
  const hydratedModeRef = useRef(false);
  const [showReasoningVariants, setShowReasoningVariants] = useState(false);

  useLayoutEffect(() => {
    if (!hydratedModeRef.current) {
      hydratedModeRef.current = true;
      try {
        setShowReasoningVariants(
          window.localStorage.getItem(REASONING_VARIANT_STORAGE_KEY) === "true",
        );
      } catch {}
      return;
    }
    try {
      window.localStorage.setItem(REASONING_VARIANT_STORAGE_KEY, String(showReasoningVariants));
    } catch {}
  }, [showReasoningVariants]);

  return [showReasoningVariants, setShowReasoningVariants] as const;
}
