/** The benchmark domains, each with the definition its shares were assigned against, and each task benchmark's share of them, in percent summing to 100, so a view can group or weigh benchmarks by what they test; composite indexes have none, since they mix every domain. The shares were assigned by a decision model and are not yet reviewed by hand. */

import type { INDEX_BENCHMARK_KEYS } from "../index-policy";
import type { BenchmarkKey } from "./portfolio";

export const BENCHMARK_DOMAINS = [
  {
    key: "coding",
    name: "Coding",
    definition:
      "Writing, fixing, porting, or reverse-engineering software, graded on whether the software works. Not a short script that is only a means to an answer graded on something else.",
  },
  {
    key: "documents",
    name: "Documents",
    definition:
      "Reading or producing office files such as PDFs, spreadsheets, and slides, where handling the file's content and structure is the task. Not plain text passages or web pages.",
  },
  {
    key: "writing",
    name: "Writing",
    definition:
      "Prose quality, style, and editing, where the text itself is what gets graded. Not notes, reports, or answers written along the way.",
  },
  {
    key: "design",
    name: "Design",
    definition:
      "Producing visual or interface designs, 3D scenes, or layouts, graded on how the result looks and works for a viewer. Not perceiving or reasoning about shapes, space, or images.",
  },
  {
    key: "vision",
    name: "Vision",
    definition:
      "Understanding images, charts, diagrams, or video given as input, including the spatial relations in them. Not producing visuals.",
  },
  {
    key: "tool_use",
    name: "Tool Use",
    definition:
      "Driving tools, browsers, terminals, or APIs across many steps as an agent, where choosing and ordering actions and recovering from errors decides the result. Not interaction that only submits answers or moves.",
  },
  {
    key: "research",
    name: "Research",
    definition:
      "Finding, reading, and combining information from many outside sources over many steps, such as web or literature research. Not reasoning over material already supplied with the task, and not running experiments.",
  },
  {
    key: "games",
    name: "Games",
    definition:
      "Playing games, from single positions to long sessions, or operating inside a simulated world or business whose state changes over many turns, graded on the outcome reached. Not ordinary workplace tasks done with files and tools.",
  },
  {
    key: "puzzles",
    name: "Puzzles",
    definition:
      "Abstract reasoning on novel puzzles and hidden patterns, where little outside knowledge helps. Not mathematics or science problems that rest on domain knowledge.",
  },
  {
    key: "math",
    name: "Math",
    definition:
      "Mathematical knowledge and problem solving, from calculation-heavy reasoning to proofs. Not the everyday arithmetic any task involves.",
  },
  {
    key: "science",
    name: "Science",
    definition:
      "Natural sciences such as physics, chemistry, and biology as the subject matter. Not general-knowledge questions that happen to include science, and not medicine.",
  },
  {
    key: "finance",
    name: "Finance",
    definition:
      "Finance, accounting, and economics as the subject matter, such as valuation, filings, and financial models.",
  },
  {
    key: "healthcare",
    name: "Healthcare",
    definition: "Medicine and patient care as the subject matter. Not biological research.",
  },
  {
    key: "legal",
    name: "Legal",
    definition: "Law, regulation, public policy, and contracts as the subject matter.",
  },
  {
    key: "knowledge",
    name: "Knowledge",
    definition:
      "Breadth across many subjects at once: factual recall, calibration, and expert questions drawn from many fields with no single field dominant. Not the background knowledge any expert task assumes, and not a benchmark set in one field.",
  },
] as const;

export type BenchmarkDomain = (typeof BENCHMARK_DOMAINS)[number]["key"];

type DomainShares = Partial<Record<BenchmarkDomain, number>>;

// Every task benchmark must carry shares, so a new benchmark fails the typecheck until it is labelled.
const BENCHMARK_DOMAIN_SHARES: Record<
  Exclude<BenchmarkKey, (typeof INDEX_BENCHMARK_KEYS)[number]>,
  DomainShares
> = {
  aa_3d: { design: 33, coding: 28, tool_use: 27, vision: 12 },
  agents_last_exam: { tool_use: 61, coding: 39 },
  ale_bench: { coding: 64, tool_use: 36 },
  analyst_agent: { documents: 28, tool_use: 24, coding: 23, math: 14, finance: 11 },
  apex_agents: { tool_use: 46, documents: 24, finance: 17, legal: 13 },
  apex_swe: { coding: 50, tool_use: 50 },
  arc_agi_2: { puzzles: 69, vision: 31 },
  arc_agi_3: { puzzles: 55, tool_use: 29, games: 16 },
  arena_agent: { tool_use: 86, research: 14 },
  arena_webdev: { coding: 52, design: 33, tool_use: 15 },
  automation_bench: { tool_use: 100 },
  biomysterybench: { science: 35, tool_use: 35, coding: 30 },
  blueprint_bench_2: { vision: 58, design: 42 },
  briefcase: { documents: 62, finance: 19, writing: 19 },
  chartography: { vision: 86, math: 14 },
  chess_puzzles: { games: 82, puzzles: 18 },
  code2video_aa: { coding: 50, design: 50 },
  code_migration: { coding: 74, tool_use: 26 },
  complex_constraints: { writing: 100 },
  critpt: { science: 45, math: 21, tool_use: 17, coding: 17 },
  dayjob_finance: { finance: 55, documents: 27, math: 18 },
  dayjob_healthcare: { healthcare: 80, documents: 20 },
  ebr_bench: { games: 70, tool_use: 30 },
  emb: { finance: 56, documents: 44 },
  enigmaeval: { puzzles: 73, vision: 27 },
  erqa: { vision: 100 },
  finance_agent: { tool_use: 29, finance: 27, research: 19, documents: 16, math: 9 },
  frontier_code: { coding: 64, tool_use: 36 },
  frontiermath_tier_4: { math: 100 },
  gdp_pdf: { documents: 69, vision: 31 },
  gdp_xlsx: { documents: 70, finance: 30 },
  gdpval_normalized: { documents: 59, tool_use: 26, design: 15 },
  handbook_md: { tool_use: 100 },
  hemingway_bench: { writing: 100 },
  hle: { knowledge: 56, math: 25, science: 19 },
  intphys2: { vision: 72, science: 28 },
  mindcube: { vision: 76, puzzles: 24 },
  mirrorcode: { coding: 70, tool_use: 30 },
  mlcr_aa: { healthcare: 100 },
  mysterymechanism: { math: 44, tool_use: 33, puzzles: 23 },
  omniscience_accuracy: { knowledge: 100 },
  programbench: { coding: 77, tool_use: 23 },
  public_benefits_bench: { research: 39, legal: 35, tool_use: 26 },
  riemann_bench: { math: 100 },
  rsi_benchmark: { coding: 42, tool_use: 38, research: 20 },
  simpleqa_verified: { knowledge: 100 },
  spatialviz: { vision: 100 },
  sre_bench: { coding: 67, tool_use: 33 },
  sudo_l7: { coding: 56, tool_use: 44 },
  superchem: { science: 65, vision: 21, math: 14 },
  terminal_bench: { tool_use: 63, coding: 37 },
  terminal_bench_science: { tool_use: 34, science: 28, coding: 28, math: 10 },
  textquests: { games: 61, tool_use: 39 },
  vending_bench_2: { games: 46, tool_use: 31, finance: 23 },
  vibe_code: { coding: 63, tool_use: 27, design: 10 },
  voxelbench: { design: 100 },
  weirdml: { coding: 44, tool_use: 37, puzzles: 19 },
};

/** A benchmark's domain shares; null for a composite index or a key outside the catalog. */
export function benchmarkDomainShares(key: string): DomainShares | null {
  return Object.hasOwn(BENCHMARK_DOMAIN_SHARES, key)
    ? BENCHMARK_DOMAIN_SHARES[key as keyof typeof BENCHMARK_DOMAIN_SHARES]
    : null;
}
