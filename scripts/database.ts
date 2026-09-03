/** Refresh the local SQLite checkpoint without publishing or modifying remote storage. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { buildDatabase } from "../src/model-atlas/database";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const result = await buildDatabase(undefined, {
  replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
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
