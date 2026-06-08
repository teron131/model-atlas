import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { get, put } from "@vercel/blob";

import { MODEL_ATLAS_STAGE_CONFIG } from "../../../src/model-atlas/constants";
import { readModelAtlasDatabasePayload } from "../../../src/model-atlas/llm/database";
import {
	DEFAULT_DATABASE_PATH,
	RAW_SOURCE_CACHE_SECONDS,
} from "../../../src/model-atlas/llm/database/types";
import type {
	ModelStatsSelectedMetadata,
	ModelStatsSelectedModel,
	ModelStatsSelectedPayload,
} from "../../../src/model-atlas/llm/llm-stats/types";

const STATIC_SNAPSHOT_PATH = resolve(
	process.cwd(),
	"public/model-atlas-snapshot.json",
);
const SNAPSHOT_BLOB_PATH =
	process.env.MODEL_ATLAS_BLOB_SNAPSHOT_PATH ?? "model-atlas/snapshot.json";

type SnapshotWriteResult = {
	payload: ModelStatsSelectedPayload;
	storage: "vercel_blob";
	url: string;
};

type DisplayRefreshState = {
	refreshInFlight: Promise<ModelStatsSelectedPayload | null> | null;
	readInFlight: Promise<ModelStatsSelectedPayload | null> | null;
	cachedPayload: ModelStatsSelectedPayload | null;
	cacheExpiresAt: number;
};

export type DisplaySnapshotRefreshMode = "none" | "stored" | "live";

const displayRefreshState = globalThis as typeof globalThis & {
	__modelAtlasDisplayRefreshState?: DisplayRefreshState;
};
const DISPLAY_SNAPSHOT_MEMORY_CACHE_MILLISECONDS = 30_000;

export function runtimeSnapshotStoreConfigured(): boolean {
	return (
		Boolean(process.env.BLOB_READ_WRITE_TOKEN) ||
		Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
	);
}

export async function readSnapshotPayload(): Promise<ModelStatsSelectedPayload | null> {
	if (process.env.MODEL_ATLAS_SNAPSHOT_URL) {
		return fetchRemoteSnapshot(process.env.MODEL_ATLAS_SNAPSHOT_URL);
	}
	return readSnapshotCache();
}

async function readSnapshotCache(): Promise<ModelStatsSelectedPayload | null> {
	const [blobSnapshot, localDatabaseSnapshot, staticSnapshot] =
		await Promise.all([
			readBlobSnapshot().catch(() => null),
			shouldReadStaticSnapshot()
				? Promise.resolve(null)
				: readLocalDatabaseSnapshot().catch(() => null),
			shouldReadStaticSnapshot()
				? readStaticSnapshot().catch(() => null)
				: Promise.resolve(null),
		]);
	return freshestSnapshot(
		freshestSnapshot(blobSnapshot, localDatabaseSnapshot),
		staticSnapshot,
	);
}

export async function readDisplaySnapshotPayload(): Promise<ModelStatsSelectedPayload | null> {
	const state = getDisplayRefreshState();
	if (state.cachedPayload != null && Date.now() < state.cacheExpiresAt) {
		return state.cachedPayload;
	}
	state.readInFlight ??= readDisplaySnapshotPayloadUncached().finally(() => {
		state.readInFlight = null;
	});
	return state.readInFlight;
}

async function readDisplaySnapshotPayloadUncached(): Promise<ModelStatsSelectedPayload | null> {
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

function cacheDisplayPayload(payload: ModelStatsSelectedPayload | null): void {
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
): Promise<ModelStatsSelectedPayload | null> {
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
	payload: ModelStatsSelectedPayload | null,
): Promise<ModelStatsSelectedPayload | null> {
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
		return payload;
	}
	return (await refreshPromise) ?? payload;
}

export async function refreshStoredSnapshot(): Promise<SnapshotWriteResult> {
	if (!runtimeSnapshotStoreConfigured()) {
		throw new Error("Vercel Blob is not configured for runtime snapshots");
	}
	const payload = await refreshModelAtlasPayload(runtimeDatabasePath());
	const blob = await put(SNAPSHOT_BLOB_PATH, JSON.stringify(payload), {
		access: "public",
		allowOverwrite: true,
		cacheControlMaxAge: 60,
		contentType: "application/json",
	});
	return {
		payload,
		storage: "vercel_blob",
		url: blob.url,
	};
}

export async function refreshRequestPayload(): Promise<ModelStatsSelectedPayload> {
	return refreshModelAtlasPayload(runtimeDatabasePath());
}

async function refreshModelAtlasPayload(
	databasePath?: string,
): Promise<ModelStatsSelectedPayload> {
	const script = await import("../../../scripts/refresh-model-atlas-payload");
	return script.refreshModelAtlasPayload(databasePath);
}

async function readBlobSnapshot(): Promise<ModelStatsSelectedPayload | null> {
	if (!runtimeSnapshotStoreConfigured()) {
		return null;
	}
	const blob = await get(SNAPSHOT_BLOB_PATH, {
		access: "public",
	});
	if (blob?.stream == null) {
		return null;
	}
	return withCurrentSnapshotMetadata(
		JSON.parse(await new Response(blob.stream).text()),
	);
}

async function readStaticSnapshot(): Promise<ModelStatsSelectedPayload> {
	return withCurrentSnapshotMetadata(
		JSON.parse(await readFile(STATIC_SNAPSHOT_PATH, "utf-8")),
	);
}

async function readLocalDatabaseSnapshot(): Promise<ModelStatsSelectedPayload> {
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

function freshestSnapshot(
	left: ModelStatsSelectedPayload | null,
	right: ModelStatsSelectedPayload | null,
): ModelStatsSelectedPayload | null {
	if (left == null) {
		return right;
	}
	if (right == null) {
		return left;
	}
	return snapshotFetchedAt(right) > snapshotFetchedAt(left) ? right : left;
}

function snapshotFetchedAt(payload: ModelStatsSelectedPayload): number {
	return payload.fetched_at_epoch_seconds ?? 0;
}

export function displaySnapshotRefreshMode(
	payload: ModelStatsSelectedPayload | null,
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

async function fetchRemoteSnapshot(
	url: string,
): Promise<ModelStatsSelectedPayload> {
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
	payload: ModelStatsSelectedPayload,
): ModelStatsSelectedPayload {
	const artificialAnalysis =
		payload.metadata?.artificial_analysis ??
		buildArtificialAnalysisMetadata(payload.models);
	const scoring = MODEL_ATLAS_STAGE_CONFIG.scoring;
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
				price_profiles: { ...scoring.priceProfiles },
				simulation_profiles: { ...scoring.simulationProfiles },
				simulation_input_token_seconds: scoring.simulationInputTokenSeconds,
				quality_score_weights: { ...scoring.qualityScoreWeights },
				overall_relative_score_weights: {
					...scoring.overallRelativeScoreWeights,
				},
				column_tooltips: { ...scoring.columnTooltips },
			},
		},
	};
}

function buildArtificialAnalysisMetadata(
	models: ModelStatsSelectedModel[],
): ModelStatsSelectedMetadata["artificial_analysis"] {
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
	models: ModelStatsSelectedModel[],
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
