import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { STAGE_CONFIG } from "../../../src/model-atlas/constants";
import {
	buildModelAtlasDatabase,
	modelAtlasD1Configured,
	modelAtlasD1MissingEnvironment,
	publishSqliteDatabaseToD1,
	readD1ModelAtlasPayload,
	readModelAtlasDatabasePayload,
} from "../../../src/model-atlas/llm/database";
import {
	DEFAULT_DATABASE_PATH,
	RAW_SOURCE_CACHE_SECONDS,
} from "../../../src/model-atlas/llm/database/types";
import { insertProcessedModelRows } from "../../../src/model-atlas/llm/database/writers";
import { buildBenchmarkUpdateHealth } from "../../../src/model-atlas/llm/stats/health";
import {
	preserveHighSignalSnapshotModels,
	SNAPSHOT_PRESERVATION_VERSION,
} from "../../../src/model-atlas/llm/stats/snapshot-preservation";
import type {
	LlmStatsMetadata,
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";

const STATIC_SNAPSHOT_PATH = resolve(
	process.cwd(),
	"public/model-atlas-snapshot.json",
);

type SnapshotWriteResult = {
	payload: LlmStatsPayload;
	storage: "cloudflare_d1";
	database_id: string;
	run_id: number;
};

type DisplayRefreshState = {
	refreshInFlight: Promise<LlmStatsPayload | null> | null;
	readInFlight: Promise<LlmStatsPayload | null> | null;
	cachedPayload: LlmStatsPayload | null;
	cacheExpiresAt: number;
};

export type DisplaySnapshotRefreshMode = "none" | "stored" | "live";

const displayRefreshState = globalThis as typeof globalThis & {
	__modelAtlasDisplayRefreshState?: DisplayRefreshState;
};
const DISPLAY_SNAPSHOT_MEMORY_CACHE_MILLISECONDS = 30_000;

export function runtimeSnapshotStoreConfigured(): boolean {
	return modelAtlasD1Configured();
}

export function runtimeSnapshotStoreMissingEnvironment(): string[] {
	return modelAtlasD1MissingEnvironment();
}

export async function readSnapshotPayload(): Promise<LlmStatsPayload | null> {
	if (process.env.MODEL_ATLAS_SNAPSHOT_URL) {
		return fetchRemoteSnapshot(process.env.MODEL_ATLAS_SNAPSHOT_URL);
	}
	return readSnapshotCache();
}

async function readSnapshotCache(): Promise<LlmStatsPayload | null> {
	const [d1Snapshot, localDatabaseSnapshot, staticSnapshot] = await Promise.all(
		[
			readD1Snapshot().catch(() => null),
			shouldReadStaticSnapshot()
				? Promise.resolve(null)
				: readLocalDatabaseSnapshot().catch(() => null),
			readStaticSnapshot().catch(() => null),
		],
	);
	return (
		d1Snapshot ?? bestSnapshotPayload(localDatabaseSnapshot, staticSnapshot)
	);
}

export async function readDisplaySnapshotPayload(): Promise<LlmStatsPayload | null> {
	const state = getDisplayRefreshState();
	if (state.cachedPayload != null && Date.now() < state.cacheExpiresAt) {
		return state.cachedPayload;
	}
	state.readInFlight ??= readDisplaySnapshotPayloadUncached().finally(() => {
		state.readInFlight = null;
	});
	return state.readInFlight;
}

async function readDisplaySnapshotPayloadUncached(): Promise<LlmStatsPayload | null> {
	if (process.env.MODEL_ATLAS_SNAPSHOT_URL) {
		const payload = await fetchRemoteSnapshot(
			process.env.MODEL_ATLAS_SNAPSHOT_URL,
		).catch(() => null);
		cacheDisplayPayload(payload);
		return payload;
	}
	const payload = await refreshDisplaySnapshotIfStale(
		await readSnapshotCache(),
	);
	cacheDisplayPayload(payload);
	return payload;
}

function cacheDisplayPayload(payload: LlmStatsPayload | null): void {
	if (payload == null) {
		return;
	}
	const state = getDisplayRefreshState();
	state.cachedPayload = payload;
	state.cacheExpiresAt =
		Date.now() + DISPLAY_SNAPSHOT_MEMORY_CACHE_MILLISECONDS;
}

function startDisplayRefresh(
	refreshMode: Exclude<DisplaySnapshotRefreshMode, "none">,
): Promise<LlmStatsPayload | null> {
	const state = getDisplayRefreshState();
	state.refreshInFlight ??= (
		refreshMode === "stored"
			? refreshStoredSnapshot().then((snapshot) => snapshot.payload)
			: refreshRequestPayload()
	)
		.then((payload) => {
			cacheDisplayPayload(payload);
			return payload;
		})
		.catch((error) => {
			console.error("Unable to refresh display snapshot", error);
			return null;
		})
		.finally(() => {
			state.refreshInFlight = null;
		});
	return state.refreshInFlight;
}

async function refreshDisplaySnapshotIfStale(
	payload: LlmStatsPayload | null,
): Promise<LlmStatsPayload | null> {
	const refreshMode = displaySnapshotRefreshMode(
		payload,
		nowEpochSeconds(),
		runtimeSnapshotStoreConfigured(),
		displayRefreshIntervalSeconds(),
	);
	if (refreshMode === "none") {
		return payload;
	}
	const refreshPromise = startDisplayRefresh(refreshMode);
	if (payload != null) {
		return (await refreshPromise) ?? payload;
	}
	return (await refreshPromise) ?? payload;
}

export async function refreshStoredSnapshot(): Promise<SnapshotWriteResult> {
	if (!runtimeSnapshotStoreConfigured()) {
		throw new Error(
			`Cloudflare D1 is not configured for runtime snapshots. Missing ${runtimeSnapshotStoreMissingEnvironment().join(", ")}.`,
		);
	}
	const databasePath = runtimeDatabasePath() ?? DEFAULT_DATABASE_PATH;
	const [refreshedPayload, previousPayload] = await Promise.all([
		refreshModelAtlasPayload(databasePath),
		readD1Snapshot().catch(() => null),
	]);
	const payload = preserveHighSignalSnapshotModels(
		refreshedPayload,
		previousPayload,
		STAGE_CONFIG.snapshotPreservation,
		STAGE_CONFIG.scoring,
	);
	if (payload !== refreshedPayload) {
		rewriteFinalModelRows(databasePath, payload.models);
	}
	const published = await publishSqliteDatabaseToD1(databasePath);
	return {
		payload,
		storage: "cloudflare_d1",
		database_id: published.databaseId,
		run_id: published.runId,
	};
}

export async function refreshRequestPayload(): Promise<LlmStatsPayload> {
	return refreshModelAtlasPayload(runtimeDatabasePath());
}

async function refreshModelAtlasPayload(
	databasePath?: string,
): Promise<LlmStatsPayload> {
	const database = await buildModelAtlasDatabase(databasePath, {
		replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
	});
	return readModelAtlasDatabasePayload(database.path);
}

export async function readD1Snapshot(): Promise<LlmStatsPayload | null> {
	const payload = await readD1ModelAtlasPayload();
	return payload == null ? null : withCurrentSnapshotMetadata(payload);
}

async function readStaticSnapshot(): Promise<LlmStatsPayload> {
	return withCurrentSnapshotMetadata(
		JSON.parse(await readFile(STATIC_SNAPSHOT_PATH, "utf-8")),
	);
}

async function readLocalDatabaseSnapshot(): Promise<LlmStatsPayload> {
	return withCurrentSnapshotMetadata(
		readModelAtlasDatabasePayload(localDatabaseReadPath()),
	);
}

function shouldReadStaticSnapshot(): boolean {
	return (
		process.env.VERCEL === "1" ||
		process.env.MODEL_ATLAS_STATIC_SNAPSHOT === "1"
	);
}

export function bestSnapshotPayload(
	left: LlmStatsPayload | null,
	right: LlmStatsPayload | null,
): LlmStatsPayload | null {
	if (left == null) {
		return right;
	}
	if (right == null) {
		return left;
	}
	const leftCoverage = selectedBenchmarkCoverage(left);
	const rightCoverage = selectedBenchmarkCoverage(right);
	if (leftCoverage !== rightCoverage) {
		return rightCoverage > leftCoverage ? right : left;
	}
	return snapshotFetchedAt(right) > snapshotFetchedAt(left) ? right : left;
}

function snapshotFetchedAt(payload: LlmStatsPayload): number {
	return payload.fetched_at_epoch_seconds ?? 0;
}

function selectedBenchmarkCoverage(payload: LlmStatsPayload): number {
	const selectedKeys = payload.metadata.scoring.selected_benchmark_keys;
	if (selectedKeys.length === 0) {
		return 0;
	}
	const availableKeys = new Set([
		...payload.metadata.artificial_analysis.available_benchmark_keys,
		...payload.metadata.artificial_analysis.available_evaluation_keys,
		...payload.metadata.artificial_analysis.available_intelligence_keys,
	]);
	return selectedKeys.filter((key) => availableKeys.has(key)).length;
}

export function displaySnapshotRefreshMode(
	payload: LlmStatsPayload | null,
	now: number,
	hasRuntimeSnapshotStore: boolean,
	refreshIntervalSeconds: number,
): DisplaySnapshotRefreshMode {
	if (payload == null) {
		return hasRuntimeSnapshotStore ? "stored" : "live";
	}
	if (!hasRuntimeSnapshotStore) {
		return "none";
	}
	const fetchedAt = snapshotFetchedAt(payload);
	return fetchedAt === 0 || now - fetchedAt >= refreshIntervalSeconds
		? "stored"
		: "none";
}

function displayRefreshIntervalSeconds(): number {
	const configured = Number.parseInt(
		process.env.MODEL_ATLAS_DISPLAY_REFRESH_INTERVAL_SECONDS ?? "",
		10,
	);
	return Number.isFinite(configured) && configured >= 0
		? configured
		: RAW_SOURCE_CACHE_SECONDS;
}

function getDisplayRefreshState(): DisplayRefreshState {
	displayRefreshState.__modelAtlasDisplayRefreshState ??= {
		cachedPayload: null,
		cacheExpiresAt: 0,
		readInFlight: null,
		refreshInFlight: null,
	};
	return displayRefreshState.__modelAtlasDisplayRefreshState;
}

function nowEpochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function rewriteFinalModelRows(
	databasePath: string,
	models: LlmStatsModel[],
): void {
	const db = new DatabaseSync(databasePath);
	try {
		const row = db
			.prepare(
				"SELECT id FROM pipeline_runs WHERE completed_at_epoch_seconds IS NOT NULL ORDER BY id DESC LIMIT 1",
			)
			.get() as { id?: number | bigint } | undefined;
		const runId = Number(row?.id);
		if (!Number.isFinite(runId)) {
			throw new Error("No completed Model Atlas database run exists");
		}
		db.exec("BEGIN");
		try {
			db.prepare(
				"DELETE FROM processed_models WHERE run_id = ? AND stage = 'final'",
			).run(runId);
			insertProcessedModelRows(db, runId, "final", models);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		db.close();
	}
}

async function fetchRemoteSnapshot(url: string): Promise<LlmStatsPayload> {
	const response = await fetch(url, {
		cache: "no-store",
	});
	if (!response.ok) {
		throw new Error(
			`Unable to fetch Model Atlas snapshot: HTTP ${response.status}`,
		);
	}
	return withCurrentSnapshotMetadata(await response.json());
}

function withCurrentSnapshotMetadata(
	payload: LlmStatsPayload,
): LlmStatsPayload {
	const artificialAnalysis =
		payload.metadata?.artificial_analysis ??
		buildArtificialAnalysisMetadata(payload.models);
	const scoring = STAGE_CONFIG.scoring;
	const availableBenchmarkKeys =
		artificialAnalysis.available_benchmark_keys.length > 0
			? artificialAnalysis.available_benchmark_keys
			: sortedUniqueKeys([
					...artificialAnalysis.available_evaluation_keys,
					...artificialAnalysis.available_intelligence_keys,
				]);
	const selectedBenchmarkKeys = sortedUniqueKeys([
		...scoring.intelligenceBenchmarkKeys,
		...scoring.agenticBenchmarkKeys,
	]);
	return {
		...payload,
		metadata: {
			artificial_analysis: artificialAnalysis,
			...(payload.metadata?.source_health == null
				? {}
				: { source_health: payload.metadata.source_health }),
			benchmark_update_health:
				payload.metadata?.benchmark_update_health ??
				buildBenchmarkUpdateHealth(
					payload.models,
					scoring,
					{},
					STAGE_CONFIG.matcher,
				),
			scoring: {
				intelligence_benchmark_keys: [...scoring.intelligenceBenchmarkKeys],
				intelligence_benchmark_display_keys: [
					...scoring.intelligenceBenchmarkDisplayKeys,
				],
				missing_intelligence_benchmark_keys:
					scoring.intelligenceBenchmarkKeys.filter(
						(key) => !availableBenchmarkKeys.includes(key),
					),
				agentic_benchmark_keys: [...scoring.agenticBenchmarkKeys],
				agentic_benchmark_display_keys: [
					...scoring.agenticBenchmarkDisplayKeys,
				],
				missing_agentic_benchmark_keys: scoring.agenticBenchmarkKeys.filter(
					(key) => !availableBenchmarkKeys.includes(key),
				),
				selected_benchmark_keys: selectedBenchmarkKeys,
				benchmark_portfolio: { ...scoring.benchmarkPortfolio },
				price_profiles: { ...scoring.priceProfiles },
				simulation_profiles: { ...scoring.simulationProfiles },
				simulation_input_token_seconds: scoring.simulationInputTokenSeconds,
				quality_score_weights: { ...scoring.qualityScoreWeights },
				overall_relative_score_weights: {
					...scoring.overallRelativeScoreWeights,
				},
				column_tooltips: { ...scoring.columnTooltips },
				snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
			},
		},
	};
}

function buildArtificialAnalysisMetadata(
	models: LlmStatsModel[],
): LlmStatsMetadata["artificial_analysis"] {
	const availableEvaluationKeys = keysFromModelField(models, "evaluations");
	const availableIntelligenceKeys = keysFromModelField(models, "intelligence");
	return {
		available_benchmark_keys: sortedUniqueKeys([
			...availableEvaluationKeys,
			...availableIntelligenceKeys,
		]),
		available_evaluation_keys: availableEvaluationKeys,
		available_intelligence_keys: availableIntelligenceKeys,
	};
}

function keysFromModelField(
	models: LlmStatsModel[],
	field: "evaluations" | "intelligence",
): string[] {
	return sortedUniqueKeys(
		models.flatMap((model) => Object.keys(asRecord(model[field]))),
	);
}

function sortedUniqueKeys(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function asRecord(value: unknown): Record<string, unknown> {
	return value != null && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

export function runtimeDatabasePath(): string | undefined {
	if (process.env.MODEL_ATLAS_DATABASE_PATH) {
		return resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	}
	if (process.env.VERCEL === "1") {
		return resolve(tmpdir(), "model-atlas/database.sqlite");
	}
	return undefined;
}

export function localDatabaseReadPath(): string | undefined {
	if (process.env.MODEL_ATLAS_DATABASE_PATH) {
		return resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	}
	if (process.env.VERCEL === "1") {
		return resolve(tmpdir(), "model-atlas/database.sqlite");
	}
	return resolve(DEFAULT_DATABASE_PATH);
}
