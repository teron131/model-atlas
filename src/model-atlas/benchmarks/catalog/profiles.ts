/** Each task benchmark's profile: what a model is given and must produce, the task mix, the environment, and how results are graded, as facts from the benchmark's own paper, site, or repository, with the URLs they came from. `pnpm domains:label` rates each domain against these profiles, so a profile states no judgement of what its benchmark tests and gives task counts and concrete tasks rather than a summary, because the rater takes cue words such as "terminal" and summarising phrases at face value. They are not yet reviewed by hand; "not published" marks what the sources leave out. */

import type { TaskBenchmarkKey } from "./portfolio";

type BenchmarkProfile = {
  given: string;
  produces: string;
  taskMix: string;
  environment: string;
  gradedBy: string;
  sources: readonly string[];
};

// Every task benchmark must carry a profile, so a new benchmark fails the typecheck until it is researched.
export const BENCHMARK_PROFILES: Record<TaskBenchmarkKey, BenchmarkProfile> = {
  aa_3d: {
    given:
      "a written brief for one interactive scene (e.g. a spinning black hole, a playable pinball table) plus a delivery contract shared by all tasks.",
    produces: "a single index.html page that runs the scene in a browser using three.js.",
    taskMix:
      "55 tasks across 7 domains: landmarks and real places, machines, natural phenomena, living bodies, games/sports/piloting, space, and stories and fantasy; per-domain counts not published.",
    environment:
      "offline sandbox with no network, containing Blender, Rapier physics, Python, a headless browser, and a CC0 asset library; many steps (write code, render, view its own screenshots, revise), capped at 3 hours or 250 turns.",
    gradedBy:
      "blind pairwise human preference votes between two scenes built for the same task, aggregated into Elo ratings.",
    sources: ["https://artificialanalysis.ai/evaluations/aa-3d"],
  },
  agents_last_exam: {
    given:
      "a task description and metadata, with input files in a read-only input/ directory and pre-installed applications on a remote Linux or Windows virtual machine.",
    produces:
      "output artifacts written to an output/ directory, such as files, spreadsheets, models, or reports.",
    taskMix:
      "1,490 task instances from 960 task workflows across 55 subdomains grouped into 13 domains; public set of about 150 tasks in three difficulty tiers (Near-Term 67, Full-Spectrum 55, Last-Exam 38).",
    environment:
      "harness with shell and file access plus 14 desktop-action tools for operating GUI applications; many steps, capped at five hours per run.",
    gradedBy:
      "per-task evaluate() scripts comparing outputs to hidden references, returning a score from 0 to 1; deterministic checks preferred, narrow yes/no model-judge probes allowed, gate checks that zero the score, partial credit for intermediate milestones; reported as full pass rate and mean score.",
    sources: [
      "https://arxiv.org/html/2606.05405",
      "https://snorkel.ai/blog/agents-last-exam-reading-group/",
    ],
  },
  ale_bench: {
    given:
      "a Markdown problem statement (with images) from an AtCoder Heuristic Contest, a scorer, a visualizer, and the ability to generate test inputs.",
    produces:
      "a program (C++, Python, or Rust) that outputs solutions to an optimization problem with no known exact solution, run on hidden test inputs under 2 to 10 second time limits per case.",
    taskMix:
      "40 problems from AtCoder Heuristic Contests held up to April 2025, with a 10-problem lite subset; per-topic counts not published.",
    environment:
      "Python library session with a real-time timer simulating contest duration; the model can run code on public or self-generated inputs, view visualizations, and resubmit before a final submission; many steps.",
    gradedBy:
      "the official scorer on hidden inputs; raw score converted to rank and an Elo-like performance value against the original human contestants, averaged across problems.",
    sources: ["https://arxiv.org/abs/2506.09050", "https://arxiv.org/html/2506.09050"],
  },
  analyst_agent: {
    given:
      "a quantitative question tied to a folder of source spreadsheets and documents, such as zipped archives of Excel (.xlsx) files.",
    produces:
      "a numeric answer in a specified format, e.g. a percentage to two decimals or a dollar amount rounded to the nearest dollar.",
    taskMix:
      "80 questions across 14 business and scientific domains (finance, business, and math tags); example analysis types include ratio and share construction, and component reconciliation and allocation; per-domain counts not published.",
    environment:
      "agent harness with code execution over the provided files; many steps; toolset details on a separate methodology page, not published here.",
    gradedBy:
      "comparison with privately held reference answers; each question run five times, headline metric pass^5 (correct on all five runs).",
    sources: ["https://artificialanalysis.ai/evaluations/aa-analyst-agent"],
  },
  apex_agents: {
    given:
      "a task set inside a simulated project world containing files, as for a corporate lawyer, management consultant, or investment banking analyst; file types not published.",
    produces: "completed work product for the task; output formats not published.",
    taskMix:
      "240 tasks in 31 worlds spanning three jobs: corporate law, management consulting, and investment banking; per-job counts not published.",
    environment:
      "access to the workplace software a human in the role would use, across multiple applications, run on Mercor's Archipelago infrastructure; many steps; specific tools not published.",
    gradedBy:
      "expert-written rubric per task applied by a language-model judge; mean share of rubric criteria passed, and Pass@1 for tasks scoring 100%.",
    sources: ["https://www.mercor.com/apex/apex-agents-leaderboard/"],
  },
  apex_swe: {
    given:
      "a software task written by professional engineers; input format not published beyond service setups and production-style telemetry (logs, metrics) for debugging tasks.",
    produces: "completed work: built and deployed systems or fixes to failing software.",
    taskMix:
      "200 tasks of two types: integration (building and deploying end-to-end systems across multiple services) and observability (debugging with production-style telemetry); per-type counts not published; 50 tasks public.",
    environment:
      "terminal-based harnesses (Terminus-2 and Inspect); many steps; full tool list not published.",
    gradedBy:
      "unit tests plus a human-authored rubric covering functional requirements, robustness, and code style, applied by a language-model judge; Pass@1 counts tasks scoring 100%.",
    sources: ["https://www.mercor.com/apex/apex-swe-leaderboard/"],
  },
  arc_agi_2: {
    given:
      "a few demonstration pairs of input and output colored grids, plus one or more test input grids.",
    produces: "the output grid for each test input, cell by cell.",
    taskMix:
      "120 tasks each in the public, semi-private, and private evaluation sets (1,000 training tasks); each task is a distinct grid transformation, every one solved by at least two humans within two attempts; category counts not published.",
    environment: "none; single response per attempt, no tools.",
    gradedBy:
      "exact match of the predicted grid, with two attempts allowed (pass@2); cost per task reported alongside.",
    sources: [
      "https://arcprize.org/arc-agi/2/",
      "https://arcprize.org/media/data/leaderboard/v2.json",
    ],
  },
  arc_agi_3: {
    given:
      "an unfamiliar turn-based game environment observed through frames, with no natural-language instructions, rules, or stated goal; exact observation format not published on the pages read.",
    produces:
      "a sequence of actions (discrete game actions stepped one at a time) that completes the game's levels.",
    taskMix:
      "handcrafted game environments built by human game designers, each with multiple levels; 25 public games listed (e.g. ls20, ft09); levels per game not published.",
    environment:
      "interactive game API (step an action, receive the next frame); many steps; no tools beyond the game.",
    gradedBy:
      "levels completed and the number of actions used compared with humans; 100% means beating every game as efficiently as humans; exact formula not published on the pages read.",
    sources: [
      "https://arcprize.org/arc-agi/3/",
      "https://arcprize.org/blog/arc-agi-3-launch",
      "https://docs.arcprize.org/",
    ],
  },
  arena_agent: {
    given:
      "real user requests in Arena's Agent Mode, often delegating a whole job, followed by user steering turns and in-line corrections.",
    produces:
      "files and workspaces (.docx, .pptx, .xlsx, .pdf, images), code, and replies over a session.",
    taskMix:
      "from a 7-day slice of 160,480 tasks: code writing 17.5%, research and lookup 10.8%, planning and brainstorming 10.6%, image/video work 10.2%, document creation 9.1%, code debugging 8.9%, other about 33%.",
    environment:
      "harness with bash, web search, file writes, and subagents; many steps, averaging about 16.5 tool calls per session; orchestrator model randomized per session.",
    gradedBy:
      "in-the-wild signals estimated by causal comparison across randomized orchestrators: user-confirmed success, praise versus complaints, accepted corrections, bash error recovery, and calls to nonexistent tools.",
    sources: ["https://arena.ai/blog/agent-arena-methodology/"],
  },
  arena_webdev: {
    given:
      "a user's text prompt for a web app or site, e.g. a markdown editor with dark mode, a Hacker News clone, or a chess game.",
    produces:
      "a live multi-file web project (HTML, CSS, JavaScript) rendered as an interactive preview.",
    taskMix: "user-submitted prompts grouped by topic modeling; category shares not published.",
    environment:
      "tool calls create_file, edit_file, read_file, and run_command in a sandboxed microVM; multiple steps and turns per generation.",
    gradedBy:
      "pairwise human votes between two models' apps for the same prompt, judging functionality, usability, fidelity, and design; aggregated with a Bradley-Terry model with confidence intervals.",
    sources: [
      "https://arena.ai/blog/code-arena",
      "https://arena.ai/blog/webdev-arena",
      "https://arena.ai/leaderboard/code/webdev",
    ],
  },
  automation_bench: {
    given:
      "one trigger message and a freshly seeded simulated business with CRM records, inbox threads, spreadsheets, and support cases, including stale rows and near-duplicate names; no clarifying questions allowed.",
    produces: "changes to the simulated apps' state; the final text reply is ignored.",
    taskMix:
      "600+ held-out tasks in six business domains: sales, marketing, operations, support, finance, and HR, spanning 47 simulated apps with about 500 API endpoints; per-domain counts not published.",
    environment:
      "two tools: keyword search over API schemas and an execute call (method, URL, body); up to 50 steps per task.",
    gradedBy:
      "deterministic assertions on final state, including negative checks; a task passes only if every assertion passes; no model judge.",
    sources: ["https://zapier.com/benchmarks"],
  },
  biomysterybench: {
    given:
      "real biological datasets with metadata such as sample origin removed, e.g. sequencing FASTQ files, RNA expression data, and mass-spectrometry mzML files, plus a question.",
    produces: "a submitted answer to the question.",
    taskMix:
      "sequencing, expression analysis, variant calling, epigenomics, metagenomics, proteomics, and metabolomics; tasks split into those solved by at least one of up to five domain experts and those none solved; task count not published.",
    environment:
      "Terminus 2 terminal harness with alignment, sequence-processing, quality-control, workflow, R/Bioconductor, and Python tools; network limited to package repositories and required biological databases; many steps, up to 200 turns and four hours.",
    gradedBy: "a separate judge model accepts or rejects each answer (binary); mean of three runs.",
    sources: ["https://www.vals.ai/benchmarks/biomysterybench"],
  },
  blueprint_bench_2: {
    given:
      "about 20 interior photographs per apartment; an agent run works through 50 apartments in sequence.",
    produces:
      "a 2D floor plan of each apartment showing rooms, their connections (doors), and relative room sizes, following strict formatting rules; file format not published.",
    taskMix:
      "50 apartments per run; a human baseline used a subset of 12. Breakdown by apartment type not published.",
    environment:
      "multi-step agent run with a persistent notepad that carries notes across apartments; other tools not published.",
    gradedBy:
      "automatic comparison of the plan's room-connectivity graph with ground truth, invariant to rotation and reflection: room-to-room connection Jaccard 50%, doors per room 20%, overall connectivity density 10%, room count 10%, door count 5%, orientation 5%; normalized so random is 0 and perfect is 1.",
    sources: [
      "https://andonlabs.com/evals/blueprint-bench-2",
      "https://epoch.ai/data/external_benchmarks/blueprint_bench_2.csv",
    ],
  },
  briefcase: {
    given:
      "multi-week business scenarios with shared input files (one example scenario has 67 source files), in fields such as data science, product management, banking, operations, heavy industry, and corporate strategy; each task is a weekly assignment within a scenario.",
    produces:
      "deliverable files such as Excel spreadsheets, PowerPoint presentations, Word memos, PDF reports, and other formats (HTML, LaTeX).",
    taskMix:
      "91 tasks across four scenarios, up to five per week; a public example week has a market structure map, market model, target assessment, and briefing video. Per-scenario counts not published.",
    environment:
      "many-step agent run with tools to explore, read, write, compute, and view images; each task is an independent run without the model's earlier submissions.",
    gradedBy:
      "binary rubric checks (instructions, hidden requirements across files, citations, planted cross-source conflicts, conclusions) plus pairwise model comparisons for analytical quality and presentation, combined into an Elo score.",
    sources: ["https://artificialanalysis.ai/evaluations/aa-briefcase"],
  },
  chartography: {
    given:
      "one real chart image from professional or academic sources, placed in the agent's workspace, plus an expert-written question about it.",
    produces: "a single answer saved to a file, with no explanation.",
    taskMix:
      "100 chart-question pairs across 12 domains in STEM (including five engineering subfields), finance/investing, manufacturing/supply chain, and healthcare; chart types include Kaplan-Meier curves, candlestick charts, contour maps, Sankey diagrams, and Bode plots. Per-domain counts not published.",
    environment:
      "since v1.1, an agent run in Surge's Harbor container harness: up to 30 minutes in an offline Linux container with Python and image, OCR, PDF, and numerical libraries (Pillow, NumPy, SciPy, OpenCV, Tesseract OCR, PyMuPDF) for reading, measuring, and interpolating chart values.",
    gradedBy:
      "a Gemini 3.5 Flash judge compares the saved answer with the golden answer, which carries an expert-set acceptable range based on the chart's readable precision; the judge does not see the chart; score is the fraction judged correct.",
    sources: [
      "https://surgehq.ai/benchmarks/chartography",
      "https://raw.githubusercontent.com/surge-ai/chartography/main/README.md",
      "https://huggingface.co/datasets/surgeai/chartography",
      "https://huggingface.co/datasets/surgeai/Chartography-harbor",
      "https://arxiv.org/pdf/2608.10677",
    ],
  },
  chess_puzzles: {
    given:
      "a chess position as a FEN string and a prompt asking for the best next move for the side to move, with an output-token budget.",
    produces:
      "one move as a four-character start-and-end-square string (e.g. b1c3), submitted through a submit_answer tool.",
    taskMix:
      "100 positions generated programmatically: six random opening moves, then Stockfish play at a random Elo, keeping positions with exactly one best move; trivial captures of undefended or higher-value pieces are filtered out.",
    environment:
      "no tools besides the submission tool; one conversation with continuation prompts if output is cut off and a forced final answer when the budget runs out.",
    gradedBy:
      "exact match against the Stockfish-determined best move after normalizing case, punctuation, and whitespace.",
    sources: ["https://epoch.ai/benchmarks/chess-puzzles"],
  },
  code2video_aa: {
    given:
      "one design brief for a short product or brand video from the Code2Video Bench public split, plus a fixed system prompt.",
    produces:
      "one HTML composition (index.html) using HTML layout and GSAP animation, which is rendered to video outside the model.",
    taskMix:
      "114 briefs; examples include a wireframe builder demo, a kinetic-type product reveal, and a chat bubble color cycle. Category breakdown not published.",
    environment: "no tools; a single call.",
    gradedBy:
      "a model judge compares two models' rendered videos for the same brief blind, on five axes (engagement, prompt intent, composition, temporal consistency, craft); each axis gets an Elo rating and the score is their mean.",
    sources: ["https://artificialanalysis.ai/evaluations/code2video-aa"],
  },
  code_migration: {
    given:
      "a working source program (repository) and instructions to reimplement it in a named target language.",
    produces: "a target-language implementation plus a Dockerfile that builds it.",
    taskMix:
      "CLI split of 30 open-source repositories in Python, Java, Kotlin, Rust, and C++, each migrated into the other four languages (120 migrations, about 100-400 hidden tests each); COBOL split of 10 COBOL-to-Java repositories covering file formats, batch workflows, terminal interfaces, and persistent state.",
    environment: "offline sandbox, many-step agent harness.",
    gradedBy:
      "building the Docker image and running hidden behavioral tests through the command line; pass rate is the score, with an anti-cheat check zeroing submissions that wrap the original executable, copy reference artifacts, hardcode outputs, or use the wrong language. CLI is weighted 3:1 over COBOL.",
    sources: ["https://www.vals.ai/benchmarks/code-migration-v1-1"],
  },
  complex_constraints: {
    given:
      "a single-turn text instruction set in a professional scenario containing many layered requirements, some interdependent, conditional, implicit, or multistep.",
    produces:
      "one text response (e.g. a piece of writing, a schedule, or a plan); format not published.",
    taskMix:
      "75 public prompts with 1,559 rubric criteria (10-40 per prompt), covering professional writing, scheduling, and planning; per-category counts for the benchmark not published (the separate training set is 39% business writing, 22% scheduling).",
    environment: "no tools; one response.",
    gradedBy:
      "expert-written atomic rubric criteria, each labeled explicit or implicit and objective or subjective, checked by a model verifier; a prompt passes only if every criterion is satisfied.",
    sources: [
      "https://surgehq.ai/benchmarks/complex-constraints",
      "https://arxiv.org/html/2606.09118",
      "https://www.surgehq.ai/blog/complexconstraints-a-benchmark-for-entangled-instruction-following",
    ],
  },
  critpt: {
    given:
      "unpublished research-level physics problems written by over 60 physics researchers, from CritPt v2 (70 challenges); this is the hard subset, whose size and selection are not published.",
    produces:
      "a final answer in physics-specific formats, with dataset fields for code answers and code templates; exact format not published.",
    taskMix:
      "full set by area: condensed matter 25, quantum information 17, atomic/molecular/optical 14, high energy 10, mathematical physics 10, gravitation/cosmology/astrophysics 9, statistical physics 9, nuclear 7, nonlinear dynamics 4, fluid dynamics 2, biophysics 2. Hard-subset breakdown not published.",
    environment: "code-execution tool in an offline Linux Python sandbox; multiple steps.",
    gradedBy:
      "the authors' automated evaluation server checks guess-resistant, machine-verifiable answers.",
    sources: [
      "https://artificialanalysis.ai/evaluations/critpt-v2?critpt-subset=hard",
      "https://arxiv.org/abs/2509.26574",
      "https://huggingface.co/datasets/CritPt-Benchmark/CritPt/blob/main/README.md",
    ],
  },
  dayjob_finance: {
    given:
      "a finance assignment inside a containerized environment with documents and business context; file types not published.",
    produces: "delivered work-product files.",
    taskMix:
      "80 finance tasks (50 publicly released) across corporate finance, banking, credit, investing, and real assets; a professional takes about 16.6 hours per task on average. Per-area counts not published.",
    environment:
      "containerized Harbor environment; long many-step agent run; specific tools not published.",
    gradedBy:
      "an expert rubric of binary criteria (median 57.5 per task) applied to the delivered files by an agentic model judge; an attempt passes only if it meets every criterion.",
    sources: ["https://surgehq.ai/benchmarks/dayjob-finance", "https://arxiv.org/abs/2610.01306"],
  },
  dayjob_healthcare: {
    given:
      "a healthcare assignment inside a containerized environment with fragmented medical records; file types not published.",
    produces: "delivered work-product files.",
    taskMix:
      "50 tasks (all released) across clinical, operational, payer, pharmacy, and compliance workflows, including clinical care and coverage assignments; a professional takes about 13.6 hours per task on average. Per-area counts not published.",
    environment:
      "containerized Harbor environment; long many-step agent run; specific tools not published.",
    gradedBy:
      "an expert rubric of binary criteria (median 47.5 per task) applied to the delivered files by an agentic model judge; an attempt passes only if it meets every criterion.",
    sources: [
      "https://surgehq.ai/benchmarks/dayjob-healthcare",
      "https://arxiv.org/abs/2610.01306",
    ],
  },
  ebr_bench: {
    given:
      "a system prompt explaining the experiment and scoring, a compressed rulebook, reference files (full rulebook, glossary, digital interface guide), for the card-based board game Earthborne Rangers.",
    produces: "game moves across repeated playthroughs, plus notes in a notes directory.",
    taskMix:
      "playthroughs of the first five in-game days of the campaign; default run of 10 playthroughs, 8 for practice and 2 scored; the agent must discover the 21 scored objectives (missions, rewards, notable events).",
    environment:
      "many-step agent harness (ReAct or multi-agent with up to four subagents) with a card lookup utility, a map image, a text pathfinding utility, and an editable notes directory that persists across context compactions.",
    gradedBy: "objectives completed out of 21 in the better of the two scored playthroughs.",
    sources: [
      "https://epoch.ai/benchmarks/ebr-bench",
      "https://epoch.ai/publications/earthborne-rangers-benchmark",
    ],
  },
  emb: {
    given:
      "a written business scenario plus source files such as historical financials or customer databases in spreadsheets; in Template mode also a workbook skeleton, in Scratch mode none; some tasks include Base/Bull/Bear case toggles.",
    produces:
      "a complete Excel workbook with tabs, formulas, and formatting that recalculates cleanly.",
    taskMix:
      "103 expert-written tasks (51 test, used for results) in seven families: LBO, DCF, M&A, operating models, comps spreads, dataroom summaries, and miscellaneous (13-week cash flow, equity waterfall, project finance, multi-tranche returns). Per-family counts not published.",
    environment:
      "many-step agent run with bash, a workbook recalculation tool, web and SEC filing search, price history, and a submit tool; 3.5-hour cap.",
    gradedBy:
      "after recalculation in Microsoft Excel, Template mode scores exact cell matches against an expert gold workbook; Scratch mode scores rubric checks (numbers, formulas, presentation) judged by a model.",
    sources: ["https://www.vals.ai/benchmarks/emb-v1-1"],
  },
  enigmaeval: {
    given:
      "a puzzle as PNG images of the original source PDF or webpage screenshot, or alternatively as human-transcribed text with image placeholders plus separate image files; meta-puzzles include the answers to preceding puzzles.",
    produces:
      'a step-by-step solution ending in a line "Answer: <answer>", usually a single word or short phrase, sometimes an answer pair or comma-separated list.',
    taskMix:
      "1,184 puzzles in the paper (released set has 23 fewer). Normal split 949: PuzzledPint 838, CS50x Puzzle Day 41, Puzzle Potluck 34, cryptic crosswords 30, CRUMS 6. Hard split 235: MIT Mystery Hunt 72, Labor Day Extravaganza 153, Grandmaster Puzzles 10.",
    environment: "no tools described; one response per puzzle.",
    gradedBy:
      "string match of the final answer against the ground-truth solution; accuracy, with correct answers audited for plagiarism.",
    sources: ["https://arxiv.org/html/2502.08859v2", "https://scale.com/leaderboard/enigma_eval"],
  },
  erqa: {
    given:
      "a text question with one or more images (28% of questions have more than one image); images come from the authors' own photos and robot or egocentric datasets (OXE, UMI Data, MECCANO, HoloAssist, EGTEA Gaze+).",
    produces: "a multiple-choice answer.",
    taskMix:
      "400 questions across seven categories: spatial relations, trajectories, actions, state estimation, pointing, multi-view questions, and task questions; per-category counts appear only in a figure, not published in text.",
    environment:
      "no tools; one response per question, optionally with a chain-of-thought instruction appended.",
    gradedBy: "accuracy of the chosen option against manually verified answer labels.",
    sources: ["https://arxiv.org/html/2503.20020v1"],
  },
  finance_agent: {
    given:
      "a text question about public companies, such as analyst-style research, comparisons, or a financial modeling request; source documents must be found with tools.",
    produces: "a written answer with the requested figures and calculations.",
    taskMix:
      "927 expert-reviewed questions (27 public, 450 private validation, 450 test; results use the test set) in nine categories: general qualitative analysis, general quantitative analysis, market analysis, comparables, precedents, adjustments, earnings analysis, disclosure analysis, financial modeling; per-category counts not published.",
    environment:
      "multi-step tool loop with six tools: EDGAR search, web search, HTML page parser, retrieval over fetched pages, calculator, price history; two-hour limit per task.",
    gradedBy:
      "weighted rubric checks per question, some dealbreakers that zero the question, applied by a three-model LLM judge jury; primary metric dealbreaker-gated partial credit, secondary all-pass; three runs averaged.",
    sources: ["https://www.vals.ai/benchmarks/fabv2", "https://arxiv.org/abs/2508.00828"],
  },
  frontier_code: {
    given:
      "an open-source code repository at a base commit, a short human-style change request, and codebase guidelines on testing, linting, and style.",
    produces:
      "a code change (diff) implementing the request, with added or updated tests registered in the build and no leftover formatting changes.",
    taskMix:
      "150 tasks from 36 open-source repositories (e.g. Celery, Budibase, uppy, Mattermost, jsonschema), written by 20+ maintainers; Main subset is the hardest 100, Diamond the hardest 50; per-language counts not published.",
    environment:
      "the repository with its build, format, lint, and test tooling (e.g. make, GoogleTest, shell tests); many steps; harness details not published.",
    gradedBy:
      "blocker checks that must all pass, plus weighted non-blockers: injected hidden tests, shell command exit codes, agent tests that must fail on the base commit, LLM-adapted reference tests, scope and diff-size limits, and an LLM rubric review of the diff; metrics are pass rate and weighted score.",
    sources: ["https://cognition.com/blog/frontier-code"],
  },
  frontiermath_tier_4: {
    given:
      "a text problem statement in mathematics, newly written by expert mathematicians and unpublished.",
    produces:
      "a final answer as a closed-form mathematical object that can be checked computationally, such as an integer, a symbolic real number, or a tuple of these.",
    taskMix:
      "Tier 4 is the expansion set of the hardest problems: 43 problems in v2 (50 in v1; 12 corrected and 7 removed), 2 public and the rest private; areas named include analysis, number theory, combinatorics, topology, algebraic geometry; per-area counts not published.",
    environment:
      "a Python environment where the model can write and run code before submitting; multiple steps.",
    gradedBy:
      "automatic computational check of the submitted answer against the reference; binary, 1 point if correct, 0 if wrong or missing.",
    sources: [
      "https://epoch.ai/frontiermath/tiers-1-4/about",
      "https://epoch.ai/benchmarks/frontiermath-tier-4-v2",
    ],
  },
  gdp_pdf: {
    given:
      "a task instruction plus a long real-world professional PDF containing diagrams, tables, forms, and technical content.",
    produces: "a written response answering the task's instructions.",
    taskMix:
      "100 tasks across ten professional domains (named examples: business, finance, legal, medical, science, healthcare), drawing on 4,592 source pages; per-domain counts not published here.",
    environment:
      "since v1.1, an agent run in Surge's Harbor-format container harness; Surge has not published the harness's tools or time limits.",
    gradedBy:
      "1,275 atomic expert-written criteria, with ambiguous ones revised in v1.1, each scored independently by an LLM judge; the headline score is the share of runs passing every criterion.",
    sources: [
      "https://surgehq.ai/leaderboards/gdp-pdf",
      "https://surgehq.ai/blog/gdp-pdf-can-100b-ai-models-master-the-documents-that-run-the-world",
      "https://github.com/surge-ai/gdp-pdf",
    ],
  },
  gdp_xlsx: {
    given:
      "a realistic workplace request written by a professional plus the full Excel workbook or CSV it refers to (2.18 million populated cells across the set), involving data, formulas, formatting, and business rules across sheets.",
    produces:
      "an answer to the request; whether edited workbooks are also expected is not published.",
    taskMix:
      "70 tasks across 13 domains (domain names and counts not published); 3 tasks public, 67 held out.",
    environment:
      "a container with spreadsheet tools; multi-step; whether general code execution is available is not published.",
    gradedBy:
      "an expert rubric of binary criteria per task (791 total), including completeness and exclusivity checks for set-valued answers, applied by an LLM judge that can open the file; strict pass@1, the share of attempts meeting every criterion.",
    sources: [
      "https://surgehq.ai/benchmarks/gdp-xlsx",
      "https://www.opentrain.ai/papers/gdp-xlsx-benchmarking-frontier-models-on-professional-workbooks--arxiv-2611.17766/",
    ],
  },
  gdpval_normalized: {
    given:
      "a professional task description from OpenAI's GDPval with any reference files, written with industry professionals.",
    produces: "deliverable files such as documents, spreadsheets, slides, diagrams, and PDFs.",
    taskMix:
      "220 tasks (the GDPval gold subset of a 1,320-task dataset) from 44 occupations across 9 major industries, including finance, healthcare, and legal; per-occupation counts not published on the page.",
    environment:
      "the Stirrup agent harness with shell access to a sandbox filesystem and web browsing/search; many turns per task.",
    gradedBy:
      "blind pairwise comparison of anonymized deliverables for the same task by an LLM judge, aggregated into Elo ratings anchored to a fixed reference model, with confidence intervals.",
    sources: [
      "https://artificialanalysis.ai/evaluations/gdpval-aa",
      "https://arxiv.org/abs/2510.04374v1",
    ],
  },
  gdpx: {
    given:
      "a task brief and working folder from one of 14 specialist partners, e.g. a colleague's half-finished quality-of-earnings workbook inside a 4,000-file deal data room, a routed RISC-V core whose timing must improve with at most 104 cells changed, a live enterprise system reached from a low-privilege account, or raw binding assays on twelve antibody variants.",
    produces:
      "the domain's deliverable: marked-up workbooks, slides, and memos; RTL, testbenches, and engineering change orders; CAD assemblies, toolpaths, and PCB layouts; exploits, reports, and fixes; contract redlines; code patches; trading strategies; or analyses of experimental data.",
    taskMix:
      "206 tasks across 11 domains: chip design (34 tasks from three partners), cybersecurity (18), biology (13), finance (24), legal (20), quant trading (10), ML research engineering (10), hardware design (21), materials science (23 from two partners), alignment (18), and software engineering (15); one public task per partner, the rest private.",
    environment:
      "a sandbox with the domain's software, such as OpenROAD and Cadence flows, SolidWorks, Siemens NX, KiCad, Vivado, simulated lab instruments, or live multi-service systems; each model runs in its lab's own agent (Claude Code, Codex, Antigravity, and others; OpenCode otherwise) at one reasoning effort; up to 8 hours of wall-clock time per task.",
    gradedBy:
      "each domain's own checks: outcomes verified in live systems, simulation, synthesis and sign-off, held-out trading P&L, and test suites, with LLM judges against expert rubrics in finance, legal, and parts of hardware; binary or partial credit as each task intends; the mean of three attempts per task, averaged within each partner, then each domain, then across domains with equal weight.",
    sources: [
      "https://gdpx.semianalysis.com",
      "https://gdpx.semianalysis.com/rollouts",
      "https://newsletter.semianalysis.com/p/gdpx-measuring-frontier-model-capabilities",
    ],
  },
  handbook_md: {
    given:
      "a company rulebook of 20 to 124 pages (Markdown handbook) and a task inside a self-contained simulated company workspace.",
    produces:
      "a final workspace and external-service state, such as files, emails, messages, tickets, and calendar entries, left as the handbook requires.",
    taskMix:
      "65 tasks across five enterprise domains: finance, medical billing, insurance, logistics, HR; per-domain counts not published here.",
    environment:
      "each task is its own environment with files, email, Slack, Jira, and calendar as internal tools plus external MCP servers; many steps.",
    gradedBy:
      "824 deterministic programmatic rubric checks of the final workspace state and external services, no LLM judge; strict scoring requires passing a task's checks.",
    sources: [
      "https://surgehq.ai/benchmarks/handbook",
      "https://www.alphaxiv.org/abs/2607.25398",
      "https://surgehq.ai/blog/handbook-md-draft",
    ],
  },
  hemingway_bench: {
    given: "a text writing prompt.",
    produces: "a piece of prose responding to the prompt.",
    taskMix:
      "real-world everyday creative, business, and personal writing (e.g. bedtime stories, complex business documents, an email to a landlord) and harder prompts with style, long-form consistency, and creative constraints (e.g. writing in the style of 1950s Beat poetry); counts per category not published.",
    environment: "no tools; one response per prompt.",
    gradedBy:
      "expert human writers (screenwriters, poets, speechwriters, copyeditors) in over 5,000 blind side-by-side pairwise comparisons, rating overall quality plus sub-dimensions (implicit intent, creativity, writing quality, truthfulness, coherence, instruction following, verbosity, humor); results shown as ratings with ranges, rating formula not published.",
    sources: [
      "https://surgehq.ai/blog/hemingway-bench-ai-writing-leaderboard",
      "https://surgehq.ai/benchmarks/hemingway-bench",
    ],
  },
  hle: {
    given:
      "a closed-ended academic question in text, with an image for 272 of the 1,000 questions; the official HLE system prompt.",
    produces:
      "one final answer per question; answer formats for this subset not published (the parent HLE uses multiple-choice and exact short answers).",
    taskMix:
      "1,000 questions refined over about a year from Humanity's Last Exam by its creators with research-community input, split into two 500-question partitions; subject filters include mathematics, science, humanities, and medicine; per-subject counts not published.",
    environment: "no tools; one response per question.",
    gradedBy:
      "an LLM judge comparing the answer to the reference with the official HLE judge prompt, small margin for numerical answers; pass@1 share correct, invalid answers counted wrong.",
    sources: ["https://artificialanalysis.ai/evaluations/hle-diamond"],
  },
  intphys2: {
    given:
      "a short video of a synthetic Unreal Engine scene, as an MP4 file or uniformly subsampled image frames, with a prompt saying it comes from a simulator.",
    produces:
      "a binary judgement of whether the events shown are physically possible (yes/no or 0/1).",
    taskMix:
      "Main split of 1,012 videos from 253 scenes (Easy, Medium, Hard by visual complexity), plus a 344-video held-out split; each scene has two possible and two impossible clips built around occluders, covering object permanence, immutability, spatio-temporal continuity, and solidity (e.g. Box, RotatingCup, SphereFallingDown).",
    environment: "no tools; one response per video.",
    gradedBy:
      "exact match against ground truth set by majority vote of human plausibility ratings; accuracy.",
    sources: [
      "https://arxiv.org/html/2506.09849v1",
      "https://huggingface.co/datasets/facebook/IntPhys2",
    ],
  },
  mindcube: {
    given:
      "2 to 4 photographs of the same scene taken from different viewpoints, plus a text question about the scene.",
    produces: "a choice from a fixed set of answers.",
    taskMix:
      "MindCube-Tiny is a subset of the 21,154-question MindCube set; three settings: Rotation (camera turning in place, inferring unseen parts of the surroundings), Around (moving around objects, answering from a new viewpoint), and Among (four orthogonal views of an arrangement with heavy occlusion); per-setting counts for the Tiny subset not published.",
    environment: "no tools; one response per question.",
    gradedBy: "exact match with the annotated answer; accuracy overall and per setting.",
    sources: ["https://arxiv.org/abs/2506.21458", "https://mind-cube.github.io/"],
  },
  mirrorcode: {
    given:
      "execute-only access to an existing command-line program, which can be run with any arguments, plus its documentation and example test inputs; no source code.",
    produces:
      "a from-scratch reimplementation in a named language (generally Go and Ada on the leaderboard) whose output matches the original.",
    taskMix:
      "leaderboard uses 15 medium and large programs in two languages each (30 tasks); the full set has 25 programs spanning Unix utilities, data serialization and query tools, bioinformatics, interpreters, static analysis, cryptography, and compression.",
    environment:
      "offline Docker sandbox with shell, text editor, a visible-test runner, and submit tool; many steps with context compaction, up to 10 billion tokens and 7 days per attempt.",
    gradedBy:
      "end-to-end tests comparing stdout and stderr exactly, about a third held out; solved only if 100% pass.",
    sources: ["https://epoch.ai/benchmarks/mirrorcode", "https://epoch.ai/blog/mirrorcode"],
  },
  mlcr_aa: {
    given:
      "one synthetic, fragmented medical record of about 25,000 to 64,000 tokens spanning up to hundreds of visits (e.g. orthopedic, physical therapy, imaging notes), plus a question that may have several parts.",
    produces:
      "a written answer, one paragraph per part unless the question sets a format, citing supporting evidence from the record.",
    taskMix:
      "60 private questions from the two hardest of six difficulty tiers (expert clinical synthesis and compound multi-part questions); example types include single-fact retrieval, chronology across documents, and clinical questions; per-category counts not published.",
    environment: "not published; one response per question, each run 3 times.",
    gradedBy:
      "a panel of three model judges against expert-annotated ground truth and the record; passes if a majority find it complete with no contradicted claim; pass rate.",
    sources: ["https://artificialanalysis.ai/evaluations/mlcr-aa"],
  },
  mysterymechanism: {
    given:
      "anonymous input variables with numeric bounds, two noisy input-output observations, and a budget of 2d+1 experiments for a d-input mechanism; no domain context.",
    produces: "one executable mathematical expression mapping the inputs to the output.",
    taskMix:
      "222 hidden mechanisms drawn from biological, physical, chemical, engineering, ecological, and abstract dynamical relationships; per-category counts not published.",
    environment:
      "persistent shell without internet; many steps in which the model chooses input points to measure, fits candidate functions, and submits once.",
    gradedBy:
      "the submitted expression is run on private, continuously sampled probe points; binary credit per task if normalized error falls below a noise-aware threshold, regardless of symbolic form; failures count as zero; accuracy.",
    sources: ["https://www.vals.ai/benchmarks/mysterymechanism"],
  },
  omniscience_accuracy: {
    given:
      "a short text question asking for a fact, sometimes with a required answer format (e.g. a JavaScript string literal).",
    produces: "a short answer, or a decision not to answer.",
    taskMix:
      "3,000 questions in v1.1, generated by an LLM question-generation agent from authoritative sources, across six domains: Business; Humanities and Social Sciences; Science, Engineering and Mathematics; Health; Law; Software Engineering; per-domain counts not published in text.",
    environment: "not published; one response per question.",
    gradedBy:
      "each answer is classed correct, partial, incorrect, or not attempted (grader method not published on the page); this score is accuracy, correct answers over all questions, with abstentions counted as not correct.",
    sources: ["https://artificialanalysis.ai/evaluations/omniscience"],
  },
  programbench: {
    given:
      "a compiled command-line program as an execute-only binary and a behavioral specification.",
    produces:
      "from-scratch source files plus a compile script whose built program reproduces the original's behavior.",
    taskMix: "200 public tasks, each a different command-line program; categories not published.",
    environment:
      "mini-SWE-agent with a bash tool in an offline sandbox; may run the binary and inspect provided files, but no internet, source lookup, binary wrapping, reused object files, decompilers, disassemblers, or tracing; up to 1,000 steps, 6 hours, 180-second action timeout.",
    gradedBy:
      "submission compiled once and run against hidden behavioral tests in fresh containers; headline is fully resolved (all hidden tests pass), also almost resolved (at least 95%) and raw pass rate.",
    sources: ["https://www.vals.ai/benchmarks/programbench"],
  },
  public_benefits_bench: {
    given:
      "a question about the US SNAP food-assistance program phrased as a chatbot user would type it (e.g. whether a one-time work bonus affects eligibility in Indiana); in some conditions, follow-up details from a simulated client.",
    produces: "a written answer or full conversation addressing the user's situation.",
    taskMix:
      "230-question test subset (of 459 covering all 50 states, Guam, and the Virgin Islands): 70 change reporting, 42 use of benefits, 39 recertification, 34 pre-application, 25 application/interview, 14 denial/termination, 6 overpayments/fraud.",
    environment:
      "four conditions: single turn without tools, with live web search, multi-turn with a model playing the client, and both; tools include web search and HTML page parsing.",
    gradedBy:
      "a model judge marks each of about seven expert-written rubric criteria per question pass or fail (2,931 in all); accuracy is criteria passed over total.",
    sources: ["https://www.vals.ai/benchmarks/public-benefits-bench"],
  },
  riemann_bench: {
    given:
      "a text statement of a research-level mathematics problem collected from mathematicians' research.",
    produces: "a single answer with a unique closed-form value.",
    taskMix:
      "25 private problems authored by mathematics professors, graduate students, and PhD-holding IMO medalists, each solved independently by two experts; subject areas not published.",
    environment:
      "run as an open-ended research agent with web search and coding tools, many steps; time limit originally 1 hour per problem, later unlimited; token limit none.",
    gradedBy:
      "programmatic verifiers check the final answer against the known solution; results estimated over repeated independent runs per problem (100 in the paper).",
    sources: [
      "https://arxiv.org/abs/2604.06802",
      "https://surgehq.ai/blog/riemann-bench-a-benchmark-for-moonshot-mathematics",
    ],
  },
  rsi_benchmark: {
    given:
      "one of four starting setups with a fixed budget: 100 MB of Wikipedia text; a baseline GPT training program with byte-level enwik9 splits; a model-judge harness that grades web-app submissions; or a 35B open-weight checkpoint with 27 sample finance questions.",
    produces:
      "one artifact: a lossless compressor and self-extracting archive, an edited training program, a modified judge harness, or a derived checkpoint with generation settings.",
    taskMix: "4 tasks: compression, language-model training, harness engineering, post-training.",
    environment:
      "off-the-shelf coding-agent harnesses running many steps for 12 to 30 hours; offline sandboxes with an H100 GPU for the first two, evaluation-service access only for the harness task, a two-node GPU cluster with internet for post-training.",
    gradedBy:
      "rerun on hidden data (bits per byte, judge agreement on 24 held-out apps, score on 126 held-out finance questions), scaled on a log scale from baseline 0 to reference 0.5 to theoretical best 1; mean of four.",
    sources: ["https://www.vals.ai/benchmarks/rsi_index"],
  },
  simpleqa_verified: {
    given:
      "a short factual question with no answer choices, followed by an instruction framing it as a guessing game with no penalty for wrong answers.",
    produces: "a short answer (a date, person, number, place, or other entity).",
    taskMix:
      "1,000 questions: politics 18%, science and technology 16%, art 15%, sports 12%, geography 11%, music 10%, history 5%, other 14%; answer types: other 25%, date 22%, person 20%, number 19%, place 15%.",
    environment: "tools not published; one response per question.",
    gradedBy:
      "a model judge using Google's grading prompt labels each answer correct, incorrect, or not attempted; score is share correct, with not attempted counted as incorrect.",
    sources: ["https://epoch.ai/benchmarks/simple-qa-verified", "https://arxiv.org/abs/2509.07968"],
  },
  spatialviz: {
    given:
      "a multimodal question with one or more programmatically generated images of 2D or 3D structures (paper patterns, cubes, block assemblies, arrows, mechanical systems) and answer options.",
    produces: "a single selected answer option.",
    taskMix:
      "1,180 question-answer pairs over 12 task types, 2-3 difficulty levels of 40-50 cases each: 2D rotation, 3D rotation, three-view projection, paper folding (predict unfolded hole pattern), cube unfolding (pick the 2D net), cube reconstruction, cross-section, cube counting, cube assembly, arrow moving, block moving, mechanical system.",
    environment: "no tools; one response per question.",
    gradedBy: "exact match of the chosen option against the generated answer key; accuracy.",
    sources: [
      "https://arxiv.org/pdf/2507.07610",
      "https://epoch.ai/benchmarks/spatialviz-bench",
      "https://alphaxiv.org/benchmarks/chinese-academy-of-sciences/spatialviz-bench",
    ],
  },
  sre_bench: {
    given:
      "compiled binaries with no source code (C, C++, Go, Rust; varied optimization, symbol stripping, static or dynamic linking, optional anti-analysis protection), plus auxiliary material in a workspace.",
    produces:
      "answers or artifacts for six scenario-specific tasks per binary that recover the program's behavior; exact output format not published.",
    taskMix:
      "262 instances built from 19 in-house programs (about 16,900 lines each), 1,572 tasks; domains are network protocols, file-format and compression recovery, games, malware, and firmware (6 instances).",
    environment: "shell-only loop with a reverse-engineering toolkit; many steps.",
    gradedBy:
      "deterministic grading server; per-task completion share and an instance counted fully solved only when all six tasks pass; unfinished instances score zero.",
    sources: ["https://www.vals.ai/benchmarks/srebench"],
  },
  sudo_l7: {
    given:
      'a short, open-ended engineering request (e.g. "Make this faster", "Can we safely cache this?") in a real repository, mostly private production codebases plus some open-source ones, in Python, TypeScript, JavaScript, Ruby and others; one is about 250,000 lines.',
    produces:
      "code changes, or an architectural analysis, rollout plan, or a recommendation not to make the change, with a report of the work.",
    taskMix:
      "60 tasks written by staff-level engineers across backend, frontend, security, reliability and architecture; examples: migrate API tokens to secure hashes, log failed webhook payloads and return HTTP 200 in a fintech handler, let users split donations in an app that already supports it.",
    environment:
      "tools and setting not published; work spans exploring, implementing and verifying over many steps.",
    gradedBy:
      "expert-written task-specific rubrics over eight dimensions (including functional correctness, verification, truthful reporting, communication), scored by grader models using unit tests and static analysis as evidence.",
    sources: ["https://surgehq.ai/benchmarks/sudo-l7", "https://surgehq.ai/blog/sudo-l7"],
  },
  superchem: {
    given:
      'a chemistry problem written by experts, in a multimodal version with images (e.g. structures, diagrams) or a text-only version, with answer options and plausible distractors; entities masked (e.g. "compound A").',
    produces: "a final multiple-choice answer, with its written solution.",
    taskMix:
      "500 problems across four domains: structure and properties, reaction and synthesis, principles and calculations, experimental design and analysis; per-domain counts not published here.",
    environment: "no tools; one response per problem.",
    gradedBy:
      "final-answer accuracy against the key; a secondary Reasoning Path Fidelity score compares the solution with an expert-authored solution path.",
    sources: [
      "https://arxiv.org/abs/2512.01274",
      "https://huggingface.co/datasets/ZehuaZhao/SUPERChem",
    ],
  },
  terminal_bench: {
    given:
      "a natural-language task instruction inside a containerized Linux environment with its files, data and installed software.",
    produces:
      "a final container state (files, built programs, configured services, outputs) that meets the instruction.",
    taskMix:
      "66 tasks, each built around a real deliverable: software 18 (databases, distributed systems, frontend performance, data engineering, algorithms), science 14 (biology, chemistry, physics, formal mathematics, robotics, linguistics, earth science), ML 11 (training runs, inference serving, GPU kernels, evaluation harnesses), operations 9 (logistics, finance, insurance claims, compliance, supply chain), hardware 5 (CAD modeling, RTL design), security 5 (cryptography, application security, forensics), media 4 (music theory, audio transcription, layout design); example tasks: wal-recovery-ordering, distributed-dedup, nextjs-performance, ks-solver-cpp, vf2-speedup-networkx, jax-speedrun-gpu, sglang-qwen-burst, gsea-proteomics, glycan-ms2-elucidation, freecad-impeller, cargo-flight-dispatch, interleaved-vigenere, music-harmony.",
    environment:
      "terminal in a Docker container run via the Harbor framework with calibrated time, CPU and memory; flat 8-hour agent timeout; many steps.",
    gradedBy:
      "task-specific verifier tests run on the final environment; pass or fail per task, resolution rate.",
    sources: [
      "https://epoch.ai/benchmarks/terminal-bench-4/review",
      "https://vals.ai/benchmarks/terminal-bench-4",
      "https://www.tbench.ai/news/terminal-bench-4-0",
    ],
  },
  terminal_bench_science: {
    given:
      "a task instruction drawn from real research, inside a containerized environment with data and files.",
    produces:
      "concrete artifacts such as analyses, simulations, proofs, code and data products left in the environment.",
    taskMix:
      "70 tasks: life sciences 19, physical sciences 17, mathematical sciences 17, engineering sciences 9, earth sciences 8; types include data analysis, statistical inference, simulation, optimization, theorem proving, image reconstruction, signal processing, inverse problems, sensor calibration, model fitting.",
    environment:
      "terminal in a container under the Harbor task format; many steps; timeouts not published.",
    gradedBy:
      "reproducible task-specific programmatic tests on the artifacts; three trials per task; resolution rate.",
    sources: [
      "https://www.tbench.ai/news/terminal-bench-science-0-1",
      "https://www.tbench.ai/science",
    ],
  },
  textquests: {
    given:
      "the running text transcript of one of 25 classic Infocom interactive fiction games, run through the Jericho/Frotz interpreter, with the full history kept; optionally the game's official hints.",
    produces: "a sequence of typed text commands (moves) in the game.",
    taskMix:
      "25 Infocom games, each run twice, with and without official hints; games can take humans over 30 hours and hundreds of actions.",
    environment:
      "no external tools; one interactive session of up to 500 steps, ending early if the game is completed.",
    gradedBy:
      "game progress from labeled checkpoints for objectives needed to finish each game, averaged across games; a separate count of in-game actions labeled harmful.",
    sources: [
      "https://arxiv.org/abs/2507.23701v3",
      "https://huggingface.co/blog/textquests",
      "https://epoch.ai/benchmarks/textquests/review",
    ],
  },
  vending_bench_2: {
    given:
      "a system prompt casting the model as operator of a simulated San Francisco vending machine with a $500 starting balance and a $2 daily location fee.",
    produces:
      "a stream of tool calls (searches, supplier emails, orders, payments, restocking, price changes) over one simulated year; the final bank balance.",
    taskMix:
      "one long scenario: find suppliers online, negotiate by email, including adversarial suppliers with inflated quotes or bait-and-switch, handle delayed deliveries, supplier closures and refund demands, set prices against demand varying with weekday, season and weather.",
    environment:
      "simulated web search, email inbox, payment system and storage-to-machine tools; about 69,000-token context with trimming; roughly 3,000-6,000 messages per run.",
    gradedBy:
      "final bank account balance after one year (unrealized value excluded), averaged across runs; early termination after 10+ days of unpaid fees.",
    sources: ["https://andonlabs.com/evals/vending-bench-2"],
  },
  vibe_code: {
    given:
      "a natural-language specification of a web application (e.g. a short-form messaging site with sign-up, posting, following, likes, comments, search, explore page).",
    produces: "a complete working web application built from scratch.",
    taskMix: "multiple application specs; number of tasks and categories not published.",
    environment:
      "full development environment with over thirty tools, including file editing, bash, a browser for the running app, SQL execution, Supabase state, and web search; many steps.",
    gradedBy:
      "an evaluator agent runs multi-step point-and-click browser tests against the running app, checking each step; pass rate per test.",
    sources: ["https://www.vals.ai/benchmarks/vibe-code"],
  },
  voxelbench: {
    given: "a natural-language text prompt describing a scene or object to build.",
    produces:
      "a voxel structure as raw JSON block coordinates, without images, 3D tools or post-processing.",
    taskMix:
      "open-ended build prompts such as objects, buildings or scenes; the prompt set, its size and its composition are not published; a separate image-prompt variant uses image references.",
    environment: "no tools; one response per prompt.",
    gradedBy:
      "blind pairwise human preference votes between two anonymous builds of the same prompt, aggregated into ratings (Glicko-2 per mirror; also described as Elo); models listed after at least 50 votes.",
    sources: [
      "https://voxelbench.ai/",
      "https://benchlm.ai/benchmarks/voxelbench",
      "https://startupfortune.com/gpt-55-topped-a-minecraft-building-benchmark-and-the-spatial-reasoning-implications-go-far-beyond-gaming/",
    ],
  },
  weirdml: {
    given:
      "an unfamiliar dataset for a hand-made task with limited data, an unspecified goal and very limited feedback; each task has a hinted and a hintless twin.",
    produces:
      "data analysis and machine learning pipelines and their results; exact submission format for v3 not published.",
    taskMix:
      "11 hand-made machine learning and data analysis tasks, one named Ship Detect; other names and per-task descriptions not published on the main page.",
    environment:
      "run with coding agent harnesses over many steps against a token budget of 500k to 50M tokens; sandbox and GPU details for v3 not published.",
    gradedBy:
      "per-task score from hidden evaluation, combined as 80% normalized area under the best-so-far curve on a log token axis plus 20% final value, with normalization and hint penalties; tasks weighted equally.",
    sources: [
      "https://htihle.github.io/weirdml.html",
      "https://epoch.ai/benchmarks/weirdml-v3",
      "https://www.datalearner.com/benchmarks/weirdml-v3",
    ],
  },
};
