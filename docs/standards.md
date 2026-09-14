# Benchmark Standards

A benchmark earns ranking space by testing consequential capabilities with credible grading and useful evidence about current models. Difficulty, popularity, and a polished leaderboard do not establish that value. [Benchmarks](benchmarks.md) records the selected evaluations and source policies; [Methodology](methodology.md) explains their scoring.

## Capability Fit

Capability loading follows what a model must do to succeed, so the same benchmark is not credited to a dimension merely because of its name, topic, or harness.

- **Intelligence:** knowledge, perception, understanding, abstract reasoning, and judgment.
- **Agentic:** turning goals into working results through coding, demanding instruction following, planning, tools, state management, verification, and recovery.

Coding defaults to Agentic. Intelligence weight requires substantial algorithmic, mathematical, scientific, or research reasoning beyond routine implementation. Repository size, execution time, difficult setup, and a scientific topic alone do not meet that requirement.

Ordinary prompt compliance is insufficient Agentic evidence. Tasks must deliberately stress execution or interdependent, conditional, conflicting, implicit, long-horizon, or state-dependent requirements. Running a verifier alone does not establish tool orchestration; final-output grading can still measure execution without grading intermediate actions.

Choose Intelligence/Agentic loadings from **100/0, 75/25, 50/50, 25/75, or 0/100**. This coarse scale keeps the judgment explainable. Every nonzero share needs a rationale based on the task's demands.

## Classification

Classification describes why a benchmark belongs in the portfolio. Importance separately determines its numerical weight; class does not change how missing evidence is treated.

| Class | Requirement |
| --- | --- |
| `frontier` | Credible, demanding tasks separate current leading systems, with remaining headroom in that cohort. |
| `baseline` | Reliable evidence adds important capability breadth or stability, even with modest top-model separation. |
| `rejected` | The evidence adds insufficient capability information or is materially compromised. |

Specialist and private benchmarks can qualify as frontier. Sparse coverage requires stronger supporting evidence, but a well-supported standout can be informative even when other leaders cluster. If frontier value declines, retain the benchmark as baseline only when its remaining signal still earns a place.

Reject evidence dominated by benchmark tricks, compromised tasks, weak or exploitable grading, incompatible configurations, safety or policy behavior rather than capability, stale coverage, unauditable claims, or redundancy with stronger selected benchmarks. Saturation or clustering warrants rejection when no important baseline value remains.

## Review Evidence

Review the primary methodology, evaluation code, dataset documentation, leaderboard artifacts, grading rules, and run configurations. Inspect **at least two complete real tasks** when accessible, including instructions and scoring. This checks whether the benchmark's stated purpose matches what success actually requires. Record unavailable evidence and the judgment it prevents.

| Check | Question |
| --- | --- |
| Task meaning | What determines success, what causes realistic failures, and which capability gap does the benchmark fill? |
| Grading | Do verifiers, rubrics, or judges reward that capability, or can formatting, verbosity, or shortcuts dominate? |
| Integrity | How are task origins, train/test separation, answer exposure, benchmark-aware tuning, and maintenance handled? |
| Comparability | Are model versions, efforts, tools, budgets, harnesses, task subsets, metrics, units, and aggregation compatible? |
| Current coverage | Are results attributable, maintainable, and available for serious current systems? |
| Portfolio value | Does this add breadth, stability, or stronger evidence beyond the selected benchmarks? |

Public availability alone does not establish contamination, and privacy does not establish quality. Private tasks need stronger supporting methodology and validation because direct inspection is limited. Difficulty cannot compensate for materially compromised evidence.

## Difficulty and Separation

**Headroom** is distance from a meaningful ceiling; **spread** is the difference among model results. A useful frontier test needs interpretable capability differences, not merely low scores. Uniformly low results can reflect an uninformative floor, while a high-scoring leader can still reveal a consequential advantage.

1. **Define the cohort.** Inspect the full source leaderboard and a stated cohort of serious current models, including credible specialists and models absent from the final Atlas table. Older low scorers provide historical context; effort variants do not count as independent systems. There is no universal release cutoff.
2. **Describe the distribution.** Examine the leader-to-runner-up gap, the remaining leaders, and floor or ceiling concentration. Top-five or top-ten summaries are useful, not mandatory cohort sizes. If one result creates most of the range, inspect the rest as a sensitivity check without removing or penalizing the standout.
3. **Check the metric.** Investigate whether all-or-nothing grading, partial credit, task composition, or evaluated subsets explain the distribution. Clustering alone does not establish uselessness, and low scores alone do not establish useful difficulty.
4. **Assess uncertainty.** Use task-level outcomes, repeated runs, and uncertainty estimates when available, preferably paired comparisons on shared tasks. Overlapping individual confidence intervals do not settle a pairwise difference. Repeated questions are not independent tasks, and questions sharing a game or scene may have correlated failures.

No single percentage-point threshold works across accuracy, Elo, progress metrics, sample sizes, and task types. Report unresolved close orderings without treating numerical spread as proof of quality. A credible breakthrough can justify frontier status without a neatly separated top five; an isolated claim with an unclear configuration cannot.

## Sources and Model Ordering

Source labels such as official, independent, vendor-reported, and self-reported describe provenance, not quality. Prefer attributable, comparable observations, and inspect contradictions or claims of independent verification. Alternative sites can improve coverage or protocol clarity, but different subsets, metrics, and configurations remain distinct. Mirrors do not create independent evidence or justify extra weight.

Retain harness provenance without using it to assign capability loading. For coding benchmarks, separate harness rows remain distinct unless the benchmark defines a transparent aggregation rule.

Unexpected winners and higher-effort regressions require investigation, not forced agreement with release order or overall Atlas rank. Check task fit, noise, timeouts, formatting, overthinking, and configuration. Persistent unexplained underperformance by strong current systems is more concerning than an isolated specialist reversal; neither justifies inventing best-effort results.

## Merit and Adoption Readiness

A useful benchmark can be difficult to ingest, and an easy source can provide weak evidence. Assess benchmark merit separately from adoption readiness. Adoption requires maintainable artifacts and explicit model identities, efforts, task versions, metrics, units, aggregation, and source precedence, with uncertainty or run counts where randomness matters.

When essential evidence is missing, state the blocker and leave the decision unresolved. Unselected candidates under review or on a watchlist contribute no score; these workflow states are not additional scoring classes.

## Reviewing Selected Benchmarks

Selection is revisited because task quality, model coverage, and frontier separation can change. A health review records whether the existing decision still holds:

| Verdict | Meaning |
| --- | --- |
| `keep` | Still earns its classification and adds credible evidence. |
| `watch` | Useful, but a material unresolved weakness needs follow-up. |
| `review` | Classification or continued inclusion needs reconsideration. |

Health verdicts do not automatically change scoring classes. Automated summaries report source availability, matching coverage, and descriptive spread; they do not assign these verdicts or infer freshness from agreement with Atlas ranks. Their top-five summaries use the best reported result per distinct model, retain effort details, and separate source leaders from matched leaders. These diagnostic representatives never replace scoring observations. Spread uses source units across available models, not an inferred current-frontier cohort; fetch and cache health remain separate.

Inspect current source leaders, coverage, spread, missing or quarantined rows, provenance, effort behavior, and portfolio value. Thin coverage in the final Atlas table alone does not establish benchmark decline. Reconcile aliases, renamed configurations, and newly disclosed efforts before treating missing rows as lost evaluations.

Every concern must state **what changed, the best-supported cause, and whether it affects benchmark merit or only ingestion, matching, or visibility**. Conclude with the classification or unresolved blocker, capability rationale, source choice, and adoption requirements.
