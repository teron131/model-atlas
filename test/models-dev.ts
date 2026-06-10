import { processModelsDevPayload } from "../src/model-atlas/llm/scrapers/models-dev";

function assertDeepEqual(actual: unknown, expected: unknown): void {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
	}
}

const models = processModelsDevPayload(
	{
		acme: {
			name: "Acme",
			models: {
				"cheap-new": {
					id: "acme/cheap-new",
					name: "Cheap New",
					release_date: "2026-01-15",
					cost: { output: 2 },
				},
				"expensive-new": {
					name: "Expensive New",
					release_date: "2026-02-15",
					cost: { output: 8 },
				},
				old: {
					name: "Old",
					release_date: "2024-05-01",
					cost: { output: 1 },
				},
			},
		},
		other: {
			models: {
				"unknown-cost": {
					name: "Unknown Cost",
					release_date: "2026-03-01",
				},
			},
		},
	},
	"2025-06-01",
);

assertDeepEqual(
	models.map((row) => ({
		provider_id: row.provider_id,
		provider_name: row.provider_name,
		model_id: row.model_id,
	})),
	[
		{
			provider_id: "acme",
			provider_name: "Acme",
			model_id: "acme/cheap-new",
		},
		{
			provider_id: "acme",
			provider_name: "Acme",
			model_id: "expensive-new",
		},
		{
			provider_id: "other",
			provider_name: "other",
			model_id: "unknown-cost",
		},
	],
);
