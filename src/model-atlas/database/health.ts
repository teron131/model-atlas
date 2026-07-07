/** Source health summaries derived from source cache and row-state evidence. */

import type {
	LlmStatsSourceHealth,
	LlmStatsSourceHealthEntry,
	LlmStatsSourceHealthStatus,
} from "../stats/types";
import {
	RAW_SOURCE_NAMES,
	type RawSourceCacheStatus,
	type RawSourceName,
	type SourceRowState,
} from "./types";

/** Classifies one raw source as fresh, cached, empty, or stale. */
function sourceStatus(
	status: RawSourceCacheStatus,
): LlmStatsSourceHealthStatus {
	if (status.source_input_count <= 0) {
		return "empty";
	}
	if (status.refreshed) {
		return "fresh";
	}
	if (status.cache_hit) {
		return "cache_hit";
	}
	return "using_cached_rows";
}

/** Counts active and quarantined rows for one raw source. */
function stateCounts(
	source: RawSourceName,
	sourceRowStates: readonly SourceRowState[],
) {
	let active = 0;
	let quarantined = 0;
	for (const state of sourceRowStates) {
		if (state.source !== source) {
			continue;
		}
		if (state.status === "quarantined_missing_from_source") {
			quarantined += 1;
		} else {
			active += 1;
		}
	}
	return { active, quarantined };
}

/** Completed snapshot health records source freshness and row-preservation status beside the run. */
export function buildSourceHealth({
	generatedAtEpochSeconds,
	sourceCache,
	sourceRowStates,
}: {
	generatedAtEpochSeconds: number | null;
	sourceCache: Record<RawSourceName, RawSourceCacheStatus>;
	sourceRowStates: readonly SourceRowState[];
}): LlmStatsSourceHealth {
	return {
		generated_at_epoch_seconds: generatedAtEpochSeconds,
		sources: Object.fromEntries(
			RAW_SOURCE_NAMES.map(
				(source): [RawSourceName, LlmStatsSourceHealthEntry] => {
					const status = sourceCache[source];
					const counts = stateCounts(source, sourceRowStates);
					const healthStatus = sourceStatus(status);
					return [
						source,
						{
							source,
							status: healthStatus,
							last_fetch_epoch_seconds: status.last_fetch_epoch_seconds,
							source_input_count: status.source_input_count,
							cache_hit: status.cache_hit,
							refreshed: status.refreshed,
							using_cached_rows: healthStatus === "using_cached_rows",
							active_row_count: counts.active,
							quarantined_row_count: counts.quarantined,
						},
					];
				},
			),
		),
	};
}
