"use client";

/** Interactive chart view for LLM stats payloads. */

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { type ModelAtlasModel, type ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { GlobalModelControls } from "../GlobalModelControls";
import {
  RESEARCH_REGION_IDS,
  RESEARCH_REGIONS,
  type ResearchRegionId,
  researchRegionOrdinal,
} from "../research-index";
import {
  type CostFilter,
  filterByIntelligenceRank,
  filterByModelControls,
  filterByModelQuery,
  filterByReleaseRecency,
  isGraphEligible,
  type ModelRankFilter,
  type ProviderOption,
  type RecencyFilter,
} from "../shared/model-display";
import { ModelSignature } from "../signature/ModelSignature";
import { dashboardUrlSection } from "../url-state";
import { HoverCard } from "./ChartComponents";
import { finite } from "./format";
import type { HoverState } from "./hover-state";
import { ParetoAnalysisPanel } from "./ParetoAnalysisPanel";
import { TimelinePanel } from "./TimelinePanel";

import styles from "./graphs.module.css";

/** Coordinate deferred dashboard filtering, shared hover state, and research-region panels while keeping controls responsive during payload changes. */
export function DashboardGraphs({
  payload,
  modelVariants,
  referenceModels,
  isLoading,
  afterLead,
  selectedProviders,
  providerChoices,
  maxCost,
  modelRankFilter,
  recencyFilter,
  globalModelFilterQuery,
  showReasoningVariants,
  onShowReasoningVariantsChange,
}: {
  payload: ModelAtlasPayload | null;
  modelVariants: ModelAtlasModel[];
  referenceModels: ModelAtlasModel[];
  isLoading: boolean;
  afterLead?: React.ReactNode;
  selectedProviders: string[];
  providerChoices: ProviderOption[];
  maxCost: CostFilter;
  modelRankFilter: ModelRankFilter;
  recencyFilter: RecencyFilter;
  globalModelFilterQuery: string;
  showReasoningVariants: boolean;
  onShowReasoningVariantsChange: (show: boolean, includeTable?: boolean) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const deferredPayload = useDeferredValue(payload);
  const deferredModelVariants = useDeferredValue(modelVariants);
  const deferredSelectedProviders = useDeferredValue(selectedProviders);
  const deferredMaxCost = useDeferredValue(maxCost);
  const deferredModelRankFilter = useDeferredValue(modelRankFilter);
  const deferredRecencyFilter = useDeferredValue(recencyFilter);
  const deferredGlobalModelFilterQuery = useDeferredValue(globalModelFilterQuery);
  const deferredShowReasoningVariants = useDeferredValue(showReasoningVariants);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const atlas = rail?.parentElement;
    if (!rail || !atlas) return;
    const measure = () =>
      atlas.style.setProperty(
        "--dashboard-rail-height",
        `${Math.ceil(rail.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => {
      observer.disconnect();
      atlas.style.removeProperty("--dashboard-rail-height");
    };
  }, [deferredPayload != null]);

  const allModels = useMemo(() => {
    return (deferredPayload?.models ?? [])
      .filter((model) => model.name != null && finite(model.scores?.intelligence_score))
      .sort(
        (left, right) =>
          Number(right.scores.intelligence_score) - Number(left.scores.intelligence_score),
      );
  }, [deferredPayload]);

  const queryFilteredModels = useMemo(
    () => filterByModelQuery(allModels, (model) => model, deferredGlobalModelFilterQuery),
    [allModels, deferredGlobalModelFilterQuery],
  );
  const filteredModels = useMemo(() => {
    return filterByModelControls(queryFilteredModels, (model) => model, {
      providers: deferredSelectedProviders,
      maxCost: deferredMaxCost,
    });
  }, [deferredMaxCost, deferredSelectedProviders, queryFilteredModels]);

  const recencyFilteredModels = useMemo(() => {
    return filterByReleaseRecency(
      filteredModels,
      (model) => model,
      deferredRecencyFilter,
      deferredPayload?.fetched_at_epoch_seconds ?? null,
    );
  }, [deferredPayload?.fetched_at_epoch_seconds, deferredRecencyFilter, filteredModels]);
  const models = useMemo(
    () =>
      filterByIntelligenceRank(
        recencyFilteredModels,
        (model) => model,
        deferredModelRankFilter,
        referenceModels,
      ),
    [deferredModelRankFilter, recencyFilteredModels, referenceModels],
  );
  const performanceModels = useMemo(() => {
    // Dashboard already projects eligible variants into this payload before either graph filters it.
    const controlled = filterByModelControls(deferredPayload?.models ?? [], (model) => model, {
      providers: deferredSelectedProviders,
      maxCost: deferredMaxCost,
    });
    const queried = filterByModelQuery(
      controlled,
      (model) => model,
      deferredGlobalModelFilterQuery,
    );
    const recent = filterByReleaseRecency(
      queried,
      (model) => model,
      deferredRecencyFilter,
      deferredPayload?.fetched_at_epoch_seconds ?? null,
    );
    return filterByIntelligenceRank(
      recent,
      (model) => model,
      deferredModelRankFilter,
      referenceModels,
    );
  }, [
    deferredPayload,
    deferredSelectedProviders,
    deferredMaxCost,
    deferredGlobalModelFilterQuery,
    deferredRecencyFilter,
    deferredModelRankFilter,
    referenceModels,
  ]);
  const signatureModels = useMemo(() => {
    if (deferredShowReasoningVariants) {
      return models;
    }
    const visibleModelKeys = new Set(models.map(canonicalModelKey));
    return deferredModelVariants.filter(
      (model) => isGraphEligible(model) && visibleModelKeys.has(canonicalModelKey(model)),
    );
  }, [deferredModelVariants, deferredShowReasoningVariants, models]);
  const paretoSignatureModels = useMemo(() => {
    const eligibleModelKeys = new Set(filteredModels.map(canonicalModelKey));
    return deferredModelVariants.filter(
      (model) => isGraphEligible(model) && eligibleModelKeys.has(canonicalModelKey(model)),
    );
  }, [deferredModelVariants, filteredModels]);
  const currentSection = useCurrentResearchSection(deferredPayload != null);

  if (!payload || !deferredPayload) {
    return (
      <section className={styles.atlas} aria-label="Model graphs" data-capture-theme>
        <ModelSignature models={[]} paretoModels={[]} referenceModels={[]} />
        {/* A deferred render can still be waiting after the live payload has arrived. */}
        {!isLoading && payload === deferredPayload && (
          <div className={styles.error}>Unable to load the Model Atlas snapshot.</div>
        )}
        {afterLead}
      </section>
    );
  }

  return (
    <section className={styles.atlas} aria-label="Model graphs" data-capture-theme>
      <ModelSignature
        models={signatureModels}
        paretoModels={paretoSignatureModels}
        referenceModels={deferredModelVariants}
      />
      <section ref={railRef} className={styles.instrumentRail} aria-label="Global view">
        <div className={styles.instrumentBar}>
          <nav className={styles.researchIndexLinks} aria-label="Dashboard sections">
            {RESEARCH_REGIONS.map((region) => (
              <a
                href={`#${region.id}`}
                key={region.id}
                aria-current={region.id === currentSection ? "location" : undefined}
              >
                <b aria-hidden="true">{researchRegionOrdinal(region.id)}</b>
                {region.label}
              </a>
            ))}
          </nav>
          <GlobalModelControls
            filters={{
              q: globalModelFilterQuery,
              provider: selectedProviders,
              "max-cost": maxCost,
              rank: modelRankFilter,
              days: recencyFilter,
            }}
            models={referenceModels}
            fetchedAt={payload.fetched_at_epoch_seconds}
            providerChoices={providerChoices}
            showReasoningVariants={showReasoningVariants}
            onShowReasoningVariantsChange={(show) => onShowReasoningVariantsChange(show, true)}
          />
        </div>
      </section>
      {afterLead}

      <section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
        <ParetoAnalysisPanel
          payload={deferredPayload}
          models={performanceModels}
          referenceModels={referenceModels}
          showVariants={showReasoningVariants}
          onShowVariantsChange={onShowReasoningVariantsChange}
          setHover={setHover}
        />
      </section>
      <section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
        <TimelinePanel />
      </section>
      {hover ? <HoverCard hover={hover} /> : null}
    </section>
  );
}

/** Align deep links when sections become available and report the region entering the upper viewport band. */
function useCurrentResearchSection(hasPanels: boolean) {
  const [currentSection, setCurrentSection] = useState<ResearchRegionId | null>(null);

  useEffect(() => {
    const sections = RESEARCH_REGION_IDS.flatMap((id) => {
      const element = document.getElementById(id);
      return element == null ? [] : [{ element, id }];
    });
    if (sections.length === 0) {
      return;
    }
    let updateFrame: number | null = null;
    const updateCurrentSection = () => {
      updateFrame = null;
      const activationLine = window.innerHeight * 0.45;
      let activeSection: ResearchRegionId | null = null;
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top > activationLine) {
          break;
        }
        activeSection = section.id;
      }
      setCurrentSection(activeSection);
    };
    const scheduleUpdate = () => {
      if (updateFrame == null) {
        updateFrame = window.requestAnimationFrame(updateCurrentSection);
      }
    };
    let alignmentFrame: number | null = null;
    const alignSection = () => {
      if (alignmentFrame != null) window.cancelAnimationFrame(alignmentFrame);
      // URL-backed controls hydrate before measuring the selected panel's final position.
      alignmentFrame = window.requestAnimationFrame(() => {
        alignmentFrame = window.requestAnimationFrame(() => {
          alignmentFrame = null;
          const section = dashboardUrlSection(new URL(window.location.href));
          if (section != null) document.getElementById(section)?.scrollIntoView({ block: "start" });
          scheduleUpdate();
        });
      });
    };
    alignSection();
    window.addEventListener("popstate", alignSection);
    window.addEventListener("hashchange", alignSection);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      if (alignmentFrame != null) window.cancelAnimationFrame(alignmentFrame);
      window.removeEventListener("popstate", alignSection);
      window.removeEventListener("hashchange", alignSection);
      if (updateFrame != null) {
        window.cancelAnimationFrame(updateFrame);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
    };
  }, [hasPanels]);

  return currentSection;
}
