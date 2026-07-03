# Model Matching

The stats pipeline has to join model rows from sources that do not use the same identifiers. Artificial Analysis gives source slugs and scraped model ids. `models.dev` gives provider/model ids and model metadata. OpenRouter provides the preferred public route ids plus price and speed keyed by provider/model ids. The matcher exists to turn AA rows into stable provider/model ids without hand-maintaining a mapping table for every model.

## Source Shape

The source stage fetches AA scraper rows, `models.dev` rows, and supplemental benchmark sources. AA rows are keyed by the model slug derived from `model_id`, usually the part after the provider slash. `models.dev` rows are first reduced to preferred providers: OpenRouter is primary, Vercel is secondary, and OpenAI/Google/Anthropic are trusted fallbacks. When multiple rows share a model id, the preferred provider wins. The recent-model cutoff keeps the catalog small, but AA-backed exact ids and normalized AA names are retained even when the catalog row is older than the cutoff. This lets stable OpenRouter rows such as older Gemini routes or provider-renamed Mistral routes remain matchable when AA still reports benchmark rows for them.

DeepSWE, Terminal-Bench 2, and Agents Last Exam are not identity authorities. They are joined later by display-name/id candidates after the AA-to-`models.dev` match has chosen a stable provider/model id.

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
- non-positive final score
- first-token mismatch

The score is only meant to rank plausible candidates. It is not a probability.

## Void Threshold

After every AA row has a best candidate, the matcher applies a dynamic low-score cutoff. It takes the minimum and maximum best-match scores and places the cutoff at:

$$
\text{threshold}=\text{min score}+0.35\cdot(\text{max score}-\text{min score})
$$

Any best match below that threshold is voided. In the diagnostics payload this is reported as `void_mode: "maxmin_range"`. The point is to remove weak matches after seeing the score range for the batch.

## Variant Conflict Check

After the matcher scores candidates, the Model Atlas match stage applies another guardrail using configured variant tokens from `src/model-atlas/constants.ts`: `flash-lite`, `flash`, `pro`, `preview`, `nano`, `mini`, `lite`, `max`, `image`, `omni`, `multi-agent`, and `latest`.

If the AA slug has one of those labels and the candidate model id does not, or the candidate model id has one and the AA slug does not, that candidate is rejected. Multi-token labels are matched as labels, so `flash-lite` does not count as plain `flash`. The match stage walks the ranked candidate list and keeps the first candidate that survives this guardrail. This is deliberately blunt. Matching a `flash` row to a `flash-lite` model, an `omni` row to a non-omni model, or a base model row to an `image` or `latest` route is worse than dropping the row.

## Final Matched Row

Once a match survives, the final matched row prefers the OpenRouter provider/model id for public identity, uses `models.dev` for catalog metadata, and preserves AA benchmark fields. OpenRouter catalog aliases such as `-fast`, `-xhigh`, `-high`, and dated suffixes normalize to the same public id because they are route labels for the same model, not separate scored models:

- public `id`, preferably the OpenRouter route id
- provider id
- OpenRouter id
- AA id and AA slug for traceability
- display name from `models.dev` when available
- family, modalities, context, cost, attachment/reasoning/open-weights fields from `models.dev`
- evaluations, intelligence fields, and intelligence-index cost fields from AA
- supplemental benchmark values from DeepSWE, Terminal-Bench 2, Agents Last Exam, BrowseComp, Toolathlon, and CursorBench when a model-name candidate matches those sources
- `scoring_sources` with the raw supplemental rows used to derive DeepSWE and Agents Last Exam task metrics

The later OpenRouter enrichment stage can merge route aliases that point at the same underlying scored model, such as reasoning-effort routes, fast routes, dated aliases, and free routes. The public id is the canonical OpenRouter id with catalog alias suffixes removed, while public display names strip route noise such as `(free)`, `(latest)`, and Gemini `Preview` labels. This keeps the public payload aligned with route-level pricing and speed while still making it possible to trace a score back to the AA row that supplied the benchmark data.

## Database Traceability

The SQLite snapshot preserves the raw source paths used by the matcher:

- `aa_raw_models` stores scraped AA rows.
- `models_dev_raw_models` stores flattened `models.dev` provider/model rows.
- `deep_swe_raw_rows`, `artificial_analysis_evaluation_resource_raw_rows`, `vals_terminal_bench_raw_rows`, `agents_last_exam_raw_rows`, `browsecomp_raw_rows`, `toolathlon_raw_rows`, `cursorbench_raw_rows`, `vals_index_raw_rows`, and `riemann_bench_raw_rows` store supplemental benchmark/resource rows before they are summarized or matched.
- `openrouter_raw_rows` stores OpenRouter directory rows, candidate permaslugs, metric points, and model stats.
- `processed_models` stores the matched, catalog, enriched, and final stages.
- `matcher_debug` stores one matcher-candidate trace row per AA candidate, plus placeholder rows for unmatched or voided AA rows.

`matcher_debug` is meant to make a final-row decision traceable back to raw inputs. For each candidate it records the AA id/slug/name, raw AA row index, candidate rank, candidate provider/model/name/score, selected/rejected flags, rejection reason, selected model id, matching `models.dev` raw row index, OpenRouter model id, and OpenRouter stats row index when available.

## Debugging Bad Matches

Start with the matcher diagnostics or the `matcher_debug` table rather than the final payload. Check:

- the AA slug and source name
- the best candidate id and score
- the next few candidates
- whether the row was voided
- whether a variant token mismatch rejected it later
- whether OpenRouter won when a direct fallback provider exact match would have been cleaner
- the raw row indexes linked from `matcher_debug` when the final payload is not enough

Most bad matches come from one of four cases: source slug changed upstream, candidate id changed upstream, two sibling variants are too similar, or a route tag looked like identity even though it was just a serving route.
