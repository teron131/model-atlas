---
name: benchmark-review
description: Review any proposed, rejected, or selected Model Atlas benchmark against the repository's standards and current primary evidence, from one candidate to the weekly portfolio audit. Use for admission, frontier/baseline/rejected classification, retention or removal, task and grading inspection, provenance and leaderboard quality, version changes, drift and benchmark health, allocation or index-breadth questions, and decision pages that collect the user's answers, even when the user only pastes benchmark links or asks "what next" after a review. Every review applies its fixes and obvious changes itself, then asks the user for the remaining decisions on a decision page.
---

# Benchmark Review

Judge each benchmark on its merits from the repository's current contract and primary evidence, fix whatever has one defensible answer, and bring the user only the real choices. The benchmark need not exist in the portfolio, source registry, snapshot, or database. Aim for a defensible standards decision, not a fixed report format.

## Workflow

Every review runs these stages in order; its scope decides how deep each one goes.

1. Scope the review: a candidate, a previously reviewed benchmark, a selected one, or the whole portfolio.
2. Establish the current contract from the repository, never from memory.
3. Gather evidence: stored health and local rows first, then the primary sources.
4. Judge: the standard for every benchmark; leaders, separation, versions, and adverse signals for selected ones; then the health verdict and classification.
5. Apply maintenance in the working tree and verify it.
6. Report in the conversation, and put the decisions on a decision page.
7. Implement the decisions the user answers.

The weekly review is this workflow run over the whole portfolio, with a screening pass that decides where stage 4 goes deep.

## What A Review Changes

Maintenance is any change with one defensible answer under standing policy: a version catch-up, switching to a newer version's address, fixing a pipeline defect whose cause has been reproduced, or correcting a doc claim the evidence now contradicts. Every review applies its maintenance without asking first, verifies it, and reports it as done; an item not applied yet is reported as "not yet applied", never as a fix. Decisions are classification, allocation, breadth, metric, and removal choices: they go to the user on a decision page, and the review implements them once answered.

- Leave git state, pull requests, and published snapshots alone unless the user asks, since a local snapshot publish goes to production.
- Query the existing SQLite checkpoint read-only, and build any checkpoint a check needs under `.cache/`.
- Run scrapers or refresh jobs to verify a change being applied, and otherwise only when the user asks.

## Scope The Review

- **New or untracked candidate:** start from the official benchmark evidence and decide whether it meets the standard. Local rows, Model Atlas coverage, and a scraper are not prerequisites for judging admission.
- **Rejected or previously reviewed benchmark:** reassess the current evidence instead of inheriting the old verdict.
- **Selected benchmark:** test whether it still earns its place as a frontier or baseline benchmark and its ranking space, adding drift evidence when local artifacts exist.
- **Portfolio audit:** derive the portfolio from the repository and hold every selected benchmark, baseline included, to the same standard; see Run The Weekly Review.

## Establish The Current Contract

Benchmark lists, source URLs, verdicts, database run numbers, and model ranks all change between audits, so read the current files before naming any of them:

1. `docs/standards.md` for admission, retention, and rejection criteria.
2. `docs/benchmarks.md` for portfolio decisions, each benchmark's source and metric choices, benchmark-specific resource policy, classification, and Intelligence/Agentic allocations.
3. `docs/methodology/overview.md`, which defines the terms every page uses, then the relevant pages beside it: `intelligence-agentic.md`, `speed-value.md`, `imputation.md`, `leaderboard-rules.md`, and `sources.md` for how sources combine, crosswalks, version changes, and updated releases.
4. When the benchmark is selected or comparison with the portfolio matters, `src/model-atlas/benchmarks/catalog/portfolio.ts` for the selected portfolio, each benchmark's `frontier` or `baseline` group, and its allocation (`dimensionLoadings`). When auditing a deployed result, compare these with the served payload metadata, and tell a deployment mismatch apart from a portfolio decision.
5. For a registered benchmark, `src/model-atlas/benchmarks/catalog/sources.ts` and `src/model-atlas/benchmarks/registry.ts` for raw source names, loaders, and URLs. A new candidate has no local entry; use its official sources.
6. When rank agreement matters, `app/dashboard/table/leaderboard-rows.ts`, `app/dashboard/table/sort.ts`, `src/model-atlas/pipeline/selection/public-list.ts`, `app/api/public-json.ts`, and `src/model-atlas/stats/model-variants.ts`. Follow the app's current default rank and its choice of the variant a Collapsed row shows; do not substitute another aggregate.
7. For selected benchmark values, `benchmarkValue` in `src/model-atlas/benchmarks/registry.ts`, which reads each value from where the catalog persists it, `model.benchmarks` or a `model.intelligence` field. The shared model contract lives in `src/model-atlas/pipeline/model-types.ts`, re-exported by `src/model-atlas/stats/types.ts`.

## Gather Evidence

### Find the evidence

Local artifacts are optional for a candidate review. The runtime reads published snapshots through `src/model-atlas/database/runtime-snapshot.ts`, whose manifest and locations come from `src/model-atlas/database/snapshots/manifest.ts`; a local override reads the SQLite checkpoint, by default `.cache/database.sqlite` (verify the path in `src/model-atlas/database/schema.ts`). Use an existing checkpoint or a read-only fetch of the served snapshot, and record which snapshot or timestamp the evidence represents. Do not assume a static JSON file exists under `public/`. Inspect the schema before querying, since run keys and columns change between checkouts.

Without a checkpoint or snapshot, the public API still gives rank evidence: `https://llmstats.vercel.app/api/llm-stats` ranks each listed model, and `/api/llm-stats/benchmarks/<key>` gives one benchmark's results with each model's leaderboard rank, but no stored health or source health. Without that either, continue the standards and primary-source review and state that rank agreement could not be measured, rather than refreshing or building a checkpoint to get it.

### Read stored health before computing anything

Each refresh stores a health entry for every portfolio benchmark, baseline included, in `snapshot_metadata.benchmark_update_health_json`, and the payload serves it as `metadata.benchmark_update_health`; `ModelAtlasBenchmarkUpdateEntry` in `src/model-atlas/stats/types.ts` defines each field. An entry holds the source and matched top five with each model's effort variants, the spread (full range, leader-to-runner-up gap, and top-five range with and without the leader), the top five's mean standard error where all five publish one, effort pairs whose lower effort scored higher, when the rows last changed, and when a source that could not be refreshed last fetched the rows it still serves. These are measurements without thresholds, so every judgment stays the review's; recompute only when the question needs another cohort. A null update time means no refresh has seen the rows change since tracking began, not that the source is stale.

Read entries one benchmark at a time, such as `select json_extract(benchmark_update_health_json, '$.hle') from snapshot_metadata`: one entry is a couple of thousand tokens, the whole column tens of thousands. A published snapshot is megabytes, so extract the needed fields with `jq` instead of reading it. A screen across every benchmark needs only the compared fields, which one query returns in a couple of thousand tokens:

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

Beyond health, the checkpoint holds final-model rank inputs and benchmark values, raw source rows and source-specific leaderboards, row states including missing or quarantined rows, stored source-specific update fields, and row counts and provenance fields.

### Read the primary sources

Use the official leaderboard, methodology, paper, repository, dataset card, sample tasks, grading or verifier details, and current results. Inspect at least two real task examples when they are available, as `docs/standards.md` requires.

## Judge The Benchmark

### Against the standard

For every benchmark, judge:

- capability meaning and fit for Intelligence, Agentic, or both
- task authenticity, difficulty, headroom, and current top-model spread
- grading quality, verifier strength, contamination risk, and exploitability
- whether results measure the model, the harness, or a model-plus-scaffold system, and same-harness versus mixed-harness comparability
- whether the selected metric, task version, model configuration, effort, and harness describe one comparable result series
- current model coverage and reasoning-effort sensitivity
- provenance: official, independent, vendor-reported, self-reported, private, or partially opaque
- redundancy with selected benchmarks and the uniqueness of its capability signal, compared with the current portfolio even for a new candidate
- whether structured, current results are available well enough for ongoing audit and ingestion

An unexpected winner is a reason to inspect task fit, grading, configuration, and harness effects, not evidence of bad methodology by itself.

### Leaders and separation

For a selected benchmark, source vitality and leader quality matter more than final-table coverage: a benchmark can be small, protected, expensive, frontier-focused, mixed-harness, vendor-reported, or niche-agentic and still be useful. Establish, where evidence permits:

- source leaders, including current top-tier rows excluded from final Model Atlas selection, and whether those are special, private, preview, or effort variants
- the top matched model's rank in the current default table
- how many of the top five matched models appear in the table's top 15, with the real denominator when fewer than five match, as context only, never a correctness or freshness test
- final-model coverage, as a confidence note only
- spread, top-five standard error, and effort inversions, from stored health
- when the rows last changed, whether a source serves cached rows, and missing or quarantined rows
- cheap availability or readability checks that need no full scrape
- provenance caveats stored in raw rows, missing current frontier families, and the uniqueness of the measured capability

Inspect the source's leaders before judging the subset that survives final-model selection. A current top-tier excluded row shows the source is still active; state why it is excluded before interpreting matched-rank agreement.

Judge headroom and separation by the Difficulty and Separation section of `docs/standards.md`, on a stated group of serious current models. Count models near a ceiling only within a band the benchmark's task granularity or uncertainty justifies, stating the band and the denominator; where no meaningful ceiling exists, do not infer saturation from a normalized scale. Never derive confidence intervals from aggregate leaderboard scores, or read decimal precision as resolution. Compare earlier evidence only within one version, metric, and protocol, on a fixed matched cohort where possible, so new entrants, effort or harness changes, regrading, and identity churn do not read as a trend. Revisit every benchmark retained despite approaching saturation or weak separation: state the original rationale from `docs/benchmarks.md`, whether it still holds, and what evidence would change it. Source activity alone does not justify frontier status.

### Versions

The standing policy is to use each benchmark's newest published version and never pool two versions. The refresh pipeline already adopts a new version published at the address Atlas reads when the structure is unchanged: a refresh that shares no version with the cached rows replaces them (`withoutSupersededVersions` in `src/model-atlas/sources/snapshots/policy.ts`). A version fixed by the address never changes, so that rule never fires there. Sort each selected benchmark's version state:

- **Adopted automatically.** The observed version (served `metadata.benchmark_versions`, or the rows' version in the checkpoint) is newer than the one prior evidence recorded. Scores, displayed versions, and the Timeline already follow it, because a version the rows report starts its own Timeline identity; nothing needs maintenance.
- **Successor at a new address.** A version selector, a superseded or replaced-by notice, a new artifact URL, or a new evaluation page means the newest version moved. Switching the catalog address is maintenance; only classification or allocation questions the new version raises, such as changed tasks, tools, harness, or grading, are decisions.
- **Rejected for structure.** A new version with a different component basket, subset layout, or task set yields no rows, so source health shows cached rows. Report the structural change and the breadth, metric, or allocation decision it needs.
- **Index basket drift.** The Artificial Analysis Intelligence Index keeps scoring whatever basket its rows list, so no failure signals a change. Compare the stored `artificial_analysis_raw_models.intelligence_index_components` with `ARTIFICIAL_ANALYSIS_INDEX_COMPONENTS` in `src/model-atlas/benchmarks/index-policy.ts`: a new slug for the same benchmark, such as a component's new version, is maintenance, while an added or dropped benchmark changes represented breadth and overlap and is a decision.
- **No published version.** For sources that publish none, such as Surge or an Artificial Analysis page whose title carries no version, look for silent reruns: shared rows moving together, a changed score granularity, or a cohort reset. Without a published version Atlas keeps the source's results as one series, so a confirmed rerun's scores simply replace the earlier ones; report it as a finding.
- **Deliberate pin.** A version pinned so one source matches the suite of another it is combined with, such as Terminal-Bench-Science's Vals series, is not stale while that suite is unchanged.
- **Pooled minor versions.** Where the publisher's own leaderboard pools minor versions it scores comparably, Atlas pools them too, through Epoch's `latestTaskVersion: "major"` as Chess Puzzles does. That is one version under the policy, not gap filling.
- **Gap filling across versions.** A rule that fills models missing from the newest version with an older version's rows pools two versions. Report it as a scoring defect, not as coverage.

For a successor version, a decision should not wait on evidence the review can gather: collect the successor's distribution on the same current cohort, how much of the task set and protocol changed, and whether the source still evaluates new models on the old version, then recommend a classification with its main risk.

### Adverse signals

Counts and statuses are starting points, not verdicts. For every adverse signal, answer three questions: what changed in the observed evidence; why it changed, or what concrete evidence would show why; and whether the cause materially weakens source vitality, comparability, provenance, capability meaning, or score evidence.

- **Reconcile identities first.** Match cached `before` identities against current-source `after` identities before treating missing or quarantined rows as lost evaluations, checking normalized model identity, provider, reasoning effort, harness, task, track, run, score, and source configuration. Display-label changes, aliases, explicit `default` labels, renamed effort labels, and one row splitting into several disclosed effort variants are identity churn, not benchmark drift, while the underlying evaluation remains represented.
- **Check the source family.** When a symptom suggests a source-wide schema, naming, or presentation change, inspect every selected benchmark that shares its source group, loader, parser, or persistence policy. Report the shared cause once, then each benchmark's actual effect; verify current rows rather than assuming every sibling is affected, and preserve real distinctions such as default versus explicit effort variants.
- **Keep stock and flow apart.** A quarantine count is the current stock of preserved missing keys; churn is the additions, disappearances, recoveries, and identity transitions between runs. Stable counts can hide turnover, and a large persistent count can be entirely renamed aliases. Compare row keys when available, and say when only net counts can be measured.
- **Remember quarantined rows still score.** A row missing from the current source is kept as evidence, so after a board is rerun, pruned, or moved to a new protocol, its earlier rows keep scoring beside the current ones until a version boundary drops them. Before calling missing rows harmless, check that retained and current rows belong to one version and protocol; HANDBOOK.md's silent rerun left dozens of earlier-protocol rows scoring this way.
- **Reproduce a suspected pipeline cause.** Apply the current merge, parser, or cache-acceptance function to the cached and current rows in memory, show that it yields the served value, and name the function and row keys. That turns a symptom such as stale scores into a located defect, which then is maintenance to fix.

Escalate only the material remainder. A pipeline identity defect, stale alias, or observability gap becomes maintenance once its cause is reproduced and stays a follow-up until then; either way it can leave the benchmark's health verdict unchanged. When the cause cannot be established from the evidence available, name the uncertainty and the decision it could affect instead of presenting the symptom as the conclusion.

### Health verdict and classification

A selected benchmark gets a health verdict:

- `keep`: the source is alive, evaluates current serious systems, and supplies an interpretable, useful capability signal. Different agents, divergence from the overall table, and self-reported or unverified provenance do not prevent keep by themselves.
- `watch`: the source appears active, but a material weakness remains after reconciliation, such as opaque harness effects, consistently weak or stale leaders without a capability-specific explanation, isolated, contradictory, or unauditable provenance, or sparse evidence combined with another adverse signal.
- `review`: the source appears dead or materially stale, leaders are generally weak with no credible niche explanation, evaluations are genuinely missing after reconciliation and materially weaken the signal, or the methodology or provenance is too opaque or inconsistent to interpret.

Thin final-model coverage alone never escalates a benchmark; it counts only beside stale or weak leaders, source disappearance, evaluations genuinely missing after identity reconciliation, poor provenance, or broader evidence that the benchmark no longer measures its claimed capability. Disclosed agents or harnesses are model-plus-agent evidence, not a watch signal, unless opaque or incompatible harness effects undermine the claim. A benchmark's winner need not be the overall top model, especially for a specialized capability. Self-reported, vendor-reported, and unverified rows are provenance labels, not automatic watch signals, when they stay attributable, understandable, comparable across several current serious systems, and coherent with other evidence. Expert, panel, crowd, or model-judge grading is acceptable when blind comparison, enough judgments, and order and presentation controls make its ranking justifiable; escalate when those controls are missing and the ranking looks implausible, not because of who grades. Treat dates as context rather than strict equality checks, and tolerate rank disagreement more for narrow agentic workflows and unique capabilities than for broad frontier Intelligence claims.

When the evidence supports a decision, every benchmark, candidate or selected, also gets exactly one classification: `frontier`, `baseline`, or `rejected`, matching `docs/standards.md`. Keep frontier while credible, demanding tasks still separate current serious systems with meaningful headroom. Recommend baseline when frontier separation has weakened but reliable evidence still adds important breadth or stability; baseline is not the automatic destination for a saturated benchmark. Recommend rejection when saturation or clustering leaves no important baseline value, or when the standards establish a material compromise; an active source can still merit removal. A `keep` verdict can sit beside a baseline or removal recommendation, so state both. Explain the capability and evidence behind the classification, and keep benchmark merit apart from ingestion: difficult access or an unimplemented scraper can block adoption without making the benchmark low quality. Never leave a decision blocked when evidence the review can gather would settle it. When essential evidence cannot be obtained, say what blocks the classification and what would unblock it, instead of inventing a fourth one.

### Portfolio policy

When a decision touches portfolio policy:

- Frontier benchmark results carry weight in capability scores, while baseline results stay visible and carry none, as `docs/benchmarks.md` and the scoring owners define. Aggregate indexes have their own eligibility and represented-breadth rules, read from the current catalog and `src/model-atlas/benchmarks/index-policy.ts`, so a move between frontier and baseline is never a label-only edit.
- Coding benchmarks default to Agentic; add a substantial Intelligence allocation only when algorithmic, mathematical, scientific, or research reasoning materially determines success.
- Keep accepted source crosswalks, estimates from other benchmarks, and estimates across reasoning efforts apart, using `docs/methodology/sources.md` and `docs/methodology/imputation.md`. Crosswalks supply accepted benchmark results; estimates from other benchmarks supply discounted evidence and resource-comparison inputs; supported estimates from another effort of the same model can fill missing capability contributions without counting as observed. No estimate satisfies the observed-evidence requirements for dashboard inclusion.

## Run The Weekly Review

The weekly review audits every portfolio benchmark, baseline included, and keeps no notes between runs, so each review stands on the current evidence.

1. Establish the contract, snapshot, and dashboard rank semantics once, then read stored health and source health for every benchmark.
2. Screen every benchmark: version, leaders, spread, standard error, coverage, last update, fetch state, and quarantined rows.
3. Investigate in depth only the benchmarks whose stored health changed, that sit near saturation or were retained despite weak separation, or that remain materially uncertain. Reuse still-applicable methodology evidence with its date and source, and re-inspect tasks and grading when a change or doubt could affect a decision.
4. Apply the maintenance the review found, then report and put the decisions on a decision page.

Delegate evidence gathering when independent source families can be inspected in parallel: two or three subagents, not one per benchmark, each owning every benchmark that shares its loader, parser, or persistence policy. Give each the shared contract and snapshot, the source links, a read-only boundary, and a concrete evidence deliverable. Subagents report evidence, provenance, calculations, and uncertainties; the reviewer verifies material findings, applies the maintenance, and owns every verdict and recommendation. While they run, advance another part of the review, then integrate their evidence without repeating their inspection. Avoid recursive delegation, other sessions, worktrees, duplicate downloads, and repeated polling.

## Report

Lead with the conclusion and its strongest evidence, and keep the report short enough to act on. Label evidence by kind: final public observations, raw source leaderboard rows, matched final-model evidence, inferred comparisons, or unavailable evidence. An individual review uses the smallest structure that makes its judgment auditable. A portfolio audit runs in this order:

1. keep/watch/review counts and the number of decisions
2. the maintenance applied, each with how it was verified, and anything not yet applied
3. each decision in one line with its recommendation, then the decision page's path
4. a compact table with one row per benchmark: classification and allocation, version, source leader and whether it is current, matched-rank context, coverage, gap, top-five range, top standard error, last update, fetch state, verdict, and recommended classification
5. attention notes for watch and review items and for benchmarks retained despite weak separation, holding the detailed calculations
6. follow-ups the review couldn't settle, such as manually inspecting a source, checking excluded leaders, or persisting a missing raw source

For every watch or review item, give the observed symptom, the best-supported cause, whether that cause affects benchmark merit or only ingestion, identity, or observability, and why the effect is material enough for the verdict. The user should never have to infer significance from dates, counts, provenance labels, or health statuses.

## Ask For Decisions On A Decision Page

The user answers decisions on a local HTML page with a click per decision, so the page carries only what they need to decide; background, calculations, and Atlas's own data stay in the conversation report.

- Each decision shows its question, the recommended option with a one-line reason, at most two notes for facts the leaderboards don't show, the source leaderboards, and the options with their changes written `old → new`.
- The question names the change, such as "Move EBR-Bench from frontier to baseline?"; the reason gives the one fact that decides it; a note is one sentence with its number; an option gets a description only when its change doesn't explain itself.
- Screenshots are the sources' leaderboards: the ranked table or chart itself, one per source the decision turns on. Hero sections, changelogs, posts, dataset cards, and custom charts don't count; a fact only a page's prose states becomes a note.
- Leave out anything that doesn't change the answer, such as methodology background, Atlas data links, contents, and footers.

1. In one headless `playwright-cli` session, open each source page, find the leaderboard's own element in a snapshot, and screenshot that element rather than the page: `playwright-cli screenshot <ref> --filename=.cache/decision-page/shots/<name>.png`. Epoch shows a board only after its "Leaderboard" tab is clicked. Look at every image, and redo any that shows prose or a page header instead of the ranking.
2. Copy [decision-page.html](decision-page.html) to `.cache/decision-page/index.html` and fill only `REVIEW` and `DECISIONS`, one entry per open decision with a short slug `id`. Look at the rendered page once before handing it over, since a `recommended` id that names no option stops the page from building.
3. Hand the user `.cache/decision-page/index.html` itself, beside the one-line decisions in the report; it loads its screenshots from `shots/` next to it. Don't publish it as an artifact.
4. The user pastes the page's Copy answers text into the chat, one line per decision. A decision answered "either is fine" means following the recommendation, and a note in parentheses is a condition to act on.

## Implement The Answers

The pasted answers are the user's ask to implement those decisions. Make the changes, verify them on the real result, and report what each decision changed, such as scores moved and models entering or leaving the listing.
