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
| Importance | Standard policy: 1 for individual benchmarks; 0.5 for aggregate indexes used for regularization. |
| Allocation | Intelligence/Agentic split: 100/0, 75/25, 50/50, 25/75, or 0/100. |
| Effective weight $\omega_{b,d}$ | Importance × allocation to dimension $d$, expressed as a fraction. |

For dimension $d$ (Intelligence or Agentic), the model's initial score $z_{m,d}$ is the weighted mean of its observed normalized results:

$$
z_{m,d}=\frac{\sum_b\omega_{b,d}z_{m,b}}{\sum_b\omega_{b,d}}.
$$

Both sums include only observed results with positive weight for that dimension. Missing results are excluded, not counted as zeros. This establishes the weighted-mean calculation for observed results. Agentic applies the token adjustment below to its benchmark scores before taking the mean. The later sections specify which estimates enter that mean and how individual benchmarks and aggregate indexes are combined.

[Benchmarks](benchmarks.md#portfolio-settings) records allocations and current importance exceptions. [Imputation across reasoning efforts](imputation.md#imputation-across-reasoning-efforts) explains how supported estimates enter the later benchmark mean.

### Balancing the Reference Population

The [collapsed row](methodology.md#collapsed-and-expanded-models) selects one variant for display. Reference calculations instead use the available observed variants to estimate missing results and compare resource efficiency. Each base model receives one total reference weight, shared across its included variants, so reporting more effort settings does not give it more influence.

For base model $m$ with $n_m$ included variants, each variant $v$ receives weight $a_{m,v}=1/n_m$.

| Used for | What the weight affects |
| --- | --- |
| Resource comparisons | Expected cost, time, and token use at similar quality, plus efficiency ranks and statistical cutoffs. |
| Imputation | Reference distributions and typical prediction errors. |
| Source conversion | The typical difference between paired source results. |

Only variants with the required observations are counted in each calculation. Reference weights determine each model’s influence on comparisons; they do not divide its score or combine its variants into a collapsed score. Benchmark weights instead determine how much each benchmark contributes to a capability score.

Weighted statistics across models use these reference weights unless stated otherwise. A weighted median is the halfway point of cumulative weight in sorted order; at an exact boundary, the mean of the two adjacent values is used.

![Five observed efforts share one model’s weight equally. If only low, high, and max have the required observations, each receives one-third; missing efforts receive no weight.](assets/methodology/reference-balance.svg)

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

![Full peer support permits multipliers from 0.85 to 1.15. Half support halves the adjustment; no support leaves the multiplier at 1. The cap applies before benchmark remapping.](assets/methodology/agentic-token-modifier.svg)

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

Evidence support shows how much of the benchmark portfolio supports a model’s scores. When no eligible observed aggregate index is available, adjust the combined score from individual benchmarks: with little evidence, reduce a score above 50 toward 50; with enough evidence, keep the original score. Scores of 50 or less stay unchanged. This adjustment is called regularization; 50 is the chosen midpoint of the 0–100 score scale.

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

**Determine how many points above 50 to keep**

The retention factor $r_{m,d}$ is the fraction of those points kept: 0 keeps none, 0.5 keeps half, and 1 keeps all. It depends on the supported weight $E_{m,d}$, with two thresholds:

| Threshold | Supported weight | Effect on a score above 50 |
| --- | --- | --- |
| Start | $0.1W_{\text{full}}$, currently 0.75 | At or below this point, reduce the score to 50. |
| End | $W_{\text{full}}$, currently 7.5 | At or above this point, keep the original score. |

The end threshold is the median benchmark count represented by the aggregate indexes. The start is set at 10% of that amount. These are policy choices. Between them, more evidence means a smaller score reduction.

Convert the supported weight to progress using current weight minus start, divided by end minus start. Apply smoothstep to make retention increase gradually from 0 to 1:

$$
r_{m,d}=\operatorname{smoothstep}\left(\frac{E_{m,d}-0.1W_{\text{full}}}{W_{\text{full}}-0.1W_{\text{full}}}\right).
$$

This uses supported weight directly, not the coverage percentage. Adding unobserved benchmarks lowers displayed coverage but does not increase the score reduction.

![Illustration: with total portfolio weight 40, supported weight 7.5 ends the score reduction at 18.75% coverage.](assets/methodology/confidence.svg)

**Apply the score reduction**

The combined score from individual benchmarks $S^{\text{bench}}_{m,d}$ uses the portfolio weights, observed results, accepted source crosswalks, and supported estimates across reasoning efforts. Agentic uses the token-adjusted benchmark scores. When no eligible observed aggregate index exists, subtract the fraction $1-r_{m,d}$ of its points above 50 to obtain the adjusted score $\widetilde S^{\text{bench}}_{m,d}$:

$$
\widetilde S^{\text{bench}}_{m,d}=S^{\text{bench}}_{m,d}-(1-r_{m,d})\max(S^{\text{bench}}_{m,d}-50,0).
$$

For a score of 80 and retention $r=0.5$, remove half of the 30 points above 50, leaving 65. The $\max$ term makes the reduction zero for scores at or below 50.

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

The coefficients follow from the four requirements; choosing those requirements is scoring policy. The same curve also sets the [weight assigned to individual benchmarks](#combining-benchmarks-and-aggregate-indexes), [peer comparison strength](speed-value.md#comparison-support), and the [shared coverage multiplier for Speed and Value](speed-value.md#combining-speed-and-value-components), each using its own start and end thresholds.

### Combining Benchmarks and Aggregate Indexes

Combine the score from individual benchmarks with the score from aggregate indexes, separately for Intelligence and Agentic at each reasoning effort. As more individual benchmarks have observed results, their combined score receives more weight, up to 80%. Indexes retain the remaining 20% at that limit.

**Calculate the two scores**

The combined score from individual benchmarks $S^{\text{bench}}$ is the weighted mean described above, including observed results and accepted estimates from source crosswalks and other reasoning efforts. Estimates from other benchmarks do not enter this mean. For Agentic, use the token-adjusted scores.

The index score $S^{\text{index}}$ is the weighted mean of eligible observed indexes, using represented benchmark count × importance × dimension allocation. Effort-labelled variants use only indexes reporting that effort; unlabelled variants use the ordinary index pool. Other indexes remain available for display and inclusion checks.

ECI’s fitted benchmark count sets its relative index weight; indexes with fixed benchmark sets use their declared counts. Deduct directly observed CAIS components from CAIS’s count to limit double counting. Other indexes keep their counts.

**Set the weight for individual benchmarks**

When both scores are available, their relative weight depends on $n_{\text{bench}}$, the number of individual benchmarks with observed results and positive allocation to the dimension. Indexes and estimates do not increase this count.

The share $w$ assigned to individual benchmarks is 20% with zero or one observed benchmark and rises to 80% at $n_{\text{full}}$, the median benchmark count represented by the indexes, currently 7.5. Convert the count to progress using current count minus start, divided by end minus start, then apply the [smoothstep curve](#evidence-support-and-quality-regularization):

$$
w=0.20+0.60\operatorname{smoothstep}\left(\frac{n_{\text{bench}}-1}{n_{\text{full}}-1}\right).
$$

![Individual benchmarks receive 20% weight at one observed benchmark and 80% at the threshold of 7.5. The isolated points at zero illustrate the case with no available individual-benchmark score, when indexes alone receive 100%.](assets/methodology/index-coverage-taper.svg)

The 20% and 80% limits are policy choices. The 80% limit is a share of the final score, not portfolio coverage. Adding unobserved benchmarks cannot delay it. Evidence factors and dashboard inclusion rules are separate; unlike Timeline, this calculation has no portfolio-coverage cap.

**Combine the scores**

Apply $w$ to the combined score from individual benchmarks and $1-w$ to the index score. The result $S$ is the public Intelligence or Agentic score for that variant:

$$
S=wS^{\text{bench}}+(1-w)S^{\text{index}}.
$$

If no individual-benchmark score is available, use the index score alone. If no eligible observed index is available, use the [evidence-adjusted score from individual benchmarks](#evidence-support-and-quality-regularization). Accepted estimates can supply an individual-benchmark score even with no directly observed individual benchmarks; when both scores exist, the 20% starting share still applies.

Combining these scores adds no evidence support and does not satisfy inclusion requirements. No additional adjustment is applied to the combined score based on reasoning effort.

## Parameter Choices

These values are scoring-policy choices, not fitted claims about model behavior.

| Parameter | Value | Why it exists |
| --- | ---: | --- |
| Quality regularization floor / full point | 10% / 100% of the median benchmark count represented by aggregate indexes | Reduces sparse high scores without increasing the penalty whenever the portfolio expands. |
| Capability benchmark/index endpoint | 80% / 20% at the configured observed-benchmark threshold (currently 7.5) | Gives well-observed individual benchmarks more influence while retaining an index contribution. |
| Individual-benchmark weight transition | Cubic smoothstep from one to the configured threshold of 7.5 observed individual benchmarks | Avoids an abrupt change in individual benchmark weight when another observation arrives; no available individual-benchmark score means indexes alone. |
| Agentic token modifier | ±15%, capped at two robust log-token spread units | Limits how much token efficiency can alter benchmark quality before remapping; the cap is a policy choice. |
