# Benchmark Standards

Model Atlas includes a benchmark only when it adds credible information about current models. Familiarity, difficulty, or a polished leaderboard is not enough: the benchmark must measure a meaningful capability, distinguish serious systems, and support an interpretation that survives scrutiny.

The current portfolio, source precedence, metric selection, and scoring roles are documented in [Benchmarks](benchmarks.md).

## Capability Fit

Every accepted benchmark must measure at least one of two capabilities:

1. **Intelligence:** acquiring and interpreting knowledge, reasoning and exercising judgment, solving problems, and constructing correct or valuable artifacts such as answers, analyses, plans, proofs, code, documents, or models.
2. **Agentic ability:** carrying instructions through action by following complex or persistent constraints, selecting and sequencing tools, using feedback, maintaining external state, self-verifying, recovering from failures, and persisting through a multi-step task.

Classification follows the intended scored capability before the interface. Code, proofs, documents, files, repositories, browsers, terminals, compilers, interpreters, and harnesses are neutral media: their presence does not itself earn Agentic loading. A benchmark earns Agentic loading only when instruction fidelity, tool orchestration, or stateful execution materially determines the score.

Ordinary compliance with a task prompt is common to every benchmark and does not make every benchmark Agentic. Instruction fidelity becomes Agentic evidence when the benchmark deliberately stresses and scores interdependent, conditional, implicit, conflicting, long-horizon, or state-dependent requirements. Likewise, merely running a verifier is not tool orchestration; the model must select or sequence actions, use feedback, manage state, or recover.

Use the completed-artifact counterfactual when the distinction is unclear: if a correct artifact could be submitted directly and would fully represent success, the benchmark is primarily Intelligence even when the artifact is code or a proof. A mixed loading is justified when the benchmark also scores how reliably the model translates instructions into actions, coordinates tools, or completes a stateful workflow.

Dimension loadings use a coarse five-level scale so incidental mechanics do not create false precision:

| Intelligence / Agentic | Meaning |
| --- | --- |
| 100% / 0% | The scored construct is Intelligence; any execution mechanics are incidental. |
| 75% / 25% | Intelligence dominates, with a material but secondary Agentic component. |
| 50% / 50% | Both capabilities independently and materially determine success. |
| 25% / 75% | Agentic ability dominates, with substantive Intelligence still required. |
| 0% / 100% | The scored construct is instruction fidelity, tool orchestration, or stateful execution; domain reasoning is incidental to that construct. |

Endpoints are normal, not exceptional. A review should assign weight only to capabilities the benchmark materially scores and explain every cross-loading. Harness or provider provenance remains a separate comparability judgment except for the narrow repeated-harness coding case defined below.

If the benchmark does not add credible evidence about either capability, it does not belong in the ranking.

## Classification

Every benchmark receives exactly one scoring classification:

| Classification | Meaning |
| --- | --- |
| `frontier` | A current high-pressure stress test that meaningfully separates leading models. |
| `baseline` | A vetted benchmark that adds stable, important capability coverage. |
| `rejected` | A benchmark that should not affect the ranking. |

There is no diagnostic scoring class. A benchmark may remain under review when essential evidence is unavailable, but it must not affect the ranking until it earns either frontier or baseline status.

Classification does not determine benchmark weight. Importance and dimension loading are separate portfolio decisions.

## Frontier Standard

A frontier benchmark should expose meaningful differences among the strongest current models. The best systems should still have room to improve, and the gaps near the top should be large or consistent enough to support a real comparison.

Strong frontier evidence usually has the following properties:

- difficult, serious tasks with fresh, protected, or contamination-resistant content
- credible grading, verification, or human evaluation
- current results from several leading models or model-plus-agent systems
- visible headroom or meaningful separation near the top
- a capability that matters outside the benchmark format
- enough methodological detail to interpret what a score represents

Broad historical coverage is not required. A private or specialist benchmark can qualify with relatively few rows when those rows cover current strong systems, the tasks are credible, and the performance gaps are informative. Sparse evidence still raises the burden of proof: an isolated score or an unauditable claim is not enough.

Frontier status is not permanent. A benchmark should move to baseline or be rejected when saturation, contamination, stale coverage, or a stronger replacement removes its frontier pressure.

## Baseline Standard

A baseline benchmark need not be the hardest current stress test. It earns ranking space by providing reliable capability coverage that would otherwise be missing or unstable.

Useful baseline evidence can cover expert knowledge, factual precision, professional reasoning, long-context understanding, scientific programming, document analysis, specialist domains, and work-like execution. The benchmark should still have current model coverage, credible grading, interpretable score spread, and a clear relationship to Intelligence or Agentic ability.

A benchmark belongs in baseline when its signal remains valuable but one or more factors make a frontier claim too strong. Common reasons include narrower scope, modest top-model separation, greater contamination exposure, a creator-run harness, limited result volume, or deliberate use as a broad aggregate or stabilizer.

Baseline does not mean low quality. It means the benchmark contributes breadth or stability rather than the strongest missing-data pressure on frontier models.

## Rejection Standard

A benchmark should be rejected when its evidence no longer deserves ranking space.

Common reasons include:

- frontier systems are saturated or tightly clustered near the ceiling
- the tasks are stale, public, memorized, or highly exposed to contamination
- the format mostly rewards trivia, keyword matching, artificial patches, or benchmark-specific tricks
- grading is underspecified, uncalibrated, subjective without safeguards, or easy to exploit
- results depend on opaque or incompatible harnesses while being presented as directly comparable model scores
- the benchmark primarily measures safety or policy behavior rather than capability
- the signal duplicates a stronger selected benchmark without adding meaningful coverage
- serious current models are absent and the remaining rows cannot establish present-day relevance
- the only evidence is an isolated, contradictory, or unauditable claim
- the score lacks a stable capability interpretation

Realistic tasks do not rescue a saturated benchmark. Difficulty does not rescue a contaminated benchmark. Familiarity does not justify retaining a signal that a better benchmark already measures.

## Review Evidence

Benchmark reviews should use primary evidence wherever possible:

- the official leaderboard and result artifacts
- the paper, technical report, or methodology page
- the official repository and dataset card
- sample tasks and complete task instructions
- scoring rules, rubrics, judges, verifiers, and aggregation logic
- current model results with configuration, effort, and harness details
- uncertainty, run counts, or task-level distributions when published

Inspect at least two real tasks when samples are accessible. The purpose is to determine what the model must actually do, which capabilities success requires, and what shortcuts the benchmark permits. An abstract or product page is not a substitute for task inspection.

Private tasks are not automatically disqualifying, but opacity increases the evidence burden. A private benchmark needs stronger methodology, grading, result-distribution, provenance, and independent-validation evidence than an equally strong benchmark with inspectable tasks.

## Review Questions

A defensible review should answer these questions:

### Capability

- What work does the model perform?
- Does success measure Intelligence, Agentic ability, or both?
- Are the tasks authentic, serious, and cognitively meaningful?
- Is the capability broad, important, or distinct enough to earn ranking space?

### Difficulty and separation

- Do current leading models still struggle?
- How large is the overall spread and the spread among the strongest rows?
- Are the differences stable across tasks, runs, or confidence intervals?
- Does the leaderboard distinguish systems or mainly reproduce noise?

### Measurement quality

- What exactly is scored?
- Is grading deterministic, verifier-backed, human-judged, model-judged, or mixed?
- Are rubrics and aggregation rules specific enough to audit?
- Can formatting, verbosity, policy behavior, or benchmark-specific tactics dominate the score?

### Contamination and task integrity

- Are tasks public, private, refreshed, generated, or protected?
- What prevents memorization or training leakage from dominating performance?
- Are train, development, and evaluation materials separated clearly?
- Is there evidence of task reuse, answer exposure, or benchmark-aware tuning?

### Comparability

- Are results produced under the same harness and configuration?
- If harnesses differ, is the unit of comparison clearly model-plus-agent rather than model alone?
- Are model versions, reasoning efforts, budgets, tools, and inference settings disclosed?
- Are repeated runs or uncertainty estimates available where outcomes are stochastic?

### Provenance and vitality

- Are rows official, independent, vendor-reported, self-reported, or mirrored?
- Can every important result be traced to an attributable source?
- Does the leaderboard cover current serious models?
- Is the source maintained well enough to support ongoing review and ingestion?

### Portfolio value

- Does the benchmark add a capability that the selected portfolio lacks?
- Is it redundant with a stronger or more auditable benchmark?
- Would admitting it improve the ranking, or merely increase the number of inputs?

## Harness Interpretation

Harness choice normally affects provenance and comparability, not capability loading. Same-harness results make model attribution cleaner, while mixed-harness rows represent model-plus-harness systems, but neither condition makes the underlying task Agentic.

For non-coding benchmarks and coding benchmarks with only one harness per exact model configuration, record the harness and preserve the model-plus-harness interpretation without using harness presence as Agentic evidence. A leaderboard cannot infer model agency by comparing different models that also use different harnesses because model and scaffold effects are confounded.

The narrow exception is an explicitly coding benchmark that evaluates the same exact model configuration under more than one materially different harness. Repeated-harness results can reveal tool-loop reliability, instruction execution, feedback use, or recovery across scaffolds and may therefore support Agentic loading when those behaviors are part of the benchmark's scored construct. Code remains neutral, each row remains a model-plus-harness result, and harness variation alone does not determine the loading.

For that repeated-harness case, retain every model-harness row and report how aggregation selects or combines them. Escalate when the result depends on one specialized scaffold, opaque harness differences dominate, or the leaderboard presents a selected model-plus-harness score as a pure model score.

## Provenance Interpretation

Official, independent, vendor-reported, and self-reported results are provenance labels, not verdicts. Any of them can support ranking when the task, configuration, and source are attributable; several current serious systems have comparable rows; and the result distribution is coherent with other evidence.

Provenance becomes a material weakness when a claim is isolated, contradictory, impossible to audit, configuration-opaque, or presented as independently verified when it is not. Mirrors should not be counted as independent evidence, and duplicate rows should not be averaged merely because they appear on different sites.

A benchmark leader does not need to be the overall top-ranked Model Atlas model. Specialist capability, task fit, reasoning effort, and measurement noise can produce a legitimate ordering that differs from a broad ranking. Treat rank disagreement as adverse evidence only when stale or weak systems consistently lead, strong current systems consistently underperform, and no credible capability-specific explanation remains.

## Reasoning-Effort Sensitivity

When multiple reasoning efforts or budgets are available, compare them within the same base model. Higher effort should usually improve performance or reach a plateau. A material regression is a warning sign because it may reveal timeout pressure, verbosity penalties, brittle output rules, overthinking, over-engineered patches, or harness mismatch.

A regression does not automatically reject the benchmark. Inspect the affected tasks, grading rules, timeouts, allowed output format, and effort configuration before deciding whether the behavior reflects the capability being measured. Preserve effort-level observations rather than collapsing them into one synthetic best result.

## Merit and Adoption Readiness

Benchmark quality and ingestion readiness are separate decisions. Difficult access, missing structured data, unstable identifiers, or an unimplemented scraper can block adoption without making the benchmark itself low quality. Conversely, an easy-to-scrape leaderboard does not deserve ranking space unless the benchmark meets the capability and evidence standards.

A benchmark should not enter the portfolio until its scored metric, task version, units, aggregation, model identities, reasoning efforts, harness conditions, and source precedence are clear enough to maintain. When those operational requirements are missing, report them as adoption blockers rather than changing the merit judgment.

## Watchlist Requirements

A promising benchmark can remain outside the scoring portfolio while evidence develops. Watchlist status is not a fourth classification and contributes no score.

Before adoption, a watchlist benchmark should provide:

- a stable, structured leaderboard or reproducible result artifact
- attributable model and configuration identities
- documented task version, metric, units, and aggregation
- comparable harness conditions or explicit model-plus-agent interpretation
- current frontier coverage with non-saturated separation
- task-level outcomes, uncertainty, or run counts when stochasticity matters

## Reviewing Selected Benchmarks

Selected benchmarks must continue to earn their place. A retention review should examine source vitality and leaderboard quality before looking only at the rows that satisfy Model Atlas public-admission rules.

Use these portfolio-health verdicts:

| Verdict | Meaning |
| --- | --- |
| `keep` | The benchmark still supports its classification and adds credible ranking evidence. |
| `watch` | The source remains useful, but a material unresolved weakness needs follow-up. |
| `review` | The benchmark's classification or continued inclusion needs reconsideration. |

These verdicts describe portfolio health, not scoring classes. A benchmark under `watch` or `review` remains frontier or baseline until a separate portfolio decision changes it.

Retention reviews should inspect source leaders, current top-model coverage, overall and top-end spread, missing or quarantined rows, provenance caveats, reasoning-effort behavior, source availability, and uniqueness of the capability signal. Thin final-table coverage alone is not enough to escalate a benchmark; combine it with evidence such as stale leaders, source disappearance, genuinely missing evaluations, weak provenance, or consistently poor rank agreement without a credible specialist explanation.

Diagnose adverse signals before judging them. For each one, state what changed, the best-supported cause, and whether that cause weakens benchmark merit or only ingestion, identity matching, or observability. Display-label churn, aliases, and newly disclosed effort variants are not benchmark drift when the underlying evaluation remains represented.

## Final Decision

A benchmark review should lead with one of the three scoring classifications when the evidence supports a decision. Explain the capability measured, the strongest evidence for and against inclusion, the effect of harness and provenance, the benchmark's relationship to the current portfolio, and any adoption blockers.

If essential evidence is unavailable, name the missing evidence and the decision it prevents. Do not invent a fourth scoring class or convert uncertainty into false precision.
