/** Price-efficiency comparison panel controls, model selection, summaries, and graph composition. */

import { memo, useDeferredValue, useMemo, useRef, useState } from "react";

import type { BenchmarkPortfolio, ModelAtlasModel } from "../../../../src/model-atlas/stats/types";
import { CaptureButton } from "../../capture/CaptureButton";
import { captureFileToken } from "../../capture/png";
import { useDisplayLimit } from "../../shared/DisplayControls";
import {
  type CostFilter,
  filterByModelControls,
  filterByModelQuery,
  modelCount,
  modelName,
  modelsForVariantDisplay,
  providerOptions,
} from "../../shared/model-display";
import { ModelToolbar } from "../../shared/ModelToolbar";
import { BoxWhiskerSummary } from "../BoxWhiskerSummary";
import { bestByScore, valueDistribution } from "../chart-stats";
import { EmptyChart, SummaryCard } from "../ChartComponents";
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
  globalModelFilterQuery,
  showVariants,
  maxCost,
  onShowVariantsChange,
  selectedProviders,
  onSelectedProvidersChange,
  referenceModels,
  setHover,
}: {
  benchmarkPortfolio: BenchmarkPortfolio;
  globalModelFilterQuery: string;
  showVariants: boolean;
  maxCost: CostFilter;
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
    const models = modelsForVariantDisplay(referenceModels, showVariants)
      .filter((model) => model.name != null && Number.isFinite(model.scores?.intelligence_score))
      .sort((left, right) => right.scores.intelligence_score - left.scores.intelligence_score);
    return filterByModelQuery(models, (model) => model, globalModelFilterQuery);
  }, [globalModelFilterQuery, referenceModels, showVariants]);
  const providerChoices = useMemo(() => providerOptions(displayModels), [displayModels]);
  const providerModelCount = modelCount(displayModels);
  const availableRows = useMemo(() => {
    const filteredModels = filterByModelControls(displayModels, (model) => model, {
      providers: selectedProviders,
      maxCost,
    });
    return priceEfficiencyRows(
      filteredModels,
      referenceModels,
      benchmarkPortfolio,
      showVariants,
    ).sort(
      (left, right) => right.model.scores.intelligence_score - left.model.scores.intelligence_score,
    );
  }, [
    benchmarkPortfolio,
    displayModels,
    showVariants,
    maxCost,
    referenceModels,
    selectedProviders,
  ]);
  const maximumLimit = availableRows.length;
  const [effectiveLimit, setDisplayLimit] = useDisplayLimit(maximumLimit);
  const matchingRows = useMemo(
    () => filterByModelQuery(availableRows, (row) => row.model, deferredFilterQuery),
    [availableRows, deferredFilterQuery],
  );
  const rows = matchingRows.slice(0, effectiveLimit);
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
  const efficiencyLeader = bestByScore(rows, (row) => row.costEfficiencyScore);
  const bestLift = bestByScore(rows, (row) => row.deltaScore);
  const worstDrop = bestByScore(rows, (row) => -row.deltaScore);
  const scoreDistribution = valueDistribution(rows.map((row) => row.costEfficiencyScore));

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
