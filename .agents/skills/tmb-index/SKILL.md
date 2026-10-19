---
name: tmb-index
description: "Use when running or integrating the scheduled Trust Me Bro Index ranking for Model Atlas: fetch candidates, research Reddit and YouTube, and submit supported inequalities to the TMB API with a verified receipt."
---

# Trust Me Bro Index

The Trust Me Bro Index expresses the overall practical intelligence of Model Atlas's newest leading models through the experiences people report on Reddit and YouTube.
One research run produces one dated ranking containing one or more compatible inequalities; it need not resolve every pair or give every model an exact position.
The backend converts the supported relationships into a bounded Intelligence correction and owns the table and header-card display.

## Run

Use one GPT-6.1 Sol session with xhigh reasoning for a scheduled research run.

1. `GET /api/tmb/candidates` for the models to research.
2. Read [the research prompt](research.md), research only those candidates, and write the report and ranking JSON below.
Record `prompt_version` in the run log as `tmb-research-` followed by the SHA-256 of the research prompt used.
3. For a configured publishing run, `pnpm tmb:submit ranking.json` posts the file and reads it back from `/api/tmb/rankings/{ranked_at}`.
It exits non-zero unless the stored ranking is exactly what was sent.
It reads `MODEL_ATLAS_TMB_SUBMIT_TOKEN` from the existing environment; `MODEL_ATLAS_TMB_BASE_URL` overrides the default `https://llmstats.vercel.app`.
Never put the token in prompts, files, command text, or logs.

For a rehearsal, stop after writing the local report and ranking; do not submit it or turn a trial into an initial published ranking.

## Ownership

The [research prompt](research.md) owns discovery, the two-month source window, current-candidate shorthand, source preferences, evidence standards, and judgment.
Its main driver is people's overall impression of a model after relying on it as their main partner across substantive work; edge cases such as one dramatic success or failure, a rescue of another model's work, a specialist role, or a price-driven switch can qualify a placement but never set one.
This file owns the automation workflow and output contract.
Research produces qualitative comparisons, never numerical ratings, distances, confidence weights, places, or adjusted scores.

## Candidates

`GET /api/tmb/candidates` returns `{ "as_of": "YYYY-MM-DD", "models": [{ "model_id", "name", "release_date" }] }`.
Candidates are the unadjusted Intelligence top ten of the current benchmark snapshot, then only releases after the date two calendar months before `as_of` (today, UTC), with no backfill.
A submission is checked against the candidates current when it arrives; if a benchmark refresh changed them, the error names the model that no longer qualifies.
Models are sorted by id, with no scores or earlier TMB order supplied to the researcher.

## Ranking contract

`POST /api/tmb/rankings` with `Authorization: Bearer <token>` and this JSON body:

| Field | Rule |
| --- | --- |
| `ranked_at` | Actual UTC completion time to the second, like `2026-10-19T05:00:00Z`; not in the future. It is the ranking's version and id. |
| `inequalities` | A nonempty array of strongest-to-weakest chains, each containing at least two entries. |

Each chain entry has a candidate `model_id` and a `relation` to the entry immediately above it.
The first entry has no relation; subsequent entries use `=`, `≥`, `>`, or `≫`.
A model occurs at most once within a chain and may occur in multiple chains to connect supported relationships.
Chain order conveys no additional ranking, and repeating a model or relationship adds no numerical weight.

For example, the chains `A > B > C` and `B > D` place D below A and B while leaving C versus D unresolved.
The backend rejects chains whose directions conflict, including an ordered pair that `=` also joins; express a supported tie with `=`, not opposing chains.

These two fields are the site's ranking contract.
Everything else, such as `as_of`, candidates, `prompt_version`, relationship reasons and sources, unresolved comparisons, and why candidates were omitted, remains in the stored ranking verbatim as the run log.
Account for every candidate: included in at least one inequality, or omitted with a reason because no comparative placement is supported.

## Numerical boundary

The backend uses all inequalities together to find the closest score assignment satisfying the supported relationships, with each distinct model counted once.
Only `=` requires equal target scores; `≥`, `>`, and `≫` all constrain the lower model's target not to exceed the upper model's target.
Their qualitative differences remain visible in the inequalities rather than becoming numerical distances.
Unknown comparisons add no constraint; they do not mean equality, last place, or exemption from other supported relationships.
The existing shared 40% pull and five-point movement cap apply to this joint target; omitted models receive no TMB correction.
The backend never invents a complete order: the table shows the place a model's relationships fix, or the range they leave open, such as `#3–4`.

## Responses and publication

- `201` new ranking accepted; `200` identical retry of an accepted ranking.
The receipt contains `ranked_at` and `active`, which is false when a newer ranking is already active.
- `400 { errors: [...] }` lists validation problems; `409` means different content already holds that `ranked_at`; `401` bad token; `503` submissions not configured; `500` storage failure.
Treat errors as unverified publication; after a storage failure, retry the identical file and verify its read-back rather than assuming nothing was written.
- `GET /api/tmb/rankings/{ranked_at}` returns `{ ranking, active }`; `GET /api/tmb/rankings/current` returns the active ranking.

Accepted rankings are immutable objects at `tmb/rankings/{ranked_at}.json` in the public snapshot bucket; a correction is a new ranking with a later `ranked_at`.
`tmb/current.json` names the active ranking and is replaced only by compare-and-swap: the newest `ranked_at` wins, and a late older ranking is stored without displacing a newer one.
The site rechecks the active pointer every 30 seconds; no deployment or benchmark refresh is needed for a new ranking.
Benchmark refreshes, snapshot publication, and checkpoint restores never touch `tmb/`.

## Server configuration

The site needs `MODEL_ATLAS_TMB_SUBMIT_TOKEN` (a long random secret shared with the automation) and `MODEL_ATLAS_TMB_WRITER_CREDENTIALS` (a service-account JSON key).
That account needs `storage.objects.get`, `storage.objects.create`, and `storage.objects.delete` on objects under `tmb/` in the public snapshot bucket, for example through an IAM condition on the `tmb/` name prefix; delete is required because replacing `tmb/current.json` overwrites it.
Without the configured submission credentials, submissions return `503` and the site shows the last accepted ranking, or none.
