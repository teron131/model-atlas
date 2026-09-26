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
} from "../src/model-atlas/sources/artificial-analysis/benchmark-resources";

function assertDeepEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertApprox(actual: number | null | undefined, expected: number): void {
  if (actual == null || !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-12) {
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
    "briefcase",
    "critpt",
    "gdp_pdf",
    "gdpval_normalized",
    "hle",
    "mlcr_aa",
    "scicode",
    "terminal_bench_4",
    "terminal_bench_science",
  ],
);
for (const [benchmarkKey, scoreKey, resourceKey, url, taskRunCount] of [
  ["gdp_pdf", "gdpPdfAllPass", "gdpPdf", "https://artificialanalysis.ai/evaluations/gdp-pdf", 500],
  ["mlcr_aa", "mlcrOverall", "mlcr", "https://artificialanalysis.ai/evaluations/mlcr-aa", 180],
  [
    "terminal_bench_4",
    "terminalBench40",
    "terminalBench40",
    "https://artificialanalysis.ai/evaluations/terminalbench-4-0",
    198,
  ],
  [
    "terminal_bench_science",
    "terminalBenchScience",
    "terminalBenchScience",
    "https://artificialanalysis.ai/evaluations/terminal-bench-science",
    210,
  ],
] as const) {
  const page = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.find(
    (candidate) => candidate.benchmark_key === benchmarkKey,
  );
  assertDeepEqual(page, {
    benchmark_key: benchmarkKey,
    score_key: scoreKey,
    resource_key: resourceKey,
    url,
    full_model_coverage: true,
    task_run_count: taskRunCount,
  });
}
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
  }, 350);
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
