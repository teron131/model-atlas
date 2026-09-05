# Model Matching

The same model can appear under different names on benchmark pages, catalogs, and serving platforms. Model Atlas joins those records so its scores, specifications, prices, and speed measurements describe the same underlying model and reasoning configuration.

A mistaken join can give one model another model's evidence. The matcher therefore leaves uncertain associations unmatched. A rejected catalog match does not erase a separately identified benchmark model; it leaves catalog metadata unavailable.

## Identity Sources

A benchmark identity can exist before a public catalog entry. A qualified Artificial Analysis provider/model ID, a nonempty name, and confirmed text output can keep that model in the pipeline even when no catalog candidate is accepted. It retains only source-reported metadata, and other benchmark results can attach through the same identity and effort checks.

Keeping the identity does not guarantee publication. Incomplete metadata is allowed in a preview only when the model meets the ordinary observed-benchmark requirements.

An OpenRouter route is the preferred public identity when it wins the match, because route IDs connect directly to pricing and serving measurements. `models.dev` supplies candidate pools and catalog metadata. Trusted direct OpenAI, Google, Anthropic, and Vercel identities can win when they provide a stronger exact match.

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

Versions and parameter scales can identify different models even when the surrounding name is nearly identical. A conflict in these fields can therefore reject a candidate outright.

## Candidate Pool

For each source slug, the matcher collects candidates from the preferred `models.dev` provider pools. OpenRouter routes and trusted direct-provider identities enter the same ranked pool, allowing an exact direct identity to beat a weak OpenRouter alias.

The first token is an early family guardrail. A source and candidate that begin with different model-family tokens are not compared further.

OpenRouter remains the preferred public identity only when its candidate actually wins. Route availability does not override a stronger identity match.

## Candidate Score

The match score orders plausible identity candidates. It is a heuristic, not the probability that a match is correct: agreement raises it, while missing or conflicting identity information lowers it.

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

After choosing the best candidate for each source row, the matcher checks for unusually weak winners within that batch. The lowest best-match score $s_{\min}$ and highest $s_{\max}$ set the relative cutoff:

$$
s_{\text{cutoff}}=s_{\min}+0.35(s_{\max}-s_{\min}).
$$

For an illustrative batch ranging from 20 to 100, the cutoff is $20+0.35(100-20)=48$. A winner below 48 is discarded. Because the threshold depends on the current batch, the same raw score need not pass every batch. It is not a universal confidence probability.

## Variant Guardrail

After ranking, the matcher checks labels that distinguish important variants, including `flash-lite`, `flash`, `pro`, `nano`, `mini`, `lite`, `max`, `image`, `vl`, `coder`, `small`, `micro`, `codex`, `omni`, `multi-agent`, and `latest`.

If the source has one of these labels and the candidate does not, or the candidate has one and the source does not, the candidate is rejected. Multi-token labels remain distinct, so `flash-lite` does not count as plain `flash`.

Reasoning effort is a configuration of the base model, so its suffix is removed before the variant-label check. The matcher tries ranked candidates until one survives. This keeps distinctions such as `flash` versus `flash-lite` or text versus image routes from being erased by a superficially similar name.

Benchmark-update health uses the same ranking and variant boundary with stricter full-token coverage. A source row therefore remains explicitly unrepresented when only a weak family-prefix candidate exists.

## Claude Identity

Claude tier and version are structural identity fields even though Anthropic has changed their order over time. Historical forms such as `Claude 3 Opus` and `claude-3-opus` normalize with `Claude Opus 3`, while the compact `claude-35-sonnet` form resolves to Claude Sonnet 3.5. Current route names can also match reordered dated permaslugs when the tier and version agree.

The tiers `haiku`, `sonnet`, `opus`, and `fable` are mutually exclusive. When the correct tier is unavailable, the source row remains unmatched rather than borrowing another Claude tier.

Dates and route labels do not define the base model. Reasoning and configuration labels remain separate observations. A missing source `reasoning_effort` stays null; the matcher does not infer an effort from a display name or choose among unlabelled observations by benchmark score.

## Selected Identity

An accepted catalog match uses the winning provider and model ID as its public identity and attaches catalog metadata from `models.dev`. An unmatched qualified Artificial Analysis identity instead retains only source-reported metadata, leaving genuinely missing prices, limits, and serving measurements unknown.

Resource fallback works field by field. Catalog input/output prices take precedence over Artificial Analysis prices, and effective OpenRouter prices take precedence for Value scoring. Exact-effort Artificial Analysis throughput and latency can fill serving fields only when primary measurements are unavailable. Each refresh recomputes these choices, so primary data takes over when it arrives without a stale override.

Artificial Analysis token prices are USD per million tokens, throughput is output tokens per second, and latency is seconds; total benchmark evaluation costs are never treated as token prices.

Both paths attach benchmark evidence before applying the publication rules described in [Methodology](methodology.md#public-admission).

Serving aliases such as fast, free, latest, preview, high-effort, or dated routes do not automatically become separate public models. Aliases that point to the same underlying model share one canonical identity. Explicit reasoning-effort observations remain separate scored configurations.

An unlabelled observation represents the source-default configuration. If all observations name an effort, the highest reported effort supplies the default. Storage preserves every reported effort. A sparse effort's capability score can later use a well-measured sibling's score plus their gap on common benchmarks, without forcing effort order to be monotonic.

Expanded views keep exact-effort results. Compact views use the highest-Intelligence representative and can fill its missing benchmark fields from the highest available direct effort, while retaining the distinction between a model-level display and an exact-effort observation.