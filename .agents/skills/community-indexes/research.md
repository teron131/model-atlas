# Community index research

Complete one shared research run and return two judgments expressed as separate graphs of compatible inequalities, plus the structured ranking defined in [the skill contract](SKILL.md).
TMB judges overall practical capability, including design; Slop judges the quality of delivered websites, interfaces, and code-generated 2D or 3D visual work.
You own discovery, interpretation, synthesis, and the final check; do not delegate a second opinion, combine separately generated rankings, or leave the judgment to another editor.
Start from the candidate response returned by `GET /api/community/candidates`; fetch it if the run has not supplied one, and use the supplied frozen response in a rehearsal.
Do not read Atlas scores, previous TMB or Slop rankings, or an expected answer; each run judges its current field on its own.
Collect and interpret the evidence first, then judge from that record; do not choose an order and make the evidence fit it.

## TMB: overall practical capability

The ranking expresses the informed overall impression people have of these models' practical intelligence after relying on one as their main partner across substantive work: understanding the request, making sound judgments, and carrying it through to a useful outcome.
Accumulated impressions and the recurring reasons people give for trusting or being disappointed by a model decide its placement.
A main-model preference counts when it reflects capability, not usage frequency, price, speed, usage limits, habit, or presentation.
A thoughtful account of substantial use is more informative than many brief reactions, and this is not a popularity poll: likes, comment counts, and repeated endorsements are not votes or weights.
Read across communities and independent people so that no single creator, launch narrative, or repeated story becomes the whole picture.
Form one view of the whole field; it can be useful without resolving every pair or giving every candidate an exact position.

## Edge cases explain TMB; they do not decide it

Each of the following can explain or qualify a placement, but none can set or reverse a relationship on its own:

- one spectacular success, embarrassing failure, niche breakthrough, or exceptional task;
- usefulness as an orchestrator, advisor, reviewer, or specialist, since a model can excel in a supporting role while being a poor main model;
- repairing, reviewing, or rescuing another model's work, which starts from an existing artifact with exposed mistakes and clarified requirements, an asymmetry that repeated rescues keep;
- doing work previously reserved for another model;
- recommendations or switches driven by price, speed, usage limits, or presentation;
- superficial website, 3D-scene, and game demonstrations, launch reactions, and hearsay as evidence of overall practical superiority;
- a "best available" claim made before a newer candidate existed;
- speculative nerfing, routing, or quantization explanations, and bot- or model-written thread summaries.

Before keeping any consequential or surprising placement, set aside its most dramatic story and its price or speed arguments and check that the broader impressions still support the direction.
If the direction depends on that material, it rests on an edge case: resolve the coverage gap where possible, or revise the relationship.
Apply this symmetrically: do not treat one model's sustained task experience as overall intelligence while dismissing comparable experience with another model as a niche exception.
Do not build best-case and worst-case profiles to cancel broader preferences, soften a clear preference because exceptions exist, or manufacture a tie to appear cautious.

## Slop: quality of visual output

Judge people's overall preference for the finished visual experience, including taste, composition, typography, spatial coherence, motion, interaction, and completeness where relevant.
These qualities explain a judgment; they are not separate numerical sub-scores or a checklist every source must satisfy.
Judge whether the result coherently realizes its intended design, including how it behaves: an attractive still does not establish good animation, and a strong hero section can coexist with a weaker complete page.

Substantive demonstrations can support Slop even when they do not establish a main-model preference for TMB.
A longer build-and-repair session may inform both indexes, but Slop follows the resulting quality rather than rewarding session length or tool use.
Retain descriptions of which output looked or behaved better while excluding winners chosen for cost or speed.
Do not transfer general coding praise or disappointment into a visual position.
Account for the actual model version, subagents, prompts, skills, reference assets, effort, iterations, and human edits; repairing an existing artifact remains an asymmetric comparison.
Judge recurring visual preferences and their strength across sources rather than averaging tasks or letting one striking example determine the order.
When websites and motion or 3D work support different preferences, explain that disagreement and leave comparisons open unless an overall visual preference is supported.

Transcripts and substantive Reddit or YouTube comments are the primary evidence.
Retain concrete passages about the outputs and their model attribution; images can corroborate a claim when available, and missing images do not count against a model.
Do not claim to have visually inspected an output from its transcript alone.

## Sources and window

Use YouTube and Reddit only: video passages, creators' experiences, audience comments and replies, original posts, and comments.
Web search may discover these sources, but outside articles, X, Hacker News, and benchmark or leaderboard rankings are not evidence, and a leaderboard conclusion repeated in a video or post remains a leaderboard conclusion.
Retain only sources published in the two calendar months ending at the supplied `as_of` date; verify and record original publication dates, and exclude older parent threads and videos together with their newer replies.

Give deliberate attention to these verified channels, inspecting their uploads through the source window and their later follow-ups as well as launch reviews:

- Theo – t3.gg: `@t3dotgg`, channel `UCbRP3c757lWg9M-U7TyEkXA`.
- Arena: `@ArenaAIOfficial`, channel `UCKHVXTuahhhZFhhu_SfTyWA`; its discussions and audience accounts are eligible, its leaderboard scores are not, and the unrelated `@AI-ARENA-YT` is not this source.

Deprioritize Bijan Bowen and superficial launch-demo coverage.
These are soft attention preferences, not an exclusive list, weights, or an instruction to agree with a creator; detailed firsthand Reddit and audience experiences can outweigh a polished review.
Repeated posts, videos, quotes, or agreement about the same person's experience are not independent support.

## Discovery

Complete the same discovery pass for every candidate before deciding the order, using these query families within the source window, where `<model>` is the candidate's ordinary name:

- `site:reddit.com "<model>"`
- `site:reddit.com "<model>" (using OR experience OR impressions)`
- `site:reddit.com "<model>" (research OR analysis OR writing OR documents)`
- a YouTube search for `<model>`, without requiring comparison titles.
- Reddit and YouTube searches for `<model>` with relevant visual-work terms such as frontend, website, UI, design, animation, 3D, or game.

These start the search; they are not the whole search.
Start with model names and inspect promising titles, descriptions, and discussions, then follow their useful leads; a title is a discovery clue, not verified evidence.
Cover both practical work and visual work before synthesis; do not rely on incidental frontend mentions from a TMB-only search or require an A-versus-B title to exist.
If a query returns little, simplify quotation, provider prefixes, or punctuation and try the usual short name; if exact date operators block discovery, use the tool's recency filter and still verify each source's date.
Follow useful discussion into model communities and communities covering the actual work, including outside the model's vendor community, and count useful single-model experiences without requiring an explicit comparison.
After the shared pass, search to resolve gaps or challenge a placement, read accounts on both sides, and inspect current direct comparisons for contested placements.
Broaden a candidate's search while it rests on one discussion, one creator, launch reactions, or an access failure.
For a consequential source that cannot be retrieved, make one bounded alternative attempt, record the gap, and broaden other reading; failed access never downgrades a model.
Finish when additional reading mainly repeats the represented impressions and disagreement, or report the limit that prevented it; do not stop merely because a ranking can be written, and do not set source quotas.

## Read what people mean

Open promising discussions rather than stopping at search excerpts, and read substantive replies, corrections, and follow-ups, including prominent and recent replies and those favoring the other model.
Preserve the difference between a general judgment and an account of one unusual task, and the reported exposure: a few chats, repeated tasks in one project, and sustained use across projects are different kinds of experience.
Preserve the scope of each claim: comparable results, sufficient capability for someone's work, better value, and greater overall capability are different assessments.
Treat several posts or videos from one person as an evolving view when the versions, question, and context are comparable, and keep both scopes when they are not; recency alone does not let a narrow assessment replace a broader one or one person's opinion supersede others'.
Record relevant effort, harness, help supplied, and corrections without inventing explanations for inconvenient outcomes, and label private outcomes as reported.
Prefer assessments grounded in meaningful use, including research, analysis, technical documents, and difficult work beyond coding, and state when coverage is developer-heavy or concentrated in a few people's projects.

Interpret model mentions against the candidate list using the surrounding discussion rather than exact catalog spelling.
People mix product and model names, abbreviate, omit providers or versions, write 6.0 for 6, and make typing or caption errors: "ChatGPT 6.0 Astra" means candidate GPT-6 Astra, and a typo such as "chatgdp 6.0" can refer to the model the thread establishes, though on its own it does not distinguish Astra from Sol.
Current shorthand means the current candidate, so Opus means the candidate Opus and Fable the candidate Fable; explicit older versions, conflicting dates or context, and separately named products override that default.
Wonder Full is not standard Wonder, while Max may be an effort setting on the same model; follow the source's own explanation of such qualifiers.
A clearly identified preview within the window can be useful evidence when its qualification is recorded.
Keep the source's wording beside your resolved identity when the interpretation matters, and do not discard a useful account because its naming is informal.

## Keep the evidence record

Record every promising source found as read and retained, excluded, not read, or inaccessible, with the reason; do not silently drop a substantive discussion.
Keep original passages, dates, model identities, consequential replies, and access details separate from your interpretation, so a reader can tell what people said from what you concluded.
Distinguish direct access, search-exposed text, partial reading, and inaccessible content: a title is not content verification, a few caption windows are not a complete video, and search text is not a fully read thread.
Record consequential comment permalinks or identifying passages and video timestamps, and use captions and bounded comments without starting paid transcription or media downloads.
Previously retrieved original material can fill an access gap if its date and identity remain eligible; never substitute a previous index ranking or a researcher summary for original material.
Use one shared source record, retaining the passages relevant to either or both indexes rather than assigning whole sources to mutually exclusive categories.
Freeze the record before synthesis; if a material gap needs more reading, append that evidence and explain the gap.

## Form both judgments

For TMB, explain the order through the overall capability assessments people express after meaningful use, judged by the breadth and duration of firsthand experience, the substance of the reasons, relevance to the current candidates, and independent corroboration.
When overall assessments conflict, explain which accounts are more informative and why, using the same standard whichever model they favor.
Traits and task outcomes explain those assessments; do not crown a model because you personally prioritize one quality.
A relationship may rest on synthesis without a head-to-head account, but trace it to people's general assessments rather than a capability ranking you built from selected strengths.
Check each graph as a whole, including relationships implied across chains, against relevant current direct comparisons; do not keep an implied relationship that chains preferences from different tasks, people, or periods when current direct accounts contradict it, unless you explain why.
An account published before a newer candidate existed can describe the older model but cannot rank the two.
Distinguish broad agreement, recurring tendencies, and genuinely divided views, and check whether a surprising placement rests on a version mistake or narrow coverage.
For Slop, apply its visual-quality standard to the same source record and the design-specific reading, separately from the TMB conclusion.
Use the same standards for all candidates and examine credible contrary evidence for consequential placements in each graph; a clear relationship in one index does not establish it in the other.
The two conclusions may agree or differ naturally; neither is derived by rearranging the other.
These are consistency checks on two whole-field judgments, not a tournament, a requirement for every pair, or numerical aggregation.

## Express the relationships

For each index, use one or more strongest-to-weakest inequalities, choosing each symbol for the perceived relationship under that index's standard without a default operator or quota:

- `≥` a genuinely close overall preference, with comparable standing plausible;
- `>` a clear overall preference, compatible with exceptions on particular tasks;
- `≫` a large overall gap in the informed impressions, without claiming a ratio or superiority on every task;
- `=` positively supported comparable standing.

Uncertainty is not closeness, and `≥` is neither an unknown comparison nor an asserted tie.
Keep supported relationships even when a model's exact position is unclear: if the evidence supports `A > B > C` and `B > D` but not C versus D, return those two chains, and do not omit D or invent a relation between C and D.
Use several chains only where they express the judgment clearly, not to split a supported complete order into pairs; a model may appear in several chains, chain order means nothing, and all chains within an index express the same judgment.
Resolve conflicting directions within each graph from the evidence or leave the unsupported relationship unspecified, so neither graph contains a contradiction.
An opposing preference between TMB and Slop is valid when their different standards explain it.
Omit a candidate only when no comparative placement is supportable, saying whether discussion was absent, inaccessible, insufficient, or inconclusive; missing evidence is not last place.
Do not calculate averages, source weights, ratings, or numerical distances; the backend owns every number.

## Report and log

Lead the report with both sets of inequalities and the overall vibe behind each: the recurring reasons people give, representative experiences, meaningful disagreement, and material coverage gaps.
For each close or disputed comparison that matters, give the credible view on each side and what tipped the preference, distinguishing what users say from your synthesis and calling a judgment call one.
Explain when preferences reflect different work or collaboration styles rather than turning them into an intelligence hierarchy, and keep the language proportional to the coverage.
If access prevents a supportable result, report the missing evidence rather than inventing a ranking.

Write the ranking JSON from the skill contract with the actual UTC completion `ranked_at` to the second, ending in `Z`.
Put the TMB chains in `indexes.tmb` and the Slop chains in `indexes.slop`; both arrays share the same `ranked_at`.
Keep in the log the shared candidate list and `as_of`, the `prompt_version`, the queries and discovery paths, and the dated passages behind consequential claims.
For each index separately, record each relationship's reasons and sources marked as direct comparison or synthesis, consequential unresolved comparisons, reasons for omitted candidates, and material disagreements.
When one index has no supported relationship, return an empty array with the evidence gap; when both are unsupported, report the gap without publication.
In a rehearsal, save the report and JSON locally and stop; a configured publishing run follows the skill's API workflow and verifies the read-back.
