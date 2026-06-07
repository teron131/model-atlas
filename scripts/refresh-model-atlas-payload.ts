import { pathToFileURL } from "node:url";

import {
	buildModelAtlasDatabase,
	readModelAtlasDatabasePayload,
} from "../src/model-atlas/llm/database";

export async function refreshModelAtlasPayload(databasePath?: string) {
	const database = await buildModelAtlasDatabase(databasePath);
	return readModelAtlasDatabasePayload(database.path);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const payload = await refreshModelAtlasPayload();
	console.log(JSON.stringify(payload));
}
