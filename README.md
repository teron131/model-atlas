# Model Atlas

Model Atlas is an opinionated model leaderboard for choosing the right model, not declaring one universal winner. Instead of averaging every available benchmark into a broad index, it selects evaluations that remain difficult for leading models, measure consequential capabilities, produce meaningful and interpretable separation, and have credible tasks, grading, provenance, and comparable results. Saturated, contaminated, redundant, opaque, or misleading benchmarks are excluded even when they are widely used. Capability, workflow execution, delivery speed, and cost efficiency remain separate so their tradeoffs stay visible.

- **Efficiency remains tied to capability.** Speed and Value compare models with nearby-quality peers, so low cost or latency cannot compensate for less useful work.
- **Missing evidence remains uncertain.** Estimates use validated, non-recursive imputation, prediction error reduces their score influence and evidence support, and estimates never count toward public admission.
- **More variants do not create more confidence.** Reasoning-effort configurations remain separate, while model-balanced calibration prevents models with more variants from gaining additional reference weight.

## Scores

The four scores answer different questions:

| Score | Question |
| --- | --- |
| Intelligence | How strong is the model at knowledge, reasoning, interpretation, and problem solving? |
| Agentic | How reliably does the model complete work through tools, files, repositories, browsers, terminals, APIs, and other external environments? |
| Speed | How quickly does the model deliver comparable work? |
| Value | How much quality and capability does the model deliver for its cost? |

## Documentation

| Document | Purpose |
| --- | --- |
| [Benchmark standards](docs/standards.md) | Defines how benchmarks are reviewed, admitted, retained, and rejected. |
| [Benchmark portfolio](docs/benchmarks.md) | Records the selected benchmarks, scoring roles, source policies, weights, and capability decisions. |
| [Model matching](docs/matching.md) | Explains how source-specific names resolve to stable model identities. |
| [Methodology](docs/methodology.md) | Specifies the scoring mathematics, imputation, confidence, and public admission. |

The source code is authoritative when documentation and implementation disagree. Portfolio policy lives in `src/model-atlas/benchmarks/catalog/portfolio.ts`; benchmark display copy lives in `src/model-atlas/benchmarks/catalog/presentation.ts`.

## Development

Model Atlas requires Node.js 24 or newer and uses pnpm.

```sh
pnpm install
pnpm dev
```

The dashboard is a Next.js application. The package export at `src/model-atlas/index.ts` exposes the public data-building and scoring boundaries used by repository consumers.
