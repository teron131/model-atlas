# Model Atlas Methodology

## Purpose

This project is trying to build the best current version of my opinionated LLM ranking. It starts from Artificial Analysis because AA is the best benchmark aggregation source I have found so far, but the point is not to mirror AA exactly. The point is to keep the parts of AA and related provider data that help separate current models in a subjectively meaningful way.

The ranking is not an average of everything available upstream. Many benchmarks are low-signal for this purpose: some are saturated, some are stale, some are noisy, and some reward capabilities that do not matter much for the downstream model choices I care about. A benchmark only belongs here if it still creates a useful relative ordering among current models.

The main ranking choices are explicit: selected intelligence benchmarks, selected agentic benchmarks, task/chat/agentic price profiles, workflow simulation profiles, and resource normalization.

The current leaderboard adds an explicit default-effort aggregation layer above preserved reasoning-effort observations. When a source does not label effort, its published row is treated as the default highest-effort configuration. When efforts are labelled, the aggregate selects the highest reported effort as one whole runnable observation; it does not combine field-wise maxima from different efforts. Raw and matched effort rows remain separate source evidence for a future effort-breakdown view.

## Benchmark Selection

Benchmark admission follows the standards in `docs/standards.md`. Accepted benchmarks are classified as `frontier` or `baseline`; rejected benchmarks do not affect the ranking.

The ranking has two quality dimensions.

- Intelligence
  - Captures broad capability: factual accuracy, hard reasoning, professional knowledge, and structured problem solving outside harness/tool execution.
  - Evidence comes from benchmarks with a non-zero Intelligence loading in the benchmark portfolio.
- Agentic
  - Captures workflow usefulness: coding or task execution with specific tools, instruction following, self-verification, reliability under constraints, harness/tool execution, and work-like task completion.
  - Evidence comes from benchmarks with a non-zero Agentic loading in the benchmark portfolio.

There is no standalone coding score in the current ranking. Coding difficulty does not automatically become Agentic. Static coding or scientific programming benchmarks count as Intelligence when they mainly test professional knowledge, reasoning, or problem formulation; coding benchmarks count as Agentic when they require tool use, repo/file manipulation, terminal execution, or harnessed workflow completion. AA SciCode is treated as structured code-generation/problem-solving evidence under intelligence. DeepSWE, Terminal-Bench 2.1, and AA tau3 Banking remain agentic. Agents' Last Exam is selected in both intelligence and agentic because it combines professional knowledge with harnessed real-world workflow execution.

Selected benchmarks have one missing-data group: `baseline` or `frontier`. Group does not change the weight of an observed benchmark; it only controls how missing benchmark evidence is handled. Source is metadata. A benchmark can come from Artificial Analysis and still be frontier if it is hard, current, distinctive, and useful for separating frontier models.

Each accepted benchmark has three separate settings. `benchmarkImportance` controls how much the benchmark matters relative to other benchmarks, Intelligence and Agentic loadings sum to 100% and allocate that importance between the two quality dimensions, and `group` controls missing-data handling only. The effective weight for dimension $D$ is $w_{b,D}=\operatorname{benchmarkImportance}_b\operatorname{dimensionLoading}_{b,D}$. A first-party or partly opaque agent workflow benchmark can be kept `baseline` with a `0%` Intelligence / `100%` Agentic loading split when the evidence is useful but too narrow or source-specific to act as a frontier model-quality claim.

When the benchmark portfolio changes, this table should change with it. Additions, removals, or group, importance, or loading changes should explain the capability being measured, why the benchmark earns or loses ranking space, and whether its task resources can feed Speed or Value.

| Benchmark | Missing-data Group | Importance | Intelligence Loading | Agentic Loading | Description and Decision Note |
| --- | --- | ---: | ---: | ---: | --- |
| Agent&nbsp;Arena | frontier | 1 | 0% | 100% | Randomized real-world Agent Mode sessions estimate the orchestrator model's causal effect across confirmed success, praise versus complaint, steerability, bash recovery, and tool hallucination. The large current sample and direct workflow signal earn frontier status, while the score remains relative to Arena's time-weighted model and task distribution. |
| Agents'&nbsp;Last&nbsp;Exam | frontier | 1 | 20% | 80% | Real-world software and professional workflows. It combines professional knowledge with harnessed task execution, so it contributes to both dimensions but primarily Agentic. |
| APEX&nbsp;Agents | frontier | 1 | 0% | 100% | Long-horizon professional-services workflows with realistic tooling, rubrics, and domain constraints. The signal is pure agentic task completion. |
| AutomationBench | frontier | 1 | 0% | 100% | Artificial Analysis implementation of Zapier workflow-automation tasks over simulated SaaS app environments. It is frontier because it tests business-process execution with tool-like constraints, and its AA per-task resources can feed Speed and Value. |
| Blueprint-Bench&nbsp;2 | frontier | 1 | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | frontier | 1 | 25% | 75% | Artificial Analysis long-horizon professional knowledge-work benchmark over multi-file deliverables. It is mostly agentic because models must manage file outputs and extended work, with some intelligence credit for professional reasoning and synthesis. The raw Elo score is normalized with the same AA GDPval-style `clamp((Elo - 500) / 2000)` transform before it enters Model Atlas quality scoring. |
| Chartography | frontier | 1 | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. It is a current Intelligence-only stress test with meaningful frontier spread. |
| CritPt | frontier | 1 | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| CursorBench | frontier | 1 | 0% | 100% | Cursor's public coding-agent benchmark over ambiguous, multi-file tasks from real editor sessions. It is frontier because it separates current coding agents on practical workflow tasks; Composer rows are excluded because their model data is not independently available. |
| DeepSWE | frontier | 1 | 0% | 100% | Repo-level coding-agent benchmark. It tests long-horizon repository reasoning and code execution, using the source-default or highest reported reasoning effort. |
| FrontierMath Tier 4 | frontier | 1 | 100% | 0% | Epoch's hardest private FrontierMath tier is a current specialist mathematical-reasoning stress test. Model Atlas accepts only the exact `FrontierMath-Tier-4-v2-Private` task and never mixes the older private or public task versions. |
| GDP.pdf | frontier | 1 | 90% | 10% | Professional PDF understanding with dense page-grounded rubrics. It is mostly document intelligence, with a small execution-reliability component. |
| GDPval-AA&nbsp;v2 | frontier | 1 | 60% | 40% | Real professional deliverables across economically important occupations. Mostly professional reasoning and synthesis, with substantial agentic credit for AA v4.1's longer tool/file/web trajectories and human-baselined work completion. |
| HANDBOOK.md | frontier | 1 | 0% | 100% | Long-context enterprise work over 65 tasks in five domains, with four trials per model and deterministic grading. The benchmark primarily measures sustained instruction-following and workflow execution. |
| Harvey LAB | frontier | 1 | 0% | 100% | Artificial Analysis implementation of Harvey's Legal Agent Benchmark over private legal-agent tasks. It is frontier because the all-pass legal deliverable score remains low, current, and strongly separated among frontier models; the signal is pure Agentic because models work in a sandbox over matter files and produce legal work product. |
| HLE | frontier | 1 | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| ITBench | frontier | 1 | 0% | 100% | Artificial Analysis implementation of same-harness Kubernetes incident root-cause investigations over 59 tasks with three repeats. It is a current frontier Agentic stress test with strong score spread across realistic tool-mediated SRE work. |
| ProofBench | frontier | 1 | 70% | 30% | Private compiler-verified theorem proving over 100 problems. Mathematical reasoning is primary, while the multi-turn proof-development harness contributes a smaller Agentic loading; Aristotle's specialized proving system is retained as raw evidence but excluded from general-model scoring. |
| Riemann-bench | frontier | 1 | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| Terminal-Bench&nbsp;2.1 | frontier | 1 | 0% | 100% | AA and Vals both report terminal-agent task execution and environment handling. Model Atlas aggregates their matched overall rows by model and harness, using the best score and median cost/time resources. It is frontier because terminal task execution is a current agentic stress test with meaningful separation among strong systems. |
| Artificial Analysis Intelligence Index | baseline | 0.5 | 100% | 0% | Artificial Analysis's aggregate index provides broad current Intelligence coverage. Its aggregation overlaps several individually selected benchmarks, so it contributes at half importance. |
| BrowseComp | baseline | 1 | 0% | 100% | Web/research solving where browsing behavior matters more than static knowledge. It stays baseline because public web tasks have higher contamination exposure and less frontier-like top spread. |
| Chess Puzzles | baseline | 1 | 100% | 0% | Exact-move chess puzzle solving supplies a distinct planning and tactical-reasoning signal. It remains baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| EBR-Bench | baseline | 0.5 | 0% | 100% | Long-horizon economic and business research workflows provide useful Agentic evidence, but narrow coverage and a small current leaderboard keep it at half importance. |
| EnterpriseBench CoreCraft | baseline | 0.5 | 0% | 100% | Enterprise workflows inside one simulated company provide practical Agentic breadth. The single-company environment, first-party judge rubrics, and overlap with other agent benchmarks keep it stabilizing half-weight evidence. |
| Epoch Capabilities Index | baseline | 0.5 | 100% | 0% | Epoch's multi-benchmark capabilities index adds broad stabilizing Intelligence evidence alongside AA and Vals. Its aggregate nature earns half importance, while source confidence intervals remain preserved for audit. |
| LCR | baseline | 1 | 100% | 0% | Long-context document reasoning over large document sets. It remains useful breadth coverage, but current top-model spread is narrower than harder specialist and professional-work tests. |
| Omniscience&nbsp;Accuracy | baseline | 1 | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to decide frontier top fights. |
| SciCode | baseline | 1 | 80% | 20% | Scientist-curated Python problems. The main signal is scientific problem formulation and structured reasoning; executable code correctness adds a smaller execution signal. |
| tau3&nbsp;Banking&nbsp;(AA) | baseline | 1 | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It remains useful domain workflow evidence, but its current rank agreement and tight top spread make it a stabilizing baseline signal rather than a frontier separator. |
| Toolathlon | baseline | 1 | 0% | 100% | Multi-tool workflow execution across files, APIs, business applications, and other external environments. Its planning and domain reasoning occur inside the harnessed workflow, so the signal is fully Agentic; limited current row count and provenance keep it baseline. |
| Vals Index | baseline | 0.5 | 60% | 40% | Vals aggregate over finance and coding tasks. The official page labels the index proprietary because it includes non-public Vals-built components, but its formula also includes public coding benchmarks. Its overlap with individually selected benchmark families keeps it at half importance. |
| Vending-Bench&nbsp;2 | baseline | 1 | 0% | 100% | Year-long simulated business operation tests sustained tool use, inventory, pricing, negotiation, and coherence over thousands of messages. Its long horizon is distinctive, but the small run count and stochastic trading-like outcome make it stabilizing baseline evidence rather than a frontier missing-data claim. |
| WeirdML | baseline | 1 | 60% | 40% | ML-programming tasks test model selection and implementation across 17 datasets. Problem formulation is the larger Intelligence component, while executable code generation contributes Agentic evidence. |

The baseline and frontier labels describe how missing benchmark evidence is handled. They do not increase or decrease the contribution of observed scores; benchmark importance owns that decision. Diagnostics and exclusions are not scoring groups.

### Quality Mix

Intelligence and Agentic use the same scoring rule: each selected benchmark is weighted by its benchmark importance multiplied by its loading for that dimension. Intelligence and Agentic loadings split the benchmark's importance across the two dimensions. The Artificial Analysis Intelligence Index, Vals Index, and Epoch Capabilities Index each contribute at half importance; the AA Agentic Index remains source context only.

Sparse benchmark coverage is penalized with the same smooth confidence curve used by benchmark resource scoring. Observed values receive full evidence credit, and validated imputations receive partial credit based on the held-out error of the predictor actually used. Missing values receive none. Evidence coverage below 10% earns no confidence, evidence coverage at 60% or above earns full confidence, and coverage between those bounds ramps smoothly. Public admission remains stricter and counts observed values only.

Speed and Value are secondary. They matter because downstream applications have latency and budget constraints, but they should not overtake model quality. Speed gives equal weight to provider speed stats, workflow simulation, and each active quality-adjusted benchmark task-time input. Value gives equal weight to log blended price, quality-adjusted log blended price, quality-adjusted workflow price efficiency, and each active quality-adjusted benchmark task-cost input.

## Source Notes

Artificial Analysis is the primary benchmark source. It supplies the broad Intelligence and Agentic indexes, selected benchmark fields, Intelligence task cost, Intelligence task token counts, and enough latency/throughput information to estimate Intelligence task seconds. GPQA, MMMU-Pro, and other available AA fields can remain visible as source context when present, but they are not selected benchmark inputs unless listed in the benchmark portfolio.

APEX Agents uses Artificial Analysis when available. A missing AA value can use Mercor's Loop Pass@1 score for the same model and assigned reasoning effort after the current AA-Mercor overlap passes the source crosswalk validation described below; an unlabelled AA row uses the source-default highest effort under the ordinary matching rule.

Briefcase comes from the dedicated Artificial Analysis evaluation page rather than the main AA model table. The raw page score is Elo and stays raw in source storage; Model Atlas normalizes it to the 0-1 benchmark scale with `clamp((Elo - 500) / 2000)` before quality scoring and benchmark-health comparison. Its page-specific cost, token, and estimated runtime resources can feed Value and Speed through the same Artificial Analysis per-task resource policy used by other AA evaluation-resource benchmarks.

OpenRouter supplies current route pricing and speed measurements used for blend price, workflow-simulated seconds, and workflow-simulated price efficiency. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

Terminal-Bench 2.1 combines the AA leaderboard score, the dedicated AA Terminal-Bench evaluation page, and the Vals Terminal-Bench 2.1 page when they match the same model. The benchmark score is the best available AA or Vals overall score, matching the way people usually compare a model's best harness result. This intentionally gives a small reward to models with more harness coverage: if multiple independent harnesses can make the same model work, the ranking credits the strongest observed execution path instead of forcing a noisy cross-harness average. Cost and time are still the medians of available per-task resource values so one harness does not dominate resource estimates. AA cost and token totals are divided by the benchmark's 89 tasks and 3 repeats per task; AA time uses the page's reported per-task runtime. Vals supplies score, cost, time, and harness labels but no token counts, so token fields remain AA-only when present.

DeepSWE supplies pass@1, mean task cost, mean task duration, and mean output tokens. The backend preserves preferred-version effort/config observations in `deep_swe.rows` and separately derives one default-effort row per model for matching and scoring. The dashboard model row displays the source-default or highest reported effort as one whole observation. Task duration can feed Speed's benchmark task-time component, task cost can feed Value, and token totals remain source context.

Agents' Last Exam uses `max(median_score, mean_score)` from the Full Overall split. Raw source rows preserve total runtime and token counts, while displayed ALE resource columns divide those totals by the source `runs` count and then use the lower of median and mean per-run values. Partial-credit score is the scoring input because it is more informative than pass-rate accuracy.

Agent Arena uses the published Net Improvement point estimate directly as the raw benchmark value. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so Model Atlas applies its ordinary observed per-benchmark min-max normalization without a sigmoid transform.

Vending-Bench 2 uses the official average final money balance as its raw benchmark value. Model Atlas preserves the number of runs and the complete published 365-day average balance curve for audit, then applies ordinary observed per-benchmark min-max normalization to the final balance. Costs and other chart-only derived comparisons do not enter Speed or Value, and the score should be interpreted as a stochastic long-horizon business simulation rather than an absolute success rate.

Toolathlon uses the reported score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

CursorBench preserves score, average cost per task, tokens per task, steps per task, reasoning effort, and source score eligibility where shown. When multiple public effort rows map to variants of the same model, the scoring lookup uses the source-default row when effort is unlabelled, or the highest reported effort when it is labelled, while preserving all raw effort rows. Source-caveated scores remain in the raw rows but are excluded from scoring; this currently applies to Grok 4.5 because Cursor discloses that an earlier Cursor codebase snapshot was included in training and the score impact is unknown. Cursor's private Composer models are excluded because their model data is not available from independent catalog sources.

AutomationBench comes from the dedicated Artificial Analysis evaluation page, not Zapier's hosted leaderboard. Model Atlas uses the AA headline score directly and keeps the page's reasoning-effort label, per-task cost, runtime, and token telemetry for resource scoring.

Harvey LAB comes from the dedicated Artificial Analysis evaluation page, not the Vals page or Harvey's repository examples. Model Atlas uses the AA all-pass rate directly because the benchmark's strict pass condition is the frontier signal; criterion pass rate remains source context only.

ITBench uses Artificial Analysis' implementation and average precision at full recall score over 59 Kubernetes incident root-cause tasks with three repeats. The main AA leaderboard supplies all available scores, while the dedicated evaluation page adds model, effort, cost, runtime, and input/output token telemetry where complete. Model Atlas divides aggregate cost and token totals by 177 task runs, preserves AA's per-task runtime, and feeds the resulting output-per-task resources into Speed and Value.

Blueprint-Bench 2 uses the normalized connectivity similarity score and preserves only model display names and scores; Andon's internal source identifiers are not used for matching.

Riemann-bench uses the normalized public percent score and preserves provider, model label, and leaderboard last-updated date from the page.

GDP.pdf uses the reported percentage score as a normalized benchmark score and preserves model display name, provider label, and page update date.

Vals Index uses the overall percentage score as a normalized benchmark score and preserves the component task rows for source audit/display only. The official page labels the index proprietary and describes non-public Vals-built datasets, while the published formula also includes public coding benchmarks such as SWE-bench Verified and Terminal-Bench 2.1. Model Atlas therefore treats it as a useful aggregate baseline, not a pure frontier source. Its reported cost and latency stay out of Speed and Value because they are Vals harness-local measurements rather than comparable task-resource inputs.

Epoch Capabilities Index uses Epoch's published ECI value directly and preserves its lower and upper confidence bounds, model-version identifiers, access category, organization, and observation date. FrontierMath Tier 4, Chess Puzzles, and EBR-Bench use successful runs from Epoch's bulk benchmark CSV, preserving run IDs, task versions, standard errors, and observation timestamps. FrontierMath is filtered to the exact v2-private task so older ZIP-era scores cannot enter the current leaderboard.

WeirdML uses `avg_acc` as its score and preserves all 17 task accuracies, aggregate standard error, cost, output-token count, code-length quantiles, execution time, release date, API source, and effort-labelled model variant.

ProofBench comes directly from the current Vals benchmark page rather than Epoch's stale ZIP copy. Model Atlas uses overall compiler-verified proof accuracy, preserves Vals version, standard error, latency, per-test cost, harness, and inference settings, and excludes `aristotle/aristotle` from general-model scoring because it is a specialized proving system rather than a comparable general-purpose model.

Chartography, HANDBOOK.md, and EnterpriseBench CoreCraft use the public Surge leaderboard percentages and preserve displayed provider, model configuration, rank, and update date when present. Their page-local cost or judge details do not feed Speed or Value.

## Scoring Shape

The scoring map is:

$$
\text{raw source fields}\rightarrow\text{normalized quality fields}\rightarrow(I_m,A_m)\rightarrow\text{Speed, Value}
$$

Quality is normalized before averaging. Displayed Speed is the public runtime score: it combines provider/runtime evidence, workflow simulation, and quality-adjusted benchmark task-time components. Displayed Value combines absolute log blended price with quality-adjusted price, workflow, and benchmark task-cost components.

AA's `coding_index` can be kept as source context when available, but it is not used to compute any score. There is no standalone coding score.

## Scoring Details

Each selected quality benchmark is min-max normalized before aggregation. Raw provider speed and workflow runtime inputs are logged before min-max normalization. Resource efficiency subtracts the model-balanced expected signal at comparable quality, then averages a model-balanced percentile score with a min-max score using 2.5% one-sided winsorization of the favorable residual tail. Price and benchmark resource inputs are logged once; the completed workflow-efficiency output is not logged again. Model-balanced empirical distributions also support benchmark imputation.

### Calibration Population

Reasoning-effort variants remain separate scored configurations, but they do not multiply a model's influence on empirical reference distributions. Model identity uses the normalized public model name, with route ID as a fallback when no name is available. For any distribution, let $n_m$ be the number of included variants of model $m$. Variant $v$ receives calibration weight

$$
a_{m,v}=\frac{1}{n_m}
$$

so every represented model contributes one total unit of mass. The included-variant count is recomputed for each distribution because a variant can have one metric and lack another. Model weights apply to percentile and quantile mappings, imputation validation errors, quality-local expectations, residual percentiles, and winsorized min-max anchors. Scoring diagnostics report both contributing row count and effective model count.

### Quality Normalization

Each quality input is first converted into a normalized 0-100 benchmark score. For model $m$ and benchmark field $b$, raw source value $x_{m,b}$ is scaled by the observed minimum $x_{\min,b}$ and maximum $x_{\max,b}$ for that field:

$$
z_{m,b}=100\cdot\operatorname{clamp}\left(\frac{x_{m,b}-x_{\min,b}}{x_{\max,b}-x_{\min,b}},0,1\right)
$$

The observed minimum maps to $0$, the observed maximum maps to $100$, and every selected benchmark is normalized before it enters a dimension average. Imputed values use these frozen observed anchors and are clamped to the same score range, so imputation cannot redefine a benchmark's scale. This linear transformation preserves all within-benchmark gap ratios; unlike percentile rank, it does not turn uneven performance gaps into evenly spaced positions.

Within each dimension, the selected benchmark set $\mathcal{B}_D$ contains the benchmarks admitted to that dimension. Let $i_b$ be benchmark $b$'s importance and $\lambda_{b,D}$ its loading for dimension $D$, so $w_{b,D}=i_b\lambda_{b,D}$. The normalized dimension mean is weighted by those effective weights:

$$
\bar{B}_{m,D}=\frac{\sum_{b\in\mathcal{B}_D,z_{m,b}\text{ available or imputed}}w_{b,D}z_{m,b}}{\sum_{b\in\mathcal{B}_D,z_{m,b}\text{ available or imputed}}w_{b,D}}
$$

The evidence coverage ratio uses the same effective weights. Let $q_{m,b}=1$ for an observed value, $q_{m,b}=\operatorname{clamp}(1-\tilde e_{m,b}/25,0,1)$ for a validated imputation, and $q_{m,b}=0$ for a missing value. Here $\tilde e_{m,b}$ is the one-dimensional normalized held-out median absolute error for a direct prediction or the cross-only error when that row actually uses both benchmark and sibling-effort evidence. Missing a small contribution therefore reduces confidence less than missing a large contribution:

$$
c_{m,D}=\frac{\sum_{b\in\mathcal{B}_D}w_{b,D}q_{m,b}}{\sum_{b\in\mathcal{B}_D}w_{b,D}}
$$

The coverage confidence $C(c)$ is $0$ at or below $10\%$ evidence coverage, $1$ at or above $60\%$ evidence coverage, and a smoothstep interpolation between those bounds.

Public admission first requires a complete basic profile: release date, text output, input and output prices, context and output limits, throughput, and latency or end-to-end latency. A model variant must have at least eight observed selected benchmarks, including at least one Intelligence benchmark, at least one Agentic benchmark, and at least one of the three aggregate indexes: Artificial Analysis Intelligence Index, Epoch Capabilities Index, or Vals Index. This fixed evidence floor remains stable when the selected portfolio grows; broader coverage continues to affect score confidence instead of raising the admission threshold. A benchmark without a reported effort belongs to the model's default highest-effort variant; explicitly labelled observations belong to their matching variants. Imputed values do not satisfy admission. After rescoring, a variant must reach at least 10 in at least one of Intelligence, Agentic, Speed, or Value. These admission gates only remove public rows after reference scoring; they do not themselves recalibrate the reference population.

$$
D_m=\bar{B}_{m,D}C(c_{m,D})
$$

$$
\begin{aligned}
I_m&=D_{m,\text{Intelligence}}\\
A_m&=D_{m,\text{Agentic}}
\end{aligned}
$$

### Benchmark Imputation

Same-dimension evidence used for benchmark imputation is also averaged with benchmark importance multiplied by the configured dimension loading. For a benchmark selected in both dimensions, Model Atlas produces an Intelligence-context prediction and an Agentic-context prediction, then combines the available predictions using that benchmark's dimension loadings. Available loadings are renormalized when only one context can make a prediction. The minimum evidence threshold still counts distinct observed benchmarks so one heavily weighted benchmark cannot satisfy the imputation requirement by itself.

Missing benchmark values are imputed only for scoring. Every model-benchmark pair receives at most one imputed value, and only observed benchmark values can provide evidence for another benchmark, so imputation is non-recursive. Imputed values are not treated or displayed as observed source values.

APEX Agents first tests a source-specific Mercor-to-AA crosswalk. Let $S$ contain rows where Mercor Loop Pass@1 and AA match the same model and assigned reasoning effort, let $M_i$ and $A_i$ be their normalized scores, and let $w_i$ give every base-model family one total unit of weight across its variants. The fitted source offset is:

$$
\delta=\operatorname{weightedMedian}_{i\in S}(M_i-A_i;w_i)
$$

Validation withholds the entire base-model family of each overlap row. For family $f$, Model Atlas refits $\delta_{-f}$ without that family, then measures the family-balanced held-out error:

$$
e=\operatorname{weightedMedian}_{i\in S}\left(\left|M_i-\delta_{-f(i)}-A_i\right|;w_i\right)
$$

The crosswalk requires at least three effective overlap families, at least three effective families with valid held-out predictions, and $e\le 0.02$. When it passes, a model-effort row that has Mercor but no AA result receives:

$$
\hat A_m=\operatorname{clamp}(M_m-\delta,0,1),\qquad q_m=\operatorname{clamp}\left(1-\frac{e}{0.02},0,1\right)
$$

$q_m$ is the imputed row's evidence credit before the ordinary benchmark-coverage confidence curve. Observed AA values are never replaced, Mercor rows do not change the observed APEX normalization anchors, and Mercor-derived values never satisfy public admission or become evidence for another imputation. If the overlap gate fails, APEX Agents falls through to the ordinary benchmark imputer.

The context benchmark $k$ can be any other selected benchmark in dimension $D$. Frontier and baseline use the same prediction evidence:

$$
C_{m,b}=\operatorname{mean}\left(z_{m,k}:k\in D,k\neq b,z_{m,k}\text{ available}\right)
$$

$$
\hat{x}_{m,b}=\operatorname{weightedQuantile}\left(\{(x_{j,b},a_j):x_{j,b}\text{ and }C_{j,b}\text{ observed}\},\operatorname{weightedQuantileRank}(C_{m,b})/100\right)
$$

The target and context distributions use the same paired calibration rows, and the quantile rank uses the same weighted mid-mass positions as the weighted quantile. Each benchmark imputer is validated by withholding every variant of the observed model from calibration evidence and predicting that value. Let $e_b$ be the model-weighted median raw absolute leave-one-model-out error. Imputation is refused unless at least four effective models produce valid held-out predictions and the separately measured normalized median absolute error is at most 25 points.

When a model has multiple reasoning efforts, the imputer also tests a two-dimensional candidate. The original predictor still requires at least three other observed benchmarks at the target effort. A cross-effort predictor requires a sibling effort with at least three observed selected benchmarks and at least four effective reference models that pair the same target and source efforts. Every sibling benchmark is normalized on its own benchmark scale before aggregation; the resulting context percentile is mapped into the target benchmark distribution exactly as in the one-dimensional predictor. No raw score difference is transferred between benchmarks. Each ordered effort transition is calibrated separately, so either a higher or lower sibling may provide evidence when that direction has enough support.

The two-dimensional candidate gives one equal slot to the original direct prediction and one to the available cross-effort predictions. It is used for a benchmark only when leave-one-model-out validation reduces normalized median absolute error by at least 2% relative to an allowed one-dimensional predictor, or when it brings a refused one-dimensional predictor within the 25-point error limit. At least four independent held-out models must actually use the cross-effort path, and their cross-only normalized median absolute error must not exceed 25 points. For an individual missing value, both the target-effort benchmark context and the sibling-effort context must still pass their evidence thresholds. If the sibling context is sparse, that value falls back to the separately validated one-dimensional predictor and penalty; if the one-dimensional predictor is also unreliable, the value remains missing. Other observations from the held-out model may provide query context, but every variant of that model remains excluded from the mapping fitted for its validation prediction. Imputed values never become context for another imputation.

$$
x_{m,b}^{\text{imputed}}=\max\left(0,\hat{x}_{m,b}-\kappa_g e_b\right)
$$

The missing-data multiplier is $\kappa_{\text{frontier}}=1$ and $\kappa_{\text{baseline}}=0.5$. Group changes only this penalty; it does not change context selection, validation evidence, or observed benchmark weight. A value that actually uses the two-dimensional predictor subtracts the cross-only raw held-out median error; a one-dimensional fallback subtracts the one-dimensional error. The same-dimension context score $C_{m,b}$ uses normalized quality evidence, not raw benchmark values.

Validation-weighted evidence coverage remains in addition to the benchmark-local error subtraction. The subtraction makes every imputed value conservative, while evidence credit reflects the held-out reliability of the predictor actually used for that row. A sparse sibling-effort context falls back to the separately validated one-dimensional value, penalty, and confidence. Imputations remain ineligible for public admission regardless of that credit.

### Price Profiles

All price terms in this block are USD per 1M tokens.

$$
\begin{aligned}
\text{task price}&=0.80\cdot\text{input-side price}+0.20\cdot\text{output-side price}\\
\text{chat price}&=0.50\cdot\text{input-side price}+0.50\cdot\text{output-side price}\\
\text{agentic price}&=0.30\cdot\text{input-side price}+0.70\cdot\text{output-side price}\\
\text{blended price}&=0.25\cdot\text{task price}+0.40\cdot\text{chat price}+0.35\cdot\text{agentic price}
\end{aligned}
$$

The profile weights are simple usage priors, not measured traffic shares. Task is input-heavy, chat is balanced, and agentic is output-heavy; the blended price leans toward chat and agentic use because those are the cases where price differences most often affect model choice.

### Workflow Simulation

#### Scenario Mix

The workflow simulation is a fixed stress mix rather than a workload trace. It includes small calls, long-context calls, repeated chat, and agentic loops so latency, throughput, cache pricing, and output-heavy work all have a chance to matter.

| Scenario | Weight | Calls | Input tokens/call | Output tokens/call |
| --- | ---: | ---: | ---: | ---: |
| Micro | 15% | 1 | `500..3000` | `1..50` |
| Refine/translate | 15% | 1 | `500..20000` | `500..20000` |
| Extract/structure | 15% | 1 | `3000..20000` | `100..1200` |
| Chat/reasoning | 20% | 4 | `1000..12000` | `300..2000` |
| Long synthesis | 15% | 1 | `20000..80000` | `1500..6000` |
| Agentic loop | 20% | 8 | `8000..60000` | `500..4000` |

#### Log-Uniform Token Ranges

Input and output token counts use the expected value of a log-uniform range. Log-uniform ranges keep broad token spans from being dominated by their largest endpoint, which is closer to how prompt sizes vary across real usage:

$$
\operatorname{ELogUniform}(L,U)=\frac{U-L}{\log U-\log L}
$$

#### Workflow Runtime

$$
\begin{aligned}
T_{m,s}&=n_s\cdot\left(\ell_m+\lambda \operatorname{ELogUniform}(x_{\text{input},s})+\operatorname{ELogUniform}(x_{\text{output},s})/\tau_m\right)\\
T_{\text{workflow},m}&=\sum_s w_sT_{m,s}
\end{aligned}
$$

Workflow runtime combines model latency $\ell_m$, model output throughput $\tau_m$, scenario call count $n_s$, and input-token friction $\lambda=0.0001$ seconds per input token. The input-token friction is explicit because there is no reliable per-model prefill throughput source.

#### Workflow Price Signal

Workflow Price uses the same scenario mix, but each scenario contributes useful work per log dollar. This is one of the provider price components that feeds the public Value score.

$$
U_{m,s}=\frac{\operatorname{smoothstep}\left(q_{m,s}/q_{\text{full},s}\right)}{\log_{10}(1+\text{scenario cost}_{m,s})}
$$

The scenario quality blend $q_{m,s}$ combines Intelligence and Agentic scores for model $m$ under scenario $s$, and $q_{\text{full},s}$ is that scenario's full-credit threshold. The smoothstep quality multiplier gives little credit below the scenario threshold and then saturates, because being far above "good enough" should not let quality swamp price in a value signal. Repeated chat and agentic scenarios model cache-read pricing after the first call: chat treats 50% of input as cacheable and agentic treats 70% of input as cacheable, with a midpoint 70% hit rate from the configured `50..90%` range. One-shot scenarios do not receive cache benefit.

### Speed Score

Displayed Speed is a public score that gives equal weight to provider speed stats, the workflow runtime simulation, and each active benchmark task-time input:

$$
\begin{aligned}
S^{\text{stats}}_m&=\operatorname{mean}\left(
\operatorname{MinMax}(\log \tau_m),
\operatorname{MinMax}_{\text{lower}}(\log \ell_m),
\operatorname{MinMax}_{\text{lower}}(\log \text{end-to-end latency}_m)
\right)\\
S^{\text{workflow}}_m&=\operatorname{MinMax}_{\text{lower}}(\log T_{\text{workflow},m})
\end{aligned}
$$

Higher throughput ranks higher, while lower latency, lower end-to-end latency, and lower workflow seconds rank higher. The provider stats component requires at least two provider speed stats.

### Task Resource Efficiency

Speed's benchmark task-time component and Value's benchmark task-cost component share the same neighborhood method. The only difference is the resource amount:

$$
\begin{aligned}
A^{\text{time}}_{m,b}&=\text{effective task seconds}_{m,b}\\
A^{\text{cost}}_{m,b}&=\text{task cost}_{m,b}
\end{aligned}
$$

Task resources can come from direct per-benchmark telemetry or from the AA per-task resource metric when the benchmark portfolio marks the benchmark as AA-backed. If a benchmark reports output tokens but not wall time, effective task seconds fall back to output tokens divided by served throughput.

For each active benchmark resource source, the benchmark score first becomes a local quality coordinate. The score $q_{m,b}$ is model $m$'s benchmark score for benchmark $b$ on the 0-1 scale. Percent-style source scores use $q_{m,b}=x_{m,b}/100$; already-normalized source scores use $q_{m,b}=x_{m,b}$.

$$
Z_{m,b}=\frac{\operatorname{logit}(q_{m,b})-\operatorname{weightedMedian}_j(\operatorname{logit}(q_{j,b}),a_{j,b})}{\operatorname{deviation}_b}
$$

The logit transform puts benchmark percentages on an odds-like scale before measuring "similar quality." A one-point gap near the ceiling is more meaningful than a one-point gap near the middle: moving from 95% to 96% reduces remaining error by 20%, while moving from 50% to 51% is a much smaller frontier-quality distinction. Using logit keeps resource comparisons local to models that are genuinely close in benchmark difficulty, especially on hard or high-scoring benchmarks.

The denominator is a robust benchmark-local spread on the same logit scale:

$$
\operatorname{deviation}_b=\max\left(\frac{Q^{a}_{75}(\{\operatorname{logit}(q_{j,b})\})-Q^{a}_{25}(\{\operatorname{logit}(q_{j,b})\})}{1.349},0.35\right)
$$

The $1.349$ factor converts interquartile range into a standard-deviation-like spread for a roughly normal distribution, and the $0.35$ floor prevents a nearly tied benchmark from making small quality differences dominate the neighborhood comparison.

Models compare resource use mostly against nearby-quality models. The neighborhood weight uses $\sigma=0.5$, which is tight enough to keep comparisons quality-local but wide enough that a benchmark does not require exact score ties. Every variant of the focal model is excluded from its expectation so its own effort variants cannot manufacture support:

$$
w_{m,j,b}=\mathbf{1}[\operatorname{model}(m)\ne\operatorname{model}(j)]a_{j,b}\exp\left(-\frac{1}{2}\left(\frac{Z_{m,b}-Z_{j,b}}{0.5}\right)^2\right)
$$

Here $a_{j,b}$ divides one model's unit mass across its variants that have both quality and resource evidence for benchmark $b$.

Cost and runtime are logged before calculating the expected resource signal and its residual:

$$
\mu^{r}_{m,b}=\frac{\sum_j w_{m,j,b}\log A^{r}_{j,b}}{\sum_j w_{m,j,b}},\qquad
\epsilon^{r}_{m,b}=\log A^{r}_{m,b}-\mu^{r}_{m,b}
$$

A negative residual means the model uses less resource than expected for its quality. Comparison weights are first combined by model so multiple variants cannot manufacture peer support. Let $W_{m,k,b}$ be the total neighborhood weight for comparison model $k$. The supported peer mass is

$$
s_{m,b}=\min\left(\sum_k W_{m,k,b},\frac{(\sum_k W_{m,k,b})^2}{\sum_k W_{m,k,b}^2}\right)
$$

and its support confidence is $h_{m,b}=\operatorname{smoothstep}((s_{m,b}-1)/2)$. The first term prevents many distant, near-zero neighbors from appearing well supported; the second is the effective independent-model count. Support of one or less gives no comparative confidence, while support of three gives full confidence. An observed resource with no supported comparison remains neutral at $50$ rather than becoming missing or receiving self-credit.

For each resource signal, let $L$ be the model-balanced 2.5th percentile of supported residuals and let $U$ be the largest supported residual. Only the favorable low-residual tail is winsorized. The magnitude-preserving score is

$$
M^{r}_{m,b}=100\cdot\frac{U-\operatorname{clamp}(\epsilon^{r}_{m,b},L,U)}{U-L}.
$$

Let $P^{r}_{m,b}$ be the model-balanced percentile of $-\epsilon^{r}_{m,b}$ among supported residuals, so lower resource use receives the higher percentile. The mapped resource score averages magnitude and distribution position:

$$
H^{r}_{m,b}=\frac{M^{r}_{m,b}+P^{r}_{m,b}}{2},
\qquad
R^{r}_{m,b}=50+h_{m,b}(H^{r}_{m,b}-50).
$$

The equal mean retains half of the residual's logged magnitude information and half of its model-balanced distribution position. One-sided winsorization prevents one exceptionally cheap or fast model from setting the entire magnitude scale. Unsupported quality extremes shrink to neutral instead of being expanded by either mapping. If the supported residuals have no meaningful spread, every observed residual receives the neutral score of $50$.

Each model's task-resource signal is the mean of its available benchmark resource scores, multiplied by a coverage confidence. Coverage is the share of active benchmark resource sources that the model actually has:

$$
\bar{R}^{r}_m=\operatorname{mean}\left(R^{r}_{m,b}:R^{r}_{m,b}\text{ available}\right)
$$

$$
\operatorname{coverage}_{m,r}=\frac{\text{available benchmark resource scores for model }m\text{ and resource }r}{\text{active benchmark resource sources for resource }r}
$$

$$
\gamma^{r}_m=
\begin{cases}
1,& \operatorname{coverage}_{m,r}\ge0.6\\
\operatorname{smoothstep}\left(\frac{\operatorname{coverage}_{m,r}-0.1}{0.5}\right),& \operatorname{coverage}_{m,r}<0.6
\end{cases}
$$

$$
E^{r}_m=\bar{R}^{r}_m\gamma^{r}_m
$$

$\operatorname{smoothstep}$ is clamped to the 0-1 range. Models get full confidence once they cover at least 60% of active task-resource sources, and near-zero confidence below roughly 10% coverage. That ramp avoids rewarding a model for one lucky resource row while also not requiring complete coverage from sparse benchmark sources.

Provider speed and workflow runtime use $\log x$ as their input to ordinary min-max normalization. Value's absolute price component uses $\log_{10}(1+\text{blended price})$ with model-balanced 2.5% favorable-tail winsorized min-max. Its quality-adjusted log blended price component subtracts the locally expected log blended price at the model's aggregate quality, then uses the residual percentile/min-max mean above. Its workflow component applies the same residual hybrid to the locally expected negative workflow-efficiency signal; the completed workflow output is not logged again.

$$
S_{\uparrow}(x)=100\operatorname{clamp}\left(\frac{g(x)-y_{\min}}{y_{\max}-y_{\min}},0,1\right)
$$

Here $g(x)$ is the completed input signal and $y_{\min}$ and $y_{\max}$ are its minimum and maximum finite values. For raw provider and workflow inputs, $g(x)=\log x$. The formula above applies when higher values are better, such as throughput. Lower-is-better inputs reverse the scale:

$$
S_{\downarrow}(x)=100\operatorname{clamp}\left(\frac{y_{\max}-g(x)}{y_{\max}-y_{\min}},0,1\right)
$$

The observed minimum maps to $0$ and the observed maximum maps to $100$ before any lower-is-better reversal. Absolute-price inputs instead use one-sided winsorized anchors. Quality-conditioned residual inputs average their one-sided winsorized min-max score with their model-balanced percentile score.

The public Speed score uses each benchmark task-time input as its own equally weighted component. The public Value score uses each price and benchmark-cost input as its own equally weighted component:

$$
\begin{aligned}
\text{TaskTime}_{m,b}&=R^{\text{time}}_{m,b}\\
\text{Speed}_m&=C^{\text{speed}}_m\cdot\operatorname{mean}\left(S^{\text{stats}}_m,S^{\text{workflow}}_m,\{\text{TaskTime}_{m,b}\}\right)\\
\text{Value}_m&=C^{\text{value}}_m\cdot\operatorname{mean}\left(P^{\text{blend}}_m,P^{\text{quality}}_m,P^{\text{workflow}}_m,\{R^{\text{cost}}_{m,b}\}\right)
\end{aligned}
$$

$C^{\text{speed}}_m$ is the coverage-confidence ramp applied over the provider stats component, workflow component, and active benchmark task-time components. $C^{\text{value}}_m$ applies the same ramp over absolute log blended price, quality-adjusted log blended price, quality-adjusted workflow price efficiency, and active benchmark task-cost components.

$P^{\text{blend}}_m$ is the winsorized min-max score for absolute log blended price. $P^{\text{quality}}_m$ and $P^{\text{workflow}}_m$ are the percentile/min-max means for the quality-conditioned log-price and workflow-efficiency residuals.
