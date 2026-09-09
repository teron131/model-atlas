# Benchmark Standards

A benchmark earns ranking space through consequential tasks, credible grading, and useful evidence about current models—not difficulty, popularity, or a convincing-looking leaderboard alone.
Selected benchmarks and source policies live in [Benchmarks](benchmarks.md); scoring formulas live in [Methodology](methodology.md).

## Capability Fit

- **Intelligence:** knowledge, perception, understanding, abstract reasoning, and judgment.
- **Agentic:** turning goals into working results through coding, demanding instruction following, planning, tools, state management, verification, and recovery.

Coding defaults to Agentic; Intelligence loading requires substantial algorithmic, mathematical, scientific, or research reasoning beyond routine implementation.
Repository size, execution time, difficult setup, or a scientific topic alone does not earn Intelligence weight.
Ordinary prompt compliance is not Agentic evidence: the task must deliberately stress execution or interdependent, conditional, conflicting, implicit, long-horizon, or state-dependent requirements.
Running a verifier alone is not tool orchestration, but final-output grading can still measure execution without grading intermediate actions.

Choose Intelligence/Agentic loadings from **100/0, 75/25, 50/50, 25/75, or 0/100**, according to what determines success.
Each nonzero share needs a task-based justification; benchmark names, harnesses, and source provenance do not determine loading.

## Classification

| Class | Requirement |
| --- | --- |
| `frontier` | Credible, demanding tasks meaningfully separate current leading systems, with remaining headroom in that cohort. |
| `baseline` | Reliable evidence adds important capability breadth or stability, even with modest top-model separation. |
| `rejected` | The evidence adds insufficient capability information or is materially compromised. |

Classification does not set importance or missing-evidence treatment.
Narrow scope alone does not require baseline status; specialist and private benchmarks can qualify as frontier.
Sparse coverage raises the burden of proof, but a well-supported standout can be informative even when other leaders cluster.
Frontier status can lapse; retain the benchmark as baseline only if its surviving signal still earns a place.

Reject evidence dominated by benchmark tricks, compromised tasks, weak or exploitable grading, incompatible configurations, safety or policy behavior rather than capability, stale coverage, unauditable claims, or redundancy with stronger selected benchmarks.
Saturation or clustering warrants rejection when no important baseline value remains.

## Review Evidence

Read primary methodology, evaluation code, dataset documentation, leaderboard artifacts, grading rules, and run configurations.
Inspect **at least two complete real tasks** when accessible, including instructions and scoring; marketing descriptions are insufficient.
Record unavailable evidence and the judgment it prevents.

Check:

- **Task meaning:** what success requires, realistic failure modes, and which capability gap the benchmark fills.
- **Grading:** whether verifiers, rubrics, or judges reward that capability rather than formatting, verbosity, or shortcuts.
- **Integrity:** task origins, train/test separation, exposure of answers, benchmark-aware tuning, and maintenance.
- **Comparability:** model version, effort, tools, budgets, harness, task subset, metric, units, and aggregation.
- **Vitality:** coverage of serious current systems and attributable, maintainable results.
- **Portfolio value:** useful breadth, stability, or stronger evidence—not another measurement of an already well-covered capability.

Public availability alone does not establish contamination; privacy alone does not establish quality.
Private tasks require stronger supporting methodology and validation because direct inspection is limited.
Difficulty cannot rescue materially compromised evidence.

## Difficulty and Separation

**Headroom and spread are different.** Headroom is distance from a meaningful ceiling; spread describes differences among models.
Uniformly low scores can be an uninformative floor, while a high-scoring leader can still reveal meaningful differences.

1. **Define the cohort.** Inspect the full source leaderboard and a stated cohort of current serious models, including credible specialists and models absent from Atlas's final table.
   Older low scorers provide historical context, not frontier separation.
   Do not impose a universal release cutoff or count effort variants as independent leading systems.
2. **Describe the shape.** Examine the leader-to-runner-up gap, the remaining leaders, and floor or ceiling concentration.
   Top-five or top-ten summaries are useful, not mandatory cohort sizes or acceptance thresholds.
   If one result creates most of the range, examine the rest as a sensitivity check—not a reason to remove or penalize the standout.
3. **Check the metric.** Tight clustering does not prove uselessness, and low scores do not prove useful difficulty.
   Check whether all-or-nothing grading, partial credit, task composition, or a different subset explains the distribution.
4. **Assess uncertainty.** Use task-level outcomes, repeated runs, and uncertainty estimates when available; prefer paired comparisons on shared tasks.
   Overlapping individual confidence intervals do not settle a pairwise difference.
   Repeated questions are not additional independent tasks, and questions sharing a game or scene may have correlated failures.

No universal percentage-point threshold works across accuracy, Elo, progress, sample sizes, and task types.
Separate a visible numerical gap from a stable, consequential advantage; report unresolved close orderings without claiming that spread alone proves quality.
A credible breakthrough can justify frontier status without a neatly separated top five; an isolated, configuration-opaque claim cannot.

## Sources and Model Ordering

Official, independent, vendor-reported, and self-reported are provenance labels, not automatic quality verdicts.
Prefer attributable, comparable observations; inspect contradictions and claims presented as independently verified when they are not.
Compare alternative sites for current coverage and protocol clarity, without treating different subsets, metrics, or configurations as interchangeable.
Mirrors provide no independent evidence; duplicate results receive no extra weight or averaging merely because multiple sites publish them.

Retain harness provenance without using it to assign capability loading.
For coding benchmarks, multiple harnesses for the same model configuration remain distinguishable unless the benchmark defines a transparent aggregation rule.

Release order and overall Atlas rank are not ground truth for an individual benchmark.
Unexpected winners or higher-effort regressions prompt inspection of task fit, noise, timeouts, formatting, overthinking, and configuration—not forced monotonic rankings or synthetic best-effort results.
Persistent unexplained underperformance by strong current systems is more concerning than an isolated specialist reversal.

## Merit and Adoption Readiness

Judge benchmark merit separately from ingestion readiness.
Access restrictions or an unfinished scraper can block adoption without invalidating the tasks; easy ingestion does not justify weak evidence.
Adoption requires maintainable source artifacts and explicit model identities, efforts, task version, metric, units, aggregation, and source precedence, with uncertainty or run counts where stochasticity matters.

When essential evidence is missing, state the blocker and leave the decision unresolved.
An unselected candidate under review or on a watchlist contributes no score; neither is a fourth scoring class.

## Reviewing Selected Benchmarks

| Verdict | Meaning |
| --- | --- |
| `keep` | Still earns its classification and adds credible evidence. |
| `watch` | Useful, but a material unresolved weakness needs follow-up. |
| `review` | Classification or continued inclusion needs reconsideration. |

These are health verdicts, not scoring classes; classification changes require a separate decision.
Automated database summaries report source availability, matching coverage, and descriptive spread—not `keep/watch/review` judgments or freshness inferred from rank agreement.
Their top-five summaries use the best reported result per distinct model, retain effort details, and separate source leaders from matched leaders; these diagnostic representatives never replace scoring observations.
Spread uses the source's score units across all available models, not an automatically inferred current-frontier cohort; source fetch/cache health remains separate.
Inspect source leaders, current coverage, spread, missing or quarantined results, provenance, effort behavior, and portfolio value.
Thin coverage in Atlas's final table alone does not establish benchmark decline.
Reconcile aliases, renamed configurations, and newly disclosed efforts before interpreting missing rows as lost evaluations.

For each concern, explain **what changed, the best-supported cause, and whether it affects benchmark merit or only ingestion, matching, or visibility**.
Finish with the classification or unresolved blocker, capability rationale, source choice, and adoption requirements.
