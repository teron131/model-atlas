# Model Matching

Model Atlas joins benchmark results, catalog metadata, pricing, and serving performance from sources that use different identifiers. Matching resolves those source-specific names to one stable public model identity without merging genuinely different versions, tiers, or reasoning configurations.

The matcher is deliberately conservative. Dropping an uncertain row is safer than attaching evidence to the wrong model.

## Identity Sources

Benchmark pages provide measurements, not canonical identities. Their rows join the public model table only after the matcher resolves them to a catalog model.

The preferred identity comes from a public OpenRouter route because pricing and speed data use that route ID. `models.dev` supplies provider pools and catalog metadata. Direct OpenAI, Google, Anthropic, and Vercel identities act as trusted fallbacks when they provide a cleaner exact match.

Candidate scoring uses only identity-bearing fields:

- the source model slug
- candidate provider and model IDs
- candidate provider and display names

Benchmark scores, prices, release dates, and other non-identity fields cannot influence the match.

## Normalization

Each name is lowercased and converted to a comparable hyphenated form. Dots, spaces, colons, and underscores become separators; unusual characters are removed; repeated separators collapse; and leading or trailing separators are trimmed.

The normalized name is then split into tokens. Mixed alphanumeric pieces are separated so versions and parameter scales can be compared directly. Route and serving labels that usually do not define the underlying model are ignored: `free`, `extended`, `exacto`, `instruct`, `vl`, `thinking`, `reasoning`, `online`, and `nitro`.

Three token classes receive special treatment:

- plain versions such as `3` or `5`
- parameter scales such as `70b`
- active-parameter scales such as `a22b`

A wrong version or model size is usually more serious than a small spelling difference, so these tokens can reject a candidate rather than merely lower its score.

## Candidate Pool

For each source slug, the matcher collects candidates from the preferred `models.dev` provider pools. OpenRouter routes and trusted direct-provider identities enter the same ranked pool, allowing an exact direct identity to beat a weak OpenRouter alias.

The first token is an early family guardrail. A source and candidate that begin with different model-family tokens are not compared further.

OpenRouter remains the preferred public identity only when its candidate actually wins. Route availability does not override a stronger identity match.

## Candidate Score

The score is a ranking heuristic, not a probability. It rewards evidence that two names identify the same model and penalizes signs that they identify neighboring variants.

The strongest rewards are:

- matching token prefixes, weighted toward earlier tokens
- exact numeric and version agreement
- small numeric distance when an exact version is unavailable
- matching family or edition suffixes
- complete source-token coverage
- exact parameter-scale and active-parameter-scale agreement
- normalized character-prefix similarity

The strongest penalties are:

- source tokens missing from the candidate
- conflicting parameter scales
- a source scale that is absent from the candidate
- conflicting active-parameter scales
- a large difference in normalized name length

A candidate is rejected when it has no normalized character-prefix overlap, conflicts on a hard parameter scale, conflicts on a leading numeric identity, receives a non-positive score, or fails the first-token family guardrail. Version-prefix conflicts are also hard failures: a source version `3` does not match `3.5`, and `3.5` does not match `3`.

## Relative Cutoff

After every source row has a best candidate, the matcher removes unusually weak winners relative to the current batch. With the minimum best-match score $s_{\min}$ and maximum best-match score $s_{\max}$, the cutoff is

$$
s_{\text{cutoff}}=s_{\min}+0.35(s_{\max}-s_{\min}).
$$

A best match below $s_{\text{cutoff}}$ is discarded. The cutoff is relative to the score range of the current source batch; it is not a universal confidence probability.

## Variant Guardrail

After ranking, the matcher checks labels that distinguish important variants, including `flash-lite`, `flash`, `pro`, `nano`, `mini`, `lite`, `max`, `image`, `vl`, `coder`, `small`, `micro`, `codex`, `omni`, `multi-agent`, and `latest`.

If the source has one of these labels and the candidate does not, or the candidate has one and the source does not, the candidate is rejected. Multi-token labels remain distinct, so `flash-lite` does not count as plain `flash`.

Reasoning-effort suffixes are removed before this check because effort identifies a scored configuration, not a different base model. The matcher walks the ranked candidates until one survives the guardrail. Matching a base model to an image route, a `flash` model to `flash-lite`, or an `omni` model to a non-omni sibling is worse than leaving the row unmatched.

Benchmark-update health uses the same ranking and variant boundary with stricter full-token coverage. A source row therefore remains explicitly unrepresented when only a weak family-prefix candidate exists.

## Claude Identity

Claude tier and version are structural identity fields even though Anthropic has changed their order over time. Historical forms such as `Claude 3 Opus` and `claude-3-opus` normalize with `Claude Opus 3`, while the compact `claude-35-sonnet` form resolves to Claude Sonnet 3.5. Current route names can also match reordered dated permaslugs when the tier and version agree.

The tiers `haiku`, `sonnet`, `opus`, and `fable` are mutually exclusive. When the correct tier is unavailable, the source row remains unmatched rather than borrowing another Claude tier.

Dates and route labels do not define the base model. Reasoning and configuration labels remain separate observations. A missing source `reasoning_effort` stays null; the matcher does not infer an effort from a display name or choose among unlabelled observations by benchmark score.

## Selected Identity

The selected match uses the winning provider and model ID as its public identity and attaches catalog metadata from `models.dev`. Benchmark values join only after their source row resolves to that identity.

Serving aliases such as fast, free, latest, preview, high-effort, or dated routes do not automatically become separate public models. Aliases that point to the same underlying model share one canonical identity. Explicit reasoning-effort observations remain separate scored configurations.

An unlabelled observation is the source-default configuration; when every observation is labelled, the highest reported effort becomes the default. Canonical storage keeps every result on its reported effort. After matching, a model's single direct effort result may bound missing sibling scoring proxies by canonical effort priority to offset sparse-evidence confidence bias. Expanded views remain exact-effort only; compact views show the highest available direct effort at model level without relabelling it as the representative effort.
