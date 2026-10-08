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
  filterByGlobalModelFilters,
  type GlobalModelFilters,
  type ProviderOption,
} from "../shared/model-display";
import { ModelSignature } from "../signature/ModelSignature";
import { dashboardUrlSection } from "../url-state";
import { HoverCard } from "./ChartComponents";
import { finite } from "./format";
import type { HoverState } from "./hover-state";
import { ParetoPanel } from "./pareto/Panel";
import { TimelinePanel } from "./TimelinePanel";

import styles from "./graphs.module.css";

/** Coordinate deferred dashboard filtering, shared hover state, and research-region panels while keeping controls responsive during payload changes. */
export function DashboardGraphs({
  payload,
  referenceModels,
  isLoading,
  afterLead,
  filters,
  providerChoices,
  showReasoningVariants,
  onShowReasoningVariantsChange,
}: {
  payload: ModelAtlasPayload | null;
  referenceModels: ModelAtlasModel[];
  isLoading: boolean;
  afterLead?: React.ReactNode;
  filters: GlobalModelFilters;
  providerChoices: ProviderOption[];
  showReasoningVariants: boolean;
  onShowReasoningVariantsChange: (show: boolean, includeTable?: boolean) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const journeyRef = useRef<HTMLElement>(null);
  const deferredPayload = useDeferredValue(payload);
  const deferredReferenceModels = useDeferredValue(referenceModels);
  const deferredFilters = useDeferredValue(filters);
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

  const filterScope = useMemo(
    () => ({
      observedAtEpochSeconds: deferredPayload?.fetched_at_epoch_seconds ?? null,
      rankingModels: deferredReferenceModels,
    }),
    [deferredPayload?.fetched_at_epoch_seconds, deferredReferenceModels],
  );
  // Dashboard already projects displayed variants into this payload before either graph filters it.
  const filteredModels = useMemo(
    () =>
      filterByGlobalModelFilters(
        deferredPayload?.models ?? [],
        (model) => model,
        deferredFilters,
        filterScope,
      ),
    [deferredPayload, deferredFilters, filterScope],
  );
  // Pareto picks ignore the recency and rank filters, which only limit which models are shown.
  const paretoCandidateModels = useMemo(
    () =>
      filterByGlobalModelFilters(
        deferredPayload?.models ?? [],
        (model) => model,
        { ...deferredFilters, days: "all", rank: "all" },
        filterScope,
      ),
    [deferredPayload, deferredFilters, filterScope],
  );
  const signatureModels = useMemo(() => {
    const ranked = filteredModels
      .filter((model) => model.name != null && finite(model.scores?.intelligence_score))
      .sort(
        (left, right) =>
          Number(right.scores.intelligence_score) - Number(left.scores.intelligence_score),
      );
    if (deferredShowReasoningVariants) {
      return ranked;
    }
    const visibleModelKeys = new Set(ranked.map(canonicalModelKey));
    return deferredReferenceModels.filter((model) =>
      visibleModelKeys.has(canonicalModelKey(model)),
    );
  }, [deferredReferenceModels, deferredShowReasoningVariants, filteredModels]);
  const paretoSignatureModels = useMemo(() => {
    const candidateModelKeys = new Set(paretoCandidateModels.map(canonicalModelKey));
    return deferredReferenceModels.filter((model) =>
      candidateModelKeys.has(canonicalModelKey(model)),
    );
  }, [deferredReferenceModels, paretoCandidateModels]);
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
        referenceModels={deferredReferenceModels}
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
            filters={filters}
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
        <ParetoPanel
          payload={deferredPayload}
          models={filteredModels}
          referenceModels={deferredReferenceModels}
          showVariants={showReasoningVariants}
          onShowVariantsChange={onShowReasoningVariantsChange}
          setHover={setHover}
        />
      </section>
      <section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
        <TimelinePanel currentModels={deferredReferenceModels} />
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
