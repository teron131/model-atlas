# Benchmark Portfolio

A benchmark earns its place by adding credible information about model capability. This reference records the selected evaluations, their weights, the reasons for including them, and the source policies that keep results comparable. [Standards](standards.md) explains the selection criteria; [Methodology](methodology/overview.md) explains how the results become scores.

## Scoring Roles

Benchmarks have either a `frontier` or `baseline` role; aggregate indexes are listed separately. Frontier benchmarks contribute to Intelligence and Agentic according to their dimension allocations. Baseline results remain visible but do not contribute directly to either capability score. Eligible aggregate indexes contribute according to their dimension allocations. Rejected and watchlist benchmarks contribute no score.

The ranking has two quality dimensions:

| Dimension | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Knowledge, perception, conceptual understanding, abstract reasoning, and judgment in difficult problems | Frontier benchmarks with a non-zero Intelligence loading, plus eligible aggregate indexes |
| Agentic | Reliable execution of goals and specifications through coding, instruction following, planning, tool use, state management, verification, recovery, and completion | Frontier benchmarks with a non-zero Agentic loading, plus eligible aggregate indexes |

Writing, modifying, testing, debugging, and delivering software primarily test Agentic ability. A coding benchmark earns Intelligence weight when difficult algorithmic, mathematical, scientific, or research reasoning substantially determines success. A scientific topic or a difficult environment alone does not establish that demand. The task and its failure modes determine the loading; a final-output grader or harness name does not.

### Portfolio Settings

| Setting | Role |
| --- | --- |
| Group | Selects frontier benchmarks for both Intelligence and Agentic; baseline results remain visible |
| Importance | Standard policy: 1 for both task benchmarks and aggregate indexes; represented index breadth supplies the aggregate multiplier |
| Allocation (dimension loading) | Intelligence/Agentic split: 100/0, 75/25, 50/50, 25/75, or 0/100 |

Base weight is importance × allocation. Both capability scores use frontier benchmark contributions. Intelligence blends its frontier weighted mean with shared frontier comparisons at 80% ordinary score and 20% pairwise score. The capability calculation multiplies individual benchmark weights by 1.5 when determining their relative share against eligible indexes; index weights use remaining represented breadth. See [Methodology](methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes). Score retention uses supported active benchmark weight and reaches full credit at 12. The displayed evidence share and admission use their own weights without the 1.5 multiplier.

The allocation follows the five-level scale in [Standards](standards.md). Coding tasks are primarily Agentic evidence; an Intelligence share depends on substantial reasoning in the task's actual demands.

The current configuration has two task-importance exceptions: FrontierMath Erdős and EnterpriseBench CoreCraft remain at 0.5, as recorded in the tables below.

Each table records the capability being measured and the reason for its weight. The source policies below specify which observations and task resources are eligible.

### Resource Quality Coordinates

Speed, Value, and Agentic token adjustments compare resource use among models with similar benchmark quality. All benchmarks use linear quality coordinates: equal metric improvements have equal distance. The comparison width scales with each benchmark's observed range, so changing units or subtracting the minimum does not change peer weights. Resource amounts retain their logarithmic ratio comparison.

AA aggregate output tokens remain attached to its own Intelligence Index; index membership never supplies token evidence to constituent or cross-index benchmarks.

### Indexes

An aggregate index summarizes several evaluations. It offers broad coverage, but its components can overlap selected tasks and its source controls the aggregation. Keeping indexes separate makes that limitation visible.

| Index | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | 1 | 50% | 50% | Broad source-owned aggregate whose represented breadth is reduced for exact known standalone overlap. |
| CAIS Capabilities Index | 1 | 75% | 25% | Atlas-derived weighted coverage proxy across two Text and five Vision components. Exact component keys prevent directly observed CAIS tasks from receiving duplicate proxy weight. |
| Epoch Capabilities Index | 1 | 50% | 50% | Opaque broad fallback evidence assigned the fixed 7.5 median index breadth. |
| Surge Intelligence Index | 1 | 50% | 50% | Opaque professional-reasoning, writing, and agent evidence weighted by its declared breadth. |
| Vals Index | 1 | 50% | 50% | Opaque finance, legal, and coding evidence weighted by its declared breadth. |

Indexes remain separate from the frontier benchmark scores. Their share relative to frontier results uses 1.5 × importance × dimension allocation for available frontier results and importance × dimension allocation × represented breadth for eligible indexes after exact known overlap is deducted. Baseline results do not reduce index breadth in either capability. Agentic retains one benchmark-and-index evidence pool. Duplicate known constituents across two indexes divide one evidence unit rather than creating two. Effort-labelled variants use only effort-specific indexes, currently Artificial Analysis and CAIS; other index observations remain visible and retain their separate admission role. [Methodology](methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes) defines the full calculation and its separate evidence and admission rules.

### Frontier Benchmarks

These tasks provide demanding evidence that separates current leading models. Each row records the capability rationale and any reduction in importance.

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
| BioMysteryBench | 1 | 50% | 50% | Ninety audited investigations of anonymized biological data require both scientific interpretation and sustained analysis with code, tools, and databases. Objective answer keys, three independent runs, and remaining human-difficult headroom support frontier use; Vals' anti-cheat grading and source-specific refusals remain part of the published accuracy. |
| Blueprint-Bench&nbsp;2 | 1 | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | 1 | 50% | 50% | Multi-file professional projects score both the quality and correctness of substantive deliverables and reliable coordination of interdependent instructions and artifacts. Neither capability is merely incidental. |
| Chartography | 1 | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. It is a current Intelligence-only stress test with meaningful frontier spread. |
| Code Migration | 1 | 25% | 75% | Porting, building, testing, and delivering working programs primarily measure coding execution. Reasoning about cross-language semantics and subtle behavioral equivalence retains a secondary Intelligence loading, and current results retain substantial headroom. Endpoint latency remains part of the delivery constraint. |
| ComplexConstraints | 1 | 25% | 75% | The intended construct is fidelity to many interdependent, conditional, implicit, and multistep requirements, measured by all-criteria task pass. Tools are unnecessary for Agentic loading because complex instruction fidelity is itself the primary Agentic capability; planning quality is secondary. |
| CritPt | 1 | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| DAYJOB: Finance | 1 | 50% | 50% | Financial judgment across long document-heavy assignments and reliable production of finished analyses both determine rubric credit. Current leaders retain substantial headroom; the public release has 50 tasks while the publisher describes an 80-task scored set. |
| DAYJOB: Healthcare | 1 | 50% | 50% | Clinical interpretation across fragmented records and reliable completion of care or coverage deliverables jointly determine rubric credit. The 50-task series separates current leaders while many systems remain near the floor. |
| DeepSWE | 1 | 25% | 75% | Repository-level implementation, testing, and delivery of a correct committed patch primarily measure Agentic ability. Difficult program analysis and algorithmic changes retain a secondary Intelligence loading. |
| EBR-Bench | 1 | 25% | 75% | Repeated play measures exploration, learning from feedback, persistent notes, and stateful adaptation. Models remain far below expert human performance, and the task's distinct unsolved capability earns ordinary task-level importance. |
| EMB | 1 | 75% | 25% | Correct financial-model construction and professional judgment dominate the score. Coordinating spreadsheet operations and multi-step requirements adds a secondary Agentic component. |
| EnigmaEval | 1 | 100% | 0% | Long multimodal puzzle-hunt problems require discovering hidden structure, synthesizing clues, and carrying out multi-step deductions. CAIS supplies broad current coverage; source version and original-versus-transcription format remain part of the adoption audit. |
| FrontierCode | 1 | 25% | 75% | Producing mergeable repository changes primarily measures reliable coding execution, constraint following, and verification. Architectural and algorithmic reasoning needed for difficult maintainer-defined tasks retains a secondary Intelligence loading. |
| FrontierMath Erdős | 0.5 | 75% | 25% | Verified resolution of open Erdős problems is exceptional mathematical-research evidence with substantial Lean execution demands. Near-binary current results, one attempt per problem, stochastic long-running agents, and overlap with FrontierMath Tier 4 justify exceptional half importance. |
| FrontierMath Tier 4 | 1 | 100% | 0% | Epoch's hardest private FrontierMath tier is a current specialist mathematical-reasoning stress test. |
| GDP.pdf | 1 | 100% | 0% | Dense page-grounded rubrics measure professional document interpretation and judgment. PDF access is an input medium, not an independently scored Agentic capability. |
| GDPval-AA&nbsp;v2.1 | 1 | 75% | 25% | The quality of professional deliverables across economically important occupations is primary. Longer tool, file, and web trajectories add a secondary Agentic component when they materially support completion. |
| HANDBOOK.md | 1 | 25% | 75% | Enterprise tasks deliberately stress sustained policy adherence, long-context instructions, internal tools, and external MCP coordination. Domain reasoning is substantial but secondary to reliable constrained execution. |
| HLE | 1 | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| MirrorCode | 1 | 25% | 75% | Sustained whole-program reconstruction through documentation, black-box probing, implementation, and exhaustive testing primarily measures Agentic delivery. Inferring hidden behavior and program structure supplies secondary Intelligence evidence. |
| MLS-Bench Lite | 1 | 75% | 25% | Machine-learning method design and improvement quality dominate across 30 controlled tasks. Iterative experimentation, feedback use, and validation in the five-hour environment add a secondary Agentic component. |
| MysteryMechanism | 1 | 75% | 25% | Recovering hidden mathematical laws from sparse observations is primarily scientific and quantitative reasoning. Choosing a small number of experiments through a shell adds Agentic work, while 222 held-out mechanisms and private structural-probe grading leave substantial frontier headroom. |
| ProgramBench | 1 | 25% | 75% | Reconstructing programs through executable probing, implementation, compilation, and testing primarily measures Agentic ability. The selected Almost Resolved rate requires at least 95% of hidden tests to pass, while inferring hidden program semantics retains a secondary Intelligence loading. |
| Riemann-bench | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| RSI | 1 | 50% | 50% | Five long-horizon LLM R&D tasks demand substantive method and experiment judgment alongside sustained implementation, evaluation, and recovery. Atlas treats the publisher's RSI Index as one frontier task benchmark with ordinary importance, not an aggregate index with a represented-breadth multiplier. Models used different disclosed agent products, so the result is explicitly model-plus-agent evidence. |
| SRE Bench | 1 | 25% | 75% | Binary reverse engineering across protected programs primarily measures investigation, tool use, reconstruction, and verified execution. Inferring hidden semantics and protections supplies secondary Intelligence evidence, while deterministic grading and substantial headroom support frontier use despite sparse model coverage. |
| SpatialViz-Bench | 1 | 100% | 0% | Controlled mental rotation, folding, penetration, and animation tasks isolate spatial visualization as a distinct Intelligence capability. Programmatic generation and current top-model separation support frontier use, subject to confirming the CAIS configuration matches the paper task version. |
| SUPERChem | 1 | 100% | 0% | Expert-curated multimodal chemistry problems test advanced chemical reasoning. The selected published Pass@1 metric supplies frontier Intelligence evidence; reasoning-path fidelity and text-only runs remain separate. |
| Terminal-Bench 4.0 | 1 | 25% | 75% | Difficult containerized tasks deliberately require instruction fidelity, terminal-tool orchestration, state inspection, self-verification, and recovery. Technical reasoning is substantive, but the scored construct is primarily reliable workflow execution rather than coding. |
| Terminal-Bench-Science 0.1 | 1 | 75% | 25% | Scientific formulation and research-level analysis justify the Intelligence-heavy exception to the coding default. Implementing methods, coordinating terminal tools, and verifying results contribute the secondary Agentic loading. |
| TextQuests | 1 | 25% | 75% | Long-horizon interactive-fiction play requires exploration, state tracking, trial and error, recovery, and sustained planning. No-clues mean game progress is frontier Agentic evidence, with puzzle reasoning as a substantive secondary component. |

### Baseline Benchmarks

These benchmarks retain useful capability breadth or stability even when they do not provide the strongest frontier separation. Their results remain visible without directly contributing to either capability score, regardless of their listed allocation. Observed baseline results can inform validated estimates of missing frontier evidence.

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| APEX-SWE | 1 | 0% | 100% | Service integration and debugging with production-style telemetry measure software execution. Published Terminus-2 Pass@1 results provide a baseline Agentic observation; other harnesses cannot fill missing Terminus-2 rows. |
| BrowseComp | 1 | 50% | 50% | Finding and synthesizing difficult web evidence requires both substantive research reasoning and deliberate browsing, query selection, and feedback use. Public tasks and less frontier-like top spread keep it baseline. |
| Chess Puzzles | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| EnterpriseBench CoreCraft | 0.5 | 25% | 75% | Simulated-company tasks primarily measure instruction fidelity, workplace-tool coordination, and reliable workflow completion. Business reasoning is secondary, while one environment, first-party judges, and portfolio overlap keep it half importance. |
| ERQA | 1 | 100% | 0% | Multimodal embodied-reasoning questions add visual spatial, trajectory, action, and physical-world judgment coverage. It remains baseline because the current CAIS denominator and parse-failure treatment require source validation. |
| Finance Agent V2 | 1 | 50% | 50% | Financial reasoning and calculation and reliable filing retrieval, research, and tool use independently determine strict all-pass success. Its focused financial domain makes it stabilizing baseline evidence. |
| Hemingway-bench | 1 | 75% | 25% | Writing quality, originality, coherence, and emotional intelligence dominate expert preference. Explicit instruction adherence contributes a secondary Agentic component, while the relative Elo scale and focused domain keep it baseline. |
| IntPhys 2 | 1 | 100% | 0% | Video questions probe object permanence, continuity, immutability, and solidity under changing camera and scene conditions. It remains baseline until CAIS frame sampling and evaluated-subset provenance are confirmed. |
| MindCube Tiny | 1 | 100% | 0% | Multi-view spatial mental modeling and perspective changes add specialist visual-reasoning breadth. Current leaders approach the ceiling, so it is baseline rather than a primary frontier separator. |
| MLCR-AA | 1 | 100% | 0% | Long medical-record synthesis adds clinical chronology and causality reasoning beyond broad long-context tests. The 60 held-out questions across ten synthetic cases and judge disagreement keep it in the baseline group rather than making it a primary frontier claim. |
| Omniscience | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to distinguish the frontier leaders. |
| PerceptionBench | 1 | 100% | 0% | Short-answer questions isolate ten atomic visual capabilities across 3,000 verified examples. The narrow multimodal focus provides a distinctive Intelligence observation, while creator-run configurations and an automatic judge keep it baseline rather than a frontier missing-data claim. |
| ProofBench | 1 | 100% | 0% | Mathematical reasoning and construction of a valid Lean proof are the scored construct. Compilation verifies the artifact, and the remaining spread across current general models still makes it useful to display despite near-ceiling leaders. Its inclusion ends when comparable current models cluster at the ceiling. |
| Public Benefits Bench | 1 | 50% | 50% | Policy interpretation and case reasoning and reliable research and workflow completion independently determine success. Its focused domain keeps it baseline. |
| SciCode | 1 | 100% | 0% | Scientist-curated problems require substantive scientific knowledge and mathematical formulation to derive the solution. Those demands justify the Intelligence exception; the fixed function-completion protocol provides little independent workflow evidence. |
| SimpleQA Verified | 1 | 100% | 0% | Broad factual recall under Epoch's current anti-abstention methodology adds general-knowledge coverage distinct from Omniscience's professional-domain focus. Public static questions and exposure risk keep it baseline. |
| Toolathlon | 1 | 0% | 100% | Multi-tool workflow execution across files, APIs, business applications, and other external environments. Selecting and coordinating external tools through long-horizon tasks is the intended construct, so the signal is fully Agentic; limited current row count and provenance keep it baseline. |
| Vending-Bench&nbsp;2 | 1 | 25% | 75% | Year-long simulated business operation deliberately measures sustained tool use, state management, negotiation, and coherence over thousands of messages. Business judgment is secondary, while small run counts and stochastic outcomes keep it baseline. |
| Vibe Code | 1 | 0% | 100% | Building working applications from specifications measures coding execution, service integration, state management, testing, recovery, and completion. The task design does not establish a separate exceptional algorithmic or scientific reasoning demand, so ordinary application construction stays fully Agentic. |
| VoxelBench | 1 | 50% | 50% | Text-to-voxel construction combines substantive spatial reasoning with reliable execution of scene requirements. Community preferences add distinctive construction evidence; less transparent generation and voting methodology keep this a specialist baseline with a measurement caveat. |
| WeirdML | 1 | 75% | 25% | Model selection and experimental reasoning across novel datasets justify the Intelligence-heavy exception to the coding default. Implementing experiments and responding to validation feedback contributes the secondary Agentic loading. |

## Watchlist

Watchlist benchmarks remain outside the scoring portfolio. Time Horizon Index is currently non-scoring because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard required by [the standards](standards.md).

## Evidence Rules

### Compatibility and Defaults

Combining results is justified only when they refer to compatible tasks and versions, metrics, scoring protocols, units, aggregation, model identities, and reasoning efforts. For explicitly coding benchmarks, different harness rows remain distinct unless the benchmark defines how to aggregate them.

Declared source pairs use fixed 50/50 fusion, including mirrors: identical scores remain unchanged and differing scores are averaged. Missing counterparts require validation on overlapping model-effort pairs. Two source rows still contribute one benchmark result, and ambiguous duplicates are excluded from fusion. Measurements from different methods stay separate unless a benchmark policy explicitly defines their combination.

An unlabelled configuration is the source default. If every configuration names an effort, the highest reported effort supplies the default as one complete observation. Individual effort rows still belong to their matching variants. Choosing one complete observation prevents a synthetic default assembled from the best field in each row.

### Shared Inputs

**Artificial Analysis** supplies its aggregate index and index-level resources from the main model table. Selected task-level AA benchmarks instead use their dedicated evaluation pages; unselected main-table fields, including `coding_index`, remain source context only.

**OpenRouter** supplies current route pricing and provider speed measurements used for blended price and the provider serving-performance components. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

## Aggregate Index Policies

**Artificial Analysis Intelligence Index** uses the published v4.3.2 aggregate directly as one index observation, with represented breadth currently 10. The recorded constituents are AA-Briefcase v1.1, GDPval-AA v2.1, AutomationBench-AA, Terminal-Bench 4.0, SciCode, HLE, GDP.pdf, CritPt, AA-Omniscience, and AA-LCR v1.1. Their canonical benchmark keys allow exact direct and cross-index overlap deductions. Its own paired per-task cost, runtime, and output tokens can contribute under the resource rules in [Methodology](methodology/leaderboard-rules.md#resource-score-availability). This telemetry remains attached to the index and never fills missing standalone task measurements.

**CAIS Capabilities Index** is derived from HLE, TextQuests, EnigmaEval, ERQA, IntPhys 2, MindCube Tiny, and SpatialViz-Bench with equal weight per component, expressed as `(2 × Text + 5 × Vision) / 7`. Directly observed components reduce its remaining weight, so a fully represented basket adds no second index vote. A disclosed composite fallback excludes that model from the aggregate while preserving its component values and provenance. CAIS supplies no task-level resource telemetry.

**Epoch Capabilities Index** uses the published ECI value with fixed represented breadth 7.5, the median of the fixed index baskets. Its model-specific fitted benchmark count remains source metadata but does not alter scoring weight. Component identities are not fully available for overlap accounting; the assigned breadth does not create missing task measurements.

**Surge Intelligence Index** uses the published aggregate directly. It remains fallback evidence, and the absence of a reproducible index-level resource contract keeps it out of Speed and Value.

**Vals Index** uses the overall percentage directly. Its proprietary mix of non-public Vals datasets and public coding benchmarks makes it aggregate fallback evidence, while its cost and latency lack a comparable task-level aggregation and remain outside Speed and Value.

## Benchmark Source Policies

The [absolute resource agreement rule](methodology/speed-value.md#resource-comparability-across-sources) determines whether sources can share raw resource amounts. Sources that do not qualify receive separate resource scores with equal base weights; quality fusion is assessed separately.

Only non-default source, metric, selection, exclusion, and resource rules are detailed below. The portfolio tables remain authoritative for capability, class, importance, and dimension loading.

### Shared Source Families

**CAIS benchmark family:** TextQuests, EnigmaEval, ERQA, IntPhys 2, MindCube Tiny, and SpatialViz-Bench use the dashboard's component observations. These remain separate from the derived CAIS index and have no task-level resource telemetry.

**Artificial Analysis benchmark family:** AnalystAgent, Briefcase, CritPt, GDPval-AA v2.1, HLE, MLCR-AA, Omniscience, and SciCode use their dedicated evaluation pages for both scores and any eligible resources. The shared model table does not supply their task-level scores.

AnalystAgent uses headline pass^5 across 80 private questions; its published totals are normalized per question before resource scoring. APEX Agents uses Mercor's creator-owned Loop Pass@1 leaderboard directly; model and reasoning-effort variants remain distinct, and missing benchmark-specific resources stay missing.

Briefcase and GDPval-AA v2.1 retain raw page Elo but normalize it with `clamp((Elo - 500) / 2000)` for scoring and linear resource comparison. GDPval may use the main-table normalized value as a compatible fallback after overlap validates the conversion. MLCR-AA resources cover 180 attempts, and SciCode divides aggregate cost and tokens by 288 task runs. Missing benchmark-specific telemetry stays missing in observed graphs; the overall Artificial Analysis Intelligence Index cost or token average cannot replace it. Validated sibling-effort resource estimates may contribute discounted scoring evidence without becoming observed graph points.

**ARC Prize benchmark family:** ARC-AGI-2 and ARC-AGI-3 use only the official verified semi-private leaderboard and discard public-demo, community, competition, custom, refinement, and synthesis systems. ARC-AGI-2 uses task success and reported task cost. These costs affect Value only within their respective benchmarks.

**Epoch benchmark family:** FrontierMath Tier 4, FrontierMath Erdős, Chess Puzzles, EBR-Bench, MirrorCode, and SimpleQA Verified use successful runs from Epoch's bulk benchmark data. FrontierMath Tier 4 is restricted to the exact v2-private task. MirrorCode accepts only `mirrorcode-ml-2l-*` runs for the ML, private-tests, two-language configuration. SimpleQA Verified accepts only task version 1.2.0 under the `SimpleQA Verified (anti-abstention)` method and excludes the source-flagged `qwen3-max-2025-09-23` row.

**Surge benchmark family:** Chartography, ComplexConstraints, DAYJOB: Finance, DAYJOB: Healthcare, HANDBOOK.md, and EnterpriseBench CoreCraft use published percentages; ComplexConstraints uses all-criteria task pass. The DAYJOB percentages are treated as mean rubric credit across five attempts, matching the released RewardKit scoring default and reproduction instructions; the dataset cards instead describe strict all-criteria success, so that publisher discrepancy remains provenance rather than a change to the selected metric. Finance's card claims 80 scored tasks, but only 50 are public and the exact leaderboard task set is unverified. Hemingway-bench retains its expert-preference Elo rather than converting it to a percentage, and Surge page-local resources do not affect Speed or Value.

**Vals benchmark family:** BioMysteryBench, Code Migration, EMB, MysteryMechanism, Public Benefits Bench, and Vibe Code use `overall`; Finance Agent V2 uses `all_pass`, ProgramBench uses `almost`, and SRE Bench uses `partial`. BioMysteryBench `overall` is mean accuracy across three full 90-task runs, while its human-difficult split remains diagnostic. MysteryMechanism `overall` is functional-recovery accuracy across 222 held-out mechanisms. ProgramBench `almost` is the share of tasks passing at least 95% of hidden behavioral tests. SRE Bench `partial` is its Capability Score across 1,572 objectives in 262 binary instances; its Fully Solved rate remains supporting context. Vals cost and latency remain outside Speed and Value, and these benchmarks are not Time Horizon evidence.

**RSI benchmark:** The publisher's version 1.1 overall score is the mean of five reference-anchored task scores, each mapped to 0 at its starter and 0.5 at a selected reference. Atlas counts that single score once as direct benchmark evidence; Compression, LM Training, Parameter Golf, Harness Engineering, and Post-Training remain raw diagnostic rows and never become five additional scoring inputs. The results compare model-plus-agent systems because Claude, GPT, Gemini, and other model families used different disclosed agent products. Published RSI cost and duration do not affect Speed or Value.

ProofBench uses Vals' compiler-verified overall accuracy, excludes the specialized `aristotle/aristotle` system, and uses Epoch overlap only as provenance validation rather than additional evidence.

### Mercor Chemistry and Software Engineering

**SUPERChem** uses Mercor's published `pass-1` result from the 500-question multimodal release series. Text-only runs and reasoning-path fidelity scores remain separate. **APEX-SWE** uses Mercor's `pass-1` results under `terminus-2`; Inspect results remain raw provenance and cannot fill missing Terminus-2 observations.

Both sources retain exact reported effort, original result fields, uncertainty, and sample counts. Model release dates are not evaluation timestamps, and aggregate sample counts are not assumed to be harness-specific task counts. Mercor's grading description conflicts with parts of the original papers, so scoring follows the published leaderboard metric without claiming independent reproduction of its grader.

ProgramBench remains on Vals's almost-resolved metric, requiring at least 95% of behavioral tests, with no Mercor crosswalk. MedXpertQA MM remains unselected until Mercor's 200-question subset of the original 2,000-question test set is reproducibly identified.

Sources: [APEX-SWE](https://www.mercor.com/apex/apex-swe-leaderboard/), [SUPERChem](https://www.mercor.com/apex/oss-benchmarks/oss-super-chem-leaderboard/).

### ARC-AGI-3 Harness Policy

ARC-AGI-3 uses human-relative action efficiency over 55 semi-private environments per official harness. Standard uses provider-neutral text history and visible persistent notes; Provider Adapter uses provider-native continuous conversation, opaque reasoning state, and context compaction. Raw Standard and Provider Adapter rows remain separately attributable. For each exact base model and reasoning effort, the canonical score is their arithmetic mean when both are present and the single observed score when only one is present; missing harnesses are never imputed.

Standard and Provider Adapter costs are normalized per environment and scored against their own quality and resource references. Each source reserves half of the resource weight, including when the other is missing. Current Provider Adapter coverage is limited to GPT-6 Astra, so weak peer support keeps its resource contribution neutral until an independent comparison population exists.

The leaderboard's `AGI-3$` column shows Standard cost only. Provider Adapter has no separate table column; both harnesses remain available in resource comparisons and scoring.

### FrontierMath Erdős Policy

FrontierMath Erdős accepts only the fixed Epoch task `FrontierMath-Erdos`: one official attempt for each of 68 conjectures under the published 72-hour scaffold, with success requiring a complete Lean proof or disproof that Comparator replays against the trusted statement. Higher-budget repetitions, changed agents, and alternate scaffolds are excluded. The benchmark is admitted as a sparse breakthrough signal despite near-binary current results, and half importance limits instability from one attempt per problem, long-running stochastic agents, and overlap with FrontierMath Tier 4. Zero means no verified resolution under this scaffold rather than no mathematical capability. The August 2026 problem set remains the common denominator for current clean comparisons. Any future exclusion of publicly solved conjectures requires an explicit shared denominator; changing each model's task set separately would break comparability.

### Standalone Policies

**Agent Arena** uses the published Net Improvement point estimate directly as the raw benchmark value. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so no source-level probability conversion is applied. Quality scoring uses the shared observed-range linear normalization.

**Agents' Last Exam** uses `max(median_score, mean_score)` from the Full Overall split because partial-credit score is more informative than pass-rate accuracy. Resource totals are divided by evaluated task count, and displayed resources use the lower of the resulting median and mean per-task values.

**ALE-Bench** combines Sakana AI and Epoch at fixed 50/50 source weight, retaining both raw datasets. The Sakana `num_self_refine = 1` all-task mean and matched Epoch Performance are averaged in native Performance units, with no probability clamp. Missing counterparts use a model-held-out crosswalk with six overlapping models and median midpoint error at most 0.01 Performance points. Matched costs and tokens use arithmetic means when they pass the absolute resource agreement rule. Missing or divergent Epoch data does not discard successfully fetched Sakana observations.

**Blueprint-Bench 2** uses normalized connectivity similarity; Andon's internal identifiers are not model-matching inputs.

**AutomationBench** uses Zapier's official `task_completed_correctly` rate, which requires every final-state assertion for a task to pass. Partial credit remains diagnostic only. Model-effort rows remain distinct, combined fallback systems are excluded from standalone assignment, and only the official row's comparable per-task cost can affect Value.

**DeepSWE** uses pass@1 at each explicitly reported reasoning effort, attaching quality and resources from the same observation. The highest labelled effort remains the source default, but does not replace other reported efforts or fill an unreported effort. Mean duration and cost can affect Speed and Value; mean output tokens can supply the task-time fallback and the quality-adjusted Agentic token modifier.

**FrontierCode** uses Cognition 1.1 Main `new_score`; Main per-task cost can affect Value and token averages can supply Speed's task-time fallback. Explicit efforts match only their variants, the default follows the ordinary highest-labelled-effort rule, and proprietary SWE-1.7 and Composer 2.5 rows remain non-scoring.

**GDP.pdf** combines Surge's PDF-input run and Artificial Analysis's OCR-text-and-page-image run on the same 100-task set at fixed 50/50 quality weight. Both use strict all-criteria task success, but their input delivery and judges differ. Missing counterparts require the validated quality crosswalk; the sources remain separately attributable. Surge publishes no comparable task resources, so only Artificial Analysis's own per-attempt cost, runtime, and tokens can contribute, paired with its own observed quality.

**MLCR-AA** uses Artificial Analysis's headline accurate, complete, and concise pass rate across 60 held-out medical questions and three repeats. Its page-specific cost, runtime, and token totals are divided across 180 attempts. Public examples do not expose the private scored tasks, and judge disagreement limits this baseline observation.

**MLS-Bench Lite** uses baseline-normalized Performance across the 30-task Lite suite under Harbor's fixed five-hour budget. No MLS-Bench resource field affects Speed or Value.

**Omniscience** uses Accuracy from its dedicated Artificial Analysis evaluation page rather than the main model table.

**PerceptionBench** uses creator-published overall accuracy across 3,000 verified questions. Published effort and fallback disclosures remain provenance; component accuracies and resources do not enter scoring.

**Riemann-bench** uses the normalized public percentage directly.

**Terminal-Bench 4.0** combines official 66-task quality results with Artificial Analysis's full evaluation dataset at fixed 50/50 source weight. Official totals are normalized over 330 attempts; Artificial Analysis resources use 198 attempts. Official and Artificial Analysis cost, runtime, total-token, and output-token amounts fail absolute resource agreement and remain separate. Each source resource is scored against its own observed quality and reference population with half of the benchmark's resource weight. Resource columns and comparisons identify each source with a suffix.

**Terminal-Bench-Science 0.1** combines the official three-repeat 70-task quality series, Vals's single-run series, and Artificial Analysis's independent three-repeat series at fixed one-third source weights. Official cost and token totals are divided by 210; Vals's per-task resources pass through unchanged, and Artificial Analysis's totals are divided by 210. Cost, runtime, and token measurements stay source-specific, each paired with its source's observed quality and one-third of the benchmark's resource weight. Vals publishes no matching token measure. Expanded variants match exact efforts; collapsed rows select each source's highest reported effort and retain all source effort labels.

Both terminal benchmarks use validated quality crosswalks for missing counterparts, requiring six distinct overlapping models and model-held-out median midpoint error at most 2.5 percentage points. Terminal-Bench-Science fits each source pair only on measured exact-effort overlap; mapped counterparts never train another pair. Resource values never cross from one terminal source into another. Accepted quality crosswalks count as benchmark results for normalization, pairwise comparisons, contextual prediction, and quality admission. Source measurements and mapped counterparts remain separately attributable; resource gates still require their own source-specific evidence. Extrapolation remains marked because overlap validation does not establish out-of-range accuracy.

**Toolathlon** uses the reported score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

**Vending-Bench 2** uses average final money balance with ordinary observed min-max normalization. Run count and the 365-day average balance curve remain audit evidence; costs do not affect Speed or Value, and the result is interpreted as a stochastic simulation rather than a success rate.

**VoxelBench** uses the official text-prompt leaderboard’s Glicko-2 rating, with the same minimum of 50 votes as the public table. Native rating points remain in the source evidence and payload; the standard observed-range min-max conversion maps them to 0–100 for the table and both capability scores, as for Hemingway-bench. There is no fixed 2,500-point ceiling or probability interpretation. Labelled reasoning efforts and explicit thinking budgets stay separate. Published model slugs support exact matching, including dated releases; stealth aliases remain provenance and cannot override the displayed model identity. Successful refreshes replace each matched row’s rating and uncertainty together as votes evolve; failed refreshes retain cached evidence. Vote counts and rating deviation are retained as supporting evidence, not extra scores or Model Atlas evidence weights. Image-track ratings, duplicate win/loss summaries, and token list prices are not ingested; no VoxelBench resource contributes to Speed or Value. Generation-budget comparability and voting safeguards remain methodology caveats.

**WeirdML** combines creator `avg_acc` and Epoch accuracy at fixed 50/50 source weight. Model identity and effort establish pairs; release dates, score differences, and resource differences cannot veto an unambiguous identity match. Only model aliases at the same effort can establish a match; ambiguous duplicates remain excluded from fusion. Both sources are retained separately; missing counterparts require the shared six-model crosswalk with median midpoint error at most 2.5 percentage points.
