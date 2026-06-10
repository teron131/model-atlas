import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { refreshModelAtlasPayload } from "./refresh-model-atlas-payload";

const DEFAULT_SNAPSHOT_PATH = "public/model-atlas-snapshot.json";

export async function writeModelAtlasSnapshot(
	outputPath = DEFAULT_SNAPSHOT_PATH,
) {
	const databasePath =
		process.env.MODEL_ATLAS_DATABASE_PATH == null
			? undefined
			: resolve(process.env.MODEL_ATLAS_DATABASE_PATH);
	const payload = await refreshModelAtlasPayload(databasePath);
	const resolvedOutputPath = resolve(outputPath);
	await mkdir(dirname(resolvedOutputPath), { recursive: true });
	await writeFile(resolvedOutputPath, `${JSON.stringify(payload)}\n`);
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
