# Benchmark Portfolio

This document records which benchmarks affect Model Atlas, what capability each one measures, how much it contributes to Intelligence and Agentic scores, and which source evidence enters the ranking. [Benchmark standards](standards.md) define admission and classification; [Methodology](methodology.md) defines the scoring mathematics.

## Scoring Roles

Accepted task-level benchmarks are classified as `frontier` or `baseline` under [the standards](standards.md). Aggregate indexes are listed separately. Group labels describe portfolio role; the group itself does not change benchmark weight or missing-evidence treatment. Rejected and watchlist benchmarks do not affect the ranking.

The ranking has two quality dimensions:

| Dimension | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Factual accuracy, hard reasoning, professional knowledge, and structured problem solving outside harness or tool execution | Benchmarks with a non-zero Intelligence loading |
| Agentic | Tool-mediated execution, instruction following, self-verification, reliability under constraints, and work-like task completion | Benchmarks with a non-zero Agentic loading |

There is no standalone coding score. Coding difficulty does not automatically make a benchmark Agentic. Static coding and scientific programming primarily contribute to Intelligence when they test knowledge, reasoning, or problem formulation. Coding benchmarks primarily contribute to Agentic when they require tools, repository or file manipulation, terminal execution, or harnessed workflow completion.

### Portfolio Settings

| Setting | Role |
| --- | --- |
| Group | Classifies the benchmark as `frontier` or `baseline` for portfolio interpretation |
| Importance | Controls the benchmark's total influence relative to other observed benchmarks |
| Dimension loading | Allocates that importance between Intelligence and Agentic; the two loadings sum to 100% |

For benchmark $b$ in dimension $D$, the effective weight $w_{b,D}=\operatorname{benchmarkImportance}_b\operatorname{dimensionLoading}_{b,D}$ combines importance with dimension loading. Group does not change the contribution of an observed value, and source identity does not determine group.

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

### Indexes

Indexes aggregate multiple evaluations into broad fallback coverage. They remain separate from task-level benchmarks because their component overlap and source-owned aggregation limit how independently they should influence the ranking.

| Index | Group | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | --- | ---: | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | Baseline | 0.5 | 50% | 50% | Broad fallback evidence with substantial overlap with selected task-level benchmarks. |
| Epoch Capabilities Index | Baseline | 0.5 | 50% | 50% | Broad fallback evidence whose source-owned aggregation does not publish a fixed underlying count per model row. |
| Surge Intelligence Index | Baseline | 0.5 | 50% | 50% | Broad fallback evidence with overlapping professional, reasoning, agentic, and writing evaluations. |
| Vals Index | Baseline | 0.5 | 50% | 50% | Broad fallback evidence with overlap across finance, coding, and legal evaluations. |

When a recent preview has aggregate indexes as its only observed quality evidence, those indexes are combined by the number of benchmarks they represent: Artificial Analysis 9, Epoch 8, Surge 8, and Vals 7. Epoch uses the median of the other three represented counts because its exact underlying count is unavailable per model row. These index-only preview counts do not replace the normal portfolio importance of 0.5.

### Frontier Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Agent&nbsp;Arena | 1 | 0% | 100% | Randomized real-world Agent Mode sessions estimate the orchestrator model's causal effect across confirmed success, praise versus complaint, steerability, bash recovery, and tool hallucination. The large current sample and direct workflow signal earn frontier status, while the score remains relative to Arena's time-weighted model and task distribution. |
| Agents'&nbsp;Last&nbsp;Exam | 1 | 20% | 80% | Real-world software and professional workflows. It combines professional knowledge with harnessed task execution, so it contributes to both dimensions but primarily Agentic. |
| ALE-Bench | 1 | 40% | 60% | Heuristic-programming tasks require algorithm design, executable code, and benchmark-harness interaction. The mix supports both dimensions, with more weight on Agentic execution. |
| AnalystAgent | 1 | 20% | 80% | Quantitative business and scientific questions require substantive analysis across supplied spreadsheets and documents inside a code-enabled research workflow. It contributes to both dimensions but primarily measures Agentic execution, and Artificial Analysis's published per-task resources can feed Speed and Value. |
| APEX&nbsp;Agents | 1 | 0% | 100% | Long-horizon professional-services workflows with realistic tooling, rubrics, and domain constraints. The signal is pure agentic task completion. |
| ARC-AGI-2 | 1 | 100% | 0% | Novel abstract visual transformations provide a protected frontier test of fluid reasoning. The current semi-private leaderboard has strong separation across serious systems, while its fixed demonstration-to-answer protocol is Intelligence evidence rather than external workflow execution. |
| ARC-AGI-3 | 1 | 80% | 20% | Unfamiliar interactive environments test rule discovery, abstraction, and efficient adaptation under feedback. The sparse current distribution makes it a sharp frontier signal; most weight belongs to Intelligence, with a smaller Agentic loading for sequential action and environment interaction. |
| AutomationBench | 1 | 0% | 100% | Artificial Analysis implementation of Zapier workflow-automation tasks over simulated SaaS app environments. It is frontier because it tests business-process execution with tool-like constraints, and its AA per-task resources can feed Speed and Value. |
| Blueprint-Bench&nbsp;2 | 1 | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | 1 | 25% | 75% | Long-horizon professional knowledge work over multi-file deliverables. File management and extended execution make it primarily Agentic, with Intelligence credit for professional reasoning and synthesis. |
| Chartography | 1 | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. It is a current Intelligence-only stress test with meaningful frontier spread. |
| ComplexConstraints | 1 | 100% | 0% | Realistic professional writing, scheduling, and planning tasks test whether models can satisfy many interdependent, conditional, implicit, and multistep requirements at once. The all-criteria task-pass metric makes it a sharp frontier instruction-following signal without a tool-execution component. |
| CritPt | 1 | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| CursorBench | 1 | 0% | 100% | Ambiguous, multi-file tasks from real editor sessions separate current coding agents on practical workflow execution. |
| DeepSWE | 1 | 0% | 100% | Repository-level coding tasks test long-horizon reasoning, editing, and code execution. |
| EMB | 1 | 25% | 75% | Expert work completed through a multi-step environment combines professional reasoning with predominantly Agentic workflow execution. Current Vals results make it a frontier separator. |
| FrontierCode | 1 | 0% | 100% | Repository-scale coding-agent tasks measure code quality and mergeability, providing a pure Agentic workflow signal. |
| FrontierMath Tier 4 | 1 | 100% | 0% | Epoch's hardest private FrontierMath tier is a current specialist mathematical-reasoning stress test. |
| GDP.pdf | 1 | 90% | 10% | Professional PDF understanding with dense page-grounded rubrics. It is mostly document intelligence, with a small execution-reliability component. |
| GDPval-AA&nbsp;v2 | 1 | 60% | 40% | Real professional deliverables across economically important occupations. Mostly professional reasoning and synthesis, with substantial agentic credit for AA v4.1's longer tool/file/web trajectories and human-baselined work completion. |
| HANDBOOK.md | 1 | 0% | 100% | Long-context enterprise work over 65 tasks in five domains, with four trials per model and deterministic grading. The benchmark primarily measures sustained instruction-following and workflow execution. |
| Harvey LAB | 1 | 0% | 100% | Private legal-agent tasks remain difficult and strongly separated among frontier models. Working in a sandbox over matter files and producing legal work product makes the signal fully Agentic. |
| HLE | 1 | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| ITBench | 1 | 0% | 100% | Kubernetes incident root-cause investigations provide a current frontier Agentic stress test with strong spread across realistic tool-mediated SRE work. |
| Legal Research | 1 | 20% | 80% | Professional legal research requires substantive reasoning inside a tool-mediated research workflow. Current Vals results retain enough headroom and separation to serve as a frontier benchmark. |
| MLS-Bench Lite | 1 | 40% | 60% | Iterative machine-learning research across 30 controlled tasks combines method design with five hours of harnessed experimentation. The benchmark supplies both Intelligence and Agentic evidence, with more weight on executing and validating improvements in the agent environment. |
| ProgramBench | 1 | 20% | 80% | Programming tasks combine problem formulation with executable workflow completion. Current Vals results retain frontier pressure, with most weight assigned to Agentic execution. |
| ProofBench | 1 | 70% | 30% | Private compiler-verified theorem proving emphasizes mathematical reasoning, while the multi-turn proof-development harness contributes a smaller Agentic component. |
| Riemann-bench | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| Terminal-Bench 4.0 | 1 | 0% | 100% | Difficult containerized tasks across software, infrastructure, data, and technical workflows measure terminal-agent execution with substantial headroom among current systems. |

### Baseline Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| BrowseComp | 1 | 0% | 100% | Web/research solving where browsing behavior matters more than static knowledge. It stays baseline because public web tasks have higher contamination exposure and less frontier-like top spread. |
| Chess Puzzles | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| Code Migration | 1 | 20% | 80% | Repository migration requires code understanding and predominantly Agentic multi-file execution. It provides useful practical coverage but remains baseline rather than a frontier missing-data claim. |
| CyberBench | 1 | 0% | 100% | Practical cybersecurity tasks are scored as pure Agentic workflow evidence. The focused domain and Vals-specific harness keep the benchmark in baseline. |
| EBR-Bench | 0.5 | 0% | 100% | Repeated play of the unfamiliar Earthborne Rangers campaign tests whether an agent can learn from experience through exploration and persistent notes. The narrow game environment, small current leaderboard, and simple benchmark harness make it useful Agentic evidence at half importance rather than a broad frontier workflow claim. |
| EnterpriseBench CoreCraft | 0.5 | 0% | 100% | Enterprise workflows inside one simulated company provide practical Agentic breadth. The single-company environment, first-party judge rubrics, and overlap with other agent benchmarks keep it stabilizing half-weight evidence. |
| Finance Agent V2 | 1 | 20% | 80% | Finance research and analysis combine domain reasoning with predominantly Agentic workflow execution. The domain-specific Vals harness makes it stabilizing baseline evidence. |
| Hemingway-bench | 1 | 100% | 0% | Expert pairwise preferences across creative, business, and everyday writing supply a distinct output-quality and writing-judgment signal. Its relative Elo scale and focused domain make it stabilizing Intelligence evidence rather than a broad frontier claim. |
| Omniscience&nbsp;Accuracy | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to distinguish the frontier leaders. |
| PerceptionBench | 1 | 100% | 0% | Short-answer questions isolate ten atomic visual capabilities across 3,000 verified examples. The narrow multimodal focus provides distinctive Intelligence breadth, while creator-run configurations and an automatic judge keep it baseline rather than a frontier missing-data claim. |
| Public Benefits Bench | 1 | 20% | 80% | Public-benefits case work combines policy reasoning with predominantly Agentic research and workflow execution. It remains a focused baseline signal. |
| SciCode | 1 | 80% | 20% | Scientist-curated Python problems. The main signal is scientific problem formulation and structured reasoning; executable code correctness adds a smaller execution signal. |
| tau3&nbsp;Banking&nbsp;(AA) | 1 | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It remains useful domain workflow evidence, but its current rank agreement and tight top spread make it a stabilizing baseline signal rather than a frontier separator. |
| Toolathlon | 1 | 0% | 100% | Multi-tool workflow execution across files, APIs, business applications, and other external environments. Its planning and domain reasoning occur inside the harnessed workflow, so the signal is fully Agentic; limited current row count and provenance keep it baseline. |
| Vending-Bench&nbsp;2 | 1 | 0% | 100% | Year-long simulated business operation tests sustained tool use, inventory, pricing, negotiation, and coherence over thousands of messages. Its long horizon is distinctive, but the small run count and stochastic trading-like outcome make it stabilizing baseline evidence rather than a frontier missing-data claim. |
| Vibe Code | 1 | 0% | 100% | End-to-end software creation in a coding-agent environment is pure Agentic evidence. Its product-building focus provides useful baseline coverage without a frontier missing-data claim. |
| WeirdML | 1 | 60% | 40% | ML-programming tasks test model selection and implementation across 17 datasets. Problem formulation is the larger Intelligence component, while executable code generation contributes Agentic evidence. |

Frontier benchmarks provide the strongest current separation, baseline benchmarks provide vetted task-level breadth and stability, and indexes provide broad aggregate fallback coverage at normal importance 0.5. Every index uses a neutral 50% Intelligence and 50% Agentic loading because the source aggregates mix capability types under incompatible or undisclosed weighting schemes; this is a Model Atlas allocation heuristic, not a reconstruction of each publisher's component weights. Only an index-only preview uses represented benchmark counts of nine for Artificial Analysis, eight for Epoch, eight for Surge, and seven for Vals. Importance owns score influence, while group labels remain descriptive portfolio categories.

## Watchlist

Watchlist benchmarks remain outside the scoring portfolio. Time Horizon Index is currently non-scoring because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard required by [the standards](standards.md).

## Source Rules

### Compatibility

Rows are not equivalent merely because their benchmark and model labels overlap. Before combining sources, Model Atlas compares the task set and version, metric definition, scoring protocol, harness and run configuration, units, aggregation rule, model identity, and reasoning effort.

A source crosswalk is valid only when both sources measure the same underlying task under compatible protocols. Their overlap must validate any identity, scale, or unit conversion, and the benchmark-specific policy must decide which source wins when both report the same observation. Canonical observations are not averaged with duplicate mirrors.

Methodologically different measurements remain separate evidence. A crosswalk or median cannot make incompatible tasks, harnesses, or metrics comparable. The only exception is an explicit multi-harness policy that documents both score aggregation and resource aggregation.

### Reasoning effort

An unlabelled configuration is the source default. When every configuration is labelled, the highest reported effort becomes the default as one complete runnable observation. Model Atlas never constructs a synthetic default by combining the best fields from different efforts.

Explicit effort observations stay attached to their matching scored variants, and raw source evidence retains every reported effort row.

### Shared Inputs

**Artificial Analysis** supplies its broad aggregate indexes and index-level resource metadata from the main model table. Every selected task-level AA benchmark instead takes both its score and available resource telemetry from its dedicated evaluation page. GPQA, MMMU-Pro, and other main-table fields can remain visible as source context when present, but they are not selected benchmark inputs unless listed in the benchmark portfolio. AA's `coding_index` likewise remains source context and does not compute a standalone score.

**OpenRouter** supplies current route pricing and provider speed measurements used for blended price and the provider serving-performance components. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

## Index-Specific Policies

**Artificial Analysis Intelligence Index** uses Artificial Analysis's published aggregate score directly with half importance and the shared neutral 50% Intelligence and 50% Agentic index loading. Its overlap with selected task-level benchmarks makes it a stabilizing fallback rather than nine independent observations in normal scoring. Artificial Analysis also publishes per-index-task cost, runtime, and output-token measurements; Model Atlas preserves those source facts, but the index itself does not receive a separate Speed or Value contribution.

**Epoch Capabilities Index** uses Epoch's published ECI value directly with half importance and the shared neutral 50% Intelligence and 50% Agentic index loading and preserves model-version identifiers, access category, organization, and observation date. ECI is broad stabilizing evidence in normal scoring; its represented count is used only when a preview has no task-level quality evidence.

**Surge Intelligence Index** uses its published aggregate score directly with half importance and the shared neutral 50% Intelligence and 50% Agentic index loading. Its component overlap makes it a stabilizing fallback in normal scoring. Surge does not disclose an index-level cost, runtime, token, or reproducible resource aggregation contract, so the index does not feed Speed or Value.

**Vals Index** uses the overall percentage score as a normalized benchmark score with half importance and the shared neutral 50% Intelligence and 50% Agentic index loading and preserves the component task rows for source audit/display only. The official page labels the index proprietary and describes non-public Vals-built datasets, while the published formula also includes public coding benchmarks. Model Atlas therefore treats it as a useful aggregate baseline, not a pure frontier source. Its reported cost and latency stay out of Speed and Value because they are Vals harness-local measurements rather than comparable task-resource inputs.

## Benchmark-Specific Policies

**Agent Arena** uses the published Net Improvement point estimate directly as the raw benchmark value. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so Model Atlas applies its ordinary observed per-benchmark min-max normalization without a sigmoid transform.

**Agents' Last Exam** uses `max(median_score, mean_score)` from the Full Overall split. Raw source rows preserve total runtime, token counts, and cost. Each harness row divides those totals by its evaluated task count, and the displayed ALE resource columns use the lower of the resulting median and mean per-task values. Partial-credit score is the scoring input because it is more informative than pass-rate accuracy.

**ALE-Bench** uses Sakana AI's complete leaderboard as the observed source and Epoch AI's overlapping rounded table as a refresh-time scale validator. The scoring row is `num_self_refine = 1`, meaning the source-default selected candidate before feedback-driven refinement loops, and its all-task mean Performance enters ordinary observed min-max normalization. The same native Performance value enters resource-quality neighborhoods linearly, so values above 100 remain distinct instead of being treated as percentages and collapsed at the logit ceiling. Higher refinement checkpoints, all/short/long mean, median, min, max, and standard deviation fields, and per-task results remain raw evidence. Mean per-task cost and input/output/total tokens are persisted; cost can feed Value, while submitted-program execution time and memory remain source context because they do not measure model workflow latency.

**Artificial Analysis benchmark family:** AnalystAgent, APEX Agents, AutomationBench, Briefcase, CritPT, GDPval-AA, Humanity's Last Exam, ITBench, Omniscience, SciCode, and tau3 Banking each use the score published on their dedicated evaluation page. The shared AA model table does not supply these benchmark scores. When a page publishes complete cost, runtime, and token telemetry, the same page row owns those task resources.

**AnalystAgent** uses Artificial Analysis's headline pass^5 score across 80 private quantitative questions, each run five times. Model Atlas preserves model and reasoning-effort identity plus AA's published per-task cost, runtime, and input/output token telemetry. Output-per-task resources feed Speed and Value; the aggregate task count is used only to convert published totals into per-task measurements.

**APEX Agents** uses Artificial Analysis when available. A missing AA value can use Mercor's Loop Pass@1 score for the same model and assigned reasoning effort after the current AA-Mercor overlap passes the [validated additive source crosswalk](methodology.md#validated-additive-source-crosswalk). This policy requires at least three effective overlap models, at least three effective models with valid held-out predictions, and a model-balanced held-out median absolute error of at most `0.02`; projections are clamped to `[0,1]`. An unlabelled AA row uses the source-default highest effort under the ordinary matching rule.

**ARC Prize benchmark family:** ARC-AGI-2 and ARC-AGI-3 use only the official verified semi-private leaderboard JSON. Public demo, community, competition, custom, refinement, and synthesis systems are discarded during parsing. Model Atlas keeps only comparable general-model observations and preserves every disclosed reasoning-effort variant. ARC-AGI-2 uses task success on the shared proportion scale; ARC-AGI-3 uses human-relative action efficiency on that same scale. The scraper retains model identity, creator, score, rank among retained rows, source update time, and cost; model-type labels, release dates, result links, and chart presentation fields are discarded. ARC-AGI-2 declares cost per task and ARC-AGI-3 declares total cost for the fixed evaluation. Each cost feeds Value only within its own benchmark; neither feeds Speed.

**AutomationBench** comes from the dedicated Artificial Analysis benchmark page, not Zapier's hosted leaderboard. Model Atlas uses the AA headline score directly and keeps the page's reasoning-effort label, per-task cost, runtime, and token telemetry for resource scoring.

**Blueprint-Bench 2** uses the normalized connectivity similarity score and preserves only model display names and scores; Andon's internal source identifiers are not used for matching.

**Briefcase** comes from the dedicated Artificial Analysis benchmark page rather than the main AA model table. The raw page score is Elo and stays raw in source storage; Model Atlas normalizes it to the 0-1 benchmark scale with `clamp((Elo - 500) / 2000)` before quality scoring and benchmark-health comparison. Its resource-quality neighborhood uses that normalized score linearly rather than assigning probability odds to the Elo-derived coordinate. Its page-specific cost, token, and estimated runtime resources can feed Value and Speed through the same Artificial Analysis per-task resource policy used by other AA benchmark-resource benchmarks.

**GDPval-AA v2** keeps the dedicated page's raw Elo in source storage and converts it to the 0-1 normalized score with `clamp((Elo - 500) / 2000)` before matching, scoring, display, and frontier-chart use. Artificial Analysis's main model table publishes the same metric already normalized; exact overlap such as `1823.94 -> 0.66197` validates the conversion and lets that normalized field remain a compatible fallback for models not yet listed on the dedicated page.

**CursorBench** preserves score, average cost per task, tokens per task, steps per task, reasoning effort, and source score eligibility where shown. When multiple public effort rows map to variants of the same model, the scoring lookup uses the source-default row when effort is unlabelled, or the highest reported effort when it is labelled, while preserving all raw effort rows. Source-caveated scores remain in the raw rows but are excluded from scoring; this currently applies to Grok 4.5 because Cursor discloses that an earlier Cursor codebase snapshot was included in training and the score impact is unknown. Cursor's private Composer models are excluded because their model data is not available from independent catalog sources.

**DeepSWE** supplies pass@1, mean task cost, mean task duration, and mean output tokens. The backend derives one source-default row per model for benchmark matching. The default DeepSWE observation uses the source-default or highest reported effort as one whole observation; compact public views independently select the model variant with the highest Intelligence score. Task duration can feed Speed's benchmark task-time component, task cost can feed Value, and token totals remain source context.

**Epoch benchmark family:** FrontierMath Tier 4, Chess Puzzles, and EBR-Bench use successful runs from Epoch's bulk benchmark CSV, preserving run IDs, task versions, and observation timestamps. FrontierMath is filtered to the exact v2-private task so older ZIP-era scores cannot enter the current leaderboard.

**FrontierCode** uses Cognition's versioned 1.1 structured artifact. The Main subset's `new_score` is the quality field; Main per-task cost can feed Value, and Main token averages can supply Speed's throughput-based task-time fallback. Main pass rate, Extended metrics, tool calls, steps, and output-token-equivalent estimates remain source evidence.

Every reported effort and harness is persisted. Explicit effort rows match only the corresponding model variant, and a base model with only labelled observations follows the ordinary highest-reported-effort source-default rule rather than Cognition's display-only best-score selection. Cognition's proprietary SWE-1.7 and Cursor's Composer 2.5 remain auditable raw rows but are excluded from general-model scoring because they are not independently available model systems.

**GDP.pdf** uses the reported percentage score as a normalized benchmark score and preserves model display name, provider label, and page update date.

**Harvey LAB** comes from the Vals leaderboard, which follows Harvey's generation environment and two-judge grading protocol. Model Atlas scores Vals' strict task-resolution result, where a task passes only when every criterion passes; criterion pass rate and practice-area rows remain source evidence only. Vals' per-task cost and runtime can feed Value and Speed, while Artificial Analysis' independently reimplemented Stirrup results do not enter Harvey LAB scoring or resources.

**ITBench** uses Artificial Analysis' implementation and average precision at full recall score over 59 Kubernetes incident root-cause tasks with three repeats. The dedicated benchmark page supplies both the score and the model, effort, cost, runtime, and input/output token telemetry. Model Atlas divides aggregate cost and token totals by 177 task runs, preserves AA's per-task runtime, and feeds the resulting output-per-task resources into Speed and Value.

**MLS-Bench Lite** uses the official rendered leaderboard's baseline-normalized Performance across the 30-task Lite suite under Harbor's fixed five-hour exploration budget. The source percentage is converted at the adapter boundary to the canonical proportion used downstream. Model identity, rank, harness, reasoning effort, and fallback disclosure are retained; the harness remains model-plus-agent provenance rather than being mislabeled as an inference provider. No MLS-Bench resource field feeds Speed or Value.

**Omniscience** uses the AA-Omniscience Accuracy dataset embedded on its dedicated evaluation page. Model Atlas preserves the displayed model identity, reasoning effort, rank, and page-details route; the main AA model table does not supply the scoring value.

**PerceptionBench** uses the creator-owned GitHub leaderboard's overall accuracy across 3,000 verified open-ended visual questions. Model Atlas preserves the paper's exact published reasoning efforts, Gemma thinking-mode disclosure, and Claude Fable fallback model and 1.1% fallback share. The ten component accuracies are not persisted because only overall accuracy enters scoring, on the shared proportion scale, and no source resource field feeds Speed or Value. The source uses GPT-oss-120B as its automatic judge and reports 99.7% agreement in an audited judge-human sample.

**ProofBench** comes directly from the current Vals benchmark page. Model Atlas uses overall compiler-verified proof accuracy, preserves source version and method provenance, and excludes `aristotle/aristotle` because it is a specialized proving system rather than a comparable general-purpose model. The overlapping Vals and Epoch rows crosswalk to the same scores, while the current Vals view covers additional models; the Epoch artifact is therefore used to validate provenance rather than merged as independent evidence.

**Riemann-bench** uses the normalized public percent score and preserves provider, model label, and leaderboard last-updated date from the page.

**SciCode** uses the dedicated Artificial Analysis evaluation page's scientific-code score and complete per-task resource row. Its 288-run aggregate cost and token totals are converted to per-task measurements before any resource use.

**Surge benchmark family:** Chartography, ComplexConstraints, HANDBOOK.md, and EnterpriseBench CoreCraft use the public Surge leaderboard percentages and preserve displayed provider, model configuration, rank, and update date when present. ComplexConstraints scores the share of prompts for which every criterion passes. Hemingway-bench keeps the public expert-preference Elo score as an index instead of converting it into a percentage. Their page-local cost or judge details do not feed Speed or Value.

**Terminal-Bench 4.0** uses the official 4.0 structured leaderboard over 66 tasks with five trials per task and an eight-hour agent timeout. Raw storage retains every displayed model, reasoning-effort, and agent row together with task accuracy and its reported 95% confidence-interval half-width. Scoring uses the strongest displayed agent for each exact model effort, breaking equal-score ties by narrower confidence interval, while the highest available effort supplies the source-default base-model observation.

Agent harness remains part of the raw observation rather than a quality dimension. The source publishes aggregate mixed-harness token, cost, and duration telemetry, but Model Atlas does not use them as model-level Speed or Value evidence. Terminal-Bench 4.0 therefore contributes only to Agentic quality.

**Toolathlon** uses the reported score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

**Vals benchmark family:** Legal Research, EMB, Code Migration, Vibe Code, and Public Benefits Bench use each leaderboard's `overall` score. Finance Agent V2 uses strict `all_pass`, ProgramBench uses the raw `partial` behavioral-test pass rate, and CyberBench uses the `patch` track. Adapters discard alternate tasks before creating shared observations and retain only benchmark version, dataset type, runner, mode, and harness as source-method provenance. Vals cost, latency, generation settings, and task detail are not persisted or used for Speed or Value, and none of these benchmarks is registered as Time Horizon evidence.

**Vending-Bench 2** uses the official average final money balance as its raw benchmark value. Model Atlas preserves the number of runs and the complete published 365-day average balance curve for audit, then applies ordinary observed per-benchmark min-max normalization to the final balance. Costs and other chart-only derived comparisons do not enter Speed or Value, and the score should be interpreted as a stochastic long-horizon business simulation rather than an absolute success rate.

**WeirdML** uses the benchmark creator's current CSV as its primary source and `avg_acc` as its score, preserving all 17 task accuracies, cost, output-token count, code-length quantiles, execution time, release date, and effort-labelled model variant. Epoch's WeirdML dataset is a mirror of the same benchmark, so Model Atlas crosswalks overlapping accuracy, cost, median code length, and release date. Creator rows win every overlap; a uniquely identified Epoch-only model-effort row is added only when it does not conflict with the creator data, and an unvalidated mirror is not merged.
