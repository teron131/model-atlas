/** Verifies models.dev parsing, source retention, and public catalog eligibility. */

import { processModelsDevPayload } from "../src/model-atlas/scrapers/models-dev";
import {
	pickPreferredModelsDevRows,
	selectModelsDevRowsForArtificialAnalysis,
} from "../src/model-atlas/stats/source-policy";

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

const selectedCatalogModels = pickPreferredModelsDevRows(
	processModelsDevPayload(
		{
			vercel: {
				models: {
					"meta/muse-spark-1.1": {
						id: "meta/muse-spark-1.1",
						name: "Muse Spark 1.1",
						release_date: "2026-06-01",
					},
					"openai/text-embedding-3-small": {
						id: "openai/text-embedding-3-small",
						name: "Text Embedding 3 Small",
						release_date: "2026-02-20",
					},
					"cohere/rerank-v4-pro": {
						id: "cohere/rerank-v4-pro",
						name: "Rerank 4 Pro",
						release_date: "2026-02-20",
					},
				},
			},
		},
		"2025-06-01",
	),
);
assertDeepEqual(
	selectedCatalogModels.map((row) => row.model_id),
	["meta/muse-spark-1.1"],
);

const retainedClaudeModels = selectModelsDevRowsForArtificialAnalysis(
	{
		openrouter: {
			models: {
				"anthropic/claude-sonnet-3.5": {
					id: "anthropic/claude-sonnet-3.5",
					name: "Claude Sonnet 3.5",
					release_date: "2025-05-22",
				},
			},
		},
	},
	[
		{
			model_id: "anthropic/claude-35-sonnet",
			name: "Claude 3.5 Sonnet",
		},
	],
);
assertDeepEqual(
	retainedClaudeModels.map((row) => row.model_id),
	["anthropic/claude-sonnet-3.5"],
);
