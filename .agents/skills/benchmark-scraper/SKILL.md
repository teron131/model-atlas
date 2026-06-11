---
name: benchmark-scraper
description: Use when adding, auditing, scraping, or wiring a benchmark leaderboard into Model Atlas. Enforces staged user discussion before field selection, scoring policy, and final database refresh.
---

# Benchmark Scraper

Use this for benchmark additions in this repo, especially leaderboard scrapers that will feed scoring, database payloads, or dashboard display.

## Rule

Do not treat benchmark ingestion as a straight coding task. Work in stages and pause for user discussion at the gates below.

## Repo Map

Find the current files by role before broad edits:

- Benchmark standards, methodology, and matching docs: inclusion rules, scoring intent, and model identity policy.
- Benchmark config: selected benchmark keys, baseline/frontier groupings, dimension portions, and score weights.
- Scraper modules: existing leaderboard/API/PDF scrapers and their focused tests.
- Source-data and cache/database loading: where raw source rows become lookup maps or persisted snapshots.
- Matching and scoring modules: where benchmark rows attach to models, are imputed, and enter intelligence/agentic scores.
- Database schema, writers, and payload readers: where raw rows, summarized rows, processed models, and public payloads are stored.
- Dashboard labels, tooltips, and benchmark display surfaces: where new fields become visible to users.
- Public exports and tests: package surface plus focused scraper/matcher/scoring/payload tests.
- Snapshot refresh scripts: the entrypoints behind `pnpm atlas:snapshot`.

## Research And Tooling Methods

Use primary evidence before implementation:

- Use web search to find the official benchmark site, paper, repository, leaderboard, dataset card, blog posts, and methodology notes.
- Read the paper and official or high-signal blog posts when available.
- Inspect sample tasks or dataset examples when available; use at least two real samples before judging benchmark texture.
- Use Hugging Face when benchmark data, model cards, datasets, papers, or Spaces are hosted there.
- Use Chrome when the task depends on the user's existing browser state, logged-in access, cookies, or an already-open benchmark page.
- Use `playwright-cli` for repeatable leaderboard inspection, network/API discovery, DOM checks, screenshots, and scraper development.
- Prefer stable APIs, JSON payloads, dataset files, or hydrated page chunks over brittle DOM scraping when they exist.

## Stage 1: Judge Worthiness First

Before writing scraper code:

- Read the current Model Atlas ingestion/scoring standards and nearby benchmark implementations by following the Repo Map roles.
- Inspect real sources, not just marketing pages: leaderboard data source, paper, repo, blog posts, task samples, verifier/rubric, result tables, and provenance notes.
- Use web search, paper/blog reading, Hugging Face artifacts, and sample inspection to build the evidence base.
- Judge whether the benchmark is worthy for Model Atlas.
- Give candid feedback on strengths, weaknesses, access opacity, saturation, narrowness, benchmark-gaming risk, and fit for intelligence versus agentic scoring.
- Pause and ask the user whether to proceed.

Do not soften weak evidence into a polite summary. If access is gated or sample texture is thin, say that clearly.

## Stage 2: Discover The Scrape Shape

After the user agrees to proceed:

- Inspect the leaderboard page with `playwright-cli`; use snapshots, `eval`, console, and network inspection to find the real data source.
- Check API calls, hydrated chunks, PDFs, datasets, Hugging Face artifacts, or static files before accepting DOM text as the source.
- Prefer stable APIs or structured artifacts over DOM scraping when available.
- Identify all available fields, including model names, providers, ranks, scores, splits, harnesses, domains, attempts, efforts, timestamps, costs, ties, notes, and source URLs.
- Note any fields that are computed, hidden, ambiguous, or display-only.
- Pause and ask the user which fields should be fetched and preserved.

Do not silently drop domains, splits, efforts, ties, or raw rows just because the first scoring policy may not need them.

## Stage 3: Build The Scraper

After field selection:

- Use `playwright-cli` to prototype and verify the scraper against the live leaderboard when browser rendering or network discovery matters.
- Preserve raw leaderboard rows separately from summarized model rows.
- Keep benchmark-specific metadata such as split, domain, harness, effort, tie, and source provenance.
- Match model names conservatively: exact first, narrow aliases second, no broad fuzzy matching without review.
- Keep unmatched rows inspectable.
- Add focused fixture tests that cover the weird cases found in the real leaderboard.
- Run the scraper live at least once when network access is available.

## Stage 4: Decide Scoring Policy

After the scraper works:

- Show the fetched row shape and representative parsed output.
- Discuss scoring with the user before wiring it into Model Atlas scores.
- Keep parsing truth separate from scoring policy.
- Decide whether the benchmark contributes to intelligence, agentic, speed, value, bonus-only display, or raw display only.
- Preserve extra dimensions even if the initial scoring uses only one summary.

Do not bury bonus, median, max, domain-lead, effort, or harness aggregation choices inside parser code.

## Stage 5: Wire And Refresh

After scoring policy is agreed:

- Wire the benchmark through source data, model matching, score inputs, database schema/writers, payload reading, public exports, dashboard labels, and tooltips as needed.
- Add or update tests for scraper, matching, scoring, and payload behavior.
- Run focused tests first, then the repo checks appropriate to the touched surface.
- Run `pnpm atlas:snapshot` so the database and static snapshot reflect the new benchmark.
- Run `pnpm run typecheck` and `pnpm run build` when TypeScript or UI surfaces changed.
- Check `git diff --check`.
- Summarize the final benchmark role, scoring method, refresh result, and any unmatched or excluded rows.

## Existing Patterns To Read

Start with the closest current benchmark implementation rather than inventing a new shape. Useful references commonly include:

- Terminal-Bench-style raw rows plus summarized model rows.
- DeepSWE-style effort rows and best-effort summarization.
- AutomationBench-style domain/effort/tie preservation and conservative model matching.
- Agents' Last Exam-style split/harness handling.
- BrowseComp-style model-level lookup shape.
