/** Exercises Artificial Analysis leaderboard projection and scoring inputs. */

import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS } from "../src/model-atlas/benchmarks/index-policy";
import {
  buildBenchmarkImputationByModel,
  buildComponentScoreResult,
} from "../src/model-atlas/pipeline/scores";
import { buildQualityScoringContext } from "../src/model-atlas/pipeline/scores/quality-context";
import { asRecord } from "../src/model-atlas/runtime";
import {
  ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
  getArtificialAnalysisLeaderboardRawStats,
  processArtificialAnalysisLeaderboardRows,
} from "../src/model-atlas/sources/artificial-analysis/leaderboard";
import {
  cleanArtificialAnalysisModelName,
  parseArtificialAnalysisReasoningEffort,
} from "../src/model-atlas/sources/artificial-analysis/model-labels";
import { processArtificialAnalysisOmnisciencePage } from "../src/model-atlas/sources/artificial-analysis/omniscience";
import { getArtificialAnalysisPage } from "../src/model-atlas/sources/artificial-analysis/page-data";

function assertDeepEqual(actual: unknown, expected: unknown): void {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value != null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const rows = processArtificialAnalysisLeaderboardRows(
  [
    {
      slug: "alpha",
      name: "Alpha",
      creator: { name: "Acme", slug: "acme" },
      intelligenceIndex: 70,
      price1mInputTokens: 10,
      price1mOutputTokens: 50,
      isReasoning: true,
      timescaleData: { medianOutputSpeed: 59, medianTimeToFirstChunk: 94 },
      endToEndResponseTime: { total: 103 },
    },
    {
      slug: "beta",
      name: "Beta",
      creator: { name: "Acme", slug: "acme" },
      intelligenceIndex: 65,
    },
    {
      slug: "gamma",
      name: "Gamma",
      creator: { name: "Acme", slug: "acme" },
      intelligenceIndex: 60,
    },
  ],
  [...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS],
);

assertDeepEqual(rows[0]?.name, "Alpha");
assertDeepEqual(rows[0]?.cost, { input: 10, output: 50 });
assertDeepEqual(rows[1]?.cost, { input: null, output: null });
assertDeepEqual(rows[0]?.reasoning, true);
assertDeepEqual(rows[1]?.reasoning, null);
assertDeepEqual(rows[0]?.median_speed, 59);
assertDeepEqual(rows[0]?.median_time, 94);
assertDeepEqual(rows[0]?.median_end_to_end_response_time, 103);
assertDeepEqual(
  processArtificialAnalysisLeaderboardRows(
    [
      { model_id: "acme/beta", intelligenceIndex: 65 },
      { model_id: "acme/alpha", intelligenceIndex: 70 },
    ],
    ["model_id"],
  ),
  [{ model_id: "acme/alpha" }, { model_id: "acme/beta" }],
);
assertDeepEqual(
  processArtificialAnalysisLeaderboardRows(
    [
      {
        slug: "structured-effort",
        name: "Structured Effort (max)",
        effort: { slug: "high" },
        creator: { name: "Test", slug: "test" },
        intelligenceIndex: 60,
      },
      {
        slug: "gpt-5-5",
        name: "GPT-5.5 (xhigh)",
        creator: { name: "OpenAI", slug: "openai" },
        intelligenceIndex: 55,
      },
      {
        slug: "claude-opus-4-7",
        name: "Claude Opus 4.7 (Non-reasoning, high)",
        creator: { name: "Anthropic", slug: "anthropic" },
        intelligenceIndex: 43,
      },
      {
        slug: "gemini-3-5-flash",
        name: "Gemini 3.5 Flash (high)",
        shortName: "Gemini 3.5 Flash",
        creator: { name: "Google", slug: "google" },
        intelligenceIndex: 52,
      },
    ],
    ["model_id", "name", "reasoning_effort"],
  ),
  [
    {
      model_id: "test/structured-effort",
      name: "Structured Effort (max)",
      reasoning_effort: "high",
    },
    {
      model_id: "openai/gpt-5-5",
      name: "GPT-5.5 (xhigh)",
      reasoning_effort: "xhigh",
    },
    {
      model_id: "google/gemini-3-5-flash",
      name: "Gemini 3.5 Flash",
      reasoning_effort: "high",
    },
    {
      model_id: "anthropic/claude-opus-4-7",
      name: "Claude Opus 4.7 (Non-reasoning, high)",
      reasoning_effort: "none",
    },
  ],
);
assertDeepEqual(
  processArtificialAnalysisLeaderboardRows(
    [
      {
        slug: "claude-fable-5",
        model_url: "https://artificialanalysis.ai/models/anthropic/claude-fable-5",
        name: "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
        creator: { name: "Anthropic", slug: "anthropic" },
        intelligenceIndex: 64.9,
      },
    ],
    ["model_id", "name"],
  ),
  [
    {
      model_id: "anthropic/claude-fable-5",
      name: "Claude Fable 5",
    },
  ],
);
const recordedComponents = Object.keys(ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS);
const indexedRow = {
  model_id: "anthropic/claude-fable-5",
  model_url: "https://artificialanalysis.ai/models/anthropic/claude-fable-5",
  name: "Claude Fable 5",
  creator: { name: "Anthropic", slug: "anthropic" },
  intelligenceIndex: 64.9,
  intelligenceIndexComponents: recordedComponents,
  intelligenceIndexCostPerTask: {
    cost: {
      total: 1.5,
    },
  },
  intelligenceIndexTimePerTask: 120,
  intelligenceIndexOutputTokensPerTask: {
    output: 42_000,
  },
};
// A changed basket, a row without one, or a row kept from before baskets were recorded keeps none of its index score or telemetry.
for (const intelligenceIndexComponents of [
  [...recordedComponents.slice(1), "scicode"],
  [],
  undefined,
]) {
  const [row] = processArtificialAnalysisLeaderboardRows(
    [{ ...indexedRow, intelligenceIndexComponents }],
    ["intelligence", "intelligence_index_cost"],
  );
  assertDeepEqual(asRecord(row?.intelligence).intelligence_index, null);
  assertDeepEqual(
    Object.values(asRecord(row?.intelligence_index_cost)).every((value) => value == null),
    true,
  );
}
assertDeepEqual(
  processArtificialAnalysisLeaderboardRows(
    [indexedRow],
    ["model_id", "intelligence", "intelligence_index_cost"],
  ),
  [
    {
      model_id: "anthropic/claude-fable-5",
      intelligence: {
        intelligence_index: 64.9,
        omniscience_index: null,
      },
      intelligence_index_cost: {
        cost_per_task: 1.5,
        seconds_per_task: 120,
        output_tokens_per_task: 42000,
      },
    },
  ],
);
assertDeepEqual(
  cleanArtificialAnalysisModelName(
    "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
  ),
  "Claude Fable 5",
);
assertDeepEqual(
  cleanArtificialAnalysisModelName("Claude Fable 5 (with fallback)"),
  "Claude Fable 5",
);
assertDeepEqual(
  parseArtificialAnalysisReasoningEffort(
    "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
  ),
  "max",
);
assertDeepEqual(
  parseArtificialAnalysisReasoningEffort(
    "Claude Opus 4.6 (Non-reasoning, High Effort)",
    "Claude Opus 4.6 (high)",
  ),
  null,
);
assertDeepEqual(
  parseArtificialAnalysisReasoningEffort("Gemini 3.5 Flash (high)", "Gemini 3.5 Flash"),
  "high",
);
assertDeepEqual(parseArtificialAnalysisReasoningEffort("Example (No reasoning)"), "none");
assertDeepEqual(parseArtificialAnalysisReasoningEffort("Qwen3.8 Max"), null);
assertDeepEqual(parseArtificialAnalysisReasoningEffort("Gemini 3.5 Flash (minimal)"), "minimal");
assertDeepEqual(
  processArtificialAnalysisOmnisciencePage(
    `<script>self.__next_f.push([1,${JSON.stringify('{"slug":"claude-opus-5","name":"Claude Opus 5 (max)","omniscienceBreakdown":{"accuracy":0.61}}')}])</script>`,
    {
      benchmarkKey: "omniscience_accuracy",
      sourceUrl: "https://artificialanalysis.ai/evaluations/omniscience",
    },
  ),
  [
    {
      benchmark_key: "omniscience_accuracy",
      source_url: "https://artificialanalysis.ai/evaluations/omniscience",
      model_id: "claude-opus-5",
      model: "Claude Opus 5 (max)",
      base_model: "Claude Opus 5",
      reasoning_effort: "max",
      model_creator: null,
      rank: 1,
      canonical_value: 0.61,
      observed_at: null,
      metadata: {
        dataset_name: "AA-Omniscience Accuracy",
        details_url: "/models/claude-opus-5",
      },
    },
  ],
);

const scoringRows = [
  {
    benchmarks: {
      gdpval_normalized: 0.4,
      scicode: 0.4,
      terminal_bench_4: 0.4,
      apex_agents: 0.1,
    },
  },
  {
    benchmarks: {
      apex_agents: 0.3,
      gdpval_normalized: 0.6,
      scicode: 0.6,
      terminal_bench_4: 0.6,
    },
  },
  {
    benchmarks: {
      apex_agents: 0.5,
      gdpval_normalized: 0.8,
      scicode: 0.8,
      terminal_bench_4: 0.8,
    },
  },
  {
    benchmarks: {
      gdpval_normalized: 0.7,
      scicode: 0.7,
      terminal_bench_4: 0.7,
    },
  },
];
const scoringConfig = {
  agenticTokenModifierCap: 0.15,
  intelligenceBenchmarkKeys: [],
  intelligenceBenchmarkDisplayKeys: [],
  agenticBenchmarkKeys: ["apex_agents", "gdpval_normalized", "scicode", "terminal_bench_4"],
  agenticBenchmarkDisplayKeys: ["apex_agents", "gdpval_normalized", "scicode", "terminal_bench_4"],
  previewAdditionalIntelligenceBenchmarkKeys: [],
  benchmarkPortfolio: {
    scicode: {
      group: "baseline",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.8, agentic: 0.2 },
    },
    terminal_bench_4: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0, agentic: 1 },
    },
    gdpval_normalized: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.6, agentic: 0.4 },
    },
    apex_agents: {
      group: "frontier",
      benchmarkImportance: 1,
      dimensionLoadings: { intelligence: 0.45, agentic: 0.55 },
    },
  },
  qualityCoverage: {
    intelligence: { floor: 0, full: 1 },
    agentic: { floor: 0, full: 1 },
  },
  qualityRetention: { floor: 0, full: 1 },
  qualityCoverageMinimumRetention: 1,
  directBenchmarkWeightMultiplier: 1,
  pairwiseIntelligenceWeight: 0,
  intelligenceGroupWeights: { frontier: 0.8, baseline: 0.2 },
} as const;
const imputationByModel = buildBenchmarkImputationByModel(scoringRows, scoringConfig);
const qualityScoringContext = buildQualityScoringContext(scoringRows, scoringConfig);
const componentScoresWithMissingApex = buildComponentScoreResult(
  scoringRows[3] ?? {},
  scoringConfig,
  qualityScoringContext,
  imputationByModel.get(scoringRows[3] ?? {}),
).componentScores;
assert.ok(
  componentScoresWithMissingApex?.agentic_score != null &&
    componentScoresWithMissingApex.agentic_score > 70 &&
    componentScoresWithMissingApex.agentic_score < 75,
);
assert.equal(componentScoresWithMissingApex?.intelligence_score, null);

// The leaderboard preview omits index resources, so the model page's complete dataset must supply them.
const richModels = [
  {
    slug: "example-max",
    name: "Example (max)",
    creator: { name: "Example Lab", slug: "example-lab" },
    intelligenceIndex: 50,
    intelligenceIndexEvaluations: recordedComponents.map((slug) => ({ slug })),
    intelligenceIndexCostPerTask: { cost: { total: 5.98 } },
    intelligenceIndexTimePerTask: 799,
    intelligenceIndexOutputTokensPerTask: { output: 119_166 },
  },
  {
    slug: "older-model",
    name: "Older Model",
    creator: { name: "Example Lab", slug: "example-lab" },
    deprecated: true,
    intelligenceIndex: 30,
    intelligenceIndexEvaluations: recordedComponents.map((slug) => ({ slug })),
    intelligenceIndexCostPerTask: { cost: { total: 0.72 } },
  },
];
const flight = (value: unknown) =>
  `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(value))}])</script>`;
const dataKey = Buffer.alloc(32, 7);
const cipher = createCipheriv(
  "aes-256-gcm",
  dataKey,
  createHash("sha256").update(dataKey).digest().subarray(0, 12),
);
const encryptedModels = Buffer.concat([
  cipher.update(gzipSync(JSON.stringify({ models: richModels }))),
  cipher.final(),
  cipher.getAuthTag(),
]);
let dataUnavailable = false;
const modelServer = createServer((request, response) => {
  if (request.url === "/leaderboards/models") {
    response.end(
      flight({
        evaluations: {
          intelligenceIndex: {
            slug: "artificial-analysis-intelligence-index",
            name: "Artificial Analysis Intelligence Index v5.0",
          },
        },
        models: [
          {
            ...richModels[0],
            intelligenceIndexCostPerTask: 5.98,
            intelligenceIndexTimePerTask: undefined,
            intelligenceIndexOutputTokensPerTask: undefined,
          },
        ],
      }),
    );
  } else if (request.url === "/leaderboards/unversioned") {
    response.end(flight({ models: [richModels[0]] }));
  } else if (request.url === "/models/example-max") {
    response.end(
      flight({ manifest: { path: "/data/providers" } }) +
        flight({ manifest: { path: "/data/models", key: dataKey.toString("hex") } }),
    );
  } else if (request.url === "/data/providers") {
    response.end(JSON.stringify([{ modelSlug: "example-max", host: { name: "Provider" } }]));
  } else if (request.url === "/data/models" && !dataUnavailable) {
    response.end(encryptedModels);
  } else if (request.url === "/wrong-origin") {
    response.end(flight({ manifest: { path: "https://example.com/data/models" } }));
  } else {
    response.writeHead(503);
    response.end();
  }
});
await new Promise<void>((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
try {
  const origin = `http://127.0.0.1:${(modelServer.address() as AddressInfo).port}`;
  const raw = await getArtificialAnalysisLeaderboardRawStats({
    url: `${origin}/leaderboards/models`,
  });
  assert.deepEqual(
    raw.data,
    richModels.map((row) => ({
      ...row,
      intelligenceIndexVersion: "5.0",
      intelligenceIndexComponents: recordedComponents,
    })),
  );
  assert.ok(raw.fetched_at_epoch_seconds);
  const projected = processArtificialAnalysisLeaderboardRows(raw.data, ["intelligence_index_cost"]);
  assert.equal(
    (projected[0]!.intelligence_index_cost as Record<string, unknown>).seconds_per_task,
    799,
  );
  assert.equal(
    (projected[0]!.intelligence_index_cost as Record<string, unknown>).output_tokens_per_task,
    119_166,
  );
  assert.equal(
    (projected[1]!.intelligence_index_cost as Record<string, unknown>).cost_per_task,
    0.72,
  );
  await assert.rejects(getArtificialAnalysisPage(`${origin}/wrong-origin`, 1_000), /origin/);
  // Without the index's published version, the refresh fails and the cache stays in place rather than scoring unversioned values.
  assert.deepEqual(
    await getArtificialAnalysisLeaderboardRawStats({ url: `${origin}/leaderboards/unversioned` }),
    { fetched_at_epoch_seconds: null, data: [] },
  );
  dataUnavailable = true;
  assert.deepEqual(
    await getArtificialAnalysisLeaderboardRawStats({ url: `${origin}/leaderboards/models` }),
    {
      fetched_at_epoch_seconds: null,
      data: [],
    },
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    modelServer.close((error) => (error ? reject(error) : resolve())),
  );
}
