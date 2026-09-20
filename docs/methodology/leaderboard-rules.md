# Leaderboard Rules

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

![In this illustration without index support, four direct cost pairs permit Value; three time pairs leave Speed unavailable. Hollow marks are estimates and do not count toward either threshold.](../assets/methodology/resource-publication-gate.svg)

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

![A benchmark missing a paired observation for one displayed variant is excluded from that model’s common benchmark set. Another model builds its own benchmark set independently.](../assets/methodology/common-variant-basket.svg)

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

The remaining index weights apply to both axes and the displayed index share; the index values stay unchanged. Headline capability scores use their separate [benchmark/index blend](intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes), with individual benchmark weight rising to 80%.

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
