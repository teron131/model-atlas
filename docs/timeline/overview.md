# Timeline

## Introduction

Inspired by the [Epoch Capabilities Index (ECI)](https://epoch.ai/eci), the Intelligence Index combines retained benchmark results and published indexes to estimate Intelligence across model generations. Its scores support comparisons between models, but are neither benchmark success rates nor ratios of capability: 150 does not mean 50% more capable than 100. The index is separate from the leaderboard’s [relative scores](../methodology/overview.md) and is currently shown on the Timeline chart. Its display units remain provisional.

The [fixed anchors](calculation.md#set-index-units-with-fixed-anchors) assign saved positions for GPT-4 (March 2023) and Claude Opus 4.5 index scores of 100 and 150 for Intelligence.

## From Evidence to Index

The framework establishes a fixed reference from an initial snapshot of supported scores, uses retained evidence to place older models, and extends forward as new results arrive. Models measured on overlapping benchmarks connect these generations to the same scale; future models need a supported connection before they can be placed. Published positions and benchmark mappings stay fixed across ordinary refreshes. Newly supported configurations are appended; diagnostics and evidence coverage continue to reflect incoming results.

> [!FLOW]
>
> 1. **Preprocess the data**
>
>    Reconcile source names and match records without merging distinct model releases, reasoning settings or benchmark editions.
>
> 2. **[Freeze the initial reference](calculation.md#freeze-the-initial-reference)**
>
>    Establish the reference once from a saved snapshot of supported scores, then reuse it instead of later relative leaderboard scores.
>
> 3. **[Connect benchmark generations](calculation.md#connect-benchmark-generations)**
>
>    Link older and newly introduced benchmarks through shared model results, placing past and future models on the same scale while keeping published mappings fixed.
>
> 4. **[Weight the evidence by coverage](calculation.md#weight-the-evidence-by-coverage)**
>
>    Combine individual benchmark results and published indexes in one weighted mean, with index weights reflecting represented benchmark breadth.
>
> 5. **[Apply the dated-successor assumption](calculation.md#apply-the-dated-successor-assumption)**
>
>    Limit apparent regressions when reconstructing older releases from uneven evidence by keeping dated successors at least level with earlier versions in the same model and effort series.
>
> 6. **[Set index units with fixed anchors](calculation.md#set-index-units-with-fixed-anchors)**
>
>    Assign the saved GPT-4 (March 2023) and Claude Opus 4.5 positions values of 100 and 150, preserving the unit as new models arrive.

The published index uses Intelligence relevance weights. Agentic remains a relative leaderboard score.

Read [Calculation](calculation.md) for the equations, benchmark connection checks, and evidence-weighting rules.

## Coverage and Visibility

The chart shows evidence support alongside capability so a sparsely supported estimate does not appear as reliable as a well-supported one. Point opacity shows that support, and the frontier requires at least 60% support in the selected dimension:

| Chart feature | Meaning |
| --- | --- |
| Filled point | A supported reference or task-supported estimate. |
| Outlined point | An index-only estimate. |
| Fainter point | Less evidence support. |
| Frontier | Successive record-high scores with at least 60% support in the selected dimension. |

The task coverage used for blending and the support used for frontier eligibility are different measures. Frontier support takes the strongest available support from saved reference evidence, direct tasks or eligible index breadth; overlapping sources are not added together to inflate it.

Each model family uses one representative Intelligence configuration. Selection prefers current configurations ranked by their saved main-leaderboard Intelligence scores; historical-only families use their strongest available Intelligence Index estimate. Every configuration retains its own measurements and score. The default chart starts with GPT-4's March 2023 release and hides scores below 70.

The default view emphasizes broadly impactful model progress. It excludes OpenAI Pro configurations, Gemini Deep Think and Claude Mythos because of their specialized resourcing, operating policies or assets. Ordinary Gemini Pro models and other high-reasoning configurations remain eligible. Visibility rules, search, dates and lab filters apply after scoring: hiding a model changes neither its score nor the calibration of other models.

## Evidence and Validation Maps

The evidence map shows what supports each model's estimate. The validation map shows whether other benchmark results can predict a missing result accurately enough to be useful.

| Map | Rows | Columns | What the colors show |
| --- | --- | --- | --- |
| Evidence | Models | Benchmark editions | Results used in the estimate, other observations, inferred results or missing evidence. |
| Validation | Target benchmarks | Input combinations | Normalized prediction error; brighter means higher error, and empty cells have no validation result. |

Read prediction error together with baseline error and the number of validation models: a small error is more useful when it improves on a simple guess and is supported by several independent models. “Accepted” means the predictor passed those checks. Inferred cells remain estimates; they do not become observations or establish benchmark connections.

## Uncertainty and Limitations

Fixed anchors preserve the numerical scale, not the accuracy of every estimate. Errors can accumulate along benchmark chains, and predictions beyond the observed overlap are less reliable. A new benchmark may test abilities absent from the connecting models, so past validation cannot establish how well that connection will transfer.

| Diagnostic | What it measures |
| --- | --- |
| Evidence support | How much usable evidence backs the estimate. |
| Predictor acceptance | Whether withheld-result predictions pass the error and baseline checks. |
| Transfer-error budget | An estimate's accumulated transfer errors and disagreement between routes. |

Benchmark prediction error and final model-score error answer different questions. The first tests a conversion between benchmarks; the second tests the combined estimate against a withheld model reference. Their units and evaluation populations must be stated before the numbers can be compared. Agreement with a saved reference or publisher index does not establish true capability.

Evidence support is not a probability that a score is correct, and transfer-error budgets are not statistical confidence intervals. Multiple paths can share the same observations, so they do not create independent evidence. Small score differences may therefore be inconclusive even when the relevant connections pass validation. Models without a supported connection remain unplaced.
