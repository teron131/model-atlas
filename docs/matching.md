# Model Matching

The stats pipeline has to join model rows from sources that do not use the same identifiers. Artificial Analysis gives source slugs and scraped model ids. `models.dev` gives provider/model ids and model metadata. OpenRouter provides the preferred public route ids plus price and speed keyed by provider/model ids. The matcher exists to turn AA rows into stable provider/model ids without hand-maintaining a mapping table for every model.

## Source Shape

The source stage fetches AA scraper rows, AA evaluation-resource rows, `models.dev` rows, and non-AA benchmark sources. AA rows are keyed by the model slug derived from `model_id`, usually the part after the provider slash. `models.dev` rows are first reduced to preferred providers: OpenRouter is primary, Vercel is secondary, and OpenAI/Google/Anthropic are trusted fallbacks. When multiple rows share a model id, the preferred provider wins. The recent-model cutoff keeps the catalog small, but AA-backed exact ids and normalized AA names are retained even when the catalog row is older than the cutoff. This lets stable OpenRouter rows such as older Gemini routes or provider-renamed Mistral routes remain matchable when AA still reports benchmark rows for them.

AA evaluation-resource pages are still Artificial Analysis sources, but they are not identity authorities. Non-AA benchmark sources are also not identity authorities. Both kinds of resource rows are joined later by display-name/id candidates after the AA-to-`models.dev` match has chosen a stable provider/model id.

The matcher input is intentionally small:

- source slug from AA
- source name from AA when available
- candidate model id from `models.dev`
- candidate provider id/name from `models.dev`
- candidate display name from `models.dev`

The output keeps the best candidate plus a ranked candidate list for diagnostics.

## Normalization

Before scoring, names are normalized into comparable tokens. The code lowercases, replaces separators like dots, spaces, colons, and underscores with hyphens, removes unusual characters, collapses repeated hyphens, and trims separators.

Then model names are split into tokens. For example, mixed alphanumeric pieces are split so version and size information can be compared. Some route/style tags are ignored because they are usually not part of model identity: `free`, `extended`, `exacto`, `instruct`, `vl`, `thinking`, `reasoning`, `online`, and `nitro`.

The matcher also treats scale tokens specially:

- plain numeric tokens, such as `3` or `5`
- billion-scale tokens, such as `70b`
- active-parameter tokens, such as `a22b`

These matter because a wrong size match is usually worse than a small text-name mismatch.

## Candidate Pool

For each AA source slug, candidates are collected from the preferred `models.dev` provider pools.

The first guardrail is first-token matching. If the AA slug starts with one family token and the candidate id/name starts with another, the candidate is rejected early. This prevents obvious cross-family matches.

The matcher first scores OpenRouter candidates. It also scores fallback provider candidates, but fallback providers are only used when there are no plausible OpenRouter candidates. OpenRouter remains the public identity authority when it has a candidate, because route identity, pricing, and speed enrichment are keyed through OpenRouter ids.

## Candidate Score

The score is a weighted heuristic, not a machine-learning model. It rewards things that usually mean "same model" and penalizes things that usually mean "wrong sibling".

Main rewards:

- matching token prefixes, with earlier tokens worth more
- exact numeric/version match
- small numeric closeness when exact version is missing
- same variant suffix, such as a family suffix or model edition
- exact token coverage when candidate tokens cover the AA slug cleanly
- exact billion-scale match, such as the same `70b`
- exact active-parameter match, such as the same `a22b`
- character prefix similarity after normalization

Main penalties:

- missing source tokens from the candidate
- mismatched billion-scale value
- missing billion-scale value when the source has one
- mismatched active-parameter value
- large normalized length gap

Hard rejects:

- no normalized character prefix overlap
- hard billion-scale mismatch when both sides expose a scale
- numeric version-prefix conflicts, such as matching a source `3` row to a candidate `3.5` or matching a source `3.5` row to a candidate `3`
- leading numeric identity mismatches when neither the candidate id nor candidate display name shares the source's leading version number
- non-positive match score
- first-token mismatch

The score is only meant to rank plausible candidates. It is not a probability.

## Void Threshold

After every AA row has a best candidate, the matcher applies a dynamic low-score cutoff. It takes the minimum and maximum best-match scores and places the cutoff at:

$$
\text{threshold}=\text{min score}+0.35\cdot(\text{max score}-\text{min score})
$$

Any best match below that threshold is voided. In the diagnostics payload this is reported as `void_mode: "maxmin_range"`. The point is to remove weak matches after seeing the score range for the batch.

## Claude Identity Policy

Claude tier and version are structural identity fields even though Anthropic changed their order over time. Historical names such as `Claude 3 Opus` and `claude-3-opus` normalize with the current-style `Claude Opus 3` form, while the known compact `claude-35-sonnet` form maps to Claude Sonnet 3.5. Current OpenRouter routes such as `claude-opus-4.6` also recognize reordered dated permaslugs such as `claude-4.6-opus-20260205`.

The tier is never treated as noise: `haiku`, `sonnet`, `opus`, and `fable` are mutually exclusive. If the correct tier is unavailable, the source row remains unmatched instead of borrowing another Claude tier. Dates and route labels remain outside model identity, while reasoning or configuration labels such as `thinking` stay separate observations. A missing source `reasoning_effort` remains null; the aggregate groups Claude configuration observations by tier/version and treats the canonical unlabelled observation as the source default rather than inferring an effort or choosing among null observations by score.

## Variant Conflict Check

After scoring candidates, the matcher applies another guardrail using configured variant tokens from `src/model-atlas/config/stage-config.ts`: `flash-lite`, `flash`, `pro`, `nano`, `mini`, `lite`, `max`, `image`, `vl`, `coder`, `small`, `micro`, `codex`, `omni`, `multi-agent`, and `latest`. Artificial Analysis reasoning-effort suffixes are collapsed before this check, so an effort row such as `model-max` still matches the base model identity.

If the AA slug has one of those labels and the candidate model id does not, or the candidate model id has one and the AA slug does not, that candidate is rejected. Multi-token labels are matched as labels, so `flash-lite` does not count as plain `flash`. The match stage walks the ranked candidate list and keeps the first candidate that survives this guardrail. This is deliberately blunt. Matching a `flash` row to a `flash-lite` model, an `omni` row to a non-omni model, or a base model row to an `image` or `latest` route is worse than dropping the row.

Benchmark-update health uses the same candidate ranking and variant-selection boundary with stricter full-token coverage enabled. That keeps an official source row explicitly unrepresented when only a weak family-prefix match exists.

## Final Matched Row

Once a match survives, the final matched row prefers the OpenRouter provider/model id for public identity, uses `models.dev` for catalog metadata, and preserves AA benchmark fields. OpenRouter catalog aliases such as `-fast`, `-xhigh`, `-high`, and dated suffixes normalize to the same public id because they are route labels for the same model, not separate scored models:

- public `id`, preferably the OpenRouter route id
- provider id
- OpenRouter id
- AA id and AA slug for traceability
- display name from `models.dev` when available
- family, modalities, context, cost, attachment/reasoning/open-weights fields from `models.dev`
- evaluations, intelligence fields, and intelligence-index cost fields from AA
- selected benchmark values from AA evaluation-resource pages and non-AA benchmark sources when their model-name candidates match the selected identity
- `scoring_sources` with the raw AA evaluation-resource and non-AA source rows used to derive task metrics

The explicit aggregation stage merges route aliases that point at the same underlying scored model, such as reasoning-effort routes, fast routes, dated aliases, and free routes. Matched reasoning-effort observations remain separate rows with their own `reasoning_effort` and exact AA resource rows. The aggregate selects the source-default row when effort is unlabelled, or the highest reported effort when labels are present, and keeps that observation's score and resource fields together. Only after selection does benchmark enrichment attach default-effort AA resources and effort-unspecified supplemental sources such as DeepSWE or Vals. Benchmark-update health applies the same model/effort aggregation before comparing source leaders with the public Intelligence ranking. The public id is the canonical OpenRouter id with catalog alias suffixes removed, while public display names strip route noise such as `(free)`, `(latest)`, plain `Latest`, and Gemini `Preview` labels.

## Database Traceability

The SQLite snapshot preserves the raw source paths used by the matcher:

- `artificial_analysis_raw_models` stores scraped AA rows, including separate reasoning-effort observations.
- `models_dev_raw_models` stores flattened `models.dev` provider/model rows.
- `deep_swe_raw_rows`, `artificial_analysis_evaluations_raw_rows`, `vals_terminal_bench_raw_rows`, `agents_last_exam_raw_rows`, `browsecomp_raw_rows`, `toolathlon_raw_rows`, `cursorbench_raw_rows`, `vals_index_raw_rows`, and `riemann_bench_raw_rows` store supplemental benchmark/resource rows before they are summarized or matched.
- `openrouter_raw_rows` stores OpenRouter directory rows, candidate permaslugs, metric points, and model stats.
- `model_stage_rows` stores the effort-preserving matched and catalog stages, including `reasoning_effort`, followed by derived enriched and final aggregate stages.
- `model_match_debug` stores one matcher-candidate trace row per AA candidate, plus placeholder rows for unmatched or voided AA rows.

`model_match_debug` is meant to make a final-row decision traceable back to raw inputs. For each candidate it records the AA id/slug/name, raw AA row index, candidate rank, candidate provider/model/name/score, selected/rejected flags, rejection reason, selected model id, matching `models.dev` raw row index, OpenRouter model id, and OpenRouter stats row index when available.

## Debugging Bad Matches

Start with the matcher diagnostics or the `model_match_debug` table rather than the final payload. Check:

- the AA slug and source name
- the best candidate id and score
- the next few candidates
- whether the row was voided
- whether the matcher rejected it for a variant token mismatch
- whether OpenRouter won when a direct fallback provider exact match would have been cleaner
- the raw row indexes linked from `model_match_debug` when the final payload is not enough

Most bad matches come from one of four cases: source slug changed upstream, candidate id changed upstream, two sibling variants are too similar, or a route tag looked like identity even though it was just a serving route.
