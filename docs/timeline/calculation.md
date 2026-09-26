# Timeline Calculation

The Intelligence Index connects benchmark generations to a saved scale, combines the available evidence, and converts the result into fixed display units. See the [Timeline overview](overview.md) for chart interpretation and limitations.

## Freeze the Initial Reference

Relative scores can move as models and benchmarks change. The Intelligence Index therefore establishes its reference once, using saved Model Atlas scores with at least 60% evidence support. Later leaderboard updates do not replace these reference values; older and future models connect through benchmark evidence instead. Less-supported starting scores retain their published positions but do not define the reference. Benchmark identities describe measurements and editions; refresh timestamps and portfolio weights do not create new identities. Retired benchmarks leave the active scoring portfolio while their evidence remains available for calibration.

![Solid points in the initial snapshot define the reference; points at 50% opacity have insufficient coverage, even when their scores fall outside the saved range. Older and future models connect through benchmark evidence without resetting the ruler. Positions are schematic.](../assets/timeline/timeline-reference-extension.svg)

## Connect Benchmark Generations

Models measured on shared benchmarks connect different benchmark generations, even when their units and difficulty levels differ.

All benchmark results use linear coordinates in their reported units. Equal metric improvements have equal distance, including at the endpoints; probability results remain valid from 0 through 1 without endpoint clipping. Benchmark links standardize each source using its own reference mean and spread, so unit conversions or subtracting a benchmark minimum do not change the linked result.

When fitting connections, probability results at or beyond the existing 2–98% saturation thresholds remain excluded from shared-model overlap. This is a fitting admission rule, not a nonlinear score transformation. Valid query results retain equal information weight throughout the range.

The mapping sets the standard score (z-score) on benchmark A equal to the standard score on benchmark B. Given $x_B$, it finds the corresponding $x_A$, or vice versa, by matching how many standard deviations each result lies above or below its benchmark's mean. If A is already connected to the reference scale, this lets results from B use the same ruler:

$$
\frac{x_A-\mu_A}{\sigma_A}=\frac{x_B-\mu_B}{\sigma_B}.
$$

Here, $\mu_A,\mu_B$ are the means and $\sigma_A,\sigma_B$ the standard deviations of reported results from models tested on both benchmarks. Each base model contributes one unit of weight across its reasoning configurations, so extra configurations do not give it extra influence. The translated value estimates a corresponding position on the other scale; it is not an observed benchmark result.

![50 is 10 above A's mean of 40; 80 is 20 above B's mean of 60. Each distance is one standard deviation, so both results have z-score +1. The distribution shapes are illustrative; the mapping does not require bell-shaped results.](../assets/timeline/timeline-standard-scores.svg)

### Validate the Benchmark Connection

Matching means and standard deviations produces a linear conversion between reported results; individual model results need not lie on that line. Leave-one-family-out cross-validation checks whether the approximation predicts accurately enough: leave out one family, fit on the others, then compare its predicted result with its actual result. All reasoning configurations of the withheld family stay together, so related variants cannot supply the answer indirectly.

![In this illustrative round, benchmark A result 65 predicts benchmark B result 75, while the withheld result is 80. The absolute error of 5 is 10% of the training B range, 30–80. Each round withholds a different family, including all its reasoning configurations; the plot shows one result per family.](../assets/timeline/timeline-validation.svg)

A connection needs at least four independent model families, positive correlation and nonzero spread. Validation repeats the holdout for every family and tests both directions, A → B and B → A. Each absolute prediction error is divided by the training results' range on the predicted benchmark and multiplied by 100. This makes errors comparable across benchmark units. The errors are summarized by a median for each direction, with equal total weight per family; they are normalized error points, not final index points.

The translation must be accurate enough and better than a simple guess. The baseline always predicts the median result of the training models. The larger of the two translation errors must be no more than 25 normalized error points and smaller than both baseline errors. For example, translation errors of 10 and 15 pass against baseline errors of 20 and 30, because 15 is below the 25-point limit and both baselines.

### Extend the Shared Scale

Accepted connections make comparison across eras possible. Suppose benchmark A already has a conversion to the fixed reference scale, and a new benchmark B shares tested models with A. A result from B can be translated to A's scale, then to the reference scale. If a later benchmark C overlaps B, the same chain connects C to the original ruler—even if no model was tested on both A and C. This works for older benchmarks too.

![Shared model results connect old, middle and new benchmarks to the same ruler. A future model needs results on a connected benchmark, not on every earlier benchmark. Estimated results never establish these connections.](../assets/timeline/timeline-benchmark-links.svg)

The accepted connections determine a saved conversion from each benchmark's own units to the shared reference units. Here, $x$ is a reported benchmark result and $q$ is its position on the shared reference scale, before results are combined and the final index anchors are applied. For model $m$, benchmark $b$ and capability dimension $d$, the conversion multiplies $x_{m,b}$ by a scale factor $a_{b,d}$ and adds an offset $c_{b,d}$:

$$
q_{m,b,d}=a_{b,d}x_{m,b}+c_{b,d},\qquad a_{b,d}>0.
$$

![The triangles show slope as rise divided by run: 10/20 = 0.5 on the left and 20/20 = 1 on the right. The y-intercepts, 10 and 30, are the outputs when the B result is zero. The right plot combines the B-to-A conversion with the illustrative saved A-to-reference conversion shown above it.](../assets/timeline/timeline-saved-conversion.svg)

Once saved, this conversion lets any model with a usable result on that benchmark reach the shared scale. Established conversions remain fixed as new benchmarks are added, preventing later generations from resetting the ruler. If no supported chain reaches the reference, the model remains unplaced; its release date cannot supply the missing evidence.

New scale factors and offsets are fitted jointly across the connected network using weighted least squares, while saved conversions stay fixed. Each connection is weighted by its independent model count multiplied by squared correlation, giving greater weight to broader, more closely related overlaps. Multiple routes constrain one saved conversion; they are not separate scoring votes. Disagreement between routes contributes to its diagnostic error.

## Weight the Evidence by Coverage

Individual benchmarks and published indexes enter one weighted mean on the shared historical scale. Each individual benchmark contributes 1.5 times its base weight. Each index contributes its base weight multiplied by represented benchmark breadth after known overlap deductions.

For model $m$ and dimension $d$, $q_{m,b}$ and $q_{m,k}$ are the calibrated individual-benchmark and index values. The base weight $w_{b,d}$ or $w_{k,d}$ combines importance and dimension allocation. Remaining index breadth $B_{m,k,d}$ follows the [overlap rules used by headline scores](../methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes). The estimate is:

$$
q_{m,d}=\frac{1.5\sum_b w_{b,d}q_{m,b}+\sum_k w_{k,d}B_{m,k,d}q_{m,k}}{1.5\sum_b w_{b,d}+\sum_k w_{k,d}B_{m,k,d}}.
$$

Each benchmark or index series contributes only its latest usable observed edition. A replacement must have both an observed result and a saved conversion before the older benchmark is dropped. Overlap deductions reduce represented weight while keeping the published index value intact. ECI uses fixed breadth 7.5 rather than a model-specific fitted count.

Adding unobserved benchmarks to the retained portfolio does not alter the relative influence of evidence already present. Benchmark coverage remains a diagnostic and support measure, but it no longer imposes a second category-level task/index blend.

With no usable individual benchmarks, indexes supply the entire estimate. Without a usable index, at least three distinct mapped benchmark series are required; otherwise the model remains unplaced. Imputed results do not satisfy these requirements. Existing published positions remain fixed.

## Apply the Dated-Successor Assumption

Older model releases often have sparse or uneven benchmark records, which can make a later version appear weaker simply because different evidence is available. To limit these apparent regressions when reconstructing historical scores, a dated successor is kept at least level with its highest-scoring predecessor in the same model and reasoning-effort series. Supported reference scores remain unchanged.

![The middle release has an evidence-based estimate of 116, below its predecessor's 120, so the assumption raises it to 120. The later estimate of 128 needs no adjustment. These are illustrative releases of the same model at the same reasoning effort.](../assets/timeline/timeline-successor.svg)

This is a historical reconstruction assumption, not evidence that every newer release improves. The rule applies to explicitly dated versions of the same canonical model family, provider and reasoning effort; it has no age cutoff. It can conceal a real decline, but never forces a positive improvement: a successor can tie its predecessor.

Undated names do not establish succession, and releases within the same month are not ordered. Missing estimates stay unplaced and supported reference values remain fixed. Any adjustment is recorded separately from the evidence-based estimate and included in its diagnostic error budget.

## Set Index Units with Fixed Anchors

The anchor values 100 and 150 are chosen for readability. Keeping them and their saved capability positions fixed preserves the same index unit as new models arrive. This final conversion changes the displayed numbers without changing model order or adding evidence.

![Changing the illustrative anchors from 20/80 to 100/150 shifts the origin and shrinks every score gap by the same proportion: the 60-point anchor gap becomes 50. Model order and evidence stay unchanged. Dashed curves illustrate selected record highs.](../assets/timeline/timeline-anchors.svg)

The saved positions $q_{L,d}$ for GPT-4 (March 2023) and $q_{H,d}$ for Claude Opus 4.5 map to index scores of 100 and 150. The model's relative position between the anchors is the same on both scales:

$$
\frac{s_{m,d}-100}{150-100}=\frac{q_{m,d}-q_{L,d}}{q_{H,d}-q_{L,d}}.
$$

Here, $q_{m,d}$ is the capability estimate and $s_{m,d}$ is the displayed index score. The scale extends beyond the anchors without an upper limit; its values are not percentages or ratios of capability.

The saved anchor positions remain fixed; updating them would rescale every model. Positive linear rescaling preserves ordering and ratios of score differences. The stored capability coordinate is independent of the provisional display units. Anchors set the published units; they do not add evidence or refit benchmark connections.
