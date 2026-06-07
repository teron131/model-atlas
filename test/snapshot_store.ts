import assert from "node:assert/strict";

import {
	type DisplaySnapshotRefreshMode,
	displaySnapshotRefreshMode,
} from "../app/api/llm-stats/snapshot-store";
import type { ModelStatsSelectedPayload } from "../src/model-atlas/llm/llm-stats/types";
import { minimalSelectedPayload } from "./model_stats_fixtures";

const freshPayload = payloadAt(900);
const stalePayload = payloadAt(100);

assert.equal(
	mode(null, false, 1000),
	"live",
	"missing display snapshots should use the live server payload fallback",
);
assert.equal(
	mode(freshPayload, false, 1000),
	"none",
	"fresh display snapshots without Blob should render from cache",
);
assert.equal(
	mode(stalePayload, false, 1000),
	"none",
	"stale display snapshots without Blob should not force live refresh",
);
assert.equal(
	mode(stalePayload, true, 1000),
	"stored",
	"stale display snapshots with Blob should refresh the stored snapshot",
);

function mode(
	payload: ModelStatsSelectedPayload | null,
	hasRuntimeSnapshotStore: boolean,
	now: number,
): DisplaySnapshotRefreshMode {
	return displaySnapshotRefreshMode(payload, now, hasRuntimeSnapshotStore, 300);
}

function payloadAt(fetchedAt: number): ModelStatsSelectedPayload {
	return minimalSelectedPayload({ fetchedAt });
}
