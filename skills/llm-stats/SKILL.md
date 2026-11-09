---
name: llm-stats
description: Use when comparing LLM model quality, speed, value, benchmark coverage, Model Atlas scores, or current model tradeoffs for model selection and leaderboard analysis.
---

# LLM Stats

Use the hosted Model Atlas API. Each endpoint returns one slice of the data, so request the smallest one that answers the question:

```text
https://llmstats.vercel.app/api/llm-stats
https://llmstats.vercel.app/api/llm-stats/models
https://llmstats.vercel.app/api/llm-stats/models/<id>
https://llmstats.vercel.app/api/llm-stats/benchmarks
https://llmstats.vercel.app/api/llm-stats/benchmarks/<key>
```

- `/api/llm-stats`: rank and intelligence/agentic/speed/value scores for each listed model.
- `/models`: model selection columns such as date, modalities, price, context, speed, score, and the leaderboard's resource ratios `task_cost_ratio`, `task_time_ratio`, and `total_token_ratio` (Cost×, Time×, Tokens×). A ratio is the model's typical task cost, runtime, or total tokens relative to each benchmark's median: 1 is typical, 0.5 is half, and lower means less use regardless of achieved quality.
- `/models/<id>`: one model's every scored reasoning effort with all its fields, including the OpenAI Pro, Gemini Deep Think, and Claude Mythos configurations the ranked endpoints hide; an id keeps its provider slash, as in `/models/anthropic/claude-opus-5.5`. Use `reasoning_effort` to distinguish efforts; `null` means the source did not report a separate effort label, not `none`. Each effort's `resource_ratios` holds its `cost`, `time`, and `tokens` ratios with the `benchmark_count` and `source_count` measured behind each; a ratio from one or two benchmarks is weak evidence.
- `/benchmarks`: the portfolio's benchmark keys, names, and classes.
- `/benchmarks/<key>`: one benchmark's results for the listed models, best first, in the source's units, with each model's `leaderboard_rank`; a `percent` format arrives as a fraction of 1.

The ranked endpoints, `/api/llm-stats`, `/models`, and `/benchmarks/<key>`, represent each base model with its highest-Intelligence scored effort and leave `reasoning_effort` null. Add `?efforts=all` to `/api/llm-stats` or `/models` for one ranked row per reasoning effort, as in the leaderboard's Variants view.

Pair API calls with `jq` to keep the response focused:

```bash
curl -sS 'https://llmstats.vercel.app/api/llm-stats' | jq '.scores[:10]'
curl -sS 'https://llmstats.vercel.app/api/llm-stats?efforts=all' | jq '[.scores[] | select(.provider == "anthropic")]'
```

For quick recommendations, prefer `/api/llm-stats` or `/models`; use `/benchmarks/<key>` or `/models/<id>` when explaining why a model ranks where it does, and `?efforts=all` when effort-level differences matter. The `/api/llm-stats` and `/models` responses include a `methodology` overview; use it when summarizing how the scores are computed.
