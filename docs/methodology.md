# Methodology

## Scope

This document specifies how observed benchmark, price, and runtime inputs become four independent 0-100 scores: Intelligence, Agentic, Speed, and Value. The selected benchmark portfolio and source-specific policies live in [Benchmarks](benchmarks.md), while benchmark admission criteria live in [Standards](standards.md).

Intelligence and Agentic measure capability. Speed and Value measure practical delivery constraints without feeding cost or latency back into capability. Reasoning-effort variants remain separate scored configurations, while model-balanced calibration prevents a model with many variants from dominating empirical reference distributions.

## Pipeline Overview

The calculation proceeds in one direction:

1. **Observed inputs**
2. **Normalized benchmark evidence**
3. **Quality scores** $(I_m,A_m)$
4. **Quality-adjusted resources**
5. **Public outputs** $(\text{Speed}_m,\text{Value}_m)$

| Score | Main inputs | Main adjustment | What the score answers |
| --- | --- | --- | --- |
| Intelligence | Selected benchmark results | Importance, dimension loading, and evidence confidence | How strong is the model on knowledge and reasoning? |
| Agentic | Selected benchmark results | Importance, dimension loading, and evidence confidence | How strong is the model in tool-mediated workflows? |
| Speed | Provider speed, simulated workflow runtime, benchmark task time | Log scaling, quality-local comparison, and component coverage | How quickly does the model deliver comparable work? |
| Value | Blended price, workflow price efficiency, benchmark task cost | Log scaling, quality-local comparison, and component coverage | How much useful capability does the model deliver for its cost? |

## Shared Notation

| Symbol | Meaning |
| --- | --- |
| $m$ | Model or scored model-effort configuration |
| $v$ | Reasoning-effort variant of a model |
| $b$ | Benchmark |
| $D$ | Quality dimension: Intelligence or Agentic |
| $s$ | Workflow scenario |
| $a$ | Model-balanced calibration weight |

Benchmark aggregation uses the 0-100 scale. Source crosswalks may operate on a benchmark's native or 0-1 scale, and their formulas state that scale explicitly. Resource comparisons use logged positive cost or time.

The shared smooth confidence function clamps its input before interpolation:

$$
\operatorname{smoothstep}(t)=u^2(3-2u),
\qquad
u=\operatorname{clamp}(t,0,1).
$$

Weighted quantiles, ranks, medians, and percentiles use model-balanced observations unless a formula states otherwise.

## Intelligence and Agentic

### Model-Balanced Calibration

Reasoning-effort variants remain separate scored configurations, but they do not multiply a model's influence on empirical reference distributions. Model identity uses the normalized public model name, with route ID as a fallback when no name is available. For any distribution, $n_m$ counts the included variants of model $m$. Variant $v$ receives calibration weight

$$
a_{m,v}=\frac{1}{n_m}
$$

so every represented model contributes one total unit of mass. The included-variant count is recomputed for each distribution because a variant can have one metric and lack another. These weights prevent reasoning-effort variants from manufacturing calibration support while preserving every scored configuration. They apply to percentile and quantile mappings, imputation validation errors, quality-local expectations, residual percentiles, and winsorized min-max anchors.

### Benchmark Normalization and Weighting

Each quality input is first converted into a normalized 0-100 benchmark score. For model $m$ and benchmark field $b$, raw source value $x_{m,b}$ is scaled by the observed minimum $x_{\min,b}$ and maximum $x_{\max,b}$ for that field:

$$
z_{m,b}=100\cdot\operatorname{clamp}\left(\frac{x_{m,b}-x_{\min,b}}{x_{\max,b}-x_{\min,b}},0,1\right)
$$

The observed minimum maps to $0$, the observed maximum maps to $100$, and every selected benchmark is normalized before it enters a dimension average. Imputed values use these frozen observed anchors and are clamped to the same score range, so imputation cannot redefine a benchmark's scale. This linear transformation preserves all within-benchmark gap ratios; unlike percentile rank, it does not turn uneven performance gaps into evenly spaced positions.

Within each dimension, the selected benchmark set $\mathcal{B}_D$ contains the benchmarks admitted to that dimension. Benchmark importance $i_b$ and dimension loading $\lambda_{b,D}$ produce the effective weight $w_{b,D}=i_b\lambda_{b,D}$. Importance controls the benchmark's total influence, while loading directs that influence into Intelligence or Agentic without counting a mixed benchmark twice. The normalized dimension mean is weighted by those effective weights:

$$
\bar{B}_{m,D}=\frac{\sum_{b\in\mathcal{B}_D,z_{m,b}\text{ available or imputed}}w_{b,D}z_{m,b}}{\sum_{b\in\mathcal{B}_D,z_{m,b}\text{ available or imputed}}w_{b,D}}
$$

### Evidence Mass

Evidence mass uses the same effective weights as the dimension mean. Its evidence factor $\eta_{m,b}$ is $1$ for an observed value, $\operatorname{clamp}(1-\tilde e_{m,b}/25,0,1)$ for a validated imputation, and $0$ for a missing value. The error $\tilde e_{m,b}$ is the normalized held-out median absolute error of the predictor used for that row. A cross-effort prediction uses its cross-only error. Missing a small benchmark contribution therefore reduces confidence less than missing a large contribution:

$$
E_{m,D}=\sum_{b\in\mathcal{B}_D}w_{b,D}\eta_{m,b}
$$

Confidence is a dimension-specific curve over absolute evidence mass:

$$
T_D=\sum_{b\in\mathcal{B}_D}w_{b,D},
\qquad
C_D(E)=
\operatorname{smoothstep}\left(\frac{E-0.1T_D}{0.5T_D}\right).
$$

The floor and full-confidence point are calculated from each selected dimension portfolio: confidence is zero through 10% of its total effective weight and full from 60%. The thresholds therefore update when the selected portfolio changes rather than remaining separate calibration literals.

![Confidence is zero through 10 percent weighted evidence, rises smoothly, and is full from 60 percent.](assets/methodology/confidence.svg)

The weighted mean $\bar B_{m,D}$ measures performance on available evidence, while $C_D(E_{m,D})$ measures how much validated evidence supports that mean. Their product prevents a strong result on sparse evidence from looking as certain as the same result with broad evidence:

$$
D_{m,D}=\bar{B}_{m,D}C_D(E_{m,D})
$$

$$
\begin{aligned}
I_m&=D_{m,\text{Intelligence}}\\
A_m&=D_{m,\text{Agentic}}.
\end{aligned}
$$

Intelligence and Agentic confidence are reported separately as the percentage values of $C_D(E_{m,D})$. Each value expresses how much evidence supports its dimension’s estimated benchmark mean; the two dimensions are not combined into one confidence value.

## Missing Benchmark Evidence

The imputation pipeline has two paths. A benchmark-specific source crosswalk runs first when configured; otherwise, or when that crosswalk fails validation, the contextual quantile imputer is used.

### Shared Guarantees

Same-dimension evidence used for benchmark imputation is also averaged with benchmark importance multiplied by the configured dimension loading. For a benchmark selected in both dimensions, Model Atlas produces an Intelligence-context prediction and an Agentic-context prediction, then combines the available predictions using that benchmark's dimension loadings. Available loadings are renormalized when only one context can make a prediction. The minimum evidence threshold still counts distinct observed benchmarks so one heavily weighted benchmark cannot satisfy the imputation requirement by itself.

Missing benchmark values are imputed only for scoring. Every model-benchmark pair receives at most one imputed value, and only observed benchmark values can provide evidence for another benchmark, so imputation is non-recursive. Imputed values are not treated or displayed as observed source values.

### APEX Agents Source Crosswalk

APEX Agents first tests a source-specific Mercor-to-AA crosswalk. The overlap set $S$ contains rows where Mercor Loop Pass@1 and AA match the same model and assigned reasoning effort; $M_i$ and $A_i$ are their normalized Mercor and AA scores, respectively; and $w_i$ divides one unit of weight across each base-model family's variants. The fitted source offset is:

$$
\delta=\operatorname{weightedMedian}_{i\in S}(M_i-A_i;w_i)
$$

Validation withholds the entire base-model family of each overlap row. For family $f$, Model Atlas refits $\delta_{-f}$ without that family, then measures the family-balanced held-out error:

$$
e=\operatorname{weightedMedian}_{i\in S}\left(\left|M_i-\delta_{-f(i)}-A_i\right|;w_i\right)
$$

The additive offset preserves performance gaps within each source, while the weighted median limits the influence of outliers. Holding out an entire model family prevents sibling variants or reasoning efforts from validating one another.

![Validated source crosswalk plotted against the canonical source, with an identity guide and fitted additive offset.](assets/methodology/source-crosswalk.svg)

The crosswalk requires at least three effective overlap families, at least three effective families with valid held-out predictions, and $e\le 0.02$. When it passes, a model-effort row that has Mercor but no AA result receives:

$$
\hat A_m=\operatorname{clamp}(M_m-\delta,0,1),\qquad
\eta^{\text{cross}}_m=\operatorname{clamp}\left(1-\frac{e}{0.02},0,1\right)
$$

$\eta^{\text{cross}}_m$ is the imputed row's evidence credit before the ordinary benchmark-coverage confidence curve. Observed AA values are never replaced, Mercor rows do not change the observed APEX normalization anchors, and Mercor-derived values never satisfy public admission or become evidence for another imputation. If the overlap gate fails, APEX Agents falls through to contextual quantile imputation.

### Contextual Quantile Imputation

The context benchmark $k$ can be any other selected benchmark in dimension $D$. Frontier and baseline use the same prediction evidence, weighted by benchmark importance multiplied by the configured loading for the dimension:

$$
C_{m,b}=\frac{\sum_{k\in D,k\neq b,z_{m,k}\text{ available}}w_{k,D}z_{m,k}}{\sum_{k\in D,k\neq b,z_{m,k}\text{ available}}w_{k,D}}
$$

$$
\pi_{m,b}=
\frac{
\operatorname{weightedQuantileRank}
\left(\{(C_{j,b},a_j):x_{j,b}\text{ and }C_{j,b}\text{ observed}\},C_{m,b}\right)
}{100}
$$

$$
\hat{x}_{m,b}=
\operatorname{weightedQuantile}
\left(\{(x_{j,b},a_j):x_{j,b}\text{ and }C_{j,b}\text{ observed}\},\pi_{m,b}\right)
$$

The target and context distributions use the same paired calibration rows. Mapping a weighted context rank into the target quantile preserves the target benchmark's distribution without assuming that the two signals share units or a linear relationship. Each benchmark imputer is validated by withholding every variant of the observed model from calibration evidence and predicting that value. The model-weighted median raw absolute leave-one-model-out error is $e_b$. Imputation is refused unless at least four effective models produce valid held-out predictions and the separately measured normalized median absolute error is at most 25 points.

### Cross-Effort Extension

When a model has multiple reasoning efforts, the imputer also tests a two-dimensional candidate. The direct predictor still requires at least three other observed benchmarks at the target effort. A cross-effort predictor requires a sibling effort with at least three observed selected benchmarks and at least four effective reference models that pair the same target and source efforts.

Every sibling benchmark is normalized on its own scale before aggregation. The resulting context percentile is mapped into the target benchmark distribution exactly as in the direct predictor; no raw score difference is transferred between benchmarks. Each ordered effort transition is calibrated separately, so either a higher or lower sibling may provide evidence when that direction has enough support.

The two-dimensional candidate gives one equal slot to the direct prediction and one to the available cross-effort predictions. It is used only when leave-one-model-out validation reduces normalized median absolute error by at least 2%, or when it brings a refused direct predictor within the 25-point error limit.

At least four independent held-out models must actually use the cross-effort path, and their cross-only normalized median absolute error must not exceed 25 points. Both the target-effort and sibling-effort contexts must pass their evidence thresholds for the individual missing value. Sparse sibling evidence falls back to the separately validated direct predictor; if that predictor is also unreliable, the value remains missing. Every variant of the held-out model is excluded from the mapping fitted for its validation prediction.

### Conservative Value and Evidence Credit

$$
x_{m,b}^{\text{imputed}}=\max\left(0,\hat{x}_{m,b}-\kappa_g e_b\right)
$$

![A same-dimension context percentile mapped into the paired target distribution, then reduced by the validated held-out error penalty.](assets/methodology/quantile-imputation.svg)

The missing-data multiplier is $\kappa_{\text{frontier}}=1$ and $\kappa_{\text{baseline}}=0.5$. Group changes only this penalty; it does not change context selection, validation evidence, or observed benchmark weight. A value that actually uses the two-dimensional predictor subtracts the cross-only raw held-out median error; a one-dimensional fallback subtracts the one-dimensional error. The same-dimension context score $C_{m,b}$ uses normalized quality evidence, not raw benchmark values.

Validation-weighted evidence mass remains in addition to the benchmark-local error subtraction. The subtraction makes every imputed value conservative, while evidence credit reflects the held-out reliability of the predictor actually used for that row. A sparse sibling-effort context falls back to the separately validated one-dimensional value, penalty, and confidence. Imputations remain ineligible for public admission regardless of that credit.

## Price and Workflow Assumptions

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

Input-side and output-side price use provider effective weighted prices when both are available; otherwise they use the published input and output prices. The profile weights are usage priors, not measured traffic shares. Task is input-heavy, chat is balanced, and agentic is output-heavy. The blend leans toward chat and agentic use because those are the cases where price differences most often affect model choice.

### Workflow Simulation

#### Scenario Mix

The workflow simulation is a fixed stress mix rather than a workload trace. It includes small calls, long-context calls, repeated chat, and agentic loops so latency, throughput, cache pricing, and output-heavy work all have a chance to matter.

| Scenario | Weight | Calls | Input tokens/call | Output tokens/call | Intelligence / Agentic | Full-credit quality |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Micro | 15% | 1 | `500..3000` | `1..50` | 30% / 70% | 30 |
| Refine/translate | 15% | 1 | `500..20000` | `500..20000` | 35% / 65% | 35 |
| Extract/structure | 15% | 1 | `3000..20000` | `100..1200` | 40% / 60% | 45 |
| Chat/reasoning | 20% | 4 | `1000..12000` | `300..2000` | 55% / 45% | 60 |
| Long synthesis | 15% | 1 | `20000..80000` | `1500..6000` | 65% / 35% | 75 |
| Agentic loop | 20% | 8 | `8000..60000` | `500..4000` | 25% / 75% | 90 |

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
\begin{aligned}
U_{m,s}&=\frac{\operatorname{smoothstep}\left(Q_{m,s}/Q_{\text{full},s}\right)}{\log_{10}(1+\text{scenario cost}_{m,s})}\\
U_m&=\sum_s w_sU_{m,s}
\end{aligned}
$$

The scenario quality blend $Q_{m,s}$ combines Intelligence and Agentic using the table's scenario-specific proportions, and $Q_{\text{full},s}$ is the full-credit threshold. The smoothstep multiplier gives little credit below the threshold and then saturates, because being far above "good enough" should not allow quality to swamp price.

Repeated chat and agentic scenarios model cache-read pricing after the first call. Chat treats 50% of input as cacheable and agentic treats 70% as cacheable, with a 70% expected hit rate from the configured `50..90%` range. One-shot scenarios receive no cache benefit.

## Provider and Workflow Speed Inputs

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

Higher throughput ranks higher, while lower latency, end-to-end latency, and workflow seconds rank higher. Logging makes proportional gaps comparable and prevents extreme raw values from defining most of the normalized range. The three provider statistics together occupy one score slot, and at least two must be present so one measurement cannot stand in for overall serving performance.

## Quality-Adjusted Resource Efficiency

Speed's benchmark task-time component and Value's benchmark task-cost component share the same neighborhood method. The only difference is the resource amount:

$$
\begin{aligned}
A^{\text{time}}_{m,b}&=\text{effective task seconds}_{m,b}\\
A^{\text{cost}}_{m,b}&=\text{task cost}_{m,b}
\end{aligned}
$$

Task resources can come from direct per-benchmark telemetry or from the AA per-task resource metric when the benchmark portfolio marks the benchmark as AA-backed. If a benchmark reports output tokens but not wall time, effective task seconds fall back to output tokens divided by served throughput.

### Quality Neighborhood

For each active benchmark resource source, benchmark metadata declares how its score becomes a local quality coordinate. Let $x_{m,b}$ be model $m$'s stored benchmark score for benchmark $b$:

$$
q_{m,b}=T_b(x_{m,b}),\qquad
T_b(x)=
\begin{cases}
x & \text{linear}\\
\operatorname{logit}(x) & \text{logit}
\end{cases}
$$

`linear` means that no nonlinear benchmark-specific transform is applied: the stored score and its gaps pass directly into the shared neighborhood standardization. It is appropriate for partial-credit, performance, Elo-derived, rubric, composite, human-baselined, and average-precision metrics that do not have a direct remaining-error interpretation.

`logit` is reserved for pass rates, accuracies, completion rates, and other probability-like metrics whose endpoints give remaining error a meaningful interpretation. Logit-configured values must be finite and lie in $[0,1]$; exact endpoints are clamped to $[0.001,0.999]$ only when calculating finite log odds.

For logit-configured benchmarks, a one-point gap near the ceiling is more meaningful than a one-point gap near the middle: moving from 95% to 96% reduces remaining error by 20%, while moving from 50% to 51% is a much smaller frontier-quality distinction.

![The logit transform expands an equal one-percentage-point score change near the benchmark ceiling.](assets/methodology/logit-quality.svg)

Either coordinate is then median-centered and divided by a robust benchmark-local spread:

$$
\begin{aligned}
\operatorname{deviation}_b&=\max\left(\frac{Q^{a}_{75}(\{q_{j,b}\})-Q^{a}_{25}(\{q_{j,b}\})}{1.349},0.35\right)\\
Z_{m,b}&=\frac{q_{m,b}-\operatorname{weightedMedian}_j(q_{j,b},a_{j,b})}{\operatorname{deviation}_b}
\end{aligned}
$$

The $1.349$ factor converts interquartile range into a standard-deviation-like spread for a roughly normal distribution, and the $0.35$ floor prevents a nearly tied benchmark from making small quality differences dominate the neighborhood comparison.

Models compare resource use mostly against nearby-quality models. The neighborhood weight uses $\sigma=0.5$, which is tight enough to keep comparisons quality-local but wide enough that a benchmark does not require exact score ties. Every variant of the focal model is excluded from its expectation so its own effort variants cannot manufacture support:

$$
w_{m,j,b}=\mathbf{1}[\operatorname{model}(m)\ne\operatorname{model}(j)]a_{j,b}\exp\left(-\frac{1}{2}\left(\frac{Z_{m,b}-Z_{j,b}}{0.5}\right)^2\right)
$$

The calibration weight $a_{j,b}$ divides one model's unit mass across its variants that have both quality and resource evidence for benchmark $b$.

### Expected Resource and Residual

Cost and runtime are logged before calculating the expected resource signal and its residual:

$$
\mu^{r}_{m,b}=\frac{\sum_j w_{m,j,b}\log A^{r}_{j,b}}{\sum_j w_{m,j,b}},\qquad
\epsilon^{r}_{m,b}=\log A^{r}_{m,b}-\mu^{r}_{m,b}
$$

A negative residual means the model uses less resource than expected for its quality.

![A focal model's logged resource use compared with the expected resource use among nearby-quality models.](assets/methodology/resource-residual.svg)

### Peer Support

Comparison weights are first combined by model so multiple variants cannot manufacture peer support:

$$
W_{m,k,b}=\sum_{j:\operatorname{model}(j)=k}w_{m,j,b}.
$$

The supported peer mass is

$$
s_{m,b}=\min\left(\sum_k W_{m,k,b},\frac{(\sum_k W_{m,k,b})^2}{\sum_k W_{m,k,b}^2}\right)
$$

and its support confidence is $h_{m,b}=\operatorname{smoothstep}((s_{m,b}-1)/2)$. The first term prevents many distant, near-zero neighbors from appearing well supported; the second is the effective independent-model count. Support of one or less gives no comparative confidence, while support of three gives full confidence. An observed resource with no supported comparison remains neutral at $50$ rather than becoming missing or receiving self-credit.

### Residual Score Mapping

The model-balanced 2.5th percentile $L$ and largest value $U$ bound the supported residuals for each resource signal. Only the favorable low-residual tail is winsorized. The magnitude-preserving score is

$$
M^{r}_{m,b}=100\cdot\frac{U-\operatorname{clamp}(\epsilon^{r}_{m,b},L,U)}{U-L}.
$$

The model-balanced percentile $P^{r}_{m,b}$ ranks $-\epsilon^{r}_{m,b}$ among supported residuals, so lower resource use receives the higher percentile. The mapped resource score averages magnitude and distribution position:

$$
H^{r}_{m,b}=\frac{M^{r}_{m,b}+P^{r}_{m,b}}{2},
\qquad
R^{r}_{m,b}=50+h_{m,b}(H^{r}_{m,b}-50).
$$

![Resource residuals mapped through magnitude and percentile scores, then shrunk toward neutral 50 according to comparison support.](assets/methodology/resource-score-mapping.svg)

The equal mean retains half of the residual's logged magnitude information and half of its model-balanced distribution position. One-sided winsorization prevents one exceptionally cheap or fast model from setting the entire magnitude scale. Unsupported quality extremes shrink to neutral instead of being expanded by either mapping. If the supported residuals have no meaningful spread, every observed residual receives the neutral score of $50$.

## Final Speed and Value

Provider speed and workflow runtime use $\log x$ as their input to ordinary min-max normalization. Value's absolute price component uses $\log_{10}(1+\text{blended price})$ with model-balanced 2.5% favorable-tail winsorized min-max. Its quality-adjusted log blended price component subtracts the locally expected log blended price at the model's aggregate quality, then uses the residual percentile/min-max mean above. Its workflow component applies the same residual hybrid to the locally expected negative workflow-efficiency signal; the completed workflow output is not logged again.

Aggregate price and workflow comparisons use the linear mean of the public Intelligence and Agentic scores:

$$
q_m^{\text{aggregate}}=\operatorname{mean}(\text{Intelligence}_m,\text{Agentic}_m).
$$

This composite is not a success probability, so it is not transformed into log odds. The public scores already include their dimension-specific evidence confidence; aggregate neighborhoods do not reconstruct an undisclosed pre-confidence estimate or apply a second confidence weight to peers. Benchmark task-time and task-cost components remain separate: each uses its own observed benchmark quality and the benchmark-specific linear or logit coordinate declared in the portfolio.

$$
S_{\uparrow}(x)=100\operatorname{clamp}\left(\frac{g(x)-y_{\min}}{y_{\max}-y_{\min}},0,1\right)
$$

The completed input signal is $g(x)$, bounded by its finite minimum $y_{\min}$ and maximum $y_{\max}$. For raw provider and workflow inputs, $g(x)=\log x$. The formula above applies when higher values are better, such as throughput. Lower-is-better inputs reverse the scale:

$$
S_{\downarrow}(x)=100\operatorname{clamp}\left(\frac{y_{\max}-g(x)}{y_{\max}-y_{\min}},0,1\right)
$$

The observed minimum maps to $0$ and the observed maximum maps to $100$ before any lower-is-better reversal. The two forms therefore share the same anchors; direction changes the ordering, not the scale. Absolute-price inputs instead use one-sided winsorized anchors. Quality-conditioned residual inputs average their one-sided winsorized min-max score with their model-balanced percentile score.

The public Speed score uses each benchmark task-time input as its own equally weighted component. The public Value score uses each price and benchmark-cost input as its own equally weighted component. Giving each component one slot makes the result depend on distinct signals rather than the number of raw rows supplied by a source:

$$
\begin{aligned}
\text{TaskTime}_{m,b}&=R^{\text{time}}_{m,b}\\
\text{Speed}_m&=C^{\text{speed}}_m\cdot\operatorname{mean}\left(S^{\text{stats}}_m,S^{\text{workflow}}_m,\{\text{TaskTime}_{m,b}\}\right)\\
\text{Value}_m&=C^{\text{value}}_m\cdot\operatorname{mean}\left(P^{\text{blend}}_m,P^{\text{quality}}_m,P^{\text{workflow}}_m,\{R^{\text{cost}}_{m,b}\}\right)
\end{aligned}
$$

$C^{\text{speed}}_m$ is the shared coverage-confidence function $C(k/K)$ applied over the provider stats component, workflow component, and active benchmark task-time components. $C^{\text{value}}_m$ applies the same function over absolute log blended price, quality-adjusted log blended price, quality-adjusted workflow price efficiency, and active benchmark task-cost components. Here, $k$ is the number of available components and $K$ is the number of active components.

$P^{\text{blend}}_m$ is the winsorized min-max score for absolute log blended price. $P^{\text{quality}}_m$ and $P^{\text{workflow}}_m$ are the percentile/min-max means for the quality-conditioned log-price and workflow-efficiency residuals.

Keeping absolute and quality-conditioned price separate answers two different questions: what the model costs and whether that cost is efficient for the quality delivered.

## Publication Gates

Public admission requires a complete basic profile: release date, text output, input and output prices, context and output limits, throughput, and latency or end-to-end latency. A model variant must have at least eight observed selected benchmarks, including at least one Intelligence benchmark, one Agentic benchmark, and one aggregate index: Artificial Analysis Intelligence Index, Epoch Capabilities Index, or Vals Index.

Imputed values do not satisfy admission. After rescoring, a variant must reach at least 10 in Intelligence, Agentic, Speed, or Value. These gates remove public rows only after reference scoring, so they do not recalibrate the reference population.

An unlabelled benchmark observation belongs to the source-default variant. When every observation is labelled, source aggregation selects the highest reported effort as one complete runnable observation rather than combining field-wise maxima. Compact public views represent each base model with its highest-Intelligence scored variant; the `all` API view preserves every scored effort variant.

## Parameter Rationale

The fixed values below are robustness rules and usage priors rather than fitted claims about universal model behavior.

| Parameter | Value | Why it exists |
| --- | ---: | --- |
| Evidence confidence floor / full point | 10% / 60% of effective dimension weight | Suppresses scores built from isolated evidence while deriving absolute unit thresholds from the selected portfolio. |
| Context benchmarks required | 3 | Prevents one or two correlated observations from defining an imputation context. |
| Contextual held-out validation models | 4 | Requires independent evidence beyond the minimum calibration set. |
| Maximum normalized imputation error | 25 points | Refuses predictors whose typical held-out error is too large to be useful; evidence credit falls to zero at this boundary. |
| Cross-effort improvement | 2% | Requires a measurable validation gain before adding sibling-effort complexity. |
| Frontier / baseline error penalty | $1.0e_b$ / $0.5e_b$ | Makes missing frontier evidence more conservative without changing observed benchmark weight. |
| Favorable-tail winsorization | 2.5% | Stops one exceptionally cheap or fast model from defining the useful score range. |
| Resource neighborhood width | $\sigma=0.5$ | Keeps comparisons quality-local without requiring exact benchmark-score ties. |
| Minimum quality-coordinate deviation | 0.35 | Prevents nearly tied benchmarks from exaggerating small quality differences after their declared transform. |
| Full peer support | 3 effective models | Shrinks unsupported comparisons toward neutral while allowing a small independent peer set to earn full confidence. |
| Input-token friction | 0.0001 seconds/token | Represents prefill cost when comparable model-specific prefill throughput is unavailable. |
