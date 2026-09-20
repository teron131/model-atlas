# Methodology

## What Model Atlas Measures

Model Atlas turns benchmark results, token use, prices, and runtimes into four separate 0-100 scores. Intelligence and Agentic describe capability; Speed and Value describe the resources used to deliver it. This overview explains how to read the scores; the detailed pages follow each calculation, including what happens when evidence is missing.

**A benchmark** defines the evaluation, its methodology, and how results are scored. **A task** is one execution of work within a benchmark, following that methodology rather than defining its own. Resources **per task** describe the cost, time, or tokens for that execution, using the source’s reported task unit. An **aggregate index** combines results from multiple benchmarks.

Benchmark, reasoning-effort, and resource coverage is uneven. **Imputation** fills supported gaps using relationships across observed results; [source crosswalks](imputation.md#source-crosswalk-imputation) combine comparable sources without assuming either is better.

The detailed pages describe the current method and its equations. [Benchmarks](benchmarks.md) records the selected inputs and their source policies, while [Standards](standards.md) explains how those inputs earn a place. The [dashboard inclusion rules](leaderboard-rules.md#dashboard-inclusion) determine which scored models appear on the leaderboard.

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

**Imputed values help estimate scores; they never count as direct evidence.** Observations alone establish reference scales and satisfy inclusion and resource-availability requirements. [Benchmark imputation](imputation.md#benchmark-imputation) and [resource imputation](imputation.md#resource-imputation-across-reasoning-efforts) explain how estimates enter scoring and how their support is assessed.

![Imputation fills missing values with estimates.](assets/methodology/imputation-overview.svg)

## Read the Detailed Method

The diagram groups the main sections by page. Branches show where to find an explanation, rather than the order in which every calculation runs.

> [!MAP]
>
> [Methodology overview](methodology.md)
>
> - [Intelligence and Agentic](intelligence-agentic.md)
>   - [Normalize scores and assign weights](intelligence-agentic.md#benchmark-scores-and-dimension-weights)
>   - [Balance the reference population](intelligence-agentic.md#balancing-the-reference-population)
>   - [Agentic token efficiency](intelligence-agentic.md#agentic-token-efficiency)
>   - [Evidence support and regularization](intelligence-agentic.md#evidence-support-and-quality-regularization)
>   - [Combine benchmarks and indexes](intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes)
> - [Missing Data and Imputation](imputation.md)
>   - [Source crosswalks](imputation.md#source-crosswalk-imputation)
>   - [From other observed benchmarks](imputation.md#imputation-from-other-observed-benchmarks)
>   - [Across reasoning efforts](imputation.md#imputation-across-reasoning-efforts)
>   - [Resource estimates across efforts](imputation.md#resource-imputation-across-reasoning-efforts)
>   - [Resource estimates from broader evidence](imputation.md#resource-imputation-from-broader-evidence)
> - [Speed and Value](speed-value.md)
>   - [Token prices](speed-value.md#blended-token-price)
>   - [Provider speed](speed-value.md#provider-speed)
>   - [Resources per task](speed-value.md#quality-adjusted-resources-per-task)
>   - [Resource comparability](speed-value.md#resource-comparability-across-sources)
>   - [Similar-quality peers](speed-value.md#comparable-quality-peers)
>   - [Comparison support](speed-value.md#comparison-support)
>   - [Expected resource use](speed-value.md#expected-resource-use)
>   - [Resource efficiency](speed-value.md#resource-efficiency-score)
>   - [Combine components](speed-value.md#combining-speed-and-value-components)
> - [Leaderboard Rules](leaderboard-rules.md)
>   - [Model inclusion](leaderboard-rules.md#dashboard-inclusion)
>   - [Resource-score availability](leaderboard-rules.md#resource-score-availability)
>   - [Highlighted models](leaderboard-rules.md#selecting-highlighted-models)
>   - [Reasoning-effort comparisons](leaderboard-rules.md#comparing-reasoning-effort-curves)
>   - [Updated releases](leaderboard-rules.md#evidence-for-updated-releases)

<!-- Separate the reference map from the calculation map. -->

> [!MAP]
>
> Reference pages
>
> - [Standards](standards.md)
>   - Evidence requirements and benchmark review
> - [Benchmark Portfolio](benchmarks.md)
>   - Selected inputs, weights, and source policies
> - [Model Matching](matching.md)
>   - Model identity and reasoning-effort variants
> - [Timeline](timeline.md)
>   - Historical comparison on a saved scale

## Parameter Choices

Scoring-policy parameters are listed with the calculations they control: [capability scores](intelligence-agentic.md#parameter-choices), [imputation](imputation.md#parameter-choices), [resource scores](speed-value.md#parameter-choices), and [leaderboard inclusion](leaderboard-rules.md#parameter-choices).
