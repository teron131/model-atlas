/** Document registry, headings, and local link rules for the methodology surface. */

import { plainScoreText } from "./score-markers";

export const DOCUMENTS = [
  {
    slug: "methodology",
    source: "methodology/overview.md",
    title: "Methodology",
    description: "What the four scores mean and where to find the detailed method.",
    parent: null,
  },
  {
    slug: "intelligence-agentic",
    source: "methodology/intelligence-agentic.md",
    title: "Intelligence and Agentic",
    description: "Benchmark weights, token efficiency, evidence support, and aggregate indexes.",
    parent: "methodology",
  },
  {
    slug: "imputation",
    source: "methodology/imputation.md",
    title: "Missing Data and Imputation",
    description: "How missing quality and resource measurements are estimated and validated.",
    parent: "methodology",
  },
  {
    slug: "speed-value",
    source: "methodology/speed-value.md",
    title: "Speed and Value",
    description: "Prices, serving speed, peer comparisons, and resource efficiency.",
    parent: "methodology",
  },
  {
    slug: "leaderboard-rules",
    source: "methodology/leaderboard-rules.md",
    title: "Leaderboard Rules",
    description: "Model inclusion, score availability, highlights, and comparison graphs.",
    parent: "methodology",
  },
  {
    slug: "standards",
    source: "standards.md",
    title: "Standards",
    description: "The evidence a benchmark needs to earn and keep a place in the portfolio.",
    parent: null,
  },
  {
    slug: "benchmarks",
    source: "benchmarks.md",
    title: "Benchmarks",
    description: "Which benchmarks contribute, what they measure, and how they are weighted.",
    parent: null,
  },
  {
    slug: "matching",
    source: "matching.md",
    title: "Matching",
    description: "How source results are matched to the correct model and reasoning effort.",
    parent: null,
  },
  {
    slug: "timeline",
    source: "timeline/overview.md",
    title: "Timeline",
    description:
      "How the Intelligence Index connects benchmark generations for historical comparison.",
    parent: null,
  },
  {
    slug: "timeline/calculation",
    source: "timeline/calculation.md",
    title: "Timeline Calculation",
    description: "Reference scales, benchmark connections, evidence weighting, and index anchors.",
    parent: "timeline",
  },
] as const;

export type DocumentSlug = (typeof DOCUMENTS)[number]["slug"];

export type TableOfContentsItem = {
  id: string;
  label: string;
  level: 2 | 3;
};

const METHODOLOGY_ASSETS = {
  "linear-mapping.svg": { directory: "methodology", width: 760, height: 340 },
  "reference-balance.svg": { directory: "methodology", width: 760, height: 310 },
  "graph-laplacian.svg": { directory: "methodology", width: 760, height: 340 },
  "laplacian-link.svg": { directory: "methodology", width: 760, height: 268 },
  "fitted-ordering-mapping.svg": { directory: "methodology", width: 760, height: 330 },
  "resource-publication-gate.svg": { directory: "methodology", width: 760, height: 244 },
  "resource-tier-shrinkage.svg": { directory: "methodology", width: 760, height: 350 },
  "common-variant-basket.svg": { directory: "methodology", width: 760, height: 290 },
  "pareto-highlights.svg": { directory: "methodology", width: 760, height: 470 },
  "matching-boundary.svg": { directory: "matching", width: 760, height: 360 },
  "matching-relative-cutoff.svg": { directory: "matching", width: 760, height: 460 },
  "agentic-token-modifier.svg": { directory: "methodology", width: 760, height: 384 },
  "token-rescale.svg": { directory: "methodology", width: 760, height: 280 },
  "normal-mad.svg": { directory: "methodology", width: 760, height: 380 },
  "weighted-mad.svg": { directory: "methodology", width: 760, height: 516 },
  "confidence.svg": { directory: "methodology", width: 760, height: 350 },
  "index-overlap.svg": { directory: "methodology", width: 760, height: 238 },
  "resource-coverage.svg": { directory: "methodology", width: 760, height: 400 },
  "resource-agreement.svg": { directory: "methodology", width: 760, height: 430 },
  "imputation-overview.svg": { directory: "methodology", width: 760, height: 306 },
  "quantile-imputation.svg": { directory: "methodology", width: 760, height: 360 },
  "weighted-quantile-rank.svg": { directory: "methodology", width: 760, height: 244 },
  "weighted-quantile.svg": { directory: "methodology", width: 760, height: 210 },
  "effort-imputation.svg": { directory: "methodology", width: 760, height: 350 },
  "resource-effort-ratio.svg": { directory: "methodology", width: 760, height: 330 },
  "effective-benchmark-count.svg": { directory: "methodology", width: 760, height: 370 },
  "resource-residual.svg": { directory: "methodology", width: 760, height: 520 },
  "comparison-support.svg": { directory: "methodology", width: 760, height: 500 },
  "resource-score-mapping.svg": { directory: "methodology", width: 760, height: 370 },
  "source-crosswalk.svg": { directory: "methodology", width: 760, height: 556 },
  "source-fusion-divergence.svg": { directory: "methodology", width: 760, height: 350 },
  "timeline-benchmark-links.svg": { directory: "timeline", width: 760, height: 294 },
  "timeline-anchors.svg": { directory: "timeline", width: 760, height: 440 },
  "timeline-reference-extension.svg": { directory: "timeline", width: 760, height: 380 },
  "timeline-standard-scores.svg": { directory: "timeline", width: 760, height: 450 },
  "timeline-validation.svg": { directory: "timeline", width: 760, height: 380 },
  "timeline-saved-conversion.svg": { directory: "timeline", width: 760, height: 400 },
  "timeline-successor.svg": { directory: "timeline", width: 760, height: 320 },
} as const;

type MethodologyAsset = keyof typeof METHODOLOGY_ASSETS;

export const METHODOLOGY_ASSET_NAMES = Object.keys(METHODOLOGY_ASSETS) as MethodologyAsset[];

export function isDocumentSlug(value: string): value is DocumentSlug {
  return DOCUMENTS.some((document) => document.slug === value);
}

export function isMethodologyAsset(value: string): value is MethodologyAsset {
  return Object.hasOwn(METHODOLOGY_ASSETS, value);
}

export function documentHref(slug: DocumentSlug): string {
  return slug === "methodology" ? "/methodology" : `/methodology/${slug}`;
}

/** Carry source-controlled score annotations into navigation without replacing intentionally shortened registry titles. */
export function documentTitle(markdown: string, fallback: string): string {
  const title = /^# (.+)$/m.exec(markdown)?.[1];
  return title != null && plainScoreText(title) === fallback ? title : fallback;
}

/** Extract the two heading levels used by the sticky on-page outline. */
export function tableOfContents(markdown: string): TableOfContentsItem[] {
  return markdown.split("\n").flatMap((line): TableOfContentsItem[] => {
    const match = /^(##|###) (.+)$/.exec(line);
    if (match == null) {
      return [];
    }
    const heading = match[2];
    if (heading == null) {
      return [];
    }
    const label = heading.replaceAll(/[`*_]/g, "").trim();
    return [
      {
        id: headingId(label),
        label,
        level: match[1] === "##" ? 2 : 3,
      },
    ];
  });
}

export function headingId(label: string): string {
  return plainScoreText(label)
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-");
}

/** Map repository-relative Markdown links onto public document routes. */
export function documentLink(href: string, document: DocumentSlug): string {
  if (href.startsWith("#")) {
    return href;
  }
  const current = DOCUMENTS.find((item) => item.slug === document)!;
  const resolved = new URL(href, `https://docs.local/${current.source}`);
  const target = DOCUMENTS.find((item) => `/${item.source}` === resolved.pathname);
  if (resolved.origin !== "https://docs.local" || target == null) {
    return href;
  }
  return `${documentHref(target.slug)}${resolved.search}${resolved.hash}`;
}

/** Resolve registered artwork to its documentation-owned subject directory. */
export function documentAssetPath(asset: MethodologyAsset): string {
  return `assets/${METHODOLOGY_ASSETS[asset].directory}/${asset}`;
}

/** Map methodology diagram paths onto the static asset endpoint. */
export function documentImageSource(source: string): string {
  const match =
    /^(?:\.\.\/)?assets\/(?:methodology|matching|timeline|shared)\/([a-z0-9-]+\.svg)$/.exec(source);
  const asset = match?.[1];
  return asset != null && isMethodologyAsset(asset) ? `/methodology-assets/${asset}` : source;
}

export function documentImageSize(source: string): {
  width: number;
  height: number;
} {
  const asset = source.split("/").at(-1);
  return asset != null && isMethodologyAsset(asset)
    ? METHODOLOGY_ASSETS[asset]
    : { width: 720, height: 420 };
}
