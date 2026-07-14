/** Payload refresh scripting for Model Atlas. */

import { pathToFileURL } from "node:url";

import {
	buildDatabase,
	readDatabasePayload,
} from "../src/model-atlas/database";

/** Refreshes the payload from the script entrypoint. */
export async function refreshPayload(databasePath?: string) {
	const result = await buildDatabase(databasePath, {
		replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
	});
	return readDatabasePayload(result.path);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const payload = await refreshPayload();
	console.log(JSON.stringify(payload));
}
