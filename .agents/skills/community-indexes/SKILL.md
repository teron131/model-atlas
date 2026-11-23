---
name: community-indexes
description: "Run or integrate the shared TMB and Slop Index research for Model Atlas: fetch candidates and the last published graphs, research Reddit, YouTube, and X through subagents in staged passes tracked on a coverage grid, update the judgments of overall practical capability and visual output quality, and publish both graphs with a verified receipt."
---

# Community Indexes

One research run explores Reddit, YouTube, and X and judges the same candidates twice: TMB for overall practical capability, including design, and Slop for the quality of websites, interfaces, and 2D or 3D visual work.
Each judgment is a graph of compatible inequalities that need not resolve every pair; the backend turns it into a bounded Intelligence correction.
Each run updates the last published graphs rather than rebuilding them, so the graphs change when opinion changes rather than with what one run happened to read.
Its value lies in the comparisons people actually make, and the first thing a run loses is a pair it calls unsupported without ever searching the two models against each other.
The run is complete when every cell of its coverage grid has a verdict, not when a ranking can be written.

## Setup

Any agent harness can run the research.
Reddit and X come through [the scrape script](scripts/scrape.mjs), which calls the Scrape Creators API, and YouTube through the YouTube toolkit, as [the research standard](references/research.md) describes.
The main researcher runs the searching through subagents, as [Subagents](#subagents) assigns, and keeps the scope, the draft, the final judgment, and the coverage verdicts, so raw search output never fills its context and its reasoning remains inspectable.

Read [the research standard](references/research.md) before searching, since its evidence and judgment rules define what each stage looks for, and [the contract](references/contract.md) before writing or submitting the ranking.
Keep the run's files in `.cache/community-research/<as_of>/`, verified Git-ignored: the candidate response, source archives and scrape script outputs, the stage summaries, the coverage grid, the report, and the ranking JSON.
Record `prompt_version` in the run log as `community-research-` followed by one SHA-256 over this file and the research standard, concatenated in that order.

## Stages

1. **Scope:** fetch `GET /api/community/candidates` and the baseline from `GET /api/community/rankings/current`, resolve latest versions, and update the baseline by the research standard's rules: remove models that are no longer retained candidates, reopen comparisons that ran only through them, and mark which models are new to each index. This opens the grid's rows.
2. **Field search:** split the retained models into three groups of equal workload, counting a model new to either index as 2 and any other as 1, and mix providers within each group. For each group, a Reddit, a YouTube, and an X subagent search its models against the whole field: general use, visual work, and the comparisons people make with other candidates, with X searched only by comparison, and in an index where a model holds baseline relationships only sources since the baseline's `ranked_at`, which mainly check those relationships. Every cross-group pair is then searched from both sides, so no search runs per pair.
3. **Draft:** judge both graphs from the stage 2 summaries, starting from the retained baseline relationships.
4. **Targeted pairs:** list the open comparisons that matter, namely each new model against its neighbors in the draft, comparisons reopened in Scope, and any relationship the draft would revise; split them into up to three groups and search each directly in every lane, including the models' common shorthand.
5. **Judge and report:** settle both graphs on top of every stage summary, opening the underlying sources only where summaries disagree or a consequential relationship rests on one source, then write the report and ranking JSON by the research standard and the contract.
6. **Publish:** a configured publishing run fetches the candidates again, submits with `pnpm community:submit`, and verifies the read-back as [the contract](references/contract.md) describes; a rehearsal stops after the local report and ranking and never turns a trial into a published ranking.

## Stage summaries

Every search unit in stages 2 and 4 ends with a written summary, so the judgment rests on complete conclusions rather than on whatever a long session still holds in context.
A summary covers its unit's own sources:

- for each comparison the unit found, per index: the lean (`A > B`, `A ≥ B`, `A = B`, a split by type of work, or no evidence) with the one or two strongest passages on each side, their sources, and the use behind them;
- for each model it covered, the recurring impressions in a few sentences;
- what it searched for without finding, and what it could not reach.

Keep a summary within about 1,500 words, so the judgment can read every summary whole.
A summary's lean weighs only its own sources, so it is a lead for the judgment, not a placement; the judgment reconciles leans across summaries by the research standard.

## Subagents

Each search unit is one subagent for one group in one lane, Reddit, YouTube, or X, so a search stage runs up to nine.
Each writes its summary to `stage-<n>/<lane>-<group>.md` in the run folder, keeps its outputs in `sources/<lane>-<group>/`, leaves nothing else in the run folder, and returns only its summary path and leans, never raw search output.
Brief each with its lane, its group's models, the candidate list with `as_of`, the source window, the baseline relationships its models bear on, the summary format above, and an expected size of about ten minutes, and have it read [the research standard](references/research.md) before searching.
Launch a stage's units together: the slowest one sets the stage's length, so their expected size, not a source quota, keeps the run near half an hour.

## Coverage

Keep the grid in `coverage.md` in the run folder as two tables:

- **Models:** a row per retained candidate, with Use and Visual closed in stage 2 and TMB and Slop in stage 5.
- **Pairs:** a row per targeted comparison and index from stage 4.

Close every cell as one of:

- **Covered:** the stage summaries' conclusion for that cell.
- **Thin:** too little found after searching the ordinary names, their shorthand, and a direct comparison, with the queries tried.
- **Placed:** the model's relationships in that index, each marked as kept from the baseline, new, or revised with the newer evidence.
- **Omitted:** why no comparative placement is supportable after the targeted search.
- **Settled:** the relationship, or the genuine split the sources show; a relationship implied through other settled ones counts when no direct account contradicts it, and says so.
- **Open:** the targeted queries in every lane and what they found.
- **Not examined:** an access failure or limit that stopped the work, with the reason.

Use and Visual cells close as covered, thin, or not examined; TMB and Slop cells as placed or omitted; Pairs rows as settled, open, or not examined.
The draft waits for every stage 2 cell, and stage 5 for every Pairs row; when later evidence belongs to an earlier cell, reopen it and close it again.
When the baseline's run log carries a grid, start from its thin, open, and not examined cells.
Copy the closed grid's text, not its path, into the run log, so the next run can start from it on any machine.

## Finish

A drafted ranking returns the run to the targeted pairs, not to the report; a written ranking does not establish that the run is complete.
A cell is closed when its question is resolved with evidence, not when it has been searched once, and a comparison counts as lacking evidence only after its targeted search.
Before finishing, revisit the consequential comparisons, namely the leading models, every new model, and every revision, and check that each ended in a verdict.
Stop when every cell is closed; do not set source quotas or repeat exhausted searches to fill the grid.

## References

- [The research standard](references/research.md) owns latest-version and baseline rules, the source window and preferences, evidence standards, both judgments, and the report and log.
- [The contract](references/contract.md) owns the candidate and ranking APIs, the numerical boundary, submission and publication, and server configuration.
- [The scrape script](scripts/scrape.mjs) owns Reddit and X search and Reddit thread reading.
