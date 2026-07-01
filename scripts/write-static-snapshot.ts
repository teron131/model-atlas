/** Static snapshot writing for Model Atlas. */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import {
	readD1Snapshot,
	runtimeSnapshotStoreConfigured,
} from "../app/api/llm-stats/snapshot-store";
import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { preserveHighSignalSnapshotModels } from "../src/model-atlas/stats/snapshot-preservation";
import type { LlmStatsPayload } from "../src/model-atlas/stats/types";
import { refreshPayload } from "./refresh-model-atlas-payload";

if (existsSync(".env")) {
	loadEnvFile(".env");
}

const DEFAULT_SNAPSHOT_PATH = "public/model-atlas-snapshot.json";
const DEFAULT_PREVIOUS_SNAPSHOT_URL =
	"https://llmstats.vercel.app/api/llm-stats?view=all";

async function readPreviousSnapshot(
	outputPath: string,
): Promise<LlmStatsPayload | null> {
	const previousFromFile = await readFile(outputPath, "utf-8")
		.then((content) => JSON.parse(content) as LlmStatsPayload)
		.catch(() => null);
	if (previousFromFile != null) {
		return previousFromFile;
	}
	const snapshotUrl =
		process.env.MODEL_ATLAS_PREVIOUS_SNAPSHOT_URL ??
		(process.env.VERCEL === "1" ? DEFAULT_PREVIOUS_SNAPSHOT_URL : null);
	if (snapshotUrl == null) {
		return null;
	}
	return fetch(snapshotUrl, { cache: "no-store" })
		.then((response) => (response.ok ? response.json() : null))
		.catch(() => null) as Promise<LlmStatsPayload | null>;
}

/** Writes the Model Atlas snapshot using D1 when available. */
export async function writeModelAtlasSnapshot(
	outputPath = DEFAULT_SNAPSHOT_PATH,
) {
	const d1Payload = runtimeSnapshotStoreConfigured()
		? await readD1Snapshot().catch(() => null)
		: null;
	const resolvedOutputPath = resolve(outputPath);
	if (d1Payload != null) {
		await writeSnapshotFile(resolvedOutputPath, d1Payload);
		return snapshotWriteResult(resolvedOutputPath, d1Payload);
	}
	const databasePath =
		process.env.MODEL_ATLAS_DATABASE_PATH == null
			? undefined
			: resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	const [payload, previousPayload] = await Promise.all([
		refreshPayload(databasePath),
		readPreviousSnapshot(resolvedOutputPath),
	]);
	const preservedPayload = preserveHighSignalSnapshotModels(
		payload,
		previousPayload,
		STAGE_CONFIG.snapshotPreservation,
		STAGE_CONFIG.scoring,
	);
	await writeSnapshotFile(resolvedOutputPath, preservedPayload);
	return snapshotWriteResult(resolvedOutputPath, preservedPayload);
}

async function writeSnapshotFile(
	resolvedOutputPath: string,
	payload: LlmStatsPayload,
): Promise<void> {
	await mkdir(dirname(resolvedOutputPath), { recursive: true });
	await writeFile(resolvedOutputPath, `${JSON.stringify(payload)}\n`);
}

function snapshotWriteResult(
	resolvedOutputPath: string,
	payload: LlmStatsPayload,
) {
	return {
		path: resolvedOutputPath,
		model_count: Array.isArray(payload.models) ? payload.models.length : 0,
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds ?? null,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const result = await writeModelAtlasSnapshot(process.argv[2]);
	console.log(JSON.stringify(result, null, 2));
}
