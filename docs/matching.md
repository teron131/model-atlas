# Matching

Model Atlas combines benchmark results, model metadata, pricing, and serving performance from sources that do not share one identifier system. Matching turns those source-specific names into stable public model identities while keeping genuinely different versions and configurations separate.

## Source Shape

Artificial Analysis supplies benchmark-oriented model slugs, `models.dev` supplies provider/model identities and metadata, and OpenRouter supplies the preferred public routes used for price and speed data. Vercel and direct OpenAI, Google, or Anthropic identities provide trusted fallbacks when they give a cleaner exact match.

Benchmark pages are evidence sources, not identity authorities. Their rows join a model only after the matcher has selected a stable catalog identity. This prevents a source-local display name from silently creating a new model or overriding a better provider identity.

Candidate scoring uses only identity-bearing fields:

- the source model slug
- candidate model and provider ids
- candidate provider and display names

## Normalization

Before scoring, names are normalized into comparable tokens. Normalization lowercases names, replaces separators like dots, spaces, colons, and underscores with hyphens, removes unusual characters, collapses repeated hyphens, and trims separators.

Then model names are split into tokens. For example, mixed alphanumeric pieces are split so version and size information can be compared. Some route/style tags are ignored because they are usually not part of model identity: `free`, `extended`, `exacto`, `instruct`, `vl`, `thinking`, `reasoning`, `online`, and `nitro`.

The matcher also treats scale tokens specially:

- plain numeric tokens, such as `3` or `5`
- billion-scale tokens, such as `70b`
- active-parameter tokens, such as `a22b`

These matter because a wrong size match is usually worse than a small text-name mismatch.

## Candidate Pool

For each AA source slug, candidates are collected from the preferred `models.dev` provider pools.

The first guardrail is first-token matching. If the AA slug starts with one family token and the candidate id/name starts with another, the candidate is rejected early. This prevents obvious cross-family matches.

The matcher scores OpenRouter candidates and trusted fallback-provider candidates against the same source slug. When OpenRouter supplies candidates, both pools are combined and ranked by the matching heuristic, so an exact trusted-provider row can beat a weaker OpenRouter alias. OpenRouter remains the preferred public identity when its candidate wins because route identity, pricing, and speed data are keyed through OpenRouter ids.

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

Any best match below that threshold is discarded. The cutoff removes weak matches relative to the score range of the current source batch.

## Claude Identity Policy

Claude tier and version are structural identity fields even though Anthropic changed their order over time. Historical names such as `Claude 3 Opus` and `claude-3-opus` normalize with the current-style `Claude Opus 3` form, while the known compact `claude-35-sonnet` form maps to Claude Sonnet 3.5. Current OpenRouter routes such as `claude-opus-4.6` also recognize reordered dated permaslugs such as `claude-4.6-opus-20260205`.

The tier is never treated as noise: `haiku`, `sonnet`, `opus`, and `fable` are mutually exclusive. If the correct tier is unavailable, the source row remains unmatched instead of borrowing another Claude tier. Dates and route labels remain outside model identity, while reasoning or configuration labels such as `thinking` stay separate observations. A missing source `reasoning_effort` remains null; variant construction groups Claude configuration observations by tier/version and treats the canonical unlabelled observation as the source default rather than inferring an effort or choosing among null observations by score.

## Variant Conflict Check

After scoring candidates, the matcher applies another guardrail for variant labels such as `flash-lite`, `flash`, `pro`, `nano`, `mini`, `lite`, `max`, `image`, `vl`, `coder`, `small`, `micro`, `codex`, `omni`, `multi-agent`, and `latest`. Artificial Analysis reasoning-effort suffixes are collapsed before this check, so an effort row such as `model-max` still matches the base model identity.

If the AA slug has one of those labels and the candidate model id does not, or the candidate model id has one and the AA slug does not, that candidate is rejected. Multi-token labels are matched as labels, so `flash-lite` does not count as plain `flash`. The match stage walks the ranked candidate list and keeps the first candidate that survives this guardrail. This is deliberately blunt. Matching a `flash` row to a `flash-lite` model, an `omni` row to a non-omni model, or a base model row to an `image` or `latest` route is worse than dropping the row.

Benchmark-update health uses the same candidate ranking and variant-selection boundary with stricter full-token coverage enabled. That keeps an official source row explicitly unrepresented when only a weak family-prefix match exists.

## Selected Identity

The selected match prefers an OpenRouter provider/model id for public identity and uses `models.dev` for catalog metadata. Benchmark values are attached only when their source row resolves to that identity.

Serving aliases such as fast, high-effort, free, latest, preview, or dated routes do not automatically become separate public models. Aliases that point to the same underlying model share one canonical identity, while explicit reasoning-effort observations remain separate scored configurations.

When an unlabelled source observation exists, it represents the source-default configuration. If every observation has an effort label, Model Atlas selects the highest reported effort as one complete observation rather than combining the best fields from different configurations. Compact views show the highest-Intelligence scored variant for each base model; the full view preserves every scored effort variant.
