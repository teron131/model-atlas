# Intelligence and Agentic

## How Intelligence and Agentic Are Calculated

Intelligence and Agentic combine benchmark results separately for each model and reasoning effort. The sections below explain normalization and weights, the observed models used for comparisons, and the token adjustment applied to Agentic benchmark scores. Missing-result estimates are explained in [Missing Data and Imputation](imputation.md). This page then covers evidence support and how individual benchmarks combine with aggregate indexes. Prices and runtimes do not affect either capability score.

### Benchmark Scores and Dimension Weights

Read results in their declared units and normalize them to 0–100. Importance and dimension allocation determine how much each benchmark contributes to Intelligence and Agentic; the same weighted-mean calculation is used throughout this chapter.

**Reported scores**

| Form | Interpretation |
| --- | --- |
| Fraction | A result on a 0–1 scale. |
| Percentage or points | Use the declared units; points need not represent accuracy. |
| Elo rating | A relative rating converted using configured endpoints. |

For Elo rating $x$, $E(x)$ maps the configured range $[L,U]$ to 0–1:

$$
E(x)=\operatorname{clamp}\left(\frac{x-L}{U-L},0,1\right).
$$

The current endpoints are $L=500$ and $U=2500$. These are parameters, not universal Elo constants; clamp bounds the output to the stated range.

**Normalize benchmark results**

Min–max scaling preserves proportional gaps between results. For model configuration $m$ (including reasoning effort) and benchmark $b$, $x_{m,b}$ is the result after any declared conversion. Its observed minimum and maximum define the normalized result $z_{m,b}$:

$$
z_{m,b}=100\cdot\operatorname{clamp}\left(\frac{x_{m,b}-x_{\min,b}}{x_{\max,b}-x_{\min,b}},0,1\right).
$$

If all observed results are equal, each receives 100. Imputed values cannot change the observed endpoints; new observations in later runs can.

**Calculate the weighted mean**

| Setting | Role |
| --- | --- |
| Importance | Standard policy: 1 for individual benchmarks and aggregate indexes; represented breadth supplies the index multiplier. |
| Allocation | Intelligence/Agentic split: 100/0, 75/25, 50/50, 25/75, or 0/100. |
| Effective weight $\omega_{b,d}$ | Importance × allocation to dimension $d$, expressed as a fraction. |

For dimension $d$ (Intelligence or Agentic), the model's initial score $z_{m,d}$ is the weighted mean of its observed normalized results:

$$
z_{m,d}=\frac{\sum_b\omega_{b,d}z_{m,b}}{\sum_b\omega_{b,d}}.
$$

Both sums include only observed results with positive weight for that dimension. Missing results are excluded, not counted as zeros. This establishes the weighted-mean calculation for observed results. Agentic applies the token adjustment below to its benchmark scores before taking the mean. The later sections specify which estimates enter that mean and how individual benchmarks and aggregate indexes are combined.

[Benchmarks](../benchmarks.md#portfolio-settings) records allocations and current importance exceptions. [Imputation across reasoning efforts](imputation.md#imputation-across-reasoning-efforts) explains how supported estimates enter the later benchmark mean.

### Balancing the Reference Population

The [collapsed row](overview.md#collapsed-and-expanded-models) selects one variant for display. Reference calculations instead use the available observed variants to estimate missing results and compare resource efficiency. Each base model receives one total reference weight, shared across its included variants, so reporting more effort settings does not give it more influence.

For base model $m$ with $n_m$ included variants, each variant $v$ receives weight $a_{m,v}=1/n_m$.

| Used for | What the weight affects |
| --- | --- |
| Resource comparisons | Expected cost, time, and token use at similar quality, plus efficiency ranks and statistical cutoffs. |
| Imputation | Reference distributions and typical prediction errors. |
| Source conversion | The typical difference between paired source results. |

Only variants with the required observations are counted in each calculation. Reference weights determine each model’s influence on comparisons; they do not divide its score or combine its variants into a collapsed score. Benchmark weights instead determine how much each benchmark contributes to a capability score.

Weighted statistics across models use these reference weights unless stated otherwise. A weighted median is the halfway point of cumulative weight in sorted order; at an exact boundary, the mean of the two adjacent values is used.

![Five observed efforts share one model’s weight equally. If only low, high, and max have the required observations, each receives one-third; missing efforts receive no weight.](../assets/methodology/reference-balance.svg)

### Agentic Token Efficiency

Using fewer tokens than expected at similar benchmark quality increases a model’s Agentic contribution; using more reduces it. The multiplier ranges from 0.85 to 1.15, with smaller adjustments when comparison support is weak. Apply it to each benchmark score, rescale the adjusted scores to 0–100, then combine them into Agentic. Intelligence and raw benchmark results stay unchanged.

**Select comparable token measurements**

Use observed quality and token counts from other base models before dashboard filtering to establish the comparison. Imputed quality cannot activate the adjustment. Imputed tokens can receive a discounted adjustment, but never enter the reference population.

Token counts must match the benchmark and effort. Use one measure supported by at least three independent models: complete input plus output counts first, reported totals next, or output-only counts separately. Aggregate-index token counts belong only to that index and use a linear quality coordinate.

**Compare actual and expected token use**

Compare the actual token count $N^{\text{tok}}_{m,b}$ with expected token use $\mu^{\text{tok}}_{m,b}$, estimated from other models at similar benchmark quality using the [expected resource calculation](speed-value.md#expected-resource-use). Both quantities are token counts. Take the natural logarithm of each so the difference measures their ratio:

$$
d^{\text{tok}}_{m,b}=\ln N^{\text{tok}}_{m,b}-\ln\mu^{\text{tok}}_{m,b}
=\ln\left(\frac{N^{\text{tok}}_{m,b}}{\mu^{\text{tok}}_{m,b}}\right).
$$

This difference, called a residual, is negative for fewer tokens than expected, zero for the expected amount, and positive for more. For example, 1,000 actual tokens against 2,000 expected tokens gives $d=\ln(0.5)\approx-0.693$.

**Measure how much token use varies**

The spread $s^{\text{tok}}_b$ supplies a scale for judging whether the log difference is small or large. Use observed token counts paired with quality results and the [model-balanced reference weights](#balancing-the-reference-population). Take the natural logarithm of each count, find their weighted median, then find the weighted median distance from it:

$$
s^{\text{tok}}_b=1.4826\operatorname{weightedMedian}\left(|\ln N^{\text{tok}}-\operatorname{weightedMedian}(\ln N^{\text{tok}})|\right).
$$

The median of those distances is called the median absolute deviation. Medians limit the influence of extreme token counts. This spread measures variation in log token counts before subtracting the peer predictions.

For a normal distribution, the median absolute deviation is approximately 0.67449 times the standard deviation. Multiplying by $1/0.67449\approx1.4826$ puts it on the same scale. This conversion does not require token counts to follow a normal distribution; 1.4826 is a statistical scaling convention, not a fitted Model Atlas parameter.

**Set the adjustment strength**

Divide $d$ by $s$ to express the difference in units of the observed spread. With full comparison support, dividing by $2s$ gives half the maximum adjustment at one spread unit above or below expected use, and the maximum at two or more. Choosing two spread units and a maximum adjustment of $\delta_{\max}=0.15$ are scoring-policy choices.

The [peer-support factor](speed-value.md#comparison-support) $p_{m,b}$ reduces the adjustment when too few other models have similar benchmark quality: 0 applies none, 0.5 applies half, and 1 applies all. Its calculation is explained in that section.

The token multiplier $M^{\text{tok}}_{m,b}$ combines the direction and size of the difference with that support. Clipping $d/(2s)$ to $[-1,1]$ enforces the limit:

$$
M^{\text{tok}}_{m,b}=1-\delta_{\max}\,p_{m,b}\operatorname{clamp}\left(\frac{d^{\text{tok}}_{m,b}}{2s^{\text{tok}}_b},-1,1\right).
$$

![Full peer support permits multipliers from 0.85 to 1.15. Half support halves the adjustment; no support leaves the multiplier at 1. The cap applies before benchmark remapping.](../assets/methodology/agentic-token-modifier.svg)

For example, $d=-s$ means one spread unit below expected token use. Full support gives $M=1.075$, a 7.5% increase; half support gives $M=1.0375$, a 3.75% increase. At $d=-2s$ or below, full support gives the maximum multiplier of 1.15. Higher-than-expected token use reduces the multiplier by the same rule.

**Handle missing or unsupported measurements**

The multiplier stays at 1 when tokens are neither measured nor imputable, measured token variation is zero, quality is flat, or comparison support is insufficient.

For imputed tokens, multiply the adjustment by their evidence factor $f^{\text{tok}}$: use $1+f^{\text{tok}}(M^{\text{tok}}-1)$ in place of $M^{\text{tok}}$. A factor of 0.5 halves the adjustment; zero leaves the multiplier at 1. Token imputation uses the same [validated effort ratios](imputation.md#resource-imputation-across-reasoning-efforts) and [broader-evidence fallback](imputation.md#resource-imputation-from-broader-evidence) as cost and time, separately for total and output-only tokens.

**Apply the multiplier and rescale**

Multiply the normalized benchmark score $z_{m,b}$ by $M^{\text{tok}}_{m,b}$. Then rescale the adjusted score $\widetilde z_{m,b}$ to 0–100 using the adjusted observed minimum and maximum:

$$
\widetilde z_{m,b}=z_{m,b}M^{\text{tok}}_{m,b},\qquad
z^A_{m,b}=100\frac{\widetilde z_{m,b}-\min_j\widetilde z_{j,b}}{\max_j\widetilde z_{j,b}-\min_j\widetilde z_{j,b}}.
$$

The adjusted $z^A$ enters the Agentic mean, index blend, and effort comparisons. Do not clip at 100 before rescaling. The ±15% limit applies to the multiplication step; it does not bound the final score change. Rescaling can also move scores whose multiplier is 1 because the observed minimum and maximum can change.

Token use changes neither evidence weights nor inclusion requirements. It can indirectly change Value through the Agentic score. Aggregate token counts do not distinguish successful completion from early termination or prove that an effort setting caused an efficiency gain.

### Evidence Support and Quality Regularization

Evidence support shows how much of the benchmark portfolio supports a model’s scores. Apply it after combining individual benchmarks and eligible indexes: at or below 10% coverage, multiply the entire score by 0.85; as coverage rises, increase the multiplier smoothly; at 60% coverage, keep the original score. The same rule applies to scores below 50 and to models with aggregate indexes.

**Count each result’s evidence**

For model variant $m$ and benchmark $b$, the evidence factor $f_{m,b}$ determines how much of the benchmark’s portfolio weight counts: 1 counts all of it, 0.5 counts half, and 0 counts none. Observations receive 1. A validated source crosswalk receives $f^{\text{cross}}_{m,b}$, the [source-crosswalk evidence factor](imputation.md#source-crosswalk-imputation).

For imputation from other benchmarks, use the normalized validation error $e^{\text{validation}}_{m,b}$ and observed share $s^{\text{observed}}_{m,b}$ of the other benchmarks’ total weight:

$$
f_{m,b}=
\begin{cases}
1 & \text{observed}\\
f^{\text{cross}}_{m,b} & \text{validated source crosswalk}\\
s^{\text{observed}}_{m,b}\operatorname{clamp}(1-e^{\text{validation}}_{m,b}/25,0,1) & \begin{gathered}\text{validated imputation}\\\text{from other benchmarks}\end{gathered}\\
0 & \text{otherwise}.
\end{cases}
$$

The factor for imputation from other benchmarks decreases as validation error grows and reaches zero at 25 error points. When Intelligence and Agentic both predict, their allocation shares combine the observed shares. Imputation across reasoning efforts adds no evidence support by itself; any separately validated evidence factor is retained.

**Calculate evidence support**

Multiply each benchmark’s portfolio weight by its evidence factor, sum those amounts, and divide by the full portfolio weight. This gives coverage $c_{m,d}$, displayed as evidence support, separately for dimension $d$ (Intelligence or Agentic). Here $\mathcal{B}_d$ is the selected benchmark set and $w_{b,d}$ is benchmark $b$’s weight for that dimension:

$$
c_{m,d}=\frac{\sum_{b\in\mathcal{B}_d}w_{b,d}f_{m,b}}{\sum_{b\in\mathcal{B}_d}w_{b,d}}.
$$

The numerator is the supported benchmark weight $E_{m,d}$. The denominator includes missing benchmarks. For example, supported weight 6 out of total weight 10 gives 60% evidence support.

Intelligence and Agentic each show an evidence share. Equal shares can represent different evidence amounts because portfolio weights differ. The API calls these fields `confidence`; they are coverage measures, not confidence intervals or probabilities of a correct rank.

**Determine the score multiplier**

The score multiplier $r_{m,d}$ keeps 85% of the entire score at or below 10% coverage and rises smoothly to 100% retention at 60% coverage. These thresholds use the displayed evidence coverage $c_{m,d}$, so broader missing coverage produces a visible score penalty:

$$
u_{m,d}=\operatorname{clamp}\left(\frac{c_{m,d}-0.1}{0.6-0.1},0,1\right),\qquad r_{m,d}=0.85+0.15u_{m,d}^2(3-2u_{m,d}).
$$

![Illustrative total portfolio weight: 40. Supported weight 4 gives 10% coverage and an 85% score multiplier; weight 24 gives 60% coverage and a 100% multiplier.](../assets/methodology/confidence.svg)

The multiplier stays between 0.85 and 1. Adding unobserved benchmarks to the selected portfolio can reduce coverage and therefore the score, even when existing results do not change.

**Apply the score reduction**

The unified score $S_{m,d}$ uses individual benchmarks, eligible indexes, accepted source crosswalks, and supported estimates across reasoning efforts. Agentic uses the token-adjusted benchmark scores. Multiply the entire score by $r_{m,d}$ to obtain the adjusted score $\widetilde S_{m,d}$:

$$
\widetilde S_{m,d}=r_{m,d}S_{m,d}.
$$

At 10% coverage, a score of 80 becomes 68 and a score of 40 becomes 34. At 35% coverage, the multiplier is 0.925; at 60% coverage it is 1.

**Why smoothstep**

Smoothstep keeps the output at 0 before the start and at 1 after the end. Between them, it joins those flat regions without a sudden change in slope. For a polynomial $P(u)$, this requires:

| Requirement | Equation |
| --- | --- |
| Start at 0 | $P(0)=0$ |
| End at 1 | $P(1)=1$ |
| Start flat | $P'(0)=0$ |
| End flat | $P'(1)=0$ |

The simplest polynomial satisfying these requirements is $P(u)=3u^2-2u^3$. Its derivative $P'(u)=6u(1-u)$ is zero at both ends and positive between them. Clipping the input $x$ to $u\in[0,1]$ keeps the output fixed outside the transition:

$$
\operatorname{smoothstep}(x)=u^2(3-2u),\qquad u=\operatorname{clamp}(x,0,1).
$$

The coefficients follow from the four requirements; choosing those requirements is scoring policy. The same curve also sets [peer comparison strength](speed-value.md#comparison-support) and the [shared coverage multiplier for Speed and Value](speed-value.md#combining-speed-and-value-components), each using its own start and end thresholds.

### Combining Benchmarks and Aggregate Indexes

When an eligible observed aggregate index is available, combine it with individual benchmark results in one weighted mean, separately for Intelligence and Agentic at each reasoning effort. More represented benchmarks give an index more weight; individual benchmark contributions receive a 1.5 multiplier.

Use the base weights $\omega_{b,d}$ defined above: importance × dimension allocation. For model $m$, $z_{m,b}$ is the normalized individual-benchmark contribution and $z_{m,k}$ is the normalized index contribution, including token adjustments for Agentic. Index $k$ has remaining represented breadth $B_{m,k,d}$ after overlap deductions for that model and dimension. The combined score is:

$$
S_{m,d}=\frac{1.5\sum_b\omega_{b,d}z_{m,b}+\sum_k\omega_{k,d}B_{m,k,d}z_{m,k}}{1.5\sum_b\omega_{b,d}+\sum_k\omega_{k,d}B_{m,k,d}}.
$$

The sums include only available contributions with positive weight. Accepted source-crosswalk and other-effort estimates can contribute as individual-benchmark values and receive the same 1.5 multiplier, but do not become direct observations or satisfy admission. Estimates inferred from other benchmarks affect evidence support only; they do not enter this mean. Effort-labelled variants use only indexes reporting that effort; unlabelled variants use the ordinary index pool.

Known constituent keys are recorded for AA and CAIS. A directly observed constituent with positive weight in the dimension removes one breadth unit from every eligible index containing it. Otherwise, a constituent shared by multiple eligible indexes contributes an equal fraction of one breadth unit to each. These deductions happen before applying index importance and dimension allocation, and remaining breadth cannot fall below zero. Unmapped constituents retain their assigned breadth because their overlap cannot be established.

These deductions reduce represented weight; they do not remove constituent results from the published index value. Overlap accounting therefore limits duplicate influence without reconstructing an index from its remaining benchmarks. The 1.5 multiplier is a policy preference for selected individual benchmarks, not a fitted optimum or a correction for selective reporting.

AA, CAIS, Surge, and Vals use their declared or edition-specific represented breadth. ECI uses the median fixed-index breadth, currently 7.5 from the counts 7, 7, 8, and 10. If only indexes are available, their weighted mean supplies the score before [coverage regularization](#evidence-support-and-quality-regularization). If no eligible observed index is present, the individual-benchmark mean is regularized in the same way; a uniform 1.5 multiplier cancels from that mean. The multiplier and represented breadth do not inflate displayed evidence support. Admission uses its separate [observed-evidence rules](leaderboard-rules.md#dashboard-inclusion). No additional adjustment is applied based on reasoning effort.

## Parameter Choices

These values are scoring-policy choices, not fitted claims about model behavior.

| Parameter | Value | Why it exists |
| --- | ---: | --- |
| Quality regularization | 85% retention through 10% evidence coverage; smooth rise to 100% retention at 60% coverage | Discounts the entire score for missing portfolio coverage while limiting the reduction to 15%. |
| Direct benchmark multiplier | 1.5 | Gives specific benchmark evidence modestly more influence than opaque represented index breadth without restoring a separate category-level blend. |
| Aggregate-index breadth | Represented benchmark count after exact known overlap deductions | Gives broad indexes influence in proportion to their published evidence while counting known direct and cross-index overlap once. |
| ECI breadth | 7.5, the median fixed-index breadth | Avoids model-specific fitted counts changing the categorical influence of one opaque index. |
| Agentic token modifier | ±15%, capped at two robust log-token spread units | Limits how much token efficiency can alter benchmark quality before remapping; the cap is a policy choice. |
