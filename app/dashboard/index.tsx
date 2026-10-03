"use client";

/** Client dashboard composition for live payloads, global model controls, graphs, and leaderboard. */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type ModelAtlasPayload } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DashboardLeaderboard } from "./DashboardLeaderboard";
import { DashboardGraphs } from "./graphs/DashboardGraphs";
import { useLivePayload } from "./live-payload";
import {
  type GlobalModelFilters,
  isGraphEligible,
  modelsForVariantDisplay,
  providerOptions,
} from "./shared/model-display";
import { GRAPH_VARIANTS_COOKIE } from "./url-state";
import { updateDashboardUrl, useUrlState } from "./use-url-state";

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
  const [q] = useUrlState("q");
  const [provider] = useUrlState("provider");
  const [maxCost] = useUrlState("max-cost");
  const [rank] = useUrlState("rank");
  const [days] = useUrlState("days");
  const filters = useMemo<GlobalModelFilters>(
    () => ({ q, provider, "max-cost": maxCost, rank, days }),
    [q, provider, maxCost, rank, days],
  );
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
  const providerChoices = useMemo(() => providerOptions(referenceModels), [referenceModels]);
  const isInitialLoading = payload == null && errorMessage == null;

  return (
    <main className="dashboard-main" aria-busy={isInitialLoading}>
      <ModelAtlasHeader page="dashboard" />
      <DashboardGraphs
        payload={displayPayload}
        referenceModels={referenceModels}
        isLoading={isInitialLoading}
        filters={filters}
        providerChoices={providerChoices}
        showReasoningVariants={showReasoningVariants}
        onShowReasoningVariantsChange={setShowReasoningVariants}
        afterLead={
          <DashboardLeaderboard
            payload={payload}
            errorMessage={errorMessage}
            isLoading={isInitialLoading}
            filters={filters}
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
