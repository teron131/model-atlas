# Timeline

## Introduction

The Intelligence Index places models from different generations on one fixed scale, so a model released years ago can be compared with one released today even though no benchmark measured both. It combines observed benchmark results with published aggregate indexes, an approach taken from the [Epoch Capabilities Index (ECI)](https://epoch.ai/eci). It is Model Atlas's own index: the Artificial Analysis Intelligence Index is one of the aggregate indexes it reads, and the leaderboard's :score[Intelligence] is a separate score. Its scores order models and size the gaps between them; they are neither benchmark success rates nor ratios of capability.

The index reads the observed results behind the leaderboard's [relative scores](../methodology/overview.md), together with archived source records, and returns nothing, so it changes no leaderboard score or [dashboard inclusion](../methodology/leaderboard-rules.md#dashboard-inclusion) decision. Only Intelligence has an index; :score[Agentic] exists only as a relative leaderboard score.

The fixed scale is the reference scale. It is defined by the leaderboard's :score[Intelligence] scores as they stood at one refresh, saved once and never updated. Benchmark results are converted to that scale, which is how a model the saved scores never included still receives a position on it.

Reference-scale points are an internal unit. Two [fixed anchors](calculation.md#set-index-units-with-fixed-anchors) set the displayed units: the saved reference-scale positions of GPT-4 (March 2023) and Claude Opus 4.5 read 100 and 150.

## From Evidence to Index

A benchmark joins the reference scale through a conversion, a line from its reported units to reference-scale points, fitted on the models it shares with benchmarks already on the scale. Overlapping benchmarks therefore chain older and newer generations to the same scale, and a benchmark with no chain to it places no model.

A model's position on the reference scale is calculated again at every refresh in which the model appears, from its own observed results, so a result that arrives or is corrected after release reaches its score. A model absent from a refresh keeps its last position, and the two anchor models always keep the positions that define the units. Each variant is placed separately; base model, variant, observed result, estimate, and aggregate index have the meanings given in the methodology's [Key Terms](../methodology/overview.md#key-terms).

> [!FLOW]
>
> 1. **Match the records**
>
>    Assign each source record to its model release, reasoning effort, and benchmark version, keeping distinct ones apart.
>
> 2. **[Freeze the initial reference](calculation.md#freeze-the-initial-reference)**
>
>    Take the reference scale from the saved leaderboard scores that had at least 60% of the leaderboard's [evidence support](../methodology/intelligence-agentic.md#evidence-support).
>
> 3. **[Connect benchmark generations](calculation.md#connect-benchmark-generations)**
>
>    Convert each benchmark's results to the reference scale through the models it shares with benchmarks already connected, and keep every saved conversion fixed at later refreshes.
>
> 4. **[Combine the evidence](calculation.md#combine-the-evidence)**
>
>    Place each variant at one [weighted mean](../methodology/operations.md#weighted-mean) of its converted benchmark and index results, with each index weighted by its remaining [represented breadth](../methodology/intelligence-agentic.md#represented-breadth-and-overlap), the number of benchmarks it stands for less those already counted.
>
> 5. **[Apply the dated-successor assumption](calculation.md#apply-the-dated-successor-assumption)**
>
>    Keep a later dated release at least level with earlier releases of the same model at the same reasoning effort.
>
> 6. **[Set index units with fixed anchors](calculation.md#set-index-units-with-fixed-anchors)**
>
>    Read the two saved anchor positions as 100 and 150.

Most placed variants also carry a [typical miss](calculation.md#estimate-the-typical-miss), a checked measure of how far a position may lie from where more benchmarks would put it. [Calculation](calculation.md) gives the equations, the connection checks, and the rules for which results count.

## Reading the Chart

The chart plots Intelligence Index scores against release dates, one point per base model. A point's look does not show its evidence support or whether indexes alone place it. A pointed model's readout line gives its score, release date, and [Timeline evidence support](#evidence-support), and says “index only” when aggregate indexes alone place it.

The chart always starts at GPT-4's March 2023 release. It always leaves out scores below 70, models without a release date, and OpenAI Pro, Gemini Deep Think, and Claude Mythos models, the groups the leaderboard also [hides](../methodology/leaderboard-rules.md#hidden-model-groups). Leaving a model off the chart changes neither its score nor any other model's.

### Evidence Support

The Timeline's evidence support says how much evidence backs a position and decides which models can set a frontier record. It is not the leaderboard's [evidence support](../methodology/intelligence-agentic.md#evidence-support), which is a share of the leaderboard's benchmark portfolio. The Timeline's quantity is the largest of up to four shares, never their sum:

- The leaderboard evidence support saved with the model's reference score, when the model has one.
- A share from the benchmarks that place the model, counted by their [effective count](../methodology/operations.md#effective-count): the number of equally weighted benchmarks that would spread influence as widely.
- A share from the [represented breadth](../methodology/intelligence-agentic.md#represented-breadth-and-overlap) of one index that places the model.
- For an index the model was observed on whose components are known, the share of those components' base weight that the model itself has results on. This applies when the model has results on at least three of them.

A count or breadth becomes a share along the [smoothstep curve](../methodology/operations.md#smoothstep): zero up to 0.8 benchmarks, rising to 100% at eight. The Timeline's evidence support takes no part in the position itself.

The frontier is the run of record-high scores in release order. Only a model with at least 60% Timeline evidence support can set a record, and a supported model that equals the standing record at the readout's one-decimal precision also sits on the frontier.

### Representative Variant

One representative variant stands for each base model, chosen by the first rule that applies:

1. When the leaderboard lists any placed variant of the base model, the representative is the listed variant with the highest :score[Intelligence]. The chart and the table then name the same reasoning effort, and a sparsely measured effort the leaderboard leaves out cannot stand for the model.
2. Otherwise, when any placed variant appears in the latest refresh, it is the one of those with the highest Intelligence Index score.
3. Otherwise it is the placed variant with the highest Intelligence Index score.

### Evidence Panel

Below the chart, the evidence panel draws one thread per benchmark or index across the release dates of the charted models it measured; all versions of one benchmark or index share a thread. A pointed thread's readout counts the predictions of that benchmark from other benchmarks and indexes that were tested on held-out models and how many were accepted, and it gives the smallest accepted error beside the error of a guess at the median, both on the [validation](calculation.md#validate-the-connection) scale. Beneath the threads, a second plot marks each model at its release date and, on the vertical axis, its typical miss in reference-scale points. Models without a typical miss sit in a row of their own below it. A picked model also gets a table of its results. Observed results are listed with the benchmarks each passes through to reach the reference scale. Estimated results are listed too, though they never place a model or connect benchmarks.

## Uncertainty and Limitations

Fixed anchors preserve the units, not the accuracy of every position. Errors can add up along a chain of conversions, and a conversion is less reliable beyond the range of results it was fitted on. A new benchmark may also test abilities the connecting models never showed, so passing validation on shared models does not establish how well the connection carries over to later ones.

The Timeline's evidence support is not a probability that a score is correct. A typical miss is a checked median, not a confidence interval: half of the results held out in its check fall within it. The check leaves out each benchmark in turn, which shows only how a model's benchmarks disagree with each other. An error they all share, such as a drift in the one conversion that carries a whole era, never appears, so the typical miss understates it. Small score differences can therefore be inconclusive even when every connection involved passed validation.

A connection's [validation error](calculation.md#validate-the-connection) and a model's typical miss are different quantities. The first is a percentage of the predicted benchmark's range among the training models and tests a single conversion; the second is in reference-scale points and tests a combined position. Neither measures distance from true capability, and agreement with a publisher's index does not establish it.

The [dated-successor assumption](calculation.md#apply-the-dated-successor-assumption) can hide a real decline between releases.

## Parameter Choices

These values are policy choices, not fitted claims about model behavior. [Calculation](calculation.md#parameter-choices) lists the ones behind a position.

| Parameter | Value | Why it exists |
| --- | ---: | --- |
| Count or breadth for Timeline evidence support | 0.8 to 8 benchmarks | Gives less than one benchmark's worth of evidence no support and treats eight as full support. |
| Observed components for an index's component share | 3 | Keeps one or two components from standing for an index. |
| Timeline evidence support to set a record | 60% | Keeps a thinly measured model from setting the frontier. |
| Lowest score on the chart | 70 | Starts the chart below the first anchor's 100 without drawing scores far under it. |
