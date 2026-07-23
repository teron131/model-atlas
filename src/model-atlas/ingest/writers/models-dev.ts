/** SQLite writer for models.dev catalog rows, preserving provider, pricing, limit, and modality fields. */

import type { ModelsDevPayload } from "../../scrapers/models-dev";
import { SOURCE_URLS } from "../source-registry";
import type { SourceSnapshots } from "../types";
import {
	type DatabaseWriter,
	modalityFlagValue,
	sqliteBooleanValue,
} from "./database";

export function insertModelsDevRawModels(
	db: DatabaseWriter,
	snapshots: SourceSnapshots,
): void {
	const statement = db.prepare(`
		INSERT INTO models_dev_raw_models (
			row_index, fetched_at_epoch_seconds, status_code, url,
			provider_id, provider_name, provider_api, model_id, name, family,
			release_date, last_updated, open_weights, reasoning, tool_call,
			cost_input, cost_output, cost_cache_read, cost_cache_write,
			cost_output_audio, limit_context, limit_output, input_modality_text,
			input_modality_image, input_modality_audio, input_modality_video,
			input_modality_pdf, output_modality_text, output_modality_image,
			output_modality_audio, output_modality_video
		) VALUES (${Array.from({ length: 31 }, () => "?").join(", ")})
	`);
	let rowIndex = 0;
	for (const [providerId, provider] of Object.entries(
		snapshots.modelsDevPayload as ModelsDevPayload,
	)) {
		for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
			const cost = model.cost ?? {};
			const limit = model.limit ?? {};
			const inputModalities = model.modalities?.input ?? [];
			const outputModalities = model.modalities?.output ?? [];
			statement.run(
				rowIndex,
				snapshots.modelsDevFetchedAt,
				snapshots.modelsDevStatusCode,
				SOURCE_URLS.models_dev,
				providerId,
				provider.name ?? providerId,
				provider.api ?? null,
				model.id ?? modelKey,
				model.name ?? null,
				model.family ?? null,
				model.release_date ?? null,
				model.last_updated ?? null,
				sqliteBooleanValue(model.open_weights),
				sqliteBooleanValue(model.reasoning),
				sqliteBooleanValue(model.tool_call),
				cost.input ?? null,
				cost.output ?? null,
				cost.cache_read ?? null,
				cost.cache_write ?? null,
				cost.output_audio ?? null,
				limit.context ?? null,
				limit.output ?? null,
				modalityFlagValue(inputModalities, "text"),
				modalityFlagValue(inputModalities, "image"),
				modalityFlagValue(inputModalities, "audio"),
				modalityFlagValue(inputModalities, "video"),
				modalityFlagValue(inputModalities, "pdf"),
				modalityFlagValue(outputModalities, "text"),
				modalityFlagValue(outputModalities, "image"),
				modalityFlagValue(outputModalities, "audio"),
				modalityFlagValue(outputModalities, "video"),
			);
			rowIndex += 1;
		}
	}
}
