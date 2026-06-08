# Model Atlas Methodology

## Purpose

This project is trying to build the best current version of my opinionated LLM ranking. It starts from Artificial Analysis because AA is the best benchmark aggregation source I have found so far, but the point is not to mirror AA exactly. The point is to keep the parts of AA and related provider data that help separate current models in a subjectively meaningful way.

The ranking is not an average of everything available upstream. Many benchmarks are low-signal for this purpose: some are saturated, some are stale, some are noisy, and some reward capabilities that do not matter much for the downstream model choices I care about. A benchmark only belongs here if it still creates a useful relative ordering among current models.

The main ranking choices are explicit: selected intelligence benchmarks, selected agentic benchmarks, task/chat/agentic price profiles, workflow simulation profiles, speed anchors, and overall score weights.

## Benchmark Criteria

A benchmark is useful here when it changes the ranking in a way that feels real. It should separate strong models, expose a capability difference I care about, and not just add another correlated number to the average.

Good benchmark signals:

- still have headroom among current frontier or near-frontier models
- produce relative ordering that matches meaningful qualitative differences
- add a capability angle not already covered by another selected metric
- are understandable enough that I can revisit why they are included
- do not over-reward narrow benchmark artifacts

Bad benchmark signals:

- saturated, where many strong models tie or nearly tie
- duplicated by another selected metric
- too easy for the current model set
- noisy in a way that creates fake precision
- stale relative to current model behavior
- aimed at a capability that should not move this ranking much

The intelligence group is meant to capture broad capability: factual accuracy, hard reasoning, and structured problem solving outside harness/tool execution. The current configured intelligence keys are:

- `omniscience_accuracy`
- `lcr`
- `hle`
- `scicode`
- `critpt`
- `agents_last_exam`

`omniscience_nonhallucination_rate` remains available as a diagnostic reliability field, but it is not selected for intelligence scoring because it can reward abstention behavior rather than raw knowledge.

The agentic group is meant to capture whether a model is useful inside workflows. In practice this is roughly tool usage, instruction following, self-verification, reliability under constraints, harness/tool execution, and work-like task completion. The current configured agentic keys are:

- `gdpval_normalized`
- `terminalbench_hard`
- `ifbench`
- `apex_agents`
- `terminal_bench_2`
- `agents_last_exam`
- `deep_swe`

There is no standalone coding score in the current ranking. AA `scicode` is treated as structured code-generation/problem-solving evidence under intelligence. DeepSWE, AA `terminalbench_hard`, and standalone Terminal-Bench 2.0 remain agentic. Agents' Last Exam is selected in both intelligence and agentic because it combines professional knowledge with harnessed real-world workflow execution.

Value and speed are secondary. They still matter because downstream applications have budgets and latency constraints, and they now have enough eval-derived signal to act as practical utility components without overtaking quality.

## Source Roles

Artificial Analysis is the primary benchmark source. It supplies the broad Intelligence and Agentic indexes, selected benchmark fields, Intelligence task cost, Intelligence task token counts, and enough latency/throughput information to estimate Intelligence task seconds.

OpenRouter supplies current route pricing and speed measurements used for blend price, workflow-simulated seconds, and workflow-simulated value. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.

DeepSWE contributes one standalone agentic benchmark input: each model's best `pass_at_1` configuration. It also supplies mean task cost, mean task duration, and mean output tokens for the Speed and Value resource components. Missing DeepSWE values are filled with the observed DeepSWE minimum for scoring only.

Terminal-Bench 2.0 contributes one standalone agentic benchmark input. It uses `max(median_accuracy, mean_accuracy)` across available agent/model entries. This is intentionally separate from AA's `terminalbench_hard` field; both are selected agentic benchmarks because they are different signals.

Agents' Last Exam contributes both Intelligence and Agentic benchmark evidence because it combines professional knowledge with harnessed real-world task execution. Its benchmark score uses `max(median_score, mean_score)` from the Full Overall split. Its resource columns use the lower of median and mean runtime, input tokens, and output tokens from the same split. Partial-credit score is the scoring input because it is more informative than pass-rate accuracy.

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

Benchmark weights are:

$$
w_b=
\begin{cases}
2, & b=\text{DeepSWE}\\
1, & \text{otherwise}
\end{cases}
$$

Display order does not change the scoring weight.

For a dimension $D$, where $D$ is Intelligence or Agentic:

$$
B_{m,D}=\frac{\sum_{b\in D}w_b z_{m,b}}{\sum_{b\in D}w_b}
$$

The final quality dimension score is:

$$
D_m=\frac{z_{m,\text{AA index }D}+2B_{m,D}}{3}
$$

So:

$$
\begin{aligned}
I_m&=D_{m,\text{Intelligence}}\\
A_m&=D_{m,\text{Agentic}}
\end{aligned}
$$

Missing benchmark values are imputed only for scoring. They are not treated as observed source values.

Missing DeepSWE:

$$
x_{m,\text{DeepSWE}}=\min_j x_{j,\text{DeepSWE}}
$$

Other missing benchmarks:

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
