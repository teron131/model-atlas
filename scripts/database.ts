/** Refresh the local SQLite checkpoint without publishing or modifying remote storage. */

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { refreshDatabase } from "../src/model-atlas/database";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const result = await refreshDatabase(undefined, {
  replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
});

console.log(
  JSON.stringify(
    {
      path: result.path,
      final_model_count: result.final_model_count,
      source_cache: result.source_cache,
      tables: result.table_row_counts,
    },
    null,
    2,
  ),
);
