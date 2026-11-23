# Community ranking contract

What the candidate and ranking APIs accept and return, what the backend computes from a submitted ranking, and how publication works; [the skill](../SKILL.md) owns the workflow that produces the ranking.

## Ownership

`src/model-atlas/community/catalog.ts` declares the peer indexes, their influence, and their presentation order; `src/model-atlas/community/rankings.ts` owns the shared graph contract and correction.
`src/model-atlas/database/community-rankings.ts` owns the append-only SQLite records; `src/model-atlas/database/snapshots/community-rankings.ts` owns publication through the shared checkpoint.
`/api/community` forwards submissions to the Cloud Run writer started by `scripts/community-server.ts`; `scripts/community-submit.ts` is the automation entrypoint.
Research produces qualitative comparisons, never numerical ratings, distances, confidence weights, places, or adjusted scores.

## Candidates

`GET /api/community/candidates` returns `{ "as_of": "YYYY-MM-DD", "models": [{ "model_id", "name", "release_date" }], "catalog": [{ "model_id", "name", "release_date" }] }`.
Candidates are the unadjusted Intelligence top 15 of the current benchmark snapshot, using the highest-scored effort per model and the normal display exclusions, then only releases from the 90 days ending at `as_of` (today, UTC), with no backfill.
`catalog` supplies the full snapshot's distinct model identities, including models outside the candidate pool and null release dates when unknown; it contains no scores or ranking history.
[The research standard](research.md) owns the latest-version decision and its recorded reasons; catalog entries outside `models` provide identity context and never expand eligibility.
The endpoint and submission writer enforce the top-15 and release-date filters; they do not infer model succession from names.
The research source window remains 60 days.
A submission is checked against the candidates current when it arrives; if a benchmark refresh or the moving window changed them, the error names the model that no longer qualifies.
Fetch the candidates again just before submitting.
Remove only the relationships and nickname of a placed model that no longer qualifies and record them in the run log as withdrawn findings; account for a newly qualifying model as omitted because it entered after research.
Recheck the latest-version decisions against the refreshed catalog and withdraw a placed version if a newly released successor supersedes it.
Models are sorted by id, with no scores supplied to the researcher.

## Ranking

`POST /api/community/rankings` with `Authorization: Bearer <token>` and this JSON body:

| Field | Rule |
| --- | --- |
| `ranked_at` | Actual UTC completion time to the second, like `2026-10-19T05:00:00Z`; not in the future. It is the ranking's version and id. |
| `indexes` | Object with `tmb` and `slop` graphs, each an array of strongest-to-weakest chains containing at least two entries. |
| `nicknames` | Object mapping every `model_id` placed in either index to the label its header-card graph draws: unique within the ranking and at most 12 characters. |

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
  },
  "nicknames": { "A": "A", "B": "B" }
}
```

Replace the illustrative A and B with candidate IDs and their nicknames.
Each chain entry has a candidate `model_id` and a `relation` to the entry immediately above it.
The first entry has no relation; subsequent entries use `=`, `≥`, `>`, or `≫`.
A model occurs at most once within a chain and may occur in multiple chains to connect supported relationships.
Chain order conveys no additional ranking, and repeating a model or relationship adds no numerical weight.

For example, the chains `A > B > C` and `B > D` place D below A and B while leaving C versus D unresolved.
The backend rejects conflicting directions within either graph, including an ordered pair that `=` also joins.
Different directions between the two indexes are allowed because they answer different questions; never merge their edges into one graph.

Nicknames keep the header-card graph narrow; its hover, the inequality text, and the table keep full names.
Give each placed model the shortest name people commonly use for it that no other placed model shares.
Keep versions where people use them or they distinguish placed models; drop provider or family names when the remaining label stays unambiguous.

These three fields are the site's ranking contract; `/api/community` carries the shared record.
Everything else, such as `as_of`, candidates, `prompt_version`, the baseline's `ranked_at` and the changes from it, the coverage grid, relationship reasons and sources, unresolved comparisons, and why candidates were omitted, remains in the stored ranking verbatim as the run log.
Account for every candidate separately for each index: included in at least one inequality, or omitted with a reason because no comparative placement is supported.

## Numerical boundary

The backend solves each graph independently from the same original Intelligence scores, with each distinct model counted once per graph.
Only `=` requires equal target scores; `≥`, `>`, and `≫` all constrain the lower model's target not to exceed the upper model's target.
Their qualitative differences remain visible in the inequalities rather than becoming numerical distances.
Unknown comparisons add no constraint; they do not mean equality, last place, or exemption from other supported relationships.
The targets are blended equally, 50% TMB and 50% Slop, then one shared 50% pull and five-point movement cap apply.
A model absent from one graph uses its original score as that graph's target; missing influence is not redistributed.
The agent never calculates the correction or applies one index after the other.
The backend never invents a complete order: the table shows the place a model's relationships fix, or the range they leave open, such as `#3–4`.

## Submission and publication

`pnpm community:submit ranking.json` posts the file and reads it back from `/api/community/rankings/{ranked_at}`.
It exits non-zero unless the stored ranking is exactly what was sent.
It loads the repository environment and reads `MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN`, or retrieves `MODEL_ATLAS_COMMUNITY_TOKEN_SECRET` from Google Secret Manager using application-default credentials.
`MODEL_ATLAS_COMMUNITY_BASE_URL` overrides the default `https://llmstats.vercel.app`.
Never put the token in prompts, files, command text, or logs.

- `201` new ranking accepted; `200` identical retry of an accepted ranking.
The receipt contains `ranked_at` and `active`, which is false when a newer ranking is already active.
- `400 { errors: [...] }` lists validation problems; `409` means different content already holds that `ranked_at`; `401` bad token; `413` submission exceeds 4 MiB; `503` submissions not configured; `500` writer failure; `502` publication could not be confirmed through the site.
Treat errors as unverified publication; after a storage failure, retry the identical file and verify its read-back rather than assuming nothing was written.
After three identical attempts fail the same way, stop and report the run as unpublished with the saved file, which stays valid for a later retry while every placed model still qualifies.
- `GET /api/community/rankings/{ranked_at}` returns `{ ranking, active }`; `GET /api/community/rankings/current` returns the active ranking.

Accepted rankings are rows in `community_rankings` in the same authoritative SQLite checkpoint as benchmark evidence.
`ranked_at` is the primary key; the stored record preserves both graphs and the full research log, and the latest timestamp is active.
The writer restores the current checkpoint, validates candidates from its unadjusted scores, inserts the record, and publishes through the same compare-and-swap manifest as benchmark refreshes.
If another publisher wins, the submission restores the newer checkpoint and retries up to three times; it never overwrites a concurrent refresh or ranking.
An identical accepted retry returns its receipt without republishing.
Publication may take several minutes because it transfers the checkpoint; the submission script allows five minutes, and an uncertain timeout must be retried with the identical file.

The public ranking artifact is generated from SQLite and published under the same snapshot version as the benchmark payload; it is a read cache, not an independently writable store.
The site rechecks that shared snapshot every 30 seconds, while ranking API read-back revalidates immediately.
Benchmark refreshes preserve ranking history; an explicit snapshot rollback restores the rankings captured in that database version.

## Server configuration

The site needs `MODEL_ATLAS_COMMUNITY_WRITER_URL`, the Cloud Run service origin.
The writer uses the existing benchmark publisher service account and both snapshot buckets, plus `MODEL_ATLAS_COMMUNITY_SUBMIT_TOKEN` supplied from Secret Manager.
Run it with `pnpm community:serve`; deployment shares the benchmark image, limits each instance to one request, and scales to zero when idle.
The automation can use the token directly in its environment or set `MODEL_ATLAS_COMMUNITY_TOKEN_SECRET` to a Secret Manager version resource such as `projects/<project>/secrets/<secret>/versions/latest`.
No service-account key is required on the site or in the automation prompt.
