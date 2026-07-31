/** Build the Model Atlas SQLite database snapshot. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { buildDatabase } from "../src/model-atlas/database";
import { readD1Payload } from "../src/model-atlas/database/d1";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const previousPayload = await readD1Payload();

const result = await buildDatabase(undefined, {
  replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
  previousPayload,
});

console.log(
  JSON.stringify(
    {
      path: result.path,
      final_model_count: result.final_model_count,
      source_cache: result.source_cache,
      tables: result.source_rows,
    },
    null,
    2,
  ),
);
