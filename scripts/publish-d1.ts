/** Refresh the Model Atlas database and publish the completed run to Cloudflare D1. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { refreshStoredSnapshot } from "../app/api/llm-stats/snapshot-store";

if (existsSync(".env")) {
	loadEnvFile(".env");
}

const snapshot = await refreshStoredSnapshot();

console.log(
	JSON.stringify(
		{
			storage: snapshot.storage,
			database_id: snapshot.database_id,
			run_id: snapshot.run_id,
			model_count: snapshot.payload.models.length,
			fetched_at_epoch_seconds: snapshot.payload.fetched_at_epoch_seconds,
		},
		null,
		2,
	),
);
