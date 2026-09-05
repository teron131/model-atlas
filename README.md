# Model Atlas

Model Atlas compares language models across capability, execution, speed, and cost. Its benchmark portfolio favors difficult, consequential tasks with credible grading and useful separation between current models. Each score answers a different question, so the leaderboard keeps those trade-offs visible.

- **Compare similar work.** Agentic includes a bounded adjustment for direct token use. Speed and Value compare resources among models at similar quality, so a cheap or fast result is interpreted alongside what the model achieved.
- **Keep evidence visible.** Validated estimates receive discounted credit and can reduce uncertainty penalties. They never replace the observed benchmark mean or count as direct evidence for admission.
- **Count models fairly.** Each reasoning effort keeps its own results, while a model's variants share its weight in calibration. A sparse effort can be positioned using its measured gap to a well-tested sibling, without assuming that higher effort always wins.

## Scores

The four scores answer different questions:

| Score | Question |
| --- | --- |
| Intelligence | How strong is the model at knowledge, perception, understanding, abstract reasoning, and judgment in difficult problems? |
| Agentic | How reliably does the model turn goals and specifications into working results through coding, instruction following, tool use, verification, and recovery? |
| Speed | How quickly does the model deliver comparable work? |
| Value | How much quality and capability does the model deliver for its cost? |

Coding benchmarks default to primarily Agentic evidence. Intelligence loading is earned when success requires substantial algorithmic, mathematical, scientific, or research reasoning beyond routine software implementation.

## Documentation

| Document | Purpose |
| --- | --- |
| [Benchmark standards](docs/standards.md) | Defines how benchmarks are reviewed, admitted, retained, and rejected. |
| [Benchmark portfolio](docs/benchmarks.md) | Records the selected benchmarks, scoring roles, source policies, weights, and capability decisions. |
| [Model matching](docs/matching.md) | Explains how source-specific names resolve to stable model identities. |
| [Methodology](docs/methodology.md) | Specifies the scoring mathematics, imputation, evidence support, quality regularization, and public admission. |

The source code is authoritative when documentation and implementation disagree. Portfolio decisions live in `src/model-atlas/benchmarks/catalog/portfolio.ts`; benchmark descriptions live in `src/model-atlas/benchmarks/catalog/presentation.ts`. The [methodology article](docs/methodology.md) explains the formulas, worked examples, and reasons behind the scoring choices.

## Development

Model Atlas requires Node.js 24 or newer and uses pnpm.

```sh
pnpm install
pnpm dev
```

The dashboard is a Next.js application. The package export at `src/model-atlas/index.ts` exposes the public data-building and scoring boundaries used by repository consumers.
