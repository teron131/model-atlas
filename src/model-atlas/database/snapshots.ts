/** Source snapshots share one cache-aware workflow across local SQLite and production D1. */

import type { DatabaseSync } from "node:sqlite";

import { selectModelsDevRowsForArtificialAnalysis } from "../stats/source-policy";
import type { ScoringConfig } from "../stats/types";
import {
	readAgentArenaRawCache,
	readAgentsLastExamRawCache,
	readAleBenchRawCache,
	readArtificialAnalysisEvaluationResourceRawCache,
	readArtificialAnalysisRawCache,
	readBlueprintBenchRawCache,
	readBrowseCompRawCache,
	readChartographyRawCache,
	readChessPuzzlesRawCache,
	readCodeMigrationRawCache,
	readCursorBenchRawCache,
	readCyberBenchRawCache,
	readDeepSWERawCache,
	readEbrBenchRawCache,
	readEmbRawCache,
	readEnterpriseBenchCoreCraftRawCache,
	readEpochCapabilitiesIndexRawCache,
	readFinanceAgentV2RawCache,
	readFrontierCodeRawCache,
	readFrontierMathTier4RawCache,
	readGdpPdfRawCache,
	readHandbookMdRawCache,
	readHarveyLabRawCache,
	readLegalResearchRawCache,
	readMedCodeRawCache,
	readMercorApexAgentsRawCache,
	readModelsDevRawCache,
	readProgramBenchRawCache,
	readProofBenchRawCache,
	readPublicBenefitsBenchRawCache,
	readRawSourceCacheStatus,
	readRiemannBenchRawCache,
	readTerminalBenchRawCache,
	readToolathlonRawCache,
	readValsIndexRawCache,
	readVendingBench2RawCache,
	readVibeCodeRawCache,
	readWeirdMlRawCache,
} from "./cache";
import { missingSinceBySource, persistedSourceRowStates } from "./policy";
import { artificialAnalysisSnapshot } from "./source-snapshots/artificial-analysis";
import { modelsDevSnapshot } from "./source-snapshots/models-dev";
import {
	agentArenaSnapshot,
	aleBenchSnapshot,
	artificialAnalysisEvaluationResourceSnapshot,
	blueprintBenchSnapshot,
	browseCompSnapshot,
	chartographySnapshot,
	chessPuzzlesSnapshot,
	codeMigrationSnapshot,
	cursorBenchSnapshot,
	cyberBenchSnapshot,
	ebrBenchSnapshot,
	embSnapshot,
	enterpriseBenchCoreCraftSnapshot,
	epochCapabilitiesIndexSnapshot,
	financeAgentV2Snapshot,
	frontierCodeSnapshot,
	frontierMathTier4Snapshot,
	gdpPdfSnapshot,
	handbookMdSnapshot,
	harveyLabSnapshot,
	legalResearchSnapshot,
	medCodeSnapshot,
	mercorApexAgentsSnapshot,
	programBenchSnapshot,
	proofBenchSnapshot,
	publicBenefitsBenchSnapshot,
	riemannBenchSnapshot,
	terminalBenchSnapshot,
	toolathlonSnapshot,
	valsIndexSnapshot,
	vendingBench2Snapshot,
	vibeCodeSnapshot,
	weirdMlSnapshot,
} from "./source-snapshots/sparse-benchmarks";
import {
	agentsLastExamSnapshot,
	deepSWESnapshot,
} from "./source-snapshots/summarized-benchmarks";
import {
	type DatabaseBuildOptions,
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceRowState,
	type SourceSnapshotStatus,
	type SourceSnapshots,
} from "./types";

type SourceSnapshotCacheResult = {
	snapshots: SourceSnapshots;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
};

export type SourceSnapshotCaches = {
	artificialAnalysis: ReturnType<typeof readArtificialAnalysisRawCache>;
	artificialAnalysisEvaluationResources: ReturnType<
		typeof readArtificialAnalysisEvaluationResourceRawCache
	>;
	modelsDev: ReturnType<typeof readModelsDevRawCache>;
	agentArena: ReturnType<typeof readAgentArenaRawCache>;
	aleBench: ReturnType<typeof readAleBenchRawCache>;
	agentsLastExam: ReturnType<typeof readAgentsLastExamRawCache>;
	blueprintBench: ReturnType<typeof readBlueprintBenchRawCache>;
	browseComp: ReturnType<typeof readBrowseCompRawCache>;
	chartography: ReturnType<typeof readChartographyRawCache>;
	chessPuzzles: ReturnType<typeof readChessPuzzlesRawCache>;
	codeMigration: ReturnType<typeof readCodeMigrationRawCache>;
	cursorBench: ReturnType<typeof readCursorBenchRawCache>;
	cyberBench: ReturnType<typeof readCyberBenchRawCache>;
	deepSWE: ReturnType<typeof readDeepSWERawCache>;
	ebrBench: ReturnType<typeof readEbrBenchRawCache>;
	emb: ReturnType<typeof readEmbRawCache>;
	enterpriseBenchCoreCraft: ReturnType<
		typeof readEnterpriseBenchCoreCraftRawCache
	>;
	epochCapabilitiesIndex: ReturnType<typeof readEpochCapabilitiesIndexRawCache>;
	financeAgentV2: ReturnType<typeof readFinanceAgentV2RawCache>;
	frontierCode: ReturnType<typeof readFrontierCodeRawCache>;
	frontierMathTier4: ReturnType<typeof readFrontierMathTier4RawCache>;
	gdpPdf: ReturnType<typeof readGdpPdfRawCache>;
	handbookMd: ReturnType<typeof readHandbookMdRawCache>;
	harveyLab: ReturnType<typeof readHarveyLabRawCache>;
	legalResearch: ReturnType<typeof readLegalResearchRawCache>;
	mercorApexAgents: ReturnType<typeof readMercorApexAgentsRawCache>;
	medCode: ReturnType<typeof readMedCodeRawCache>;
	proofBench: ReturnType<typeof readProofBenchRawCache>;
	programBench: ReturnType<typeof readProgramBenchRawCache>;
	publicBenefitsBench: ReturnType<typeof readPublicBenefitsBenchRawCache>;
	riemannBench: ReturnType<typeof readRiemannBenchRawCache>;
	terminalBench: ReturnType<typeof readTerminalBenchRawCache>;
	toolathlon: ReturnType<typeof readToolathlonRawCache>;
	valsIndex: ReturnType<typeof readValsIndexRawCache>;
	vendingBench2: ReturnType<typeof readVendingBench2RawCache>;
	vibeCode: ReturnType<typeof readVibeCodeRawCache>;
	weirdMl: ReturnType<typeof readWeirdMlRawCache>;
};

function readSqliteSourceCaches(db: DatabaseSync): SourceSnapshotCaches {
	return {
		artificialAnalysis: readArtificialAnalysisRawCache(db),
		artificialAnalysisEvaluationResources:
			readArtificialAnalysisEvaluationResourceRawCache(db),
		modelsDev: readModelsDevRawCache(db),
		agentArena: readAgentArenaRawCache(db),
		aleBench: readAleBenchRawCache(db),
		agentsLastExam: readAgentsLastExamRawCache(db),
		blueprintBench: readBlueprintBenchRawCache(db),
		browseComp: readBrowseCompRawCache(db),
		chartography: readChartographyRawCache(db),
		chessPuzzles: readChessPuzzlesRawCache(db),
		codeMigration: readCodeMigrationRawCache(db),
		cursorBench: readCursorBenchRawCache(db),
		cyberBench: readCyberBenchRawCache(db),
		deepSWE: readDeepSWERawCache(db),
		ebrBench: readEbrBenchRawCache(db),
		emb: readEmbRawCache(db),
		enterpriseBenchCoreCraft: readEnterpriseBenchCoreCraftRawCache(db),
		epochCapabilitiesIndex: readEpochCapabilitiesIndexRawCache(db),
		financeAgentV2: readFinanceAgentV2RawCache(db),
		frontierCode: readFrontierCodeRawCache(db),
		frontierMathTier4: readFrontierMathTier4RawCache(db),
		gdpPdf: readGdpPdfRawCache(db),
		handbookMd: readHandbookMdRawCache(db),
		harveyLab: readHarveyLabRawCache(db),
		legalResearch: readLegalResearchRawCache(db),
		mercorApexAgents: readMercorApexAgentsRawCache(db),
		medCode: readMedCodeRawCache(db),
		proofBench: readProofBenchRawCache(db),
		programBench: readProgramBenchRawCache(db),
		publicBenefitsBench: readPublicBenefitsBenchRawCache(db),
		riemannBench: readRiemannBenchRawCache(db),
		terminalBench: readTerminalBenchRawCache(db),
		toolathlon: readToolathlonRawCache(db),
		valsIndex: readValsIndexRawCache(db),
		vendingBench2: readVendingBench2RawCache(db),
		vibeCode: readVibeCodeRawCache(db),
		weirdMl: readWeirdMlRawCache(db),
	};
}

function readSourceCacheStatuses(
	db: DatabaseSync,
	nowEpochSeconds: number,
): Record<RawSourceName, RawSourceCacheStatus> {
	return Object.fromEntries(
		RAW_SOURCE_NAMES.map((source) => [
			source,
			readRawSourceCacheStatus(db, source, nowEpochSeconds),
		]),
	) as Record<RawSourceName, RawSourceCacheStatus>;
}

/** Updates source cache status after source refresh snapshots. */
function updatedSourceCacheStatus(
	status: RawSourceCacheStatus,
	lastFetchEpochSeconds: number | null,
	sourceInputCount: number,
): RawSourceCacheStatus {
	return {
		...status,
		refreshed:
			!status.cache_hit &&
			lastFetchEpochSeconds !== status.last_fetch_epoch_seconds,
		last_fetch_epoch_seconds: lastFetchEpochSeconds,
		source_input_count: sourceInputCount,
	};
}

function updateSourceCacheStatuses(
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>,
	sourceStatuses: SourceSnapshotStatus[],
): void {
	for (const sourceStatus of sourceStatuses) {
		sourceCache[sourceStatus.source] = updatedSourceCacheStatus(
			sourceCache[sourceStatus.source],
			sourceStatus.fetchedAt,
			sourceStatus.sourceInputCount,
		);
	}
}

function fetchedAtFromStatuses(
	sourceStatuses: SourceSnapshotStatus[],
): SourceSnapshots["fetchedAt"] {
	const fetchedAt: SourceSnapshots["fetchedAt"] = {
		artificialAnalysis: null,
		artificialAnalysisEvaluationResources: null,
		agentArena: null,
		aleBench: null,
		agentsLastExam: null,
		blueprintBench: null,
		browseComp: null,
		chartography: null,
		chessPuzzles: null,
		codeMigration: null,
		cursorBench: null,
		cyberBench: null,
		deepSWE: null,
		ebrBench: null,
		emb: null,
		enterpriseBenchCoreCraft: null,
		epochCapabilitiesIndex: null,
		financeAgentV2: null,
		frontierCode: null,
		frontierMathTier4: null,
		gdpPdf: null,
		handbookMd: null,
		harveyLab: null,
		legalResearch: null,
		mercorApexAgents: null,
		medCode: null,
		proofBench: null,
		programBench: null,
		publicBenefitsBench: null,
		riemannBench: null,
		terminalBench: null,
		toolathlon: null,
		valsIndex: null,
		vendingBench2: null,
		vibeCode: null,
		weirdMl: null,
	};
	for (const sourceStatus of sourceStatuses) {
		if (sourceStatus.fetchedAtKey != null) {
			fetchedAt[sourceStatus.fetchedAtKey] = sourceStatus.fetchedAt;
		}
	}
	return fetchedAt;
}

/** Load raw source snapshots from SQLite when fresh, otherwise refresh daily source inputs. */
export async function loadSourceSnapshots(
	db: DatabaseSync,
	nowEpochSeconds: number,
	scoringConfig: ScoringConfig,
	options: DatabaseBuildOptions = {},
): Promise<SourceSnapshotCacheResult> {
	return refreshSourceSnapshots(
		readSqliteSourceCaches(db),
		readSourceCacheStatuses(db, nowEpochSeconds),
		persistedSourceRowStates(db),
		nowEpochSeconds,
		scoringConfig,
		options,
	);
}

/** Refreshes normalized source snapshots from storage-independent cached source values. */
export async function refreshSourceSnapshots(
	caches: SourceSnapshotCaches,
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>,
	previousSourceRowStates: readonly SourceRowState[],
	nowEpochSeconds: number,
	scoringConfig: ScoringConfig,
	options: DatabaseBuildOptions = {},
): Promise<SourceSnapshotCacheResult> {
	const previousMissingSince = missingSinceBySource(previousSourceRowStates);
	const [
		artificialAnalysis,
		artificialAnalysisEvaluationResources,
		modelsDev,
		agentArena,
		aleBench,
		agentsLastExam,
		blueprintBench,
		browseComp,
		chartography,
		chessPuzzles,
		codeMigration,
		cursorBench,
		cyberBench,
		deepSWE,
		ebrBench,
		emb,
		enterpriseBenchCoreCraft,
		epochCapabilitiesIndex,
		financeAgentV2,
		frontierCode,
		frontierMathTier4,
		gdpPdf,
		handbookMd,
		harveyLab,
		legalResearch,
		medCode,
		mercorApexAgents,
		programBench,
		proofBench,
		publicBenefitsBench,
		riemannBench,
		terminalBench,
		toolathlon,
		valsIndex,
		vendingBench2,
		vibeCode,
		weirdMl,
	] = await Promise.all([
		artificialAnalysisSnapshot(
			caches.artificialAnalysis,
			sourceCache.artificial_analysis,
			options,
			scoringConfig,
			previousMissingSince.artificial_analysis,
			nowEpochSeconds,
		),
		artificialAnalysisEvaluationResourceSnapshot(
			caches.artificialAnalysisEvaluationResources,
			sourceCache.artificial_analysis_evaluation_resources,
			options,
			previousMissingSince.artificial_analysis_evaluation_resources,
			nowEpochSeconds,
		),
		modelsDevSnapshot(
			caches.modelsDev,
			sourceCache.models_dev,
			options,
			previousMissingSince.models_dev,
			nowEpochSeconds,
		),
		agentArenaSnapshot(
			caches.agentArena,
			sourceCache.agent_arena,
			options,
			previousMissingSince.agent_arena,
			nowEpochSeconds,
		),
		aleBenchSnapshot(
			caches.aleBench,
			sourceCache.ale_bench,
			options,
			previousMissingSince.ale_bench,
			nowEpochSeconds,
		),
		agentsLastExamSnapshot(
			caches.agentsLastExam,
			sourceCache.agents_last_exam,
			options,
			previousMissingSince.agents_last_exam,
			nowEpochSeconds,
		),
		blueprintBenchSnapshot(
			caches.blueprintBench,
			sourceCache.blueprint_bench_2,
			options,
			previousMissingSince.blueprint_bench_2,
			nowEpochSeconds,
		),
		browseCompSnapshot(
			caches.browseComp,
			sourceCache.browsecomp,
			options,
			previousMissingSince.browsecomp,
			nowEpochSeconds,
		),
		chartographySnapshot(
			caches.chartography,
			sourceCache.chartography,
			options,
			previousMissingSince.chartography,
			nowEpochSeconds,
		),
		chessPuzzlesSnapshot(
			caches.chessPuzzles,
			sourceCache.chess_puzzles,
			options,
			previousMissingSince.chess_puzzles,
			nowEpochSeconds,
		),
		codeMigrationSnapshot(
			caches.codeMigration,
			sourceCache.code_migration,
			options,
			previousMissingSince.code_migration,
			nowEpochSeconds,
		),
		cursorBenchSnapshot(
			caches.cursorBench,
			sourceCache.cursorbench,
			options,
			previousMissingSince.cursorbench,
			nowEpochSeconds,
		),
		cyberBenchSnapshot(
			caches.cyberBench,
			sourceCache.cyberbench,
			options,
			previousMissingSince.cyberbench,
			nowEpochSeconds,
		),
		deepSWESnapshot(
			caches.deepSWE,
			sourceCache.deep_swe,
			options,
			previousMissingSince.deep_swe,
			nowEpochSeconds,
		),
		ebrBenchSnapshot(
			caches.ebrBench,
			sourceCache.ebr_bench,
			options,
			previousMissingSince.ebr_bench,
			nowEpochSeconds,
		),
		embSnapshot(
			caches.emb,
			sourceCache.emb,
			options,
			previousMissingSince.emb,
			nowEpochSeconds,
		),
		enterpriseBenchCoreCraftSnapshot(
			caches.enterpriseBenchCoreCraft,
			sourceCache.enterprisebench_corecraft,
			options,
			previousMissingSince.enterprisebench_corecraft,
			nowEpochSeconds,
		),
		epochCapabilitiesIndexSnapshot(
			caches.epochCapabilitiesIndex,
			sourceCache.epoch_capabilities_index,
			options,
			previousMissingSince.epoch_capabilities_index,
			nowEpochSeconds,
		),
		financeAgentV2Snapshot(
			caches.financeAgentV2,
			sourceCache.finance_agent_v2,
			options,
			previousMissingSince.finance_agent_v2,
			nowEpochSeconds,
		),
		frontierCodeSnapshot(
			caches.frontierCode,
			sourceCache.frontier_code,
			options,
			previousMissingSince.frontier_code,
			nowEpochSeconds,
		),
		frontierMathTier4Snapshot(
			caches.frontierMathTier4,
			sourceCache.frontiermath_tier_4,
			options,
			previousMissingSince.frontiermath_tier_4,
			nowEpochSeconds,
		),
		gdpPdfSnapshot(
			caches.gdpPdf,
			sourceCache.gdp_pdf,
			options,
			previousMissingSince.gdp_pdf,
			nowEpochSeconds,
		),
		handbookMdSnapshot(
			caches.handbookMd,
			sourceCache.handbook_md,
			options,
			previousMissingSince.handbook_md,
			nowEpochSeconds,
		),
		harveyLabSnapshot(
			caches.harveyLab,
			sourceCache.vals_harvey_lab,
			options,
			previousMissingSince.vals_harvey_lab,
			nowEpochSeconds,
		),
		legalResearchSnapshot(
			caches.legalResearch,
			sourceCache.legal_research,
			options,
			previousMissingSince.legal_research,
			nowEpochSeconds,
		),
		medCodeSnapshot(
			caches.medCode,
			sourceCache.medcode,
			options,
			previousMissingSince.medcode,
			nowEpochSeconds,
		),
		mercorApexAgentsSnapshot(
			caches.mercorApexAgents,
			sourceCache.mercor_apex_agents,
			options,
			previousMissingSince.mercor_apex_agents,
			nowEpochSeconds,
		),
		programBenchSnapshot(
			caches.programBench,
			sourceCache.programbench,
			options,
			previousMissingSince.programbench,
			nowEpochSeconds,
		),
		proofBenchSnapshot(
			caches.proofBench,
			sourceCache.proofbench,
			options,
			previousMissingSince.proofbench,
			nowEpochSeconds,
		),
		publicBenefitsBenchSnapshot(
			caches.publicBenefitsBench,
			sourceCache.public_benefits_bench,
			options,
			previousMissingSince.public_benefits_bench,
			nowEpochSeconds,
		),
		riemannBenchSnapshot(
			caches.riemannBench,
			sourceCache.riemann_bench,
			options,
			previousMissingSince.riemann_bench,
			nowEpochSeconds,
		),
		terminalBenchSnapshot(
			caches.terminalBench,
			sourceCache.vals_terminal_bench,
			options,
			previousMissingSince.vals_terminal_bench,
			nowEpochSeconds,
		),
		toolathlonSnapshot(
			caches.toolathlon,
			sourceCache.toolathlon,
			options,
			previousMissingSince.toolathlon,
			nowEpochSeconds,
		),
		valsIndexSnapshot(
			caches.valsIndex,
			sourceCache.vals_index,
			options,
			previousMissingSince.vals_index,
			nowEpochSeconds,
		),
		vendingBench2Snapshot(
			caches.vendingBench2,
			sourceCache.vending_bench_2,
			options,
			previousMissingSince.vending_bench_2,
			nowEpochSeconds,
		),
		vibeCodeSnapshot(
			caches.vibeCode,
			sourceCache.vibe_code,
			options,
			previousMissingSince.vibe_code,
			nowEpochSeconds,
		),
		weirdMlSnapshot(
			caches.weirdMl,
			sourceCache.weirdml,
			options,
			previousMissingSince.weirdml,
			nowEpochSeconds,
		),
	]);
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDev.modelsDevPayload,
		artificialAnalysis.artificialAnalysisSelectedRows,
	);
	const sourceStatuses: SourceSnapshotStatus[] = [
		artificialAnalysis.sourceStatus,
		artificialAnalysisEvaluationResources.sourceStatus,
		modelsDev.sourceStatus,
		agentArena.sourceStatus,
		aleBench.sourceStatus,
		agentsLastExam.sourceStatus,
		blueprintBench.sourceStatus,
		browseComp.sourceStatus,
		chartography.sourceStatus,
		chessPuzzles.sourceStatus,
		codeMigration.sourceStatus,
		cursorBench.sourceStatus,
		cyberBench.sourceStatus,
		deepSWE.sourceStatus,
		ebrBench.sourceStatus,
		emb.sourceStatus,
		enterpriseBenchCoreCraft.sourceStatus,
		epochCapabilitiesIndex.sourceStatus,
		financeAgentV2.sourceStatus,
		frontierCode.sourceStatus,
		frontierMathTier4.sourceStatus,
		gdpPdf.sourceStatus,
		handbookMd.sourceStatus,
		harveyLab.sourceStatus,
		legalResearch.sourceStatus,
		medCode.sourceStatus,
		mercorApexAgents.sourceStatus,
		programBench.sourceStatus,
		proofBench.sourceStatus,
		publicBenefitsBench.sourceStatus,
		riemannBench.sourceStatus,
		terminalBench.sourceStatus,
		toolathlon.sourceStatus,
		valsIndex.sourceStatus,
		vendingBench2.sourceStatus,
		vibeCode.sourceStatus,
		weirdMl.sourceStatus,
	];
	updateSourceCacheStatuses(sourceCache, sourceStatuses);
	return {
		snapshots: {
			artificialAnalysisRawRows: artificialAnalysis.artificialAnalysisRawRows,
			artificialAnalysisSelectedRows:
				artificialAnalysis.artificialAnalysisSelectedRows,
			artificialAnalysisEvaluationResourceRows:
				artificialAnalysisEvaluationResources.artificialAnalysisEvaluationResourceRows,
			modelsDevPayload: modelsDev.modelsDevPayload,
			modelsDevModels,
			modelsDevFetchedAt: modelsDev.modelsDevFetchedAt,
			modelsDevStatusCode: modelsDev.modelsDevStatusCode,
			agentArenaModelScoreRows: agentArena.agentArenaModelScoreRows,
			aleBenchConfigurationRows: aleBench.aleBenchConfigurationRows,
			agentsLastExamRows: agentsLastExam.agentsLastExamRows,
			agentsLastExamModelScores: agentsLastExam.agentsLastExamModelScores,
			blueprintBenchModelScoreRows: blueprintBench.blueprintBenchModelScoreRows,
			browseCompModelScoreRows: browseComp.browseCompModelScoreRows,
			chartographyRows: chartography.rows,
			chessPuzzleRows: chessPuzzles.rows,
			codeMigrationRows: codeMigration.rows,
			cursorBenchModelScoreRows: cursorBench.cursorBenchModelScoreRows,
			cyberBenchRows: cyberBench.rows,
			deepSWERawRows: deepSWE.deepSWERawRows,
			deepSWESourceVersion: deepSWE.deepSWESourceVersion,
			ebrBenchRows: ebrBench.rows,
			embRows: emb.rows,
			enterpriseBenchCoreCraftRows: enterpriseBenchCoreCraft.rows,
			epochCapabilitiesIndexRows: epochCapabilitiesIndex.rows,
			financeAgentV2Rows: financeAgentV2.rows,
			frontierCodeRows: frontierCode.frontierCodeRows,
			frontierMathTier4Rows: frontierMathTier4.rows,
			gdpPdfModelScoreRows: gdpPdf.gdpPdfModelScoreRows,
			handbookMdRows: handbookMd.rows,
			harveyLabRows: harveyLab.harveyLabRows,
			harveyLabModelScoreRows: harveyLab.harveyLabModelScoreRows,
			legalResearchRows: legalResearch.rows,
			medCodeRows: medCode.rows,
			mercorApexAgentsRows: mercorApexAgents.mercorApexAgentsRows,
			programBenchRows: programBench.rows,
			proofBenchRows: proofBench.proofBenchRows,
			publicBenefitsBenchRows: publicBenefitsBench.rows,
			riemannBenchModelScoreRows: riemannBench.riemannBenchModelScoreRows,
			riemannBenchSourceUrl: riemannBench.riemannBenchSourceUrl,
			terminalBenchRows: terminalBench.terminalBenchRows,
			terminalBenchModelScoreRows: terminalBench.terminalBenchModelScoreRows,
			toolathlonModelScoreRows: toolathlon.toolathlonModelScoreRows,
			valsIndexRows: valsIndex.valsIndexRows,
			valsIndexModelScoreRows: valsIndex.valsIndexModelScoreRows,
			vendingBench2ModelScoreRows: vendingBench2.vendingBench2ModelScoreRows,
			vendingBench2DataUrl: vendingBench2.vendingBench2DataUrl,
			vibeCodeRows: vibeCode.rows,
			weirdMlRows: weirdMl.weirdMlRows,
			sourceRowStates: sourceStatuses.flatMap(
				(sourceStatus) => sourceStatus.sourceRowStates,
			),
			fetchedAt: fetchedAtFromStatuses(sourceStatuses),
		},
		sourceCache,
	};
}
