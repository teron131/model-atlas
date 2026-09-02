# Benchmark Portfolio

This document records which benchmarks affect Model Atlas, what capability each one measures, how much it contributes to Intelligence and Agentic scores, and which source evidence enters the ranking. [Benchmark standards](standards.md) define admission and classification; [Methodology](methodology.md) defines the scoring mathematics.

## Scoring Roles

Accepted task-level benchmarks are classified as `frontier` or `baseline` under [the standards](standards.md). Aggregate indexes are listed separately. Group labels describe portfolio role; the group itself does not change benchmark weight or missing-evidence treatment. Rejected and watchlist benchmarks do not affect the ranking.

The ranking has two quality dimensions:

| Dimension | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Knowledge and perception; reasoning, judgment, and problem solving; construction of correct or valuable answers, analyses, plans, proofs, code, documents, or models | Benchmarks with a non-zero Intelligence loading |
| Agentic | Fidelity to complex or persistent instructions; tool selection and sequencing; feedback use, external-state management, self-verification, recovery, and multi-step completion | Benchmarks with a non-zero Agentic loading |

There is no standalone coding score, and coding is not a synonym for agency. Code, proofs, files, repositories, terminals, compilers, interpreters, and browsers are neutral media. A benchmark earns Agentic loading only when it materially scores complex instruction fidelity, tool orchestration, feedback use, state management, self-verification, recovery, or persistence; producing a correct artifact or passing a verifier remains Intelligence evidence. Harness identity is retained as provenance but does not affect capability loading.

### Portfolio Settings

| Setting | Role |
| --- | --- |
| Group | Classifies the benchmark as `frontier` or `baseline` for portfolio interpretation |
| Importance | Controls the benchmark's total influence relative to other observed benchmarks |
| Dimension loading | Allocates that importance between Intelligence and Agentic; the two loadings sum to 100% |

For benchmark $b$ in dimension $D$, the effective weight $w_{b,D}=\operatorname{benchmarkImportance}_b\operatorname{dimensionLoading}_{b,D}$ combines importance with dimension loading. Group does not change the contribution of an observed value, and source identity does not determine group.

Task-level loadings use the five-level scale defined in [the standards](standards.md): 100% / 0%, 75% / 25%, 50% / 50%, 25% / 75%, or 0% / 100%. The review starts from the benchmark's intended scored construct, applies the completed-artifact counterfactual, and uses a mixed loading only when both capabilities independently and materially determine success.

The tables below show the current portfolio, why each benchmark or index is included, and whether its task resources can contribute to Speed or Value.

### Resource Quality Coordinates

Every benchmark whose task time or cost can enter Speed or Value declares how its quality value is positioned inside resource-comparison neighborhoods. `Logit` is limited to probability-like success, pass, accuracy, or completion rates. `Linear` preserves spacing for native scales and composites that do not have remaining-error probability semantics.

| Benchmark | Coordinate | Decision |
| --- | --- | --- |
| Agents' Last Exam | Linear | Partial-credit performance is a graded task score, not a binary completion probability. |
| ALE-Bench | Linear | Native Performance can exceed 100 and must retain its full spacing. |
| AnalystAgent | Logit | Pass^5 is a bounded strict workflow-success rate. |
| APEX Agents | Logit | Loop Pass@1 is a bounded task-completion rate. |
| ARC-AGI-2 | Logit | Task success is a bounded correctness rate with meaningful remaining error. |
| ARC-AGI-3 | Linear | Human-relative action efficiency is a continuous efficiency ratio, not a completion probability. |
| AutomationBench | Logit | The headline score is a bounded workflow-success rate. |
| Briefcase | Linear | The 0-1 value is a linear normalization of Elo, not probability. |
| CritPt | Logit | The score is a bounded correctness rate with meaningful remaining error. |
| CursorBench | Linear | The published grading score is a composite rather than a completion probability. |
| DeepSWE | Logit | Pass@1 is a bounded task-completion rate. |
| FrontierCode | Linear | The versioned `new_score` is a grading composite. |
| GDPval-AA v2 | Linear | The page Elo is normalized onto the benchmark's 0-1 scale before use as a professional-work grading composite. |
| Harvey LAB | Logit | Strict task resolution is a bounded all-criteria completion rate. |
| HLE | Logit | Accuracy is a bounded correctness rate. |
| ITBench | Linear | Average precision at full recall is used as a ranking metric, not interpreted as task-success probability. |
| SciCode | Logit | The source score is a bounded scientific-code correctness rate. |
| tau3 Banking | Logit | The score is a bounded workflow-success rate. |
| Terminal-Bench 4.0 | Logit | Task accuracy is a bounded completion rate with meaningful remaining error. |
| Terminal-Bench-Science 0.1 | Logit | Resolution rate is a bounded task-completion probability with meaningful remaining error. |

### Indexes

Indexes aggregate multiple evaluations into broad fallback coverage. They remain separate from task-level benchmarks because their component overlap and source-owned aggregation limit how independently they should influence the ranking.

| Index | Group | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | --- | ---: | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because the source mixes reasoning, knowledge, coding, and agent evaluations under source-owned aggregation that cannot be decomposed consistently; half importance limits its overlapping influence. |
| Epoch Capabilities Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because the source-owned mix and component count are not recoverable per model row; half importance limits the uncertainty. |
| Surge Intelligence Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because professional reasoning, writing, and agent evaluations are aggregated under incompatible source scales; half importance limits overlap. |
| Vals Index | Baseline | 0.5 | 50% | 50% | Retained as neutral fallback evidence because finance, legal, and coding tasks mix artifact quality with workflow execution without recoverable component weights; coding is not presumed Agentic. |

When a recent preview has aggregate indexes as its only observed quality evidence, those indexes are combined by the number of benchmarks they represent: Artificial Analysis 9, Epoch 8, Surge 8, and Vals 7. Epoch uses the median of the other three represented counts because its exact underlying count is unavailable per model row. These index-only preview counts do not replace the normal portfolio importance of 0.5.

### Frontier Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Agent&nbsp;Arena | 1 | 0% | 100% | Randomized Agent Mode sessions directly measure the orchestrator model's effect on successful completion, steerability, bash recovery, and tool reliability. The intended construct is Agentic, while domain reasoning is incidental to the sampled tasks. |
| Agents'&nbsp;Last&nbsp;Exam | 1 | 25% | 75% | Long software and professional tasks deliberately stress instruction fidelity, tool use, recovery, and completion, while partial-credit grading preserves a secondary contribution from solution quality and domain reasoning. |
| ALE-Bench | 1 | 75% | 25% | Heuristic-programming performance is driven primarily by algorithm design and the quality of the submitted program. Iterative execution and benchmark feedback add a material but secondary Agentic component; code itself does not. |
| AnalystAgent | 1 | 75% | 25% | Correct quantitative analysis of supplied spreadsheets and documents is the primary construct. Choosing code and document operations contributes a secondary Agentic component, and published per-task resources can feed Speed and Value. |
| APEX&nbsp;Agents | 1 | 25% | 75% | Long-horizon professional-services tasks deliberately stress complex instructions, workplace-tool coordination, and persistent completion. Professional judgment remains a substantive secondary requirement. |
| ARC-AGI-2 | 1 | 100% | 0% | Novel abstract visual transformations provide a protected frontier test of fluid reasoning. The current semi-private leaderboard has strong separation across serious systems, while its fixed demonstration-to-answer protocol is Intelligence evidence rather than external workflow execution. |
| ARC-AGI-3 | 1 | 75% | 25% | Rule discovery, abstraction, and planning in unfamiliar interactive environments dominate the score. Sequential action and adaptation to environment feedback provide a secondary Agentic component. |
| AutomationBench | 1 | 0% | 100% | Artificial Analysis implementation of Zapier workflow-automation tasks over simulated SaaS app environments. It is frontier because it tests business-process execution with tool-like constraints, and its AA per-task resources can feed Speed and Value. |
| Blueprint-Bench&nbsp;2 | 1 | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | 1 | 50% | 50% | Multi-file professional projects score both the quality and correctness of substantive deliverables and reliable coordination of interdependent instructions and artifacts. Neither capability is merely incidental. |
| Chartography | 1 | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. It is a current Intelligence-only stress test with meaningful frontier spread. |
| ComplexConstraints | 1 | 25% | 75% | The intended construct is fidelity to many interdependent, conditional, implicit, and multistep requirements, measured by all-criteria task pass. Tools are unnecessary for Agentic loading because complex instruction fidelity is itself the primary Agentic capability; planning quality is secondary. |
| CritPt | 1 | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| CursorBench | 1 | 75% | 25% | Functional correctness and code quality of the completed repository change are primary. Ambiguous instructions, repository navigation, and execution feedback add a secondary Agentic component rather than making coding itself Agentic. |
| DeepSWE | 1 | 75% | 25% | Correct resolution of repository-level software problems primarily measures diagnosis and artifact construction. Inspection, testing, and recovery inside the repository add a secondary Agentic component. |
| EMB | 1 | 75% | 25% | Correct financial-model construction and professional judgment dominate the score. Coordinating spreadsheet operations and multi-step requirements adds a secondary Agentic component. |
| FrontierCode | 1 | 75% | 25% | Correct, high-quality, mergeable repository changes are the primary scored artifact. Repository navigation, self-verification, and recovery add a secondary Agentic component. |
| FrontierMath Tier 4 | 1 | 100% | 0% | Epoch's hardest private FrontierMath tier is a current specialist mathematical-reasoning stress test. |
| GDP.pdf | 1 | 100% | 0% | Dense page-grounded rubrics measure professional document interpretation and judgment. PDF access is an input medium, not an independently scored Agentic capability. |
| GDPval-AA&nbsp;v2 | 1 | 75% | 25% | The quality of professional deliverables across economically important occupations is primary. Longer tool, file, and web trajectories add a secondary Agentic component when they materially support completion. |
| HANDBOOK.md | 1 | 25% | 75% | Enterprise tasks deliberately stress sustained policy adherence, long-context instructions, internal tools, and external MCP coordination. Domain reasoning is substantial but secondary to reliable constrained execution. |
| Harvey LAB | 1 | 75% | 25% | The correctness and quality of legal work products dominate the dense criterion grading. Matter-file navigation and multi-step instruction handling add a secondary Agentic component. |
| HLE | 1 | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| ITBench | 1 | 75% | 25% | Identifying every contributing Kubernetes root cause primarily measures diagnosis across complex technical evidence. Navigating investigation data and validating hypotheses adds a secondary Agentic component. |
| Legal Research | 1 | 50% | 50% | Legal interpretation and synthesis and the reliable orchestration of retrieval and research tools independently determine strict all-pass success. Current results retain frontier headroom and separation. |
| MLS-Bench Lite | 1 | 75% | 25% | Machine-learning method design and improvement quality dominate across 30 controlled tasks. Iterative experimentation, feedback use, and validation in the five-hour environment add a secondary Agentic component. |
| ProgramBench | 1 | 100% | 0% | Natural-language requirements define programs whose behavioral correctness is the scored construct. Producing code and passing a verifier are artifact construction and verification media, not independent Agentic evidence. |
| ProofBench | 1 | 100% | 0% | Mathematical reasoning and construction of a valid Lean proof are the scored construct. Compilation verifies the artifact but does not by itself measure tool orchestration or stateful execution. |
| Riemann-bench | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| Terminal-Bench 4.0 | 1 | 25% | 75% | Difficult containerized tasks deliberately require instruction fidelity, terminal-tool orchestration, state inspection, self-verification, and recovery. Technical reasoning is substantive, but the scored construct is primarily reliable workflow execution rather than coding. |
| Terminal-Bench-Science 0.1 | 1 | 75% | 25% | Scientific formulation, analysis, and construction of correct research artifacts dominate the benchmark. Following task instructions and using terminal tools add a secondary Agentic component; code does not create Agentic evidence by itself. |

### Baseline Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| BrowseComp | 1 | 50% | 50% | Finding and synthesizing difficult web evidence requires both substantive research reasoning and deliberate browsing, query selection, and feedback use. Public tasks and less frontier-like top spread keep it baseline. |
| Chess Puzzles | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| Code Migration | 1 | 100% | 0% | Reimplementing working programs in new languages is scored by hidden behavioral correctness and anti-cheat checks. The completed program is the construct; language tooling and files are incidental media. |
| CyberBench | 1 | 75% | 25% | Security diagnosis and construction of a correct patch dominate patch-track accuracy. Repository inspection and validation add a secondary Agentic component, while the focused security-patching scope keeps it baseline. |
| EBR-Bench | 0.5 | 25% | 75% | Repeated play deliberately measures exploration, learning from feedback, persistent notes, and stateful adaptation. Strategic reasoning is secondary, while the narrow game, small leaderboard, and limited result volume keep it half importance. |
| EnterpriseBench CoreCraft | 0.5 | 25% | 75% | Simulated-company tasks primarily measure instruction fidelity, workplace-tool coordination, and reliable workflow completion. Business reasoning is secondary, while one environment, first-party judges, and portfolio overlap keep it half importance. |
| Finance Agent V2 | 1 | 50% | 50% | Financial reasoning and calculation and reliable filing retrieval, research, and tool use independently determine strict all-pass success. Its focused financial domain makes it stabilizing baseline evidence. |
| Hemingway-bench | 1 | 75% | 25% | Writing quality, originality, coherence, and emotional intelligence dominate expert preference. Explicit instruction adherence contributes a secondary Agentic component, while the relative Elo scale and focused domain keep it baseline. |
| Omniscience | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to distinguish the frontier leaders. |
| PerceptionBench | 1 | 100% | 0% | Short-answer questions isolate ten atomic visual capabilities across 3,000 verified examples. The narrow multimodal focus provides distinctive Intelligence breadth, while creator-run configurations and an automatic judge keep it baseline rather than a frontier missing-data claim. |
| Public Benefits Bench | 1 | 50% | 50% | Policy interpretation and case reasoning and reliable research and workflow completion independently determine success. Its focused domain keeps it baseline. |
| SciCode | 1 | 100% | 0% | Scientist-curated problems measure scientific formulation, reasoning, and construction of correct Python solutions. Unit tests verify the artifact; executable code does not create an Agentic component. |
| tau3&nbsp;Banking&nbsp;(AA) | 1 | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It remains useful domain workflow evidence, but its current rank agreement and tight top spread make it a stabilizing baseline signal rather than a frontier separator. |
| Toolathlon | 1 | 0% | 100% | Multi-tool workflow execution across files, APIs, business applications, and other external environments. Selecting and coordinating external tools through long-horizon tasks is the intended construct, so the signal is fully Agentic; limited current row count and provenance keep it baseline. |
| Vending-Bench&nbsp;2 | 1 | 25% | 75% | Year-long simulated business operation deliberately measures sustained tool use, state management, negotiation, and coherence over thousands of messages. Business judgment is secondary, while small run counts and stochastic outcomes keep it baseline. |
| Vibe Code | 1 | 75% | 25% | The quality and correctness of an end-to-end software product dominate the scored artifact. Complex instructions, tool use, and iterative self-verification add a secondary Agentic component; coding itself does not. |
| WeirdML | 1 | 75% | 25% | Model selection, experimental reasoning, and implementation quality dominate across novel datasets. Iterative execution feedback and validation add a secondary Agentic component rather than code generation itself. |

## Watchlist

Watchlist benchmarks remain outside the scoring portfolio. Time Horizon Index is currently non-scoring because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard required by [the standards](standards.md).

## Evidence Rules

### Compatibility and Defaults

Rows are combined only when their task set and version, metric, scoring protocol, units, aggregation, model identity, and reasoning effort are compatible. For an explicitly coding benchmark that reports multiple harnesses for the same model configuration, harness rows remain distinct unless a benchmark policy defines their aggregation.

A source crosswalk requires overlap that validates any identity, scale, or unit conversion and an explicit precedence rule for duplicate observations. Duplicate mirrors are not averaged, and methodologically different measurements remain separate unless a benchmark policy explicitly defines their aggregation.

An unlabelled configuration is the source default. When every configuration is labelled, the highest reported effort becomes the default as one complete observation; explicit effort rows remain attached to their matching variants, and Model Atlas never constructs a synthetic best-of-fields default.

### Shared Inputs

**Artificial Analysis** supplies its aggregate index and index-level resources from the main model table. Selected task-level AA benchmarks instead use their dedicated evaluation pages; unselected main-table fields, including `coding_index`, remain source context only.

**OpenRouter** supplies current route pricing and provider speed measurements used for blended price and the provider serving-performance components. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

## Aggregate Index Policies

**Artificial Analysis Intelligence Index** uses the published aggregate directly. Its overlap with selected task benchmarks makes it one fallback observation rather than nine independent observations; its resource facts are retained but do not separately affect Speed or Value.

**Epoch Capabilities Index** uses the published ECI value directly. Its represented benchmark count matters only for previews with no task-level quality evidence.

**Surge Intelligence Index** uses the published aggregate directly. It remains fallback evidence, and the absence of a reproducible index-level resource contract keeps it out of Speed and Value.

**Vals Index** uses the overall percentage directly. Its proprietary mix of non-public Vals datasets and public coding benchmarks makes it aggregate fallback evidence, while its cost and latency lack a comparable task-level aggregation and remain outside Speed and Value.

## Benchmark Source Policies

Only non-default source, metric, selection, exclusion, and resource rules are detailed below. The portfolio tables remain authoritative for capability, class, importance, and dimension loading.

### Shared Source Families

**Artificial Analysis benchmark family:** AnalystAgent, APEX Agents, AutomationBench, Briefcase, CritPt, GDPval-AA v2, HLE, ITBench, Omniscience, SciCode, and tau3 Banking use their dedicated evaluation pages for both scores and any eligible resources. The shared model table does not supply their task-level scores.

AnalystAgent uses headline pass^5 across 80 private questions; its published totals are normalized per question before resource scoring. APEX Agents uses Artificial Analysis when available, with Mercor Loop Pass@1 as a same-model-and-effort fallback only after the [validated additive source crosswalk](methodology.md#validated-additive-source-crosswalk) reaches three effective overlap and held-out models with median absolute error at most `0.02`; projections are clamped to `[0,1]`.

Briefcase and GDPval-AA v2 retain raw page Elo but normalize it with `clamp((Elo - 500) / 2000)` for scoring and linear resource comparison. GDPval may use the main-table normalized value as a compatible fallback after overlap validates the conversion. ITBench divides aggregate cost and tokens by 177 task runs, and SciCode divides them by 288 task runs.

**ARC Prize benchmark family:** ARC-AGI-2 and ARC-AGI-3 use only the official verified semi-private leaderboard and discard public-demo, community, competition, custom, refinement, and synthesis systems. ARC-AGI-2 uses task success and reported task cost; ARC-AGI-3 uses human-relative action efficiency and divides total cost across 55 semi-private environments. These costs affect Value only within their respective benchmarks.

**Epoch benchmark family:** FrontierMath Tier 4, Chess Puzzles, and EBR-Bench use successful runs from Epoch's bulk benchmark data. FrontierMath is restricted to the exact v2-private task so older scores cannot enter the current benchmark.

**Surge benchmark family:** Chartography, ComplexConstraints, HANDBOOK.md, and EnterpriseBench CoreCraft use published percentages; ComplexConstraints uses all-criteria task pass. Hemingway-bench retains its expert-preference Elo rather than converting it to a percentage, and Surge page-local resources do not affect Speed or Value.

**Vals benchmark family:** Legal Research, EMB, Code Migration, Vibe Code, and Public Benefits Bench use `overall`; Finance Agent V2 uses `all_pass`, ProgramBench uses `partial`, and CyberBench uses the `patch` track. Vals cost and latency remain outside Speed and Value, and these benchmarks are not Time Horizon evidence.

Harvey LAB uses Vals' strict all-criteria task resolution plus its per-task cost and runtime; Artificial Analysis' Stirrup reimplementation does not enter its score or resources. ProofBench uses Vals' compiler-verified overall accuracy, excludes the specialized `aristotle/aristotle` system, and uses Epoch overlap only as provenance validation rather than additional evidence.

### Standalone Policies

**Agent Arena** uses the published Net Improvement point estimate directly as the raw benchmark value. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so Model Atlas applies its ordinary observed per-benchmark min-max normalization without a sigmoid transform.

**Agents' Last Exam** uses `max(median_score, mean_score)` from the Full Overall split because partial-credit score is more informative than pass-rate accuracy. Resource totals are divided by evaluated task count, and displayed resources use the lower of the resulting median and mean per-task values.

**ALE-Bench** uses Sakana AI's complete leaderboard, with Epoch's overlapping rounded table only as a scale validator. The `num_self_refine = 1` all-task mean Performance is the scoring row and remains linear for resource comparison so values above 100 retain their spacing. Mean per-task cost can affect Value; submitted-program execution time and memory remain source context.

**Blueprint-Bench 2** uses normalized connectivity similarity; Andon's internal identifiers are not model-matching inputs.

**CursorBench** uses the source-default row or, when every row is effort-labelled, the highest reported effort as one complete observation. Grok 4.5 remains raw but non-scoring because Cursor discloses possible benchmark-snapshot training overlap; private Composer models are excluded because they are not independently available. Eligible per-task cost and tokens can affect Value and Speed.

**DeepSWE** uses pass@1 and one complete source-default or highest-labelled-effort observation per model. Mean duration and cost can affect Speed and Value; mean output tokens are used only as the task-time fallback or source context.

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
