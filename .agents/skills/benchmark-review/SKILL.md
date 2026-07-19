---
name: benchmark-review
description: Review any proposed, rejected, or selected benchmark against Model Atlas standards and current primary evidence. Use for new-candidate admission, frontier/baseline/rejected classification, capability and task inspection, provenance and leaderboard-quality review, retention or deprecation judgment, benchmark drift audits, weekly portfolio health reports, or deciding whether a benchmark earns ranking space. Keep review work read-only unless the user separately asks to implement a settled decision.
---

# Benchmark Review

Judge any benchmark on its merits from the current repository contract and primary evidence. The benchmark does not need to exist in the portfolio, source registry, snapshot, or database. Optimize for a defensible standards decision, not a fixed report format.

## Choose The Review Mode

- For a new or untracked candidate, start from the official benchmark evidence and decide whether it meets the repository standard. Do not require local rows, Model Atlas coverage, or an existing scraper before judging admission.
- For a rejected or previously reviewed benchmark, reassess the current evidence rather than inheriting the old verdict.
- For a selected benchmark, test whether it still earns its class and ranking space; add portfolio drift evidence when local artifacts exist.
- For a portfolio audit, derive the portfolio from the repository and apply the same standard to every selected benchmark.

## Keep Reviews Read-Only

For review, audit, or report requests:

- Do not edit files, change git state, refresh snapshots, rebuild databases, or run destructive commands.
- Use SQLite only through read-only queries against an existing database.
- Do not create missing evidence by running scrapers or refresh jobs unless the user explicitly requests that follow-up.
- Stop at recommendations. Move into scraper, scoring, or portfolio implementation only after the user asks for the change.

## Establish The Current Contract

Read current files before naming benchmarks, sources, groups, weights, or rank semantics:

1. Read `docs/standards.md` for admission, retention, and rejection criteria.
2. Read `docs/methodology.md` for scoring philosophy, benchmark decisions, source notes, effort handling, imputation, and resource scoring.
3. When the benchmark is selected or comparison with the portfolio matters, derive the selected portfolio, `frontier` or `baseline` group, benchmark importance, and Intelligence/Agentic loadings from `src/model-atlas/config/benchmark-portfolio.ts`. Use `public/model-atlas-snapshot.json` metadata only when that file exists and represents the newer contract.
4. For a registered benchmark, derive raw source names, table names, and URLs from `src/model-atlas/database/types.ts`. For a new candidate, use its official primary sources and do not expect a local registry entry.
5. When rank agreement matters, inspect `app/dashboard/table/models.ts`, `src/model-atlas/stats/selection/public-list.ts`, and `app/api/llm-stats/public-json.ts` before reconstructing the displayed rank. Follow the app's current default rank and variant-collapse semantics; do not substitute another aggregate.
6. For selected benchmark values, inspect both `model.evaluations` and `model.intelligence` because selected AA-derived fields can live in either object.

Never rely on a benchmark list, source URL, prior verdict, database run number, or model rank remembered from an earlier audit.

## Use Available Local Evidence

Local portfolio artifacts are optional for candidate review. Prefer `public/model-atlas-snapshot.json` for current final rows when it exists. If it is absent, use `.cache/database.sqlite` only when that database already exists and can reproduce the app's current rank from final model rows.

Use the existing SQLite database only for evidence such as:

- final-model rank inputs and benchmark values
- raw source rows and source-specific leaderboards
- source row states, including missing or quarantined rows
- source health, fetched timestamps, and stored source-specific update fields
- source row counts and provenance fields

Inspect the schema before querying; do not assume run keys or columns from an older checkout. If both the public snapshot and SQLite database are absent, continue the standards and primary-source review, state that local rank agreement could not be measured, and do not refresh either artifact.

## Review Any Benchmark Against The Standard

Use primary sources: the official leaderboard, methodology, paper, repository, dataset card, sample tasks, grading or verifier details, and current results. Inspect at least two real task examples when they are available, as required by `docs/standards.md`.

Judge:

- capability meaning and fit for Intelligence, Agentic, or both
- task authenticity, difficulty, headroom, and current top-model spread
- grading quality, verifier strength, contamination risk, and exploitability
- whether results measure the model, the harness, or a model-plus-scaffold system
- same-harness versus mixed-harness comparability
- current model coverage and reasoning-effort sensitivity
- provenance, including official, independent, vendor-reported, self-reported, private, or partially opaque evidence
- redundancy with selected benchmarks and uniqueness of the capability signal; compare with the current portfolio even when the candidate is new
- whether structured, current results are available well enough to support ongoing audit and ingestion

Recommend exactly `frontier`, `baseline`, or `rejected` when the evidence supports a decision, matching `docs/standards.md`. If essential evidence is unavailable, state what blocks classification instead of inventing a fourth class. Explain the capability and evidence behind the decision. Keep benchmark merit separate from ingestion readiness: difficult access or an unimplemented scraper can block adoption without making the underlying benchmark low quality. Do not derive benchmark importance from class, and do not invent exact scoring settings unless the user asks to settle scoring policy.

## Audit A Selected Benchmark

Prioritize source vitality and leader quality over final-table coverage. For each selected benchmark, compute or estimate when evidence permits:

- source leaders, including current top-tier rows excluded from final Model Atlas selection
- whether excluded leaders are special, private, preview, or effort variants
- top matched model rank in the current default table
- how many top-three and top-five matched benchmark models appear in the table top 10, 15, and 20
- final-model coverage as a confidence note only
- overall spread and top-five spread
- missing or quarantined source rows
- cheap source availability or readability checks that do not require a full scrape
- provenance caveats stored in raw rows
- missing current frontier families
- uniqueness of the measured capability

Inspect source leaderboard leaders before judging only the subset that survives final-model selection. Treat a current top-tier excluded row as evidence that the source remains active, and state why it is excluded before interpreting matched-rank agreement.

## Apply Drift Judgment Carefully

Use these verdicts for already-selected benchmarks:

- `keep`: source leaders are current and serious, matched leaders broadly agree with strong table models, or the benchmark supplies a clearly useful unique or niche capability signal.
- `watch`: source appears active but rank agreement is mixed, provenance is soft, or sparse coverage lowers confidence while the signal remains plausible.
- `review`: source leaders are stale or weak, matched leaders are mostly outside the table top 20, the winner is outside the top 25 without a credible niche explanation, rows are missing or quarantined, or provenance materially weakens the signal.

Do not escalate a benchmark because of thin final-model coverage alone. Escalate sparse coverage only when it combines with stale or weak leaders, source disappearance, missing or quarantined rows, poor provenance, or consistently weak matched ranks.

Treat dates as context rather than strict equality checks. Separate benchmark merit from pipeline persistence or observability problems. Be more tolerant of rank disagreement for narrow agentic workflows and unique capabilities than for broad frontier Intelligence claims.

## Report Evidence, Not Certainty

Distinguish:

- final public observations
- raw source leaderboard rows
- matched final-model evidence
- inferred comparisons
- unavailable evidence

Lead with the verdict and the strongest evidence. For portfolio audits, give keep/watch/review counts, a compact comparison table, attention notes only for watch/review items, and non-code next actions. For individual reviews, use the smallest structure that makes the judgment auditable.

Recommend follow-ups such as manually inspecting a source, checking excluded leaders, persisting a missing raw source, reconsidering classification, or running a live scraper in a separately approved task. Do not propose code patches during a read-only review.
