import { getLiveLlmStats } from "../src/model-atlas/index";

const started = Date.now();
const payload = await getLiveLlmStats();

console.log(
	JSON.stringify(
		{
			ok: Array.isArray(payload.models),
			count: payload.models.length,
			fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
			elapsed_ms: Date.now() - started,
			first: payload.models[0]?.id ?? null,
			missing_intelligence:
				payload.metadata?.scoring.missing_intelligence_benchmark_keys ?? null,
			missing_agentic:
				payload.metadata?.scoring.missing_agentic_benchmark_keys ?? null,
		},
		null,
		2,
	),
);
