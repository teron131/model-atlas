# Benchmark Portfolio

A benchmark earns its place by adding credible information about model capability. This page lists the selected benchmarks, their weights, why each is included, the domains each tests, and the source choices that keep results comparable. [Standards](standards.md) explains the selection criteria; [Methodology](methodology/overview.md) explains how the results become scores.

## Reading the Portfolio

Every selected benchmark is either a frontier benchmark or a baseline benchmark. Frontier benchmarks still separate current leading models, and they count toward :score[Intelligence] and :score[Agentic]. Baseline benchmarks stay visible in the table and can help estimate a missing frontier result, but they carry no weight in either capability score. Aggregate indexes are listed separately and count according to their own allocations. Rejected and watchlist benchmarks count toward no score.

The two capabilities are:

| Capability | Meaning | Included evidence |
| --- | --- | --- |
| Intelligence | Solving difficult problems using knowledge, perception, understanding, abstract reasoning, and judgment | Frontier benchmarks with a non-zero Intelligence allocation, plus eligible aggregate indexes |
| Agentic | Reliably turning goals and specifications into working results through instruction following, planning, coding, tool use, verification, and recovery | Frontier benchmarks with a non-zero Agentic allocation, plus eligible aggregate indexes |

Each table row gives a benchmark's or an index's **allocation**, the split of its weight between Intelligence and Agentic. It is 100/0, 75/25, 50/50, 25/75, or 0/100, the five-level scale in [Standards](standards.md#capability-fit). The last column gives the capability measured and the reason for the allocation.

Writing, modifying, testing, debugging, and delivering software mainly test Agentic ability. A coding benchmark earns Intelligence weight when success depends largely on difficult algorithmic, mathematical, scientific, or research reasoning. The task and how models fail at it decide the allocation; a final-output grader or a harness name does not.

The methodology pages explain the calculations the allocation feeds. [Weights and the benchmark mean](methodology/intelligence-agentic.md#weights-and-the-benchmark-mean) turns the allocation into a base weight and combines a model's frontier results. [Combining benchmarks and aggregate indexes](methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes) sets how much an index counts beside individual benchmarks. [Evidence support and score retention](methodology/intelligence-agentic.md#evidence-support-and-score-retention) discounts a score that rests on few results. For :score[Speed], :score[Value], and the :score[Agentic] token adjustment, [similar-quality peers](methodology/speed-value.md#similar-quality-peers) explains how a benchmark's results decide which models' resource use is compared.

## Aggregate Indexes

An aggregate index summarizes several evaluations. It is broad, but its components can overlap selected benchmarks and its source decides how they combine. Listing indexes separately makes that limit visible. Represented breadth, the number of benchmarks an index stands for, sets how much it counts beside individual benchmark results. [Methodology](methodology/intelligence-agentic.md#combining-benchmarks-and-aggregate-indexes) gives the calculation, including the deduction for components that are also scored individually.

| Index | Intelligence Allocation | Agentic Allocation | Capability and Decision |
| --- | ---: | ---: | --- |
| Artificial Analysis Intelligence Index | 50% | 50% | Broad aggregate computed by its source. Represented breadth is reduced for exact known overlap with individually scored benchmarks. |
| CAIS Capabilities Index | 75% | 25% | Atlas derives this index as a weighted proxy for coverage across two Text and five Vision components. Exact component keys stop a frontier component that is also observed as a benchmark from counting twice. |
| Epoch Capabilities Index | 50% | 50% | Broad fallback evidence whose components are not fully published, assigned the fixed median index breadth of 8.5. |
| Surge Intelligence Index | 50% | 50% | Professional-reasoning, writing, and agent evidence from the 14 Surge boards its page lists. Represented breadth is reduced for the boards Atlas also scores individually. |
| Vals Index | 50% | 50% | GDP-weighted finance, coding, legal, and tax evidence from eight component benchmarks. |

**Artificial Analysis Intelligence Index** counts the published aggregate as one index observation. The leaderboard names the index with the version it publishes, so a new version replaces the cached rows, including rows kept for models Artificial Analysis no longer evaluates. Each model row also lists the evaluations its score combines. Atlas records that basket as Artificial Analysis evaluation slugs mapped to its own benchmark keys. It is currently AA-Briefcase, AutomationBench-AA, GDP.pdf, FrontierCode, Terminal-Bench, Terminal-Bench-Science, the CritPt hard subset, AA-Omniscience, and HLE-Diamond. Its size is the index's represented breadth, currently 9. Each component is the version Artificial Analysis runs, which can trail the benchmark's own source. A component maps to the same benchmark key either way, so it still overlaps that benchmark. Every published index value counts, whatever basket its row lists. Until the recorded basket is updated, a changed basket can leave the represented breadth and overlap deductions off by the benchmarks that changed. The keys allow exact overlap deductions against individually scored benchmarks and other indexes. The index's FrontierCode component overlaps FrontierCode because Artificial Analysis runs Cognition's same 132 tasks in its own harness. Its own paired per-task cost, runtime, and output tokens can count under the resource rules in [Methodology](methodology/leaderboard-rules.md#resource-score-availability). These measurements belong to the index alone and never fill missing measurements for its components or for another index.

**CAIS Capabilities Index** is derived from HLE, TextQuests, EnigmaEval, ERQA, IntPhys 2, MindCube Tiny, and SpatialViz-Bench with equal weight per component, expressed as `(2 × Text + 5 × Vision) / 7`. ERQA, IntPhys 2, and MindCube Tiny are baseline benchmarks, carry no capability weight, and deduct nothing from the index's weight. Its HLE component is the original exam, which HLE-Diamond still overlaps because Diamond refines the same question pool. CAIS supplies no per-task resource measurements.

**Epoch Capabilities Index** uses the published ECI value with fixed represented breadth 8.5, the [median](methodology/operations.md#weighted-median-and-quantiles) of the fixed index baskets. Atlas stores Epoch's count of benchmarks fitted for each model, but it does not change scoring weight. Not all components can be identified for overlap accounting, and the assigned breadth creates no missing benchmark measurements.

**Surge Intelligence Index** uses the published aggregate directly, with represented breadth 14, the number of boards its page lists. Surge publishes no component weights, and its published values cannot be reproduced from the board scores, so Atlas treats every listed board as a component. Ten of them are also Atlas benchmarks and count as known overlap; Antidote, CoreCraft, DAYJOB: Law, and DAYJOB: Tax are not. It is fallback evidence with no reproducible index-level resource contract, so it stays out of :score[Speed] and :score[Value].

**Vals Index** uses version :version[vals_index]’s published overall percentage directly, with represented breadth eight. Its components are Finance Agent, EMB, Code Migration, Vibe Code, Terminal-Bench, Legal Research, HLAB, and Tax Agent, at the versions Vals currently uses for the index. Atlas uses no unversioned rows or baskets of another size, because represented breadth assumes eight components. Its proprietary dataset mix is aggregate fallback evidence. Its cost and latency lack a comparable per-task aggregation, so they stay out of :score[Speed] and :score[Value].

The dashboard table also shows the Trust Me Bro and Slop Indexes beside these, Model Atlas's dated community judgments of overall practical capability and visual output quality. They take no benchmark portfolio weight; [Methodology](methodology/intelligence-agentic.md#trust-me-bro-and-slop-indexes) describes their shared :score[Intelligence] correction.

## Frontier Benchmarks

These demanding benchmarks separate current leading models.

| Benchmark | Intelligence Allocation | Agentic Allocation | Capability and Decision |
| --- | ---: | ---: | --- |
| AA-3D | 25% | 75% | Turning a written brief into an interactive three.js scene takes a long agent loop of code, Blender, physics, assets, and screenshot review, so tool use, verification, and recovery dominate. Composing a scene in space and judging its own renders add a secondary Intelligence share. Blind human comparisons of scenes built for the same brief, with published uncertainty, meet the grading standard. The top two models are tied, but the leading group spreads well beyond the rating uncertainty. |
| Agents'&nbsp;Last&nbsp;Exam | 25% | 75% | Long software and professional tasks stress instruction fidelity, tool use, recovery, and completion. Partial-credit grading keeps a secondary share for solution quality and domain reasoning. |
| ALE-Bench | 75% | 25% | Difficult heuristic optimization and algorithm design justify the Intelligence-heavy exception to the coding default. Implementing, running, and improving candidates through feedback earns the secondary Agentic allocation. |
| AnalystAgent | 75% | 25% | It mainly tests correct quantitative analysis of supplied spreadsheets and documents. Choosing code and document operations adds a secondary Agentic share, and published per-task resources can feed :score[Speed] and :score[Value]. |
| APEX&nbsp;Agents | 25% | 75% | Long-horizon professional-services tasks stress complex instructions, workplace-tool coordination, and persistent completion. Professional judgment is a real secondary requirement. |
| ARC-AGI-3 | 50% | 50% | Success depends both on discovering rules and building a predictive world model and on acting persistently with feedback use, state management, and recovery. The score reflects model plus harness, under the harness policy in the [source notes](#arc-prize). |
| Arena&nbsp;Agent | 0% | 100% | Randomized Agent Mode sessions directly measure the orchestrator model's effect on successful completion, steerability, bash recovery, and tool reliability. It targets Agentic ability; domain reasoning is incidental to the sampled tasks. |
| Arena&nbsp;WebDev | 0% | 100% | Building interactive web apps through multi-turn tool use measures product construction, instruction fidelity, and reliable coding execution. Blind human comparisons, corrected for display order and same-organization bias, judge the functionality, usability, and design of the built result. They add taste that verifiers rarely reach and judge built software rather than Arena Agent's session outcomes. Design judgment is not the algorithmic or scientific reasoning that earns an Intelligence share. |
| AutomationBench | 0% | 100% | Zapier's official strict-completion metric tests whether a model leaves simulated SaaS applications in the fully required final state. |
| Blueprint-Bench&nbsp;2 | 100% | 0% | Spatial reasoning in reconstructing floor plans from apartment photos. It is protected and difficult enough to act as a frontier intelligence-only stress test. |
| Briefcase | 50% | 50% | Multi-file professional projects score both the quality and correctness of deliverables and the reliable coordination of interdependent instructions and artifacts. Neither capability is incidental. |
| Code Migration | 25% | 75% | Porting, building, testing, and delivering working programs mainly measure coding execution. Reasoning about cross-language semantics and subtle behavioral equivalence earns a secondary Intelligence allocation, and current results leave substantial headroom. Endpoint latency is part of the delivery constraint. |
| ComplexConstraints | 25% | 75% | It measures fidelity to many interdependent, conditional, implicit, and multistep requirements. The Agentic allocation needs no tools, because complex instruction fidelity is itself the primary Agentic capability; planning quality is secondary. |
| CritPt&nbsp;v:version[critpt] | 100% | 0% | Research-level physics reasoning with numeric, symbolic, and code answers. Its offline Python agent supports calculation and checking rather than software delivery, so physics reasoning still determines success. It is narrow, and Atlas scores its hard subset. |
| DAYJOB: Finance | 50% | 50% | Strict task success depends on both financial judgment across long document-heavy assignments and reliable production of finished analyses. Current leaders have substantial headroom. |
| DAYJOB: Healthcare | 50% | 50% | Strict task success depends on both clinical interpretation across fragmented records and reliable completion of care or coverage deliverables. The series separates current leaders while many systems score near the floor. |
| EBR-Bench | 25% | 75% | Repeated play measures exploration, learning from feedback, persistent notes, and stateful adaptation. Models are far below expert human performance on a distinct, unsolved capability. |
| EnigmaEval | 100% | 0% | Long multimodal puzzle-hunt problems require discovering hidden structure, synthesizing clues, and carrying out multi-step deductions. CAIS supplies broad current coverage. The adoption audit covers the source version and the original-versus-transcription format. |
| FrontierCode | 25% | 75% | Producing mergeable repository changes mainly measures reliable coding execution, constraint following, and verification. Architectural and algorithmic reasoning for difficult maintainer-defined tasks earns a secondary Intelligence allocation. |
| GDP.pdf | 100% | 0% | Dense page-grounded rubrics measure professional document interpretation and judgment. PDF access is an input medium, not an independently scored Agentic capability. |
| GDP.xlsx | 75% | 25% | Professional workbook interpretation and quantitative reasoning determine most credit. Multi-stage extraction, conditional filtering, calculation, and consistent output add secondary Agentic evidence, and current leaders have substantial headroom. |
| GDPval-AA&nbsp;v:version[gdpval_normalized] | 75% | 25% | The quality of professional deliverables across economically important occupations is primary. Longer tool, file, and web trajectories add a secondary Agentic share when they contribute to completion. |
| GDPx | 50% | 50% | Tasks of up to eight hours inside real professional software across 11 domains depend both on expert judgment, such as accounting treatments or timing repairs, and on sustained tool work, recovery, and delivery. Current leaders have substantial headroom, and the leading models are separated by more than single-task differences. |
| HANDBOOK.md | 25% | 75% | Enterprise tasks stress sustained policy adherence, long-context instructions, internal tools, and external MCP coordination. Domain reasoning is substantial but secondary to reliable constrained execution. |
| HLE-Diamond | 100% | 0% | Broad expert academic knowledge and reasoning, including questions that depend on images, with headroom left. It is a frontier intelligence stress test because it still clearly separates top models. |
| MirrorCode | 25% | 75% | Sustained whole-program reconstruction through documentation, black-box probing, implementation, and exhaustive testing mainly measures Agentic delivery. Inferring hidden behavior and program structure adds secondary Intelligence evidence. |
| MysteryMechanism | 75% | 25% | Recovering hidden mathematical laws from sparse observations is mainly scientific and quantitative reasoning. Choosing a small number of experiments through a shell adds Agentic work. Its 222 held-out mechanisms and private structural-probe grading leave substantial frontier headroom. |
| Omniscience | 100% | 0% | Factual recall in economically relevant domains. Its 3,000 mostly private questions separate current leaders by several points, well beyond sampling error, with substantial headroom. |
| ProgramBench | 25% | 75% | Reconstructing programs through executable probing, implementation, compilation, and testing mainly measures Agentic ability. Inferring hidden program semantics earns a secondary Intelligence allocation. |
| RSI | 50% | 50% | Four long-horizon LLM R&D tasks demand method and experiment judgment alongside sustained implementation, evaluation, and recovery. Atlas treats the publisher's RSI Index as one frontier benchmark, not an aggregate index with a represented-breadth multiplier. |
| SRE Bench | 25% | 75% | Binary reverse engineering across protected programs mainly measures investigation, tool use, reconstruction, and verified execution. Inferring hidden semantics and protections adds secondary Intelligence evidence. Deterministic grading and substantial headroom support frontier use despite few covered models. |
| SpatialViz-Bench | 100% | 0% | Controlled mental rotation, folding, penetration, and animation tasks isolate spatial visualization as a distinct Intelligence capability. Programmatic generation and current top-model separation support frontier use, pending confirmation that the CAIS configuration matches the paper task version. |
| sudo L7 | 0% | 100% | Software engineering tasks test system understanding, practical judgment, verification, and truthful reporting. The published model-plus-agent leaderboard has substantial headroom and useful separation. The visible tasks support Agentic execution but establish no separate Intelligence allocation. |
| SUPERChem | 100% | 0% | Expert-curated multimodal chemistry problems test advanced chemical reasoning. |
| Terminal-Bench :version[terminal_bench] | 25% | 75% | Difficult containerized tasks require instruction fidelity, terminal-tool orchestration, state inspection, self-verification, and recovery. Technical reasoning matters, but the score mainly measures reliable workflow execution rather than coding. |
| Terminal-Bench-Science :version[terminal_bench_science] | 75% | 25% | Scientific formulation and research-level analysis justify the Intelligence-heavy exception to the coding default. Implementing methods, coordinating terminal tools, and verifying results earn the secondary Agentic allocation. |
| TextQuests | 25% | 75% | Long-horizon interactive-fiction play requires exploration, state tracking, trial and error, recovery, and sustained planning. No-clues mean game progress is frontier Agentic evidence, with puzzle reasoning as a real secondary share. |
| WeirdML v:version[weirdml] | 75% | 25% | Discovering hidden structure and designing scientific or machine-learning methods justify the Intelligence-heavy allocation. Sustained experimentation, validation, and reliable artifact delivery add Agentic evidence. The official progress-sensitive score leaves substantial frontier headroom. |

## Baseline Benchmarks

These benchmarks add useful capability breadth or stability without separating leading models as strongly. Their results carry no weight of their own in either capability score, whatever their listed allocation.

| Benchmark | Intelligence Allocation | Agentic Allocation | Capability and Decision |
| --- | ---: | ---: | --- |
| APEX-SWE | 0% | 100% | Service integration and debugging with production-style telemetry measure software execution. |
| ARC-AGI-2 | 100% | 0% | Novel abstract visual transformations add protected fluid-reasoning breadth. Current serious systems approach the ceiling, so results are baseline evidence rather than a primary frontier separator. |
| BioMysteryBench | 50% | 50% | Ninety audited investigations of anonymized biological data require both scientific interpretation and sustained analysis with code, tools, and databases. Current leaders differ by less than the full set's task-sampling uncertainty, and the 17-investigation human-difficult split is too small to order them. It is baseline evidence that keeps bioinformatics research visible and separates weaker models. The published accuracy includes Vals' anti-cheat grading and source-specific refusals. |
| Chartography | 100% | 0% | Professional chart interpretation over difficult visual and quantitative questions. An agent may measure the chart with image and OCR tools, but success still depends on reading the chart and knowing its domain. Leading models now finish within a few tasks of each other, so it adds chart-reading breadth rather than separating them. |
| Chess Puzzles v2 | 100% | 0% | Exact-move chess puzzle solving adds a distinct planning and tactical-reasoning signal. It is baseline because it is a narrow specialist capability rather than a broad frontier claim. |
| Code2Video-AA | 0% | 100% | Writing motion-graphics code from a detailed brief in one call measures instruction fidelity and execution without tools or a chance to see the rendered result. Motion-design taste is not the algorithmic or scientific reasoning that earns an Intelligence share. A strong model judge comparing rendered videos blind meets the grading standard. One-shot generation that depends on HeyGen's own animation framework keeps it baseline. |
| EMB | 75% | 25% | Correct financial-model construction and professional judgment dominate the score. Coordinating spreadsheet operations and multi-step requirements adds a secondary Agentic share. Current leaders differ by less than one published standard error, and many models score within a few points of them. It is baseline evidence that separates weaker models, and its results reach both capability scores through the Vals Index. |
| ERQA | 100% | 0% | Multimodal embodied-reasoning questions add coverage of visual spatial, trajectory, action, and physical-world judgment. It is baseline because the current CAIS denominator and parse-failure treatment need source validation. |
| Finance Agent v:version[finance_agent] | 50% | 50% | Strict all-pass success depends both on financial reasoning and calculation and on reliable filing retrieval, research, and tool use. Its focused financial domain makes it stabilizing baseline evidence. |
| FrontierMath Tier 4 | 100% | 0% | Epoch's hardest private FrontierMath tier still tests research-level mathematics. Current leaders solve nearly every problem and differ by less than one run's uncertainty, so it no longer separates them. It is baseline because it still separates weaker models and keeps mathematical reasoning visible beside Riemann-bench. |
| Hemingway-bench | 75% | 25% | Writing quality, originality, coherence, and emotional intelligence dominate expert preference. Explicit instruction adherence adds a secondary Agentic share. Blind expert comparisons meet the grading standard, but coverage lags current leading models and the leaders' intervals overlap, so it is baseline. |
| IntPhys 2 | 100% | 0% | Video questions probe object permanence, continuity, immutability, and solidity under changing camera and scene conditions. It is baseline until CAIS's frame sampling and evaluated subset are confirmed. |
| MindCube Tiny | 100% | 0% | Multi-view spatial mental modeling and perspective changes add specialist visual-reasoning breadth. Current leaders approach the ceiling, so it is baseline rather than a primary frontier separator. |
| MLCR-AA | 100% | 0% | Long medical-record synthesis adds clinical chronology and causality reasoning beyond broad long-context tests. Its 60 held-out questions across ten synthetic cases and judge disagreement keep it baseline. |
| Public Benefits Bench | 50% | 50% | Success depends both on policy interpretation and case reasoning and on reliable research and workflow completion. Its focused domain keeps it baseline. |
| Riemann-bench | 100% | 0% | Private research-level mathematics. Current leaders solve most problems and differ by only a few of them, with no published uncertainty or repeat count, so their order is not frontier evidence. It is baseline because it still separates weaker models and keeps private mathematics visible beside FrontierMath Tier 4. |
| SimpleQA Verified | 100% | 0% | Broad factual recall under Epoch's current anti-abstention methodology adds general-knowledge coverage distinct from Omniscience's professional-domain focus. Public static questions and exposure risk keep it baseline. |
| Vending-Bench&nbsp;2 | 25% | 75% | Year-long simulated business operation measures sustained tool use, state management, negotiation, and coherence over thousands of messages. Business judgment is secondary. Small run counts and stochastic outcomes keep it baseline. |
| Vibe Code | 0% | 100% | Building working applications from specifications measures coding execution, service integration, state management, testing, recovery, and completion. The tasks show no separate, exceptional demand for algorithmic or scientific reasoning, so ordinary application construction is fully Agentic. |
| VoxelBench | 50% | 50% | Text-to-voxel construction combines real spatial reasoning with reliable execution of scene requirements. Community preferences add distinctive construction and design evidence, but undocumented generation and voting procedures keep it baseline with a measurement caveat. |

## Domains

Domains name what a benchmark tests, such as coding, mathematics, or work with office documents. Each task benchmark divides 100% among the domains that decide its results; an aggregate index has none, because it mixes every domain. The dashboard uses the shares to group benchmarks and to compare models within a domain. They carry no weight in :score[Intelligence], :score[Agentic], :score[Speed], or :score[Value].

A decision model rates how much each domain decides a model's result on a benchmark, on a scale from 0, irrelevant, to 4, dominant. It judges what separates high and low scorers rather than what merely appears in the tasks, reading a fixed profile of the benchmark: what each task gives the model, what the model must produce, the task mix, the environment, and how results are graded. A domain rated below 1.5, halfway between minor and moderate, gets no share. The remaining ratings are squared and scaled to sum to 100%, so a domain that mainly decides the result outweighs several that matter a little. Each definition states what its domain does not cover, because without that boundary the rater attaches a domain to neighbouring work, such as Design to spatial reasoning.

| Domain | Definition |
| --- | --- |
| Coding | Writing, fixing, porting, or reverse-engineering software, or building, configuring, and debugging the systems it runs on, graded on whether the result works. Not code that is only a means to an answer judged in another label's subject, such as a scientific analysis or a mathematical result. |
| Documents | Reading or producing office files such as PDFs, spreadsheets, and slides, where handling the file's content and structure is the task. Not plain text passages or web pages. |
| Writing | Prose quality, style, and editing, where the text itself is what gets graded. Not notes, reports, or answers written along the way. |
| Design | Producing visual or interface designs, 3D scenes, or layouts, graded on how the result looks and works for a viewer. Not perceiving or reasoning about shapes, space, or images. |
| Vision | Understanding images, charts, diagrams, or video given as input, including the spatial relations in them. Not producing visuals. |
| Tool Use | Driving tools, browsers, terminals, or APIs across many steps as an agent, where choosing and ordering actions and recovering from errors decides the result. Not interaction that only submits answers or moves. When the tasks belong to another label's subject, such as code, science, or finance, that label is the main measure and Tool use ranks below it, whatever interface, such as a terminal or browser, the work is done in. |
| Research | Finding, reading, and combining information from many outside sources over many steps, such as web or literature research. Not reasoning over material already supplied with the task, and not running experiments. |
| Games | Playing games, from single positions to long sessions, or operating inside a simulated world or business whose state changes over many turns, graded on the outcome reached. Not ordinary workplace tasks done with files and tools. |
| Puzzles | Abstract reasoning on novel puzzles and hidden patterns, where little outside knowledge helps. Not mathematics or science problems that rest on domain knowledge. |
| Math | Mathematical knowledge and problem solving, from calculation-heavy reasoning to proofs. Not the everyday arithmetic any task involves. |
| Science | Natural sciences such as physics, chemistry, and biology as the subject matter. Not general-knowledge questions that happen to include science, and not medicine. |
| Finance | Finance, accounting, and economics as the subject matter, such as valuation, filings, and financial models. |
| Healthcare | Medicine and patient care as the subject matter. Not biological research. |
| Legal | Law, regulation, public policy, and contracts as the subject matter. |
| Knowledge | Answering from memory across many subjects at once: factual recall, calibration, and expert questions drawn from many fields with no single field dominant. Not work spread over several professional fields whose answers come from supplied files, images, or data, not the background knowledge any expert task assumes, and not a benchmark set in one field. |

| Benchmark | Domain Shares |
| --- | --- |
| AA-3D | Coding 36%, Design 35%, Tool Use 16%, Vision 13% |
| Agents' Last Exam | Tool Use 60%, Documents 22%, Coding 18% |
| ALE-Bench | Coding 50%, Tool Use 20%, Math 16%, Puzzles 14% |
| AnalystAgent | Documents 36%, Tool Use 26%, Finance 14%, Coding 13%, Math 11% |
| APEX Agents | Tool Use 36%, Documents 23%, Finance 21%, Legal 20% |
| APEX-SWE | Coding 70%, Tool Use 30% |
| ARC-AGI-2 | Puzzles 80%, Vision 20% |
| ARC-AGI-3 | Games 48%, Puzzles 35%, Vision 17% |
| Arena Agent | Tool Use 53%, Coding 24%, Documents 12%, Research 11% |
| Arena WebDev | Coding 57%, Design 31%, Tool Use 12% |
| AutomationBench | Tool Use 100% |
| BioMysteryBench | Science 63%, Tool Use 37% |
| Blueprint-Bench 2 | Vision 84%, Tool Use 16% |
| Briefcase | Documents 58%, Tool Use 42% |
| Chartography | Vision 69%, Tool Use 18%, Coding 13% |
| Chess Puzzles | Games 86%, Puzzles 14% |
| Code Migration | Coding 80%, Tool Use 20% |
| Code2Video-AA | Design 55%, Coding 45% |
| ComplexConstraints | Writing 100% |
| CritPt | Science 59%, Math 31%, Tool Use 10% |
| DAYJOB: Finance | Finance 55%, Documents 26%, Tool Use 19% |
| DAYJOB: Healthcare | Healthcare 43%, Tool Use 32%, Documents 25% |
| EBR-Bench | Games 68%, Tool Use 32% |
| EMB | Finance 53%, Documents 32%, Tool Use 15% |
| EnigmaEval | Puzzles 77%, Vision 23% |
| ERQA | Vision 100% |
| Finance Agent | Finance 46%, Tool Use 27%, Research 27% |
| FrontierCode | Coding 79%, Tool Use 21% |
| FrontierMath Tier 4 | Math 100% |
| GDP.pdf | Documents 69%, Vision 31% |
| GDP.xlsx | Documents 64%, Tool Use 24%, Finance 12% |
| GDPval-AA | Documents 44%, Tool Use 26%, Writing 17%, Research 13% |
| GDPx | Coding 26%, Tool Use 24%, Finance 15%, Science 14%, Legal 11%, Documents 10% |
| HANDBOOK.md | Tool Use 100% |
| Hemingway-bench | Writing 100% |
| HLE-Diamond | Knowledge 36%, Math 25%, Science 22%, Vision 17% |
| IntPhys 2 | Vision 62%, Science 38% |
| MindCube Tiny | Vision 100% |
| MirrorCode | Coding 75%, Tool Use 25% |
| MLCR-AA | Healthcare 100% |
| MysteryMechanism | Math 43%, Puzzles 29%, Tool Use 28% |
| Omniscience | Knowledge 100% |
| ProgramBench | Coding 79%, Tool Use 21% |
| Public Benefits Bench | Legal 65%, Research 20%, Tool Use 15% |
| Riemann-bench | Math 100% |
| RSI | Coding 78%, Tool Use 22% |
| SimpleQA Verified | Knowledge 100% |
| SpatialViz-Bench | Vision 72%, Puzzles 28% |
| SRE Bench | Coding 65%, Tool Use 35% |
| sudo L7 | Coding 77%, Tool Use 23% |
| SUPERChem | Science 70%, Vision 17%, Math 13% |
| Terminal-Bench | Coding 54%, Tool Use 32%, Science 14% |
| Terminal-Bench-Science | Science 40%, Math 28%, Tool Use 17%, Coding 15% |
| TextQuests | Games 87%, Puzzles 13% |
| Vending-Bench 2 | Games 38%, Tool Use 35%, Finance 16%, Research 11% |
| Vibe Code | Coding 73%, Tool Use 27% |
| VoxelBench | Design 100% |
| WeirdML | Coding 66%, Tool Use 34% |

## Watchlist

Watchlist benchmarks are outside the scoring portfolio. Time Horizon Index is currently not scored because the available evidence does not yet provide the structured, comparable, uncertainty-aware leaderboard that [the standards](standards.md) require. MedXpertQA MM is unselected until Mercor's 200-question subset of the original 2,000-question test set is reproducibly identified.

## Source Notes

These notes record only what is particular to a benchmark: its source, metric, selected and excluded rows, and resources. The portfolio tables are the authority for capability, frontier or baseline status, and allocation.

[Sources](methodology/sources.md) owns the rules every note relies on: [what makes results one result per benchmark and variant](methodology/sources.md#one-result-per-benchmark-and-variant), [which observation is the source default](methodology/sources.md#the-source-default-variant), and [how declared sources combine at equal weight](methodology/sources.md#combining-sources). It also covers [how a validated crosswalk supplies a missing counterpart](methodology/sources.md#source-crosswalks), [whether sources can share raw resource amounts](methodology/sources.md#resources-across-sources) under the [agreement check](methodology/sources.md#agreement-check), and [how version changes and withdrawn results are handled](methodology/sources.md#version-changes-and-withdrawn-results). Sources that publish no version follow the notes below.

### Arena

**Arena Agent** uses the published Net Improvement point estimate from Arena's [live leaderboard](https://arena.ai/leaderboard/agent). Its [official dated dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/viewer/agent/latest) is the fallback when the website cannot return usable rows. The value is a signed causal treatment effect against the current randomized model mixture, not a probability or Bradley-Terry logit, so Atlas does not convert it to a probability. Arena Agent supplies quality evidence only: Atlas does not ingest, display, or score its task costs.

**Arena WebDev** uses the Overall human-vote rating in native points from Arena's [live leaderboard](https://arena.ai/leaderboard/code/webdev). Its [official dated dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/viewer/webdev/latest) is the fallback under the same website-first policy. Atlas leaves out other categories and estimates that are unranked or have no votes. Configurations that share one model and effort stay inspectable, but Atlas assigns none to the model, neither averaging them nor picking one by rating. No WebDev resource measurement is scored.

**Arena publication freshness** is separate from successful retrieval. Arena uploads the [dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/commits/main) per subset on no guaranteed schedule, and it can lag the live website even when publication dates match. Where cached publication dates are known, an older fetched publication cannot replace newer evidence, and a dataset fallback cannot replace website evidence from the same date. An accepted publication replaces the complete rolling row set, so website and dataset configurations are never pooled as independent observations. A failed or rejected refresh keeps the cached rows and their fetch timestamp. Unknown historical publication dates are not inferred from retrieval dates.

### ARC Prize

**ARC-AGI-2 and ARC-AGI-3** use only the official verified semi-private leaderboard and discard public-demo, community, competition, custom, refinement, and synthesis systems. ARC-AGI-2 uses task success and reported task cost. Each benchmark's costs affect :score[Value] only within that benchmark.

**ARC-AGI-3** uses human-relative action efficiency over 55 semi-private environments under the Standard harness, which gives every model provider-neutral text history and visible persistent notes. Provider Adapter runs use provider-native continuous conversation, hidden reasoning state, and context compaction. They score far higher for the same model and saturate near the ceiling, so Atlas stores them without scoring them and compares every model under one protocol. A model with only a Provider Adapter run has no observed ARC-AGI-3 result. Standard costs are normalized per environment and supply the benchmark's resource evidence and the leaderboard's `AGI-3$` column.

### Artificial Analysis

**Artificial Analysis Intelligence Index** values and index-level resources come from the complete model comparison dataset that Artificial Analysis's model-detail pages link. The main leaderboard is used only to find a current model-detail page; its compact preview does not supply complete resource measurements. A missing time, price, or token value never discards a model's other valid measurements.

**Dedicated evaluation pages** supply AnalystAgent, Briefcase v:version[briefcase], Code2Video-AA, CritPt v:version[critpt], GDPval-AA v:version[gdpval_normalized], HLE-Diamond, MLCR-AA, and Omniscience, for both scores and any eligible resources. The shared model table does not supply their scores, because its fields can belong to an earlier version. Each page's title carries the benchmark's version where Artificial Analysis publishes one, so a new version on the same page is a version change like any other. Per-task resources describe one run. Atlas divides each page's totals by the questions times repeats that Artificial Analysis lists for the evaluation in its [methodology table](https://artificialanalysis.ai/methodology/intelligence-benchmarking). A changed task set or repeat count then takes effect at the next refresh, and a page the table no longer lists keeps its cached rows. A missing benchmark-specific resource measurement stays missing in observed charts. Validated resource estimates from another effort of the same model may count as discounted scoring evidence, but never become observed chart points.

**AA-3D and Code2Video-AA** keep native Elo from their pages, [AA-3D](https://artificialanalysis.ai/evaluations/aa-3d) and [Code2Video-AA](https://artificialanalysis.ai/evaluations/code2video-aa), which observed-range scaling maps to 0–100 as for Arena WebDev. Artificial Analysis anchors one model at 1000 on each board but defines a fixed normalization only for Briefcase's Intelligence Index inclusion, and that range would flatten Code2Video-AA's weakest results to 0. AA-3D's page links no complete dataset, but the model records on the page itself cover the whole board, so its ratings come from those. The methodology table lists no runs for AA-3D, so it supplies no per-task resources, and its page title carries no version. Each refresh replaces a model's rating because ratings are refitted as votes accumulate.

**AnalystAgent** uses headline pass^5 across 80 private questions.

**Briefcase and GDPval-AA** keep raw page Elo, but scoring and linear resource comparison use `clamp((Elo - 500) / 2000)`.

**CritPt v:version[critpt]** uses the [Artificial Analysis series](https://artificialanalysis.ai/evaluations/critpt-v2) of the authors' current version. It runs 70 challenges in Artificial Analysis's offline Stirrup sandbox with scientific Python and at most 50 turns, and the authors' server grades a final submission over five repeats. The authors revised most of the public challenges from the original no-agent series to correct underspecified statements, errors, notation, and code templates, and that series no longer separated current leaders. Because both the challenges and the protocol changed, original results are discarded rather than pooled. Artificial Analysis evaluates this version on fewer models than the original, mostly frontier systems at their highest effort. Atlas scores its [hard subset](https://artificialanalysis.ai/evaluations/critpt-v2?critpt-subset=hard), the fixed 40 challenges left after removing the 30 that seven frontier models each solved in all five attempts at the version's launch. Those 30 add nearly the same credit to every leading model, so on the full set the leaders crowd near 84%. The hard subset keeps nearly the same order and roughly doubles the normalized gaps between them. Full-set results are not pooled with it.

**HLE-Diamond** uses the [Artificial Analysis series](https://artificialanalysis.ai/evaluations/hle-diamond) of the authors' successor to HLE, released as the replacement for when frontier models reach the original exam's noise ceiling. The Center for AI Safety and Scale AI cleaned and revised the original questions into 1,000, half reasoning and half knowledge, and 272 of them include an image. Each is answered once without tools and graded with the official HLE judge prompt. A model without image input sees only the text of an image question and is still graded on it. Because the questions, the image items, and the set changed, results from the original text-only series are discarded rather than pooled. Artificial Analysis evaluates HLE-Diamond on fewer models than the original.

**MLCR-AA** uses Artificial Analysis's headline accurate, complete, and concise pass rate across 60 held-out medical questions and three repeats, so its resources cover 180 attempts. Public examples do not expose the private scored tasks.

**Omniscience** uses Accuracy.

### CAIS

**TextQuests, EnigmaEval, ERQA, IntPhys 2, MindCube Tiny, and SpatialViz-Bench** use the dashboard's component observations. Atlas scores them separately from the derived CAIS index, and they have no per-task resource measurements.

### Epoch

**FrontierMath Tier 4, Chess Puzzles v2, EBR-Bench, MirrorCode, and SimpleQA Verified** use successful runs from Epoch's bulk benchmark data. EBR-Bench excludes runs from its first version, which Epoch calls incomparable with later versions and publishes without a standard error. SimpleQA Verified uses its newest task version, currently :version[simpleqa_verified], under the `SimpleQA Verified (anti-abstention)` method and excludes the source-flagged `qwen3-max-2025-09-23` row.

**Blueprint-Bench 2** uses normalized connectivity similarity from Epoch's external-benchmark data for Andon Labs' leaderboard. Atlas does not match models by Andon's internal identifiers.

**Chess Puzzles v2** uses Epoch's current submission-tool harness with a one-million-output-token budget and exact-move grading across 100 positions. Version :version[chess_puzzles] pools its minor and patch versions as Epoch's own leaderboard does, because the publisher scores them comparably. The [publisher's changelog](https://github.com/epoch-research/chess-puzzles-mirror/blob/main/bench/task/chess_puzzles/CHANGELOG.md) identifies v1's one-call protocol and LLM answer extraction as incompatible. Atlas excludes v1 observations from current scores, cache fallback, and stored calibration evidence.

**FrontierMath Tier 4** keeps the public v2 benchmark name and uses Epoch’s newest evaluation-task version, currently :version[frontiermath_tier_4], under the exact `FrontierMath-Tier-4-v2-Private` task. The task version labels aggregate model evaluations, not individual mathematics questions or a separately published benchmark version. Earlier versions cannot supply scores or historical calibration inputs.

### Mercor

**APEX Agents** uses Mercor's creator-owned Loop Pass@1 leaderboard directly.

**APEX-SWE** uses Mercor's `pass-1` results under `terminus-2` from its [leaderboard](https://www.mercor.com/apex/apex-swe-leaderboard/). Inspect results are stored but not scored, and they cannot fill missing Terminus-2 observations.

**SUPERChem** uses Mercor's published `pass-1` result from the [leaderboard](https://www.mercor.com/apex/oss-benchmarks/oss-super-chem-leaderboard/) of the 500-question multimodal release series. Atlas does not read text-only runs or reasoning-path fidelity scores.

**APEX-SWE and SUPERChem** do not treat a model's release date as an evaluation timestamp, and aggregate sample counts are not assumed to be harness-specific task counts. Mercor's grading description conflicts with parts of the original papers, so scoring follows the published leaderboard metric and does not claim to reproduce its grader independently.

### Surge

**Chartography, ComplexConstraints, and HANDBOOK.md** use published percentages; ComplexConstraints uses all-criteria task pass. Resources shown on a Surge page do not affect :score[Speed] or :score[Value].

**Surge versions** appear as a label beside a board's title, with a changelog entry for what changed. Atlas reads the label as the rows' version, so a new version [replaces the stored rows](methodology/sources.md#version-changes-and-withdrawn-results) instead of joining them. A board without a label publishes no version, so Atlas treats its results as one series.

**DAYJOB: Finance and Healthcare** use the published strict pass@1 percentages defined in the [DAYJOB paper](https://arxiv.org/html/2610.01306v1). An attempt succeeds only when every rubric criterion passes, and each task averages its scored attempts before the benchmark averages tasks. RewardKit's fractional rubric reward is an intermediate result, not the headline metric. Finance has 80 scored tasks and Healthcare 50, with five attempts per task and errored attempts excluded. The current Hugging Face releases each contain three samples, despite the paper's claim of 50 public tasks in each domain.

**GDP.pdf** uses Surge's published all-criteria task success. Surge runs its current version in an agentic harness with revised rubrics, while Artificial Analysis evaluates the public task set with its own document delivery, harness, and judge and calls the two not interchangeable, so Atlas scores Surge's board alone. Surge publishes no comparable task resources, so GDP.pdf does not affect :score[Speed] or :score[Value].

**GDP.xlsx** uses the [Surge leaderboard](https://surgehq.ai/benchmarks/gdp-xlsx) percentage directly. The released harness averages binary rubric credit over five attempts per task and then across tasks, excluding errored attempts. It grades the final response text. The full benchmark contains 70 tasks, with three public samples.

**Hemingway-bench** keeps its expert-preference Elo and does not convert it to a percentage.

**Riemann-bench** uses the normalized public percentage directly.

**sudo L7** uses the current [Surge leaderboard](https://surgehq.ai/benchmarks/sudo-l7) percentage directly, which takes precedence over differing blog figures. Each row keeps its reasoning effort and disclosed agent harness. The public release does not fully specify rubric aggregation, grader validation, or repeat counts; Atlas does not reinterpret the percentage as a reconstructed pass rate. Blog cost figures do not supply benchmark resources.

### Vals

**BioMysteryBench, Code Migration, EMB, MysteryMechanism, Public Benefits Bench, and Vibe Code** use `overall`; Finance Agent uses `all_pass`, ProgramBench uses `almost`, and SRE Bench uses `partial`. BioMysteryBench `overall` is mean accuracy across three full 90-task runs, and its human-difficult split is stored for inspection, not scored. MysteryMechanism `overall` is functional-recovery accuracy across 222 held-out mechanisms. ProgramBench `almost` is the share of tasks passing at least 95% of hidden behavioral tests, and it has no Mercor crosswalk. SRE Bench `partial` is its Capability Score across 1,572 objectives in 262 binary instances; its Fully Solved rate is kept as supporting context. Finance Agent, EMB, and Code Migration read the pages of the versions Vals currently maintains, :version[finance_agent], :version[emb], and :version[code_migration]. Vals marks earlier versions as superseded and adds no new models to them, so their pages are not read. Vals reports cost and latency per test and token use as totals over the tests it measured, with input counting cache reads and writes and output counting reasoning. Atlas divides the totals by that test count, so cost, runtime, and tokens all count per test under the [resource rules](methodology/leaderboard-rules.md#resource-score-availability). These benchmarks are not Time Horizon evidence.

**RSI** is published by Vals as the RSI Index, and its current four-task suite carries version :version[rsi_benchmark]. Its overall score is the mean of four reference-anchored task scores, each mapped to 0 at its starter and 0.5 at a selected reference. Atlas counts that single score once as one benchmark result. Compression, LM Training, Harness Engineering, and Post-Training are stored for inspection and never become four additional scoring inputs. The suite's tasks can change under an unchanged version, so the declared four-task set is part of the suite's structure: another composition supplies no rows even when the version is the same. The results compare model-plus-agent systems because Claude, GPT, Gemini, and other model families used different disclosed agent products. Published RSI cost and duration do not affect :score[Speed] or :score[Value].

### Other Sources

**Agents' Last Exam** uses `max(median_score, mean_score)` across the harnesses that ran one model at one reasoning effort in the Full Overall split, because partial-credit score is more informative than pass-rate accuracy. Each effort, which the source publishes as the harness variant, keeps its own result. Resource totals are divided by evaluated task count, and displayed resources use the lower of the resulting median and mean per-task values.

**ALE-Bench** combines Sakana AI and Epoch at fixed 50/50 source weight and stores both raw datasets. The Sakana `num_self_refine = 1` all-task mean and matched Epoch Performance are averaged in native Performance units, with no probability clamp. The crosswalk for missing counterparts has an error limit of 0.01 Performance points. Costs and tokens follow the [agreement check](methodology/sources.md#resources-across-sources); neither source reports runtime. Missing or divergent Epoch data does not discard successfully fetched Sakana observations.

**AutomationBench** uses Zapier's official `task_completed_correctly` rate, which requires every final-state assertion for a task to pass. Partial credit is not read. Rows that combine a model with a fallback model are dropped, and only the official row's comparable per-task cost can affect :score[Value].

**FrontierCode** uses Main `new_score` from Cognition's version :version[frontier_code] artifact. Its 132 tasks span more repositories and categories than earlier versions, including security patches and performance work, under stricter mergeability standards. Cognition publishes each major version at its own address, so a new major version [supplies no rows](methodology/sources.md#version-changes-and-withdrawn-results) until Atlas reads that address. Main per-task cost can affect :score[Value] and token averages can supply :score[Speed]'s task-time fallback. Cognition's proprietary SWE-1.6, SWE-1.7, and SWE-2 rows are not scored.

**GDPx** reproduces the score on SemiAnalysis's [leaderboard](https://gdpx.semianalysis.com) for version :version[gdpx] from the per-partner results it publishes. Each partner's result is the mean of three attempts per task under each task's intended binary or partial-credit grading; partners are averaged within their domain, and the 11 domains count equally. Atlas reads this default score rather than the leaderboard's partial-credit view. It keeps Biology, Cybersecurity, and Alignment, where safety classifiers lower some models' results, because the publisher's headline score includes them. Each model runs in its lab's own agent at one reasoning effort, so a result is model-plus-agent evidence, and an effort labelled Highest counts as the model's own top setting. Models evaluated in one domain only are not scored, and a model missing a domain gets no result. The published cost and output tokens per task can affect :score[Speed] and :score[Value].

**Terminal-Bench :version[terminal_bench]** uses the official 66-task board, the version its publisher currently maintains. It combines that board at fixed 50/50 source weight with Artificial Analysis's full evaluation dataset while that page reports the same version, because combining the two assumes the official suite's tasks. Otherwise official results score alone. Official totals are divided by their 330 runs, and Artificial Analysis's by the runs its methodology table lists. Official and Artificial Analysis cost, runtime, total-token, and output-token amounts fail the agreement check and are kept separate by source, each with half of the benchmark's resource weight. Resource columns and comparisons identify each source with a suffix.

**Terminal-Bench-Science :version[terminal_bench_science]** combines the official three-repeat 70-task quality series, Vals's single-run series, and Artificial Analysis's independent three-repeat series at fixed one-third source weights. The Vals and Artificial Analysis series must report the official suite's version, because combining them assumes its tasks. Official cost and token totals are divided by their 210 runs; Vals's per-test cost and runtime pass through unchanged and its token totals are divided by the tests it measured, and Artificial Analysis's totals are divided by the runs its methodology table lists. Cost, runtime, and token measurements stay source-specific, each paired with its source's observed quality and one-third of the benchmark's resource weight. Expanded variants match exact efforts; Collapsed rows select each source's highest reported effort and keep that effort's label for each source.

**Terminal-Bench and Terminal-Bench-Science crosswalks** supply missing counterparts with an error limit of 2.5 percentage points. Terminal-Bench-Science fits each source pair only on observed exact-effort overlap. [Resource score availability](methodology/leaderboard-rules.md#resource-score-availability) still requires each source's own evidence.

**Vending-Bench 2** uses average final money balance with ordinary observed-range [linear scaling](methodology/operations.md#linear-scaling-and-clamping). Costs do not affect :score[Speed] or :score[Value], and the result is read as a stochastic simulation, not a success rate.

**VoxelBench** uses the official text-prompt leaderboard’s Glicko-2 rating, with the same minimum of 50 votes as the public table. Native rating points stay in the source evidence and payload; standard observed-range linear scaling maps them to 0–100 for the table and both capability scores, as for Hemingway-bench. There is no fixed 2,500-point ceiling or probability interpretation. Labelled reasoning efforts and explicit thinking budgets are separate variants. Published model slugs support exact matching, including dated releases; stealth aliases are stored with the row and cannot override the displayed model identity. A successful refresh replaces each matched row’s rating and uncertainty together as votes evolve. Vote counts and rating deviation are kept as supporting evidence, not as extra scores or Model Atlas evidence weights. Atlas does not ingest image-track ratings, duplicate win/loss summaries, or token list prices, and no VoxelBench resource contributes to :score[Speed] or :score[Value].

**WeirdML v:version[weirdml]** combines the creator's published overall `score` and Epoch's mirror of the same version at fixed 50/50 source weight. The official score spans 11 scientific and machine-learning tasks. It rewards 80% area under the best-so-far progress curve on the log-token axis from 500,000 to 50 million tokens and 20% final-best performance; purchased hints carry the publisher's penalties. The crosswalk for missing counterparts has an error limit of 0.025 score units. The two sources' labels are aligned by provider/model identity, reasoning effort, and agent, and both raw scores and disclosed harness versions are kept; differing run counts or additional versions of the same agent are stored as context only. Multiple agents for one model and effort are stored as raw evidence but cannot be assigned to the model. Version 2 accuracy is not compatible with this series. Published cost and output-token means are stored for inspection and do not contribute to resource scoring.

**OpenRouter** supplies current route pricing and provider speed measurements used for blended price and provider speed in :score[Value] and :score[Speed]. Catalog metadata can help identify comparable model entries, but it is not itself a scoring input.
