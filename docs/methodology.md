# Methodology

## What Model Atlas Measures

Model Atlas turns benchmark results, token use, prices, and runtimes into four separate 0-100 scores. Intelligence and Agentic describe capability; Speed and Value describe the resources used to deliver it. This article follows the calculation from a reported result to a public score, including what happens when evidence is missing.

**A benchmark** defines the evaluation, its methodology, and how results are scored. **A task** is one execution of work within a benchmark, following that methodology rather than defining its own. Resources **per task** describe the cost, time, or tokens for that execution, using the source’s reported task unit. An **aggregate index** combines results from multiple benchmarks.

Benchmark, reasoning-effort, and resource coverage is uneven. **Imputation** fills supported gaps using relationships across observed results; [source crosswalks](#source-crosswalk-imputation) combine comparable sources without assuming either is better.

The equations describe the current method. [Benchmarks](benchmarks.md) records the selected inputs and their source policies, while [Standards](standards.md) explains how those inputs earn a place. The [dashboard inclusion rules](#dashboard-inclusion) determine which scored models appear on the leaderboard.

| Score | What it measures |
| --- | --- |
| **Intelligence** | Knowledge, perception, understanding, abstract reasoning, and judgment. |
| **Agentic** | Turning goals into working results through coding, instruction following, tool use, verification, and recovery. |
| **Speed** | Completion time per task versus models of similar quality, plus token generation rate, first-token latency, and total response time. |
| **Value** | Cost per task versus models of similar quality, plus token prices evaluated for affordability and efficiency at comparable capability. |

- **Capability can overlap.** Implementing a specification is primarily Agentic; deriving a difficult algorithm or scientific solution can also contribute to Intelligence.
- **Efficiency accounts for quality.** Speed and Value compare resource use at similar quality, so a cheaper but much less capable model does not automatically score well on Value.
- **Resource effects are limited.** Agentic includes a bounded token-use adjustment based on measured and imputed token use. Price and latency do not affect either capability score.

## How to Read the Scores

The leaderboard uses the current benchmark population, so scores can change when that population changes. The separate [Intelligence Index](timeline.md) keeps a saved reference and connects benchmark generations through shared results. It supports historical comparison, uses provisional display units, and does not affect leaderboard scoring or inclusion.

Capability scores reflect relative performance while preserving proportional gaps within each benchmark during normalization. The final scores combine these contributions with weighting and evidence adjustments. A final score of 80 does not mean 80% benchmark accuracy or twice the capability of a model scoring 40.

### Collapsed and Expanded Models

Reasoning-effort labels include `none`, `low`, `medium`, `high`, `xhigh`, and `max`. An unspecified effort is stored as `null`; it is distinct from an explicit `none`. Available settings depend on the model and source.

Each reasoning-effort variant has its own scores. The collapsed leaderboard selects the variant with the **highest Intelligence score** and shows that variant's headline scores. It does not take the mean of scores across efforts or select a separate maximum for each score. Expanding a model reveals its individual variants.

Individual benchmark cells can use separate source-fusion or missing-cell fallback rules; they do not recalculate the representative variant's headline scores.

## Calculation Overview

The scoring order matters: benchmark quality establishes the context for resource comparisons. Dashboard inclusion filters are applied after reference scoring, so hiding a row does not change the scale used to score the others.

> [!FLOW]
>
> 1. **Observed inputs**
>
>    Exact model, variant, benchmark, and resources.
>
> 2. **Comparable benchmark evidence**
>
>    Normalize within each benchmark.
>
> 3. **Intelligence and Agentic**
>
>    Combine individual benchmark and aggregate-index evidence, using validated imputation to fill supported gaps in benchmark results and reasoning-effort variants.
>
> 4. **Quality-adjusted resources**
>
>    Compare cost and time at similar quality, using measured resources and supported imputation for missing cost, time, and token use.
>
> 5. **Dashboard inclusion and score availability**
>
>    Apply inclusion and direct-evidence checks after scoring, preserving the reference population.

**Imputed values help estimate scores; they never count as direct evidence.** Observations alone establish reference scales and satisfy inclusion and resource-availability requirements. [Benchmark imputation](#benchmark-imputation) and [resource imputation](#resource-imputation-across-reasoning-efforts) explain how estimates enter scoring and how their support is assessed.

![Imputation fills missing values with estimates.](assets/methodology/imputation-overview.svg)

## How Intelligence and Agentic Are Calculated

Intelligence and Agentic combine benchmark results separately for each model and reasoning effort. The sections below explain normalization and weights, the observed models used for comparisons, and the token adjustment applied to Agentic benchmark scores. They then explain missing-result estimates, evidence support, and how individual benchmarks combine with aggregate indexes. Prices and runtimes do not affect either capability score.

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

[Benchmarks](benchmarks.md#portfolio-settings) records allocations and current importance exceptions. [Imputation across reasoning efforts](#imputation-across-reasoning-efforts) explains how supported estimates enter the later benchmark mean.

### Balancing the Reference Population

The [collapsed row](#collapsed-and-expanded-models) selects one variant for display. Reference calculations instead use the available observed variants to estimate missing results and compare resource efficiency. Each base model receives one total reference weight, shared across its included variants, so reporting more effort settings does not give it more influence.

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

Compare the actual token count $N^{\text{tok}}_{m,b}$ with expected token use $\mu^{\text{tok}}_{m,b}$, estimated from other models at similar benchmark quality using the [resource comparison below](#expected-resource-use). Both quantities are token counts. Take the natural logarithm of each so the difference measures their ratio:

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

The [peer-support factor](#comparison-support) $p_{m,b}$ reduces the adjustment when too few other models have similar benchmark quality: 0 applies none, 0.5 applies half, and 1 applies all. Its calculation is explained in that section.

The token multiplier $M^{\text{tok}}_{m,b}$ combines the direction and size of the difference with that support. Clipping $d/(2s)$ to $[-1,1]$ enforces the limit:

$$
M^{\text{tok}}_{m,b}=1-\delta_{\max}\,p_{m,b}\operatorname{clamp}\left(\frac{d^{\text{tok}}_{m,b}}{2s^{\text{tok}}_b},-1,1\right).
$$

![Full peer support permits multipliers from 0.85 to 1.15. Half support halves the adjustment; no support leaves the multiplier at 1. The cap applies before benchmark remapping.](assets/methodology/agentic-token-modifier.svg)

For example, $d=-s$ means one spread unit below expected token use. Full support gives $M=1.075$, a 7.5% increase; half support gives $M=1.0375$, a 3.75% increase. At $d=-2s$ or below, full support gives the maximum multiplier of 1.15. Higher-than-expected token use reduces the multiplier by the same rule.

**Handle missing or unsupported measurements**

The multiplier stays at 1 when tokens are neither measured nor imputable, measured token variation is zero, quality is flat, or comparison support is insufficient.

For imputed tokens, multiply the adjustment by their evidence factor $f^{\text{tok}}$: use $1+f^{\text{tok}}(M^{\text{tok}}-1)$ in place of $M^{\text{tok}}$. A factor of 0.5 halves the adjustment; zero leaves the multiplier at 1. Token imputation uses the same [validated effort ratios](#resource-imputation-across-reasoning-efforts) and [broader-evidence fallback](#resource-imputation-from-broader-evidence) as cost and time, separately for total and output-only tokens.

**Apply the multiplier and rescale**

Multiply the normalized benchmark score $z_{m,b}$ by $M^{\text{tok}}_{m,b}$. Then rescale the adjusted score $\widetilde z_{m,b}$ to 0–100 using the adjusted observed minimum and maximum:

$$
\widetilde z_{m,b}=z_{m,b}M^{\text{tok}}_{m,b},\qquad
z^A_{m,b}=100\frac{\widetilde z_{m,b}-\min_j\widetilde z_{j,b}}{\max_j\widetilde z_{j,b}-\min_j\widetilde z_{j,b}}.
$$

The adjusted $z^A$ enters the Agentic mean, index blend, and effort comparisons. Do not clip at 100 before rescaling. The ±15% limit applies to the multiplication step; it does not bound the final score change. Rescaling can also move scores whose multiplier is 1 because the observed minimum and maximum can change.

Token use changes neither evidence weights nor inclusion requirements. It can indirectly change Value through the Agentic score. Aggregate token counts do not distinguish successful completion from early termination or prove that an effort setting caused an efficiency gain.

### Benchmark Imputation

Imputation uses observed results from related sources, benchmarks, or reasoning efforts to fill missing values. Observations take precedence, and imputed values never become direct evidence or inputs to further imputation.

| Imputation path | Role in scoring |
| --- | --- |
| Across sources | An accepted source crosswalk supplies a combined benchmark score that can enter the capability mean, with discounted evidence support. |
| From other observed benchmarks | Supplies quality estimates for resource comparisons and discounted evidence support; does not enter the capability mean. |
| Across reasoning efforts | Fills missing benchmark contributions in the capability mean; adds no evidence support by itself. |
| Cost, time, or tokens | Supplies resource estimates with evidence discounts; does not enter the reference population. |

Source crosswalks take priority over predictions from other observed benchmarks; both require held-out validation. Predictions from other benchmarks require at least three distinct observed benchmarks. Imputation across reasoning efforts separately fills missing capability contributions without adding evidence support. The final capability mean uses at most one contribution per benchmark, with observed results and accepted source crosswalks taking precedence over estimates from another effort. Higher effort is not assumed to perform better.

Imputation never satisfies direct-evidence requirements for dashboard inclusion or resource score availability. Each method's support and validation rules are described below.

### Source Crosswalk Imputation

Sources can report the same benchmark with different methodologies and model coverage. For sources selected for quality fusion, Model Atlas takes the equally weighted mean of their quality scores, without assuming either is better.

A **crosswalk** learns their typical score difference from shared models to impute a missing source result before calculating the mean. This preserves the same comparison target despite coverage gaps; validation on withheld models checks whether the imputation is reliable enough to use.

**Fit the offset**

Use results paired by model and reasoning effort:

| Symbol | Meaning and purpose |
| --- | --- |
| $A_i$, $B_i$ | Source A and B results for the same model-effort pair $i$. |
| $a_i$ | Reference weight: each base model shares one unit across its paired efforts, so reporting more efforts gives it no extra influence. |
| $\delta$ | Typical difference $B-A$: positive when B scores higher, negative when A scores higher. |

$$
\delta=\operatorname{weightedMedian}_i(B_i-A_i;a_i).
$$

The weighted median limits the influence of outliers.

**Validate on withheld models**

For each paired result $i$, fit $\delta_{\text{others},i}$ using other models, excluding every effort of its base model. Use that offset to predict the withheld source result and compare it with the observation. This prevents a model’s own results from helping predict it.

The absolute prediction error is $|B_i-A_i-\delta_{\text{others},i}|$. Only half the combined result is imputed, so its error is half as large before clipping. The weighted median gives validation error $\epsilon$ in the benchmark’s score units:

$$
\epsilon=\operatorname{weightedMedian}_i\left(\frac{\left|B_i-A_i-\delta_{\text{others},i}\right|}{2};a_i\right).
$$

**Accept, then impute**

Accept the crosswalk only if both the paired observations and usable validation predictions cover the required number of independent models, currently six, and $\epsilon\le\epsilon_{\max}$, the configured error limit. If it fails, try imputation from other observed benchmarks; without a supported prediction, leave the combined result missing. For sources selected for quality fusion, the mean of two observed quality scores can be calculated without imputation.

For an accepted crosswalk, use $\delta$ fitted from all paired observations. A hat marks an imputed result:

| Available results | Missing result | Combined result |
| --- | --- | --- |
| Both sources | None | $(A+B)/2$ |
| A only | $\hat B=A+\delta$ | $(A+\hat B)/2$ |
| B only | $\hat A=B-\delta$ | $(\hat A+B)/2$ |

Clip the combined value to the benchmark’s permitted score range. Raw source results remain separate.

![Source A and B results combine into observed or imputed means. Shaded bands around imputed means illustrate typical prediction error ±ε, using ε = 0.02; they are not confidence intervals or guaranteed bounds. A crossed-out validation error of 0.04 exceeds the allowed 0.025 and illustrates rejection of a different crosswalk.](assets/methodology/source-crosswalk.svg)

**Set the evidence factor**

The validation error sets the evidence factor $r$ for the imputed half:

$$
r=\operatorname{clamp}\left(1-\frac{\epsilon}{\epsilon_{\max}},0,1\right).
$$

The factor falls from 1 at zero error to 0 at the error limit. The combined result’s evidence factor $f^{\text{cross}}$ also includes its observed half:

| Evidence | Combined evidence factor $f^{\text{cross}}$ |
| --- | --- |
| Both sources observed | $1$ |
| One source imputed; observed value within that source’s paired calibration range | $(1+r)/2$ |
| One source imputed; observed value outside that range | $0.5$ (only the observed half counts) |

The error controls acceptance and the evidence factor; it is not subtracted from the score. A result containing imputation never counts as direct evidence, even when its evidence factor reaches 1.

**Quality and resources are assessed separately**

A valid quality crosswalk does not establish comparable cost, runtime, or token use. Each resource must independently pass the [absolute resource agreement rule](#resource-comparability-across-sources) before the mean of its raw amounts can be calculated. Similar quality scores or a predictable score offset do not satisfy that rule.

When resource amounts are not comparable, each source is scored against its own quality observations and reference population. Each retains half of the benchmark’s resource base weight, even when the other source is missing. Quality scores can still be combined, but resources cannot be imputed across those sources. [Resource Comparability Across Sources](#resource-comparability-across-sources) gives the resource calculations; two sources still count as one benchmark for direct-evidence requirements.

**Source comparison diagnostics**

Compare the same observed models across sources to see how their score distributions differ and how fusion changes them. Look for a horizontal shift, suggesting an offset, or different spreads, peaks, and tails that one offset may not capture. The fusion curve shows how taking the mean reshapes the distribution.

**Jensen–Shannon divergence (JSD)** measures overall distribution difference, treating both sources equally: A–B equals B–A. Use it to compare source disagreement and how far the fused distribution sits from each source.

**Kullback–Leibler divergence (KL)** measures mismatch in a chosen direction. A → B is large when A places substantial weight in score regions where B places little; B → A checks the reverse. Unequal values reveal this asymmetry, not which source is better.

For both metrics, zero means identical distributions and smaller values mean greater similarity. Use the same models and smoothing settings when comparing values. Neither metric checks whether individual models agree; held-out prediction error still determines crosswalk acceptance.

![Illustrative score distributions for the same paired models: source A, source B, and their equal-weight fusion. Gaussian smoothing with bandwidth 0.08 makes their shapes easier to compare.](assets/methodology/source-fusion-divergence.svg)

In this illustration, JSD is 0.015 between sources and 0.004 from either source to fusion. Directional KL divergence is 0.068 bits from A to B and 0.058 bits from B to A. These values use base-2 logarithms and depend on the smoothing bandwidth.

### Imputation from Other Observed Benchmarks

Use a model’s performance on other observed benchmarks to impute a missing result: calculate its weighted mean, find its percentile among peers, then read the target benchmark’s value at that percentile. Repeat separately for Intelligence and Agentic.

![The example uses ten models with one eligible variant each, so all reference weights are 1. A weighted mean of 70 maps to rank 45%, then to target value 0.58.](assets/methodology/quantile-imputation.svg)

**Calculate the weighted mean**

The weighted mean summarizes the same model-effort variant’s measured performance for comparison with peers. Each benchmark contributes according to its existing importance and allocation to Intelligence or Agentic.

Reuse the [normalization and weights defined above](#benchmark-scores-and-dimension-weights), separately for Intelligence and Agentic. For each other observed benchmark $k$ with positive weight, $z_k$ is its normalized score and $\omega_k$ its weight:

$$
\mu=\frac{\sum_k\omega_k z_k}{\sum_k\omega_k}.
$$

The missing benchmark and all imputed values are excluded. At least three other observed benchmarks are required. This policy prevents one or two results from determining the prediction.

**weightedQuantileRank(): value → percentile**

Convert the weighted mean into a percentile so its relative standing can be used on a benchmark with different score units. Use peers with both an observed target result and a weighted mean calculated the same way, covering at least three distinct base models. These peers also supply the target distribution in the next step.

An ordinary rank counts every model-effort variant equally, so five eligible efforts give a model five times the influence of one. The weighted rank gives each base model equal total influence by dividing its weight of 1 across its eligible variants.

Each peer variant $j$ has weighted mean $\mu_j$ and reference weight $a_j>0$. Count all weight below $\mu$ and half the tied weight:

$$
r=\frac{\sum_{\mu_j<\mu}a_j+\tfrac12\sum_{\mu_j=\mu}a_j}{\sum_j a_j}.
$$

![Three lower means count fully; three tied means count half. The resulting rank is 45%, or r = 0.45.](assets/methodology/weighted-quantile-rank.svg)

Counting half the tied weight assigns equal values the midpoint of their shared percentile range. The formula gives $r$ on 0–1; $\operatorname{weightedQuantileRank}$ returns $100r$.

**weightedQuantile(): percentile → value**

Convert the percentile back into a score using the target benchmark’s observed distribution. Using the same peers and reference weights on both sides keeps the comparison population consistent.

Sort those same peers’ observed target results as $x_1\le\cdots\le x_n$, keeping each reference weight attached. The cumulative weight share through result $k$ is:

$$
C_k=\frac{\sum_{j=1}^{k}a_j}{\sum_{j=1}^{n}a_j}.
$$

Find the first $k$ with $C_k\ge r$. Select its value, or take the mean of adjacent values at an exact boundary:

$$
\hat x=\operatorname{weightedQuantile}(r)=
\begin{cases}
\dfrac{x_k+x_{k+1}}{2}, & r=C_k\text{ and }k<n,\\[6pt]
x_k, & \text{otherwise}.
\end{cases}
$$

![The 45% rank selects 0.58. At the exact 60% boundary, the neighboring values 0.58 and 0.90 give a mean of 0.74.](assets/methodology/weighted-quantile.svg)

At $r=0$ or $r=1$, return its smallest or largest observed value; $r=0.5$ gives the weighted median.

**Combine and validate**

If both capability dimensions produce predictions, take their weighted mean using the benchmark’s dimension allocations. If only one predicts, use that prediction.

The key assumption is that relative standing on other benchmarks predicts standing on the missing one. Test this by withholding every effort of one base model at a time and comparing predictions with its observed target results.

Accept the method only when at least four distinct held-out models yield valid predictions and their model-balanced median absolute error is at most 25 points on the normalized target scale. Accepted predictions remain separate from the observed capability mean; prediction error and observed benchmark coverage determine their evidence factor for regularization and resource scoring.

### Imputation Across Reasoning Efforts

Fill a missing benchmark score using an observed result from another reasoning effort of the same model. The **target effort** has the missing result; the **reference effort** supplies the observed result. Their performance gap on shared benchmarks adjusts the estimate. Run the calculation separately for Intelligence and [token-adjusted Agentic](#agentic-token-efficiency). A missing result can be filled even when the effort already has enough evidence to avoid regularization.

Each benchmark’s overall score is one input, regardless of how many questions or test cases it contains. Aggregate indexes are excluded. Throughout this section, $w_b$ is benchmark $b$’s [portfolio weight](#benchmark-scores-and-dimension-weights): importance × allocation to the capability being calculated. Only positive weights participate.

**Choose the reference effort**

For each missing benchmark, consider other efforts with an observed result for it and at least three benchmarks observed at both the target and reference efforts. Imputed results cannot establish this overlap. If several efforts qualify, choose the one with the largest **effective benchmark count** $n_{\text{eff}}$. This selects the reference for that estimate; it does not change the portfolio weights. Ties prefer the reasoning setting closest to the target, then a stable label order. If none qualifies, leave the result missing.

The effective count measures how broadly the shared benchmarks influence the comparison. Equal weights give each benchmark an equal say; weights 1, 8, and 1 give one benchmark 80% of the influence. For $N$ shared benchmarks, the count equals $N$ with equal weights and approaches 1 as one benchmark dominates:

$$
n_{\text{eff}}=\frac{(\sum_b w_b)^2}{\sum_b w_b^2}.
$$

Squaring the weights makes concentration reduce the count. Scaling every weight by the same factor leaves it unchanged, so weights 0.25, 0.50, and 0.25 give the same count as 1, 2, and 1. The illustration keeps three shared benchmarks: one takes a growing share of the weight while the other two split the remainder equally. This count measures weight distribution, not prediction accuracy or correlation between benchmarks.

![Three shared benchmarks: equal weights give an effective count of 3; concentrating the weight brings it toward 1.](assets/methodology/effective-benchmark-count.svg)

**Estimate the missing score**

Measure the target’s performance relative to the chosen reference on their shared benchmarks. For each shared benchmark $b$, $t_b$ and $a_b$ are the normalized target and reference scores. Their weighted mean difference is the gap $\Delta$. For the missing benchmark, add this gap to its observed reference score $a$, then bound the estimate $\widehat t$ to 0–100:

$$
\begin{aligned}
\Delta&=\frac{\sum_b w_b(t_b-a_b)}{\sum_b w_b},\\
\widehat t&=\operatorname{clamp}(a+\Delta,0,100).
\end{aligned}
$$

A positive gap raises the estimate; a negative gap lowers it. The direction follows observed performance, without assuming that higher effort performs better. The estimate assumes the measured gap transfers to the missing benchmark.

![Illustrative imputation from medium effort to high effort for the same model.](assets/methodology/effort-imputation.svg)

These estimates do not increase evidence support by themselves. The evidence factor from separately validated imputation using other benchmarks is retained. Updated-release replacement rows are excluded from this imputation path.

### Evidence Support and Quality Regularization

Evidence support shows how much of the benchmark portfolio supports a model’s scores. When no eligible observed aggregate index is available, adjust the combined score from individual benchmarks: with little evidence, reduce a score above 50 toward 50; with enough evidence, keep the original score. Scores of 50 or less stay unchanged. This adjustment is called regularization; 50 is the chosen midpoint of the 0–100 score scale.

**Count each result’s evidence**

For model variant $m$ and benchmark $b$, the evidence factor $f_{m,b}$ determines how much of the benchmark’s portfolio weight counts: 1 counts all of it, 0.5 counts half, and 0 counts none. Observations receive 1. A validated source crosswalk receives $f^{\text{cross}}_{m,b}$, the [combined evidence factor defined above](#source-crosswalk-imputation).

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

The coefficients follow from the four requirements; choosing those requirements is scoring policy. The same curve also sets the [weight assigned to individual benchmarks](#combining-benchmarks-and-aggregate-indexes), [peer comparison strength](#comparison-support), and the [shared coverage multiplier for Speed and Value](#combining-speed-and-value-components), each using its own start and end thresholds.

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

## How Speed and Value Are Calculated

Speed and Value combine resource efficiency measured on benchmarks with provider speed and token prices. First establish the available measurements, then compare resource use at similar quality, estimate supported gaps, and combine the components. Display requirements are applied separately under [Dashboard Inclusion](#dashboard-inclusion).

### Blended Token Price

Blended price gives equal weight to input and output prices, in USD per million tokens:

$$
\begin{aligned}
\text{blended price}&=0.50\cdot\text{effective input price}+0.50\cdot\text{effective output price}
\end{aligned}
$$

Effective input and output prices are weighted means of provider prices, using reported token volumes as weights. The blend is a comparison convention, not a workload bill estimate.

Both sides need complete provider-price and token-volume evidence; otherwise the effective blend is missing. OpenRouter's aggregate and historical price series do not determine it, and cache pricing is excluded.

Published input, output, and cache prices remain raw route metadata. Listed catalog or Artificial Analysis prices can provide the fallback described in [Model Matching](matching.md#selected-identity).

### Provider Speed

Provider speed contributes 30% of Speed’s base weight, split equally between throughput, time to first token, and end-to-end response time. Time per task measured on benchmarks supplies the other 70%.

OpenRouter serving estimates combine endpoint history with matching positive token-volume weights. Endpoint IDs join directly to pricing data; provider-name guesses and request-count allocation are not used. Missing or unweighted endpoints leave the matched evidence usable.

If no weighted history remains, throughput falls back to the highest endpoint median (P50) and first-token latency to the lowest, following OpenRouter's model-page aggregate cards. End-to-end latency has no aggregate fallback.

The measured throughput $v_m$, first-token latency $t^{\text{first}}_m$, and total response time $t^{\text{total}}_m$ enter log-scaled min-max comparisons. The subscript “lower” reverses the scale so lower latency scores better:

$$
\begin{aligned}
S^{\text{rate}}_m&=\operatorname{MinMax}(\log v_m)\\
S^{\text{first}}_m&=\operatorname{MinMax}_{\text{lower}}(\log t^{\text{first}}_m)\\
S^{\text{total}}_m&=\operatorname{MinMax}_{\text{lower}}(\log t^{\text{total}}_m)
\end{aligned}
$$

Higher throughput and lower latency score better. Logarithms preserve proportional differences. Missing statistics reduce evidence support and receive no transferred weight from available statistics.

### Quality-Adjusted Resources per Task

Speed and Value compare resource use among independent models at similar benchmark quality. In the equations below, $A$ stands for the resource amount: $A^{\text{time}}_{m,b}$ is time per task in seconds and $A^{\text{cost}}_{m,b}$ is cost per task for model variant $m$ on benchmark $b$.

Use resources from the same benchmark and effort. If wall time is missing, output tokens divided by served throughput can estimate it; total tokens cannot substitute for output tokens. Validated effort imputation and broader-evidence fallback can fill other gaps. Source-wide means cannot replace task measurements.

Use resource amounts per task execution. Divide totals by the actual number of task executions when normalization is needed; repeated runs count as separate executions. Compare totals directly only when the executed tasks and run counts match. Retain source totals, task counts, and run counts for audit.

### Resource Comparability Across Sources

Resource fusion requires agreement in absolute per-task amounts, independently of [quality fusion and crosswalk imputation](#source-crosswalk-imputation). A benchmark can combine quality scores while keeping some or all resources separate by source.

Check cost, runtime, total tokens, and output tokens independently. The mean of raw amounts can be calculated only when their accounting is compatible and matched observations agree within the tolerance below. Normalize totals by their actual task-run counts first; check task coverage, retries, caching, and timing definitions.

Pair directly observed, positive, finite amounts for the same model and reasoning effort. For pair $i$, $A_i$ and $B_i$ are the two source amounts. Each base model shares total reference weight 1 across its $n_m$ paired efforts, giving pair weight $w^{\text{pair}}_i=1/n_m$. The absolute log-ratio measures disagreement symmetrically:

$$
d_i=\left|\log\frac{B_i}{A_i}\right|.
$$

The agreement share $p_{\text{agree}}$ is the fraction of reference weight whose larger amount is no more than 1.05 times its smaller amount. The indicator $\mathbf{1}$ equals 1 when the condition holds and 0 otherwise:

$$
p_{\text{agree}}=\frac{\sum_i w^{\text{pair}}_i\,\mathbf{1}[d_i\le\log(1.05)]}{\sum_i w^{\text{pair}}_i}.
$$

Permit raw resource fusion only with compatible accounting, at least 10 distinct paired base models, and $p_{\text{agree}}\ge0.90$. The sample minimum, 5% tolerance, and 90% share are policy choices, not statistical guarantees.

Check original per-task amounts without fitting an offset or rescaling either source. Similar distribution shapes do not establish agreement; too few paired observations leave the sources separate.

When the check passes, two observed amounts combine as $(A+B)/2$. Passing the check does not validate a missing-source estimate; that still requires separately validated resource imputation.

**Separate scoring when raw amounts are not comparable**

Keep each source's resources paired with its own quality observations and score against its own reference population. Do not take the mean of raw amounts or impute resources across these sources. Unsupported source gaps remain missing; weak peer support pulls scores toward 50.

For a benchmark resource component with base weight $w_b$, allocate $w_b/2$ to each source. Source scores $S_A,S_B$ and evidence factors $f_A,f_B$ contribute a weighted score sum $S^{\text{sum}}_b$ and available weight $W^{\text{avail}}_b$. The resource mean divides the total weighted score sum by the total available weight:

$$
S^{\text{sum}}_b=\frac{w_b}{2}f_A S_A+\frac{w_b}{2}f_B S_B.
$$

$$
W^{\text{avail}}_b=\frac{w_b}{2}f_A+\frac{w_b}{2}f_B.
$$

With full evidence from both sources, the component mean is $(S_A+S_B)/2$. A missing source has an evidence factor of zero, and the available source retains its half of the benchmark's base weight. The full benchmark weight remains in the coverage denominator. Two sources still represent one benchmark for direct-evidence requirements.

Token-efficiency adjustments likewise use separate source quality and token references. Each supported source supplies half of the possible adjustment; an unsupported or missing source remains neutral. The equations above describe Speed and Value aggregation, not the Agentic token multiplier.

### Comparable-Quality Peers

Models with similar benchmark results receive more comparison weight. First convert each result to a scale suitable for comparing quality differences. The benchmark’s chosen transform $g_b$ maps result $x_{m,b}$ to quality coordinate $q_{m,b}$:

$$
q_{m,b}=g_b(x_{m,b}),\qquad
g_b(x)=
\begin{cases}
x & \text{linear}\\
\operatorname{logit}(x) & \text{logit}
\end{cases}
$$

A linear coordinate preserves the stored score gaps. It suits partial credit, Elo-derived scores, rubrics, composites, human-relative performance, and other metrics whose endpoints do not represent a success probability.

A logit coordinate uses $\operatorname{logit}(x)=\log(x/(1-x))$ for probability-like pass, accuracy, and completion rates. Inputs must lie in $[0,1]$ and are clipped to 0.001–0.999 before conversion, keeping the transformed values finite near the endpoints.

The benchmark-specific decisions are listed in [Benchmarks](benchmarks.md#resource-quality-coordinates). Aggregate price comparisons are not benchmark success rates; they use the linear mean of the two public quality scores described below.

Logit gives equal percentage-point gains more separation near the ceiling, where they remove a larger share of remaining errors.

![An equal percentage-point gain occupies more distance near the ceiling. The lower bars share a logit scale: 95% to 96% spans about 0.234, compared with 0.040 for 50% to 51%.](assets/methodology/logit-quality.svg)

After this transform, center quality on the weighted median and divide by a robust spread to obtain $Z_{m,b}$. This makes quality distances comparable across benchmarks. Each observed peer $j$ has reference weight $w^{\text{ref}}_{j,b}$: one unit per base model, shared across variants with paired quality and resource observations. $Q^{\text{weighted}}_{25}$ and $Q^{\text{weighted}}_{75}$ are the weighted 25th and 75th percentiles; $s^{\text{min}}_b$ is the minimum spread:

$$
\begin{aligned}
s^{q}_b&=\max\left(\frac{Q^{\text{weighted}}_{75}(\{q_{j,b}\})-Q^{\text{weighted}}_{25}(\{q_{j,b}\})}{1.349},s^{\text{min}}_b\right)\\
Z_{m,b}&=\frac{q_{m,b}-\operatorname{weightedMedian}_j(q_{j,b},w^{\text{ref}}_{j,b})}{s^{q}_b}
\end{aligned}
$$

The interquartile range covers the middle half of observations; 1.349 converts it to a standard-deviation-like scale. The minimum spread is $s^{\text{min}}_b=0.35$ for logit coordinates and $s^{\text{min}}_b=0.35(q_{\mathrm{max},b}-q_{\mathrm{min},b})$ for linear coordinates. This prevents small score differences in tightly clustered results from appearing too large and keeps linear comparisons unchanged by unit conversions.

Only observed paired results set the range. The spread describes the reference distribution, not measurement uncertainty. With flat reference quality, only equal-quality rows receive support.

Gaussian weights $w^{\text{peer}}_{m,j,b}$ favor peers near the target quality, with width $\sigma=0.5$. The indicator $\mathbf{1}[\cdot]$ is 1 for a different base model and 0 for the same base model, excluding all efforts of the target model:

$$
w^{\text{peer}}_{m,j,b}=\mathbf{1}[\operatorname{model}(m)\ne\operatorname{model}(j)]w^{\text{ref}}_{j,b}\exp\left(-\frac{1}{2}\left(\frac{Z_{m,b}-Z_{j,b}}{0.5}\right)^2\right)
$$

At identical quality, the exponential term is 1, so a peer keeps its full reference weight. A standardized quality difference of 0.5 retains about 61% of that weight; a difference of 1 retains about 14%. The width 0.5 is a policy choice controlling how quickly comparison weight decreases with distance.

### Comparison Support

Peer support determines how much the comparison with other models can affect a score. Several models with similar benchmark quality allow a stronger adjustment; distant models contribute less. Calculate support separately for each benchmark and resource using observed quality paired with that resource. Count base models rather than effort variants, excluding every effort of the target model. First combine the [peer weights defined above](#comparable-quality-peers) by base model $k$:

$$
w^{\text{model}}_{m,k,b}=\sum_{j:\operatorname{model}(j)=k}w^{\text{peer}}_{m,j,b}.
$$

The effective model count uses the same formula as the [effective benchmark count](#imputation-across-reasoning-efforts), now applied to base-model weights. It measures how evenly the comparison weight is distributed: equal weights give the actual model count, while concentration in one model brings it toward one.

Effective count alone ignores how small the weights are. Four equally distant models still have an effective count of four. The supported model count $n^{\text{supported}}_{m,b}$ therefore takes the smaller of total peer weight and effective model count, so distant comparisons cannot establish strong support merely by having equal weights:

$$
n^{\text{supported}}_{m,b}=\min\left(\sum_k w^{\text{model}}_{m,k,b},\frac{(\sum_k w^{\text{model}}_{m,k,b})^2}{\sum_k (w^{\text{model}}_{m,k,b})^2}\right)
$$

For example, four other models with weight 0.5 each have total weight 2 and effective count $2^2/(4\times0.5^2)=4$. The smaller value is 2, so their supported model count is 2. This count can be fractional; without positive peer weight, set it to zero.

Convert this count into the peer-support factor $p$ using the [smoothstep curve](#evidence-support-and-quality-regularization). Subtract the start threshold of 1 and divide by the interval from 1 to 3:

$$
p_{m,b}=\operatorname{smoothstep}\left(\frac{n^{\text{supported}}_{m,b}-1}{3-1}\right).
$$

| Supported model count | $p$ | Effect |
|---|---|---|
| 1 or less | 0 | Apply no token adjustment; resource efficiency receives 50. |
| 2 | 0.5 | Apply half the token adjustment; move resource efficiency halfway from 50 toward its calculated score. |
| 3 or more | 1 | Apply the full token adjustment and resource efficiency score. |

![Four peers weighted 0.5 each give total weight 2 and effective count 4. The smaller count, 2, gives half-strength comparison support.](assets/methodology/comparison-support.svg)

The thresholds of 1 and 3 are policy choices. Support also controls how much the local trend contributes to expected resource use below. It is separate from displayed evidence coverage and is not a probability that the comparison is correct.

### Expected Resource Use

Estimate expected resource use at the target quality. Start with a local weighted mean; with sufficient peer support, fit a local trend. Compare resources using natural logarithms so proportional cost and time differences are comparable. In this calculation, $\log$ means $\ln$.

**Calculate the local mean and trend**

For resource $r$ (cost, time, or tokens), $A^r_{j,b}$ is peer $j$’s amount on benchmark $b$. The peer weights give mean log resource use $\bar y^r_{m,b}$. Fit a line predicting log resource use from quality. Its intercept $\hat\alpha$ is the prediction at the target quality; its slope $\hat\beta$ is the change in log resource use per unit of standardized quality. Choose both to minimize the weighted squared prediction errors:

$$
\begin{aligned}
\bar y^r_{m,b}&=\frac{\sum_jw^{\text{peer}}_{m,j,b}\log A^r_{j,b}}{\sum_jw^{\text{peer}}_{m,j,b}}\\
(\hat\alpha,\hat\beta)&=\arg\min_{\alpha,\beta}\sum_jw^{\text{peer}}_{m,j,b}\left[\log A^r_{j,b}-\alpha-\beta(Z_{j,b}-Z_{m,b})\right]^2.
\end{aligned}
$$

**Bound the prediction and apply support**

Evaluate the line at $Z^*_{m,b}$, the target quality clipped to the independent observed peers’ range. Clip its prediction $\widetilde y^r_{m,b}$ to their observed log-resource range as well. Comparison support $p_{m,b}$ blends the local mean and bounded trend in log units. Exponentiate that result to obtain expected resource use $\mu^r_{m,b}$ in the original units: dollars, seconds, or tokens. This is a prediction fitted in log space, not an arithmetic mean of resource amounts:

$$
\begin{aligned}
Z^*_{m,b}&=\operatorname{clamp}(Z_{m,b},Z_{\min,b},Z_{\max,b})\\
\widetilde y^r_{m,b}&=\operatorname{clamp}\left(\hat\alpha+\hat\beta(Z^*_{m,b}-Z_{m,b}),\min_j\log A^r_{j,b},\max_j\log A^r_{j,b}\right)\\
\mu^r_{m,b}&=\exp\left(\bar y^r_{m,b}+p_{m,b}(\widetilde y^r_{m,b}-\bar y^r_{m,b})\right)
\end{aligned}
$$

Use the local mean through a supported model count of 1 and the full trend at a count of 3. Flat quality or unstable slopes retain the mean; the slope can be positive or negative. These bounds prevent extrapolation beyond observed quality and resource use. Weak support also reduces the final efficiency score toward 50.

**Compare observed and expected use**

The observed amount $A^r_{m,b}$ and expected amount $\mu^r_{m,b}$ use the same resource units. Take the natural logarithm of both to calculate their difference $d^r_{m,b}$, called a residual:

$$
d^r_{m,b}=\ln A^{r}_{m,b}-\ln\mu^r_{m,b}=\ln\left(\frac{A^r_{m,b}}{\mu^r_{m,b}}\right).
$$

![In this illustration, nearby independent peers support an expected time of 100 seconds. The target uses 50 seconds, giving residual ln(50/100), approximately −0.693.](assets/methodology/resource-residual.svg)

A negative residual means less resource use than expected at that quality; a positive residual means more.

### Resource Efficiency Score

Take the mean of two scores: the size of the resource advantage and its percentile rank. Then pull the result toward 50 when peer support is weak.

The magnitude score measures the size of the resource advantage on a 0–100 scale. Its lower limit $L$ is the model-balanced 2.5th percentile of supported residuals; its upper limit $U$ is their maximum. Clip residuals below $L$ so exceptionally low resource use cannot stretch the scale. This clipping is called winsorization:

$$
S^{\text{mag},r}_{m,b}=100\cdot\frac{U-\operatorname{clamp}(d^r_{m,b},L,U)}{U-L}.
$$

The percentile score $S^{\text{pct},r}_{m,b}$ ranks the negative residual, so lower resource use scores higher. It counts all tied weight; benchmark imputation counts half. Both reference distributions give each base model equal total weight.

The mean $\bar S^r_{m,b}$ combines magnitude $S^{\text{mag},r}_{m,b}$ and percentile $S^{\text{pct},r}_{m,b}$ equally. Comparison support $p_{m,b}$ then pulls the component score $S^{\text{res},r}_{m,b}$ toward 50:

$$
\bar S^r_{m,b}=\frac{S^{\text{mag},r}_{m,b}+S^{\text{pct},r}_{m,b}}{2}.
$$

$$
S^{\text{res},r}_{m,b}=50+p_{m,b}(\bar S^r_{m,b}-50).
$$

![An illustrative combined score of 75 becomes 75, 62.5, or 50 with full, half, or no comparison support. Scores below 50 also move toward 50 as support weakens.](assets/methodology/resource-score-mapping.svg)

If supported residuals have no meaningful spread, every observed residual receives 50. Estimated resources can be scored against the observed reference, but cannot change its reference limits.

### Resource Imputation Across Reasoning Efforts

Impute a missing resource amount from another effort of the same model using a ratio learned from shared benchmarks. Cost, runtime, total tokens, and output tokens each have separate ratios. Exclude unlabelled rows representing the source’s default effort and means reported across benchmarks; benchmark-specific measurements remain eligible.

**Estimate the effort ratio**

For resource $r$ on benchmark $k$ measured at both efforts, $A^{r,\text{target}}_k$ and $A^{r,\text{source}}_k$ are the observed amounts at the target and source efforts. Their log difference $\ell^r_k$ represents the target-to-source ratio:

$$
\ell^r_k=\log A^{r,\text{target}}_k-\log A^{r,\text{source}}_k.
$$

At least three benchmarks with paired measurements are required. To validate the ratio, withhold benchmark $k$ and calculate the median log difference $\widehat\ell^r_{-k}=\operatorname{median}_{j\ne k}(\ell^r_j)$ from the other benchmarks; the subscript $-k$ means benchmark $k$ is excluded. Exponentiating that difference gives the ratio used to predict the withheld target amount:

$$
\widehat A^{r,\text{target}}_k=A^{r,\text{source}}_k\exp(\widehat\ell^r_{-k}).
$$

**Check prediction and score errors**

Validation measures both the resource error and its effect on the component score. For the withheld target, $A^r_k$ is the observed amount and $\widehat A^r_k$ its prediction; $S^{\text{res},r}_k$ and $\widehat S^{\text{res},r}_k$ are their resource scores. Their median absolute errors are:

$$
e^r_{\mathrm{log}}=\operatorname{median}_k\left|\log\frac{\widehat A^r_k}{A^r_k}\right|,
\qquad
e^r_{\text{score}}=\operatorname{median}_k\left|\widehat S^{\text{res},r}_k-S^{\text{res},r}_k\right|.
$$

Reject the ratio if log error reaches $\log 2$ (a factor of two), score error reaches 25 points, or fewer than three held-out score comparisons are usable. Otherwise, the evidence factor $f^r$ uses the lower of the two error discounts:

$$
f^r=\min\left(1-\frac{e^r_{\mathrm{log}}}{\log2},1-\frac{e^r_{\text{score}}}{25}\right).
$$

Both terms are clipped to $[0,1]$. The final ratio uses the median log difference across all benchmarks with paired measurements. If several efforts of the same model can fill the gap, the nearest effort is preferred, with validation quality breaking ties.

If target quality is also imputed, its evidence factor multiplies the resource evidence factor: $f^{\text{quality}}f^r$. Imputed values remain outside reference peers, reference score limits, stored observations, and direct-evidence counts.

### Resource Imputation from Broader Evidence

When benchmarks with paired measurements cannot support an effort ratio, start with other models and refine the estimate using progressively narrower groups of observations:

> [!FLOW]
>
> 1. **Other models**
>
>    Start with the median log resource ratio for the exact benchmark and effort transition across at least two other base models. Exclude every effort of the target model.
>
> 2. **Same lab**
>
>    Adjust for how models from this lab differ from the ratios across other models. Use their median deviations, excluding each model from the reference used to calculate its deviation.
>
> 3. **Nearby releases in that lab**
>
>    Give more weight to those deviations when release dates are closer to the target model’s. Use $\exp[-\tfrac12(\Delta t/60)^2]$, where $\Delta t$ is the release-date difference in days.
>
> 4. **Target model**
>
>    Adjust using this model’s effort ratios on other benchmarks with paired measurements, after subtracting the corresponding ratios across other models.

Date weighting and correction limits are policy choices; release proximity alone does not establish predictive accuracy.

[Release proximity](matching.md#release-proximity-for-resource-estimation) uses dates, not product-name categories. Missing dates retain the lab correction; missing lab identity prevents both lab and release corrections.

Multiply each correction by $n/(n+n_{50})$, where $n$ is its supporting observation count or weight and $n_{50}$ is the amount needed to apply half the correction. With little evidence, the estimate stays close to the broader result; this is called shrinkage:

| Scope | Supporting observations $n$ | Half-correction threshold $n_{50}$ |
| --- | --- | --- |
| Same lab | Number of distinct other models from the lab | 16 |
| Nearby releases | Sum of the release-date weights above; correction uses the weighted median deviation | 4 |
| Target model | Number of other benchmarks measured at both efforts | 4 |

![With supporting observations n = 4, the correction weight is 50% for nearby releases or the target model, and 20% for the same lab.](assets/methodology/resource-tier-shrinkage.svg)

Without supporting observations, apply no correction. Parameters are fixed, not fitted per model. Only observations for the same effort transition are used, such as low to high.

Apply the ratio to the observed amount at the closest effort for which that transition can be estimated. Use the same benchmark and resource. Direct measurements and validated same-model ratios take precedence.

The evidence factor $f_b$ increases with the number of independent other models $n^{\text{models}}_b$ and decreases with disagreement $d_b$, the median absolute difference between their log ratios and the final estimated log ratio:

$$
f_b=\frac{n^{\text{models}}_b}{n^{\text{models}}_b+4}\max\left(0,1-\frac{d_b}{\log 2}\right).
$$

This factor measures support and agreement, not the probability of an accurate prediction. A zero factor or a non-finite amount leaves the value missing.

Broader-evidence imputation affects scoring only, with the existing discount for imputed target quality. It cannot supply evidence for further imputation, overwrite measurements, or satisfy resource availability requirements.

Cost, runtime, total tokens, and output tokens each use their own observations and ratios. Aggregate-index tokens stay attached to their own index. Runtime imputation requires reported seconds paired with observed quality; cost and throughput-derived time cannot supply that evidence.

### Combining Speed and Value Components

Combine resource efficiency measured on benchmarks with provider measurements, discount imputed inputs, then apply a model-level coverage multiplier.

Convert each component to 0–100, with higher scores indicating better performance. Provider statistics use ordinary min-max scores of $\log x$. Absolute price uses $\log_{10}(1+\text{blended price})$ with the favorable tail clipped at 2.5%. Quality-adjusted price uses the same local residual method as benchmark resource comparisons. Keeping absolute and quality-adjusted price separate retains both affordability and efficiency at comparable capability.

Price comparisons use the mean of the public Intelligence and Agentic scores as the quality value used to compare prices:

$$
q^{\text{price}}_m=\operatorname{mean}(\text{Intelligence}_m,\text{Agentic}_m).
$$

Use the final public capability scores on a linear scale. Time and cost per task instead use their own benchmark quality and declared transform.

For transformed measurement $g(x)$, $g_{\min}$ and $g_{\max}$ are its finite reference minimum and maximum. Min–max scaling maps this range to 0–100. When higher values are better, the score is:

$$
S_{\uparrow}(x)=100\operatorname{clamp}\left(\frac{g(x)-g_{\min}}{g_{\max}-g_{\min}},0,1\right)
$$

The lower-is-better score $S_{\downarrow}(x)$ reverses the same scale:

$$
S_{\downarrow}(x)=100\operatorname{clamp}\left(\frac{g_{\max}-g(x)}{g_{\max}-g_{\min}},0,1\right)
$$

Equal-value populations follow the [normalization rule above](#benchmark-scores-and-dimension-weights). Absolute price clips its favorable tail; quality-adjusted resource scores combine magnitude and percentile.

Ordinary Speed and Value reserve 70% of their base weight for benchmark resource measurements and 30% for provider or price measurements. Active benchmark inputs split the 70% allocation equally:

| Score | Benchmark resources: 70% | Other measurements: 30% |
| --- | --- | --- |
| Speed | Quality-adjusted time per task | Throughput, latency, and end-to-end latency: 10% each |
| Value | Quality-adjusted cost per task | Absolute and quality-adjusted price: 15% each |

The base weight $w^{\text{base}}_i$ records this policy. The evidence factor $f_{m,i}$ records how much support a row has for that component, giving the effective weight $w_{m,i}=w^{\text{base}}_if_{m,i}$. Direct evidence has a factor of 1. Estimated quality contributes its discount $f^{\text{quality}}$; estimated resources multiply it by their own evidence factor $f^r$.

The 70/30 split applies when all components have full evidence. Missing or discounted inputs can change the proportions in an individual row's available weighted mean; they also lower its displayed evidence share.

**Apply shared coverage**

All efforts of a base model share one coverage multiplier, so different observation counts alone do not create different penalties. The configuration used to set shared coverage is the unlabelled variant, or the highest reported effort if all are labelled.

For base-model group $g$ and dimension $d$ (Speed or Value), $m^{\text{default}}_g$ is that configuration and $W^{\text{total}}_d$ is the total active base weight. That configuration’s evidence share $c^{d}_{g,\text{ref}}$ determines the shared multiplier $C_g^d$:

$$
c^{d}_{g,\text{ref}}=\frac{\sum_iw^d_{m^{\text{default}}_g,i}}{W^{\text{total}}_d}.
$$

$$
C_g^d=\operatorname{smoothstep}\left(\frac{c^{d}_{g,\text{ref}}-0.1}{0.5}\right).
$$

The multiplier is zero through 10% coverage and reaches one at 60%. Each effort retains its own component mean and displayed evidence share.

For variant $m$, $g(m)$ identifies its base model. Its Speed components $s_{m,i}$ and Value components $v_{m,i}$ form weighted means, which receive the shared multiplier. The displayed evidence shares use that variant’s own effective weights:

$$
\begin{aligned}
\text{Speed}_m&=C^{\text{speed}}_{g(m)}\frac{\sum_iw^{\text{speed}}_{m,i}s_{m,i}}{\sum_iw^{\text{speed}}_{m,i}}\\
c^{\text{speed}}_m&=\frac{\sum_iw^{\text{speed}}_{m,i}}{W^{\text{total}}_{\text{speed}}}\\
\text{Value}_m&=C^{\text{value}}_{g(m)}\frac{\sum_iw^{\text{value}}_{m,i}v_{m,i}}{\sum_iw^{\text{value}}_{m,i}}\\
c^{\text{value}}_m&=\frac{\sum_iw^{\text{value}}_{m,i}}{W^{\text{total}}_{\text{value}}}.
\end{aligned}
$$

![The shared coverage multiplier scales each effort’s own resource mean. In this illustrative pair, coverage of 35% for the shared reference configuration gives both efforts a multiplier of one-half, producing scores of 40 and 30.](assets/methodology/resource-coverage.svg)

The Price vs Cost Efficiency graph compares observed cost efficiency per task on benchmarks separately from the full Value score. It also shares the same reference configuration's coverage across ordinary efforts, so different observation counts alone do not create different penalties within one model.

Peer support controls how far each resource comparison moves from 50. The shared coverage multiplier then scales the combined Speed or Value score.

## Dashboard Inclusion

A model appears on the dashboard only when it meets all of these requirements:

- A qualified model identity, a name, and confirmed text output.
- An observed benchmark count reaching the inclusion threshold, currently seven, as counted below.
- At least one observed selected input in each of Intelligence and Agentic.
- At least two distinct observed eligible indexes, or one observed Artificial Analysis Intelligence Index or Epoch Capabilities Index.
- Finite relative Intelligence and Agentic scores strictly greater than 10 each.

**Count observed benchmarks**

Standalone benchmarks contribute their configured importance once across both dimensions. An observed aggregate index contributes its represented benchmark count, without the half-importance discount used in quality scoring.

Count each known component once across indexes and standalone observations, using the larger of its standalone importance and the one unit represented within an observed index. Add each index’s remaining count of unnamed benchmarks separately. This avoids double counting known overlap and prevents a half-importance standalone observation from reducing existing index coverage.

AA’s main Intelligence Index represents ten benchmarks. Its Agentic, Coding, and Omniscience indexes do not increase the benchmark count used for inclusion. Only observed results count, including observed zeros.

ECI supplies a model-specific fitted benchmark count, falling back to four when unavailable. Its component overlap is unknown, so this count is an estimate added alongside standalone evidence. Inclusion uses observations matched to the exact configuration; imputation supplies no direct coverage.

The required benchmark count is the smallest known count represented by an index among AA, CAIS, Surge, and Vals, currently seven. ECI’s publication minimum is excluded because it is not a fixed benchmark basket.

| Inclusion rule | Detail |
| --- | --- |
| Eligible indexes | AA’s main Intelligence Index, CAIS, ECI, Surge, and Vals. Secondary AA indexes and imputed results do not count. |
| Single-index exception | One observed AA main index or ECI satisfies the index-count rule only. Benchmark-count, dimension, and quality requirements still apply. |
| Benchmark count versus index count | Standalone results can increase the benchmark count but cannot replace the index requirement. ECI’s fallback count of four does not meet the seven-benchmark threshold alone. |
| Timing and source | No specific index, release age, or prior publication is required. |

Scoring regularization and the benchmark/index blend use the median benchmark count represented by indexes; inclusion uses the minimum count described above.

**Apply display rules**

The default leaderboard follows the Timeline chart's display policy: OpenAI Pro configurations, Gemini Deep Think, and Claude Mythos are hidden because of their specialized resourcing, operating policies, or assets. Ordinary Gemini Pro and other high-reasoning configurations remain eligible. This display filter leaves source evidence, scores, and the scoring reference population unchanged.

All included models receive numeric ranks in compact views. Missing specifications remain null; Speed and Value have separate resource requirements. The exact-variant `all` JSON view has no rank field.

Benchmark results can be published before a model appears in public catalogs. Catalog absence alone does not invalidate sufficiently evidenced results. A model below the required observed benchmark count is excluded, regardless of release age.

Apply these requirements after scoring. Excluding a model from the dashboard leaves the population used to calculate scores unchanged.

### Resource Score Availability

A listed token price or serving speed alone does not show the resources needed to complete useful work. Value and Speed therefore require observed quality paired with resource measurements per task before those scores can be displayed, with cost and time qualifying independently.

A dashboard variant needs observed quality-and-resource coverage representing at least four distinct benchmarks to display Value or Speed. Each selected individual benchmark contributes one when it has observed quality paired with positive cost or directly reported seconds.

The selected Artificial Analysis Intelligence Index contributes its catalogued benchmark count, currently 10, when its observed score is paired with its own positive aggregate cost or runtime. Deduct separately counted AA components for each resource so overlapping evidence counts once. AA cost coverage does not establish runtime coverage.

Imputed quality, estimated resources, output-token runtime proxies, provider token prices, throughput, and latency do not satisfy this threshold. AA resource measurements remain attached to that index and never fill missing measurements for individual benchmarks.

![In this illustration without index support, four direct cost pairs permit Value; three time pairs leave Speed unavailable. Hollow marks are estimates and do not count toward either threshold.](assets/methodology/resource-publication-gate.svg)

A variant that qualifies on quality remains in the table with unavailable resource scores left blank. Raw prices and provider speed measurements remain available. Insufficient observed runtime measurements leave Speed blank even when Value is available.

Without Value, a variant is excluded from every graph, including quality-only graphs and the model signature. Collapsed graphs choose among eligible variants. The benchmark graph’s combined Speed-and-Value axis requires both scores; unavailable scores are never replaced with zero.

These requirements control which scores are displayed. All model observations remain in scoring calibration, and qualifying Speed and Value scores keep the calculation described above.

## Dashboard Comparisons

The dashboard uses the calculated scores to highlight trade-offs and compare reasoning efforts. These display rules do not change the headline scoring method.

### Selecting Highlighted Models

Highlighted models represent different Intelligence–Value trade-offs. Intelligence and Pareto roles use the highest-Intelligence variant; Best Agentic searches all efforts of visible models. Labels omit effort suffixes, but scores remain those of the selected variant.

The Pareto frontier contains models for which no other candidate is at least as good in both Intelligence and Value and strictly better in one. Its two highlighted roles apply explicit selection rules:

| Role | Selection rule |
| --- | --- |
| Pareto Balance | Largest Intelligence × Value product on the frontier, equivalent to the largest equal-weight geometric mean. This favors strength in both scores. Ties prefer higher Intelligence. |
| Pareto Value | Highest Value on the frontier among models strictly above the full published population’s median Intelligence. This focuses the role on more capable candidates. Ties prefer higher Intelligence. |

The median counts each base model with finite Intelligence and Value once, before dashboard filters. A model exactly at the median does not qualify for Pareto Value.

Pareto candidates follow model, provider, and price filters before rank and release-recency limits. The other signature roles use the displayed population.

Pareto Balance has no Intelligence cutoff. Token price does not select either Pareto role or represent measured cost per task. A model may fill multiple roles; a role is omitted if no candidate qualifies.

### Comparing Reasoning-Effort Curves

Compare reasoning efforts using measurements shared by the selected variants of each model. Build separate common benchmark sets for cost, time, and tokens so differences in which benchmarks were measured do not appear to be differences caused by reasoning effort.

![A benchmark missing a paired observation for one displayed variant is excluded from that model’s common benchmark set. Another model builds its own benchmark set independently.](assets/methodology/common-variant-basket.svg)

The selector includes individual benchmarks with results at several reasoning efforts, selected standalone AA components, and aggregate indexes labelled as comparison inputs. This selection does not change the scoring portfolio or remove other benchmarks from the table.

Each selected index uses its own quality result. Artificial Analysis pairs its Intelligence Index with its reported aggregate cost, runtime, and output-token measurements per task. Those resources stay attached to that index. Index-only views show native index points, not percentages.

Cost, Time, and Tokens each require their own paired observations. Token comparisons use the declared total or output-only measure; an incomplete input/output breakdown is not a total-token observation. Imputed resources affect scoring but do not appear as direct graph measurements. Effort-labelled rows use only indexes reporting that effort, currently AA.

Build each model’s comparison independently for cost, time, and tokens:

| Step | Rule |
| --- | --- |
| Baseline | Use selected indexes with paired quality and resource observations. |
| Benchmark inclusion | Include a benchmark only when every selected variant of that model has both its quality and resource measurement. |
| Axis calculation | Normalize each axis against the full reference population; calculate weighted means for both axes using the same observations and weights. |
| Weights | One per individual benchmark; represented benchmark count per index, currently ten for AA. |
| Overlap | Subtract one from AA’s weight for each matching component actually included as an individual benchmark. Excluded components and unrelated benchmarks do not reduce it. |
| No common benchmarks | Retain common index evidence alone; sparse benchmark observations cannot remove variants from the index baseline. |

The remaining index weights apply to both axes and the displayed index share; the index values stay unchanged. Headline capability scores use their separate [benchmark/index blend](#combining-benchmarks-and-aggregate-indexes), with individual benchmark weight rising to 80%.

Variants missing the selected index resource evidence are counted in the legend and can be compared by deselecting the indexes. Without an index that has both quality and the selected resource measurement, the graph uses common benchmarks across that model’s variants with selected resource observations. If no evidence is common, the comparison is empty.

Explicitly selecting one entry retains native units. A single common entry within a multi-entry selection stays on the normalized aggregate scale.

**Common within model** summarizes variant coverage and index-weight ranges. **Details** lists each model’s variants, common/selected counts, index share, included evidence, and excluded observations.

Each model has its own benchmark set, so distances between models are not comparisons on identical benchmarks. Changing models or selections can change these sets, but not normalization references. Overlapping benchmarks and indexes are not independent evidence; adding benchmarks does not guarantee better estimates.

The graphs preserve ties, decreases, and direction changes in the observations. They do not smooth results or force scores to rise with effort. Resource availability thresholds remain independent of common-benchmark counts. An observed index paired with its own resource measurement can satisfy the resource threshold through its represented benchmark count after deducting overlap. Graph selection does not change leaderboard scores.

Expanded graphs connect consecutive displayed efforts within each model, even when an axis reverses direction. The separate Pareto frontier line appears only in collapsed mode.

## Reference Notes

### Evidence for Updated Releases

A dated model replacement needs fresh evidence before results from the previous identity can be reused. Artificial Analysis and Vals must independently identify the same dated release suffix, and the matched catalog route must serve that release. Semantic versions remain separate identities.

Retain an observation only when at least one condition holds:

- Its value changed.
- Its source identifies the new release.
- Its observation date is newer than the previous result and no earlier than release.
- An earlier refresh already accepted it for the replacement.

A missing old value or a reputable source alone does not establish freshness. Replacement rows use accepted direct evidence without imputation from other benchmarks. Retained Artificial Analysis and Vals observations receive twice their ordinary weight, giving the sources that establish freshness more influence during the transition. Later refreshes apply the same checks.

## Parameter Choices

These values are scoring-policy choices, not fitted claims about model behavior.

| Parameter | Value | Why it exists |
| --- | ---: | --- |
| Dashboard inclusion benchmark count | Minimum known index benchmark count, excluding Epoch | Allows sufficient standalone or aggregate evidence to qualify, deducting known overlap without requiring a particular publisher. |
| Dashboard Intelligence and Agentic floor | Greater than 10 each | Excludes models whose quality scores are too low to be decision-relevant even when resource scores are high. |
| Quality regularization floor / full point | 10% / 100% of the median benchmark count represented by aggregate indexes | Reduces sparse high scores without increasing the penalty whenever the portfolio expands. |
| Other observed benchmarks required | 3 | Requires a broader basis than one or two benchmark results. |
| Held-out models for imputation from other benchmarks | 4 | Requires independent evidence beyond the minimum calibration set. |
| Maximum normalized imputation error | 25 points | Refuses predictors whose typical held-out error is too large to be useful; the evidence factor falls to zero at this boundary. |
| Quality imputation across efforts: common benchmarks | 3 | Requires directly shared benchmarks from the same base model; indexes and estimates do not count. |
| Broader resource evidence: minimum other models | 2 base models | Requires same-benchmark effort ratios from more than one model outside the target. |
| Broader resource evidence: release width | 60 days | Gives nearby releases more influence without a hard date cutoff. |
| Broader resource evidence: lab shrinkage | 16 | Limits the influence of a noisy lab correction. |
| Broader resource evidence: release/model shrinkage | 4 | Discounts sparse corrections without per-model tuning. |
| Resource ratios across efforts: benchmarks with paired measurements | 3 | Prevents ratios from one or two benchmarks from defining an effort conversion. |
| Resource ratios across efforts: log-error ceiling | $\log 2$ | Rejects ratios when typical held-out multiplicative error reaches a factor of two. |
| Resource ratios across efforts: score-error ceiling | 25 points | Rejects ratios with large typical errors in resource component scores. |
| Favorable-tail winsorization | 2.5% | Stops one exceptionally cheap or fast model from defining the useful score range. |
| Quality comparison width | $\sigma=0.5$ | Favors comparisons with similar quality without requiring exact benchmark-score ties. |
| Minimum quality spread | 0.35 log-odds units, or 35% of the observed linear range | Prevents small gaps in clustered results from being magnified; linear comparisons remain unchanged by unit conversions. |
| Local resource trend | Full peer support and interpolation only | Accounts for nearby quality differences while avoiding sparse fits and unsupported extrapolation. |
| Capability benchmark/index endpoint | 80% / 20% at the configured observed-benchmark threshold (currently 7.5) | Gives well-observed individual benchmarks more influence while retaining an index contribution. |
| Individual-benchmark weight transition | Cubic smoothstep from one to the configured threshold of 7.5 observed individual benchmarks | Avoids an abrupt change in individual benchmark weight when another observation arrives; no observed individual benchmarks means indexes alone. |
| Full comparison support | 3 effective models | Pulls weak peer comparisons toward neutral; three effective models end this adjustment without implying statistical certainty. |
| Agentic token modifier | ±15%, capped at two robust log-token spread units | Limits how much token efficiency can alter benchmark quality before remapping; the cap is a policy choice. |
