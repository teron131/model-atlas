---
name: llm-stats
description: Use when comparing LLM model quality, speed, value, benchmark coverage, Model Atlas scores, or current model tradeoffs for model selection and leaderboard analysis.
---

# LLM Stats

Use the hosted Model Atlas API:

```text
https://llmstats.vercel.app/api/llm-stats?view=score
https://llmstats.vercel.app/api/llm-stats?view=core
https://llmstats.vercel.app/api/llm-stats?view=benchmarks
https://llmstats.vercel.app/api/llm-stats?view=all
```

Views:

- `score`: compact rank and intelligence/agentic/speed/value scores.
- `core`: model selection columns such as date, modalities, price, context, speed, and score.
- `benchmarks`: selected benchmark values by model.
- `all`: fuller Model Atlas payload with every scored reasoning-effort variant. Use `reasoning_effort` to distinguish variants; `null` means the source did not report a separate effort label, not `none`.

The `score`, `core`, and `benchmarks` views represent each base model with its highest-Intelligence scored variant.

Pair API calls with `jq` to keep the response focused:

```bash
curl -sS 'https://llmstats.vercel.app/api/llm-stats?view=score' | jq '.scores[:10]'
curl -sS 'https://llmstats.vercel.app/api/llm-stats?view=all' | jq '[.models[] | select(.reasoning_effort != null) | {id, reasoning_effort, scores}]'
```

For quick recommendations, prefer `score` or `core`; use `benchmarks` when explaining why a model ranks where it does, and `all` when effort-level differences matter. The `score`, `core`, and `benchmarks` views include a `methodology` overview; use it when summarizing how the scores are computed.
