/** Verifies model-catalog identity, inclusion, alias collapse, and basic-spec admission. */

import assert from "node:assert/strict";

import type { ModelsDevFlatModel } from "../src/model-atlas/scrapers/models-dev";
import { buildModelCatalogRows } from "../src/model-atlas/stats/catalog";
import { hasRequiredBasicSpecs } from "../src/model-atlas/stats/selection/builder";

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

const completeBasicSpecs = {
	id: "provider/model",
	name: "Model",
	release_date: "2026-01-01",
	modalities: { output: ["text"] },
	cost: { input: 1, output: 2 },
	context_window: { context: 100_000, output: 10_000 },
	speed: {
		throughput_tokens_per_second_median: 50,
		latency_seconds_median: 1,
		e2e_latency_seconds_median: 2,
	},
};
assert.equal(hasRequiredBasicSpecs(completeBasicSpecs), true);
assert.equal(
	hasRequiredBasicSpecs({
		...completeBasicSpecs,
		speed: {
			throughput_tokens_per_second_median: null,
			latency_seconds_median: null,
			e2e_latency_seconds_median: null,
		},
	}),
	false,
	"sparse core specs should not form a leaderboard model",
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
