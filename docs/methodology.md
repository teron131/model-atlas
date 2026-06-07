# Model Atlas Methodology

## Purpose

This project is trying to build the best current version of my opinionated LLM ranking. It starts from Artificial Analysis because AA is the best benchmark aggregation source I have found so far, but the point is not to mirror AA exactly. The point is to keep the parts of AA and related provider data that help separate current models in a subjectively meaningful way.

The ranking is not an average of everything available upstream. Many benchmarks are low-signal for this purpose: some are saturated, some are stale, some are noisy, and some reward capabilities that do not matter much for the downstream model choices I care about. A benchmark only belongs here if it still creates a useful relative ordering among current models.

The implementation keeps the main knobs in `src/model-atlas/constants.ts`, with scoring math under `src/model-atlas/llm/llm-stats/scores/`: selected intelligence benchmarks, selected agentic benchmarks, task/chat/agentic price profiles, workflow simulation profiles, speed anchors, and overall score weights.

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

`omniscience_nonhallucination_rate` remains available as a diagnostic reliability field, but it is not selected for intelligence scoring because it can reward abstention behavior rather than raw knowledge.

The agentic group is meant to capture whether a model is useful inside workflows. In practice this is roughly tool usage, instruction following, self-verification, reliability under constraints, harness/tool execution, and work-like task completion. The current configured agentic keys are:

- `gdpval_normalized`
- `terminalbench_hard`
- `ifbench`
- `apex_agents`
- `deep_swe`
- `terminal_bench_2`

There is no standalone coding score in the current ranking. AA `scicode` is treated as structured code-generation/problem-solving evidence under intelligence. DeepSWE, AA `terminalbench_hard`, and standalone Terminal-Bench 2.0 remain agentic.

Value and speed are secondary. They still matter because downstream applications have budgets and latency constraints, and they now have enough eval-derived signal to act as practical utility components without overtaking quality.

## Source Roles

Artificial Analysis is the primary benchmark source: https://artificialanalysis.ai/leaderboards/models. It provides the broad indexes, benchmark fields, model names, slugs, release information, and scraped intelligence/evaluation data. The scraper path matters because some fields are easier to recover there than through the API path.

Artificial Analysis reference pages:

- https://artificialanalysis.ai/methodology for scope, source terminology, and glossary definitions.
- https://artificialanalysis.ai/methodology/intelligence-benchmarking for the Intelligence Index methodology and benchmark descriptions.

OpenRouter provider/model ids are the preferred public model ids after matching. AA slugs are useful source identifiers and benchmark provenance, but the public stats payload should use the OpenRouter route id when one is available because that is the id used for current route pricing, speed, and user-facing model selection.

`models.dev` is used as catalog metadata after matching: https://models.dev/. It supplies model family, modalities, context, cost, release information, and fallback provider ids, but it no longer overrides the public OpenRouter id when the matched route is known.

OpenRouter is used after matching for public identity, speed, and weighted pricing from each model page's Performance tab. It should improve cost and latency estimates and anchor the final provider/model id, but it still should not decide which AA benchmark row supplies the score.

DeepSWE is fetched separately from https://deepswe.datacurve.ai/artifacts/leaderboard-live.json and joined by normalized model name after the AA-to-models.dev match. The selected key for this standalone source is `deep_swe`, using the best `pass_at_1` configuration for each model. It is multiplied by $2$ in the selected agentic benchmark average, preserving the explicit double-weight policy without duplicating the field. Missing DeepSWE values are filled with the observed DeepSWE minimum for scoring only; the public source field still stays absent when no match exists.

Terminal-Bench 2.0 is fetched separately from https://www.tbench.ai/leaderboard/terminal-bench/2.0 and joined by normalized model name after the AA-to-models.dev match. The selected key for this standalone source is `terminal_bench_2`. It uses `max(median_accuracy, mean_accuracy)` across agent/model rows, so multiple harness attempts can slightly help when they improve the aggregate signal without adding a direct frequency bonus. This is intentionally separate from AA's `terminalbench_hard` field. Both are selected agentic benchmarks because they are different signals.

The pipeline shape is:

1. Fetch AA scraper/API data, `models.dev` data, standalone DeepSWE data, and standalone Terminal-Bench 2.0 data.
2. Match AA rows to canonical model identities.
3. Join standalone DeepSWE and Terminal-Bench 2.0 scores to matched rows when model labels line up.
4. Enrich matched rows with OpenRouter speed and pricing.
5. Compute raw `scores`.
6. Normalize into `relative_scores`.
7. Filter low-signal rows, sort, and prune sparse fields.

This staging is important because it keeps benchmark source truth, identity matching, economic enrichment, and ranking math separate enough to debug. The model-id matching details are in `docs/matching.md`.

The SQLite database at `.cache/database.sqlite` is the cache and derived-stage store. Raw source inputs are cacheable daily, while matched, enriched, and final score rows are rebuilt from the current runtime inputs so score calculations stay separated from source refresh policy.

The Next.js app can serve a stored payload from Vercel Blob, `MODEL_ATLAS_SNAPSHOT_URL`, or `public/model-atlas-snapshot.json`. Stored snapshots preserve model rows and scores from the snapshot, but scoring metadata such as selected benchmark keys, score weights, price profiles, and column tooltips is overlaid from the current `src/model-atlas/constants.ts` when the snapshot is read. That keeps explanatory UI text aligned with the current scoring configuration even when the data rows come from an older snapshot. The static minimal UI served by `pnpm run atlas:ui:static` refreshes `/api/llm-stats` through the local dev server, which rebuilds the SQLite payload.

## Scoring Shape

The scoring pipeline is:

$$
\text{raw source fields}\rightarrow\text{benchmark-relative quality fields}\rightarrow(I_m,A_m)\rightarrow\text{percentile-ranked Speed/Value}\rightarrow O_m
$$

Quality is normalized before averaging. Economics and time are percentile-ranked after converting raw costs or seconds into "higher is better" components.

AA's `coding_index` is also preserved as source data under the public `intelligence` object when upstream provides it. It is not used to compute any score, and there is no public `coding_score`.

## Math Mapping Details

Notation:

$$
\begin{aligned}
m&=\text{model}\\
b&=\text{benchmark or AA index field}\\
x_{m,b}&=\text{raw value for model }m\text{ on field }b\\
x_{\min,b}&=\min_m x_{m,b}\\
x_{\max,b}&=\max_m x_{m,b}\\
r(y)&=\operatorname{percentileRank}(y)
\end{aligned}
$$

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

In the dashboard tooltip, DeepSWE is shown last for readability; that display order does not change the scoring weight.

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

Missing benchmark values are scoring-only. Public source fields stay `null`.

Missing DeepSWE:

$$
x_{m,\text{DeepSWE}}=\min_j x_{j,\text{DeepSWE}}
$$

Other missing benchmarks:

$$
C_{m,b}=\operatorname{mean}\left(z_{m,k}:k\in D,k\neq b,z_{m,k}\text{ available}\right)
$$

$$
\hat{x}_{m,b}=\operatorname{quantile}\left(\{x_{j,b}:x_{j,b}\text{ observed}\},\frac{\operatorname{percentileRank}(C_{m,b})}{100}\right)
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
V_{\text{AA cost},m}&=r\left(\frac{1}{\text{AA task cost}_m}\right)\\
V_{\text{AA efficiency},m}&=r\left(\frac{I_m}{\text{AA task cost}_m}\right)\\
V_{\text{DeepSWE cost},m}&=r\left(\frac{1}{\text{DeepSWE task cost}_m}\right)\\
V_{\text{blend cheapness},m}&=r\left(\frac{1}{\text{blended price}_m}\right)\\
Q_m&=\operatorname{mean}(I_m,A_m)\\
V_{\text{quality blend},m}&=r\left(\frac{Q_m}{\text{blended price}_m}\right)\\
V_{\text{workflow},m}&=r\left(\text{workflow useful work per dollar}_m\right)
\end{aligned}
$$

$$
V_m=\operatorname{mean}_{\text{finite}}\left(V_{\text{AA cost},m},V_{\text{AA efficiency},m},V_{\text{DeepSWE cost},m},V_{\text{blend cheapness},m},V_{\text{quality blend},m},V_{\text{workflow},m}\right)
$$

Displayed Value requires at least two finite components. If fewer than two Value components exist, the displayed Value is `null` and Overall uses the scoring-only missing-Value imputation.

Raw speed diagnostics:

$$
g_m(t)=\frac{t}{\ell_m+t/\tau_m}
$$

where $\ell_m$ is latency and $\tau_m$ is throughput.

$$
\text{observed speed}_m=\frac{\operatorname{median}(\text{anchors})}{\text{end-to-end latency}_m}
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
S_{\text{AA},m}&=r\left(\frac{1}{\text{AA task seconds}_m}\right)\\
S_{\text{DeepSWE},m}&=r\left(\frac{1}{\text{DeepSWE task seconds}_m}\right)\\
S_{\text{Simulation},m}&=r\left(\frac{1}{\text{Simulation seconds}_m}\right)
\end{aligned}
$$

$$
S_m=\operatorname{mean}_{\text{finite}}\left(S_{\text{AA},m},S_{\text{DeepSWE},m},S_{\text{Simulation},m}\right)
$$

Displayed Speed requires at least two finite components. If fewer than two Speed components exist, the displayed Speed is `null` and Overall uses the scoring-only missing-Speed imputation.

Simulation seconds:

$$
\begin{aligned}
T_{\text{scenario},m}&=n_s\cdot\left(\ell_m+\lambda \operatorname{ELogUniform}(x_{\text{input},s})+\frac{\operatorname{ELogUniform}(x_{\text{output},s})}{\tau_m}\right)\\
T_{\text{Simulation},m}&=\sum_s w_sT_{\text{scenario},m}
\end{aligned}
$$

where $\ell_m$ is latency, $\tau_m$ is output throughput, $n_s$ is call count, and $\lambda=0.0001$ seconds per input token is the explicit input-token friction used when no reliable per-model prefill throughput is available.

Input and output token counts use the expected value of a log-uniform range:

$$
\operatorname{ELogUniform}(a,b)=\frac{b-a}{\log b-\log a}
$$

The scenario mix is:

- Micro: 15%, 1 call, input `500..3000`, output `1..50`
- Refine/translate: 15%, 1 call, input `500..20000`, output `500..20000`
- Extract/structure: 15%, 1 call, input `3000..20000`, output `100..1200`
- Chat/reasoning: 20%, 4 calls, input `1000..12000`, output `300..2000`
- Long synthesis: 15%, 1 call, input `20000..80000`, output `1500..6000`
- Agentic loop: 20%, 8 calls, input `8000..60000`, output `500..4000`

Workflow Value uses the same scenario mix, but each scenario contributes useful work per dollar:

$$
U_{m,s}=\frac{\operatorname{smoothstep}\left(\frac{q_{m,s}}{q_{\text{full},s}}\right)}{\text{scenario cost}_{m,s}}
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
p_{Q,m}&=\operatorname{percentileRank}(Q_m)\\
\alpha_V&=0.5\\
p_{V,m}&=50-\alpha_V(p_{Q,m}-50)
\end{aligned}
$$

$$
V_m^{\text{imputed}}=\operatorname{quantile}\left(\{V_j:V_j\text{ observed}\},\frac{p_{V,m}}{100}\right)
$$

Displayed Speed and Value stay `null` when source evidence is missing. This imputation is used only inside Overall.

$$
O_m=0.35I_m+0.25A_m+0.20S_m^{*}+0.20V_m^{*}
$$

Here $S_m^{*}$ and $V_m^{*}$ are the displayed score when present, otherwise the scoring-only imputed score.

## Final Filtering And Ordering

The final list requires enough signal after relative scoring: `overall_score`, `intelligence_score`, and `agentic_score` must each exist and be at least `10`.

The final payload and dashboard default sort are relative Intelligence first. Overall is a practical utility score, not the default ranking key.
