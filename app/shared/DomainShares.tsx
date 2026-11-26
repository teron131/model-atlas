/** A benchmark's domains as the dashboard and the documentation mark them: each domain's icon on a tile of its colour, and a benchmark's shares heaviest first. It uses no hooks, so server-rendered documentation calls it directly; the share bar, which answers the pointer, lives in ShareBar. */

import {
  BookOpen,
  CodeXml,
  Eye,
  Feather,
  FileText,
  FlaskConical,
  Gamepad2,
  Landmark,
  type LucideIcon,
  PenTool,
  Puzzle,
  Scale,
  Sigma,
  Stethoscope,
  Telescope,
  Wrench,
} from "lucide-react";
import type { CSSProperties } from "react";

// The domains file is read directly: the catalog's entry also carries every benchmark's presentation and sources, which the documentation pages' browser bundle would otherwise ship.
import {
  BENCHMARK_DOMAINS,
  type BenchmarkDomain,
  benchmarkDomainShares,
} from "../../src/model-atlas/benchmarks/catalog/domains";

/** One domain's part of a benchmark, in percent of the benchmark; a benchmark's shares sum to 100. */
export type DomainShare = { domain: BenchmarkDomain; name: string; share: number };

export const domainIcons: Readonly<Record<BenchmarkDomain, LucideIcon>> = {
  coding: CodeXml,
  documents: FileText,
  writing: Feather,
  design: PenTool,
  vision: Eye,
  tool_use: Wrench,
  research: Telescope,
  games: Gamepad2,
  puzzles: Puzzle,
  math: Sigma,
  science: FlaskConical,
  finance: Landmark,
  healthcare: Stethoscope,
  legal: Scale,
  knowledge: BookOpen,
};

export function isBenchmarkDomain(value: string): value is BenchmarkDomain {
  return BENCHMARK_DOMAINS.some(({ key }) => key === value);
}

/** A benchmark's domain shares heaviest first, a tie keeping the catalog's domain order, so the first is its primary domain; empty for an index, which mixes every domain. */
export function domainShares(key: string): DomainShare[] {
  const shares = benchmarkDomainShares(key) ?? {};
  return BENCHMARK_DOMAINS.flatMap(({ key: domain, name }) => {
    const share = shares[domain];
    return share == null ? [] : [{ domain, name, share }];
  }).sort((a, b) => b.share - a.share);
}

/** A label's icon on a small tile of its colour, as the legend marks a block and a card's title its label. */
export function DomainChip({ domain }: { domain: BenchmarkDomain }) {
  const Icon = domainIcons[domain];
  return (
    <span className="column-weights-chip" style={domainTone(domain)}>
      <Icon className="column-weights-icon" aria-hidden />
    </span>
  );
}

/** A tile's colours: its domain's, or the neutral input grey for a block that is not a domain. */
export function domainTone(domain: BenchmarkDomain | null): CSSProperties {
  return (
    domain == null
      ? { "--tile-tone": "var(--input-tone)", "--tile-ink": "var(--input-ink)" }
      : { "--tile-tone": `var(--domain-tone-${domain})`, "--tile-ink": "var(--domain-ink)" }
  ) as CSSProperties;
}
