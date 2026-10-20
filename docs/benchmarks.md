# Benchmark Portfolio

A benchmark earns its place by adding credible information about model capability. This reference records the selected evaluations, their weights, the reasons for including them, and the source policies that keep results comparable. [Standards](standards.md) explains the selection criteria; [Methodology](methodology/overview.md) explains how the results become scores.

## Scoring Roles

Benchmarks have either a `frontier` or `baseline` role; aggregate indexes are listed separately. Frontier benchmarks contribute to :score[Intelligence] and :score[Agentic] according to their dimension allocations. Baseline results remain visible but do not contribute directly to either capability score. Eligible aggregate indexes contribute according to their dimension allocations. Rejected and watchlist benchmarks contribute no score.

The ranking has two quality dimensions:

| Dimension | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Solving difficult problems using knowledge, perception, understanding, abstract reasoning, and judgment | Frontier benchmarks with a non-zero Intelligence loading, plus eligible aggregate indexes |
| Agentic | Reliably turning goals and specifications into working results through instruction following, planning, coding, tool use, verification, and recovery | Frontier benchmarks with a non-zero Agentic loading, plus eligible aggregate indexes |

Writing, modifying, testing, debugging, and delivering software primarily test Agentic ability. A coding benchmark earns Intelligence weight when difficult algorithmic, mathematical, scientific, or research reasoning substantially determines success. A scientific topic or a difficult environment alone does not establish that demand. The task and its failure modes determine the loading; a final-output grader or harness name does not.

### Portfolio Settings

| Setting | Role |
| --- | --- |
| Group | Selects frontier benchmarks for both Intelligence and Agentic; baseline results remain visible |
| Importance | Standard policy: 1 for both individual benchmarks and aggregate indexes; represented index breadth supplies the aggregate multiplier |
| Allocation (dimension loading) | Intelligence/Agentic split: 100/0, 75/25, 50/50, 25/75, or 0/100 |

Base weight is importance × allocation. Both capability scores use frontier benchmark contributions. :score[Intelligence] blends its frontier [weighted mean](methodology/overview.md#weighted-mean) with shared frontier comparisons at 80% ordinary score and 20% pairwise score. The capability calculation multiplies individual benchmark weights by 1.5 when determining their relative share against eligible indexes; index weights use remaining represented breadth. See [Methodology](methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes). Score retention uses supported active benchmark weight and reaches full credit at 12. Evidence support and admission use their own weights without the 1.5 multiplier.

The allocation follows the five-level scale in [Standards](standards.md). Coding tasks are primarily Agentic evidence; an Intelligence share depends on substantial reasoning in the task's actual demands.

EnterpriseBench CoreCraft is the current importance exception at 0.5, as recorded in the table below.

Each table records the capability being measured and the reason for its weight. The source policies below specify which observations and resources per task are eligible.

### Resource Quality Coordinates

:score[Speed], :score[Value], and :score[Agentic] token adjustments compare resource use among models with similar benchmark quality. All benchmarks use linear quality coordinates: equal metric improvements have equal distance. The comparison width scales with each benchmark's observed range, so changing units or subtracting the minimum does not change peer weights. Resource amounts retain their logarithmic ratio comparison.

AA aggregate output tokens remain attached to its own Intelligence Index; index membership never supplies token evidence to constituent or cross-index benchmarks.

### Indexes

An aggregate index summarizes several evaluations. It offers broad coverage, but its components can overlap selected benchmarks and its source controls the aggregation. Keeping indexes separate makes that limitation visible.

| Index | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | 1 | 50% | 50% | Broad source-owned aggregate whose represented breadth is reduced for exact known standalone overlap. |
| CAIS Capabilities Index | 1 | 75% | 25% | Atlas-derived weighted coverage proxy across two Text and five Vision components. Exact component keys prevent directly observed CAIS benchmarks from receiving duplicate proxy weight. |
| Epoch Capabilities Index | 1 | 50% | 50% | Opaque broad fallback evidence assigned the fixed 8 median index breadth. |
| Surge Intelligence Index | 1 | 50% | 50% | Opaque professional-reasoning, writing, and agent evidence weighted by its declared breadth. |
| Vals Index | 1 | 50% | 50% | GDP-weighted finance, coding, legal, and tax evidence across eight component benchmarks. |

The table's index group also shows the Trust Me Bro and Slop Indexes, Model Atlas's dated community judgments of overall practical capability and visual output quality. They take no benchmark portfolio weight; [Methodology](methodology/intelligence-agentic.md#trust-me-bro-and-slop-indexes) describes their shared :score[Intelligence] correction.

Indexes remain separate from the frontier benchmark scores. Their share relative to frontier results uses 1.5 × importance × dimension allocation for available frontier results and importance × dimension allocation × represented breadth for eligible indexes after exact known overlap is deducted. Baseline results do not reduce index breadth in either capability. :score[Agentic] retains one benchmark-and-index evidence pool. Duplicate known constituents across two indexes divide one evidence unit rather than creating two. Effort-labelled variants use only effort-specific indexes, currently Artificial Analysis and CAIS; other index observations remain visible and retain their separate admission role. [Methodology](methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes) defines the full calculation and its separate evidence and admission rules.

### Frontier Benchmarks

These benchmarks provide demanding evidence that separates current leading models. Each row records the capability rationale and any reduction in importance.

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Agents'&nbsp;Last&nbsp;Exam | 1 | 25% | 75% | Long software and professional tasks deliberately stress instruction fidelity, tool use, recovery, and completion, while partial-credit grading preserves a secondary contribution from solution quality and domain reasoning. |
| ALE-Bench | 1 | 75% | 25% | Difficult heuristic optimization and algorithm design justify the Intelligence-heavy exception to the coding default. Implementing, running, and improving candidates through feedback contributes the secondary Agentic loading. |
| AnalystAgent | 1 | 75% | 25% | Correct quantitative analysis of supplied spreadsheets and documents is the primary construct. Choosing code and document operations contributes a secondary Agentic component, and published per-task resources can feed :score[Speed] and :score[Value]. |
| APEX&nbsp;Agents | 1 | 25% | 75% | Long-horizon professional-services tasks deliberately stress complex instructions, workplace-tool coordination, and persistent completion. Professional judgment remains a substantive secondary requirement. |
| ARC-AGI-3 | 1 | 50% | 50% | Rule discovery and predictive world-model construction and persistent action, feedback use, state management, and recovery independently determine success. The score is explicitly model-plus-harness evidence under the official aggregation policy below. |
| Arena&nbsp;Agent | 1 | 0% | 100% | Randomized Agent Mode sessions directly measure the orchestrator model's effect on successful completion, steerability, bash recovery, and tool reliability. The intended construct is Agentic, while domain reasoning is incidental to the sampled tasks. |
| AutomationBench | 1 | 0% | 100% | Zapier's official strict-completion metric tests whether a model leaves simulated SaaS applications in the fully required final state. Comparable standalone per-task cost can affect :score[Value]; combined fallback systems are excluded. |
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
| EBR-Bench | 1 | 25% | 75% | Repeated play measures exploration, learning from feedback, persistent notes, and stateful adaptation. Models remain far below expert human performance, and the task's distinct unsolved capability earns ordinary importance. |
| EMB | 1 | 75% | 25% | Correct financial-model construction and professional judgment dominate the score. Coordinating spreadsheet operations and multi-step requirements adds a secondary Agentic component. |
| EnigmaEval | 1 | 100% | 0% | Long multimodal puzzle-hunt problems require discovering hidden structure, synthesizing clues, and carrying out multi-step deductions. CAIS supplies broad current coverage; source version and original-versus-transcription format remain part of the adoption audit. |
| FrontierCode | 1 | 25% | 75% | Producing mergeable repository changes primarily measures reliable coding execution, constraint following, and verification. Architectural and algorithmic reasoning needed for difficult maintainer-defined tasks retains a secondary Intelligence loading. |
| FrontierMath Tier 4 | 1 | 100% | 0% | Epoch's hardest private FrontierMath tier is a current specialist mathematical-reasoning stress test. |
| GDP.pdf | 1 | 100% | 0% | Dense page-grounded rubrics measure professional document interpretation and judgment. PDF access is an input medium, not an independently scored Agentic capability. |
| GDPval-AA&nbsp;v2.1 | 1 | 75% | 25% | The quality of professional deliverables across economically important occupations is primary. Longer tool, file, and web trajectories add a secondary Agentic component when they materially support completion. |
| HANDBOOK.md | 1 | 25% | 75% | Enterprise tasks deliberately stress sustained policy adherence, long-context instructions, internal tools, and external MCP coordination. Domain reasoning is substantial but secondary to reliable constrained execution. |
| HLE | 1 | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| MirrorCode | 1 | 25% | 75% | Sustained whole-program reconstruction through documentation, black-box probing, implementation, and exhaustive testing primarily measures Agentic delivery. Inferring hidden behavior and program structure supplies secondary Intelligence evidence. |
| MysteryMechanism | 1 | 75% | 25% | Recovering hidden mathematical laws from sparse observations is primarily scientific and quantitative reasoning. Choosing a small number of experiments through a shell adds Agentic work, while 222 held-out mechanisms and private structural-probe grading leave substantial frontier headroom. |
| ProgramBench | 1 | 25% | 75% | Reconstructing programs through executable probing, implementation, compilation, and testing primarily measures Agentic ability. The selected Almost Resolved rate requires at least 95% of hidden tests to pass, while inferring hidden program semantics retains a secondary Intelligence loading. |
| Riemann-bench | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| RSI | 1 | 50% | 50% | Four long-horizon LLM R&D tasks demand substantive method and experiment judgment alongside sustained implementation, evaluation, and recovery. Atlas treats the publisher's RSI Index as one frontier task benchmark with ordinary importance, not an aggregate index with a represented-breadth multiplier. Models used different disclosed agent products, so the result is explicitly model-plus-agent evidence. |
| SRE Bench | 1 | 25% | 75% | Binary reverse engineering across protected programs primarily measures investigation, tool use, reconstruction, and verified execution. Inferring hidden semantics and protections supplies secondary Intelligence evidence, while deterministic grading and substantial headroom support frontier use despite sparse model coverage. |
| SpatialViz-Bench | 1 | 100% | 0% | Controlled mental rotation, folding, penetration, and animation tasks isolate spatial visualization as a distinct Intelligence capability. Programmatic generation and current top-model separation support frontier use, subject to confirming the CAIS configuration matches the paper task version. |
| SUPERChem | 1 | 100% | 0% | Expert-curated multimodal chemistry problems test advanced chemical reasoning. The selected published Pass@1 metric supplies frontier Intelligence evidence; reasoning-path fidelity and text-only runs remain separate. |
| Terminal-Bench 4.0 | 1 | 25% | 75% | Difficult containerized tasks deliberately require instruction fidelity, terminal-tool orchestration, state inspection, self-verification, and recovery. Technical reasoning is substantive, but the scored construct is primarily reliable workflow execution rather than coding. |
| Terminal-Bench-Science 0.1 | 1 | 75% | 25% | Scientific formulation and research-level analysis justify the Intelligence-heavy exception to the coding default. Implementing methods, coordinating terminal tools, and verifying results contribute the secondary Agentic loading. |
| TextQuests | 1 | 25% | 75% | Long-horizon interactive-fiction play requires exploration, state tracking, trial and error, recovery, and sustained planning. No-clues mean game progress is frontier Agentic evidence, with puzzle reasoning as a substantive secondary component. |
| WeirdML v3 | 1 | 75% | 25% | Discovering hidden structure and designing scientific or machine-learning methods justify Intelligence-heavy loading. Sustained experimentation, validation, and reliable artifact delivery contribute Agentic evidence; the official progress-sensitive score retains substantial frontier headroom. |

### Baseline Benchmarks

These benchmarks retain useful capability breadth or stability even when they do not provide the strongest frontier separation. Their results remain visible without directly contributing to either capability score, regardless of their listed allocation. Observed baseline results can inform validated estimates of missing frontier evidence.

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| APEX-SWE | 1 | 0% | 100% | Service integration and debugging with production-style telemetry measure software execution. Published Terminus-2 Pass@1 results provide a baseline Agentic observation; other harnesses cannot fill missing Terminus-2 rows. |
| ARC-AGI-2 | 1 | 100% | 0% | Novel abstract visual transformations retain protected fluid-reasoning breadth. Current serious systems approach the ceiling, so results remain baseline evidence rather than a primary frontier separator. |
| Arena WebDev | 1 | 0% | 100% | Building interactive web apps from specifications measures product construction, instruction fidelity, and reliable coding execution. Human comparisons judge functionality, usability, design, and fidelity; this is a specialist baseline like VoxelBench, with no separate exceptional reasoning demand established by the task design. |
| Chess Puzzles v2 | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| EnterpriseBench CoreCraft | 0.5 | 25% | 75% | Simulated-company tasks primarily measure instruction fidelity, workplace-tool coordination, and reliable workflow completion. Business reasoning is secondary, while one environment, first-party judges, and portfolio overlap keep it half importance. |
| ERQA | 1 | 100% | 0% | Multimodal embodied-reasoning questions add visual spatial, trajectory, action, and physical-world judgment coverage. It remains baseline because the current CAIS denominator and parse-failure treatment require source validation. |
| Finance Agent V2 | 1 | 50% | 50% | Financial reasoning and calculation and reliable filing retrieval, research, and tool use independently determine strict all-pass success. Its focused financial domain makes it stabilizing baseline evidence. |
| Hemingway-bench | 1 | 75% | 25% | Writing quality, originality, coherence, and emotional intelligence dominate expert preference. Explicit instruction adherence contributes a secondary Agentic component, while the relative Elo scale and focused domain keep it baseline. |
| IntPhys 2 | 1 | 100% | 0% | Video questions probe object permanence, continuity, immutability, and solidity under changing camera and scene conditions. It remains baseline until CAIS frame sampling and evaluated-subset provenance are confirmed. |
| MindCube Tiny | 1 | 100% | 0% | Multi-view spatial mental modeling and perspective changes add specialist visual-reasoning breadth. Current leaders approach the ceiling, so it is baseline rather than a primary frontier separator. |
| MLCR-AA | 1 | 100% | 0% | Long medical-record synthesis adds clinical chronology and causality reasoning beyond broad long-context tests. The 60 held-out questions across ten synthetic cases and judge disagreement keep it in the baseline group rather than making it a primary frontier claim. |
| Omniscience | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to distinguish the frontier leaders. |
| PerceptionBench | 1 | 100% | 0% | Short-answer questions isolate ten atomic visual capabilities across 3,000 verified examples. The narrow multimodal focus provides a distinctive Intelligence observation, while creator-run configurations and an automatic judge keep it baseline rather than a frontier missing-data claim. |
| Public Benefits Bench | 1 | 50% | 50% | Policy interpretation and case reasoning and reliable research and workflow completion independently determine success. Its focused domain keeps it baseline. |
| SimpleQA Verified | 1 | 100% | 0% | Broad factual recall under Epoch's current anti-abstention methodology adds general-knowledge coverage distinct from Omniscience's professional-domain focus. Public static questions and exposure risk keep it baseline. |
| Vending-Bench&nbsp;2 | 1 | 25% | 75% | Year-long simulated business operation deliberately measures sustained tool use, state management, negotiation, and coherence over thousands of messages. Business judgment is secondary, while small run counts and stochastic outcomes keep it baseline. |
| Vibe Code | 1 | 0% | 100% | Building working applications from specifications measures coding execution, service integration, state management, testing, recovery, and completion. The task design does not establish a separate exceptional algorithmic or scientific reasoning demand, so ordinary application construction stays fully Agentic. |
| VoxelBench | 1 | 50% | 50% | Text-to-voxel construction combines substantive spatial reasoning with reliable execution of scene requirements. Community preferences add distinctive construction evidence; less transparent generation and voting methodology keep this a specialist baseline with a measurement caveat. |

## Rejected Benchmarks

**MLS-Bench Lite** is rejected for the currently published results pending versioned clean reruns. The [publisher's October 6 correction](https://github.com/Imbernoulli/MLS-Bench/pull/104) confirms that agents could read scored test data in five of the 30 Lite tasks and that a September run selected methods using those splits. The leaderboard does not establish which scores were rerun after that correction. This compromises interpretation as generalizable ML research; thin model coverage and different disclosed agents alone would not justify rejection. A corrected, attributable result series requires renewed review.

**FrontierMath Erdős** is removed from the selected portfolio because its sparse, long-running open-problem evaluations are not sufficiently tractable to track as a continuing ranking signal. Verified resolutions remain valuable research evidence, but near-binary results, one stochastic attempt per problem, and the need to maintain a shared denominator as conjectures are solved limit routine comparability. FrontierMath Tier 4 retains the portfolio's research-mathematics coverage.

**ProofBench** is removed after reaching its baseline retirement condition: seven of eleven evaluated serious general systems score 99–100% on the comparable 100-task compiler-verified track. Formal proof construction remains a useful capability, but this edition's ceiling concentration no longer earns a separate portfolio entry. Specialized systems and different harness budgets are not pooled to infer this saturation.

**SciCode (original edition)** is rejected because demonstrated specification, test, and gold-answer defects materially compromise its scientific-coding signal. The [SciCode-Verified audit](https://arxiv.org/abs/2608.04975) reports score-suppressing defects across 58 of 64 verifiable main problems, and regrading unchanged model outputs recovers substantial numbers of correct solutions. The [released correction ledger](https://github.com/flyingwagner/scicode-verified/blob/main/analysis/defects.json) includes a weighted-Jacobi formula missing its relaxation term and invalid NURBS test inputs. [Artificial Analysis](https://artificialanalysis.ai/evaluations/scicode) still reports the original edition while reviewing the findings. Its standalone score, resources, and scheduled evaluation-page loading are removed; SciCode-Verified requires a separate admission review rather than replacing the original observations implicitly.

## Watchlist

Watchlist benchmarks remain outside the scoring portfolio. Time Horizon Index is currently non-scoring because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard required by [the standards](standards.md).

## Evidence Rules

### Compatibility and Defaults

Combining results is justified only when they refer to compatible tasks and versions, metrics, scoring protocols, units, aggregation, model identities, and reasoning efforts. For explicitly coding benchmarks, different harness rows remain distinct unless the benchmark defines how to aggregate them.

Declared source pairs use fixed 50/50 fusion, including mirrors: identical scores remain unchanged and differing scores are averaged. Missing counterparts require validation on overlapping variants. Two source rows still contribute one benchmark result, and ambiguous duplicates are excluded from fusion. Measurements from different methods stay separate unless a benchmark policy explicitly defines their combination.

An unlabelled observation is the source default. If every observation names an effort, the highest reported effort supplies the default as one complete observation. Individual effort rows still belong to their matching variants. Choosing one complete observation prevents a synthetic default assembled from the best field in each row.

### Shared Inputs

**Artificial Analysis** supplies its aggregate index and index-level resources from the complete model comparison dataset linked by its model-detail pages. The main leaderboard discovers a current model-detail page; its compact preview does not supply complete telemetry. Selected standalone AA benchmarks use the full datasets linked by their dedicated evaluation pages; unselected main-table fields, including `coding_index`, remain source context only. Missing time, price, or token data remains independently missing and never discards other valid measurements.

**OpenRouter** supplies current route pricing and provider speed measurements used for blended price and the provider serving-performance components. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

## Aggregate Index Policies

**Artificial Analysis Intelligence Index** uses the published v4.3.2 aggregate directly as one index observation, with represented breadth currently 10. The recorded constituents are AA-Briefcase v1.1, GDPval-AA v2.1, AutomationBench-AA, Terminal-Bench 4.0, SciCode, HLE, GDP.pdf, CritPt, AA-Omniscience, and AA-LCR v1.1. Their canonical benchmark keys allow exact direct and cross-index overlap deductions. Its own paired per-task cost, runtime, and output tokens can contribute under the resource rules in [Methodology](methodology/leaderboard-rules.md#resource-score-availability). This telemetry remains attached to the index and never fills missing standalone benchmark measurements.

SciCode remains a recorded constituent of the published AA index despite its standalone rejection. Removing the standalone benchmark does not remove its contribution inside the externally published aggregate; the index retains that grading caveat until Artificial Analysis revises its composition or evaluations.

**CAIS Capabilities Index** is derived from HLE, TextQuests, EnigmaEval, ERQA, IntPhys 2, MindCube Tiny, and SpatialViz-Bench with equal weight per component, expressed as `(2 × Text + 5 × Vision) / 7`. Directly observed components reduce its remaining weight, so a fully represented basket adds no second index vote. A disclosed composite fallback excludes that model from the aggregate while preserving its component values and provenance. CAIS supplies no per-task resource telemetry.

**Epoch Capabilities Index** uses the published ECI value with fixed represented breadth 8, the [median](methodology/overview.md#weighted-median-and-quantiles) of the fixed index baskets. Its model-specific fitted benchmark count remains source metadata but does not alter scoring weight. Component identities are not fully available for overlap accounting; the assigned breadth does not create missing benchmark measurements.

**Surge Intelligence Index** uses the published aggregate directly. It remains fallback evidence, and the absence of a reproducible index-level resource contract keeps it out of :score[Speed] and :score[Value].

**Vals Index** uses version 2.1’s published overall percentage directly, with represented breadth eight across finance, coding, legal, and tax work. Tax Agent joins the basket and Terminal-Bench 4.0 replaces the older terminal edition. Its source version, component task identities, source update date, and result provenance remain attached to persisted rows; superseded and unversioned editions are removed from retained benchmark evidence. The proprietary dataset mix remains aggregate fallback evidence, while its cost and latency lack a comparable per-task aggregation and remain outside :score[Speed] and :score[Value].

## Benchmark Source Policies

The [absolute resource agreement rule](methodology/speed-value.md#resource-comparability-across-sources) determines whether sources can share raw resource amounts. Sources that do not qualify receive separate resource scores with equal base weights; quality fusion is assessed separately.

Only non-default source, metric, selection, exclusion, and resource rules are detailed below. The portfolio tables remain authoritative for capability, class, importance, and dimension loading.

### Shared Source Families

**CAIS benchmark family:** TextQuests, EnigmaEval, ERQA, IntPhys 2, MindCube Tiny, and SpatialViz-Bench use the dashboard's component observations. These remain separate from the derived CAIS index and have no per-task resource telemetry.

**Artificial Analysis benchmark family:** AnalystAgent, Briefcase, CritPt, GDPval-AA v2.1, HLE, MLCR-AA, and Omniscience use their dedicated evaluation pages for both scores and any eligible resources. The shared model table does not supply their standalone scores.

AnalystAgent uses headline pass^5 across 80 private questions; its published totals are normalized per question before resource scoring. APEX Agents uses Mercor's creator-owned Loop Pass@1 leaderboard directly; model and reasoning-effort variants remain distinct, and missing benchmark-specific resources stay missing.

Briefcase and GDPval-AA v2.1 retain raw page Elo but normalize it with `clamp((Elo - 500) / 2000)` for scoring and linear resource comparison. GDPval may use the main-table normalized value as a compatible fallback after overlap validates the conversion. MLCR-AA resources cover 180 attempts. Missing benchmark-specific telemetry stays missing in observed graphs; the overall Artificial Analysis Intelligence Index cost or token average cannot replace it. Validated resource estimates from another effort of the same model may contribute discounted scoring evidence without becoming observed graph points.

**ARC Prize benchmark family:** ARC-AGI-2 and ARC-AGI-3 use only the official verified semi-private leaderboard and discard public-demo, community, competition, custom, refinement, and synthesis systems. ARC-AGI-2 uses task success and reported task cost. These costs affect :score[Value] only within their respective benchmarks.

**Epoch benchmark family:** FrontierMath Tier 4, Chess Puzzles v2, EBR-Bench, MirrorCode, and SimpleQA Verified use successful runs from Epoch's bulk benchmark data. FrontierMath Tier 4 is restricted to the exact v2-private task. MirrorCode accepts only `mirrorcode-ml-2l-*` runs for the ML, private-tests, two-language configuration. SimpleQA Verified accepts only task version 1.2.0 under the `SimpleQA Verified (anti-abstention)` method and excludes the source-flagged `qwen3-max-2025-09-23` row.

**Surge benchmark family:** Chartography, ComplexConstraints, DAYJOB: Finance, DAYJOB: Healthcare, HANDBOOK.md, and EnterpriseBench CoreCraft use published percentages; ComplexConstraints uses all-criteria task pass. The DAYJOB percentages are treated as mean rubric credit across five attempts, matching the released RewardKit scoring default and reproduction instructions; the dataset cards instead describe strict all-criteria success, so that publisher discrepancy remains provenance rather than a change to the selected metric. Finance's card claims 80 scored tasks, but only 50 are public and the exact leaderboard task set is unverified. Hemingway-bench retains its expert-preference Elo rather than converting it to a percentage, and Surge page-local resources do not affect :score[Speed] or :score[Value].

**Vals benchmark family:** BioMysteryBench, Code Migration, EMB, MysteryMechanism, Public Benefits Bench, and Vibe Code use `overall`; Finance Agent V2 uses `all_pass`, ProgramBench uses `almost`, and SRE Bench uses `partial`. BioMysteryBench `overall` is mean accuracy across three full 90-task runs, while its human-difficult split remains diagnostic. MysteryMechanism `overall` is functional-recovery accuracy across 222 held-out mechanisms. ProgramBench `almost` is the share of tasks passing at least 95% of hidden behavioral tests. SRE Bench `partial` is its Capability Score across 1,572 objectives in 262 binary instances; its Fully Solved rate remains supporting context. Vals cost and latency remain outside :score[Speed] and :score[Value], and these benchmarks are not Time Horizon evidence.

**RSI benchmark:** The publisher's current four-task suite still carries version 1.1. Its overall score is the mean of four reference-anchored task scores, each mapped to 0 at its starter and 0.5 at a selected reference. Atlas counts that single score once as direct benchmark evidence; Compression, LM Training, Harness Engineering, and Post-Training remain raw diagnostic rows and never become four additional scoring inputs. The declared task set and aggregate metric identify this suite despite the reused version label; superseded suites are removed from retained benchmark evidence. The results compare model-plus-agent systems because Claude, GPT, Gemini, and other model families used different disclosed agent products. Published RSI cost and duration do not affect :score[Speed] or :score[Value].

### Mercor Chemistry and Software Engineering

**SUPERChem** uses Mercor's published `pass-1` result from the 500-question multimodal release series. Text-only runs and reasoning-path fidelity scores remain separate. **APEX-SWE** uses Mercor's `pass-1` results under `terminus-2`; Inspect results remain raw provenance and cannot fill missing Terminus-2 observations.

Both sources retain exact reported effort, original result fields, uncertainty, and sample counts. Model release dates are not evaluation timestamps, and aggregate sample counts are not assumed to be harness-specific task counts. Mercor's grading description conflicts with parts of the original papers, so scoring follows the published leaderboard metric without claiming independent reproduction of its grader.

ProgramBench remains on Vals's almost-resolved metric, requiring at least 95% of behavioral tests, with no Mercor crosswalk. MedXpertQA MM remains unselected until Mercor's 200-question subset of the original 2,000-question test set is reproducibly identified.

Sources: [APEX-SWE](https://www.mercor.com/apex/apex-swe-leaderboard/), [SUPERChem](https://www.mercor.com/apex/oss-benchmarks/oss-super-chem-leaderboard/).

### ARC-AGI-3 Harness Policy

ARC-AGI-3 uses human-relative action efficiency over 55 semi-private environments per official harness. Standard uses provider-neutral text history and visible persistent notes; Provider Adapter uses provider-native continuous conversation, opaque reasoning state, and context compaction. Raw Standard and Provider Adapter rows remain separately attributable. For each exact base model and reasoning effort, the canonical score is their arithmetic mean when both are present and the single observed score when only one is present; missing harnesses are never imputed.

Standard and Provider Adapter costs are normalized per environment and scored against their own quality and resource references. Each source reserves half of the resource weight, including when the other is missing. Peer support is evaluated within each harness; insufficient independent comparisons keep that harness's resource contribution neutral.

The leaderboard's `AGI-3$` column shows Standard cost only. Provider Adapter has no separate table column; both harnesses remain available in resource comparisons and scoring.

### Standalone Policies

**Chess Puzzles v2** uses Epoch's current submission-tool harness with a one-million-output-token budget and exact-move grading across 100 positions. The selected edition accepts task revisions 2.0.0 and 2.0.1, both used on Epoch's current v2 leaderboard; 2.0.1 repairs an oversized OpenAI reasoning continuation without changing other samples. The [publisher's changelog](https://github.com/epoch-research/chess-puzzles-mirror/blob/main/bench/task/chess_puzzles/CHANGELOG.md) identifies v1's one-call protocol and LLM answer extraction as incompatible. V1 observations are excluded from current scores, cache fallback, and retained calibration evidence; future task revisions require an explicit compatibility decision.

**CritPt** remains frontier research-physics evidence under Artificial Analysis's full 70-problem, no-agent protocol. Its [current source notice](https://artificialanalysis.ai/evaluations/critpt) describes an expert audit following external feedback, without publishing a completed defect inventory or revised grading results. Current serious systems retain substantial nominal headroom and broader cohort separation, although the leading models cluster closely and their exact ordering is unresolved. Reassess the role after the audit and comparable reruns: reliable physics breadth with weak frontier separation supports baseline, while demonstrated material grading compromise requires reconsidering inclusion. Tool-assisted results published elsewhere remain separate from this selected protocol.

**Arena Agent** uses the published Net Improvement point estimate from Arena's [live leaderboard](https://arena.ai/leaderboard/agent), with its [official dated dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/viewer/agent/latest) as a fallback when the website cannot return usable rows. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so no source-level probability conversion is applied. Quality scoring uses the shared observed-range linear normalization. Fresh publication scores and ranks replace earlier measurements. Raw rows retain their actual source URL, publication date, and disclosed model and effort identity; dataset labels are not represented as website contender IDs. Arena Agent contributes quality evidence only; task costs are excluded from ingestion, display, and resource scoring.

**Arena WebDev** uses the Overall human-vote rating in native points from Arena's [live leaderboard](https://arena.ai/leaderboard/code/webdev), with its [official dated dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/viewer/webdev/latest) as the same website-first fallback policy and shared observed-range normalization for display. Other categories and unranked or unvoted estimates are excluded. Published model names, source configuration identities, explicitly disclosed harnesses, reasoning efforts, budgets, vote counts, rating intervals, and available publication dates or vote cutoffs remain attached to raw observations. Dataset identities are explicitly derived from published names and occurrences, not claimed to be website configuration IDs. Multiple configurations sharing one model and effort remain inspectable but are excluded from model assignment rather than averaged or selected by rating. Fresh publications replace earlier ratings and uncertainty together. No WebDev resource measurement enters scoring.

**Arena publication freshness** is separate from successful retrieval. The [dataset history](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/commits/main) checked on October 20, 2026 showed recurring subset-specific uploads, usually carrying the previous day's publication, without a guaranteed update schedule. The dataset can lag the live website even when publication dates match. Where cached publication dates are known, an older fetched publication cannot replace newer evidence, and a dataset fallback cannot replace website evidence from the same date. An accepted publication replaces the complete rolling row set, preventing website and dataset configuration identities from being pooled as independent observations. Failed or rejected refreshes preserve cached rows and their fetch timestamp. Unknown historical publication dates stay unknown; they are not inferred from retrieval dates.

**Agents' Last Exam** uses `max(median_score, mean_score)` from the Full Overall split because partial-credit score is more informative than pass-rate accuracy. Resource totals are divided by evaluated task count, and displayed resources use the lower of the resulting median and mean per-task values.

**ALE-Bench** combines Sakana AI and Epoch at fixed 50/50 source weight, retaining both raw datasets. The Sakana `num_self_refine = 1` all-task mean and matched Epoch Performance are averaged in native Performance units, with no probability clamp. Missing counterparts use a model-held-out crosswalk with six overlapping models and median midpoint error at most 0.01 Performance points. Matched costs and tokens use arithmetic means when they pass the absolute resource agreement rule. Missing or divergent Epoch data does not discard successfully fetched Sakana observations.

**Blueprint-Bench 2** uses normalized connectivity similarity; Andon's internal identifiers are not model-matching inputs.

**AutomationBench** uses Zapier's official `task_completed_correctly` rate, which requires every final-state assertion for a task to pass. Partial credit remains diagnostic only. Variant rows remain distinct, combined fallback systems are excluded from standalone assignment, and only the official row's comparable per-task cost can affect :score[Value].

**DeepSWE** uses pass@1 at each explicitly reported reasoning effort, attaching quality and resources from the same observation. The highest labelled effort remains the source default, but does not replace other reported efforts or fill an unreported effort. Mean duration and cost can affect :score[Speed] and :score[Value]; mean output tokens can supply the task-time fallback and the quality-adjusted :score[Agentic] token multiplier.

**FrontierCode** uses Cognition 1.1 Main `new_score`; Main per-task cost can affect :score[Value] and token averages can supply :score[Speed]'s task-time fallback. Explicit efforts match only their variants, the default follows the ordinary highest-labelled-effort rule, and proprietary SWE-1.7 and Composer 2.5 rows remain non-scoring.

**FrontierMath Tier 4** retains the public v2 benchmark name and selects Epoch’s latest declared evaluation-task revision, 2.1.0, under `FrontierMath-Tier-4-v2-Private`. The task revision labels aggregate model evaluations, not individual mathematics questions or a separately published v2.1 benchmark. Only the selected task revision remains in raw and retained benchmark evidence; superseded revisions cannot supply scores or historical calibration inputs.

**GDP.pdf** combines Surge's PDF-input run and Artificial Analysis's OCR-text-and-page-image run on the same 100-task set at fixed 50/50 quality weight. Both use strict all-criteria task success, but their input delivery and judges differ. Missing counterparts require the validated source crosswalk; the sources remain separately attributable. Surge publishes no comparable task resources, so only Artificial Analysis's own per-attempt cost, runtime, and tokens can contribute, paired with its own observed quality.

**MLCR-AA** uses Artificial Analysis's headline accurate, complete, and concise pass rate across 60 held-out medical questions and three repeats. Its page-specific cost, runtime, and token totals are divided across 180 attempts. Public examples do not expose the private scored tasks, and judge disagreement limits this baseline observation.

**Omniscience** uses Accuracy from its dedicated Artificial Analysis evaluation page rather than the main model table.

**PerceptionBench** uses creator-published overall accuracy across 3,000 verified questions. Published effort and fallback disclosures remain provenance; component accuracies and resources do not enter scoring.

**Riemann-bench** uses the normalized public percentage directly.

**Terminal-Bench 4.0** combines official 66-task quality results with Artificial Analysis's full evaluation dataset at fixed 50/50 source weight. Official totals are normalized over 330 attempts; Artificial Analysis resources use 198 attempts. Official and Artificial Analysis cost, runtime, total-token, and output-token amounts fail absolute resource agreement and remain separate. Each source resource is scored against its own observed quality and reference population with half of the benchmark's resource weight. Resource columns and comparisons identify each source with a suffix.

**Terminal-Bench-Science 0.1** combines the official three-repeat 70-task quality series, Vals's single-run series, and Artificial Analysis's independent three-repeat series at fixed one-third source weights. Official cost and token totals are divided by 210; Vals's per-task resources pass through unchanged, and Artificial Analysis's totals are divided by 210. Cost, runtime, and token measurements stay source-specific, each paired with its source's observed quality and one-third of the benchmark's resource weight. Vals publishes no matching token measure. Expanded variants match exact efforts; collapsed rows select each source's highest reported effort and retain every effort label each source reports.

Both terminal benchmarks use validated source crosswalks for missing counterparts, requiring six distinct overlapping models and model-held-out median midpoint error at most 2.5 percentage points. Terminal-Bench-Science fits each source pair only on measured exact-effort overlap; mapped counterparts never train another pair. Resource values never cross from one terminal source into another. Accepted source crosswalks count as benchmark results for normalization, pairwise comparisons, imputation from other benchmarks, and quality admission. Source measurements and mapped counterparts remain separately attributable; resource gates still require their own source-specific evidence. Extrapolation remains marked because overlap validation does not establish out-of-range accuracy.

**Vending-Bench 2** uses average final money balance with ordinary observed-range [linear scaling](methodology/overview.md#linear-scaling-and-clamping). Run count and the 365-day average balance curve remain audit evidence; costs do not affect :score[Speed] or :score[Value], and the result is interpreted as a stochastic simulation rather than a success rate.

**VoxelBench** uses the official text-prompt leaderboard’s Glicko-2 rating, with the same minimum of 50 votes as the public table. Native rating points remain in the source evidence and payload; standard observed-range linear scaling maps them to 0–100 for the table and both capability scores, as for Hemingway-bench. There is no fixed 2,500-point ceiling or probability interpretation. Labelled reasoning efforts and explicit thinking budgets stay separate. Published model slugs support exact matching, including dated releases; stealth aliases remain provenance and cannot override the displayed model identity. Successful refreshes replace each matched row’s rating and uncertainty together as votes evolve; failed refreshes retain cached evidence. Vote counts and rating deviation are retained as supporting evidence, not extra scores or Model Atlas evidence weights. Image-track ratings, duplicate win/loss summaries, and token list prices are not ingested; no VoxelBench resource contributes to :score[Speed] or :score[Value]. Generation-budget comparability and voting safeguards remain methodology caveats.

**WeirdML v3** combines the creator's published overall `score` and Epoch's supporting v3 mirror at the declared fixed 50/50 source weight. The official score spans 11 scientific and machine-learning tasks and rewards 80% area under the best-so-far progress curve on the log-token axis from 500,000 to 50 million tokens and 20% final-best performance; purchased hints carry the publisher's penalties. The creator's prepared summary supplies the overall result without reconstructing it from task scores. Missing counterparts require six distinct overlapping models and model-held-out median midpoint error at most 0.025 score units. Provider/model identity, reasoning effort, and agent reconcile labels while preserving both raw scores and disclosed harness versions; differing run counts or additional versions of the same agent remain cohort context. Multiple agents for one model and effort remain raw evidence but cannot supply a model assignment. Both sources retain uncertainty and run counts, and creator hint/no-hint task summaries remain attributable. Version 2 accuracy is not compatible with this series. Published cost and output-token means remain diagnostic and do not contribute to resource scoring.
