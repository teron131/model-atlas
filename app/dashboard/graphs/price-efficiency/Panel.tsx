/** Price-efficiency comparison panel controls, model selection, summaries, and graph composition. */

import { memo, useDeferredValue, useMemo, useRef, useState } from "react";

import {
  type BenchmarkPortfolio,
  isPreviewModel,
  type ModelAtlasModel,
  type ModelAtlasPublishedModel,
} from "../../../../src/model-atlas/stats/types";
import { CaptureButton } from "../../capture/CaptureButton";
import { captureFileToken } from "../../capture/png";
import { useDisplayLimit } from "../../shared/DisplayControls";
import {
  type CostFilter,
  filterByIntelligenceRank,
  filterByModelControls,
  filterByModelQuery,
  filterByReleaseRecency,
  modelCount,
  modelName,
  type ModelRankFilter,
  modelsForVariantDisplay,
  providerOptions,
  type RecencyFilter,
} from "../../shared/model-display";
import { ModelToolbar } from "../../shared/ModelToolbar";
import { BoxWhiskerSummary } from "../BoxWhiskerSummary";
import { bestByScore, valueDistribution } from "../chart-stats";
import { EmptyChart, PreviewLabelLegend, SummaryCard } from "../ChartComponents";
import {
  filterGraphPreviewsByIntelligenceFloor,
  limitGraphItemsByOfficialCount,
} from "../model-series";
import { Panel } from "../Panel";
import type { HoverSetter } from "../types";
import { useCompactChartLayout } from "../use-media-query";
import {
  priceEfficiencyDeltaDetail,
  priceEfficiencyRows,
  priceEfficiencySummaryDetail,
} from "./rows";
import { priceEfficiencyChartWidth, PriceEfficiencySlopeGraph } from "./SlopeGraph";

import styles from "../graphs.module.css";

const PANEL_TITLE = "Price vs Cost Efficiency";

export const PriceEfficiencyPanel = memo(function PriceEfficiencyPanel({
  benchmarkPortfolio,
  models,
  globalModelFilterQuery,
  showVariants,
  maxCost,
  modelRankFilter,
  recencyFilter,
  observedAtEpochSeconds,
  onShowVariantsChange,
  selectedProviders,
  onSelectedProvidersChange,
  referenceModels,
  setHover,
}: {
  benchmarkPortfolio: BenchmarkPortfolio;
  models: ModelAtlasPublishedModel[];
  globalModelFilterQuery: string;
  showVariants: boolean;
  maxCost: CostFilter;
  modelRankFilter: ModelRankFilter;
  recencyFilter: RecencyFilter;
  observedAtEpochSeconds: number | null;
  onShowVariantsChange: (show: boolean) => void;
  selectedProviders: string[];
  onSelectedProvidersChange: (providers: string[]) => void;
  referenceModels: ModelAtlasModel[];
  setHover: HoverSetter;
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const deferredFilterQuery = useDeferredValue(filterQuery);
  const panelRef = useRef<HTMLElement>(null);
  const compactChartLayout = useCompactChartLayout();
  const chartWidth = priceEfficiencyChartWidth(compactChartLayout);
  const displayModels = useMemo(() => {
    const displayVariants = modelsForVariantDisplay(models, showVariants)
      .filter((model) => model.name != null && Number.isFinite(model.scores?.intelligence_score))
      .sort(
        (left, right) =>
          Number(right.scores.intelligence_score) - Number(left.scores.intelligence_score),
      );
    return filterByModelQuery(displayVariants, (model) => model, globalModelFilterQuery);
  }, [globalModelFilterQuery, models, showVariants]);
  const providerChoices = useMemo(() => providerOptions(displayModels), [displayModels]);
  const providerModelCount = modelCount(displayModels);
  const availableRows = useMemo(() => {
    const filteredModels = filterByModelControls(displayModels, (model) => model, {
      providers: selectedProviders,
      maxCost,
    });
    const recencyFilteredModels = filterByReleaseRecency(
      filteredModels,
      (model) => model,
      recencyFilter,
      observedAtEpochSeconds,
    );
    const rankFilteredModels = filterByIntelligenceRank(
      recencyFilteredModels,
      (model) => model,
      modelRankFilter,
      referenceModels,
    );
    const graphModels = filterGraphPreviewsByIntelligenceFloor(
      rankFilteredModels,
      (model) => model,
    );
    return priceEfficiencyRows(graphModels, referenceModels, benchmarkPortfolio, showVariants).sort(
      (left, right) =>
        Number(right.model.scores.intelligence_score) -
        Number(left.model.scores.intelligence_score),
    );
  }, [
    benchmarkPortfolio,
    displayModels,
    showVariants,
    maxCost,
    modelRankFilter,
    observedAtEpochSeconds,
    recencyFilter,
    referenceModels,
    selectedProviders,
  ]);
  const maximumLimit = availableRows.filter((row) => !isPreviewModel(row.model)).length;
  const [effectiveLimit, setDisplayLimit] = useDisplayLimit(maximumLimit);
  const matchingRows = useMemo(
    () => filterByModelQuery(availableRows, (row) => row.model, deferredFilterQuery),
    [availableRows, deferredFilterQuery],
  );
  const rows = limitGraphItemsByOfficialCount(matchingRows, (row) => row.model, effectiveLimit);
  const itemKind = showVariants ? "variants" : "models";
  const captureFileName = [
    `model-atlas-price-vs-cost-efficiency-top-${effectiveLimit}-${itemKind}`,
    ...(selectedProviders.length === 0
      ? []
      : [`providers-${selectedProviders.map(captureFileToken).join("-")}`]),
    ...(deferredFilterQuery.trim().length === 0
      ? []
      : [`filter-${captureFileToken(deferredFilterQuery)}`]),
  ].join("-");
  const controls = (
    <ModelToolbar
      filterQuery={filterQuery}
      rowCountLabel={
        deferredFilterQuery.trim().length === 0 ? null : `${matchingRows.length} matches`
      }
      provider={{
        id: "price-efficiency-provider-menu",
        label: "Filter price efficiency providers",
        options: providerChoices,
        totalCount: providerModelCount,
        selectedProviders,
        onSelectedProvidersChange,
      }}
      display={{
        id: "price-efficiency-model-limit",
        label: "Price efficiency graph display",
        itemKind,
        maximum: maximumLimit,
        value: effectiveLimit,
        onValueChange: setDisplayLimit,
        variantControl: {
          showVariants,
          onShowVariantsChange,
        },
      }}
      screenshotControl={
        <CaptureButton
          targetRef={panelRef}
          title={PANEL_TITLE}
          captureWidth={chartWidth + 48}
          fileName={captureFileName}
        />
      }
      onFilterQueryChange={setFilterQuery}
    />
  );
  if (rows.length === 0) {
    return (
      <Panel
        captureEnabled={false}
        captureWidth={chartWidth}
        panelRef={panelRef}
        sectionId="price-efficiency"
        sectionLabel="Cost view · Quality-adjusted efficiency"
        title={PANEL_TITLE}
        copy="Compares effective token-price efficiency with the cost efficiency of benchmark work."
        wide
      >
        {controls}
        <EmptyChart message="No models have enough blended price and benchmark task-cost data for the price-efficiency comparison." />
      </Panel>
    );
  }

  const plottedRows = [...rows].sort(
    (left, right) => left.costEfficiencyScore - right.costEfficiencyScore,
  );
  const officialRows = rows.filter((row) => !isPreviewModel(row.model));
  const efficiencyLeader = bestByScore(officialRows, (row) => row.costEfficiencyScore);
  const bestLift = bestByScore(officialRows, (row) => row.deltaScore);
  const worstDrop = bestByScore(officialRows, (row) => -row.deltaScore);
  const scoreDistribution = valueDistribution(officialRows.map((row) => row.costEfficiencyScore));

  return (
    <Panel
      captureEnabled={false}
      captureWidth={chartWidth}
      panelRef={panelRef}
      sectionId="price-efficiency"
      sectionLabel="Cost view · Quality-adjusted efficiency"
      title={PANEL_TITLE}
      copy="Each line links a visible model variant's Price Score to its quality-adjusted benchmark task-cost efficiency. Higher is better on both sides. Both scores stay calibrated against the full public leaderboard, so filters change only which variants are shown."
      summary={
        <BoxWhiskerSummary
          label="Benchmark cost efficiency"
          countLabel={itemKind}
          distribution={scoreDistribution}
          domainMax={100}
          formatValue={(value) => value.toFixed(0)}
          showDomainEndpoints
        />
      }
      wide
    >
      {controls}
      <PriceEfficiencySlopeGraph
        compactLayout={compactChartLayout}
        rows={plottedRows}
        setHover={setHover}
      />
      {rows.some((row) => isPreviewModel(row.model)) ? (
        <div className={styles.chartFooterCaption}>
          <PreviewLabelLegend />
        </div>
      ) : null}
      <div className={styles.chartSummary}>
        {efficiencyLeader == null ? null : (
          <SummaryCard
            label="Leader"
            value={modelName(efficiencyLeader.model)}
            detail={priceEfficiencySummaryDetail(efficiencyLeader)}
          />
        )}
        {bestLift == null ? null : (
          <SummaryCard
            label="Best lift"
            value={modelName(bestLift.model)}
            detail={priceEfficiencyDeltaDetail(bestLift)}
          />
        )}
        {worstDrop == null ? null : (
          <SummaryCard
            label="Worst drop"
            value={modelName(worstDrop.model)}
            detail={priceEfficiencyDeltaDetail(worstDrop)}
          />
        )}
      </div>
    </Panel>
  );
});
