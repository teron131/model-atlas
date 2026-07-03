# Model Atlas Methodology

## Purpose

This project is trying to build the best current version of my opinionated LLM ranking. It starts from Artificial Analysis because AA is the best benchmark aggregation source I have found so far, but the point is not to mirror AA exactly. The point is to keep the parts of AA and related provider data that help separate current models in a subjectively meaningful way.

The ranking is not an average of everything available upstream. Many benchmarks are low-signal for this purpose: some are saturated, some are stale, some are noisy, and some reward capabilities that do not matter much for the downstream model choices I care about. A benchmark only belongs here if it still creates a useful relative ordering among current models.

The main ranking choices are explicit: selected intelligence benchmarks, selected agentic benchmarks, task/chat/agentic price profiles, workflow simulation profiles, speed anchors, and overall score weights.

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

For accepted benchmarks, the per-benchmark scoring knobs are deliberately narrow: choose the group, then assign Intelligence and Agentic portions that sum to 100%. These portions allocate the benchmark's capability signal between the two quality dimensions; they are not arbitrary standalone weights. A proprietary or first-party agent workflow benchmark can be kept `baseline` and `0%` Intelligence / `100%` Agentic when the evidence is useful but too opaque to act as a frontier model-quality claim.

| Benchmark | Group | Intelligence Portion | Agentic Portion | Description and Decision Note |
| --- | --- | ---: | ---: | --- |
| Omniscience&nbsp;Accuracy | baseline | 100% | 0% | Factual recall in economically relevant domains. It stabilizes knowledge precision but is not sharp enough by itself to decide frontier top fights. |
| LCR | baseline | 100% | 0% | Long-context document reasoning over large document sets. It remains useful breadth coverage, but current top-model spread is narrower than harder specialist and professional-work tests. |
| SciCode | baseline | 80% | 20% | Scientist-curated Python problems. The main signal is scientific problem formulation and structured reasoning; executable code correctness adds a smaller execution signal. |
| Terminal-Bench&nbsp;2.1 | baseline | 0% | 100% | AA and Vals both report terminal-agent task execution and environment handling. Model Atlas aggregates their matched overall rows by model and harness, using the best score and median cost/time resources. It stays baseline because stronger frontier agentic tests are more distinctive and the official 2.1 task set is not publicly uploaded yet. |
| BrowseComp | baseline | 0% | 100% | Web/research solving where browsing behavior matters more than static knowledge. It stays baseline because public web tasks have higher contamination exposure and less frontier-like top spread. |
| Toolathlon | baseline | 20% | 80% | Multi-tool workflow execution with some planning and domain understanding. Limited current row count and provenance keep it baseline. |
| CursorBench | baseline | 0% | 100% | Cursor's public coding-agent benchmark over ambiguous, multi-file tasks. Composer rows are excluded because their model data is not independently available. |
| Vals Index | baseline | 60% | 40% | Proprietary Vals AI composite across finance and coding tasks. The overall score is useful as a normal baseline signal, but the opaque private subsets and overlap with other benchmark families keep it out of frontier status. |
| HLE | frontier | 100% | 0% | Broad expert academic knowledge and reasoning with remaining headroom. It is a frontier intelligence stress test because top models still separate meaningfully. |
| CritPt | frontier | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code-answer texture. It is narrow, but hard enough to be a useful specialist frontier stress test. |
| GDPval-AA&nbsp;v2 | frontier | 60% | 40% | Real professional deliverables across economically important occupations. Mostly professional reasoning and synthesis, with substantial agentic credit for AA v4.1's longer tool/file/web trajectories and human-baselined work completion. |
| Riemann-bench | frontier | 100% | 0% | Private extreme mathematics benchmark. It has limited public task access, but low scores and useful spread make it a sharp frontier intelligence stress test. |
| APEX&nbsp;Agents | frontier | 0% | 100% | Long-horizon professional-services workflows with realistic tooling, rubrics, and domain constraints. The signal is pure agentic task completion. |
| tau3&nbsp;Banking&nbsp;(AA) | frontier | 0% | 100% | Realistic banking-agent workflows over a large fintech knowledge base with tool-mediated, policy-constrained state changes. It is frontier because current models still struggle and the task shape is close to deployable support work. |
| Agents'&nbsp;Last&nbsp;Exam | frontier | 20% | 80% | Real-world software and professional workflows. It combines professional knowledge with harnessed task execution, so it contributes to both dimensions but primarily Agentic. |
| Blueprint-Bench&nbsp;2 | frontier | 100% | 0% | Spatial reasoning over apartment-photo floor-plan reconstruction. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| GDP.pdf | frontier | 90% | 10% | Professional PDF understanding with dense page-grounded rubrics. It is mostly document intelligence, with a small execution-reliability component. |
| DeepSWE | frontier | 0% | 100% | Repo-level coding-agent benchmark. It tests long-horizon repository reasoning and code execution, using each model's best pass@1 configuration. |

The baseline group anchors breadth, stability, and coverage. The frontier group marks benchmarks that are distinctive enough to matter more, but sparse enough that absence should count against a model until there is source evidence. Diagnostics and exclusions are not scoring groups.

Working quality mix is the same for Intelligence and Agentic:

| Component | Share |
| --- | ---: |
| AA index | 30% |
| baseline benchmarks | 30% |
| frontier benchmarks | 40% |

Baseline and frontier benchmark groups are portion-weighted before they are combined. This keeps the grouping legible: the AA index anchors the dimension, baseline gives broad coverage, and frontier gets extra force as the proof-heavy separation signal.

Value and speed are secondary. They still matter because downstream applications have budgets and latency constraints, and they now have enough eval-derived signal to act as practical utility components without overtaking quality.

## Source Notes

Artificial Analysis is the primary benchmark source. It supplies the broad Intelligence and Agentic indexes, selected benchmark fields, Intelligence task cost, Intelligence task token counts, and enough latency/throughput information to estimate Intelligence task seconds. GPQA, MMMU-Pro, and other available AA fields can remain visible as source context when present, but they are not selected benchmark inputs unless listed in the benchmark portfolio.

OpenRouter supplies current route pricing and speed measurements used for blend price, workflow-simulated seconds, and workflow-simulated value. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

Terminal-Bench 2.1 combines the AA leaderboard score, the dedicated AA Terminal-Bench evaluation page, and the Vals Terminal-Bench 2.1 page when they match the same model. The benchmark score is the best available AA or Vals overall score, matching the way people usually compare a model's best harness result. This intentionally gives a small reward to models with more harness coverage: if multiple independent harnesses can make the same model work, the ranking credits the strongest observed execution path instead of forcing a noisy cross-harness average. Cost and time are still the medians of available per-task resource values so one harness does not dominate resource estimates. AA cost and token totals are divided by the benchmark's 89 tasks and 3 repeats per task; AA time uses the page's reported per-task runtime. Vals supplies score, cost, time, and harness labels but no token counts, so token fields remain AA-only when present.

DeepSWE supplies mean task cost, mean task duration, and mean output tokens for the Speed and Value resource components.

Agents' Last Exam uses `max(median_score, mean_score)` from the Full Overall split. Raw source rows preserve total runtime and token counts, while displayed ALE resource columns divide those totals by the source `runs` count and then use the lower of median and mean per-run values. Partial-credit score is the scoring input because it is more informative than pass-rate accuracy.

Toolathlon uses the reported Pass@1-style score only, preserves self-reported provenance, and does not use turns, Pass@3, or resource metrics for scoring because those fields are incomplete across current rows.

CursorBench preserves score, average cost per task, tokens per task, steps per task, and reasoning effort where shown. When multiple public effort rows map to the same base model, the scoring lookup uses the best reported score while preserving all raw effort rows. Cursor's private Composer models are excluded because their model data is not available from independent catalog sources.

Blueprint-Bench 2 uses the normalized connectivity similarity score and preserves only model display names and scores; Andon's internal source identifiers are not used for matching.

Riemann-bench uses the normalized public percent score and preserves provider, model label, and leaderboard last-updated date from the page.

GDP.pdf uses the reported percentage score as a normalized benchmark score and preserves model display name, provider label, and page update date.

Vals Index uses the overall percentage score as a normalized benchmark score and preserves the component task rows for source audit/display only. Its reported cost and latency stay out of Speed and Value because they are Vals harness-local measurements rather than comparable task-resource inputs.

## Scoring Shape

The scoring map is:

$$
\text{raw source fields}\rightarrow\text{benchmark-relative quality fields}\rightarrow(I_m,A_m)\rightarrow\text{percentile-scored Speed/Value}\rightarrow O_m
$$

Quality is normalized before averaging. Economics and time become percentile scores after converting raw costs or seconds into "higher is better" components.

AA's `coding_index` can be kept as source context when available, but it is not used to compute any score. There is no standalone coding score.

## Math Mapping Details

Notation:

$$
\begin{aligned}
m&=\text{model}\\
b&=\text{benchmark or AA index field}\\
x_{m,b}&=\text{raw value for model }m\text{ on field }b\\
x_{\min,b}&=\min_m x_{m,b}\\
x_{\max,b}&=\max_m x_{m,b}
\end{aligned}
$$

In formulas, $\operatorname{Percentile}(y)$ means the 0-100 percentile of $y$ within the current finite comparison set for that component.

Each quality input is first converted into a benchmark-relative score:

$$
z_{m,b}=100\cdot\frac{x_{m,b}-x_{\min,b}}{x_{\max,b}-x_{\min,b}}
$$

Quality scaling uses the observed minimum and maximum for each field. The minimum maps to $0$, the maximum maps to $100$, and every benchmark is normalized before it enters a dimension average.

Within each dimension, benchmark groups are averaged before they are combined. Let $R_b$ be the set of selected baseline benchmarks for dimension $D$, let $R_f$ be the set of selected frontier benchmarks for dimension $D$, and let $p_{b,D}$ be benchmark $b$'s configured portion for dimension $D$.

$$
B_{m,D}^{\text{baseline}}=\frac{\sum_{b\in R_b}p_{b,D}z_{m,b}}{\sum_{b\in R_b}p_{b,D}}
$$

$$
B_{m,D}^{\text{frontier}}=\frac{\sum_{b\in R_f}p_{b,D}z_{m,b}}{\sum_{b\in R_f}p_{b,D}}
$$

The final quality dimension score uses the same component weights for Intelligence and Agentic:

$$
D_m=0.30z_{m,\text{AA index }D}+0.30B_{m,D}^{\text{baseline}}+0.40B_{m,D}^{\text{frontier}}
$$

So:

$$
\begin{aligned}
I_m&=D_{m,\text{Intelligence}}\\
A_m&=D_{m,\text{Agentic}}
\end{aligned}
$$

Missing benchmark values are imputed only for scoring. They are not treated as observed source values.

Missing frontier benchmarks use other selected frontier benchmarks as the percentile context:

$$
C_{m,b}^{\text{frontier}}=\operatorname{mean}\left(z_{m,k}:k\in D\cap\text{Frontier},k\neq b,z_{m,k}\text{ available}\right)
$$

$$
x_{m,b}^{\text{imputed}}=\operatorname{quantile}\left(\{x_{j,b}:x_{j,b}\text{ observed}\},\operatorname{Percentile}(C_{m,b}^{\text{frontier}})/100\right),\quad b\in\text{Frontier}
$$

Other missing benchmarks use same-dimension evidence and keep a conservative shrink toward the observed floor:

$$
C_{m,b}=\operatorname{mean}\left(z_{m,k}:k\in D,k\neq b,z_{m,k}\text{ available}\right)
$$

$$
\hat{x}_{m,b}=\operatorname{quantile}\left(\{x_{j,b}:x_{j,b}\text{ observed}\},\operatorname{Percentile}(C_{m,b})/100\right)
$$

$$
x_{m,b}^{\text{imputed}}=\min_j x_{j,b}+c\left(\hat{x}_{m,b}-\min_j x_{j,b}\right)
$$

The current confidence is:

$$
c=0.5
$$

The same-dimension context score $C_{m,b}$ uses normalized quality evidence, not raw benchmark values.

Price profiles:

All price terms in this block are USD per 1M tokens.

$$
\begin{aligned}
\text{task price}&=0.80\cdot\text{input-side price}+0.20\cdot\text{output-side price}\\
\text{chat price}&=0.50\cdot\text{input-side price}+0.50\cdot\text{output-side price}\\
\text{agentic price}&=0.30\cdot\text{input-side price}+0.70\cdot\text{output-side price}\\
\text{blended price}&=0.25\cdot\text{task price}+0.40\cdot\text{chat price}+0.35\cdot\text{agentic price}
\end{aligned}
$$

Value components:

$$
\begin{aligned}
V_{\text{AA cost},m}&=\operatorname{Percentile}\left(1/\text{AA task cost}_m\right)\\
V_{\text{AA efficiency},m}&=\operatorname{Percentile}\left(I_m/\text{AA task cost}_m\right)\\
V_{\text{DeepSWE cost},m}&=\operatorname{Percentile}\left(1/\text{DeepSWE task cost}_m\right)\\
V_{\text{ALE cost},m}&=\operatorname{Percentile}\left(1/\text{Agents' Last Exam task cost}_m\right)\\
V_{\text{blend cheapness},m}&=\operatorname{Percentile}\left(1/\text{blended price}_m\right)\\
Q_m&=\operatorname{mean}(I_m,A_m)\\
V_{\text{quality blend},m}&=\operatorname{Percentile}\left(Q_m/\text{blended price}_m\right)\\
V_{\text{workflow},m}&=\operatorname{Percentile}\left(\text{workflow useful work per dollar}_m\right)
\end{aligned}
$$

$$
V_m=\operatorname{mean}_{\text{finite}}\left(V_{\text{AA cost},m},V_{\text{AA efficiency},m},V_{\text{DeepSWE cost},m},V_{\text{ALE cost},m},V_{\text{blend cheapness},m},V_{\text{quality blend},m},V_{\text{workflow},m}\right)
$$

Displayed Value requires at least two finite components. If fewer than two Value components exist, the displayed Value is `null` and Overall uses the scoring-only missing-Value imputation.

Raw speed diagnostics:

$$
g_m(t)=\frac{t}{\ell_m+t/\tau_m}
$$

where $\ell_m$ is latency and $\tau_m$ is throughput.

$$
\text{observed speed}_m=\operatorname{median}(\text{anchors})/\text{end-to-end latency}_m
$$

$$
\text{raw speed}_m=\operatorname{mean}_{\text{finite}}\left(\operatorname{mean}_t g_m(t),\text{observed speed}_m\right)
$$

Speed anchors are derived from OpenRouter observations:

$$
\text{implied output tokens}=(\text{end-to-end latency}-\text{latency})\cdot\text{throughput}
$$

Relative Speed components:

$$
\begin{aligned}
S_{\text{AA},m}&=\operatorname{Percentile}\left(1/\text{AA task seconds}_m\right)\\
S_{\text{DeepSWE},m}&=\operatorname{Percentile}\left(1/\text{DeepSWE task seconds}_m\right)\\
S_{\text{ALE},m}&=\operatorname{Percentile}\left(1/\text{Agents' Last Exam task seconds}_m\right)\\
S_{\text{Workflow},m}&=\operatorname{Percentile}\left(1/\text{workflow simulated seconds}_m\right)
\end{aligned}
$$

$$
S_m=\operatorname{mean}_{\text{finite}}\left(S_{\text{AA},m},S_{\text{DeepSWE},m},S_{\text{ALE},m},S_{\text{Workflow},m}\right)
$$

Displayed Speed requires at least two finite components. If fewer than two Speed components exist, the displayed Speed is `null` and Overall uses the scoring-only missing-Speed imputation.

Workflow simulation seconds:

$$
\begin{aligned}
T_{m,s}&=n_s\cdot\left(\ell_m+\lambda \operatorname{ELogUniform}(x_{\text{input},s})+\operatorname{ELogUniform}(x_{\text{output},s})/\tau_m\right)\\
T_{\text{workflow},m}&=\sum_s w_sT_{m,s}
\end{aligned}
$$

where $\ell_m$ is latency, $\tau_m$ is output throughput, $n_s$ is scenario call count, and $\lambda=0.0001$ seconds per input token is the explicit input-token friction used when no reliable per-model prefill throughput is available.

Input and output token counts use the expected value of a log-uniform range:

$$
\operatorname{ELogUniform}(x_{\min},x_{\max})=\frac{x_{\max}-x_{\min}}{\log x_{\max}-\log x_{\min}}
$$

The scenario mix is:

| Scenario | Weight | Calls | Input tokens/call | Output tokens/call |
| --- | ---: | ---: | ---: | ---: |
| Micro | 15% | 1 | `500..3000` | `1..50` |
| Refine/translate | 15% | 1 | `500..20000` | `500..20000` |
| Extract/structure | 15% | 1 | `3000..20000` | `100..1200` |
| Chat/reasoning | 20% | 4 | `1000..12000` | `300..2000` |
| Long synthesis | 15% | 1 | `20000..80000` | `1500..6000` |
| Agentic loop | 20% | 8 | `8000..60000` | `500..4000` |

Workflow value uses the same scenario mix, but each scenario contributes useful work per dollar:

$$
U_{m,s}=\frac{\operatorname{smoothstep}\left(q_{m,s}/q_{\text{full},s}\right)}{\text{scenario cost}_{m,s}}
$$

where $q_{m,s}$ is the scenario-specific intelligence/agentic blend and $q_{\text{full},s}$ is the good-enough threshold for that scenario. Repeated chat and agentic scenarios model cache-read pricing after the first call: chat treats 50% of input as cacheable and agentic treats 70% of input as cacheable, with a midpoint 70% hit rate from the configured `50..90%` range. One-shot scenarios do not receive cache benefit.

Missing Speed or Value for Overall only uses separate priors.

For missing Speed, the scoring-only imputation is the known Speed median:

$$
S_m^{\text{imputed}}=\operatorname{median}\left(\{S_j:S_j\text{ observed}\}\right)
$$

For missing Value, the scoring-only imputation mirrors quality percentile into the known Value distribution with fixed strength $\alpha_V=0.5$:

$$
\begin{aligned}
p_{Q,m}&=\operatorname{Percentile}(Q_m)\\
\alpha_V&=0.5\\
p_{V,m}&=50-\alpha_V(p_{Q,m}-50)
\end{aligned}
$$

$$
V_m^{\text{imputed}}=\operatorname{quantile}\left(\{V_j:V_j\text{ observed}\},p_{V,m}/100\right)
$$

Displayed Speed and Value stay `null` when source evidence is missing. This imputation is used only inside Overall.

$$
O_m=0.35I_m+0.25A_m+0.20S_m^{*}+0.20V_m^{*}
$$

Here $S_m^{*}$ and $V_m^{*}$ are the observed score when present, otherwise the scoring-only imputed score.

## Final Ordering

The final comparison set requires enough signal after relative scoring: $O_m$, $I_m$, and $A_m$ must each exist and be at least $10$.

Models are primarily ordered by relative Intelligence. Overall is a practical utility score, not the primary ranking key.
