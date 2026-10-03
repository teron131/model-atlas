/** Print live payload health for deployment checks and fail the command when a refresh returns no usable data. */

import { getLiveModelAtlasPayload } from "../src/model-atlas/index";

const started = Date.now();
const payload = await getLiveModelAtlasPayload();
const ok = payload.fetched_at_epoch_seconds != null && payload.models.length > 0;

console.log(
  JSON.stringify(
    {
      ok,
      count: payload.models.length,
      fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
      elapsed_ms: Date.now() - started,
      first: payload.models[0]?.id ?? null,
      missing_intelligence: payload.metadata?.scoring.missing_intelligence_benchmark_keys ?? null,
      missing_agentic: payload.metadata?.scoring.missing_agentic_benchmark_keys ?? null,
    },
    null,
    2,
  ),
);
process.exitCode = ok ? 0 : 1;
