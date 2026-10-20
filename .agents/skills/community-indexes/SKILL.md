---
name: community-indexes
description: "Run or integrate the shared TMB and Slop Index research for Model Atlas: fetch candidates, explore Reddit and YouTube, judge overall practical capability and visual output quality, and publish both graphs with a verified receipt."
---

# Community Indexes

One research run explores Reddit and YouTube and judges the same candidates twice: TMB for overall practical capability, including design, and Slop for the quality of websites, interfaces, and 2D or 3D visual work.
Each judgment is a graph expressed as one or more compatible inequalities; neither must resolve every pair or give every model an exact position.
Both graphs and their evidence share one immutable completion timestamp and are published together.
The backend converts the supported relationships into a bounded Intelligence correction and owns the table and header-card display.

## Run

Use one GPT-6.1 Sol session with xhigh reasoning for a scheduled research run.
Keep discovery and judgment in the scheduled conversation so its searches, source reading, and explanations remain inspectable; the submission script handles validation, authentication, and read-back.

1. `GET /api/community/candidates` for the models to research.
2. Read [the research prompt](research.md), research only those candidates, and write the report and ranking JSON below.
Record `prompt_version` in the run log as `community-research-` followed by the SHA-256 of the research prompt used.
3. For a configured publishing run, `pnpm community:submit ranking.json` posts the file and reads it back from `/api/community/rankings/{ranked_at}`.
It exits non-zero unless the stored ranking is exactly what was sent.
It reads `MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN` from the existing environment; `MODEL_ATLAS_COMMUNITY_BASE_URL` overrides the default `https://llmstats.vercel.app`.
Never put the token in prompts, files, command text, or logs.

For a rehearsal, stop after writing the local report and ranking; do not submit it or turn a trial into an initial published ranking.

## Ownership

`src/model-atlas/community/catalog.ts` declares the peer indexes, their influence, and their presentation order; `src/model-atlas/community/rankings.ts` owns the shared graph contract and correction.
`src/model-atlas/database/snapshots/community-rankings.ts` owns dated persistence, while `/api/community` and `scripts/community-submit.ts` are its HTTP and automation entrypoints.

The [research prompt](research.md) owns discovery, the two-month source window, current-candidate shorthand, source preferences, evidence standards, and judgment.
TMB follows accumulated impressions after substantive use as a main working partner; Slop follows judgments of the delivered visual result.
This file owns the automation workflow and output contract.
Research produces qualitative comparisons, never numerical ratings, distances, confidence weights, places, or adjusted scores.

## Candidates

`GET /api/community/candidates` returns `{ "as_of": "YYYY-MM-DD", "models": [{ "model_id", "name", "release_date" }] }`.
Candidates are the unadjusted Intelligence top ten of the current benchmark snapshot, then only releases after the date two calendar months before `as_of` (today, UTC), with no backfill.
A submission is checked against the candidates current when it arrives; if a benchmark refresh changed them, the error names the model that no longer qualifies.
Models are sorted by id, with no scores or earlier index order supplied to the researcher.

## Ranking contract

`POST /api/community/rankings` with `Authorization: Bearer <token>` and this JSON body:

| Field | Rule |
| --- | --- |
| `ranked_at` | Actual UTC completion time to the second, like `2026-10-19T05:00:00Z`; not in the future. It is the ranking's version and id. |
| `indexes` | Object with `tmb` and `slop` graphs, each an array of strongest-to-weakest chains containing at least two entries. |

Both `indexes.tmb` and `indexes.slop` are required.
An array may be empty when that index has no supported relationship; record the evidence gap and do not fabricate one.
At least one index must contain a supported chain; if neither can be judged, report the failed research run without submitting.

For example, a run can publish different directions under the two standards:

```json
{
  "ranked_at": "2026-10-19T05:00:00Z",
  "indexes": {
    "tmb": [[{ "model_id": "A" }, { "model_id": "B", "relation": ">" }]],
    "slop": [[{ "model_id": "B" }, { "model_id": "A", "relation": "≥" }]]
  }
}
```

Replace the illustrative A and B with candidate IDs.
Each chain entry has a candidate `model_id` and a `relation` to the entry immediately above it.
The first entry has no relation; subsequent entries use `=`, `≥`, `>`, or `≫`.
A model occurs at most once within a chain and may occur in multiple chains to connect supported relationships.
Chain order conveys no additional ranking, and repeating a model or relationship adds no numerical weight.

For example, the chains `A > B > C` and `B > D` place D below A and B while leaving C versus D unresolved.
The backend rejects conflicting directions within either graph, including an ordered pair that `=` also joins.
Different directions between the two indexes are allowed because they answer different questions; never merge their edges into one graph.

These two fields are the site's ranking contract; `/api/community` carries the shared record.
Everything else, such as `as_of`, candidates, `prompt_version`, relationship reasons and sources, unresolved comparisons, and why candidates were omitted, remains in the stored ranking verbatim as the run log.
Account for every candidate separately for each index: included in at least one inequality, or omitted with a reason because no comparative placement is supported.

## Numerical boundary

The backend solves each graph independently from the same original Intelligence scores, with each distinct model counted once per graph.
Only `=` requires equal target scores; `≥`, `>`, and `≫` all constrain the lower model's target not to exceed the upper model's target.
Their qualitative differences remain visible in the inequalities rather than becoming numerical distances.
Unknown comparisons add no constraint; they do not mean equality, last place, or exemption from other supported relationships.
The targets are blended 75% TMB and 25% Slop, then one shared 40% pull and five-point movement cap apply.
A model absent from one graph uses its original score as that graph's target; missing influence is not redistributed.
The agent never calculates the correction or applies one index after the other.
The backend never invents a complete order: the table shows the place a model's relationships fix, or the range they leave open, such as `#3–4`.

## Responses and publication

- `201` new ranking accepted; `200` identical retry of an accepted ranking.
The receipt contains `ranked_at` and `active`, which is false when a newer ranking is already active.
- `400 { errors: [...] }` lists validation problems; `409` means different content already holds that `ranked_at`; `401` bad token; `503` submissions not configured; `500` storage failure.
Treat errors as unverified publication; after a storage failure, retry the identical file and verify its read-back rather than assuming nothing was written.
- `GET /api/community/rankings/{ranked_at}` returns `{ ranking, active }`; `GET /api/community/rankings/current` returns the active ranking.

Accepted rankings store both graphs atomically at `community/rankings/{ranked_at}.json` in the public snapshot bucket; a correction is a new record with a later `ranked_at`.
`community/current.json` names the active ranking and is replaced only by compare-and-swap: the newest `ranked_at` wins, and a late older ranking is stored without displacing a newer one.
The site rechecks the active pointer every 30 seconds; no deployment or benchmark refresh is needed for a new ranking.
Benchmark refreshes, snapshot publication, and checkpoint restores never touch `community/`.

## Server configuration

The site needs `MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN` (a long random secret shared with the automation) and `MODEL_ATLAS_COMMUNITY_WRITER_CREDENTIALS` (a service-account JSON key).
That account needs `storage.objects.get`, `storage.objects.create`, and `storage.objects.delete` on objects under `community/` in the public snapshot bucket, for example through an IAM condition on the `community/` name prefix; delete is required because replacing `community/current.json` overwrites it.
Without the configured submission credentials, submissions return `503` and the site shows the last accepted ranking, or none.
