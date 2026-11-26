"use client";

/** Share bars that answer the pointer: pointing a share's segment or its legend entry lights the pair and dims the rest, so a thin segment is told apart without matching colours. It is a client module apart from DomainShares because server-rendered documentation calls that module's helpers directly. */

import { useState } from "react";

import type { BenchmarkDomain } from "../../src/model-atlas/benchmarks/catalog";
import { DomainChip, type DomainShare } from "./DomainShares";

/** Props that make one share's segment and legend entry a pointing pair: while any share is pointed, its own carry `data-state="lit"` and every other's `"dim"`. */
export function usePointedShare<Share extends string>() {
  const [pointed, setPointed] = useState<Share | null>(null);
  return (share: Share) => ({
    "data-state": pointed == null ? undefined : share === pointed ? "lit" : "dim",
    onMouseEnter: () => setPointed(share),
    onMouseLeave: () => setPointed(null),
  });
}

/** A benchmark's domain shares as one bar of their colours, heaviest first, each then named with its icon and percent as the map's legend names a block. */
export function DomainShareBar({ domains }: { domains: readonly DomainShare[] }) {
  const pointable = usePointedShare<BenchmarkDomain>();
  return (
    <div className="domain-shares">
      <div className="benchmark-tooltip-bar" aria-hidden>
        {domains.map(({ domain, share }) => (
          <span
            key={domain}
            style={{ flexGrow: share, background: `var(--domain-tone-${domain})` }}
            {...pointable(domain)}
          />
        ))}
      </div>
      <ul className="column-weights-legend">
        {domains.map(({ domain, name, share }) => (
          <li key={domain} data-domain={domain} {...pointable(domain)}>
            <DomainChip domain={domain} />
            <span>{name}</span>
            <span>{share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
