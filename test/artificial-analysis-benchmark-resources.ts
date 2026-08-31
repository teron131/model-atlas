/** Verifies AA benchmark-page resource parsing for benchmark telemetry. */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES,
  buildArtificialAnalysisResourceLookup,
  buildArtificialAnalysisSourceDefaultResourceLookup,
  findArtificialAnalysisBenchmarkResourceRow,
  getArtificialAnalysisBenchmarkResourceStats,
  processArtificialAnalysisBenchmarkResourceRows,
} from "../src/model-atlas/scrapers/benchmarks/artificial-analysis/results";

function assertDeepEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertApprox(actual: number | undefined, expected: number): void {
  if (actual == null || Math.abs(actual - expected) > 1e-12) {
    throw new Error(`Expected ${expected}, got ${String(actual)}`);
  }
}

function currentResourceTelemetry({
  resourceKey,
  taskCount,
  input,
  answer,
  reasoning,
  totalCost,
  secondsPerTask,
}: {
  resourceKey: string;
  taskCount: number;
  input: number;
  answer: number;
  reasoning: number;
  totalCost: number;
  secondsPerTask: number;
}) {
  const output = answer + reasoning;
  return {
    canonicalEvalTokenCounts: {
      [resourceKey]: { input, answer, reasoning, cacheableInput: null },
    },
    price1mInputTokens: 0,
    price1mOutputTokens: (totalCost * 1_000_000) / output,
    cacheHitPrice: null,
    cacheWritePrice: null,
    cacheHitRate: null,
    medianCanonicalAnswerOutputSpeed: output / taskCount / secondsPerTask,
  };
}

const hlePage = {
  benchmark_key: "hle",
  score_key: "hle",
  resource_key: "hle",
  url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
  task_run_count: 2,
};
const configuredAnalystAgentPage = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.find(
  (page) => page.benchmark_key === "analyst_agent",
);
if (configuredAnalystAgentPage == null) {
  throw new Error("AnalystAgent benchmark resource page is missing");
}
assertDeepEqual(configuredAnalystAgentPage, {
  benchmark_key: "analyst_agent",
  score_key: "analystAgent",
  resource_key: "analystAgent",
  url: "https://artificialanalysis.ai/evaluations/aa-analyst-agent",
  task_run_count: 80,
});
assertDeepEqual(
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.map((page) => page.benchmark_key).sort(),
  [
    "analyst_agent",
    "apex_agents",
    "automation_bench",
    "briefcase",
    "critpt",
    "gdpval_normalized",
    "hle",
    "itbench_sre",
    "scicode",
    "tau_banking",
  ],
);
const configuredItbenchPage = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.find(
  (page) => page.benchmark_key === "itbench_sre",
);
if (configuredItbenchPage == null) {
  throw new Error("ITBench benchmark resource page is missing");
}
assertDeepEqual(configuredItbenchPage, {
  benchmark_key: "itbench_sre",
  score_key: "itbenchSre",
  resource_key: "itBench",
  url: "https://artificialanalysis.ai/evaluations/itbench-aa",
  task_run_count: 177,
});
const configuredBriefcasePage = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.find(
  (page) => page.benchmark_key === "briefcase",
);
if (configuredBriefcasePage == null) {
  throw new Error("Briefcase AA benchmark resource page is missing");
}
const briefcasePage = {
  ...configuredBriefcasePage,
  task_run_count: 2,
};
const automationBenchPage = {
  benchmark_key: "automation_bench",
  score_path: ["automationBenchBreakdown", "completion"],
  resource_key: "automationBench",
  url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
  task_run_count: 2,
};
const hleRows = processArtificialAnalysisBenchmarkResourceRows(
  [
    {
      name: "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
      shortName: "Claude Fable 5 (with fallback)",
      slug: "claude-fable-5",
      creator: {
        name: "Anthropic",
        slug: "anthropic",
      },
      hle: 0.42,
      ...currentResourceTelemetry({
        resourceKey: "hle",
        taskCount: 2,
        input: 20,
        answer: 30,
        reasoning: 50,
        totalCost: 4,
        secondsPerTask: 12,
      }),
    },
    {
      name: "Missing Score",
      slug: "missing-score",
      creator: {
        name: "Test",
        slug: "test",
      },
      ...currentResourceTelemetry({
        resourceKey: "hle",
        taskCount: 2,
        input: 20,
        answer: 80,
        reasoning: 0,
        totalCost: 4,
        secondsPerTask: 12,
      }),
    },
  ],
  hlePage,
);

assertDeepEqual(hleRows, [
  {
    benchmark_key: "hle",
    source_url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
    model_id: "anthropic/claude-fable-5",
    model: "Claude Fable 5",
    provider: "Anthropic",
    provider_id: "anthropic",
    reasoning_effort: "max",
    score: 0.42,
    task_run_count: 2,
    cost_per_task_usd: 2,
    seconds_per_task: 12,
    tokens_per_task: 50,
    input_tokens_per_task: 10,
    output_tokens_per_task: 40,
    answer_tokens_per_task: 15,
    reasoning_tokens_per_task: 25,
  },
]);

const hleLookup = buildArtificialAnalysisSourceDefaultResourceLookup(hleRows);
assertDeepEqual(
  findArtificialAnalysisBenchmarkResourceRow("hle", ["Claude Fable 5"], hleLookup)
    ?.cost_per_task_usd,
  2,
);
assertDeepEqual(
  findArtificialAnalysisBenchmarkResourceRow("critpt", ["Claude Fable 5 max"], hleLookup),
  null,
);

const [cachedInputRow] = processArtificialAnalysisBenchmarkResourceRows(
  [
    {
      shortName: "Cache Model",
      slug: "cache-model",
      creator: { name: "Test", slug: "test" },
      hle: 0.5,
      canonicalEvalTokenCounts: {
        hle: { input: 100, answer: 20, reasoning: 30, cacheableInput: 40 },
      },
      price1mInputTokens: 10,
      price1mOutputTokens: 50,
      cacheHitPrice: 1,
      cacheWritePrice: 12,
      cacheHitRate: 0.5,
      medianCanonicalAnswerOutputSpeed: 25,
    },
  ],
  hlePage,
);
assertApprox(cachedInputRow?.cost_per_task_usd, 0.00174);

assertDeepEqual(
  processArtificialAnalysisBenchmarkResourceRows(
    [
      {
        shortName: "GPT-5.6 Sol (max)",
        slug: "gpt-5-6-sol",
        creator: {
          name: "OpenAI",
          slug: "openai",
        },
        itbenchSre: 0.56,
        ...currentResourceTelemetry({
          resourceKey: "itBench",
          taskCount: 177,
          input: 17_700,
          answer: 1_770,
          reasoning: 1_770,
          totalCost: 177,
          secondsPerTask: 100,
        }),
      },
    ],
    configuredItbenchPage,
  )[0],
  {
    benchmark_key: "itbench_sre",
    source_url: "https://artificialanalysis.ai/evaluations/itbench-aa",
    model_id: "openai/gpt-5-6-sol",
    model: "GPT-5.6 Sol (max)",
    provider: "OpenAI",
    provider_id: "openai",
    reasoning_effort: "max",
    score: 0.56,
    task_run_count: 177,
    cost_per_task_usd: 1,
    seconds_per_task: 100,
    tokens_per_task: 120,
    input_tokens_per_task: 100,
    output_tokens_per_task: 20,
    answer_tokens_per_task: 10,
    reasoning_tokens_per_task: 10,
  },
);

assertDeepEqual(
  processArtificialAnalysisBenchmarkResourceRows(
    [
      {
        shortName: "Claude Fable 5 (max)",
        slug: "claude-fable-5",
        creator: {
          name: "Anthropic",
          slug: "anthropic",
        },
        briefcaseElo: 1500,
        briefcaseBreakdown: {
          totalToolMs: 4000,
        },
        ...currentResourceTelemetry({
          resourceKey: "briefcase",
          taskCount: 2,
          input: 20,
          answer: 30,
          reasoning: 50,
          totalCost: 6,
          secondsPerTask: 6,
        }),
      },
    ],
    briefcasePage,
  )[0]?.seconds_per_task,
  6,
);

assertDeepEqual(
  processArtificialAnalysisBenchmarkResourceRows(
    [
      {
        shortName: "Grok 4.5",
        slug: "grok-4-5",
        creator: {
          name: "xAI",
          slug: "x-ai",
        },
        automationBenchBreakdown: {
          completion: 0.72,
        },
        ...currentResourceTelemetry({
          resourceKey: "automationBench",
          taskCount: 2,
          input: 20,
          answer: 6,
          reasoning: 4,
          totalCost: 1,
          secondsPerTask: 91,
        }),
      },
    ],
    automationBenchPage,
  )[0],
  {
    benchmark_key: "automation_bench",
    source_url: "https://artificialanalysis.ai/evaluations/automationbench-aa",
    model_id: "x-ai/grok-4-5",
    model: "Grok 4.5",
    provider: "xAI",
    provider_id: "x-ai",
    reasoning_effort: null,
    score: 0.72,
    task_run_count: 2,
    cost_per_task_usd: 0.5,
    seconds_per_task: 91,
    tokens_per_task: 15,
    input_tokens_per_task: 10,
    output_tokens_per_task: 5,
    answer_tokens_per_task: 3,
    reasoning_tokens_per_task: 2,
  },
);

const effortRows = processArtificialAnalysisBenchmarkResourceRows(
  [
    {
      shortName: "GPT-5.2",
      slug: "gpt-5-2-non-reasoning",
      creator: {
        name: "OpenAI",
        slug: "openai",
      },
      hle: 0.1,
      ...currentResourceTelemetry({
        resourceKey: "hle",
        taskCount: 2,
        input: 8,
        answer: 12,
        reasoning: 0,
        totalCost: 0.2,
        secondsPerTask: 2,
      }),
    },
    {
      shortName: "GPT-5.2 (low)",
      slug: "gpt-5-2-low",
      creator: {
        name: "OpenAI",
        slug: "openai",
      },
      hle: 0.4,
      ...currentResourceTelemetry({
        resourceKey: "hle",
        taskCount: 2,
        input: 20,
        answer: 30,
        reasoning: 0,
        totalCost: 1,
        secondsPerTask: 10,
      }),
    },
    {
      shortName: "GPT-5.2 (xhigh)",
      slug: "gpt-5-2",
      creator: {
        name: "OpenAI",
        slug: "openai",
      },
      hle: 0.3,
      ...currentResourceTelemetry({
        resourceKey: "hle",
        taskCount: 2,
        input: 80,
        answer: 120,
        reasoning: 0,
        totalCost: 4,
        secondsPerTask: 40,
      }),
    },
    {
      shortName: "GPT-5.2 (max)",
      slug: "gpt-5-2-max",
      creator: {
        name: "OpenAI",
        slug: "openai",
      },
      hle: 0.35,
      ...currentResourceTelemetry({
        resourceKey: "hle",
        taskCount: 2,
        input: 100,
        answer: 140,
        reasoning: 0,
        totalCost: 6,
        secondsPerTask: 60,
      }),
    },
  ],
  hlePage,
);
const effortLookup = buildArtificialAnalysisSourceDefaultResourceLookup(effortRows);
const effortObservationLookup = buildArtificialAnalysisResourceLookup(effortRows);
assertDeepEqual(
  findArtificialAnalysisBenchmarkResourceRow(
    "hle",
    ["openai/gpt-5-2-non-reasoning"],
    effortObservationLookup,
  )?.reasoning_effort,
  "none",
);
assertDeepEqual(
  findArtificialAnalysisBenchmarkResourceRow("hle", ["openai/gpt-5-2-low"], effortObservationLookup)
    ?.reasoning_effort,
  "low",
);
assertDeepEqual(
  findArtificialAnalysisBenchmarkResourceRow("hle", ["openai/gpt-5-2-max"], effortObservationLookup)
    ?.reasoning_effort,
  "max",
);
for (const candidateName of [
  "GPT-5.2",
  "GPT-5.2 low",
  "GPT-5.2 xhigh",
  "openai/gpt-5-2-non-reasoning",
  "openai/gpt-5-2-low",
  "openai/gpt-5-2",
  "openai/gpt-5-2-max",
]) {
  const defaultRow = findArtificialAnalysisBenchmarkResourceRow(
    "hle",
    [candidateName],
    effortLookup,
  );
  assertDeepEqual(defaultRow?.reasoning_effort, "max");
  assertDeepEqual(defaultRow?.score, 0.35);
  assertApprox(defaultRow?.cost_per_task_usd, 3);
}

let activeRequests = 0;
let maxActiveRequests = 0;
let completedRequests = 0;
const server = createServer((_request, response) => {
  activeRequests += 1;
  maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
  setTimeout(() => {
    activeRequests -= 1;
    completedRequests += 1;
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }, 20);
});

assertDeepEqual(await getArtificialAnalysisBenchmarkResourceStats({ pages: [] }), {
  fetched_at_epoch_seconds: null,
  data: [],
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});
try {
  const address = server.address() as AddressInfo;
  const failedPayload = await getArtificialAnalysisBenchmarkResourceStats({
    concurrency: 2,
    requestJitterMs: 0,
    timeoutMs: 1_000,
    pages: Array.from({ length: 6 }, (_, index) => ({
      benchmark_key: `test_${index}`,
      score_key: `test_${index}`,
      resource_key: `test_${index}`,
      url: `http://127.0.0.1:${address.port}/${index}`,
      task_run_count: 1,
    })),
  });
  assertDeepEqual(failedPayload.fetched_at_epoch_seconds, null);
  assertDeepEqual(completedRequests, 12);
  assertDeepEqual(maxActiveRequests, 2);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
