# Benchmark Standards

Modern LLM leaderboards are noisy. Many benchmarks keep circulating long after they stop separating strong models. Others look impressive on paper but mainly measure scaffolds, public memorization, policy behavior, or benchmark-specific tricks. The goal of this standard is to keep only benchmarks that still say something meaningful about current frontier models.

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

Frontier benchmarks are the sharp edge of the ranking. They decide the top fights.

## Baseline Benchmarks

A baseline benchmark is not necessarily the hardest current stress test, but it remains a high-standard signal after filtering out bad benchmarks.

Baseline benchmarks stabilize the ranking. They measure important capabilities that should not disappear just because a few new frontier tests are available: expert knowledge, professional reasoning, factual precision, long-context understanding, scientific coding, document analysis, and work-like output.

A baseline benchmark should still have useful score spread, current model coverage, decent grading, and a clear capability meaning. It should not be heavily saturated, obviously contaminated, format-cringe, or redundant with a stronger benchmark.

Baseline benchmarks are the map. Frontier benchmarks are the battlefield.

## Rejected Benchmarks

A benchmark should be rejected when it no longer deserves ranking space.

Common rejection reasons:

- frontier models are saturated or tightly clustered near the ceiling
- the benchmark is stale, public, memorized, or contamination-heavy
- the format is mostly multiple-choice trivia, toy puzzles, keyword-count games, or artificial issue patching
- grading is vague, judge-vibes-heavy, or easy to exploit
- results mostly measure the harness, scaffold, or custom agent framework rather than the model
- the benchmark mainly tests safety or policy behavior instead of capability
- the signal is redundant with a better benchmark
- current model coverage is missing
- the only evidence comes from vendor claims or isolated release tables

Good task texture does not save a saturated benchmark. Hard questions do not save a contaminated benchmark. A famous benchmark does not deserve retirement benefits.

## What To Inspect

Every benchmark should be judged from evidence, not marketing.

Inspect the official site, paper, repository, dataset card, leaderboard, methodology, sample tasks, scoring rules, verifier details, and current frontier model results. Check whether results are official, independent, self-reported, vendor-provided, same-harness, or mixed-harness.

Use real samples whenever possible. At least two sample tasks should be inspected before trusting the benchmark. The point is to understand what the benchmark actually asks the model to do, not what the abstract claims it measures.

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

## Effort Sensitivity

Benchmarks with multiple reasoning-effort or budget settings should be inspected for effort sensitivity.

For the same base model, higher reasoning effort should usually improve performance or plateau. A material regression at higher effort is a warning sign. It can mean the benchmark is measuring overthinking, verbosity penalties, timeout pressure, brittle output formatting, over-engineered patches, or harness mismatch rather than clean model capability.

This does not automatically reject the benchmark. It should trigger closer review of samples, grading rules, timeouts, allowed output format, and effort configuration. Preserve effort-level rows when available, report effort sensitivity, and avoid hiding the issue by silently selecting only the best effort row.

## Harness Interpretation

Same-harness results are the cleanest source for direct model comparison.

Mixed-harness leaderboards are different. They should not be read as pure model rankings, because each row measures a model plus an agent framework. Still, they can be useful. If the same model performs well across multiple independent harnesses, that is evidence of cross-harness robustness, tool-use tolerance, and ecosystem adaptability.

For mixed-harness boards, record:

- best score by model
- median score by model
- number of independent harness families
- single-model vs multi-model setup
- whether performance depends on one special scaffold

A mixed-harness board is not useless. It is just not a single-row model leaderboard.

## Final Classification

Each benchmark receives exactly one classification:

`frontier`
A current high-pressure stress test that meaningfully separates top models.

`baseline`
A vetted high-standard benchmark that still adds useful capability signal.

`rejected`
A benchmark that should not affect the ranking.

The final report should explain why each accepted benchmark earns ranking space and why each rejected benchmark should be killed.
