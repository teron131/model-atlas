/** Build the Model Atlas SQLite database snapshot. */

import { buildDatabase } from "../src/model-atlas/database";

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
