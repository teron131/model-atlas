/** Document registry, headings, and local link rules for the methodology surface. */

export const DOCUMENTS = [
  {
    slug: "standards",
    title: "Standards",
    description: "The evidence a benchmark needs to earn and keep a place in the portfolio.",
  },
  {
    slug: "benchmarks",
    title: "Benchmarks",
    description:
      "Which benchmarks contribute, what they measure, and why their weights and sources were chosen.",
  },
  {
    slug: "matching",
    title: "Matching",
    description:
      "How results from different sources are matched without confusing models or reasoning efforts.",
  },
  {
    slug: "methodology",
    title: "Methodology",
    description:
      "How benchmark results become scores, what missing evidence means, and why the method works this way.",
  },
  {
    slug: "timeline",
    title: "Timeline",
    description:
      "How Timeline uses the Intelligence Index to compare model generations through retained benchmarks and a fixed reference scale.",
  },
] as const;

export type DocumentSlug = (typeof DOCUMENTS)[number]["slug"];

export type TableOfContentsItem = {
  id: string;
  label: string;
  level: 2 | 3;
};

const METHODOLOGY_ASSETS = {
  "reference-balance.svg": { width: 760, height: 460 },
  "index-coverage-taper.svg": { width: 760, height: 360 },
  "resource-publication-gate.svg": { width: 760, height: 373 },
  "resource-tier-shrinkage.svg": { width: 760, height: 474 },
  "common-variant-basket.svg": { width: 760, height: 403 },
  "matching-boundary.svg": { width: 760, height: 411 },
  "matching-relative-cutoff.svg": { width: 760, height: 770 },
  "agentic-token-modifier.svg": { width: 760, height: 428 },
  "confidence.svg": { width: 760, height: 360 },
  "resource-coverage.svg": { width: 760, height: 432 },
  "logit-quality.svg": { width: 760, height: 505 },
  "imputation-overview.svg": { width: 760, height: 340 },
  "quantile-imputation.svg": { width: 760, height: 458 },
  "weighted-quantile-rank.svg": { width: 760, height: 260 },
  "weighted-quantile.svg": { width: 760, height: 320 },
  "resource-residual.svg": { width: 760, height: 538 },
  "resource-score-mapping.svg": { width: 760, height: 433 },
  "source-crosswalk.svg": { width: 1040, height: 585 },
  "source-fusion-divergence.svg": { width: 760, height: 470 },
  "timeline-benchmark-links.svg": { width: 760, height: 285 },
  "timeline-evidence-blend.svg": { width: 760, height: 360 },
  "timeline-anchors.svg": { width: 760, height: 450 },
  "timeline-reference-extension.svg": { width: 760, height: 365 },
  "timeline-standard-scores.svg": { width: 760, height: 435 },
  "timeline-validation.svg": { width: 760, height: 410 },
  "timeline-saved-conversion.svg": { width: 760, height: 435 },
  "timeline-successor.svg": { width: 760, height: 330 },
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
export function documentLink(href: string): string {
  if (href.startsWith("#")) {
    return href;
  }
  const match = /^([a-z-]+)\.md(#[a-z0-9-]+)?$/.exec(href);
  const slug = match?.[1];
  if (slug == null || !isDocumentSlug(slug)) {
    return href;
  }
  return `${documentHref(slug)}${match?.[2] ?? ""}`;
}

/** Map methodology diagram paths onto the static asset endpoint. */
export function documentImageSource(source: string): string {
  const match = /^assets\/methodology\/([a-z0-9-]+\.svg)$/.exec(source);
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
