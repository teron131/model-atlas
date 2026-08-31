"use client";

/** Client dashboard composition for live payloads, global model controls, graphs, and leaderboard. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type ModelAtlasPayload, rankedModels } from "../../src/model-atlas/stats/types";
import { ModelAtlasHeader } from "../shared/ModelAtlasHeader";
import { DashboardLeaderboard } from "./DashboardLeaderboard";
import { DashboardGraphs } from "./graphs/DashboardGraphs";
import { useLivePayload } from "./live-payload";
import { DEFAULT_DISPLAY_ITEMS } from "./shared/DisplayControls";
import {
  type CostFilter,
  type ModelLimit,
  modelsForVariantDisplay,
  type ProviderFilters,
  providerOptions,
} from "./shared/model-display";

const REASONING_VARIANT_STORAGE_KEY = "model-atlas:expand-reasoning-variants";
const COLUMN_FRAME_HEADER_KEYS = ["modalities", "context"] as const;

export function Dashboard({ initialPayload }: { initialPayload: ModelAtlasPayload | null }) {
  const dashboardRef = useRef<HTMLElement>(null);
  const [showReasoningVariants, setShowReasoningVariants] = useReasoningVariantDisplay();
  const [selectedProviders, setSelectedProviders] = useState<ProviderFilters>([]);
  const [maxCostFilter, setMaxCostFilter] = useState<CostFilter>("all");
  const [modelLimit, setModelLimit] = useState<ModelLimit>(DEFAULT_DISPLAY_ITEMS);
  const [globalModelFilterQuery, setGlobalModelFilterQuery] = useState("");
  const { payload, errorMessage } = useLivePayload(initialPayload);

  const displayPayload = useMemo(() => {
    if (payload == null) {
      return null;
    }
    return {
      ...payload,
      models: modelsForVariantDisplay(
        rankedModels(payload.models),
        showReasoningVariants,
        payload.benchmark_observations,
      ),
    };
  }, [payload, showReasoningVariants]);
  const providerChoices = useMemo(
    () => providerOptions(displayPayload?.models ?? []),
    [displayPayload],
  );
  const isInitialLoading = payload == null && errorMessage == null;

  useEffect(() => {
    const syncFrameWidth = () => {
      const frameWidth = defaultColumnFrameWidth(dashboardRef.current);
      if (frameWidth != null) {
        dashboardRef.current?.style.setProperty("--dashboard-frame-width", `${frameWidth}px`);
      }
    };
    const observer = new ResizeObserver(() => {
      syncFrameWidth();
    });
    const observeLayoutTargets = () => {
      const root = dashboardRef.current;
      if (root == null) {
        return;
      }
      const table = root.querySelector<HTMLElement>(".table-wrap table");
      const frameHeader = columnFrameHeader(root);
      observer.observe(root);
      if (table != null) {
        observer.observe(table);
      }
      if (frameHeader != null) {
        observer.observe(frameHeader);
      }
    };
    syncFrameWidth();
    observeLayoutTargets();
    const animationFrame = window.requestAnimationFrame(() => {
      observeLayoutTargets();
      syncFrameWidth();
    });
    window.addEventListener("resize", syncFrameWidth);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", syncFrameWidth);
    };
  }, []);

  return (
    <main className="dashboard-main" ref={dashboardRef} aria-busy={isInitialLoading}>
      <ModelAtlasHeader page="dashboard" />
      <DashboardGraphs
        payload={displayPayload}
        referenceModels={rankedModels(payload?.models ?? [])}
        benchmarksLoading={isInitialLoading}
        selectedProviders={selectedProviders}
        providerChoices={providerChoices}
        maxCost={maxCostFilter}
        modelLimit={modelLimit}
        globalModelFilterQuery={globalModelFilterQuery}
        showReasoningVariants={showReasoningVariants}
        onShowReasoningVariantsChange={setShowReasoningVariants}
        onSelectedProvidersChange={setSelectedProviders}
        onMaxCostChange={setMaxCostFilter}
        onModelLimitChange={setModelLimit}
        onGlobalModelFilterQueryChange={setGlobalModelFilterQuery}
        afterLead={
          <DashboardLeaderboard
            payload={payload}
            errorMessage={errorMessage}
            isLoading={isInitialLoading}
            maxCost={maxCostFilter}
            modelLimit={modelLimit}
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

function defaultColumnFrameWidth(root: HTMLElement | null) {
  const frameHeader = columnFrameHeader(root);
  if (!frameHeader) {
    return null;
  }
  const rootStyle = root == null ? null : window.getComputedStyle(root);
  const horizontalPadding =
    Number.parseFloat(rootStyle?.paddingLeft ?? "0") +
    Number.parseFloat(rootStyle?.paddingRight ?? "0");
  return Math.ceil(frameHeader.offsetLeft + frameHeader.offsetWidth + horizontalPadding);
}

function columnFrameHeader(root: HTMLElement | null) {
  for (const key of COLUMN_FRAME_HEADER_KEYS) {
    const header = root?.querySelector<HTMLElement>(`.table-wrap th[data-column-key="${key}"]`);
    if (header != null) {
      return header;
    }
  }
  return null;
}
