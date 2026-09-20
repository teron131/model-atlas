/** Document registry, headings, and local link rules for the methodology surface. */

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
  "reference-balance.svg": { directory: "methodology", width: 760, height: 347 },
  "index-coverage-taper.svg": { directory: "methodology", width: 760, height: 360 },
  "resource-publication-gate.svg": { directory: "methodology", width: 760, height: 275 },
  "resource-tier-shrinkage.svg": { directory: "methodology", width: 760, height: 300 },
  "common-variant-basket.svg": { directory: "methodology", width: 760, height: 260 },
  "matching-boundary.svg": { directory: "matching", width: 760, height: 351 },
  "matching-relative-cutoff.svg": { directory: "matching", width: 760, height: 578 },
  "agentic-token-modifier.svg": { directory: "methodology", width: 760, height: 428 },
  "confidence.svg": { directory: "methodology", width: 760, height: 360 },
  "resource-coverage.svg": { directory: "methodology", width: 760, height: 432 },
  "logit-quality.svg": { directory: "shared", width: 760, height: 505 },
  "imputation-overview.svg": { directory: "methodology", width: 760, height: 270 },
  "quantile-imputation.svg": { directory: "methodology", width: 760, height: 458 },
  "weighted-quantile-rank.svg": { directory: "methodology", width: 760, height: 175 },
  "weighted-quantile.svg": { directory: "methodology", width: 760, height: 172 },
  "effort-imputation.svg": { directory: "methodology", width: 760, height: 340 },
  "effective-benchmark-count.svg": { directory: "methodology", width: 760, height: 390 },
  "resource-residual.svg": { directory: "methodology", width: 760, height: 538 },
  "comparison-support.svg": { directory: "methodology", width: 760, height: 690 },
  "resource-score-mapping.svg": { directory: "methodology", width: 760, height: 433 },
  "source-crosswalk.svg": { directory: "methodology", width: 1040, height: 513 },
  "source-fusion-divergence.svg": { directory: "methodology", width: 760, height: 325 },
  "timeline-benchmark-links.svg": { directory: "timeline", width: 760, height: 285 },
  "timeline-evidence-blend.svg": { directory: "timeline", width: 760, height: 360 },
  "timeline-anchors.svg": { directory: "timeline", width: 760, height: 450 },
  "timeline-reference-extension.svg": { directory: "timeline", width: 760, height: 365 },
  "timeline-standard-scores.svg": { directory: "timeline", width: 760, height: 435 },
  "timeline-validation.svg": { directory: "timeline", width: 760, height: 375 },
  "timeline-saved-conversion.svg": { directory: "timeline", width: 760, height: 435 },
  "timeline-successor.svg": { directory: "timeline", width: 760, height: 330 },
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
  return label
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
