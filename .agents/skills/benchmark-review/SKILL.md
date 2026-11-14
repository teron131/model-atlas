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

- Do not edit files, change git state, open pull requests, refresh snapshots, rebuild databases, or run destructive commands.
- Use SQLite only through read-only queries against an existing database.
- Do not create missing evidence by running scrapers or refresh jobs unless the user explicitly requests that follow-up.
- Stop at recommendations. Move into scraper, scoring, or portfolio implementation only after the user asks for the change.

The weekly review's record is the one file a review writes; see Run The Weekly Review.

## Establish The Current Contract

Read current files before naming benchmarks, sources, groups, weights, or rank semantics:

1. Read `docs/standards.md` for admission, retention, and rejection criteria.
2. Read `docs/benchmarks.md` for portfolio decisions, source precedence, metric selection, reconciliation, benchmark-specific resource policy, classification, importance, and Intelligence/Agentic loadings.
3. Start with `docs/methodology/overview.md`, then read the relevant `intelligence-agentic.md`, `imputation.md`, `speed-value.md`, and `leaderboard-rules.md` pages in that directory for the current scoring and display contracts.
4. When the benchmark is selected or comparison with the portfolio matters, derive the selected portfolio, `frontier` or `baseline` group, benchmark importance, and Intelligence/Agentic loadings from `src/model-atlas/benchmarks/catalog/portfolio.ts`. Compare those definitions with the served payload metadata when auditing a deployed result; distinguish a deployment mismatch from a portfolio decision.
5. For a registered benchmark, derive raw source names, loaders, and URLs from `src/model-atlas/benchmarks/catalog/sources.ts` and `src/model-atlas/benchmarks/registry.ts`. For a new candidate, use its official primary sources and do not expect a local registry entry.
6. When rank agreement matters, inspect `app/dashboard/table/leaderboard-rows.ts`, `app/dashboard/table/sort.ts`, `src/model-atlas/pipeline/selection/public-list.ts`, `app/api/public-json.ts`, and `src/model-atlas/stats/model-variants.ts` before reconstructing the displayed rank. Follow the app's current default rank and variant-collapse semantics; do not substitute another aggregate.
7. For selected benchmark values, follow `benchmarkValue` in `src/model-atlas/pipeline/scores/resource-metrics.ts`, which reads `model.benchmarks` and the supported `model.intelligence` fields. The shared model contract lives in `src/model-atlas/pipeline/model-types.ts` and is re-exported by `src/model-atlas/stats/types.ts`.

Never rely on a benchmark list, source URL, prior verdict, database run number, or model rank remembered from an earlier audit.

## Use Available Local Evidence

Local portfolio artifacts are optional for candidate review. The normal runtime reads published artifacts through `src/model-atlas/database/runtime-snapshot.ts`; derive their manifest and locations from `src/model-atlas/database/snapshots/manifest.ts`. A local override instead reads the SQLite checkpoint, whose default path is `.cache/database.sqlite`; verify the current path in `src/model-atlas/database/schema.ts`. Use an existing checkpoint or a read-only fetch of the served artifact appropriate to the audit, and record which snapshot or timestamp the evidence represents. Do not assume a static JSON file exists under `public/`.

Use the existing SQLite database only for evidence such as:

- final-model rank inputs and benchmark values
- raw source rows and source-specific leaderboards
- source row states, including missing or quarantined rows
- source health, fetched timestamps, and stored source-specific update fields
- source row counts and provenance fields

Read stored benchmark health before computing anything by hand, one benchmark at a time, such as `select json_extract(benchmark_update_health_json, '$.hle') from snapshot_metadata`: one entry is a couple of thousand tokens, while the whole column runs to tens of thousands. A published snapshot is megabytes, so extract the fields a question needs from it with `jq` rather than reading it. Each refresh stores it for every portfolio benchmark, baseline included, in `snapshot_metadata.benchmark_update_health_json`, and the payload serves it as `metadata.benchmark_update_health`; `ModelAtlasBenchmarkUpdateEntry` in `src/model-atlas/stats/types.ts` defines each field. It holds the source and matched top five with each model's effort variants, the spread (full range, leader-to-runner-up gap, and top-five range with and without the leader), the top five's mean standard error where every one of them publishes one, effort pairs whose lower effort scored higher, when the rows last changed, and when a source that could not be refreshed last fetched the rows it still serves. These are measurements without thresholds, so every judgment remains the review's; recompute only when the question needs another cohort. A null update time means no refresh has seen the rows change since tracking began, not that the source is stale.

A screen across every benchmark needs only the compared fields, which one query returns in a couple of thousand tokens:

```sql
select key,
  json_extract(value, '$.status'),
  json_extract(value, '$.matched_model_count'),
  json_extract(value, '$.spread.leader_gap'),
  json_extract(value, '$.spread.top_range'),
  json_extract(value, '$.spread.top_standard_error'),
  json_extract(value, '$.rows_updated_at_epoch_seconds'),
  json_extract(value, '$.cached_rows_fetched_at_epoch_seconds')
from snapshot_metadata, json_each(benchmark_update_health_json);
```

The `source_health` table gives each raw source's fetch state: `fresh` was fetched in the latest refresh, `cache_hit` is still within its cache period, `using_cached_rows` could not be refreshed and serves rows fetched at `last_fetch_epoch_seconds`, and `empty` holds no rows. `benchmarkRawSources` in `src/model-atlas/sources/registry.ts` maps a benchmark to the sources it is fetched through.

Inspect the schema before querying; do not assume run keys or columns from an older checkout. If no suitable published artifact or existing SQLite checkpoint is available, use the public API for rank evidence: `https://llmstats.vercel.app/api/llm-stats` ranks each listed model, and `/api/llm-stats/benchmarks/<key>` gives one benchmark's results with each model's leaderboard rank. The API serves no stored health or source health. Without that either, continue the standards and primary-source review, state that rank agreement could not be measured, and do not refresh or create an artifact.

## Review Any Benchmark Against The Standard

Use primary sources: the official leaderboard, methodology, paper, repository, dataset card, sample tasks, grading or verifier details, and current results. Inspect at least two real task examples when they are available, as required by `docs/standards.md`.

Judge:

- capability meaning and fit for Intelligence, Agentic, or both
- task authenticity, difficulty, headroom, and current top-model spread
- grading quality, verifier strength, contamination risk, and exploitability
- whether results measure the model, the harness, or a model-plus-scaffold system
- same-harness versus mixed-harness comparability
- whether the selected metric, task version, model configuration, effort, and harness describe one comparable result series
- current model coverage and reasoning-effort sensitivity
- provenance, including official, independent, vendor-reported, self-reported, private, or partially opaque evidence
- redundancy with selected benchmarks and uniqueness of the capability signal; compare with the current portfolio even when the candidate is new
- whether structured, current results are available well enough to support ongoing audit and ingestion

Recommend exactly `frontier`, `baseline`, or `rejected` when the evidence supports a decision, matching `docs/standards.md`. If essential evidence is unavailable, state what blocks classification instead of inventing a fourth class. Explain the capability and evidence behind the decision. Keep benchmark merit separate from ingestion readiness: difficult access or an unimplemented scraper can block adoption without making the underlying benchmark low quality.

When the user asks to settle portfolio policy:

- Apply the current class semantics from `docs/benchmarks.md` and the scoring owners: frontier task results contribute directly to capability scores, while baseline results remain visible without direct capability contributions. Aggregate indexes have separate eligibility and breadth rules; do not treat changing class as a label-only edit.
- Default task-level benchmark importance to `1`, preserving documented benchmark-specific exceptions. Read aggregate-index importance and represented-breadth rules from the current catalog and `src/model-atlas/benchmarks/index-policy.ts`; do not assume an index receives half importance.
- Default coding benchmarks primarily to Agentic. Add substantial Intelligence loading only when algorithmic, mathematical, scientific, or research reasoning materially determines success.
- Distinguish accepted source crosswalks, estimates from other benchmarks, and estimates across reasoning efforts using `docs/methodology/imputation.md`. Crosswalks supply accepted benchmark results; cross-benchmark estimates supply discounted evidence and resource-comparison inputs; supported sibling-effort estimates can fill missing capability contributions without adding direct evidence. No imputation satisfies direct-evidence admission requirements.

An unexpected winner is a reason to inspect task fit, grading, configuration, and harness effects, not evidence of bad methodology by itself.

## Audit A Selected Benchmark

Prioritize source vitality and leader quality over final-table coverage. A benchmark can be intentionally small, protected, expensive, frontier-focused, mixed-harness, vendor-reported, or niche-agentic and still be useful. For each selected benchmark, compute or estimate when evidence permits:

- source leaders, including current top-tier rows excluded from final Model Atlas selection
- whether excluded leaders are special, private, preview, or effort variants
- top matched model rank in the current default table
- how many of the top five matched models appear in the table's top 15, with the real denominator when fewer than five match; this is context, never a correctness or freshness test
- final-model coverage as a confidence note only
- spread, top-five standard error, and effort inversions, read from stored health
- when the rows last changed, and whether a source is serving cached rows
- missing or quarantined source rows
- cheap source availability or readability checks that do not require a full scrape
- provenance caveats stored in raw rows
- missing current frontier families
- uniqueness of the measured capability

Inspect source leaderboard leaders before judging only the subset that survives final-model selection. Treat a current top-tier excluded row as evidence that the source remains active, and state why it is excluded before interpreting matched-rank agreement.

Judge headroom and separation by the Difficulty and Separation section of `docs/standards.md`, on a stated cohort of serious current systems. Count models near a ceiling only within a band the benchmark's task granularity or uncertainty justifies, stating the band and the denominator; where no meaningful ceiling exists, do not infer saturation from a normalized scale. Never derive confidence intervals from aggregate leaderboard scores or read decimal precision as resolution. Compare earlier evidence only within one version, metric, and protocol, and where possible on a fixed matched cohort, so new entrants, effort or harness changes, regrading, and identity churn do not read as a trend. Revisit every benchmark retained despite approaching saturation or weak separation: state the original rationale from `docs/benchmarks.md`, whether it still holds, and what evidence would change it. Source activity alone does not justify frontier status.

## Check Versions

The standing policy is to use each benchmark's newest published version and never pool two versions. The refresh pipeline already adopts a new version published at the address Atlas reads when the structure is unchanged: a refresh that shares no version with the cached rows replaces them (`withoutSupersededVersions` in `src/model-atlas/sources/snapshots/policy.ts`). A version fixed by the address never changes, so the rule never fires there. Sort each selected benchmark's version state, and report maintenance separately from decisions:

- **Adopted automatically.** The observed version (served `metadata.benchmark_versions`, or the rows' version in the checkpoint) is newer than the one prior evidence recorded. Scores, displayed versions, and the timeline already follow it, because a version the rows report starts its own timeline identity; nothing needs maintenance. The catalog in `src/model-atlas/benchmarks/catalog/sources.ts` declares only versions the rows do not report.
- **Successor at a new address.** A version selector, a superseded or replaced-by notice, a new artifact URL, or a new evaluation page means the newest version moved. Switching the catalog address is maintenance under the newest-version policy; escalate only class or loading questions the new version raises, such as changed tasks, tools, harness, or grading.
- **Rejected for structure.** A new version with a different component basket, subset layout, or task set yields no rows, so source health shows cached rows. Report the structural change and the breadth, metric, or loading decision it needs.
- **No published version.** For sources that publish none, such as Surge or an Artificial Analysis page whose title carries no version, look for silent reruns: shared rows moving together, a changed score granularity, or a cohort reset. Treat a confirmed rerun as a new version and declare it in the catalog.
- **Deliberate pin.** A version pinned so a fused source matches another source's suite, such as Terminal-Bench-Science's Vals series, is not stale while that suite is unchanged.
- **Pooled minor versions.** Where the publisher's own leaderboard pools minor versions it scores comparably, Atlas pools them too, through Epoch's `latestTaskVersion: "major"` as Chess Puzzles does. That is one version under policy, not gap filling.
- **Gap filling across versions.** A rule that fills models missing from the newest version with an older version's rows pools two versions. Report it as a scoring defect, not as coverage.

Compare prior evidence only within one version.

## Diagnose Signals Before Judging Them

Do not report symptom counts without explaining their cause and consequence. For every adverse signal, answer three questions:

1. What changed in the observed evidence?
2. Why did it change, or what concrete evidence is still needed to determine why?
3. Does the cause materially weaken source vitality, comparability, provenance, capability meaning, or score evidence?

Counts and statuses are starting points, not verdicts. Reconcile cached `before` identities against current-source `after` identities before treating missing or quarantined rows as lost evaluations. Check normalized model identity, provider, reasoning effort, harness, task, track, run, score, and source configuration. Display-label changes, aliases, explicit `default` labels, renamed effort labels, and one row splitting into several disclosed effort variants are identity churn rather than benchmark drift when the underlying evaluation remains represented.

When a symptom suggests a source-wide schema, naming, or presentation change, inspect every selected benchmark that shares the same source group, loader, parser, or persistence policy before limiting the diagnosis to one benchmark. Report the shared source-family cause once, then state the actual benchmark-specific effect. Do not assume every sibling is affected: verify current rows and preserve real distinctions such as default versus explicit reasoning-effort variants.

Keep stock and flow separate. A quarantine count is the current stock of preserved missing keys; churn is the set of additions, disappearances, recoveries, and identity transitions between runs. Stable counts can hide turnover, while a large persistent count can consist entirely of harmless renamed aliases. Compare row keys when available and state when only net counts can be measured.

Quarantined rows still score. A row missing from the current source is retained as evidence, not only recorded as state, so after a board is rerun, pruned, or moved to a new protocol, its earlier rows keep scoring beside the current ones until a version boundary drops them. Before calling missing rows harmless, check that the retained and current rows belong to one version and protocol; HANDBOOK.md's silent rerun left dozens of earlier-protocol rows scoring this way.

Reproduce a suspected pipeline cause before reporting it. Apply the current merge, parser, or cache-acceptance function to the cached and current rows in memory, show that it yields the served value, and name the function and row keys. This turns a symptom such as stale scores into a located defect that a fix can target.

Escalate only the material remainder after reconciliation. A pipeline identity defect, stale alias, or observability gap can merit a follow-up without changing the benchmark verdict. If the cause cannot be established from available read-only evidence, name the uncertainty and the decision it could affect instead of presenting the symptom as the conclusion.

## Apply Drift Judgment Carefully

Use these verdicts for already-selected benchmarks:

- `keep`: the source is alive, evaluates current serious systems, and supplies an interpretable, useful capability signal. Different agents, divergence from the overall table, and self-reported or unverified provenance do not prevent keep by themselves.
- `watch`: source appears active but a material unresolved weakness remains after causal reconciliation, such as opaque harness effects, consistently weak or stale leaders without a capability-specific explanation, isolated, contradictory, or unauditable provenance, or sparse evidence combined with another adverse signal.
- `review`: the source appears dead or materially stale, leaders are generally weak with no credible niche explanation, evaluations are genuinely missing after identity reconciliation and materially weaken the signal, or the methodology or provenance is too opaque or inconsistent to interpret.

Do not escalate a benchmark because of thin final-model coverage alone. Escalate sparse coverage only when it combines with stale or weak leaders, source disappearance, genuinely missing evaluations after identity reconciliation, poor provenance, or broader evidence that the benchmark no longer measures its claimed capability.

Different disclosed agents or harnesses are not themselves a watch signal; interpret those rows as model-plus-agent evidence and escalate only when opaque or incompatible harness effects undermine the claim. A benchmark winner need not be the overall top-ranked model, especially for a specialized capability. Self-reported, vendor-reported, and unverified rows are provenance labels rather than automatic watch signals when they remain attributable, understandable, comparable across multiple current serious systems, and coherent with other evidence. Expert, panel, crowd, or model-judge grading is acceptable when blind comparison, enough judgments, and order and presentation controls make its ranking justifiable; escalate when those controls are missing and the ranking looks implausible, not because of who grades.

Treat dates as context rather than strict equality checks. Separate benchmark merit from pipeline persistence or observability problems. Be more tolerant of rank disagreement for narrow agentic workflows and unique capabilities than for broad frontier Intelligence claims.

Judge the class separately from these health verdicts, recommending exactly `frontier`, `baseline`, or `rejected`. Retain frontier while credible, demanding tasks still separate current serious systems with meaningful headroom. Recommend baseline when frontier separation has weakened but reliable evidence still adds important breadth or stability; baseline is not the automatic destination for a saturated benchmark. Recommend rejection when saturation or clustering leaves no important baseline value, or when the standards establish a material compromise; an active source can still merit removal. A `keep` verdict can sit beside a baseline or removal recommendation, so state both.

## Run The Weekly Review

The weekly review audits every portfolio benchmark, baseline included, and continues from the previous review rather than starting over.

1. Read the newest record in `.agents/context/benchmark-reviews/`, when one exists, for its numbers, verdicts, open questions, and the decisions added since.
2. Establish the current contract, artifact revision, and dashboard rank semantics once, then read stored health and source health for every benchmark.
3. Screen every benchmark against the record: version, leaders, spread, standard error, coverage, last update, fetch state, and quarantined rows. Without a record, say that no trend can be established yet.
4. Investigate in depth only the benchmarks that changed, sit near saturation or were retained despite weak separation, carry an open item, or remain materially uncertain. Reuse still-applicable methodology evidence with its date and source, and re-inspect tasks and grading when a change or doubt could affect the decision.
5. Save the report as `.agents/context/benchmark-reviews/<YYYY-MM-DD>.md`. Its table is next week's baseline, so give every benchmark the numbers the screen compares.

When the user later settles a decision the review raised, the session that carries it out adds the decision and its date to that review's record.

Delegate read-only evidence gathering when independent source families can be inspected in parallel: two or three subagents, not one per benchmark, each owning every benchmark that shares its loader, parser, or persistence policy. Give each the shared contract and evidence revision, source links, the read-only boundary, and a concrete evidence deliverable. Subagents report evidence, provenance, calculations, and uncertainties; the reviewer verifies material findings and owns every verdict and recommendation. While they run, advance a separate part of the review, then integrate their evidence without repeating their inspection. Avoid recursive delegation, other sessions, worktrees, duplicate downloads, and repeated polling.

## Report Evidence, Not Certainty

Distinguish:

- final public observations
- raw source leaderboard rows
- matched final-model evidence
- inferred comparisons
- unavailable evidence

Lead with the verdict and the strongest evidence. For individual reviews, use the smallest structure that makes the judgment auditable. A portfolio audit runs in this order:

1. keep/watch/review counts and the decisions the audit needs
2. maintenance, listed on its own
3. each decision, as described below
4. a compact table with one row per benchmark: class and loadings, version, source leader and whether it is current, matched-rank context, coverage, gap, top-five range, top standard error, last update, fetch state, verdict, and recommended class
5. attention notes for watch and review items and for benchmarks retained despite weak separation, holding the detailed calculations
6. non-code next actions

Separate maintenance from decisions. Maintenance needs no user decision under standing policy: version catch-ups, switching to a newer version's address, and fixing a pipeline defect whose cause has been reproduced. Decisions are class, loading, importance, breadth, metric, and removal choices.

Keep the report short enough to act on, so maintenance can proceed without waiting for a decision. Give each decision as its own question with the recommended option first, the evidence behind it, and links to the source pages; add a screenshot or small chart when it shows the evidence faster than prose.

Do not leave a decision blocked when read-only evidence can settle it. For a revised or successor version, collect the successor's distribution on the same current cohort, how much of the task set and protocol changed, and whether the source still evaluates new models on the old version; then recommend a class with its main risk. Reserve a blocked verdict for evidence that cannot be obtained, and name what would unblock it.

For every watch or review item, report the observed symptom, the best-supported cause, whether the cause affects benchmark merit or only ingestion/identity/observability, and why that effect is material enough for the verdict. Do not leave the user to infer significance from dates, counts, provenance labels, or health statuses.

Recommend follow-ups such as manually inspecting a source, checking excluded leaders, persisting a missing raw source, reconsidering classification, or running a live scraper in a separately approved task. Do not propose code patches during a read-only review.
