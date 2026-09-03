"use client";

/** Interactive chart view for LLM stats payloads. */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import {
  type ModelAtlasModel,
  type ModelAtlasPayload,
  type ModelAtlasPublishedModel,
} from "../../../src/model-atlas/stats/types";
import { BenchmarkStrip } from "../BenchmarkStrip";
import {
  type CostFilter,
  costFilterOptions,
  filterByIntelligenceRank,
  filterByModelControls,
  filterByModelQuery,
  filterByReleaseRecency,
  modelCount,
  type ModelRankFilter,
  modelRankFilterOptions,
  type ProviderOption,
  type RecencyFilter,
  recencyFilterOptions,
  toggleProviderFilter,
} from "../shared/model-display";
import { ModelSignature } from "../signature/ModelSignature";
import { FilterButton, HoverCard } from "./ChartComponents";
import { finite, fmtCompact, fmtMoney } from "./format";
import { filterGraphPreviewsByIntelligenceFloor } from "./model-series";
import { ParetoAnalysisPanel } from "./ParetoAnalysisPanel";
import { PriceEfficiencyPanel } from "./price-efficiency/Panel";
import {
  RESEARCH_REGION_IDS,
  RESEARCH_REGIONS,
  type ResearchRegionId,
  researchRegionOrdinal,
} from "./research-index";
import type { HoverState } from "./types";

import styles from "./graphs.module.css";

type GraphPayload = Omit<ModelAtlasPayload, "models"> & {
  models: ModelAtlasPublishedModel[];
};

/** Coordinate deferred dashboard filtering, shared hover state, and research-region panels while keeping controls responsive during payload changes. */
export function DashboardGraphs({
  payload,
  modelVariants,
  referenceModels,
  benchmarksLoading,
  afterLead,
  selectedProviders,
  providerChoices,
  maxCost,
  modelRankFilter,
  recencyFilter,
  globalModelFilterQuery,
  showReasoningVariants,
  onShowReasoningVariantsChange,
  onSelectedProvidersChange,
  onMaxCostChange,
  onModelRankFilterChange,
  onRecencyFilterChange,
  onGlobalModelFilterQueryChange,
}: {
  payload: GraphPayload | null;
  modelVariants: ModelAtlasPublishedModel[];
  referenceModels: ModelAtlasModel[];
  benchmarksLoading: boolean;
  afterLead?: React.ReactNode;
  selectedProviders: string[];
  providerChoices: ProviderOption[];
  maxCost: CostFilter;
  modelRankFilter: ModelRankFilter;
  recencyFilter: RecencyFilter;
  globalModelFilterQuery: string;
  showReasoningVariants: boolean;
  onShowReasoningVariantsChange: (show: boolean) => void;
  onSelectedProvidersChange: (providers: string[]) => void;
  onMaxCostChange: (maxCost: CostFilter) => void;
  onModelRankFilterChange: (modelRankFilter: ModelRankFilter) => void;
  onRecencyFilterChange: (recencyFilter: RecencyFilter) => void;
  onGlobalModelFilterQueryChange: (value: string) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [benchmarksExpanded, setBenchmarksExpanded] = useState(false);
  const instrumentRailRef = useRef<HTMLElement>(null);
  const deferredPayload = useDeferredValue(payload);
  const deferredModelVariants = useDeferredValue(modelVariants);
  const deferredSelectedProviders = useDeferredValue(selectedProviders);
  const deferredMaxCost = useDeferredValue(maxCost);
  const deferredModelRankFilter = useDeferredValue(modelRankFilter);
  const deferredRecencyFilter = useDeferredValue(recencyFilter);
  const deferredGlobalModelFilterQuery = useDeferredValue(globalModelFilterQuery);
  const deferredShowReasoningVariants = useDeferredValue(showReasoningVariants);

  useEffect(() => {
    if (!filtersExpanded) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !instrumentRailRef.current?.contains(target) &&
        target.closest(".column-tooltip") == null
      ) {
        setFiltersExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [filtersExpanded]);

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
  const models = useMemo(() => {
    const rankFilteredModels = filterByIntelligenceRank(
      recencyFilteredModels,
      (model) => model,
      deferredModelRankFilter,
      referenceModels,
    );
    return filterGraphPreviewsByIntelligenceFloor(rankFilteredModels, (model) => model);
  }, [deferredModelRankFilter, recencyFilteredModels, referenceModels]);
  const signatureModels = useMemo(() => {
    if (deferredShowReasoningVariants) {
      return models;
    }
    const visibleModelKeys = new Set(models.map(canonicalModelKey));
    return deferredModelVariants.filter((model) => visibleModelKeys.has(canonicalModelKey(model)));
  }, [deferredModelVariants, deferredShowReasoningVariants, models]);
  const paretoSignatureModels = useMemo(() => {
    const eligibleModelKeys = new Set(filteredModels.map(canonicalModelKey));
    return filterGraphPreviewsByIntelligenceFloor(
      deferredModelVariants.filter((model) => eligibleModelKeys.has(canonicalModelKey(model))),
      (model) => model,
    );
  }, [deferredModelVariants, filteredModels]);
  const currentSection = useCurrentResearchSection(deferredPayload != null && allModels.length > 0);

  const filteredModelCount = modelCount(filteredModels);
  const recencyModelCount = modelCount(recencyFilteredModels);
  const visibleModelCount = modelCount(models);
  const modelRankLabel = modelRankValueLabel(
    deferredModelRankFilter,
    recencyModelCount,
    visibleModelCount,
    deferredShowReasoningVariants ? models.length : null,
  );
  const recencyLabel =
    deferredRecencyFilter === "all"
      ? `${fmtCompact(recencyModelCount)} models`
      : `${fmtCompact(recencyModelCount)} of ${fmtCompact(filteredModelCount)} models`;
  const selectedProviderChoices = providerChoices.filter((option) =>
    selectedProviders.includes(option.slug),
  );
  const providerLabel =
    selectedProviderChoices.length === 0
      ? "All providers"
      : selectedProviderChoices.map((option) => option.label).join(" + ");
  const compactProviderLabel =
    selectedProviderChoices.length <= 1
      ? providerLabel
      : `${selectedProviderChoices.length} providers`;
  const trimmedGlobalModelFilterQuery = globalModelFilterQuery.trim();
  const modelFilterLabel =
    trimmedGlobalModelFilterQuery.length === 0 ? "All models" : globalModelFilterQuery;
  const compactModelFilterLabel =
    trimmedGlobalModelFilterQuery.length === 0 ? "All models" : trimmedGlobalModelFilterQuery;
  const costLabel = maxCost === "all" ? "Any cost" : `<= ${fmtMoney(maxCost)}`;
  const compactCostLabel = maxCost === "all" ? "Any" : `<= ${fmtMoney(maxCost)}`;
  const compactRecencyLabel = recencyFilter === "all" ? "Any date" : `${recencyFilter}d`;
  const compactRankLabel = modelRankFilter === "all" ? "All ranks" : `Rank ≤${modelRankFilter}`;
  const filterSummary = `${compactModelFilterLabel} / ${compactProviderLabel} / ${compactCostLabel} / ${compactRecencyLabel} / ${compactRankLabel}`;

  if (!payload || !deferredPayload || allModels.length === 0) {
    return (
      <section className={styles.atlas} aria-label="Model graphs" data-capture-theme>
        <ModelSignature models={[]} paretoModels={[]} referenceModels={[]} />
        {/* A deferred render can still be waiting after the live payload has arrived. */}
        {!benchmarksLoading && payload === deferredPayload && (
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
      <section className={styles.instrumentRail} aria-label="Global view" ref={instrumentRailRef}>
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
          <button
            type="button"
            className={styles.filtersToggle}
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded((current) => !current)}
          >
            <span>Global view</span>
            <b>{filterSummary}</b>
            <i aria-hidden="true">{filtersExpanded ? "-" : "+"}</i>
          </button>
        </div>
        <div className={styles.filterPanel} hidden={!filtersExpanded}>
          <div className={styles.controlRow}>
            <FilterSection label="Model filter" value={modelFilterLabel}>
              <input
                className={styles.filterSearch}
                type="search"
                autoComplete="off"
                spellCheck="false"
                aria-label="Global model filter"
                placeholder="Filter models"
                value={globalModelFilterQuery}
                onChange={(event) => onGlobalModelFilterQueryChange(event.target.value)}
              />
            </FilterSection>
            <FilterSection label="Max blended cost" value={costLabel}>
              <div className={`${styles.filterRow} ${styles.costFilterRow}`}>
                {costFilterOptions.map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    className={styles.costFilterButton}
                    aria-pressed={maxCost === option}
                    onClick={() => onMaxCostChange(option)}
                  >
                    <span>{option === "all" ? "Any" : `<= ${fmtMoney(option)}`}</span>
                  </button>
                ))}
              </div>
            </FilterSection>
            <FilterSection label="Release recency" value={recencyLabel}>
              <div className={`${styles.filterRow} ${styles.costFilterRow}`}>
                {recencyFilterOptions.map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    className={styles.costFilterButton}
                    aria-pressed={recencyFilter === option}
                    onClick={() => onRecencyFilterChange(option)}
                  >
                    <span>{option === "all" ? "All" : `${option}d`}</span>
                  </button>
                ))}
              </div>
            </FilterSection>
            <FilterSection label="Model rank" value={modelRankLabel}>
              <div className={`${styles.filterRow} ${styles.costFilterRow}`}>
                {modelRankFilterOptions.map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    className={styles.costFilterButton}
                    aria-pressed={modelRankFilter === option}
                    onClick={() => onModelRankFilterChange(option)}
                  >
                    <span>{option === "all" ? "All" : `≤ ${option}`}</span>
                  </button>
                ))}
              </div>
            </FilterSection>
            <FilterSection
              label="Variants"
              value={showReasoningVariants ? "Expanded" : "Collapsed"}
            >
              <div className={`${styles.filterRow} ${styles.costFilterRow}`}>
                <button
                  type="button"
                  className={styles.costFilterButton}
                  aria-pressed={!showReasoningVariants}
                  onClick={() => onShowReasoningVariantsChange(false)}
                >
                  <span>Collapsed</span>
                </button>
                <button
                  type="button"
                  className={styles.costFilterButton}
                  aria-pressed={showReasoningVariants}
                  onClick={() => onShowReasoningVariantsChange(true)}
                >
                  <span>Expanded</span>
                </button>
              </div>
            </FilterSection>
            <FilterSection wide label="Provider filter" value={providerLabel}>
              <div className={styles.filterRow}>
                <FilterButton
                  active={selectedProviders.length === 0}
                  color="var(--ink)"
                  label="All"
                  count={modelCount(queryFilteredModels)}
                  onClick={() => onSelectedProvidersChange([])}
                />
                {providerChoices.map((option) => (
                  <FilterButton
                    key={option.slug}
                    active={selectedProviders.includes(option.slug)}
                    color={option.color}
                    logo={option.logo}
                    label={option.label}
                    count={option.count}
                    onClick={() =>
                      onSelectedProvidersChange(
                        toggleProviderFilter(selectedProviders, option.slug),
                      )
                    }
                  />
                ))}
              </div>
            </FilterSection>
          </div>
          <div className={styles.benchmarkRow}>
            <button
              type="button"
              className={`${styles.filtersToggle} ${styles.benchmarksToggle}`}
              aria-expanded={benchmarksExpanded}
              aria-controls="global-benchmarks"
              onClick={() => setBenchmarksExpanded((current) => !current)}
            >
              <span>Benchmarks</span>
              <i aria-hidden="true">{benchmarksExpanded ? "-" : "+"}</i>
            </button>
            <div id="global-benchmarks" hidden={!benchmarksExpanded}>
              {filtersExpanded && benchmarksExpanded && (
                <BenchmarkStrip
                  payload={deferredPayload}
                  models={models}
                  isLoading={benchmarksLoading}
                />
              )}
            </div>
          </div>
        </div>
      </section>
      {afterLead}

      {models.length === 0 ? (
        <div className={styles.error}>No models match the current global filters.</div>
      ) : (
        <>
          <section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
            <ParetoAnalysisPanel
              payload={deferredPayload}
              models={models}
              referenceModels={referenceModels}
              showVariants={deferredShowReasoningVariants}
              setHover={setHover}
            />
          </section>
          <PriceEfficiencyPanel
            benchmarkPortfolio={deferredPayload.metadata.scoring.benchmark_portfolio}
            models={deferredPayload.models}
            globalModelFilterQuery={deferredGlobalModelFilterQuery}
            showVariants={deferredShowReasoningVariants}
            maxCost={deferredMaxCost}
            modelRankFilter={deferredModelRankFilter}
            recencyFilter={deferredRecencyFilter}
            observedAtEpochSeconds={deferredPayload.fetched_at_epoch_seconds}
            onShowVariantsChange={onShowReasoningVariantsChange}
            selectedProviders={deferredSelectedProviders}
            onSelectedProvidersChange={onSelectedProvidersChange}
            referenceModels={referenceModels}
            setHover={setHover}
          />
        </>
      )}

      {hover ? <HoverCard hover={hover} /> : null}
    </section>
  );
}

function modelRankValueLabel(
  rankFilter: ModelRankFilter,
  filteredModelCount: number,
  visibleModelCount: number,
  visibleVariantCount: number | null,
): string {
  const variantLabel =
    visibleVariantCount == null ? "" : ` / ${fmtCompact(visibleVariantCount)} variants`;
  if (rankFilter === "all") {
    return `${fmtCompact(visibleModelCount)} models${variantLabel}`;
  }
  return `Rank ≤${rankFilter} · ${fmtCompact(visibleModelCount)} of ${fmtCompact(filteredModelCount)} models${variantLabel}`;
}

/** Report the last research region to enter the upper viewport band below the sticky index. */
function useCurrentResearchSection(hasPanels: boolean) {
  const [currentSection, setCurrentSection] = useState<ResearchRegionId | null>(null);

  useEffect(() => {
    if (!hasPanels) {
      return;
    }
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
    const initialSection = window.location.hash.slice(1);
    const alignmentFrame = window.requestAnimationFrame(() => {
      if (RESEARCH_REGION_IDS.some((id) => id === initialSection)) {
        document.getElementById(initialSection)?.scrollIntoView({ block: "start" });
      }
      scheduleUpdate();
    });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(alignmentFrame);
      if (updateFrame != null) {
        window.cancelAnimationFrame(updateFrame);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
    };
  }, [hasPanels]);

  return currentSection;
}

function FilterSection({
  label,
  value,
  children,
  wide = false,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`${styles.controlGroup} ${wide ? styles.controlGroupWide : ""}`}>
      <div className={styles.controlLabel}>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      {children}
    </div>
  );
}
