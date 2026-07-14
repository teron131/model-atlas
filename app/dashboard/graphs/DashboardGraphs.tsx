"use client";

/** Interactive chart view for LLM stats payloads. */

import { useMemo, useState } from "react";
import type { LlmStatsPayload } from "../../../src/model-atlas/stats/types";
import { modelCount } from "../shared/modelDisplay";
import { FilterButton, HoverCard } from "./ChartComponents";
import { FrontierBenchmarksPanel } from "./FrontierBenchmarksPanel";
import { finite, fmtCompact, fmtMoney } from "./format";
import styles from "./graphs.module.css";
import { InteractionMatrix } from "./InteractionMatrix";
import {
	costFilterOptions,
	filterByModelControls,
	limitByIntelligenceScore,
	modelLimitOptions,
	providerOptions,
} from "./models";
import { ParetoFrontierPanel } from "./ParetoFrontierPanel";
import { PriceEfficiencyComparisonPanel } from "./PriceEfficiencyComparisonPanel";
import { RunwayPanel } from "./RunwayPanel";
import type { CostFilter, HoverState, ModelLimit } from "./types";

export function DashboardGraphs({
	payload,
	referenceModels,
	fullPayloadLoaded,
	benchmarkControls,
	afterLead,
	provider,
	maxCost,
	modelLimit,
	expandReasoningVariants,
	onExpandReasoningVariantsChange,
	onProviderChange,
	onMaxCostChange,
	onModelLimitChange,
}: {
	payload: LlmStatsPayload | null;
	referenceModels: LlmStatsPayload["models"];
	fullPayloadLoaded: boolean;
	benchmarkControls?: React.ReactNode;
	afterLead?: React.ReactNode;
	provider: string;
	maxCost: CostFilter;
	modelLimit: ModelLimit;
	expandReasoningVariants: boolean;
	onExpandReasoningVariantsChange: (enabled: boolean) => void;
	onProviderChange: (provider: string) => void;
	onMaxCostChange: (maxCost: CostFilter) => void;
	onModelLimitChange: (modelLimit: ModelLimit) => void;
}) {
	const [hover, setHover] = useState<HoverState | null>(null);
	const [filtersExpanded, setFiltersExpanded] = useState(false);

	const allModels = useMemo(() => {
		return (payload?.models ?? [])
			.filter(
				(model) =>
					model.name != null && finite(model.scores?.intelligence_score),
			)
			.sort(
				(left, right) =>
					right.scores.intelligence_score - left.scores.intelligence_score,
			);
	}, [payload]);

	const providers = useMemo(() => providerOptions(allModels), [allModels]);

	const filteredModels = useMemo(() => {
		return filterByModelControls(allModels, (model) => model, {
			provider,
			maxCost,
		});
	}, [allModels, provider, maxCost]);

	const models = useMemo(() => {
		return limitByIntelligenceScore(
			filteredModels,
			(model) => model,
			modelLimit,
		);
	}, [filteredModels, modelLimit]);

	const filteredModelCount = modelCount(filteredModels);
	const visibleModelCount = modelCount(models);
	const visibleModelLabel = expandReasoningVariants
		? `${
				modelLimit === "all" || filteredModelCount <= modelLimit
					? fmtCompact(visibleModelCount)
					: `Top ${modelLimit} of ${fmtCompact(filteredModelCount)}`
			} models / ${fmtCompact(models.length)} variants`
		: modelLimit === "all" || filteredModelCount <= modelLimit
			? `${fmtCompact(visibleModelCount)} models`
			: `Top ${modelLimit} of ${fmtCompact(filteredModelCount)} models`;
	const providerLabel =
		provider === "all"
			? "All providers"
			: (providers.find((item) => item.slug === provider)?.label ?? provider);
	const costLabel = maxCost === "all" ? "Any cost" : `<= ${fmtMoney(maxCost)}`;
	const compactCostLabel =
		maxCost === "all" ? "Any" : `<= ${fmtMoney(maxCost)}`;
	const compactLimitLabel = modelLimit === "all" ? "All" : `Top ${modelLimit}`;
	const filterSummary = `${providerLabel} / ${compactCostLabel} / ${compactLimitLabel}`;

	if (!payload || allModels.length === 0) {
		return (
			<section
				className={`${styles.atlas} ${styles.dashboardGraphs}`}
				aria-label="Model graphs"
			>
				{benchmarkControls}
				<div className={styles.error}>
					Unable to load the Model Atlas snapshot.
				</div>
				{afterLead}
			</section>
		);
	}

	return (
		<section
			className={`${styles.atlas} ${styles.dashboardGraphs}`}
			aria-label="Model graphs"
		>
			<section className={styles.controls} aria-label="Filters">
				<div className={styles.controlsBar}>
					<button
						type="button"
						className={styles.filtersToggle}
						aria-expanded={filtersExpanded}
						onClick={() => setFiltersExpanded((current) => !current)}
					>
						<span>Filters</span>
						<b>{filterSummary}</b>
						<i aria-hidden="true">{filtersExpanded ? "-" : "+"}</i>
					</button>
					<fieldset className={styles.variantSwitch}>
						<legend className={styles.visuallyHidden}>
							Reasoning variant display
						</legend>
						<span className={styles.variantSwitchLabel}>Variants</span>
						<div className={styles.variantOptions}>
							<button
								type="button"
								className={styles.variantOption}
								aria-pressed={!expandReasoningVariants}
								onClick={() => onExpandReasoningVariantsChange(false)}
							>
								Collapsed
							</button>
							<button
								type="button"
								className={styles.variantOption}
								aria-pressed={expandReasoningVariants}
								onClick={() => onExpandReasoningVariantsChange(true)}
							>
								Expanded
							</button>
						</div>
					</fieldset>
				</div>
				<div className={styles.filterPanel} hidden={!filtersExpanded}>
					<div className={styles.controlRow}>
						<FilterSection label="Provider filter" value={providerLabel}>
							<div className={styles.filterRow}>
								<FilterButton
									active={provider === "all"}
									color="var(--ink)"
									label="All"
									count={modelCount(allModels)}
									onClick={() => onProviderChange("all")}
								/>
								{providers.map((option) => (
									<FilterButton
										key={option.slug}
										active={provider === option.slug}
										color={option.color}
										logo={option.logo}
										label={option.label}
										count={option.count}
										onClick={() => onProviderChange(option.slug)}
									/>
								))}
							</div>
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
										<span>
											{option === "all" ? "Any" : `<= ${fmtMoney(option)}`}
										</span>
									</button>
								))}
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
					</div>
					{benchmarkControls != null && (
						<div className={styles.benchmarkRow}>{benchmarkControls}</div>
					)}
				</div>
			</section>
			{afterLead}

			{models.length === 0 ? (
				<div className={styles.error}>
					No models match the current provider and cost filters.
				</div>
			) : (
				<>
					<section className={`${styles.sectionGrid} ${styles.leadGrid}`}>
						<ParetoFrontierPanel models={models} setHover={setHover} />
						<PriceEfficiencyComparisonPanel
							benchmarkPortfolio={payload.metadata.scoring.benchmark_portfolio}
							expandReasoningVariants={expandReasoningVariants}
							models={models}
							referenceModels={referenceModels}
							setHover={setHover}
						/>
					</section>
					<section className={styles.sectionGrid}>
						<FrontierBenchmarksPanel
							payload={payload}
							models={models}
							setHover={setHover}
						/>
						<InteractionMatrix
							models={models}
							benchmarkPortfolio={payload.metadata.scoring.benchmark_portfolio}
							fullPayloadLoaded={fullPayloadLoaded}
							setHover={setHover}
						/>
						<RunwayPanel models={models} setHover={setHover} />
					</section>
				</>
			)}

			{hover ? <HoverCard hover={hover} /> : null}
		</section>
	);
}

function FilterSection({
	label,
	value,
	children,
}: {
	label: string;
	value: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.controlGroup}>
			<div className={styles.controlLabel}>
				<span>{label}</span>
				<b>{value}</b>
			</div>
			{children}
		</div>
	);
}
