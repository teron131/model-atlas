# Standards

Modern LLM leaderboards are noisy. Many benchmarks keep circulating long after they stop separating strong models. Others look impressive on paper but mainly measure scaffolds, public memorization, policy behavior, or benchmark-specific tricks. The goal of this standard is to keep only benchmarks that still say something meaningful about current frontier models.

The current selected portfolio and source-specific policies are documented in [Benchmarks](benchmarks.md).

A benchmark should help answer one of two questions:

1. Is this model more intelligent?
2. Is this model more agentic?

If it does not help answer either question, it does not belong in the ranking.

Agentic signal should come from tasks that require coding workflow execution or specific tool use: terminals, browsers, files, repositories, APIs, multi-step harnesses, or other external environments. Coding difficulty alone does not make a benchmark agentic. Static coding, scientific programming, or software-design questions should count as Intelligence when they mainly test professional knowledge, reasoning, or problem formulation rather than tool execution.

Accepted benchmarks fall into exactly two classes: `frontier` and `baseline`. Everything else is `rejected`. There is no diagnostic bucket for the ranking. Interesting but non-decisive benchmarks should be discussed elsewhere, not allowed to quietly affect the score.

## Frontier Benchmarks

A frontier benchmark is a stress test for the current best models.

It should make frontier systems struggle. The best scores should not be near the ceiling, and the benchmark should expose meaningful gaps between top models. A good frontier benchmark does not need broad historical coverage. It may only have a few model results if those results are from the newest strongest systems and the gap between them is informative.

A frontier benchmark should have fresh or protected tasks, credible grading, and enough difficulty that model differences still matter. It should test a serious capability, not a benchmark format. It should show that one model is ahead of another in a way that matches real qualitative differences, not random prompt noise.

Frontier benchmarks provide the strongest separation among the leading models.

## Baseline Benchmarks

A baseline benchmark is not necessarily the hardest current stress test, but it remains a high-standard signal after filtering out bad benchmarks.

Baseline benchmarks stabilize the ranking. They measure important capabilities that should not disappear just because a few new frontier tests are available: expert knowledge, professional reasoning, factual precision, long-context understanding, scientific coding, document analysis, and work-like output.

A baseline benchmark should still have useful score spread, current model coverage, credible grading, and a clear capability meaning. It should not be heavily saturated, obviously contaminated, dominated by format artifacts, or redundant with a stronger benchmark.

Baseline benchmarks provide stable capability coverage, while frontier benchmarks separate the current leaders.

## Rejected Benchmarks

A benchmark should be rejected when it no longer deserves ranking space.

Common rejection reasons:

- frontier models are saturated or tightly clustered near the ceiling
- the benchmark is stale, public, memorized, or contamination-heavy
- the format is mostly multiple-choice trivia, toy puzzles, keyword matching, or artificial patch tasks
- grading is underspecified, subjective without calibration, or easy to exploit
- results depend on an opaque or incomparable harness while being presented as a pure model ranking
- the benchmark mainly tests safety or policy behavior instead of capability
- the signal is redundant with a better benchmark
- no results from current serious models are available
- the only evidence is an isolated, unauditable claim without enough methodology or comparable rows to interpret it

Realistic tasks do not rescue a saturated benchmark, difficulty does not rescue a contaminated benchmark, and familiarity does not justify retaining a benchmark that no longer adds signal.

## What To Inspect

Every benchmark should be judged from evidence, not marketing.

Inspect the official site, paper, repository, dataset card, leaderboard, methodology, sample tasks, scoring rules, verifier details, and current frontier model results. Check whether results are official, independent, self-reported, vendor-provided, same-harness, or mixed-harness.

Use real samples whenever possible. Inspect at least two tasks when samples are accessible; the point is to understand what the benchmark actually asks the model to do, not what its abstract claims. When private tasks prevent inspection, treat that opacity as a source of uncertainty and require stronger evidence from the methodology, grading protocol, result distribution, and independent validation.

## Caveats Are Not Failures

Different disclosed agents or harnesses are not inherently wrong for an Agentic benchmark. They change the unit of interpretation from a pure model result to a model-plus-agent result. Judge whether the tasks, scoring, configurations, and harness identities are clear enough to support that claim. Escalate only when incompatible or opaque harness differences dominate the result while the leaderboard presents them as directly comparable model scores.

A benchmark leader does not need to be the overall top-ranked Model Atlas model. Specialized capabilities, task fit, reasoning effort, and measurement noise can produce a legitimate ordering that differs from the broad Intelligence table. Treat disagreement as adverse evidence only when the leaderboard is generally led by stale or weak systems, strong current models consistently perform poorly, and no credible capability-specific explanation remains.

Self-reported, vendor-reported, or unverified rows are provenance labels, not automatic defects. They can support ranking when each claim is attributable to a primary source, the evaluated task and configuration are understandable, multiple current serious systems have comparable rows, and the distribution is coherent with other evidence. Escalate when claims are isolated, contradictory, configuration-opaque, impossible to audit, or used to imply independent verification that did not occur.

A useful benchmark report should answer:

- What capability is being tested?
- Are the tasks serious, authentic, or cognitively meaningful?
- Do current best models still struggle?
- Are score gaps large enough to matter?
- Is grading reliable enough to trust?
- Is contamination controlled?
- Is the benchmark measuring the model or the scaffold?
- Do stronger reasoning-effort settings help, plateau, or regress?
- Is the signal broad or important enough?
- Is it redundant with a better benchmark?
- Is there enough public evidence to understand the result?

Watchlist-only benchmarks remain under review until they provide a stable structured leaderboard with source model and configuration identities, task-level outcomes or distributions with uncertainty and run counts, documented aggregation and comparable harness conditions, and current frontier coverage with non-saturated rank separation.

## Effort Sensitivity

Benchmarks with multiple reasoning-effort or budget settings should be inspected for effort sensitivity.

For the same base model, higher reasoning effort should usually improve performance or plateau. A material regression at higher effort is a warning sign. It can mean the benchmark is measuring overthinking, verbosity penalties, timeout pressure, brittle output formatting, over-engineered patches, or harness mismatch rather than clean model capability.

This does not automatically reject the benchmark. It should trigger closer review of samples, grading rules, timeouts, allowed output format, and effort configuration. Preserve effort-level observations and report whether higher effort improves, plateaus, or regresses. Source-default selection and public-view behavior are documented in [Benchmarks](benchmarks.md) and [Methodology](methodology.md).

## Harness Interpretation

Same-harness results are the cleanest source for direct model comparison.

Mixed-harness leaderboards are different. They should not be read as pure model rankings, because each row measures a model plus an agent framework. This is an interpretation boundary, not a quality failure. If the same model performs well across multiple independent harnesses, that is evidence of cross-harness robustness, tool-use tolerance, and ecosystem adaptability.

For mixed-harness boards, record:

- best score by model
- median score by model
- number of independent harness families
- single-model vs multi-model setup
- whether performance depends on one special scaffold

A mixed-harness board can earn ranking space when the model-plus-agent meaning is explicit and the rows remain auditable. It is not a single-harness model leaderboard.

## Final Classification

Each benchmark receives exactly one classification:

| Classification | Meaning |
| --- | --- |
| `frontier` | A current high-pressure stress test that meaningfully separates top models |
| `baseline` | A vetted high-standard benchmark that still adds useful capability signal |
| `rejected` | A benchmark that should not affect the ranking |

The final report should explain why each accepted benchmark earns ranking space and why each rejected benchmark is excluded.
