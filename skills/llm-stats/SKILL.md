---
name: llm-stats
description: Use when comparing LLM model quality, speed, price, TIME EFFICIENCY, COST EFFICIENCY, benchmark coverage, Model Atlas scores, or current model tradeoffs for model selection and leaderboard analysis.
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

- `score`: compact rank and intelligence/agentic/speed/TIME EFFICIENCY/COST EFFICIENCY scores.
- `core`: model selection columns such as date, modalities, price, context, speed, and score.
- `benchmarks`: selected benchmark values by model.
- `all`: fuller Model Atlas payload.

For quick recommendations, prefer `score` or `core`; use `benchmarks` when explaining why a model ranks where it does. The `score`, `core`, and `benchmarks` views include a `methodology` overview; use it when summarizing how the scores are computed.
