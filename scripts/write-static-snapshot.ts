import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { STAGE_CONFIG } from "../src/model-atlas/constants";
import { preserveHighSignalSnapshotModels } from "../src/model-atlas/llm/stats/snapshot-preservation";
import type { LlmStatsPayload } from "../src/model-atlas/llm/stats/types";
import { refreshModelAtlasPayload } from "./refresh-model-atlas-payload";

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

export async function writeModelAtlasSnapshot(
	outputPath = DEFAULT_SNAPSHOT_PATH,
) {
	const databasePath =
		process.env.MODEL_ATLAS_DATABASE_PATH == null
			? undefined
			: resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	const resolvedOutputPath = resolve(outputPath);
	const [payload, previousPayload] = await Promise.all([
		refreshModelAtlasPayload(databasePath),
		readPreviousSnapshot(resolvedOutputPath),
	]);
	const preservedPayload = preserveHighSignalSnapshotModels(
		payload,
		previousPayload,
		STAGE_CONFIG.snapshotPreservation,
		STAGE_CONFIG.scoring,
	);
	await mkdir(dirname(resolvedOutputPath), { recursive: true });
	await writeFile(resolvedOutputPath, `${JSON.stringify(preservedPayload)}\n`);
	return {
		path: resolvedOutputPath,
		model_count: Array.isArray(preservedPayload.models)
			? preservedPayload.models.length
			: 0,
		fetched_at_epoch_seconds: preservedPayload.fetched_at_epoch_seconds ?? null,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const result = await writeModelAtlasSnapshot(process.argv[2]);
	console.log(JSON.stringify(result, null, 2));
}
