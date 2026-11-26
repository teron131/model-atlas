/** The Markdown conventions the methodology pages fill from the benchmark catalog: `:version[benchmark_key]` markers and the Domain and Domain Shares table columns. Server rendering and the docs test read it; client components must not import it, since it brings the whole catalog with it. */

import { BENCHMARK_DOMAINS, type BenchmarkDomain } from "../../src/model-atlas/benchmarks/catalog";
import { BENCHMARK_CATALOG } from "../../src/model-atlas/benchmarks/registry";
import type { DomainShare } from "../shared/DomainShares";

const VERSION_MARKER = /:version\[([a-z0-9_]+)\]/g;

/** Catalog versions stand in wherever the served snapshot has not published a benchmark's version. */
export const CATALOG_VERSIONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BENCHMARK_CATALOG).flatMap(([key, { version }]) =>
    version == null ? [] : [[key, version]],
  ),
);

/**
 * Replace each `:version[benchmark_key]` marker with that benchmark's current version; an unresolvable marker is an authoring error.
 * A served version comes from the benchmark's own source, so it goes in as literal text: whitespace runs become one space and every ASCII punctuation mark is backslash-escaped, which Markdown prints as the mark itself instead of reading it as link, image, table, heading, or HTML syntax, though GFM still auto-links a bare URL: `2.1 [x](//e.io)` → `2\.1 \[x\]\(\/\/e\.io\)`.
 */
export function fillVersionMarkers(
  markdown: string,
  versions: Readonly<Record<string, string>>,
): string {
  return markdown.replace(VERSION_MARKER, (_marker, key: string) => {
    const version = versions[key];
    if (version == null) throw new Error(`No version for documentation marker :version[${key}]`);
    return version.replace(/\s+/g, " ").replace(/[!-/:-@[-`{-~]/g, "\\$&");
  });
}

/** Table columns the renderer draws from the benchmark catalog: a Domain cell names one domain, and a Domain Shares cell lists a benchmark's shares. */
export const DOMAIN_COLUMNS = { domain: "Domain", shares: "Domain Shares" } as const;

/** The catalog domain a Domain cell names by its display name, such as "Tool Use"; any other name is an authoring error. */
export function namedDomain(name: string): BenchmarkDomain {
  const domain = BENCHMARK_DOMAINS.find((entry) => entry.name === name);
  if (domain == null)
    throw new Error(`No domain named "${name}" in a ${DOMAIN_COLUMNS.domain} column`);
  return domain.key;
}

/** The shares a Domain Shares cell lists in the order written, each a domain name and a whole percent joined by commas: "Coding 80%, Tool Use 20%" → Coding 80, Tool Use 20; a cell in any other form is an authoring error. */
export function domainShareList(text: string): DomainShare[] {
  return text.split(", ").map((entry) => {
    const [, name, share] = /^(.+) (\d+)%$/.exec(entry.trim()) ?? [];
    if (name == null || share == null)
      throw new Error(
        `"${entry}" in a ${DOMAIN_COLUMNS.shares} column is not a domain and a percent`,
      );
    return { domain: namedDomain(name), name, share: Number(share) };
  });
}
