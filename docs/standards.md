# Benchmark Standards

A useful benchmark changes what we can credibly say about current models. It needs a consequential task, a score with a clear interpretation, and results that distinguish relevant systems. This article explains how Model Atlas judges that evidence and why a difficult or popular evaluation can still be excluded.

The current portfolio, source precedence, metric selection, and scoring roles are documented in [Benchmarks](benchmarks.md).

## Capability Fit

Every accepted benchmark must measure at least one of two capabilities:

1. **Intelligence:** knowledge, perception, conceptual understanding, abstract reasoning, and judgment in difficult problems. Coding contributes when success requires substantial algorithmic, mathematical, scientific, or research reasoning beyond routine software implementation.
2. **Agentic ability:** reliably turning goals and specifications into working results through coding, instruction following, planning and coordinating actions, tool use, state management, verification, recovery, and persistence.

Coding benchmarks default to primarily Agentic evidence. Writing, modifying, migrating, testing, debugging, and delivering software measure the ability to carry specifications through execution, including when correctness is assessed only through the finished program.

Intelligence weight in a coding benchmark needs a specific reasoning justification: deriving a difficult algorithm, constructing a proof, building a scientific model, or solving a research problem. It can become the dominant weight when those demands drive success. Repository size, lengthy execution, difficult setup, or a scientific topic alone do not establish this kind of reasoning.

Ordinary compliance with a task prompt is common to every benchmark and does not make every benchmark Agentic. Instruction fidelity becomes Agentic evidence when the benchmark deliberately stresses and scores interdependent, conditional, implicit, conflicting, long-horizon, or state-dependent requirements. Likewise, merely running a verifier is not tool orchestration; the model must select or sequence actions, use feedback, manage state, or recover.

Loadings follow the work the model must do and the causes of success or failure. A final-output test can measure execution, instruction fidelity, or workflow reliability even without scoring intermediate actions. Mixed loading is appropriate when both substantive reasoning and reliable execution make a substantial difference to the outcome.

Five loading choices keep the judgment explainable and avoid pretending that incidental task mechanics can be measured with fine precision:

| Intelligence / Agentic | Meaning |
| --- | --- |
| 100% / 0% | Knowledge, understanding, or reasoning determines success; coding and workflow execution demands are negligible. |
| 75% / 25% | Intelligence dominates, with a material but secondary Agentic component. |
| 50% / 50% | Both capabilities independently and materially determine success. |
| 25% / 75% | Agentic ability dominates, with substantive Intelligence still required. |
| 0% / 100% | Coding execution, instruction fidelity, tool orchestration, or workflow completion determines success; no substantial additional reasoning demand earns Intelligence loading. |

A benchmark can reasonably put all its weight in one dimension. Any share assigned to the other dimension needs a justification in the work the task actually requires. Source provenance does not set capability loading.

If the benchmark does not add credible evidence about either capability, it does not belong in the ranking.

## Classification

Every benchmark receives exactly one scoring classification:

| Classification | Meaning |
| --- | --- |
| `frontier` | A current high-pressure stress test that meaningfully separates leading models. |
| `baseline` | A vetted benchmark that adds stable, important capability coverage. |
| `rejected` | A benchmark whose evidence does not justify a place in the ranking. |

There is no diagnostic scoring class. A benchmark may remain under review when essential evidence is unavailable, but it must not affect the ranking until it earns either frontier or baseline status.

Classification does not determine benchmark weight. Importance and dimension loading are separate portfolio decisions.

## Frontier Standard

A frontier benchmark exposes meaningful differences among the strongest current models. The best systems still have room to improve, and the gaps near the top are large or consistent enough to support a real comparison.

Strong frontier evidence usually has the following properties:

- difficult, serious tasks with fresh, protected, or contamination-resistant content
- credible grading, verification, or human evaluation
- current results from several leading models or model-plus-agent systems
- visible headroom or meaningful separation near the top
- a capability that matters outside the benchmark format
- enough methodological detail to interpret what a score represents

A specialist or private benchmark can qualify with relatively few results when they cover strong current systems, the tasks are credible, and the gaps are informative. Sparse coverage raises the burden of proof: readers need enough evidence to distinguish a real capability signal from an isolated or unauditable claim.

Frontier status is not permanent. Saturation, contamination, stale coverage, or a stronger replacement can remove a benchmark's frontier pressure. Baseline status remains appropriate if the surviving evidence still adds useful capability coverage; otherwise, the benchmark no longer earns ranking space.

## Baseline Standard

A baseline benchmark need not be the hardest current stress test. It earns ranking space by providing reliable capability coverage that would otherwise be missing or unstable.

Useful baseline evidence can cover expert knowledge, factual precision, professional reasoning, long-context understanding, scientific programming, document analysis, specialist domains, and work-like execution. Current model coverage, credible grading, interpretable score spread, and a clear relationship to Intelligence or Agentic ability remain necessary.

A benchmark belongs in baseline when its signal remains valuable but one or more factors make a frontier claim too strong. Common reasons include narrower scope, modest top-model separation, greater contamination exposure, limited result volume, or deliberate use as a broad aggregate or stabilizer.

A baseline benchmark contributes breadth or stability. It can remain valuable even when it supplies less information about the differences between the strongest current models.

## Rejection Standard

A benchmark is rejected when its evidence does not deserve ranking space, whether it is a new candidate or an existing portfolio member.

Common reasons include:

- frontier systems are saturated or tightly clustered near the ceiling
- the tasks are stale, public, memorized, or highly exposed to contamination
- the format mostly rewards trivia, keyword matching, artificial patches, or benchmark-specific tricks
- grading is underspecified, uncalibrated, subjective without safeguards, or easy to exploit
- materially different configurations are presented as directly comparable model scores
- the benchmark primarily measures safety or policy behavior rather than capability
- the signal duplicates a stronger selected benchmark without adding meaningful coverage
- serious current models are absent and the remaining rows cannot establish present-day relevance
- the only evidence is an isolated, contradictory, or unauditable claim
- the score lacks a stable capability interpretation

Realistic tasks do not rescue a saturated benchmark. Difficulty does not rescue a contaminated benchmark. Familiarity does not justify retaining a signal that a better benchmark already measures.

## Review Evidence

Primary sources are the basis for judging a benchmark wherever they are available. Different artifacts reveal different parts of the evaluation:

- the official leaderboard and result artifacts
- the paper, technical report, or methodology page
- the official repository and dataset card
- sample tasks and complete task instructions
- scoring rules, rubrics, judges, verifiers, and aggregation logic
- current model results with configuration and effort details
- uncertainty, run counts, or task-level distributions when published

When samples are accessible, a review includes close inspection of at least two real tasks. The tasks and their complete instructions reveal what the model actually has to do, which capabilities success requires, and what shortcuts the evaluation permits. An abstract or product page can describe an ambition without showing whether the tasks realize it.

Private tasks can reduce exposure to training leakage, but readers have fewer ways to inspect them. That trade-off raises the burden on published methodology, grading, result distributions, provenance, and independent validation. Privacy alone establishes neither quality nor invalidity.

## Interpreting the Evidence

The evidence has to connect the task, the score, and the comparison being made. These dimensions explain why a benchmark can look convincing in one respect and still provide weak ranking evidence overall.

### Capability

Capability fit starts with the work the model performs and the demands that determine success. Those demands establish whether the result measures Intelligence, Agentic ability, or both. A benchmark's subject, name, or presentation cannot establish the loading on its own.

Authentic, serious, cognitively meaningful tasks make the result worth understanding. Ranking space also depends on whether the measured capability is broad, important, or sufficiently distinct. A narrow evaluation can be valuable when it captures consequential work that broader benchmarks miss.

### Difficulty and separation

Difficulty concerns how much current leading models still struggle; separation concerns how much the results tell them apart. The overall score spread can be large because older models perform poorly while the strongest systems are nearly tied. Frontier evidence therefore depends on both the full distribution and the gaps near the top.

Task-level results, repeated runs, and confidence intervals help distinguish a stable advantage from measurement noise. A visible leaderboard gap is weak evidence when small changes in the sampled tasks or runs routinely reverse it.

### Measurement quality

The scored outcome and the grading method determine what a result means. Deterministic checks, executable verifiers, human judgment, model judgment, and mixed grading each need enough detail for readers to understand their decisions. Specific rubrics and transparent aggregation make it possible to trace a reported score back to the work being assessed.

Measurement weakens when formatting, verbosity, policy behavior, or benchmark-specific tactics dominate the result without representing the intended capability. A difficult task still needs a grading rule that rewards the relevant success and recognizes the relevant failure.

### Contamination and task integrity

Task access and maintenance affect whether a result reflects new problem solving or prior exposure. Public, private, refreshed, generated, and protected evaluations offer different defenses against memorization and training leakage. Clear separation between training, development, and evaluation materials is part of that evidence.

Task reuse, exposed answers, or benchmark-aware tuning can undermine the interpretation even when the reported score is accurate. Protection matters because it supports a claim about capability on unfamiliar work; the label alone does not establish that protection.

### Comparability

A result belongs to a model version and an evaluation configuration. Disclosed reasoning effort, budgets, tools, and inference settings make differences between rows interpretable. For explicitly coding benchmarks, multiple harnesses for one model configuration remain distinguishable, with any aggregation governed by a disclosed rule.

For stochastic outcomes, repeated runs or uncertainty estimates help establish how much confidence a comparison deserves. An apparent advantage may depend on the configuration or a fortunate run rather than a stable difference between models.

### Provenance and vitality

Attributable sources make it possible to trace important results and distinguish official, independent, vendor-reported, self-reported, and mirrored evidence. These labels describe the origin of a result; its credibility also depends on the disclosed tasks, configurations, and surrounding results.

A leaderboard's continuing relevance depends on coverage of serious current models and a source maintained well enough for ongoing review and ingestion. A once-informative evaluation can lose that relevance even when its historical results remain valid.

### Portfolio value

Portfolio value depends on what the benchmark adds to the selected evidence. It can fill a capability gap, stabilize an important comparison, or provide a stronger and more auditable measure than an existing benchmark.

Redundant evidence needs a reason to occupy ranking space. Adding another score for a capability already measured well can increase the input count without improving the comparison, especially when the new result is weaker or harder to audit.

## Harness Provenance

Harness identity remains part of the source data so a result can be traced to its evaluation setup. It does not determine capability loading. Its role in portfolio policy is limited to explicitly coding benchmarks that report multiple harnesses for the same model configuration: those rows remain distinct unless the benchmark defines a transparent aggregation rule.

## Provenance Interpretation

Official, independent, vendor-reported, and self-reported describe where a result comes from. Inclusion still depends on attributable tasks and configurations, comparable rows from serious current systems, and a coherent result distribution.

Provenance becomes a material weakness when a claim is isolated, contradictory, impossible to audit, configuration-opaque, or presented as independently verified when it is not. A mirror republishes existing evidence; it does not supply an independent result. Duplicate rows therefore receive no extra weight and are not averaged merely because they appear on different sites.

A specialist benchmark can legitimately rank models differently from a broad capability score. Task fit, reasoning effort, and measurement noise can explain some disagreement. It becomes adverse evidence when stale or weak systems repeatedly lead, strong current systems repeatedly underperform, and the benchmark offers no credible capability-specific explanation.

## Reasoning-Effort Sensitivity

Comparing efforts within one base model helps reveal what a benchmark rewards. Additional effort is generally expected to help or plateau, while the scorer preserves the measured ordering. A large performance regression at higher effort can reflect timeouts, verbosity penalties, brittle output rules, overthinking, or elaborate patches. The regression is a reason to examine the evaluation; it does not justify forcing higher effort to win in the scorer.

A regression does not automatically disqualify the benchmark. The affected tasks, grading rules, timeouts, allowed output format, and effort configuration provide the evidence for deciding whether the behavior reflects the capability being measured. Keeping effort-level observations separate preserves this information; a synthetic best result would hide the behavior that needs explanation.

## Merit and Adoption Readiness

A benchmark's merit and the ability to ingest it are separate judgments. Access restrictions, unstable identifiers, missing structured data, or unfinished scraper support can block adoption without weakening the tasks themselves. Easy access also does not make a weak benchmark useful. Keeping these judgments separate prevents implementation convenience from deciding the portfolio.

Portfolio entry requires a maintainable definition of the scored metric, task version, units, aggregation, model identities, reasoning efforts, and source precedence. Missing operational requirements are adoption blockers. They describe limitations in using the results while preserving the separate judgment of benchmark merit.

## Watchlist Requirements

A promising benchmark can remain outside the scoring portfolio while evidence develops. Watchlist status is not a fourth classification and contributes no score.

The evidence needed for adoption includes:

- a stable, structured leaderboard or reproducible result artifact
- attributable model and configuration identities
- documented task version, metric, units, and aggregation
- comparable model configurations
- current frontier coverage with non-saturated separation
- task-level outcomes, uncertainty, or run counts when stochasticity matters

## Reviewing Selected Benchmarks

Selected benchmarks continue to earn their place through the quality and relevance of their evidence. Retention starts with the source leaderboard and its vitality. Looking only at rows that pass Model Atlas public-admission rules can hide useful source evidence or confuse publication filters with benchmark weakness.

Portfolio health is described by three verdicts:

| Verdict | Meaning |
| --- | --- |
| `keep` | The benchmark still supports its classification and adds credible ranking evidence. |
| `watch` | The source remains useful, but a material unresolved weakness needs follow-up. |
| `review` | The benchmark's classification or continued inclusion needs reconsideration. |

These verdicts describe portfolio health, not scoring classes. A benchmark under `watch` or `review` remains frontier or baseline until a separate portfolio decision changes it.

A retention review examines source leaders, current model coverage, overall and top-end spread, missing or quarantined rows, provenance, effort behavior, availability, and the capability added. Thin coverage in the final public table needs an explanation before it becomes a verdict. Stale leaders, disappearing sources, genuinely missing evaluations, weak provenance, or unexplained ordering problems are stronger reasons to investigate.

An adverse signal is meaningful only in context: what changed, the best-supported cause, and whether that cause weakens benchmark merit or affects only ingestion, identity matching, or visibility into the data. Display-label changes, aliases, and newly disclosed effort variants do not establish benchmark drift when the underlying evaluation remains represented.

## Final Decision

A final decision has one of three scoring classifications: frontier, baseline, or rejected. Its rationale connects the measured capability, the strongest evidence for and against inclusion, result provenance, and the benchmark's contribution to the current portfolio. Adoption blockers remain explicit so readers can distinguish a judgment about the evaluation from a limitation in using its results.

When essential evidence is unavailable, the decision remains unresolved, with the missing evidence and the conclusion it prevents made explicit. That uncertainty creates no fourth scoring class and does not justify adding a new candidate to the ranking.
