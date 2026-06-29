/** Payload refresh scripting for Model Atlas. */

import { pathToFileURL } from "node:url";

import {
	buildModelAtlasDatabase,
	readModelAtlasDatabasePayload,
} from "../src/model-atlas/database";

/** Refreshes the Model Atlas payload from the script entrypoint. */
export async function refreshModelAtlasPayload(databasePath?: string) {
	const database = await buildModelAtlasDatabase(databasePath, {
		replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
	});
	return readModelAtlasDatabasePayload(database.path);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const payload = await refreshModelAtlasPayload();
	console.log(JSON.stringify(payload));
}
