/** The benchmark domains, each with the definition its shares are rated against, and each task benchmark's share of them, in percent summing to 100, so a view can group or weigh benchmarks by what they test; composite indexes have none, since they mix every domain. `pnpm domains:label` generates the shares, a decision model rating each domain against the benchmark's profile in `profiles.ts`; they are not yet reviewed by hand. */

import { BENCHMARK_DOMAIN_SHARES } from "./domain-shares.generated";

// Each definition names the nearby thing the label does not cover: without that boundary the rater attaches Design to spatial reasoning, Games to workplace tasks, and Knowledge to any expert task.
export const BENCHMARK_DOMAINS = [
  {
    key: "coding",
    name: "Coding",
    // Systems work counts as Coding, so building and operating infrastructure in a terminal is not read as Tool use; code written only to reach another subject's answer does not count, or Coding ties Science on scientific analysis tasks and attaches to math benchmarks that allow Python.
    definition:
      "Writing, fixing, porting, or reverse-engineering software, or building, configuring, and debugging the systems it runs on, graded on whether the result works. Not code that is only a means to an answer judged in another label's subject, such as a scientific analysis or a mathematical result.",
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
    // Not "Agent": the rater reads that as anything acting over many turns and rates it higher on games. The last sentence ranks a subject above the agent loop and interface it runs through: without it Tool use leads agent-run finance, science, and terminal benchmarks, while excluding the loop outright drops Tool use unevenly, from most agent-run coding benchmarks but not all.
    definition:
      "Driving tools, browsers, terminals, or APIs across many steps as an agent, where choosing and ordering actions and recovering from errors decides the result. Not interaction that only submits answers or moves. When the tasks belong to another label's subject, such as code, science, or finance, that label is the main measure and Tool use ranks below it, whatever interface, such as a terminal or browser, the work is done in.",
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
    // Not "Reasoning": under that broader name the rater puts it on almost half the benchmarks, since every task involves reasoning.
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
    // Answering from memory, or Knowledge attaches to document and chart benchmarks whose tasks span many professional fields.
    definition:
      "Answering from memory across many subjects at once: factual recall, calibration, and expert questions drawn from many fields with no single field dominant. Not work spread over several professional fields whose answers come from supplied files, images, or data, not the background knowledge any expert task assumes, and not a benchmark set in one field.",
  },
] as const;

export type BenchmarkDomain = (typeof BENCHMARK_DOMAINS)[number]["key"];

export type DomainShares = Partial<Record<BenchmarkDomain, number>>;

/** A benchmark's domain shares; null for a composite index or a key outside the catalog. */
export function benchmarkDomainShares(key: string): DomainShares | null {
  return Object.hasOwn(BENCHMARK_DOMAIN_SHARES, key)
    ? BENCHMARK_DOMAIN_SHARES[key as keyof typeof BENCHMARK_DOMAIN_SHARES]
    : null;
}
