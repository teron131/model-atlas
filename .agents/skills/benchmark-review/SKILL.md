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
2. Read `docs/benchmarks.md` for portfolio decisions, source precedence, metric selection, reconciliation, benchmark-specific resource policy, classification, importance, and Intelligence/Agentic loadings.
3. Start with `docs/methodology/overview.md`, then read the relevant `intelligence-agentic.md`, `imputation.md`, `speed-value.md`, and `leaderboard-rules.md` pages in that directory for the current scoring and display contracts.
4. When the benchmark is selected or comparison with the portfolio matters, derive the selected portfolio, `frontier` or `baseline` group, benchmark importance, and Intelligence/Agentic loadings from `src/model-atlas/benchmarks/catalog/portfolio.ts`. Compare those definitions with the served payload metadata when auditing a deployed result; distinguish a deployment mismatch from a portfolio decision.
5. For a registered benchmark, derive raw source names, loaders, and URLs from `src/model-atlas/benchmarks/catalog/sources.ts` and `src/model-atlas/benchmarks/registry.ts`. For a new candidate, use its official primary sources and do not expect a local registry entry.
6. When rank agreement matters, inspect `app/dashboard/table/models.ts`, `src/model-atlas/pipeline/selection/public-list.ts`, `app/leaderboard/public-json.ts`, and `app/leaderboard/model-variants.ts` before reconstructing the displayed rank. Follow the app's current default rank and variant-collapse semantics; do not substitute another aggregate.
7. For selected benchmark values, follow `benchmarkMetricValue` in `src/model-atlas/pipeline/scores/resource-metrics.ts`, which reads `model.benchmarks` and the supported `model.intelligence` fields. The shared model contract lives in `src/model-atlas/pipeline/model-types.ts` and is re-exported by `src/model-atlas/stats/types.ts`.

Never rely on a benchmark list, source URL, prior verdict, database run number, or model rank remembered from an earlier audit.

## Use Available Local Evidence

Local portfolio artifacts are optional for candidate review. The normal runtime reads published artifacts through `src/model-atlas/database/runtime-snapshot.ts`; derive their manifest and locations from `src/model-atlas/database/snapshots/manifest.ts`. A local override instead reads the SQLite checkpoint, whose default path is `.cache/database.sqlite`; verify the current path in `src/model-atlas/database/schema.ts`. Use an existing checkpoint or a read-only fetch of the served artifact appropriate to the audit, and record which revision or timestamp the evidence represents. Do not assume a static JSON file exists under `public/`.

Use the existing SQLite database only for evidence such as:

- final-model rank inputs and benchmark values
- raw source rows and source-specific leaderboards
- source row states, including missing or quarantined rows
- source health, fetched timestamps, and stored source-specific update fields
- source row counts and provenance fields

Inspect the schema before querying; do not assume run keys or columns from an older checkout. If no suitable published artifact or existing SQLite checkpoint is available, continue the standards and primary-source review, state that rank agreement could not be measured, and do not refresh or create an artifact.

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

## Diagnose Signals Before Judging Them

Do not report symptom counts without explaining their cause and consequence. For every adverse signal, answer three questions:

1. What changed in the observed evidence?
2. Why did it change, or what concrete evidence is still needed to determine why?
3. Does the cause materially weaken source vitality, comparability, provenance, capability meaning, or score evidence?

Counts and statuses are starting points, not verdicts. Reconcile cached `before` identities against current-source `after` identities before treating missing or quarantined rows as lost evaluations. Check normalized model identity, provider, reasoning effort, harness, task, track, run, score, and source configuration. Display-label changes, aliases, explicit `default` labels, renamed effort labels, and one row splitting into several disclosed effort variants are identity churn rather than benchmark drift when the underlying evaluation remains represented.

When a symptom suggests a source-wide schema, naming, or presentation change, inspect every selected benchmark that shares the same source group, loader, parser, or persistence policy before limiting the diagnosis to one benchmark. Report the shared source-family cause once, then state the actual benchmark-specific effect. Do not assume every sibling is affected: verify current rows and preserve real distinctions such as default versus explicit reasoning-effort variants.

Keep stock and flow separate. A quarantine count is the current stock of preserved missing keys; churn is the set of additions, disappearances, recoveries, and identity transitions between runs. Stable counts can hide turnover, while a large persistent count can consist entirely of harmless renamed aliases. Compare row keys when available and state when only net counts can be measured.

Escalate only the material remainder after reconciliation. A pipeline identity defect, stale alias, or observability gap can merit a follow-up without changing the benchmark verdict. If the cause cannot be established from available read-only evidence, name the uncertainty and the decision it could affect instead of presenting the symptom as the conclusion.

## Apply Drift Judgment Carefully

Use these verdicts for already-selected benchmarks:

- `keep`: source leaders are current and serious, matched leaders broadly agree with strong table models, or the benchmark supplies a clearly useful unique or niche capability signal.
- `watch`: source appears active but a material unresolved weakness remains after causal reconciliation, such as opaque harness effects, consistently weak or stale leaders without a capability-specific explanation, unauditable provenance, or sparse evidence combined with another adverse signal.
- `review`: source leaders are stale or weak, matched leaders are mostly outside the table top 20 without a credible niche explanation, evaluations are genuinely missing after identity reconciliation and materially weaken the signal, or provenance is isolated, contradictory, configuration-opaque, or otherwise too weak to interpret.

Do not escalate a benchmark because of thin final-model coverage alone. Escalate sparse coverage only when it combines with stale or weak leaders, source disappearance, genuinely missing evaluations after identity reconciliation, poor provenance, or consistently weak matched ranks.

Different disclosed agents or harnesses are not themselves a watch signal; interpret those rows as model-plus-agent evidence and escalate only when opaque or incompatible harness effects undermine the claim. A benchmark winner need not be the overall top-ranked model, especially for a specialized capability. Self-reported, vendor-reported, and unverified rows are provenance labels rather than automatic watch signals when they remain attributable, understandable, comparable across multiple current serious systems, and coherent with other evidence.

Treat dates as context rather than strict equality checks. Separate benchmark merit from pipeline persistence or observability problems. Be more tolerant of rank disagreement for narrow agentic workflows and unique capabilities than for broad frontier Intelligence claims.

## Report Evidence, Not Certainty

Distinguish:

- final public observations
- raw source leaderboard rows
- matched final-model evidence
- inferred comparisons
- unavailable evidence

Lead with the verdict and the strongest evidence. For portfolio audits, give keep/watch/review counts, a compact comparison table, attention notes only for watch/review items, and non-code next actions. For individual reviews, use the smallest structure that makes the judgment auditable.

For every watch or review item, report the observed symptom, the best-supported cause, whether the cause affects benchmark merit or only ingestion/identity/observability, and why that effect is material enough for the verdict. Do not leave the user to infer significance from dates, counts, provenance labels, or health statuses.

Recommend follow-ups such as manually inspecting a source, checking excluded leaders, persisting a missing raw source, reconsidering classification, or running a live scraper in a separately approved task. Do not propose code patches during a read-only review.
