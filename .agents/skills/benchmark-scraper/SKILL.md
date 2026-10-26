---
name: benchmark-scraper
description: Use when implementing, scraping, or wiring an approved benchmark leaderboard into Model Atlas. Preserves source configuration, applies settled portfolio policy, and verifies refreshed served data. Use benchmark-review instead for standalone admission, retention, or drift review.
---

# Benchmark Scraper

Use this after benchmark merit has been reviewed and the user wants to implement ingestion, especially for leaderboard scrapers that feed scoring, database payloads, or dashboard display. Use `$benchmark-review` for review-only work or a new candidate whose admission has not been decided.

## Rule

Separate benchmark merit, source parsing, and scoring policy. Once implementation is authorized, complete the workflow without repeated confirmation; ask only when a material policy choice remains unresolved.

## Repo Map

Find the current files by role before broad edits:

- Benchmark standards, portfolio/source policy, methodology, and matching docs: inclusion rules, selected benchmark decisions, scoring intent, and model identity policy.
- Benchmark config: selected benchmark keys, baseline/frontier groupings, dimension portions, and score weights.
- Scraper modules: existing leaderboard/API/PDF scrapers and their focused tests.
- Source-data and cache/database loading: where raw source rows become lookup maps or persisted snapshots.
- Matching and scoring modules: where benchmark rows attach to models, are imputed, and enter intelligence/agentic scores. The shared model contract is `src/model-atlas/pipeline/model-types.ts`; `stats/types.ts` re-exports it. Source combination and its private additive fitter belong together in `src/model-atlas/benchmarks/sources-crosswalk.ts`.
- Database schema, writers, and payload readers: where raw rows, summarized rows, processed models, and public payloads are stored.
- Dashboard labels, tooltips, and benchmark display surfaces: where new fields become visible to users. Public JSON projection and compact variant selection live in `app/leaderboard/public-json.ts` and `app/leaderboard/model-variants.ts`.
- Public exports and tests: package surface plus focused scraper/matcher/scoring/payload tests.
- Refresh and publication scripts: derive the current local and production workflow from `package.json` and the database boundary rather than relying on remembered commands.

## Research And Tooling Methods

Use primary evidence before implementation:

- Use web search to find the official benchmark site, paper, repository, leaderboard, dataset card, blog posts, and methodology notes.
- Read the paper and official or high-signal blog posts when available.
- Inspect sample tasks or dataset examples when available; use at least two real samples before judging benchmark texture.
- Use Hugging Face when benchmark data, model cards, datasets, papers, or Spaces are hosted there.
- Use `playwright-cli` for repeatable leaderboard inspection, network/API discovery, DOM checks, screenshots, and scraper development.
- Prefer stable APIs, JSON payloads, dataset files, or hydrated page chunks over brittle DOM scraping when they exist.

## Stage 1: Judge Worthiness First

Before writing scraper code, reuse a settled admission decision and its evidence; investigate only missing or changed facts that matter to implementation:

- Read the current Model Atlas ingestion/scoring standards and nearby benchmark implementations by following the Repo Map roles.
- Inspect real sources, not just marketing pages: leaderboard data source, paper, repo, blog posts, task samples, verifier/rubric, result tables, and provenance notes.
- Use web search, paper/blog reading, Hugging Face artifacts, and sample inspection to build the evidence base.
- Judge whether the benchmark is worthy for Model Atlas.
- Give candid feedback on strengths, weaknesses, access opacity, saturation, narrowness, benchmark-gaming risk, and fit for intelligence versus agentic scoring.
- If benchmark merit is not already settled, present the verdict before writing implementation code.

Do not soften weak evidence into a polite summary. If access is gated or sample texture is thin, say that clearly.

## Stage 2: Discover The Scrape Shape

Once ingestion implementation is authorized:

- Inspect the leaderboard page with `playwright-cli`; use snapshots, `eval`, console, and network inspection to find the real data source.
- Check API calls, hydrated chunks, PDFs, datasets, Hugging Face artifacts, or static files before accepting DOM text as the source.
- Prefer stable APIs or structured artifacts over DOM scraping when available.
- Identify all available fields, including model names, providers, ranks, scores, splits, harnesses, domains, attempts, efforts, timestamps, costs, ties, notes, and source URLs.
- Note any fields that are computed, hidden, ambiguous, or display-only.
- Surface only unresolved field or aggregation choices that would materially change the scored result.

Do not silently drop domains, splits, efforts, ties, or raw rows just because the first scoring policy may not need them.

## Stage 3: Build The Scraper

After field selection:

- Use `playwright-cli` to prototype and verify the scraper against the live leaderboard when browser rendering or network discovery matters.
- Preserve raw leaderboard rows separately from summarized model rows.
- Keep benchmark-specific metadata such as split, domain, harness, effort, tie, and source provenance.
- Preserve multiple reasoning-effort or budget rows when available; higher-effort regressions are review signals, not parser noise.
- Record the version the source publishes on every row, wherever the source shows it, page titles included: `metadata.benchmark_version` for benchmark observations, or a version or revision column for a runtime table, declared through the `editions` option of `snapshotSourceRows`. Benchmark observations get the edition rule automatically, and a source that builds its own snapshot calls `withoutSupersededEditions` directly, as Vals Index does. When one source table holds several benchmarks, also give `seriesOf`, as Artificial Analysis's evaluation pages do, so each benchmark's version is compared on its own. Do not pin the version: the shared refresh adopts a new edition and replaces the old rows, and a version fixed by the URL simply never changes. Pin only when a fused source must stay on another source's suite.
- Guard structure rather than version: a payload whose task key, component basket, or subset layout changed should yield no rows, so the cache remains until a decision is made.
- For per-run versions, select the newest major.minor edition, as Epoch's `latestTaskEdition` does. If the source publishes no version and can rerun silently, give the rerun an Atlas-declared edition label, as Surge's `edition` does.
- Choose the row merge deliberately. The default keeps populated cached values, which freezes a source that revises published results; such a source needs `mergeRow` to return the fetched row, as Vals does.
- When a defect shows in one source, check whether a shared step causes it before fixing that source alone. Vals revisions froze because of the shared merge, and the same freeze affected every versioned source until the edition rule moved into the shared snapshot policy.
- Match model names conservatively: exact first, narrow aliases second, no broad fuzzy matching without review.
- Keep unmatched rows inspectable.
- Add focused fixture tests that cover the weird cases found in the real leaderboard.
- Run the scraper live at least once when network access is available.

## Stage 4: Decide Scoring Policy

After the scraper works:

- Show the fetched row shape and representative parsed output.
- Apply settled scoring decisions directly; discuss only unresolved choices that would change Model Atlas scores.
- Keep parsing truth separate from scoring policy.
- Apply the accepted class (`baseline` or `frontier`), positive benchmark importance, and Intelligence/Agentic split. The two dimension portions must sum to 100%. Follow `docs/benchmarks.md`: frontier task results contribute directly to capability scores, while baseline results remain visible without direct capability contributions; aggregate indexes follow their own eligibility and breadth policy.
- Default task-level benchmark importance to `1`, preserving documented exceptions. Read aggregate-index importance and represented-breadth rules from the current catalog and `src/model-atlas/benchmarks/index-policy.ts`; do not assign half importance by assumption.
- Default coding benchmarks primarily to Agentic. Add substantial Intelligence loading only when algorithmic, mathematical, scientific, or research reasoning materially determines success.
- Check effort sensitivity before scoring. If the same model regresses at higher reasoning effort, explain whether this looks like real overthinking, timeout pressure, brittle formatting, harness mismatch, or another benchmark artifact.
- Choose benchmark importance deliberately rather than deriving it from class. Explain its impact through importance and dimension loadings.
- Decide whether any non-quality data contributes to speed, value, bonus-only display, or raw display only.
- Preserve extra dimensions even if the initial scoring uses only one summary.

Do not bury bonus, median, max, domain-lead, effort, or harness aggregation choices inside parser code.

## Stage 5: Wire And Refresh

After scoring policy is agreed:

- Wire the benchmark through source data, model matching, score inputs, database schema/writers, payload reading, public exports, dashboard labels, and tooltips as needed.
- When moving to a successor published at a new address, update the catalog address and the timeline `revision` together; docs and tooltips take the observed edition from the snapshot through `:edition[key]` markers and `metadata.benchmark_editions`.
- Add or update tests for scraper, matching, scoring, and payload behavior.
- Run focused tests first, then checks scaled to the touched surface: `pnpm run typecheck` for any TypeScript change, the full test suite for shared snapshot policy or payload contracts, and `pnpm run build` for docs or UI.
- Verify a data fix offline where possible: apply the changed parser, merge, or cache-acceptance function to saved payloads or a read-only copy of the checkpoint instead of rebuilding the database.
- Follow the current package scripts: `scripts/database.ts` refreshes the local SQLite checkpoint, while `scripts/publish-snapshot.ts` owns remote snapshot publication; a local refresh publishes nothing.
- Stop at a verified working tree unless the user asks for a production step. Production follows the repository: a push to `main` runs the deploy workflow, and the scheduled refresh publishes the next snapshot. Do not build or deploy images from uncommitted files, repoint production jobs, restore or republish production checkpoints, or wait for CDN convergence on your own initiative: a hand-built deploy leaves production running code that git lacks, and the next push silently replaces it. Report the remaining step instead. When the user does ask, use the publication workflow and verify the served artifact through the runtime and manifest contract.
- Check `git diff --check`.
- Summarize the final benchmark role, scoring method, refresh result, and any unmatched or excluded rows.

## Existing Patterns To Read

Start with the closest current benchmark implementation rather than inventing a new shape. Useful references commonly include:

- Terminal-Bench-style raw rows plus summarized model rows.
- DeepSWE-style effort rows and best-effort summarization.
- AutomationBench-style domain/effort/tie preservation and conservative model matching.
- Agents' Last Exam-style split/harness handling.
- BrowseComp-style model-level lookup shape.
