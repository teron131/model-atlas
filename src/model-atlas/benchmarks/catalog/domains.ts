/** The benchmark domains and each task benchmark's share of them, in percent summing to 100, so a view can group or weigh benchmarks by what they test; composite indexes have none, since they mix every domain. The shares were assigned by a decision model and are not yet reviewed by hand. */

import type { INDEX_BENCHMARK_KEYS } from "../index-policy";
import type { BenchmarkKey } from "./portfolio";

export const BENCHMARK_DOMAINS = [
  { key: "coding", name: "Coding" },
  { key: "documents", name: "Documents" },
  { key: "writing", name: "Writing" },
  { key: "design", name: "Design" },
  { key: "vision", name: "Vision" },
  { key: "tool_use", name: "Tool Use" },
  { key: "research", name: "Research" },
  { key: "games", name: "Games" },
  { key: "puzzles", name: "Puzzles" },
  { key: "math", name: "Math" },
  { key: "science", name: "Science" },
  { key: "finance", name: "Finance" },
  { key: "healthcare", name: "Healthcare" },
  { key: "legal", name: "Legal" },
  { key: "knowledge", name: "Knowledge" },
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
