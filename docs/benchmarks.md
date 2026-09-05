# Benchmark Portfolio

A benchmark earns its place by adding credible information about model capability. This reference records the selected evaluations, their weights, the reasons for including them, and the source policies that keep results comparable. [Standards](standards.md) explains the selection criteria; [Methodology](methodology.md) explains how the results become scores.

## Scoring Roles

Task benchmarks have either a `frontier` or `baseline` role; aggregate indexes are listed separately. These labels explain why an input is useful. Importance and dimension loading determine its numerical influence, and the label itself changes neither weight nor the treatment of missing evidence. Rejected and watchlist benchmarks contribute no score.

The ranking has two quality dimensions:

| Dimension | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Knowledge, perception, conceptual understanding, abstract reasoning, and judgment in difficult problems | Benchmarks with a non-zero Intelligence loading |
| Agentic | Reliable execution of goals and specifications through coding, instruction following, planning, tool use, state management, verification, recovery, and completion | Benchmarks with a non-zero Agentic loading |

Writing, modifying, testing, debugging, and delivering software primarily test Agentic ability. A coding benchmark earns Intelligence weight when difficult algorithmic, mathematical, scientific, or research reasoning substantially determines success. A scientific topic or a difficult environment alone does not establish that demand. The task and its failure modes determine the loading; a final-output grader or harness name does not.

### Portfolio Settings

| Setting | Role |
| --- | --- |
| Group | Classifies the benchmark as `frontier` or `baseline` for portfolio interpretation |
| Importance | Controls the benchmark's total influence relative to other observed benchmarks |
| Dimension loading | Allocates that importance between Intelligence and Agentic; the two loadings sum to 100% |

The importance $i_b$ describes a benchmark's overall influence, and its loading $\lambda_{b,d}$ assigns a share to dimension $d$. Their product gives the effective weight $\omega_{b,d}=i_b\lambda_{b,d}$. For example, importance 2 with 25% Intelligence and 75% Agentic loading gives weights 0.5 and 1.5. The benchmark keeps its total importance rather than receiving full weight in both dimensions.

Loadings use the five-level scale in [Standards](standards.md): 100/0, 75/25, 50/50, 25/75, or 0/100. This keeps the judgment coarse enough to explain. Coding tasks are primarily Agentic evidence; an Intelligence share depends on substantial reasoning in the task's actual demands.

The decisions below apply that distinction. Software delivery is primarily Agentic; difficult program semantics, vulnerability diagnosis, or architecture can add an Intelligence component. Algorithm design, formal mathematics, and scientific research can justify stronger Intelligence weight.

Each table records the capability being measured and the reason for its weight. The source policies below specify which observations and task resources are eligible.

### Resource Quality Coordinates

Every benchmark whose task time or cost can enter Speed or Value declares how its quality value is positioned inside resource-comparison neighborhoods. `Logit` is limited to probability-like success, pass, accuracy, or completion rates. `Linear` preserves spacing for native scales and composites that do not have remaining-error probability semantics.

Direct same-benchmark tokens also use these coordinates for the [Agentic token modifier](methodology.md#agentic-token-efficiency) when the benchmark has a non-zero Agentic loading. AA aggregate output tokens use a linear coordinate for its own Intelligence Index only; index membership never supplies token evidence to constituent or cross-index benchmarks.

| Benchmark | Coordinate | Decision |
| --- | --- | --- |
| Agents' Last Exam | Linear | Partial-credit performance is a graded task score, not a binary completion probability. |
| ALE-Bench | Linear | Native Performance can exceed 100 and must retain its full spacing. |
| AnalystAgent | Logit | Pass^5 is a bounded strict workflow-success rate. |
| APEX Agents | Logit | Loop Pass@1 is a bounded task-completion rate. |
| ARC-AGI-2 | Logit | Task success is a bounded correctness rate with meaningful remaining error. |
| ARC-AGI-3 | Linear | Human-relative action efficiency is a continuous efficiency ratio, not a completion probability. |
| AutomationBench | Logit | Strict task completion is a bounded workflow-success rate. |
| Briefcase | Linear | The 0-1 value is a linear normalization of Elo, not probability. |
| CritPt | Logit | The score is a bounded correctness rate with meaningful remaining error. |
| CursorBench | Linear | The published grading score is a composite rather than a completion probability. |
| DeepSWE | Logit | Pass@1 is a bounded task-completion rate. |
| FrontierCode | Linear | The versioned `new_score` is a grading composite. |
| GDPval-AA v2 | Linear | The page Elo is normalized onto the benchmark's 0-1 scale before use as a professional-work grading composite. |
| HLE | Logit | Accuracy is a bounded correctness rate. |
| ITBench | Linear | Average precision at full recall is used as a ranking metric, not interpreted as task-success probability. |
| SciCode | Logit | The source score is a bounded scientific-code correctness rate. |
| tau3 Banking | Logit | The score is a bounded workflow-success rate. |
| Terminal-Bench 4.0 | Logit | Task accuracy is a bounded completion rate with meaningful remaining error. |
| Terminal-Bench-Science 0.1 | Logit | Resolution rate is a bounded task-completion probability with meaningful remaining error. |

### Indexes

An aggregate index summarizes several evaluations. It offers broad coverage, but its components can overlap selected tasks and its source controls the aggregation. Keeping indexes separate makes that limitation visible.

| Index | Group | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | --- | ---: | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because the source mixes reasoning, knowledge, coding, and agent evaluations under source-owned aggregation that cannot be decomposed consistently; half importance limits its overlapping influence. |
| Epoch Capabilities Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because the source-owned mix and component count are not recoverable per model row; half importance limits the uncertainty. |
| Surge Intelligence Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because professional reasoning, writing, and agent evaluations are aggregated under incompatible source scales; half importance limits overlap. |
| Vals Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because finance, legal, and coding tasks mix domain reasoning with execution without recoverable component weights; the opaque aggregate is not reweighted from its coding label alone. |

When direct task coverage is incomplete, observed aggregate indexes stand in for broader capability evidence. Their represented counts are 9 for Artificial Analysis, 8 for Epoch, 8 for Surge, and 7 for Vals; Epoch uses the median of the other three because its per-model component count is unavailable. Tasks retain their ordinary effective weights. At complete task coverage, indexes return to importance 0.5 and their configured loadings. Represented breadth changes the quality estimate, not the number of independent observations or the displayed evidence share.

### Frontier Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Agent&nbsp;Arena | 1 | 0% | 100% | Randomized Agent Mode sessions directly measure the orchestrator model's effect on successful completion, steerability, bash recovery, and tool reliability. The intended construct is Agentic, while domain reasoning is incidental to the sampled tasks. |
| Agents'&nbsp;Last&nbsp;Exam | 1 | 25% | 75% | Long software and professional tasks deliberately stress instruction fidelity, tool use, recovery, and completion, while partial-credit grading preserves a secondary contribution from solution quality and domain reasoning. |
| ALE-Bench | 1 | 75% | 25% | Difficult heuristic optimization and algorithm design justify the Intelligence-heavy exception to the coding default. Implementing, running, and improving candidates through feedback contributes the secondary Agentic loading. |
| AnalystAgent | 1 | 75% | 25% | Correct quantitative analysis of supplied spreadsheets and documents is the primary construct. Choosing code and document operations contributes a secondary Agentic component, and published per-task resources can feed Speed and Value. |
| APEX&nbsp;Agents | 1 | 25% | 75% | Long-horizon professional-services tasks deliberately stress complex instructions, workplace-tool coordination, and persistent completion. Professional judgment remains a substantive secondary requirement. |
| ARC-AGI-2 | 1 | 100% | 0% | Novel abstract visual transformations provide a protected frontier test of fluid reasoning. The current semi-private leaderboard has strong separation across serious systems, while its fixed demonstration-to-answer protocol is Intelligence evidence rather than external workflow execution. |
| ARC-AGI-3 | 1 | 50% | 50% | Rule discovery and predictive world-model construction and persistent action, feedback use, state management, and recovery independently determine success. The score is explicitly model-plus-harness evidence under the official aggregation policy below. |
| AutomationBench | 1 | 0% | 100% | Zapier's official strict-completion metric tests whether a model leaves simulated SaaS applications in the fully required final state. Comparable standalone per-task cost can affect Value; combined fallback systems are excluded. |
| Blueprint-Bench&nbsp;2 | 1 | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | 1 | 50% | 50% | Multi-file professional projects score both the quality and correctness of substantive deliverables and reliable coordination of interdependent instructions and artifacts. Neither capability is merely incidental. |
| Chartography | 1 | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. It is a current Intelligence-only stress test with meaningful frontier spread. |
| Code Migration | 1 | 25% | 75% | Porting, building, testing, and delivering working programs primarily measure coding execution. Reasoning about cross-language semantics and subtle behavioral equivalence retains a secondary Intelligence loading, and current results retain substantial headroom. Endpoint latency remains part of the delivery constraint. |
| ComplexConstraints | 1 | 25% | 75% | The intended construct is fidelity to many interdependent, conditional, implicit, and multistep requirements, measured by all-criteria task pass. Tools are unnecessary for Agentic loading because complex instruction fidelity is itself the primary Agentic capability; planning quality is secondary. |
| CritPt | 1 | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| CursorBench | 1 | 25% | 75% | Completing ambiguous, multi-file repository changes primarily measures coding execution, instruction fidelity, and verification. Architectural reasoning about interactions across the codebase retains a secondary Intelligence loading. |
| DeepSWE | 1 | 25% | 75% | Repository-level implementation, testing, and delivery of a correct committed patch primarily measure Agentic ability. Difficult program analysis and algorithmic changes retain a secondary Intelligence loading. |
| EBR-Bench | 1 | 25% | 75% | Repeated play measures exploration, learning from feedback, persistent notes, and stateful adaptation. Models remain far below expert human performance, and the task's distinct unsolved capability earns ordinary task-level importance. |
| EMB | 1 | 75% | 25% | Correct financial-model construction and professional judgment dominate the score. Coordinating spreadsheet operations and multi-step requirements adds a secondary Agentic component. |
| FrontierCode | 1 | 25% | 75% | Producing mergeable repository changes primarily measures reliable coding execution, constraint following, and verification. Architectural and algorithmic reasoning needed for difficult maintainer-defined tasks retains a secondary Intelligence loading. |
| FrontierMath Erdős | 0.5 | 75% | 25% | Verified resolution of open Erdős problems is exceptional mathematical-research evidence with substantial Lean execution demands. Near-binary current results, one attempt per problem, stochastic long-running agents, and overlap with FrontierMath Tier 4 justify exceptional half importance. |
| FrontierMath Tier 4 | 1 | 100% | 0% | Epoch's hardest private FrontierMath tier is a current specialist mathematical-reasoning stress test. |
| GDP.pdf | 1 | 100% | 0% | Dense page-grounded rubrics measure professional document interpretation and judgment. PDF access is an input medium, not an independently scored Agentic capability. |
| GDPval-AA&nbsp;v2 | 1 | 75% | 25% | The quality of professional deliverables across economically important occupations is primary. Longer tool, file, and web trajectories add a secondary Agentic component when they materially support completion. |
| HANDBOOK.md | 1 | 25% | 75% | Enterprise tasks deliberately stress sustained policy adherence, long-context instructions, internal tools, and external MCP coordination. Domain reasoning is substantial but secondary to reliable constrained execution. |
| HLE | 1 | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| ITBench | 1 | 75% | 25% | Identifying every contributing Kubernetes root cause primarily measures diagnosis across complex technical evidence. Navigating investigation data and validating hypotheses adds a secondary Agentic component. |
| Legal Research | 1 | 50% | 50% | Legal interpretation and synthesis and the reliable orchestration of retrieval and research tools independently determine strict all-pass success. Current results retain frontier headroom and separation. |
| MirrorCode | 1 | 25% | 75% | Sustained whole-program reconstruction through documentation, black-box probing, implementation, and exhaustive testing primarily measures Agentic delivery. Inferring hidden behavior and program structure supplies secondary Intelligence evidence. |
| MLS-Bench Lite | 1 | 75% | 25% | Machine-learning method design and improvement quality dominate across 30 controlled tasks. Iterative experimentation, feedback use, and validation in the five-hour environment add a secondary Agentic component. |
| ProgramBench | 1 | 25% | 75% | Reconstructing programs through executable probing, implementation, compilation, and testing primarily measures Agentic ability. The selected Almost Resolved rate requires at least 95% of hidden tests to pass, while inferring hidden program semantics retains a secondary Intelligence loading. |
| Riemann-bench | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| SRE Bench | 1 | 25% | 75% | Binary reverse engineering across protected programs primarily measures investigation, tool use, reconstruction, and verified execution. Inferring hidden semantics and protections supplies secondary Intelligence evidence, while deterministic grading and substantial headroom support frontier use despite sparse model coverage. |
| Terminal-Bench 4.0 | 1 | 25% | 75% | Difficult containerized tasks deliberately require instruction fidelity, terminal-tool orchestration, state inspection, self-verification, and recovery. Technical reasoning is substantive, but the scored construct is primarily reliable workflow execution rather than coding. |
| Terminal-Bench-Science 0.1 | 1 | 75% | 25% | Scientific formulation and research-level analysis justify the Intelligence-heavy exception to the coding default. Implementing methods, coordinating terminal tools, and verifying results contribute the secondary Agentic loading. |

### Baseline Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| BrowseComp | 1 | 50% | 50% | Finding and synthesizing difficult web evidence requires both substantive research reasoning and deliberate browsing, query selection, and feedback use. Public tasks and less frontier-like top spread keep it baseline. |
| Chess Puzzles | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| CyberBench | 1 | 25% | 75% | The selected Patch track supplies the crash input and sanitizer report, then requires editing, compiling, and validating a repair without breaking valid behavior. That workflow is primarily Agentic, with memory-safety and vulnerability diagnosis providing secondary Intelligence evidence. |
| EnterpriseBench CoreCraft | 0.5 | 25% | 75% | Simulated-company tasks primarily measure instruction fidelity, workplace-tool coordination, and reliable workflow completion. Business reasoning is secondary, while one environment, first-party judges, and portfolio overlap keep it half importance. |
| Finance Agent V2 | 1 | 50% | 50% | Financial reasoning and calculation and reliable filing retrieval, research, and tool use independently determine strict all-pass success. Its focused financial domain makes it stabilizing baseline evidence. |
| Hemingway-bench | 1 | 75% | 25% | Writing quality, originality, coherence, and emotional intelligence dominate expert preference. Explicit instruction adherence contributes a secondary Agentic component, while the relative Elo scale and focused domain keep it baseline. |
| Omniscience | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to distinguish the frontier leaders. |
| PerceptionBench | 1 | 100% | 0% | Short-answer questions isolate ten atomic visual capabilities across 3,000 verified examples. The narrow multimodal focus provides distinctive Intelligence breadth, while creator-run configurations and an automatic judge keep it baseline rather than a frontier missing-data claim. |
| ProofBench | 1 | 100% | 0% | Mathematical reasoning and construction of a valid Lean proof are the scored construct. Compilation verifies the artifact, and the remaining spread across current general models still adds useful baseline evidence despite near-ceiling leaders. Its inclusion ends when comparable current models cluster at the ceiling. |
| Public Benefits Bench | 1 | 50% | 50% | Policy interpretation and case reasoning and reliable research and workflow completion independently determine success. Its focused domain keeps it baseline. |
| SciCode | 1 | 100% | 0% | Scientist-curated problems require substantive scientific knowledge and mathematical formulation to derive the solution. Those demands justify the Intelligence exception; the fixed function-completion protocol provides little independent workflow evidence. |
| SimpleQA Verified | 1 | 100% | 0% | Broad factual recall under Epoch's current anti-abstention methodology adds general-knowledge coverage distinct from Omniscience's professional-domain focus. Public static questions and exposure risk keep it baseline. |
| tau3&nbsp;Banking&nbsp;(AA) | 1 | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It remains useful domain workflow evidence, but its current rank agreement and tight top spread make it a stabilizing baseline signal rather than a frontier separator. |
| Toolathlon | 1 | 0% | 100% | Multi-tool workflow execution across files, APIs, business applications, and other external environments. Selecting and coordinating external tools through long-horizon tasks is the intended construct, so the signal is fully Agentic; limited current row count and provenance keep it baseline. |
| Vending-Bench&nbsp;2 | 1 | 25% | 75% | Year-long simulated business operation deliberately measures sustained tool use, state management, negotiation, and coherence over thousands of messages. Business judgment is secondary, while small run counts and stochastic outcomes keep it baseline. |
| Vibe Code | 1 | 0% | 100% | Building working applications from specifications measures coding execution, service integration, state management, testing, recovery, and completion. The task design does not establish a separate exceptional algorithmic or scientific reasoning demand, so ordinary application construction stays fully Agentic. |
| WeirdML | 1 | 75% | 25% | Model selection and experimental reasoning across novel datasets justify the Intelligence-heavy exception to the coding default. Implementing experiments and responding to validation feedback contributes the secondary Agentic loading. |

## Watchlist

Watchlist benchmarks remain outside the scoring portfolio. Time Horizon Index is currently non-scoring because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard required by [the standards](standards.md).

## Rejected Benchmarks

**Harvey LAB / HLAB** is excluded from scores and task resources in its current form. Its all-criteria task score turns any failed rubric item into a whole-task failure, amplifying rubric choices and LLM-judge disagreement into unstable model ordering. The legal tasks remain promising, and unexpected rankings were a reason to inspect the method rather than independent grounds for rejection. Reconsideration requires evidence on the current held-out evaluation showing stable per-judge rankings and human adjudication of borderline failures.

## Evidence Rules

### Compatibility and Defaults

Combining results is justified only when they refer to compatible tasks and versions, metrics, scoring protocols, units, aggregation, model identities, and reasoning efforts. For explicitly coding benchmarks, different harness rows remain distinct unless the benchmark defines how to aggregate them.

A source crosswalk is eligible only after validation on overlapping results, with an explicit precedence rule for duplicates. Repeated mirrors do not create new evidence, so they are not averaged. Measurements from different methods stay separate unless a benchmark policy explicitly defines a valid combination.

An unlabelled configuration is the source default. If every configuration names an effort, the highest reported effort supplies the default as one complete observation. Individual effort rows still belong to their matching variants. Choosing one complete observation prevents a synthetic default assembled from the best field in each row.

### Shared Inputs

**Artificial Analysis** supplies its aggregate index and index-level resources from the main model table. Selected task-level AA benchmarks instead use their dedicated evaluation pages; unselected main-table fields, including `coding_index`, remain source context only.

**OpenRouter** supplies current route pricing and provider speed measurements used for blended price and the provider serving-performance components. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

## Aggregate Index Policies

**Artificial Analysis Intelligence Index** uses the published aggregate directly. Its overlap with selected task benchmarks makes it one fallback observation rather than nine independent observations; its resource facts are retained but do not separately affect Speed or Value.

**Epoch Capabilities Index** uses the published ECI value directly.

**Surge Intelligence Index** uses the published aggregate directly. It remains fallback evidence, and the absence of a reproducible index-level resource contract keeps it out of Speed and Value.

**Vals Index** uses the overall percentage directly. Its proprietary mix of non-public Vals datasets and public coding benchmarks makes it aggregate fallback evidence, while its cost and latency lack a comparable task-level aggregation and remain outside Speed and Value.

## Benchmark Source Policies

Only non-default source, metric, selection, exclusion, and resource rules are detailed below. The portfolio tables remain authoritative for capability, class, importance, and dimension loading.

### Shared Source Families

**Artificial Analysis benchmark family:** AnalystAgent, APEX Agents, Briefcase, CritPt, GDPval-AA v2, HLE, ITBench, Omniscience, SciCode, and tau3 Banking use their dedicated evaluation pages for both scores and any eligible resources. The shared model table does not supply their task-level scores.

AnalystAgent uses headline pass^5 across 80 private questions; its published totals are normalized per question before resource scoring. APEX Agents uses Artificial Analysis when available, with Mercor Loop Pass@1 as a same-model-and-effort fallback only after the [validated additive source crosswalk](methodology.md#validated-additive-source-crosswalk) reaches three effective overlap and held-out models with median absolute error at most `0.02`; projections are clamped to `[0,1]`.

Briefcase and GDPval-AA v2 retain raw page Elo but normalize it with `clamp((Elo - 500) / 2000)` for scoring and linear resource comparison. GDPval may use the main-table normalized value as a compatible fallback after overlap validates the conversion. ITBench divides aggregate cost and tokens by 177 task runs, and SciCode divides them by 288 task runs.

**ARC Prize benchmark family:** ARC-AGI-2 and ARC-AGI-3 use only the official verified semi-private leaderboard and discard public-demo, community, competition, custom, refinement, and synthesis systems. ARC-AGI-2 uses task success and reported task cost. These costs affect Value only within their respective benchmarks.

**Epoch benchmark family:** FrontierMath Tier 4, FrontierMath Erdős, Chess Puzzles, EBR-Bench, MirrorCode, and SimpleQA Verified use successful runs from Epoch's bulk benchmark data. FrontierMath Tier 4 is restricted to the exact v2-private task. MirrorCode accepts only `mirrorcode-ml-2l-*` runs for the ML, private-tests, two-language configuration. SimpleQA Verified accepts only task version 1.2.0 under the `SimpleQA Verified (anti-abstention)` method and excludes the source-flagged `qwen3-max-2025-09-23` row.

**Surge benchmark family:** Chartography, ComplexConstraints, HANDBOOK.md, and EnterpriseBench CoreCraft use published percentages; ComplexConstraints uses all-criteria task pass. Hemingway-bench retains its expert-preference Elo rather than converting it to a percentage, and Surge page-local resources do not affect Speed or Value.

**Vals benchmark family:** Legal Research, EMB, Code Migration, Vibe Code, and Public Benefits Bench use `overall`; Finance Agent V2 uses `all_pass`, ProgramBench uses `almost`, SRE Bench uses `partial`, and CyberBench uses the `patch` track. ProgramBench `almost` is the share of tasks passing at least 95% of hidden behavioral tests. SRE Bench `partial` is its Capability Score across 1,572 objectives in 262 binary instances; its Fully Solved rate remains supporting context. Vals cost and latency remain outside Speed and Value, and these benchmarks are not Time Horizon evidence.

ProofBench uses Vals' compiler-verified overall accuracy, excludes the specialized `aristotle/aristotle` system, and uses Epoch overlap only as provenance validation rather than additional evidence.

### ARC-AGI-3 Harness Policy

ARC-AGI-3 uses human-relative action efficiency over 55 semi-private environments per official harness. Standard uses provider-neutral text history and visible persistent notes; Provider Adapter uses provider-native continuous conversation, opaque reasoning state, and context compaction. Raw Standard and Provider Adapter rows remain separately attributable. For each exact base model and reasoning effort, the canonical score is their arithmetic mean when both are present and the single observed score when only one is present; missing harnesses are never imputed. Canonical resources sum the same component-run totals and divide by 55 environments per included harness. Current Provider Adapter coverage is limited to GPT-6 Astra, so its blended score must be interpreted as model-plus-harness interactive reasoning and execution rather than intrinsic intelligence.

### FrontierMath Erdős Policy

FrontierMath Erdős accepts only the fixed Epoch task `FrontierMath-Erdos`: one official attempt for each of 68 conjectures under the published 72-hour scaffold, with success requiring a complete Lean proof or disproof that Comparator replays against the trusted statement. Higher-budget repetitions, changed agents, and alternate scaffolds are excluded. The benchmark is admitted as a sparse breakthrough signal despite near-binary current results, and half importance limits instability from one attempt per problem, long-running stochastic agents, and overlap with FrontierMath Tier 4. Zero means no verified resolution under this scaffold rather than no mathematical capability. The August 2026 problem set remains the common denominator for current clean comparisons. Any future exclusion of publicly solved conjectures requires an explicit shared denominator; changing each model's task set separately would break comparability.

### Standalone Policies

**Agent Arena** uses the published Net Improvement point estimate directly as the raw benchmark value. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so Model Atlas applies its ordinary observed per-benchmark min-max normalization without a sigmoid transform.

**Agents' Last Exam** uses `max(median_score, mean_score)` from the Full Overall split because partial-credit score is more informative than pass-rate accuracy. Resource totals are divided by evaluated task count, and displayed resources use the lower of the resulting median and mean per-task values.

**ALE-Bench** uses Sakana AI's complete leaderboard, with Epoch's overlapping rounded table only as a scale validator. The `num_self_refine = 1` all-task mean Performance is the scoring row and remains linear for resource comparison so values above 100 retain their spacing. Mean per-task cost can affect Value; submitted-program execution time and memory remain source context.

**Blueprint-Bench 2** uses normalized connectivity similarity; Andon's internal identifiers are not model-matching inputs.

**AutomationBench** uses Zapier's official `task_completed_correctly` rate, which requires every final-state assertion for a task to pass. Partial credit remains diagnostic only. Model-effort rows remain distinct, combined fallback systems are excluded from standalone assignment, and only the official row's comparable per-task cost can affect Value.

**CursorBench** uses the source-default row or, when every row is effort-labelled, the highest reported effort as one complete observation. Grok 4.5 remains raw but non-scoring because Cursor discloses possible benchmark-snapshot training overlap; private Composer models are excluded because they are not independently available. Eligible per-task cost and tokens can affect Value and Speed.

**DeepSWE** uses pass@1 and one complete source-default or highest-labelled-effort observation per model. Mean duration and cost can affect Speed and Value; mean output tokens can supply the task-time fallback and the quality-adjusted Agentic token modifier.

**FrontierCode** uses Cognition 1.1 Main `new_score`; Main per-task cost can affect Value and token averages can supply Speed's task-time fallback. Explicit efforts match only their variants, the default follows the ordinary highest-labelled-effort rule, and proprietary SWE-1.7 and Composer 2.5 rows remain non-scoring.

**GDP.pdf** uses the reported percentage directly as its normalized benchmark score.

**MLS-Bench Lite** uses baseline-normalized Performance across the 30-task Lite suite under Harbor's fixed five-hour budget. No MLS-Bench resource field affects Speed or Value.

**Omniscience** uses Accuracy from its dedicated Artificial Analysis evaluation page rather than the main model table.

**PerceptionBench** uses creator-published overall accuracy across 3,000 verified questions. Published effort and fallback disclosures remain provenance; component accuracies and resources do not enter scoring.

**Riemann-bench** uses the normalized public percentage directly.

**Terminal-Bench 4.0** uses task accuracy over 66 tasks with five trials per task and retains every model-effort-agent row with its confidence interval. Scoring selects the highest-accuracy agent for each exact model effort, breaking ties by narrower confidence interval; agent identity remains provenance and does not set capability loading. Each row's total cost and tokens are normalized across 330 trials before affecting Value and Speed.

**Terminal-Bench-Science 0.1** uses overall resolution rate across 70 tasks with three trials each. Agent identity remains provenance and does not affect matching or capability loading; total cost and tokens are normalized across 210 trials before affecting Value and Speed.

**Toolathlon** uses the reported score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

**Vending-Bench 2** uses average final money balance with ordinary observed min-max normalization. Run count and the 365-day average balance curve remain audit evidence; costs do not affect Speed or Value, and the result is interpreted as a stochastic simulation rather than a success rate.

**WeirdML** uses the creator CSV and `avg_acc` as primary evidence. Epoch is a mirror used for validated overlap and unique non-conflicting model-effort rows; creator rows win every overlap, and unvalidated mirror data is not merged.
