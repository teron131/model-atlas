# Model Atlas

Model Atlas turns benchmark results, token use, prices, and runtimes into four separate 0–100 scores for language models. Intelligence and Agentic describe capability; Speed and Value describe resource efficiency, responsiveness, and affordability. Its benchmark portfolio favors difficult, consequential tasks with credible grading that still separate current leading models.

See it live at [llmstats.vercel.app](https://llmstats.vercel.app), or read the same data from the public API at `/api/llm-stats`.

| Score | What it measures |
| --- | --- |
| Intelligence | Solving difficult problems using knowledge, perception, understanding, abstract reasoning, and judgment. |
| Agentic | Reliably turning goals and specifications into working results through instruction following, planning, coding, tool use, verification, and recovery. |
| Speed | Completing work quickly at comparable quality, with fast token generation, low first-token latency, and short total response times. |
| Value | Delivering comparable-quality work at lower cost, combining cost per task with token prices assessed for affordability and efficiency at comparable capability. |

Every model is scored separately at each reasoning effort, and each model's weight is shared across its efforts, so reporting more efforts gives it no extra say. Sources cover different models, and labs publish only some efforts. A missing result is [estimated from another effort of the same model](https://llmstats.vercel.app/methodology/imputation#imputation-across-reasoning-efforts), shifted by their gap on shared benchmarks, or from the model's standing on its other benchmarks when held-out tests show that prediction works. Estimates shape scores but never count as direct evidence: a model is listed only once enough of its benchmark results are observed.

Scores are relative: each benchmark maps its weakest observed result to 0 and its strongest to 100, so 100 means the strongest current result, not perfect task completion. Intelligence also draws on head-to-head comparisons on the benchmarks each pair of models shares, and Agentic gives a bounded bonus for using fewer tokens than expected at that quality, or a penalty for using more. Speed and Value compare time and cost per task with [models of similar quality](https://llmstats.vercel.app/methodology/speed-value#similar-quality-peers), so a cheap model that achieves less does not win Value. All four scores are discounted where evidence is thin, and the [Trust Me Bro and Slop Indexes](https://llmstats.vercel.app/methodology/intelligence-agentic#trust-me-bro-and-slop-indexes) nudge Intelligence, within a small limit, where community experience contradicts the benchmarks.

The [methodology](https://llmstats.vercel.app/methodology) explains how the scores are calculated, and the [benchmark portfolio](https://llmstats.vercel.app/methodology/benchmarks) lists the benchmarks behind them.

![How Model Atlas turns observed results into four scores: every model at every reasoning effort, gaps estimated but never counted as evidence, then two paths to Intelligence and Agentic and to Speed and Value](.github/assets/methodology.svg)

[![The Model Atlas dashboard's first screen](.github/assets/hero.jpg)](https://llmstats.vercel.app)

![The leaderboard's Scores view with the four scores, aggregate indexes, and community index places](.github/assets/leaderboard.jpg)

![The Pareto graph of Intelligence against relative task cost, plotting every reasoning-effort variant under the frontier no other model beats on both](.github/assets/pareto.jpg)

![The Timeline graph of the Intelligence Index by release date, with the frontier across model generations](.github/assets/timeline.jpg)

## Public API

Each endpoint returns one slice of the current data as JSON.

| Endpoint | Returns |
| --- | --- |
| `/api/llm-stats` | Each listed model's rank and four scores; add `?efforts=all` for one ranked row per reasoning effort, as in the leaderboard's Variants view |
| `/api/llm-stats/models` | The ranked table: release date, modalities, prices, context window, speed, scores, and resource ratios; `?efforts=all` works here too |
| `/api/llm-stats/models/<id>` | One model's every reasoning effort with all its fields, including configurations the leaderboard hides, such as `/api/llm-stats/models/anthropic/claude-opus-5.5` |
| `/api/llm-stats/benchmarks` | The benchmark portfolio's keys, names, and classes |
| `/api/llm-stats/benchmarks/<key>` | One benchmark's results, best first, with each model's leaderboard rank |
| `/api/llm-stats/changes?model=<id>&effort=<effort>` | One reasoning effort's recent score changes |
