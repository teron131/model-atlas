# Model Atlas Methodology

## Purpose

This project is trying to build the best current version of my opinionated LLM ranking. It starts from Artificial Analysis because AA is the best benchmark aggregation source I have found so far, but the point is not to mirror AA exactly. The point is to keep the parts of AA and related provider data that help separate current models in a subjectively meaningful way.

The ranking is not an average of everything available upstream. Many benchmarks are low-signal for this purpose: some are saturated, some are stale, some are noisy, and some reward capabilities that do not matter much for the downstream model choices I care about. A benchmark only belongs here if it still creates a useful relative ordering among current models.

The main ranking choices are explicit: selected intelligence benchmarks, selected agentic benchmarks, task/chat/agentic price profiles, workflow simulation profiles, and speed anchors.

## Benchmark Selection

Benchmark admission follows the standards in `docs/standards.md`. Accepted benchmarks are classified as `frontier` or `baseline`; rejected benchmarks do not affect the ranking.

The ranking has two quality dimensions.

- Intelligence
  - Captures broad capability: factual accuracy, hard reasoning, professional knowledge, and structured problem solving outside harness/tool execution.
  - Evidence comes from benchmarks with a non-zero Intelligence portion in the benchmark portfolio.
- Agentic
  - Captures workflow usefulness: coding or task execution with specific tools, instruction following, self-verification, reliability under constraints, harness/tool execution, and work-like task completion.
  - Evidence comes from benchmarks with a non-zero Agentic portion in the benchmark portfolio.

There is no standalone coding score in the current ranking. Coding difficulty does not automatically become Agentic. Static coding or scientific programming benchmarks count as Intelligence when they mainly test professional knowledge, reasoning, or problem formulation; coding benchmarks count as Agentic when they require tool use, repo/file manipulation, terminal execution, or harnessed workflow completion. AA SciCode is treated as structured code-generation/problem-solving evidence under intelligence. DeepSWE, Terminal-Bench 2.1, and AA tau3 Banking remain agentic. Agents' Last Exam is selected in both intelligence and agentic because it combines professional knowledge with harnessed real-world workflow execution.

Selected benchmarks have one scoring group: `baseline` or `frontier`. Source is metadata. A benchmark can come from Artificial Analysis and still be frontier if it is hard, current, distinctive, and useful for separating frontier models.

For accepted benchmarks, the per-benchmark scoring knobs are deliberately narrow: choose the group, then assign Intelligence and Agentic portions that sum to 100%. These portions allocate the benchmark's capability signal between the two quality dimensions; they are not arbitrary standalone weights. A first-party or partly opaque agent workflow benchmark can be kept `baseline` and `0%` Intelligence / `100%` Agentic when the evidence is useful but too narrow or source-specific to act as a frontier model-quality claim.

When the benchmark portfolio changes, this table should change with it. Additions, removals, or group/portion changes should explain the capability being measured, why the benchmark earns or loses ranking space, and whether its task resources can feed Speed or Value.

| Benchmark | Group | Intelligence Portion | Agentic Portion | Description and Decision Note |
| --- | --- | ---: | ---: | --- |
| APEX&nbsp;Agents | frontier | 0% | 100% | Long-horizon professional-services workflows with realistic tooling, rubrics, and domain constraints. The signal is pure agentic task completion. |
| Agents'&nbsp;Last&nbsp;Exam | frontier | 20% | 80% | Real-world software and professional workflows. It combines professional knowledge with harnessed task execution, so it contributes to both dimensions but primarily Agentic. |
| AutomationBench | frontier | 0% | 100% | Zapier workflow-automation benchmark over realistic app tasks. It is frontier because it tests business-process execution with tool-like constraints, and its per-task cost can feed Value. |
| Blueprint-Bench&nbsp;2 | frontier | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| CritPt | frontier | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| CursorBench | frontier | 0% | 100% | Cursor's public coding-agent benchmark over ambiguous, multi-file tasks from real editor sessions. It is frontier because it separates current coding agents on practical workflow tasks; Composer rows are excluded because their model data is not independently available. |
| DeepSWE | frontier | 0% | 100% | Repo-level coding-agent benchmark. It tests long-horizon repository reasoning and code execution, using the default xhigh row when available and otherwise the best reported pass@1 row. |
| GDP.pdf | frontier | 90% | 10% | Professional PDF understanding with dense page-grounded rubrics. It is mostly document intelligence, with a small execution-reliability component. |
| GDPval-AA&nbsp;v2 | frontier | 60% | 40% | Real professional deliverables across economically important occupations. Mostly professional reasoning and synthesis, with substantial agentic credit for AA v4.1's longer tool/file/web trajectories and human-baselined work completion. |
| HLE | frontier | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| Riemann-bench | frontier | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| tau3&nbsp;Banking&nbsp;(AA) | frontier | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It is frontier because current models still struggle and the task shape is close to deployable support work. |
| Terminal-Bench&nbsp;2.1 | frontier | 0% | 100% | AA and Vals both report terminal-agent task execution and environment handling. Model Atlas aggregates their matched overall rows by model and harness, using the best score and median cost/time resources. It is frontier because terminal task execution is a current agentic stress test with meaningful separation among strong systems. |
| BrowseComp | baseline | 0% | 100% | Web/research solving where browsing behavior matters more than static knowledge. It stays baseline because public web tasks have higher contamination exposure and less frontier-like top spread. |
| LCR | baseline | 100% | 0% | Long-context document reasoning over large document sets. It remains useful breadth coverage, but current top-model spread is narrower than harder specialist and professional-work tests. |
| Omniscience&nbsp;Accuracy | baseline | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to decide frontier top fights. |
| SciCode | baseline | 80% | 20% | Scientist-curated Python problems. The main signal is scientific problem formulation and structured reasoning; executable code correctness adds a smaller execution signal. |
| Toolathlon | baseline | 20% | 80% | Multi-tool workflow execution with some planning and domain understanding. Limited current row count and provenance keep it baseline. |
| Vals Index | baseline | 60% | 40% | Vals aggregate over finance and coding tasks. The official page labels the index proprietary because it includes non-public Vals-built components, but its formula also includes public coding benchmarks. Model Atlas keeps it baseline because the aggregate mixes Vals-specific tasks with benchmark families represented elsewhere. |

The baseline group anchors breadth, stability, and coverage. The frontier group marks benchmarks that are distinctive enough to matter more, but sparse enough that absence should count against a model until there is source evidence. Diagnostics and exclusions are not scoring groups.

### Quality Mix

Working quality mix is the same for Intelligence and Agentic:

| Component | Share |
| --- | ---: |
| AA index | 30% |
| baseline benchmarks | 30% |
| frontier benchmarks | 40% |

Baseline and frontier benchmark groups are portion-weighted before they are combined. This keeps the grouping legible: the AA index anchors the dimension, baseline gives broad coverage, and frontier gets extra force as the proof-heavy separation signal.

Speed and Value are secondary. They matter because downstream applications have latency and budget constraints, but they should not overtake model quality. Speed gives equal weight to provider speed stats, workflow simulation, and each active benchmark task-time input. Value gives equal weight to blended price, quality per price, workflow price value, and each active benchmark task-cost input.

## Source Notes

Artificial Analysis is the primary benchmark source. It supplies the broad Intelligence and Agentic indexes, selected benchmark fields, Intelligence task cost, Intelligence task token counts, and enough latency/throughput information to estimate Intelligence task seconds. GPQA, MMMU-Pro, and other available AA fields can remain visible as source context when present, but they are not selected benchmark inputs unless listed in the benchmark portfolio.

OpenRouter supplies current route pricing and speed measurements used for blend price, workflow-simulated seconds, and workflow-simulated price efficiency. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

Terminal-Bench 2.1 combines the AA leaderboard score, the dedicated AA Terminal-Bench evaluation page, and the Vals Terminal-Bench 2.1 page when they match the same model. The benchmark score is the best available AA or Vals overall score, matching the way people usually compare a model's best harness result. This intentionally gives a small reward to models with more harness coverage: if multiple independent harnesses can make the same model work, the ranking credits the strongest observed execution path instead of forcing a noisy cross-harness average. Cost and time are still the medians of available per-task resource values so one harness does not dominate resource estimates. AA cost and token totals are divided by the benchmark's 89 tasks and 3 repeats per task; AA time uses the page's reported per-task runtime. Vals supplies score, cost, time, and harness labels but no token counts, so token fields remain AA-only when present.

DeepSWE supplies pass@1, mean task cost, mean task duration, and mean output tokens. Model Atlas preserves effort/config rows but scores the default xhigh row when present, falling back to the best pass@1 row only when xhigh is absent. Task duration can feed Speed's benchmark task-time component, task cost can feed Value, and token totals remain source context.

Agents' Last Exam uses `max(median_score, mean_score)` from the Full Overall split. Raw source rows preserve total runtime and token counts, while displayed ALE resource columns divide those totals by the source `runs` count and then use the lower of median and mean per-run values. Partial-credit score is the scoring input because it is more informative than pass-rate accuracy.

Toolathlon uses the reported score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

CursorBench preserves score, average cost per task, tokens per task, steps per task, and reasoning effort where shown. When multiple public effort rows map to the same base model, the scoring lookup uses the best reported score while preserving all raw effort rows. Cursor's private Composer models are excluded because their model data is not available from independent catalog sources.

AutomationBench supplies public workflow-automation scores, reasoning-effort labels, per-task cost, and domain winners. Model Atlas uses the overall leaderboard score with a bounded domain-leadership lift, so strong domain leaders get a small credit without overriding the main leaderboard. Per-task cost can feed Value; AutomationBench does not feed Speed unless comparable runtime appears.

Blueprint-Bench 2 uses the normalized connectivity similarity score and preserves only model display names and scores; Andon's internal source identifiers are not used for matching.

Riemann-bench uses the normalized public percent score and preserves provider, model label, and leaderboard last-updated date from the page.

GDP.pdf uses the reported percentage score as a normalized benchmark score and preserves model display name, provider label, and page update date.

Vals Index uses the overall percentage score as a normalized benchmark score and preserves the component task rows for source audit/display only. The official page labels the index proprietary and describes non-public Vals-built datasets, while the published formula also includes public coding benchmarks such as SWE-bench Verified and Terminal-Bench 2.1. Model Atlas therefore treats it as a useful aggregate baseline, not a pure frontier source. Its reported cost and latency stay out of Speed and Value because they are Vals harness-local measurements rather than comparable task-resource inputs.

## Scoring Shape

The scoring map is:

$$
\text{raw source fields}\rightarrow\text{normalized quality fields}\rightarrow(I_m,A_m)\rightarrow\text{Speed, Value, Overall}
$$

Quality is normalized before averaging. Displayed Speed is the public runtime score: it combines provider/runtime evidence, workflow simulation, and benchmark task-time components. Displayed Value combines provider price evidence, workflow price value, and benchmark task-cost components.

AA's `coding_index` can be kept as source context when available, but it is not used to compute any score. There is no standalone coding score.

## Scoring Details

This section gives the scoring rules at the level needed to understand rank movement. Variables are introduced where they are used. $\operatorname{Percentile}(y)$ means the 0-100 percentile of $y$ among models with a value for that component. $\operatorname{Percentile}_{\text{lower}}(y)$ reverses the direction for lower-is-better values.

### Quality Normalization

Each quality input is first converted into a normalized 0-100 benchmark score. For model $m$ and benchmark or AA index field $b$, raw source value $x_{m,b}$ is scaled by the observed minimum $x_{\min,b}$ and maximum $x_{\max,b}$ for that field:

$$
z_{m,b}=100\cdot\frac{x_{m,b}-x_{\min,b}}{x_{\max,b}-x_{\min,b}}
$$

The observed minimum maps to $0$, the observed maximum maps to $100$, and every benchmark is normalized before it enters a dimension average.

Within each dimension, benchmark groups are averaged before they are combined. The selected baseline set $\mathcal{B}^{\text{baseline}}_D$ and frontier set $\mathcal{B}^{\text{frontier}}_D$ contain the benchmarks for dimension $D$, and each benchmark contributes through its configured dimension portion $p_{b,D}$.

$$
B_{m,D}^{\text{baseline}}=\frac{\sum_{b\in\mathcal{B}^{\text{baseline}}_D}p_{b,D}z_{m,b}}{\sum_{b\in\mathcal{B}^{\text{baseline}}_D}p_{b,D}}
$$

$$
B_{m,D}^{\text{frontier}}=\frac{\sum_{b\in\mathcal{B}^{\text{frontier}}_D}p_{b,D}z_{m,b}}{\sum_{b\in\mathcal{B}^{\text{frontier}}_D}p_{b,D}}
$$

The component quality dimension score uses the same component weights for Intelligence and Agentic:

$$
D_m=0.30z_{m,\text{AA index }D}+0.30B_{m,D}^{\text{baseline}}+0.40B_{m,D}^{\text{frontier}}
$$

$$
\begin{aligned}
I_m&=D_{m,\text{Intelligence}}\\
A_m&=D_{m,\text{Agentic}}
\end{aligned}
$$

### Benchmark Imputation

Missing benchmark values are imputed only for scoring. They are not treated or displayed as observed source values.

Missing frontier benchmarks use other selected frontier benchmarks as the percentile context. For model $m$, missing benchmark $b$, and context benchmark $k$, the model's available frontier evidence estimates where it should sit in benchmark $b$'s observed distribution:

$$
C_{m,b}^{\text{frontier}}=\operatorname{mean}\left(z_{m,k}:k\in D\cap\text{Frontier},k\neq b,z_{m,k}\text{ available}\right)
$$

$$
x_{m,b}^{\text{imputed}}=\operatorname{quantile}\left(\{x_{j,b}:x_{j,b}\text{ observed}\},\operatorname{Percentile}(C_{m,b}^{\text{frontier}})/100\right),\quad b\in\text{Frontier}
$$

Other missing benchmarks use same-dimension evidence and keep a conservative shrink toward the observed floor. Here the context benchmark $k$ can be any other selected benchmark in dimension $D$:

$$
C_{m,b}=\operatorname{mean}\left(z_{m,k}:k\in D,k\neq b,z_{m,k}\text{ available}\right)
$$

$$
\hat{x}_{m,b}=\operatorname{quantile}\left(\{x_{j,b}:x_{j,b}\text{ observed}\},\operatorname{Percentile}(C_{m,b})/100\right)
$$

$$
x_{m,b}^{\text{imputed}}=\min_j x_{j,b}+c\left(\hat{x}_{m,b}-\min_j x_{j,b}\right)
$$

The shrink confidence is fixed at $c=0.5$ so missing non-frontier benchmarks can help order models without pretending the imputed value is as strong as source evidence. The same-dimension context score $C_{m,b}$ uses normalized quality evidence, not raw benchmark values.

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
\operatorname{Percentile}(\tau_m),
\operatorname{Percentile}_{\text{lower}}(\ell_m),
\operatorname{Percentile}_{\text{lower}}(\text{end-to-end latency}_m)
\right)\\
S^{\text{workflow}}_m&=\operatorname{Percentile}_{\text{lower}}(T_{\text{workflow},m})
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
Z_{m,b}=\frac{\operatorname{logit}(q_{m,b})-\operatorname{median}_j(\operatorname{logit}(q_{j,b}))}{\operatorname{deviation}_b}
$$

The logit transform puts benchmark percentages on an odds-like scale before measuring "similar quality." A one-point gap near the ceiling is more meaningful than a one-point gap near the middle: moving from 95% to 96% reduces remaining error by 20%, while moving from 50% to 51% is a much smaller frontier-quality distinction. Using logit keeps resource comparisons local to models that are genuinely close in benchmark difficulty, especially on hard or high-scoring benchmarks.

The denominator is a robust benchmark-local spread on the same logit scale:

$$
\operatorname{deviation}_b=\max\left(\frac{Q_{75}(\{\operatorname{logit}(q_{j,b})\})-Q_{25}(\{\operatorname{logit}(q_{j,b})\})}{1.349},0.35\right)
$$

The $1.349$ factor converts interquartile range into a standard-deviation-like spread for a roughly normal distribution, and the $0.35$ floor prevents a nearly tied benchmark from making small quality differences dominate the neighborhood comparison.

Models compare resource use mostly against nearby-quality models. In practical terms, the score asks which model uses less task time or task cost than other models at a similar benchmark quality level. The neighborhood weight uses $\sigma=0.5$, which is tight enough to keep comparisons quality-local but wide enough that a benchmark does not require exact score ties:

$$
w_{m,j,b}=\exp\left(-\frac{1}{2}\left(\frac{Z_{m,b}-Z_{j,b}}{0.5}\right)^2\right)
$$

The benchmark-level resource efficiency score is the weighted share of similarly scoring benchmark results that use at least as much of that resource. Higher means better task-resource value versus comparable-quality models:

$$
R^{r}_{m,b}=100\cdot\frac{\sum_j w_{m,j,b}\mathbf{1}[A^{r}_{j,b}\ge A^{r}_{m,b}]}{\sum_j w_{m,j,b}},\quad r\in\{\text{time},\text{cost}\}
$$

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

The public Speed score uses each benchmark task-time input as its own equally weighted component. The public Value score uses each price and benchmark-cost input as its own equally weighted component:

$$
\begin{aligned}
\text{TaskTime}_{m,b}&=R^{\text{time}}_{m,b}\\
\text{Speed}_m&=C^{\text{speed}}_m\cdot\operatorname{mean}\left(S^{\text{stats}}_m,S^{\text{workflow}}_m,\{\text{TaskTime}_{m,b}\}\right)\\
\text{Value}_m&=C^{\text{value}}_m\cdot\operatorname{mean}\left(P^{\text{blend}}_m,P^{\text{quality}}_m,P^{\text{workflow}}_m,\{R^{\text{cost}}_{m,b}\}\right)
\end{aligned}
$$

$C^{\text{speed}}_m$ is the coverage-confidence ramp applied over the provider stats component, workflow component, and active benchmark task-time components. $C^{\text{value}}_m$ applies the same ramp over blended price, quality per price, workflow price value, and active benchmark task-cost components.

$P^{\text{blend}}_m$ is the lower-is-better percentile for blended provider price, $P^{\text{quality}}_m$ is quality per blended price, and $P^{\text{workflow}}_m$ is the workflow price-value signal.

### Overall Score

Overall combines quality with task-resource efficiency:

$$
\text{Overall}_m=0.35I_m+0.25A_m+0.20\widetilde{T}_m+0.20\widetilde{C}_m
$$

The overall weights keep 60% of the overall score on quality and 40% on task-resource utility. Intelligence gets the largest single share because broad capability is still the primary ranking target; Agentic, the benchmark task-time component, and Value are large enough to move rankings when models are otherwise close.

The overall blend uses filled benchmark task-time component $\widetilde{T}_m$ and filled Value $\widetilde{V}_m$. Missing resource evidence is filled only for the overall blend, not as observed evidence. The fill uses the known resource score distribution and a half-strength quality tradeoff prior:

$$
\operatorname{fillPercentile}_m=50-0.5\left(\operatorname{Percentile}(\operatorname{mean}(I_m,A_m))-50\right)
$$

The filled value is the known resource score at that percentile. Displayed Speed and Value stay blank when their required direct evidence is missing.
