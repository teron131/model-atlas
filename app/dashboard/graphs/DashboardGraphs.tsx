"use client";

/** Interactive chart view for LLM stats payloads. */

import {
  type RefObject,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { clamp01 } from "../../../src/model-atlas/math-utils";
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
  const journeyRef = useRef<HTMLElement>(null);
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
  const currentSection = useCurrentResearchSection(deferredPayload != null, journeyRef);

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
          <nav
            ref={journeyRef}
            className={styles.researchIndexLinks}
            aria-label="Dashboard sections"
          >
            <span className={styles.journeyStar} aria-hidden="true" />
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

/**
 * Align deep links when sections become available and report the region entering the upper viewport band.
 *
 * The same scroll frame moves the rail's journey star between the region links, written as CSS variables so scrolling never re-renders the rail.
 */
function useCurrentResearchSection(hasPanels: boolean, journeyRef: RefObject<HTMLElement | null>) {
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
      const offsets = sections.map(
        (section) => section.element.getBoundingClientRect().top - activationLine,
      );
      let reached = -1;
      while (reached + 1 < offsets.length && offsets[reached + 1]! <= 0) reached += 1;
      const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (remaining <= 1) reached = sections.length - 1;
      setCurrentSection(reached === -1 ? null : sections[reached]!.id);
      placeJourney(journeyRef.current, sections, offsets, reached, remaining);
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

// The journey track starts and ends this far inside the first and last region links.
const JOURNEY_INSET = 13;

/**
 * Place the journey star on the rail: it approaches the first region from the track start, travels link to link as each region reaches the activation line, and reaches the track end at the page's actual scroll limit.
 * Links the star has passed are marked reached so their waypoints light.
 */
function placeJourney(
  nav: HTMLElement | null,
  sections: { element: HTMLElement }[],
  offsets: number[],
  reached: number,
  remaining: number,
) {
  const links = nav == null ? [] : Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));
  const first = links[0];
  const last = links.at(-1);
  if (nav == null || first == null || last == null || links.length !== sections.length) return;
  const centres = links.map((link) => link.offsetLeft + link.offsetWidth / 2);
  const start = first.offsetLeft + JOURNEY_INSET;
  const end = last.offsetLeft + last.offsetWidth - JOURNEY_INSET;
  const lastIndex = sections.length - 1;
  let position: number;
  if (reached === -1) {
    position = start + (centres[0]! - start) * clamp01(1 - offsets[0]! / window.innerHeight);
  } else if (reached < lastIndex) {
    const span = offsets[reached + 1]! - offsets[reached]!;
    position =
      centres[reached]! +
      (centres[reached + 1]! - centres[reached]!) * clamp01(-offsets[reached]! / span);
  } else {
    const travelled = Math.max(0, -offsets[lastIndex]!);
    const travel = remaining <= 1 ? 1 : clamp01(travelled / (travelled + remaining));
    position = centres[lastIndex]! + (end - centres[lastIndex]!) * travel;
  }
  nav.style.setProperty("--journey-start", `${start}px`);
  nav.style.setProperty("--journey-end", `${end}px`);
  nav.style.setProperty("--journey", `${position.toFixed(1)}px`);
  links.forEach((link, index) => {
    link.dataset.reached = String(index <= reached);
  });
}
