# Benchmarks

## Purpose

This document records which benchmarks affect Model Atlas, what each contributes, which source fields are scored, and how overlapping sources are reconciled. [Benchmark standards](standards.md) define admission and classification; [methodology](methodology.md) defines the scoring mathematics.

## Benchmark Portfolio

Benchmark admission follows [the standards](standards.md). Accepted benchmarks are classified as `frontier` or `baseline`; rejected benchmarks do not affect the ranking.

The ranking has two quality dimensions:

| Dimension | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Factual accuracy, hard reasoning, professional knowledge, and structured problem solving outside harness or tool execution | Benchmarks with a non-zero Intelligence loading |
| Agentic | Tool-mediated execution, instruction following, self-verification, reliability under constraints, and work-like task completion | Benchmarks with a non-zero Agentic loading |

There is no standalone coding score. Coding difficulty does not automatically make a benchmark Agentic. Static coding and scientific programming primarily contribute to Intelligence when they test knowledge, reasoning, or problem formulation. Coding benchmarks primarily contribute to Agentic when they require tools, repository or file manipulation, terminal execution, or harnessed workflow completion.

### Portfolio Settings

| Setting | Role |
| --- | --- |
| Group | Classifies the benchmark as `frontier` or `baseline` and controls only the missing-value error penalty |
| Importance | Controls the benchmark's total influence relative to other observed benchmarks |
| Dimension loading | Allocates that importance between Intelligence and Agentic; the two loadings sum to 100% |

The effective weight in dimension $D$ is $w_{b,D}=\operatorname{benchmarkImportance}_b\operatorname{dimensionLoading}_{b,D}$. Group does not change the contribution of an observed value, and source identity does not determine group. A benchmark can be sourced from Artificial Analysis and still be frontier when it is current, difficult, distinctive, and useful for separating leading models.

The tables below show the current portfolio, why each benchmark is included, and whether its task resources can contribute to Speed or Value.

### Resource Quality Coordinates

Every benchmark whose task time or cost can enter Speed or Value declares how its quality value is positioned inside resource-comparison neighborhoods. `Logit` is limited to probability-like success, pass, accuracy, or completion rates. `Linear` preserves spacing for native scales and composites that do not have remaining-error probability semantics.

| Benchmark | Coordinate | Decision |
| --- | --- | --- |
| Agents' Last Exam | Linear | Partial-credit performance is a graded task score, not a binary completion probability. |
| ALE-Bench | Linear | Native Performance can exceed 100 and must retain its full spacing. |
| APEX Agents | Logit | Loop Pass@1 is a bounded task-completion rate. |
| AutomationBench | Logit | The headline score is a bounded workflow-success rate. |
| Briefcase | Linear | The 0-1 value is a linear normalization of Elo, not probability. |
| CritPt | Logit | The score is a bounded correctness rate with meaningful remaining error. |
| CursorBench | Linear | The published grading score is a composite rather than a completion probability. |
| DeepSWE | Logit | Pass@1 is a bounded task-completion rate. |
| FrontierCode | Linear | The versioned `new_score` is a grading composite. |
| GDPval-AA v2 | Linear | The normalized professional-work score is a grading composite. |
| Harvey LAB | Logit | Strict task resolution is a bounded all-criteria completion rate. |
| HLE | Logit | Accuracy is a bounded correctness rate. |
| ITBench | Linear | Average precision at full recall is used as a ranking metric, not interpreted as task-success probability. |
| tau3 Banking | Logit | The score is a bounded workflow-success rate. |
| Terminal-Bench 2.1 | Logit | The score is a bounded terminal-task completion rate. |

### Frontier Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Agent&nbsp;Arena | 1 | 0% | 100% | Randomized real-world Agent Mode sessions estimate the orchestrator model's causal effect across confirmed success, praise versus complaint, steerability, bash recovery, and tool hallucination. The large current sample and direct workflow signal earn frontier status, while the score remains relative to Arena's time-weighted model and task distribution. |
| Agents'&nbsp;Last&nbsp;Exam | 1 | 20% | 80% | Real-world software and professional workflows. It combines professional knowledge with harnessed task execution, so it contributes to both dimensions but primarily Agentic. |
| ALE-Bench | 1 | 40% | 60% | Heuristic-programming tasks require algorithm design, executable code, and benchmark-harness interaction. The mix supports both dimensions, with more weight on Agentic execution. |
| APEX&nbsp;Agents | 1 | 0% | 100% | Long-horizon professional-services workflows with realistic tooling, rubrics, and domain constraints. The signal is pure agentic task completion. |
| AutomationBench | 1 | 0% | 100% | Artificial Analysis implementation of Zapier workflow-automation tasks over simulated SaaS app environments. It is frontier because it tests business-process execution with tool-like constraints, and its AA per-task resources can feed Speed and Value. |
| Blueprint-Bench&nbsp;2 | 1 | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | 1 | 25% | 75% | Long-horizon professional knowledge work over multi-file deliverables. File management and extended execution make it primarily Agentic, with Intelligence credit for professional reasoning and synthesis. |
| Chartography | 1 | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. It is a current Intelligence-only stress test with meaningful frontier spread. |
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
| ProgramBench | 1 | 20% | 80% | Programming tasks combine problem formulation with executable workflow completion. Current Vals results retain frontier pressure, with most weight assigned to Agentic execution. |
| ProofBench | 1 | 70% | 30% | Private compiler-verified theorem proving emphasizes mathematical reasoning, while the multi-turn proof-development harness contributes a smaller Agentic component. |
| Riemann-bench | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| Terminal-Bench&nbsp;2.1 | 1 | 0% | 100% | Terminal-agent task execution and environment handling remain a current Agentic stress test with meaningful separation among strong systems. |

### Baseline Benchmarks

| Benchmark | Importance | Intelligence Loading | Agentic Loading | Capability and Decision |
| --- | ---: | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | 0.5 | 100% | 0% | Artificial Analysis's aggregate index provides broad current Intelligence coverage. Its aggregation overlaps several individually selected benchmarks, so it contributes at half importance. |
| BrowseComp | 1 | 0% | 100% | Web/research solving where browsing behavior matters more than static knowledge. It stays baseline because public web tasks have higher contamination exposure and less frontier-like top spread. |
| Chess Puzzles | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| Code Migration | 1 | 20% | 80% | Repository migration requires code understanding and predominantly Agentic multi-file execution. It provides useful practical coverage but remains baseline rather than a frontier missing-data claim. |
| CyberBench | 1 | 0% | 100% | Practical cybersecurity tasks are scored as pure Agentic workflow evidence. The focused domain and Vals-specific harness keep the benchmark in baseline. |
| EBR-Bench | 0.5 | 0% | 100% | Repeated play of the unfamiliar Earthborne Rangers campaign tests whether an agent can learn from experience through exploration and persistent notes. The narrow game environment, small current leaderboard, and simple benchmark harness make it useful Agentic evidence at half importance rather than a broad frontier workflow claim. |
| EnterpriseBench CoreCraft | 0.5 | 0% | 100% | Enterprise workflows inside one simulated company provide practical Agentic breadth. The single-company environment, first-party judge rubrics, and overlap with other agent benchmarks keep it stabilizing half-weight evidence. |
| Epoch Capabilities Index | 0.5 | 100% | 0% | Epoch's multi-benchmark capabilities index adds broad stabilizing Intelligence evidence alongside AA and Vals. Its aggregate nature earns half importance, while source confidence intervals remain preserved for audit. |
| Finance Agent V2 | 1 | 20% | 80% | Finance research and analysis combine domain reasoning with predominantly Agentic workflow execution. The domain-specific Vals harness makes it stabilizing baseline evidence. |
| LCR | 1 | 100% | 0% | Long-context document reasoning over large document sets. It remains useful breadth coverage, but current top-model spread is narrower than harder specialist and professional-work tests. |
| MedCode | 1 | 100% | 0% | Medical coding supplies specialist professional-knowledge and reasoning evidence without enough external workflow execution to receive an Agentic loading. |
| Omniscience&nbsp;Accuracy | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to distinguish the frontier leaders. |
| Public Benefits Bench | 1 | 20% | 80% | Public-benefits case work combines policy reasoning with predominantly Agentic research and workflow execution. It remains a focused baseline signal. |
| SciCode | 1 | 80% | 20% | Scientist-curated Python problems. The main signal is scientific problem formulation and structured reasoning; executable code correctness adds a smaller execution signal. |
| tau3&nbsp;Banking&nbsp;(AA) | 1 | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It remains useful domain workflow evidence, but its current rank agreement and tight top spread make it a stabilizing baseline signal rather than a frontier separator. |
| Toolathlon | 1 | 0% | 100% | Multi-tool workflow execution across files, APIs, business applications, and other external environments. Its planning and domain reasoning occur inside the harnessed workflow, so the signal is fully Agentic; limited current row count and provenance keep it baseline. |
| Vals Index | 0.5 | 60% | 40% | Vals aggregate over finance and coding tasks. The official page labels the index proprietary because it includes non-public Vals-built components, but its formula also includes public coding benchmarks. Its overlap with individually selected benchmark families keeps it at half importance. |
| Vending-Bench&nbsp;2 | 1 | 0% | 100% | Year-long simulated business operation tests sustained tool use, inventory, pricing, negotiation, and coherence over thousands of messages. Its long horizon is distinctive, but the small run count and stochastic trading-like outcome make it stabilizing baseline evidence rather than a frontier missing-data claim. |
| Vibe Code | 1 | 0% | 100% | End-to-end software creation in a coding-agent environment is pure Agentic evidence. Its product-building focus provides useful baseline coverage without a frontier missing-data claim. |
| WeirdML | 1 | 60% | 40% | ML-programming tasks test model selection and implementation across 17 datasets. Problem formulation is the larger Intelligence component, while executable code generation contributes Agentic evidence. |

Frontier benchmarks provide the strongest current separation; baseline benchmarks provide vetted breadth and stability. In scoring, the labels change only the conservative penalty applied to missing evidence. Benchmark importance owns the influence of observed scores, and diagnostics or exclusions are not scoring groups.

## Combining Sources

### Compatibility Gate

Rows from different sources are never assumed equivalent merely because their benchmark and model labels overlap. Before combining them, Model Atlas checks the task set and version, metric definition, scoring protocol, harness and run configuration, units, aggregation rule, model identity, and reasoning effort.

A source crosswalk is most reliable when the sources represent the same underlying measurement under methodologically compatible protocols. The overlap should validate any identity, scale, or unit transformation, and the benchmark-specific policy should define which source wins when both report the same observation. Canonical observed values are generally not averaged with duplicate mirrors, and validated mappings can admit source-only rows when they identify them without conflict.

Methodologically different measurements are not made comparable by a crosswalk or median. They remain distinct evidence unless the benchmark has an explicit multi-harness aggregation policy, in which case that score rule and any separate resource-aggregation rule are documented in its source note.

### Reasoning-Effort Rows

An unlabelled configuration is the source default. When every configuration is labelled, source-default selection chooses the highest reported effort as one complete runnable observation rather than combining field-wise maxima. Explicitly labelled observations remain attached to their matching scored variants, and raw source evidence preserves every effort row.

## Watchlist

Watchlist-only benchmarks remain outside the scoring portfolio. Time Horizon Index is currently non-scoring because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard required by [the standards](standards.md).

## Source Notes

### Shared Inputs

**Artificial Analysis** is the primary benchmark source. It supplies the broad Intelligence and Agentic indexes, selected benchmark fields, Intelligence task cost, Intelligence task token counts, and enough latency/throughput information to estimate Intelligence task seconds. GPQA, MMMU-Pro, and other available AA fields can remain visible as source context when present, but they are not selected benchmark inputs unless listed in the benchmark portfolio. AA's `coding_index` likewise remains source context and does not compute a standalone score.

**OpenRouter** supplies current route pricing and speed measurements used for blended price, workflow-simulated seconds, and workflow-simulated price efficiency. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

### Benchmark-Specific Policies

**APEX Agents** uses Artificial Analysis when available. A missing AA value can use Mercor's Loop Pass@1 score for the same model and assigned reasoning effort after the current AA-Mercor overlap passes the [source crosswalk validation](methodology.md#apex-agents-source-crosswalk); an unlabelled AA row uses the source-default highest effort under the ordinary matching rule.

**Briefcase** comes from the dedicated Artificial Analysis benchmark page rather than the main AA model table. The raw page score is Elo and stays raw in source storage; Model Atlas normalizes it to the 0-1 benchmark scale with `clamp((Elo - 500) / 2000)` before quality scoring and benchmark-health comparison. Its resource-quality neighborhood uses that normalized score linearly rather than assigning probability odds to the Elo-derived coordinate. Its page-specific cost, token, and estimated runtime resources can feed Value and Speed through the same Artificial Analysis per-task resource policy used by other AA benchmark-resource benchmarks.

![Briefcase Elo transformed linearly from 500 to 2500 and clamped to the normalized 0-1 range.](assets/methodology/elo-transform.svg)

**Terminal-Bench 2.1** combines the AA leaderboard score, the dedicated AA benchmark page, and the Vals page when they match the same model. The benchmark score is the best available AA or Vals overall score. This gives a small reward to models with more harness coverage: success across independent harnesses is treated as evidence of a stronger observed execution path rather than averaged into a noisy cross-harness mean.

Cost and time use the medians of available per-task resource values so one harness does not dominate resource estimates. AA cost and token totals are divided by 89 tasks and three repeats per task; AA time uses the reported per-task runtime. Vals supplies score, cost, time, and harness labels but no token counts, so token fields remain AA-only when present.

**DeepSWE** supplies pass@1, mean task cost, mean task duration, and mean output tokens. The backend derives one source-default row per model for benchmark matching. The default DeepSWE observation uses the source-default or highest reported effort as one whole observation; compact public views independently select the model variant with the highest Intelligence score. Task duration can feed Speed's benchmark task-time component, task cost can feed Value, and token totals remain source context.

**Agents' Last Exam** uses `max(median_score, mean_score)` from the Full Overall split. Raw source rows preserve total runtime, token counts, and cost. Each harness row divides those totals by its evaluated task count, and the displayed ALE resource columns use the lower of the resulting median and mean per-task values. Partial-credit score is the scoring input because it is more informative than pass-rate accuracy.

**ALE-Bench** uses Sakana AI's complete leaderboard as the observed source and Epoch AI's overlapping rounded table as a refresh-time scale validator. The scoring row is `num_self_refine = 1`, meaning the source-default selected candidate before feedback-driven refinement loops, and its all-task mean Performance enters ordinary observed min-max normalization. The same native Performance value enters resource-quality neighborhoods linearly, so values above 100 remain distinct instead of being treated as percentages and collapsed at the logit ceiling. Higher refinement checkpoints, all/short/long mean, median, min, max, and standard deviation fields, and per-task results remain raw evidence. Mean per-task cost and input/output/total tokens are persisted; cost can feed Value, while submitted-program execution time and memory remain source context because they do not measure model workflow latency.

**Agent Arena** uses the published Net Improvement point estimate directly as the raw benchmark value. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so Model Atlas applies its ordinary observed per-benchmark min-max normalization without a sigmoid transform.

**Vending-Bench 2** uses the official average final money balance as its raw benchmark value. Model Atlas preserves the number of runs and the complete published 365-day average balance curve for audit, then applies ordinary observed per-benchmark min-max normalization to the final balance. Costs and other chart-only derived comparisons do not enter Speed or Value, and the score should be interpreted as a stochastic long-horizon business simulation rather than an absolute success rate.

**Toolathlon** uses the reported score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

**CursorBench** preserves score, average cost per task, tokens per task, steps per task, reasoning effort, and source score eligibility where shown. When multiple public effort rows map to variants of the same model, the scoring lookup uses the source-default row when effort is unlabelled, or the highest reported effort when it is labelled, while preserving all raw effort rows. Source-caveated scores remain in the raw rows but are excluded from scoring; this currently applies to Grok 4.5 because Cursor discloses that an earlier Cursor codebase snapshot was included in training and the score impact is unknown. Cursor's private Composer models are excluded because their model data is not available from independent catalog sources.

**FrontierCode** uses Cognition's versioned 1.1 structured artifact. The Main subset's `new_score` is the quality field; Main per-task cost can feed Value, and Main token averages can supply Speed's throughput-based task-time fallback. Main pass rate, Extended metrics, tool calls, steps, and output-token-equivalent estimates remain source evidence.

Every reported effort and harness is persisted. Explicit effort rows match only the corresponding model variant, and a base model with only labelled observations follows the ordinary highest-reported-effort source-default rule rather than Cognition's display-only best-score selection. Cognition's proprietary SWE-1.7 and Cursor's Composer 2.5 remain auditable raw rows but are excluded from general-model scoring because they are not independently available model systems.

**AutomationBench** comes from the dedicated Artificial Analysis benchmark page, not Zapier's hosted leaderboard. Model Atlas uses the AA headline score directly and keeps the page's reasoning-effort label, per-task cost, runtime, and token telemetry for resource scoring.

**Harvey LAB** comes from the Vals leaderboard, which follows Harvey's generation environment and two-judge grading protocol. Model Atlas scores Vals' strict task-resolution result, where a task passes only when every criterion passes; criterion pass rate and practice-area rows remain source evidence only. Vals' per-task cost and runtime can feed Value and Speed, while Artificial Analysis' independently reimplemented Stirrup results do not enter Harvey LAB scoring or resources.

**ITBench** uses Artificial Analysis' implementation and average precision at full recall score over 59 Kubernetes incident root-cause tasks with three repeats. The main AA leaderboard supplies all available scores, while the dedicated benchmark page adds model, effort, cost, runtime, and input/output token telemetry where complete. Model Atlas divides aggregate cost and token totals by 177 task runs, preserves AA's per-task runtime, and feeds the resulting output-per-task resources into Speed and Value.

**Blueprint-Bench 2** uses the normalized connectivity similarity score and preserves only model display names and scores; Andon's internal source identifiers are not used for matching.

**Riemann-bench** uses the normalized public percent score and preserves provider, model label, and leaderboard last-updated date from the page.

**GDP.pdf** uses the reported percentage score as a normalized benchmark score and preserves model display name, provider label, and page update date.

**Vals Index** uses the overall percentage score as a normalized benchmark score and preserves the component task rows for source audit/display only. The official page labels the index proprietary and describes non-public Vals-built datasets, while the published formula also includes public coding benchmarks such as SWE-bench Verified and Terminal-Bench 2.1. Model Atlas therefore treats it as a useful aggregate baseline, not a pure frontier source. Its reported cost and latency stay out of Speed and Value because they are Vals harness-local measurements rather than comparable task-resource inputs.

**Vals benchmark family:** Legal Research, EMB, MedCode, Code Migration, Vibe Code, and Public Benefits Bench use each leaderboard's `overall` score. Finance Agent V2 uses strict `all_pass`, ProgramBench uses the raw `partial` behavioral-test pass rate, and CyberBench uses the `patch` track. Only rows for the selected task enter quality scoring; alternate task metrics, cost, latency, harness settings, and inference settings remain raw source evidence. These Vals cost and latency fields do not feed Speed or Value, and none of these benchmarks is registered as Time Horizon evidence.

**Epoch benchmark family:** Epoch Capabilities Index uses Epoch's published ECI value directly and preserves its lower and upper confidence bounds, model-version identifiers, access category, organization, and observation date. FrontierMath Tier 4, Chess Puzzles, and EBR-Bench use successful runs from Epoch's bulk benchmark CSV, preserving run IDs, task versions, standard errors, and observation timestamps. FrontierMath is filtered to the exact v2-private task so older ZIP-era scores cannot enter the current leaderboard.

**WeirdML** uses the benchmark creator's current CSV as its primary source and `avg_acc` as its score, preserving all 17 task accuracies, aggregate standard error, cost, output-token count, code-length quantiles, execution time, release date, API source, and effort-labelled model variant. Epoch's WeirdML dataset is a mirror of the same benchmark, so Model Atlas explicitly crosswalks overlapping accuracy, cost, median code length, standard error, and release date fields, including Epoch's different standard-error unit. Creator rows win every overlap; a uniquely identified Epoch-only model-effort row is added only when it does not conflict with the creator data, and an unvalidated mirror is not merged.

**ProofBench** comes directly from the current Vals benchmark page. Model Atlas uses overall compiler-verified proof accuracy, preserves Vals version, standard error, latency, per-test cost, harness, and inference settings, and excludes `aristotle/aristotle` from general-model scoring because it is a specialized proving system rather than a comparable general-purpose model. The overlapping Vals and Epoch rows crosswalk to the same scores, while the current Vals view covers additional models; the Epoch artifact is therefore used to validate provenance rather than merged as independent evidence.

**Surge benchmark family:** Chartography, HANDBOOK.md, and EnterpriseBench CoreCraft use the public Surge leaderboard percentages and preserve displayed provider, model configuration, rank, and update date when present. Their page-local cost or judge details do not feed Speed or Value.
