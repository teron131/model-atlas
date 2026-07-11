/** Verifies shared model-catalog identity, inclusion, modality filtering, and alias collapse. */

import assert from "node:assert/strict";

import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import { buildModelCatalogRows } from "../src/model-atlas/stats/catalog";

const sourceData = {
	modelsDev: {
		rows: [
			catalogModel("provider/family-1", "Family 1", "family"),
			catalogModel("provider/family-latest", "Family Latest", "family"),
			catalogModel("other", "Other", "other"),
			catalogModel("provider/other-image", "Other Image", "other-image"),
		],
		byId: new Map<string, ModelsDevFlatModel>(),
	},
};
const catalogRows = buildModelCatalogRows(sourceData, [
	{
		id: "provider/matched",
		name: "Matched",
		modalities: { output: ["text"] },
	},
	{
		id: "provider/matched-image",
		name: "Matched Image",
		modalities: { output: ["text"] },
	},
]);

assert.deepEqual(
	catalogRows.map((row) => row.id),
	["provider/matched", "provider/family-1", "provider/other"],
	"catalog policy should keep text models while excluding image labels and redundant latest aliases",
);
assert.equal(
	catalogRows.find((row) => row.id === "provider/other")?.openrouter_id,
	"provider/other",
	"catalog rows should carry the canonical qualified route into aggregation",
);

function catalogModel(
	id: string,
	name: string,
	family: string,
): ModelsDevFlatModel {
	return {
		provider_id: "provider",
		provider_name: "Provider",
		model_id: id,
		model: {
			id,
			name,
			family,
			modalities: { output: ["text"] },
		},
	};
}
