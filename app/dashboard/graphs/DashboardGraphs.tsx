"use client";

/** Interactive chart view for LLM stats payloads. */

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { ModelAtlasPayload } from "../../../src/model-atlas/stats/types";
import { BenchmarkStrip } from "../benchmarks/BenchmarkStrip";
import { filterByModelQuery, modelCount, toggleProviderFilter } from "../shared/model-display";
import { ModelSignature } from "../signature/ModelSignature";
import { FilterButton, HoverCard } from "./ChartComponents";
import { finite, fmtCompact, fmtMoney } from "./format";
import { FrontierBenchmarksPanel } from "./FrontierBenchmarksPanel";
import { InteractionMatrix } from "./InteractionMatrix";
import {
  costFilterOptions,
  filterByModelControls,
  limitByIntelligenceScore,
  modelLimitOptions,
} from "./models";
import { ParetoFrontierPanel } from "./ParetoFrontierPanel";
import { PriceEfficiencyPanel } from "./PriceEfficiencyPanel";
import {
  RESEARCH_REGION_IDS,
  RESEARCH_REGIONS,
  type ResearchRegionId,
  researchRegionOrdinal,
} from "./research-index";
import type { CostFilter, HoverState, ModelLimit, ProviderOption } from "./types";

import styles from "./graphs.module.css";

export function DashboardGraphs({
  payload,
  referenceModels,
  hasFullPayload,
  benchmarksLoading,
  afterLead,
  selectedProviders,
  providerChoices,
  maxCost,
  modelLimit,
  globalModelFilterQuery,
  showReasoningVariants,
  onShowReasoningVariantsChange,
  onSelectedProvidersChange,
  onMaxCostChange,
  onModelLimitChange,
  onGlobalModelFilterQueryChange,
}: {
  payload: ModelAtlasPayload | null;
  referenceModels: ModelAtlasPayload["models"];
  hasFullPayload: boolean;
  benchmarksLoading: boolean;
  afterLead?: React.ReactNode;
  selectedProviders: string[];
  providerChoices: ProviderOption[];
  maxCost: CostFilter;
  modelLimit: ModelLimit;
  globalModelFilterQuery: string;
  showReasoningVariants: boolean;
  onShowReasoningVariantsChange: (show: boolean) => void;
  onSelectedProvidersChange: (providers: string[]) => void;
  onMaxCostChange: (maxCost: CostFilter) => void;
  onModelLimitChange: (modelLimit: ModelLimit) => void;
  onGlobalModelFilterQueryChange: (value: string) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const deferredPayload = useDeferredValue(payload);
  const deferredSelectedProviders = useDeferredValue(selectedProviders);
  const deferredMaxCost = useDeferredValue(maxCost);
  const deferredModelLimit = useDeferredValue(modelLimit);
  const deferredGlobalModelFilterQuery = useDeferredValue(globalModelFilterQuery);
  const deferredShowReasoningVariants = useDeferredValue(showReasoningVariants);

  const allModels = useMemo(() => {
    return (deferredPayload?.models ?? [])
      .filter((model) => model.name != null && finite(model.scores?.intelligence_score))
      .sort((left, right) => right.scores.intelligence_score - left.scores.intelligence_score);
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

  const models = useMemo(() => {
    return limitByIntelligenceScore(filteredModels, (model) => model, deferredModelLimit);
  }, [filteredModels, deferredModelLimit]);
  const currentSection = useCurrentResearchSection(deferredPayload != null && allModels.length > 0);

  const filteredModelCount = modelCount(filteredModels);
  const visibleModelCount = modelCount(models);
  const visibleModelLabel = deferredShowReasoningVariants
    ? `${
        deferredModelLimit === "all" || filteredModelCount <= deferredModelLimit
          ? fmtCompact(visibleModelCount)
          : `Top ${deferredModelLimit} of ${fmtCompact(filteredModelCount)}`
      } models / ${fmtCompact(models.length)} variants`
    : deferredModelLimit === "all" || filteredModelCount <= deferredModelLimit
      ? `${fmtCompact(visibleModelCount)} models`
      : `Top ${deferredModelLimit} of ${fmtCompact(filteredModelCount)} models`;
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
  const compactLimitLabel = modelLimit === "all" ? "All" : `Top ${modelLimit}`;
  const filterSummary = `${compactModelFilterLabel} / ${compactProviderLabel} / ${compactCostLabel} / ${compactLimitLabel}`;

  if (!payload || !deferredPayload || allModels.length === 0) {
    return (
      <section className={styles.atlas} aria-label="Model graphs" data-capture-theme>
        <ModelSignature models={[]} />
        <BenchmarkStrip payload={payload} models={[]} isLoading={benchmarksLoading} />
        <div className={styles.error}>Unable to load the Model Atlas snapshot.</div>
        {afterLead}
      </section>
    );
  }

  return (
    <section className={styles.atlas} aria-label="Model graphs" data-capture-theme>
      <ModelSignature models={filteredModels} />
      <section className={styles.instrumentRail} aria-label="Global view">
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
            <FilterSection label="Model count" value={visibleModelLabel}>
              <div className={`${styles.filterRow} ${styles.costFilterRow}`}>
                {modelLimitOptions.map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    className={styles.costFilterButton}
                    aria-pressed={modelLimit === option}
                    onClick={() => onModelLimitChange(option)}
                  >
                    <span>{option === "all" ? "All" : `Top ${option}`}</span>
                  </button>
                ))}
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
            <BenchmarkStrip
              payload={deferredPayload}
              models={models}
              isLoading={benchmarksLoading}
            />
          </div>
        </div>
      </section>
      {afterLead}

      {models.length === 0 ? (
        <div className={styles.error}>No models match the current global filters.</div>
      ) : (
        <>
          <section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
            <ParetoFrontierPanel models={models} setHover={setHover} />
            <PriceEfficiencyPanel
              benchmarkPortfolio={deferredPayload.metadata.scoring.benchmark_portfolio}
              globalModelFilterQuery={deferredGlobalModelFilterQuery}
              showVariants={deferredShowReasoningVariants}
              maxCost={deferredMaxCost}
              onShowVariantsChange={onShowReasoningVariantsChange}
              selectedProviders={deferredSelectedProviders}
              onSelectedProvidersChange={onSelectedProvidersChange}
              referenceModels={referenceModels}
              setHover={setHover}
            />
          </section>
          <section className={styles.sectionGrid}>
            <FrontierBenchmarksPanel
              payload={deferredPayload}
              models={models}
              referenceModels={referenceModels}
              setHover={setHover}
            />
            <InteractionMatrix
              models={models}
              referenceModels={referenceModels}
              benchmarkPortfolio={deferredPayload.metadata.scoring.benchmark_portfolio}
              hasFullPayload={hasFullPayload}
              setHover={setHover}
            />
          </section>
        </>
      )}

      {hover ? <HoverCard hover={hover} /> : null}
    </section>
  );
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
