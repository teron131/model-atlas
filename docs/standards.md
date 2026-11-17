# Benchmark Standards

A benchmark earns ranking space by testing consequential capabilities with credible grading and useful evidence about current models. Difficulty, popularity, and a polished leaderboard do not establish that value. [Benchmarks](benchmarks.md) records the selected evaluations and source notes; [Methodology](methodology/overview.md) explains their scoring.

## Review Evidence

Review the primary methodology, evaluation code, dataset documentation, leaderboard artifacts, grading rules, and run configurations. Inspect **at least two complete real tasks** when accessible, including instructions and scoring. This checks whether the benchmark's stated purpose matches what success actually requires. Record unavailable evidence and the judgment it prevents.

| Check | Question |
| --- | --- |
| Capability fit | What determines success, what causes realistic failures, and which capability gap does the benchmark fill? |
| Grading | Would an informed reviewer accept the results as justified by the outputs, and is the ranking distribution plausible? Can position, length, formatting, or shortcuts decide outcomes instead of quality? |
| Integrity | How are task origins, train/test separation, answer exposure, benchmark-aware tuning, and maintenance handled? |
| Separation | How much headroom remains, and do results show interpretable capability differences among serious current models? |
| Comparability | Are model versions, efforts, tools, budgets, harnesses, task subsets, metrics, units, and aggregation compatible? |
| Current coverage | Can each result be traced to its source and kept up to date, and do serious current models have results? |
| Portfolio value | Does this add breadth, stability, or stronger evidence beyond the selected benchmarks? |

## Capability Fit

The allocation follows what a model must do to succeed, so a benchmark is not credited to a capability merely because of its name, topic, or harness.

- **Intelligence:** solving difficult problems using knowledge, perception, understanding, abstract reasoning, and judgment.
- **Agentic:** reliably turning goals and specifications into working results through instruction following, planning, coding, tool use, verification, and recovery.

Coding defaults to Agentic. Intelligence weight requires substantial algorithmic, mathematical, scientific, or research reasoning beyond routine implementation. Repository size, execution time, difficult setup, and a scientific topic alone do not meet that requirement.

Following an ordinary prompt is not enough evidence for Agentic. Tasks must deliberately stress execution, or requirements that are interdependent, conditional, conflicting, implicit, long-horizon, or state-dependent. Running a verifier does not by itself show tool orchestration, and grading only the final output can still measure execution without grading the steps taken.

Taste and design are capabilities in their own right. Building a visual or interactive artifact judged on its result shows detail, fidelity to the request, and aesthetic judgment that pass/fail checks rarely reach. Such evaluations complement verifier-graded benchmarks rather than standing in for them.

Choose Intelligence/Agentic allocations from **100/0, 75/25, 50/50, 25/75, or 0/100**. This coarse scale keeps the judgment explainable. Every nonzero share needs a rationale based on the task's demands.

## Grading and Integrity

The test is whether the results can be justified, not who or what grades. Verifiers, rubrics, and blind pairwise comparison by experts, panels, or strong model judges are all acceptable, for work deliverables, writing, and design alike. Subjective criteria such as taste are not weaker evidence than objective ones. A judged benchmark has to earn trust as a verified one does. It needs blind comparison of outputs for the same task, enough judgments for stable ratings, controls for order and presentation effects, and a ranking whose shape holds up against the rest of the evidence.

A public benchmark is not contaminated merely by being public, and a private one is not good merely by being private. Private tasks need stronger supporting methodology and validation because direct inspection is limited. Difficulty cannot make up for compromised evidence.

## Difficulty and Separation

**Headroom** is distance from a meaningful ceiling; **spread** is the difference among model results. A useful frontier benchmark needs differences that can be read as differences in capability, not merely low scores. Uniformly low results can mean the benchmark only finds a floor, while a high-scoring leader can still show an advantage that matters.

1. **Name the models compared.** Inspect the full source leaderboard and a stated group of serious current models, including credible specialists and models absent from the final Atlas table. Older low scorers give historical context, and the reasoning-effort variants of one model do not count as separate models. No single release cutoff applies everywhere.
2. **Describe the distribution.** Examine the gap between the leader and the runner-up, the remaining leaders, and how many results sit at the floor or the ceiling. Top-five or top-ten summaries are useful, not required group sizes. If one result creates most of the range, inspect the rest without it as a check, and neither remove nor penalize the standout.
3. **Check the metric.** Investigate whether all-or-nothing grading, partial credit, task composition, or evaluated subsets explain the distribution. Clustered results do not by themselves make a benchmark useless.
4. **Assess uncertainty.** Use task-level outcomes, repeated runs, and uncertainty estimates when available, preferably paired comparisons on shared tasks. Overlapping individual confidence intervals do not settle a pairwise difference. Repeated questions are not independent tasks, and questions sharing a game or scene may have correlated failures.

No single percentage-point threshold works across accuracy, Elo, progress metrics, sample sizes, and task types. Report close orderings as unresolved, and do not treat numerical spread as proof of quality. A credible breakthrough can justify frontier status without a neatly separated top five; an isolated claim with an unclear configuration cannot.

An unexpected winner, or a model that scores lower at a higher reasoning effort, calls for investigation, not for forcing agreement with release order or overall Atlas rank. Check task fit, noise, timeouts, formatting, overthinking, and configuration. Strong current models that keep underperforming without explanation are a greater concern than a specialist that beats them once; neither justifies inventing best-effort results.

## Sources and Comparability

Source labels such as official, independent, vendor-reported, and self-reported say where a result came from, not how good it is. Prefer results that can be traced to their source and compared, and inspect contradictions and claims of independent verification. Alternative sites can improve coverage or make the protocol clearer, but results on different subsets, metrics, or configurations are different measurements. A mirror of another source adds no independent evidence and justifies no extra weight.

Keep the record of which harness produced each result. For coding benchmarks, rows from different harnesses stay separate unless the benchmark defines a transparent rule for combining them.

## Frontier, Baseline, or Rejected

Being frontier or baseline describes why a benchmark belongs in the portfolio and decides whether it carries weight: frontier benchmarks carry weight in capability scores, and baseline benchmarks carry none. It does not change how missing evidence is treated.

| Decision | Requirement |
| --- | --- |
| `frontier` | Credible, demanding tasks separate the current leading models and leave them headroom. |
| `baseline` | Reliable evidence adds important capability breadth or stability, even when it separates the top models only modestly. |
| `rejected` | The evidence adds too little information about capability or is compromised. |

Specialist and private benchmarks can qualify as frontier. Sparse coverage requires stronger supporting evidence, but a well-supported standout can be informative even when other leaders cluster. If its frontier value declines, keep the benchmark as baseline only when what it still shows earns a place.

Reject evidence dominated by benchmark tricks, compromised tasks, weak or exploitable grading, incompatible configurations, safety or policy behavior rather than capability, stale coverage, claims that cannot be checked, or redundancy with stronger selected benchmarks. Saturated or clustered results warrant rejection when no important baseline value is left.

## Merit and Adoption Readiness

A useful benchmark can be difficult to ingest, and an easy source can provide weak evidence. Assess benchmark merit separately from adoption readiness. Adoption requires maintainable artifacts and explicit model identities, efforts, task versions, metrics, units, aggregation, and source precedence, with uncertainty or run counts where randomness matters.

When essential evidence is missing, state the blocker and leave the decision unresolved. Unselected candidates under review or on a watchlist contribute no score; these workflow states are not further kinds of benchmark beside frontier and baseline.

## Reviewing Selected Benchmarks

Selection is revisited because task quality, model coverage, and frontier separation can change. A health review records whether the existing decision still holds:

| Verdict | Meaning |
| --- | --- |
| `keep` | Still earns its place as frontier or baseline and adds credible evidence. |
| `watch` | Useful, but an unresolved weakness that matters needs follow-up. |
| `review` | Its place as frontier or baseline, or its continued inclusion, needs reconsideration. |

A health verdict does not make a benchmark frontier or baseline; that takes a separate decision. Inspect current source leaders, coverage, spread, missing or quarantined rows, where results come from, effort behavior, and portfolio value. Thin coverage in the final Atlas table does not by itself show that a benchmark has declined. Reconcile aliases, renamed configurations, and newly disclosed efforts before treating missing rows as lost evaluations.

Automated summaries report whether each source is available, how much of it is matched, how far its results spread, and when each benchmark's rows last changed. They do not assign these verdicts or infer freshness from agreement with Atlas ranks. Their top-five summaries take the best reported result of each distinct model, keep its effort details, and list source leaders separately from matched leaders. These summary picks never replace the observations used in scoring. Spread is measured in source units across the available models, not across an inferred group of current leaders, and fetch and cache health are reported separately.

Every concern must state **what changed, the best-supported cause, and whether it affects benchmark merit or only ingestion, matching, or visibility**. Conclude with frontier, baseline, or rejected, or with the unresolved blocker, capability rationale, source choice, and adoption requirements.
