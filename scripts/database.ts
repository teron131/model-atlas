/** Build the Model Atlas SQLite database snapshot. */

import { buildModelAtlasDatabase } from "../src/model-atlas/llm/database";

const result = await buildModelAtlasDatabase();

console.log(
	JSON.stringify(
		{
			path: result.path,
			run_id: result.run_id,
			final_model_count: result.final_model_count,
			source_cache: result.source_cache,
			tables: result.source_rows,
		},
		null,
		2,
	),
);
